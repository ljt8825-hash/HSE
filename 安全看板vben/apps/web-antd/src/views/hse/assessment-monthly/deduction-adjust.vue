<template>
  <div class="p-4">
    <a-card>
      <template #title>扣分调整</template>

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
      </a-space>

      <a-table
        :columns="columns"
        :data-source="dataSource"
        :loading="loading"
        :pagination="pagination"
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
              <a-button type="link" size="small" @click="showAdjustModal(record)">
                调整
              </a-button>
              <a-button
                v-if="canUnlock(record)"
                type="link"
                size="small"
                @click="showUnlockModal(record)"
              >
                恢复自动
              </a-button>
              <a-button type="link" size="small" @click="showHistoryDrawer(record)">
                调整历史
              </a-button>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <a-modal
      v-model:open="adjustModalOpen"
      title="扣分调整"
      @ok="handleAdjust"
      :confirm-loading="adjusting"
    >
      <a-form :model="adjustForm" layout="vertical">
        <a-form-item label="扣分项">
          <span>{{ currentRecord?.deductionItem }}</span>
        </a-form-item>
        <a-form-item label="原始分值">
          <span class="text-red-500 font-semibold">-{{ currentRecord?.suggestedScore }}</span>
        </a-form-item>
        <a-form-item label="调整后分值" required>
          <a-input-number
            v-model:value="adjustForm.new_score"
            :min="0"
            :max="100"
            style="width: 100%"
          />
        </a-form-item>
        <a-form-item label="调整原因" required>
          <a-textarea
            v-model:value="adjustForm.adjustment_reason"
            :rows="4"
            placeholder="请输入调整原因"
          />
        </a-form-item>
      </a-form>
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

    <a-drawer
      v-model:open="historyDrawerOpen"
      title="调整历史"
      width="600px"
      @close="closeHistoryDrawer"
    >
      <div v-if="currentRecord">
        <a-descriptions :column="1" size="small" class="mb-4">
          <a-descriptions-item label="扣分项">
            {{ currentRecord.deductionItem }}
          </a-descriptions-item>
          <a-descriptions-item label="当前版本">
            v{{ currentRecord.currentVersion }}
          </a-descriptions-item>
        </a-descriptions>
        <a-timeline v-if="adjustmentHistory.length > 0">
          <a-timeline-item v-for="item in adjustmentHistory" :key="item.id">
            <div class="flex justify-between items-start">
              <div>
                <div class="font-medium">
                  {{ item.operationType }}
                  <a-tag v-if="item.isCurrent" color="green">当前版本</a-tag>
                </div>
                <div class="text-sm text-gray-500 mt-1">
                  v{{ item.versionNo }} | {{ item.adjustedByName }}
                </div>
                <div class="text-sm mt-1">
                  <span class="text-gray-500">分值：</span>
                  <span class="line-through text-gray-400">-{{ item.oldScore }}</span>
                  <span class="mx-2">→</span>
                  <span class="text-red-500 font-semibold">-{{ item.newScore }}</span>
                </div>
                <div v-if="item.adjustmentReason" class="text-sm text-gray-600 mt-1">
                  原因：{{ item.adjustmentReason }}
                </div>
              </div>
              <div class="text-xs text-gray-400">
                {{ formatDate(item.adjustedAt) }}
              </div>
            </div>
          </a-timeline-item>
        </a-timeline>
        <a-empty v-else description="暂无调整记录" />
      </div>
    </a-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { ReloadOutlined } from '@ant-design/icons-vue';
import { message, Select } from 'ant-design-vue';
import {
  getAssessmentCycleList,
  getDeductionList,
  adjustDeduction,
  getDeductionAdjustments,
  unlockDeduction,
} from '#/api/hse/assessment-monthly';
import type { AssessmentMonthlyApi } from '#/api/hse/assessment-monthly';

type DeductionItem = AssessmentMonthlyApi.DeductionItem;
type AssessmentCycle = AssessmentMonthlyApi.AssessmentCycle;
type DeductionAdjustment = AssessmentMonthlyApi.DeductionAdjustment;

