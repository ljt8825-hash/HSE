<template>
  <div class="p-4">
    <a-card>
      <template #title>扣分审核</template>

      <a-row :gutter="16" class="mb-4">
        <a-col :span="6">
          <a-select
            v-model:value="selectedCycleId"
            placeholder="请选择考核周期"
            style="width: 100%"
            :loading="cycleLoading"
            @change="handleCycleChange"
          >
            <Select.Option v-for="cycle in cycleList" :key="cycle.id" :value="cycle.id">
              {{ cycle.cycleName }}
            </Select.Option>
          </a-select>
        </a-col>
      </a-row>

      <a-space class="mb-4" wrap>
        <a-select
          v-model:value="filterStatus"
          placeholder="审核状态"
          style="width: 140px"
          allow-clear
          @change="loadData"
        >
          <Select.Option value="pending">待审核</Select.Option>
          <Select.Option value="approved">已通过</Select.Option>
          <Select.Option value="adjusted">已调整（锁定）</Select.Option>
          <Select.Option value="rejected">已驳回</Select.Option>
        </a-select>
        <a-select
          v-model:value="filterType"
          placeholder="扣分类型"
          style="width: 160px"
          allow-clear
          @change="loadData"
        >
          <Select.Option value="violation">违章扣分</Select.Option>
          <Select.Option value="accident">事故扣分</Select.Option>
          <Select.Option value="inspection">检查扣分</Select.Option>
          <Select.Option value="training">培训扣分</Select.Option>
        </a-select>
        <a-input-search
          v-model:value="keyword"
          placeholder="搜索扣分项"
          style="width: 240px"
          allow-clear
          @search="loadData"
        />
        <a-button @click="loadData">
          <template #icon><reload-outlined /></template>
          刷新
        </a-button>
        <a-button
          v-if="filterStatus === 'pending'"
          type="primary"
          :disabled="selectedRowKeys.length === 0"
          @click="handleBatchApprove"
        >
          <template #icon><check-circle-outlined /></template>
          批量通过
        </a-button>
      </a-space>

      <a-table
        :columns="columns"
        :data-source="dataSource"
        :loading="loading"
        :pagination="pagination"
        v-model:selected-row-keys="selectedRowKeys"
        :row-selection="rowSelection"
        :scroll="{ x: 1200 }"
        @change="handleTableChange"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'review_status'">
            <a-tag :color="getReviewStatusColor(record.reviewStatus)">
              {{ getReviewStatusText(record.reviewStatus) }}
            </a-tag>
          </template>
          <template v-else-if="column.key === 'deduction_type'">
            <a-tag color="blue">{{ getDeductionTypeText(record.deductionType) }}</a-tag>
          </template>
          <template v-else-if="column.key === 'suggested_score'">
            <span class="text-red-500 font-semibold">-{{ record.suggestedScore }}</span>
          </template>
          <template v-else-if="column.key === 'confirmed_score'">
            <span v-if="record.confirmedScore !== null" class="text-red-500 font-semibold">
              -{{ record.confirmedScore }}
            </span>
            <span v-else class="text-gray-400">-</span>
          </template>
          <template v-else-if="column.key === 'effective_score'">
            <span v-if="record.reviewStatus === 'rejected'" class="text-gray-400">0</span>
            <span v-else class="text-red-500 font-semibold">-{{ effectiveScore(record) }}</span>
          </template>
          <template v-else-if="column.key === 'summary'">
            <a-tooltip :title="record.sourceDetail?.summary || '-'">
              <span class="text-gray-600">{{ record.sourceDetail?.summary || '-' }}</span>
            </a-tooltip>
          </template>
          <template v-else-if="column.key === 'action'">
            <a-space>
              <a-button
                v-if="record.reviewStatus === 'pending'"
                type="link"
                size="small"
                @click="showReviewModal(record, 'approve')"
              >
                通过
              </a-button>
              <a-button
                v-if="record.reviewStatus === 'pending'"
                type="link"
                size="small"
                danger
                @click="showReviewModal(record, 'reject')"
              >
                驳回
              </a-button>
              <a-button
                v-if="canUnlock(record)"
                type="link"
                size="small"
                @click="showUnlockModal(record)"
              >
                恢复自动
              </a-button>
              <a-button type="link" size="small" @click="showDetail(record)">
                详情
              </a-button>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <a-modal
      v-model:open="reviewModalOpen"
      :title="reviewModalTitle"
      :ok-text="reviewModalType === 'approve' ? '通过' : '驳回'"
      :ok-type="reviewModalType === 'approve' ? 'primary' : 'danger'"
      @ok="handleReview"
      :confirm-loading="reviewing"
    >
      <a-form :model="reviewForm" layout="vertical">
        <a-form-item label="扣分项">
          <span>{{ currentRecord?.deductionItem }}</span>
        </a-form-item>
        <a-form-item label="建议分值">
          <span class="text-red-500 font-semibold">-{{ currentRecord?.suggestedScore }}</span>
        </a-form-item>
        <a-form-item v-if="reviewModalType === 'approve'" label="确认分值">
          <a-input-number
            v-model:value="reviewForm.confirmed_score"
            :min="0"
            :max="100"
            style="width: 100%"
          />
        </a-form-item>
        <a-form-item :label="reviewModalType === 'approve' ? '审核意见' : '驳回原因'" required>
          <a-textarea
            v-model:value="reviewForm.comment"
            :rows="4"
            :placeholder="reviewModalType === 'approve' ? '请输入审核意见（选填）' : '请输入驳回原因'"
          />
        </a-form-item>
      </a-form>
    </a-modal>

    <a-modal v-model:open="detailModalOpen" title="扣分明细" width="600px" :footer="null">
      <a-descriptions :column="1" bordered size="small" v-if="currentRecord">
        <a-descriptions-item label="扣分项">
          {{ currentRecord.deductionItem }}
        </a-descriptions-item>
        <a-descriptions-item label="扣分类型">
          <a-tag color="blue">{{ getDeductionTypeText(currentRecord.deductionType) }}</a-tag>
        </a-descriptions-item>
        <a-descriptions-item label="规则编码">
          {{ currentRecord.ruleCode }}
        </a-descriptions-item>
        <a-descriptions-item label="建议分值">
          <span class="text-red-500 font-semibold">-{{ currentRecord.suggestedScore }}</span>
        </a-descriptions-item>
        <a-descriptions-item label="确认分值">
          <span v-if="currentRecord.confirmedScore !== null" class="text-red-500 font-semibold">
            -{{ currentRecord.confirmedScore }}
          </span>
          <span v-else class="text-gray-400">-</span>
        </a-descriptions-item>
        <a-descriptions-item label="审核状态">
          <a-tag :color="getReviewStatusColor(currentRecord.reviewStatus)">
            {{ getReviewStatusText(currentRecord.reviewStatus) }}
          </a-tag>
        </a-descriptions-item>
        <a-descriptions-item label="证据材料">
          <span v-if="currentRecord.evidence">{{ currentRecord.evidence }}</span>
          <span v-else class="text-gray-400">无</span>
        </a-descriptions-item>
        <a-descriptions-item label="备注">
          <span v-if="currentRecord.remark">{{ currentRecord.remark }}</span>
          <span v-else class="text-gray-400">无</span>
        </a-descriptions-item>
        <a-descriptions-item label="创建时间">
          {{ formatDate(currentRecord.createdAt) }}
        </a-descriptions-item>
      </a-descriptions>
    </a-modal>

    <a-modal
      v-model:open="unlockModalOpen"
      title="恢复自动计算"
      :confirm-loading="unlocking"
      @ok="handleUnlock"
    >
      <p class="mb-2">
        将解除人工锁定，恢复为系统自动计算的分值。
      </p>
      <p v-if="unlockRecord" class="text-gray-600">
        扣分项：{{ unlockRecord.deductionItem }}
      </p>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import {
  ReloadOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons-vue';
import { message, Select } from 'ant-design-vue';
import {
  getAssessmentCycleList,
  getDeductionList,
  reviewDeduction,
  rejectDeduction,
  unlockDeduction,
  batchApproveDeductions,
} from '#/api/hse/assessment-monthly';
import type { AssessmentMonthlyApi } from '#/api/hse/assessment-monthly';

type DeductionItem = AssessmentMonthlyApi.DeductionItem;
type AssessmentCycle = AssessmentMonthlyApi.AssessmentCycle;

const loading = ref(false);
const cycleLoading = ref(false);
const reviewing = ref(false);
const keyword = ref('');
const filterStatus = ref<string | undefined>('pending');
const filterType = ref<string | undefined>();
const selectedCycleId = ref<number | string | undefined>();
const cycleList = ref<AssessmentCycle[]>([]);
const dataSource = ref<DeductionItem[]>([]);
const selectedRowKeys = ref<(string | number)[]>([]);

const pagination = reactive({
  current: 1,
  pageSize: 20,
  total: 0,
  showSizeChanger: true,
  showTotal: (total: number) => `共 ${total} 条`,
});

const rowSelection = {
  getCheckboxProps: (record: DeductionItem) => ({
    disabled: record.reviewStatus !== 'pending',
  }),
};

const reviewModalOpen = ref(false);
const reviewModalType = ref<'approve' | 'reject'>('approve');
const currentRecord = ref<DeductionItem | null>(null);
const reviewForm = reactive({
  confirmed_score: 0,
  comment: '',
});

const detailModalOpen = ref(false);

const reviewModalTitle = computed(() => {
  return reviewModalType.value === 'approve' ? '审核通过' : '审核驳回';
});

const columns = [
  { title: '考核对象', dataIndex: 'employeeName', key: 'employee_name', width: 110 },
  { title: '扣分项', dataIndex: 'deductionItem', key: 'deduction_item', ellipsis: true },
  { title: '类型', dataIndex: 'deductionType', key: 'deduction_type', width: 100 },
  { title: '规则编码', dataIndex: 'ruleCode', key: 'rule_code', width: 140 },
  { title: '建议分值', dataIndex: 'suggestedScore', key: 'suggested_score', width: 100 },
  { title: '确认分值', dataIndex: 'confirmedScore', key: 'confirmed_score', width: 100 },
  { title: '生效分', key: 'effective_score', width: 90 },
  { title: '说明', dataIndex: 'sourceDetail', key: 'summary', ellipsis: true, width: 240 },
  { title: '审核状态', dataIndex: 'reviewStatus', key: 'review_status', width: 110 },
  { title: '版本', dataIndex: 'currentVersion', key: 'current_version', width: 80 },
  { title: '创建时间', dataIndex: 'createdAt', key: 'created_at', width: 170 },
  { title: '操作', key: 'action', width: 240, fixed: 'right' as const },
];

function getReviewStatusText(status: string) {
  const map: Record<string, string> = {
    pending: '待审核',
    approved: '已确认（锁定）',
    rejected: '已驳回',
    adjusted: '已调整（锁定）',
  };
  return map[status] || status;
}

function getReviewStatusColor(status: string) {
  const map: Record<string, string> = {
    pending: 'warning',
    approved: 'success',
    rejected: 'error',
    adjusted: 'cyan',
  };
  return map[status] || 'default';
}

/** 生效分：approved/adjusted 用确认分（缺省回退建议分），pending 用建议分，rejected 计 0 */
function effectiveScore(record: DeductionItem): number {
  if (record.reviewStatus === 'rejected') return 0;
  if (record.reviewStatus === 'approved' || record.reviewStatus === 'adjusted') {
    return record.confirmedScore != null ? Number(record.confirmedScore) : Number(record.suggestedScore);
  }
  return Number(record.suggestedScore);
}

/** 可恢复自动计算：已锁定（approved/adjusted）的「网格未巡查」自动明细且对象未冻结 */
function canUnlock(record: DeductionItem): boolean {
  return (
    (record.reviewStatus === 'approved' || record.reviewStatus === 'adjusted') &&
    record.deductionSource === 'auto' &&
    record.sourceDetail?.kind === 'grid_unchecked_monthly' &&
    record.targetStatus !== 'frozen'
  );
}

function getDeductionTypeText(type: string) {
  const map: Record<string, string> = {
    violation: '违章扣分',
    accident: '事故扣分',
    inspection: '检查扣分',
    training: '培训扣分',
  };
  return map[type] || type;
}

function formatDate(dateStr: string) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleString('zh-CN');
}

