<script lang="ts" setup>
/**
 * 扣分审核（web-naive · 阶段06B-3）
 * 契约来源：apps/web-antd/src/views/hse/assessment-monthly/deduction-review.vue + assessment-monthly.ts
 * 能力：周期下拉(默认首条) / 审核状态(pending/approved/rejected, 默认 pending) / 扣分类型(violation/accident/inspection/training) /
 *      搜索 / 批量通过(仅 filterStatus==='pending' 可见) / 行选择仅 pending 可选(提交时按状态过滤) /
 *      单条 通过/驳回(reject 必填原因) / 详情抽屉。
 * 列：扣分项/类型/规则编码/建议分值(负值)/确认分值(负值)/审核状态/版本/创建时间/操作。建议与确认分值显示负值语义(-X)。
 */
import { computed, onMounted, reactive, ref } from 'vue';
import type { VxeTableGridColumns } from '#/adapter/vxe-table';

import {
  NButton,
  NDrawer,
  NDrawerContent,
  NDescriptions,
  NDescriptionsItem,
  NForm,
  NFormItem,
  NGi,
  NInput,
  NInputNumber,
  NModal,
  NSelect,
  NSpace,
} from 'naive-ui';
import { IconifyIcon } from '@vben/icons';

import { HseActionBar, HseDataGrid, HsePageLayout, HseSearchPanel, HseStatusTag, type HseActionKey } from '#/components/hse';
import {
  getAssessmentCycleList,
  getDeductionList,
  rejectDeduction,
  reviewDeduction,
  unlockDeduction,
  type AssessmentMonthlyApi,
} from '#/api/hse/assessment-monthly';
import { message } from '#/adapter/naive';

defineOptions({ name: 'AssessmentMonthlyReview' });

const loading = ref(false);
const cycleLoading = ref(false);
const reviewing = ref(false);
const dataSource = ref<AssessmentMonthlyApi.DeductionItem[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);

const cycleList = ref<AssessmentMonthlyApi.AssessmentCycle[]>([]);
const selectedCycleId = ref<number | string | undefined>();
const searchForm = reactive({
  status: 'pending' as string | undefined,
  type: undefined as string | undefined,
  keyword: '',
});

const typeOptions = [
  { label: '违章扣分', value: 'violation' },
  { label: '事故扣分', value: 'accident' },
  { label: '检查扣分', value: 'inspection' },
  { label: '培训扣分', value: 'training' },
];

const REVIEW_STATUS_TEXT: Record<string, string> = {
  pending: '待审核',
  approved: '已确认（锁定）',
  rejected: '已驳回',
  adjusted: '已调整（锁定）',
};
const REVIEW_STATUS_TAG: Record<string, 'success' | 'info' | 'warning' | 'danger' | 'neutral'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  adjusted: 'info',
};
const TYPE_TEXT: Record<string, string> = {
  violation: '违章扣分',
  accident: '事故扣分',
  inspection: '检查扣分',
  training: '培训扣分',
  auto_deduction: '自动扣分',
};

const columns = computed<VxeTableGridColumns>(() => [
  { type: 'checkbox', width: 50, align: 'center' },
  { title: '考核对象', field: 'employeeName', minWidth: 120, align: 'center' },
  { title: '扣分项', field: 'deductionItem', minWidth: 180, align: 'center', showOverflow: 'tooltip' },
  { title: '类型', field: 'deductionType', width: 100, align: 'center', slots: { default: 'typeCell' } },
  { title: '规则编码', field: 'ruleCode', width: 140, align: 'center' },
  { title: '建议分值', field: 'suggestedScore', width: 100, align: 'center', slots: { default: 'suggestCell' } },
  { title: '确认分值', field: 'confirmedScore', width: 100, align: 'center', slots: { default: 'confirmCell' } },
  { title: '生效分', field: 'effectiveScore', width: 100, align: 'center', slots: { default: 'effectiveCell' } },
  { title: '审核状态', field: 'reviewStatus', width: 150, align: 'center', slots: { default: 'reviewCell' } },
  { title: '说明', field: 'sourceDetail', minWidth: 240, align: 'left', showOverflow: 'tooltip', slots: { default: 'summaryCell' } },
  { title: '版本', field: 'currentVersion', width: 80, align: 'center' },
  { title: '创建时间', field: 'createdAt', width: 130, align: 'center', slots: { default: 'createdAtCell' } },
  { title: '操作', field: 'action', width: 220, align: 'center', fixed: 'right', slots: { default: 'action' } },
]);