const loading = ref(false);
const cycleLoading = ref(false);
const adjusting = ref(false);
const keyword = ref('');
const filterType = ref<string | undefined>();
const selectedCycleId = ref<number | string | undefined>();
const cycleList = ref<AssessmentCycle[]>([]);
const dataSource = ref<DeductionItem[]>([]);
const adjustmentHistory = ref<DeductionAdjustment[]>([]);

const pagination = reactive({
  current: 1,
  pageSize: 20,
  total: 0,
  showSizeChanger: true,
  showTotal: (total: number) => `共 ${total} 条`,
});

const adjustModalOpen = ref(false);
const currentRecord = ref<DeductionItem | null>(null);
const adjustForm = reactive({
  new_score: 0,
  adjustment_reason: '',
});

const unlockModalOpen = ref(false);
const unlocking = ref(false);
const unlockRecord = ref<DeductionItem | null>(null);

const historyDrawerOpen = ref(false);
const historyLoading = ref(false);

const columns = [
  { title: '扣分项', dataIndex: 'deductionItem', key: 'deduction_item', ellipsis: true },
  { title: '类型', dataIndex: 'deductionType', key: 'deduction_type', width: 100 },
  { title: '规则编码', dataIndex: 'ruleCode', key: 'rule_code', width: 140 },
  { title: '建议分值', dataIndex: 'suggestedScore', key: 'suggested_score', width: 100 },
  { title: '确认分值', dataIndex: 'confirmedScore', key: 'confirmed_score', width: 100 },
  { title: '生效分', dataIndex: 'effectiveScore', key: 'effective_score', width: 100 },
  { title: '审核状态', dataIndex: 'reviewStatus', key: 'review_status', width: 110 },
  { title: '说明', dataIndex: 'sourceDetail', key: 'summary', ellipsis: true, width: 240 },
  { title: '版本', dataIndex: 'currentVersion', key: 'current_version', width: 80 },
  { title: '更新时间', dataIndex: 'updatedAt', key: 'updated_at', width: 170 },
  { title: '操作', key: 'action', width: 220, fixed: 'right' as const },
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

function getDeductionTypeText(type: string) {
  const map: Record<string, string> = {
    violation: '违章扣分',
    accident: '事故扣分',
    inspection: '检查扣分',
    training: '培训扣分',
  };
  return map[type] || type;
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
  loadData();
}

function handleTableChange(pag: any) {
  pagination.current = pag.current;
  pagination.pageSize = pag.pageSize;
  loadData();
}

function showAdjustModal(record: DeductionItem) {
  currentRecord.value = record;
  adjustForm.new_score = record.confirmedScore ?? record.suggestedScore;
  adjustForm.adjustment_reason = '';
  adjustModalOpen.value = true;
}

async function handleAdjust() {
  if (!currentRecord.value) return;
  if (!adjustForm.adjustment_reason.trim()) {
    message.warning('请输入调整原因');
    return;
  }
  adjusting.value = true;
  try {
    await adjustDeduction({
      deduction_id: currentRecord.value.id,
      new_score: adjustForm.new_score,
      adjustment_reason: adjustForm.adjustment_reason,
    });
    message.success('调整成功');
    adjustModalOpen.value = false;
    loadData();
  } catch (e: any) {
    message.error(e.message || '调整失败');
  } finally {
    adjusting.value = false;
  }
}

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

async function showHistoryDrawer(record: DeductionItem) {
  currentRecord.value = record;
  historyDrawerOpen.value = true;
  adjustmentHistory.value = [];
  historyLoading.value = true;
  try {
    const res: any = await getDeductionAdjustments(record.id);
    adjustmentHistory.value = res.list || [];
  } catch (e: any) {
    message.error(e.message || '加载调整历史失败');
  } finally {
    historyLoading.value = false;
  }
}

function closeHistoryDrawer() {
  historyDrawerOpen.value = false;
  adjustmentHistory.value = [];
}

onMounted(() => {
  loadCycleList();
});
</script>