async function loadCycleList() {
  cycleLoading.value = true;
  try {
    const res: any = await getAssessmentCycleList({
      page: 1,
      page_size: 100,
      sort_by: 'created_at',
      sort_order: 'desc',
    });
    cycleList.value = res.list || [];
    if (cycleList.value.length > 0 && !selectedCycleId.value) {
      selectedCycleId.value = cycleList.value[0]!.id;
      loadData();
    }
  } catch (e: any) {
    message.error(e.message || '加载周期列表失败');
  } finally {
    cycleLoading.value = false;
  }
}

async function loadData() {
  if (!selectedCycleId.value) {
    dataSource.value = [];
    return;
  }
  loading.value = true;
  try {
    const res: any = await getDeductionList({
      page: pagination.current,
      page_size: pagination.pageSize,
      cycle_id: selectedCycleId.value,
      review_status: filterStatus.value,
      deduction_type: filterType.value,
    });
    dataSource.value = res.list || [];
    pagination.total = res.total || 0;
  } catch (e: any) {
    message.error(e.message || '加载失败');
  } finally {
    loading.value = false;
  }
}

function handleCycleChange() {
  pagination.current = 1;
  selectedRowKeys.value = [];
  loadData();
}

function handleTableChange(pag: any) {
  pagination.current = pag.current;
  pagination.pageSize = pag.pageSize;
  loadData();
}