const gridRef = ref<{ gridApi: any } | null>(null);
function getCheckedRecords(): AssessmentMonthlyApi.DeductionItem[] {
  try {
    return (gridRef.value?.gridApi?.grid?.getCheckboxRecords?.() as AssessmentMonthlyApi.DeductionItem[]) ?? [];
  } catch {
    return [];
  }
}

const reviewModalOpen = ref(false);
const reviewModalType = ref<'approve' | 'reject'>('approve');
const currentRecord = ref<AssessmentMonthlyApi.DeductionItem | null>(null);
const reviewForm = reactive({ confirmed_score: 0, comment: '' });
const reviewModalTitle = computed(() => (reviewModalType.value === 'approve' ? '审核通过' : '审核驳回'));

const detailModalOpen = ref(false);

async function loadCycleList() {
  cycleLoading.value = true;
  try {
    const res = await getAssessmentCycleList({
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
  } catch {
    message.error('加载周期列表失败');
  } finally {
    cycleLoading.value = false;
  }
}

async function loadData() {
  if (!selectedCycleId.value) {
    dataSource.value = [];
    total.value = 0;
    return;
  }
  loading.value = true;
  try {
    const res = await getDeductionList({
      page: page.value,
      page_size: pageSize.value,
      cycle_id: selectedCycleId.value,
      review_status: searchForm.status,
      deduction_type: searchForm.type,
    });
    dataSource.value = res.list || [];
    total.value = res.total || 0;
  } catch {
    dataSource.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
}

function handleCycleChange() {
  page.value = 1;
  loadData();
}
function onSearch() {
  page.value = 1;
  loadData();
}
function onReset() {
  searchForm.status = 'pending';
  searchForm.type = undefined;
  searchForm.keyword = '';
  onSearch();
}
function onPageChange(payload: { currentPage: number; pageSize: number }) {
  page.value = payload.currentPage;
  pageSize.value = payload.pageSize;
  loadData();
}

function showReviewModal(record: AssessmentMonthlyApi.DeductionItem, type: 'approve' | 'reject') {
  currentRecord.value = record;
  reviewModalType.value = type;
  reviewForm.confirmed_score = Number(record.suggestedScore) || 0;
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
  } catch {
    /* 拦截器已提示 */
  } finally {
    reviewing.value = false;
  }
}

async function handleBatchApprove() {
  const rows = getCheckedRecords();
  if (rows.length === 0) {
    message.warning('请先勾选待审核的扣分明细');
    return;
  }
  try {
    for (const r of rows) {
      if (r.reviewStatus === 'pending') {
        await reviewDeduction({ deduction_id: r.id, confirmed_score: r.suggestedScore });
      }
    }
    message.success(`已批量通过 ${rows.length} 条`);
    loadData();
  } catch {
    /* 拦截器已提示 */
  }
}

/** 生效分：approved/adjusted 用确认分（缺省回退建议分），pending 用建议分，rejected 计 0 */
function effectiveScore(row: AssessmentMonthlyApi.DeductionItem): number {
  if (row.reviewStatus === 'rejected') return 0;
  if (row.reviewStatus === 'approved' || row.reviewStatus === 'adjusted') {
    return row.confirmedScore != null ? Number(row.confirmedScore) : Number(row.suggestedScore);
  }
  return Number(row.suggestedScore);
}

/** 可恢复自动计算：已锁定（approved/adjusted）的「网格未巡查」自动明细；已冻结对象不显示 */
function canUnlock(row: AssessmentMonthlyApi.DeductionItem): boolean {
  return (
    (row.reviewStatus === 'approved' || row.reviewStatus === 'adjusted') &&
    row.deductionSource === 'auto' &&
    row.sourceDetail?.kind === 'grid_unchecked_monthly' &&
    row.targetStatus !== 'frozen'
  );
}

const unlockModalOpen = ref(false);
const unlockRecord = ref<AssessmentMonthlyApi.DeductionItem | null>(null);
function showUnlockModal(row: AssessmentMonthlyApi.DeductionItem) {
  unlockRecord.value = row;
  unlockModalOpen.value = true;
}
async function handleUnlock() {
  if (!unlockRecord.value) return;
  try {
    await unlockDeduction(unlockRecord.value.id);
    message.success('已恢复自动计算');
    unlockModalOpen.value = false;
    loadData();
  } catch {
    /* 拦截器已提示 */
  }
}

function showDetail(record: AssessmentMonthlyApi.DeductionItem) {
  currentRecord.value = record;
  detailModalOpen.value = true;
}

function formatDate(dateStr: string) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? dateStr : d.toLocaleString('zh-CN');
}

function formatDateShort(dateStr: string) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const actionState = ref<Partial<Record<HseActionKey, { hidden?: boolean }>>>({
  downloadTemplate: { hidden: true },
  import: { hidden: true },
  export: { hidden: true },
  create: { hidden: true },
});

onMounted(() => {
  loadCycleList();
});
</script>

<template>
  <HsePageLayout title="扣分审核">
    <template #extra>
      <HseActionBar :actions="actionState" @refresh="loadData" />
    </template>

    <div class="mb-4">
      <NSelect
        v-model:value="selectedCycleId"
        placeholder="请选择考核周期"
        :loading="cycleLoading"
        :options="cycleList.map((c) => ({ label: c.cycleName, value: c.id }))"
        style="max-width: 320px"
        @update:value="handleCycleChange"
      />
    </div>

    <NSpace class="mb-4" :size="8">
      <NButton
        v-if="searchForm.status === 'pending'"
        type="primary"
        :disabled="!selectedCycleId"
        @click="handleBatchApprove"
      >
        <template #icon><IconifyIcon icon="lucide:check-circle" /></template>
        批量通过
      </NButton>
    </NSpace>

    <HseSearchPanel @query="onSearch" @reset="onReset">
      <NGi>
        <NSelect v-model:value="searchForm.status" placeholder="审核状态" clearable :options="[
          { label: '待审核', value: 'pending' },
          { label: '已通过', value: 'approved' },
          { label: '已驳回', value: 'rejected' },
        ]" />
      </NGi>
      <NGi>
        <NSelect v-model:value="searchForm.type" placeholder="扣分类型" clearable :options="typeOptions" />
      </NGi>
      <NGi>
        <NInput v-model:value="searchForm.keyword" placeholder="搜索扣分项" clearable @keyup.enter="onSearch" />
      </NGi>
    </HseSearchPanel>

    <HseDataGrid
      ref="gridRef"
      :columns="columns"
      :data="dataSource"
      :loading="loading"
      :pager="true"
      :total="total"
      scroll-x="1600"
      @page-change="onPageChange"
    >
      <template #typeCell="{ row }">
        <HseStatusTag type="info">{{ TYPE_TEXT[row.deductionType] || row.deductionType }}</HseStatusTag>
      </template>
      <template #suggestCell="{ row }">
        <span class="text-danger font-semibold">-{{ row.suggestedScore }}</span>
      </template>
      <template #confirmCell="{ row }">
        <span v-if="row.confirmedScore !== null" class="text-danger font-semibold">-{{ row.confirmedScore }}</span>
        <span v-else class="text-muted-foreground">-</span>
      </template>
      <template #effectiveCell="{ row }">
        <span v-if="row.reviewStatus === 'rejected'" class="text-muted-foreground">0</span>
        <span v-else class="text-danger font-semibold">-{{ effectiveScore(row) }}</span>
      </template>
      <template #reviewCell="{ row }">
        <HseStatusTag :type="REVIEW_STATUS_TAG[row.reviewStatus] || 'neutral'">
          {{ REVIEW_STATUS_TEXT[row.reviewStatus] || row.reviewStatus }}
        </HseStatusTag>
      </template>
      <template #summaryCell="{ row }">
        <span>{{ row.sourceDetail?.summary || '-' }}</span>
      </template>
      <template #createdAtCell="{ row }">
        <span>{{ formatDateShort(row.createdAt) }}</span>
      </template>
      <template #action="{ row }">
        <NSpace justify="center" :size="4">
          <NButton
            v-if="row.reviewStatus === 'pending'"
            size="small"
            type="primary"
            quaternary
            @click="showReviewModal(row, 'approve')"
          >
            通过
          </NButton>
          <NButton
            v-if="row.reviewStatus === 'pending'"
            size="small"
            type="error"
            quaternary
            @click="showReviewModal(row, 'reject')"
          >
            驳回
          </NButton>
          <NButton
            v-if="canUnlock(row)"
            size="small"
            type="warning"
            quaternary
            @click="showUnlockModal(row)"
          >
            恢复自动
          </NButton>
          <NButton size="small" quaternary @click="showDetail(row)">详情</NButton>
        </NSpace>
      </template>
    </HseDataGrid>

    <NModal
      v-model:show="reviewModalOpen"
      :title="reviewModalTitle"
      preset="card"
      style="width: 520px; max-width: 92vw"
      :mask-closable="false"
    >
      <NForm label-placement="top">
        <NFormItem label="扣分项">
          <span>{{ currentRecord?.deductionItem }}</span>
        </NFormItem>
        <NFormItem label="建议分值">
          <span class="text-danger font-semibold">-{{ currentRecord?.suggestedScore }}</span>
        </NFormItem>
        <NFormItem v-if="reviewModalType === 'approve'" label="确认分值">
          <NInputNumber v-model:value="reviewForm.confirmed_score" :min="0" :max="100" style="width: 100%" />
        </NFormItem>
        <NFormItem :label="reviewModalType === 'approve' ? '审核意见' : '驳回原因'" :required="reviewModalType === 'reject'">
          <NInput
            v-model:value="reviewForm.comment"
            type="textarea"
            :rows="4"
            :placeholder="reviewModalType === 'approve' ? '请输入审核意见（选填）' : '请输入驳回原因'"
          />
        </NFormItem>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="reviewModalOpen = false">取消</NButton>
          <NButton
            :type="reviewModalType === 'approve' ? 'primary' : 'error'"
            :loading="reviewing"
            @click="handleReview"
          >
            {{ reviewModalType === 'approve' ? '通过' : '驳回' }}
          </NButton>
        </NSpace>
      </template>
    </NModal>

    <NModal
      v-model:show="unlockModalOpen"
      title="恢复自动计算"
      preset="card"
      style="width: 480px; max-width: 92vw"
      :mask-closable="false"
    >
      <div class="mb-2">
        确定对「<span class="font-semibold">{{ unlockRecord?.deductionItem }}</span>」恢复自动计算？
      </div>
      <div class="text-muted-foreground text-sm mb-2">
        确认分值将清空，由自动扫描按当月台账重新计算并重新进入待审核状态。
      </div>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="unlockModalOpen = false">取消</NButton>
          <NButton type="primary" @click="handleUnlock">确定恢复</NButton>
        </NSpace>
      </template>
    </NModal>

    <NDrawer v-model:show="detailModalOpen" title="扣分明细" :width="600">
      <NDrawerContent v-if="currentRecord">
        <NDescriptions :column="1" bordered label-placement="left" size="small">
          <NDescriptionsItem label="考核对象">{{ currentRecord.employeeName || '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="扣分项">{{ currentRecord.deductionItem }}</NDescriptionsItem>
          <NDescriptionsItem label="扣分类型">
            <HseStatusTag type="info">{{ TYPE_TEXT[currentRecord.deductionType] || currentRecord.deductionType }}</HseStatusTag>
          </NDescriptionsItem>
          <NDescriptionsItem label="规则编码">{{ currentRecord.ruleCode }}</NDescriptionsItem>
          <NDescriptionsItem label="建议分值">
            <span class="text-danger font-semibold">-{{ currentRecord.suggestedScore }}</span>
          </NDescriptionsItem>
          <NDescriptionsItem label="确认分值">
            <span v-if="currentRecord.confirmedScore !== null" class="text-danger font-semibold">-{{ currentRecord.confirmedScore }}</span>
            <span v-else class="text-muted-foreground">-</span>
          </NDescriptionsItem>
          <NDescriptionsItem label="生效分">
            <span v-if="currentRecord.reviewStatus === 'rejected'" class="text-muted-foreground">0</span>
            <span v-else class="text-danger font-semibold">-{{ effectiveScore(currentRecord) }}</span>
          </NDescriptionsItem>
          <NDescriptionsItem label="审核状态">
            <HseStatusTag :type="REVIEW_STATUS_TAG[currentRecord.reviewStatus] || 'neutral'">
              {{ REVIEW_STATUS_TEXT[currentRecord.reviewStatus] || currentRecord.reviewStatus }}
            </HseStatusTag>
          </NDescriptionsItem>
          <NDescriptionsItem label="说明">
            {{ currentRecord.sourceDetail?.summary || '无' }}
          </NDescriptionsItem>
          <NDescriptionsItem label="证据材料">
            {{ currentRecord.evidence || '无' }}
          </NDescriptionsItem>
          <NDescriptionsItem label="备注">
            {{ currentRecord.remark || '无' }}
          </NDescriptionsItem>
          <NDescriptionsItem label="创建时间">
            {{ formatDate(currentRecord.createdAt) }}
          </NDescriptionsItem>
        </NDescriptions>
      </NDrawerContent>
    </NDrawer>
  </HsePageLayout>
</template>

<style scoped>
.text-danger {
  color: hsl(var(--error));
}
.text-muted-foreground {
  color: hsl(var(--muted-foreground));
}
</style>