function showReviewModal(record: DeductionItem, type: 'approve' | 'reject') {
  currentRecord.value = record;
  reviewModalType.value = type;
  reviewForm.confirmed_score = record.suggestedScore;
  reviewForm.comment = '';
  reviewModalOpen.value = true;
}

async function handleReview() {
  if (!currentRecord.value) return;
  if (reviewModalType.value === 'reject' && !reviewForm.comment.trim()) {
    message.warning('请输入驳回原因');
    return;
  }
  reviewing.value = true;
  try {
    if (reviewModalType.value === 'approve') {
      await reviewDeduction({
        deduction_id: currentRecord.value.id,
        confirmed_score: reviewForm.confirmed_score,
        review_comment: reviewForm.comment,
      });
      message.success('审核通过');
    } else {
      await rejectDeduction({
        deduction_id: currentRecord.value.id,
        reject_reason: reviewForm.comment,
      });
      message.success('已驳回');
    }
    reviewModalOpen.value = false;
    loadData();
  } catch (e: any) {
    message.error(e.message || '操作失败');
  } finally {
    reviewing.value = false;
  }
}

async function handleBatchApprove() {
  if (selectedRowKeys.value.length === 0) return;
  try {
    const res: any = await batchApproveDeductions({
      deduction_ids: selectedRowKeys.value,
    });
    message.success(res?.message || `批量审核完成，通过 ${res?.approved ?? 0} 条`);
    selectedRowKeys.value = [];
    loadData();
  } catch (e: any) {
    message.error(e.message || '批量操作失败');
  }
}

const unlockModalOpen = ref(false);
const unlocking = ref(false);
const unlockRecord = ref<DeductionItem | null>(null);

function showUnlockModal(record: DeductionItem) {
  unlockRecord.value = record;
  unlockModalOpen.value = true;
}

async function handleUnlock() {
  if (!unlockRecord.value) return;
  unlocking.value = true;
  try {
    await unlockDeduction(unlockRecord.value.id);
    message.success('已恢复自动计算');
    unlockModalOpen.value = false;
    loadData();
  } catch (e: any) {
    message.error(e.message || '恢复自动计算失败');
  } finally {
    unlocking.value = false;
  }
}

function showDetail(record: DeductionItem) {
  currentRecord.value = record;
  detailModalOpen.value = true;
}

import { computed } from 'vue';

onMounted(() => {
  loadCycleList();
});
</script>
