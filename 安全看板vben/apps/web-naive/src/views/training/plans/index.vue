<script lang="ts" setup>
/**
 * 培训计划管理（web-naive）
 * 统一使用 HSE 公共组件栈；接入真实 API。
 */
import { reactive, ref, onMounted, computed } from 'vue';

import {
  NButton,
  NForm,
  NFormItem,
  NGi,
  NInput,
  NInputNumber,
  NModal,
  NPopconfirm,
  NRadio,
  NRadioGroup,
  NSelect,
  NSpace,
  NText,
} from 'naive-ui';
import { $t } from '#/locales';

import {
  HseActionBar,
  HseDataGrid,
  HseImportDialog,
  HsePageLayout,
  HseSearchPanel,
  HseStatusTag,
  type HseActionKey,
} from '#/components/hse';
import type { VxeTableGridColumns } from '#/adapter/vxe-table';
import {
  createTrainingPlanItem,
  deleteTrainingPlanItem,
  getPlanStatusFlow,
  getTrainingPlanItems,
  updateTrainingPlanItem,
  type PlanStatusFlowRule,
  type TrainingPlanApi,
} from '#/api/hse/training';
import { useGenericImport } from '#/views/hse/_shared/useGenericImport';
import { message } from '#/adapter/naive';

defineOptions({ name: 'HseTrainingPlans' });

// ===================== 映射 =====================
const PLAN_TYPE_LABEL: Record<string, string> = {
  annual: '年度培训计划',
  special: '专项培训',
  new_employee: '新员工培训',
};

const PLAN_TYPE_TAG: Record<
  string,
  'success' | 'info' | 'warning' | 'danger' | 'neutral'
> = {
  annual: 'info',
  special: 'warning',
  new_employee: 'success',
};

const planStatusRules = ref<PlanStatusFlowRule>({
  statuses: [],
  transitions: [],
});

const legacyStatusOptions = [
  { value: 'draft', label: '草稿' },
  { value: 'approved', label: '已审批' },
  { value: 'in_progress', label: '进行中' },
  { value: 'completed', label: '已完成' },
  { value: 'cancelled', label: '已取消' },
];

const statusOptions = computed(() => {
  const ruleOpts = (planStatusRules.value.statuses || []).map((s) => ({
    value: s.code,
    label: s.label,
  }));
  const merged = [...ruleOpts];
  legacyStatusOptions.forEach((o) => {
    if (!merged.find((m) => m.value === o.value)) merged.push(o);
  });
  return merged;
});

function getStatusTag(status: string): 'success' | 'info' | 'warning' | 'danger' | 'neutral' {
  const rule = (planStatusRules.value.statuses || []).find(
    (s) => s.code === status,
  );
  if (rule?.semanticColor) {
    const color = rule.semanticColor;
    if (color === 'green' || color === 'success') return 'success';
    if (color === 'blue' || color === 'info' || color === 'cyan') return 'info';
    if (color === 'gold' || color === 'orange' || color === 'yellow' || color === 'warning') return 'warning';
    if (color === 'red' || color === 'danger') return 'danger';
  }
  const map: Record<string, 'success' | 'info' | 'warning' | 'danger' | 'neutral'> = {
    draft: 'neutral',
    approved: 'info',
    in_progress: 'warning',
    completed: 'success',
    cancelled: 'danger',
  };
  return map[status] || 'neutral';
}

function getStatusLabel(status: string): string {
  const opt = statusOptions.value.find((o) => o.value === status);
  return opt?.label || status || '-';
}

const planTypeOptions = [
  { label: '年度培训计划', value: 'annual' },
  { label: '专项培训', value: 'special' },
  { label: '新员工培训', value: 'new_employee' },
];

// ===================== 列表数据 =====================
const loading = ref(false);
const data = ref<TrainingPlanApi.TrainingPlanItem[]>([]);
const total = ref(0);
const currentPage = ref(1);
const pageSize = ref(20);
const sortBy = ref<string | undefined>(undefined);
const sortOrder = ref<'asc' | 'desc' | undefined>(undefined);

const searchForm = reactive<{
  keyword: string;
  planType: TrainingPlanApi.PlanType | null;
  status: TrainingPlanApi.PlanStatus | null;
}>({
  keyword: '',
  planType: null,
  status: null,
});

async function loadData() {
  loading.value = true;
  try {
    const res = await getTrainingPlanItems({
      page: currentPage.value,
      pageSize: pageSize.value,
      keyword: searchForm.keyword || undefined,
      planType: (searchForm.planType as TrainingPlanApi.PlanType) || undefined,
      status: (searchForm.status as TrainingPlanApi.PlanStatus) || undefined,
      sortField: sortBy.value,
      sortOrder: sortOrder.value,
    });
    data.value = res.list ?? [];
    total.value = res.total ?? 0;
  } catch {
    data.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
}

function onSearch() {
  currentPage.value = 1;
  loadData();
}

function onReset() {
  searchForm.keyword = '';
  searchForm.planType = null;
  searchForm.status = null;
  onSearch();
}

function onPageChange(payload: { currentPage: number; pageSize: number }) {
  currentPage.value = payload.currentPage;
  pageSize.value = payload.pageSize;
  loadData();
}

function onSortChange(payload: { sortBy?: string; sortOrder?: 'asc' | 'desc' }) {
  sortBy.value = payload.sortBy;
  sortOrder.value = payload.sortOrder;
  currentPage.value = 1;
  loadData();
}

// ===================== 操作栏 =====================
const actionState = ref<Partial<Record<HseActionKey, { hidden?: boolean }>>>({});

const {
  importOpen,
  importPreviewColumns,
  importPreviewData,
  importPreviewError,
  importConfirming,
  importResult,
  onDownloadTemplate: onImportTemplate,
  onUpload: onImportUpload,
  onConfirmImport: onImportConfirm,
  onImportClose: onImportDialogClose,
  bindRefresh: bindImportRefresh,
} = useGenericImport('training-plans');
bindImportRefresh(onRefresh);

async function onRefresh() {
  await loadData();
}

// ===================== 新增 / 编辑 / 查看 =====================
const formOpen = ref(false);
const formMode = ref<'create' | 'edit' | 'view'>('create');
const formLoading = ref(false);
const editingId = ref<number | null>(null);
const formModel = reactive<TrainingPlanApi.PlanFormData>({
  title: '',
  planType: 'annual',
  trainingType: '',
  targetAudience: '',
  trainerName: '',
  trainerId: null,
  plannedAttendees: 0,
  actualAttendees: 0,
  startDate: '',
  endDate: '',
  location: '',
  durationHours: 4,
  content: '',
  examRequired: false,
  passScore: 60,
  status: 'draft',
  remark: '',
  // 对齐附件1《安全培训教育实施计划表》
  planNo: '',
  planHours: null,
  trainingTime: '',
  responsibleDept: '',
});

function resetForm() {
  formModel.title = '';
  formModel.planType = 'annual';
  formModel.trainingType = '';
  formModel.targetAudience = '';
  formModel.trainerName = '';
  formModel.trainerId = null;
  formModel.plannedAttendees = 0;
  formModel.actualAttendees = 0;
  formModel.startDate = '';
  formModel.endDate = '';
  formModel.location = '';
  formModel.durationHours = 4;
  formModel.content = '';
  formModel.examRequired = false;
  formModel.passScore = 60;
  formModel.status = 'draft';
  formModel.remark = '';
  formModel.planNo = '';
  formModel.planHours = null;
  formModel.trainingTime = '';
  formModel.responsibleDept = '';
}

function openCreate() {
  resetForm();
  formMode.value = 'create';
  editingId.value = null;
  formOpen.value = true;
}

function openEdit(row: TrainingPlanApi.TrainingPlanItem) {
  resetForm();
  formMode.value = 'edit';
  editingId.value = row.id;
  Object.assign(formModel, {
    title: row.title,
    planType: row.planType,
    trainingType: row.trainingType,
    targetAudience: row.targetAudience || '',
    trainerName: row.trainerName || '',
    trainerId: row.trainerId || null,
    plannedAttendees: row.plannedAttendees,
    actualAttendees: row.actualAttendees,
    startDate: row.startDate || '',
    endDate: row.endDate || '',
    location: row.location || '',
    durationHours: row.durationHours,
    content: row.content || '',
    examRequired: row.examRequired,
    passScore: row.passScore,
    status: row.status,
    remark: row.remark || '',
    planNo: row.planNo || '',
    planHours: row.planHours ?? null,
    trainingTime: row.trainingTime || '',
    responsibleDept: row.responsibleDept || '',
  });
  formOpen.value = true;
}

function openView(row: TrainingPlanApi.TrainingPlanItem) {
  openEdit(row);
  formMode.value = 'view';
}

async function onSubmit() {
  if (!formModel.title) {
    message.warning('计划标题不能为空');
    return;
  }
  formLoading.value = true;
  try {
    const payload: TrainingPlanApi.PlanFormData = { ...formModel };
    if (formMode.value === 'edit' && editingId.value != null) {
      await updateTrainingPlanItem(editingId.value, payload);
      message.success('编辑成功');
    } else {
      await createTrainingPlanItem(payload);
      message.success('新增成功');
    }
    formOpen.value = false;
    onRefresh();
  } catch {
    /* 拦截器已提示 */
  } finally {
    formLoading.value = false;
  }
}

async function onDelete(row: TrainingPlanApi.TrainingPlanItem) {
  try {
    await deleteTrainingPlanItem(row.id);
    message.success('删除成功');
    onRefresh();
  } catch {
    /* 拦截器已提示 */
  }
}

// ===================== 表格列（对齐《安全培训教育实施计划表》七列） =====================
/** numeric 列经 pg 返回为 "12.00" 字符串，去掉无意义的尾随零 */
function formatHours(value: unknown): string {
  if (value == null || value === '') return '按实际';
  const n = Number(value);
  if (Number.isNaN(n)) return String(value);
  return `${Number.parseFloat(n.toFixed(2))} 学时`;
}

const columns = ref<VxeTableGridColumns>([
  { title: '序号', field: 'planNo', width: 70, align: 'center', formatter: ({ cellValue, row }) => cellValue || row.id || '-' },
  { title: '培训名称', field: 'title', minWidth: 220, align: 'center', showOverflow: 'tooltip' },
  { title: '培训时间', field: 'trainingTime', width: 150, align: 'center', showOverflow: 'tooltip', formatter: ({ cellValue }) => cellValue || '-' },
  { title: '培训对象', field: 'targetAudience', width: 180, align: 'center', showOverflow: 'tooltip', formatter: ({ cellValue }) => cellValue || '-' },
  { title: '培训内容', field: 'content', minWidth: 260, align: 'center', showOverflow: 'tooltip', formatter: ({ cellValue }) => cellValue || '-' },
  { title: '责任部门（人）', field: 'responsibleDept', width: 170, align: 'center', showOverflow: 'tooltip', formatter: ({ cellValue }) => cellValue || '-' },
  { title: '培训学时', field: 'planHours', width: 100, align: 'center', formatter: ({ cellValue }) => formatHours(cellValue) },
  { title: '状态', field: 'status', width: 90, align: 'center', slots: { default: 'status' } },
  {
    title: '操作',
    field: 'action',
    width: 200,
    align: 'center',
    fixed: 'right',
    slots: { default: 'action' },
  },
]);

async function fetchRules() {
  try {
    const flow = await getPlanStatusFlow();
    planStatusRules.value = flow || { statuses: [], transitions: [] };
  } catch {
    planStatusRules.value = { statuses: [], transitions: [] };
  }
}

onMounted(async () => {
  await fetchRules();
  await loadData();
});
</script>

<template>
  <HsePageLayout
    :description="$t('page.hse.trainingPlansDesc')"
    :title="$t('page.hse.trainingPlans')"
  >
    <template #extra>
      <HseActionBar
        :actions="actionState"
        @refresh="onRefresh"
        @download-template="onImportTemplate"
        @import="() => (importOpen = true)"
        @create="openCreate"
      />
    </template>

    <!-- 搜索 -->
    <HseSearchPanel @query="onSearch" @reset="onReset">
      <NGi>
        <NInput
          v-model:value="searchForm.keyword"
          placeholder="计划标题/培训师"
          clearable
          @keyup.enter="onSearch"
        />
      </NGi>
      <NGi>
        <NSelect
          v-model:value="searchForm.planType"
          placeholder="计划类型"
          clearable
          :options="planTypeOptions"
        />
      </NGi>
      <NGi>
        <NSelect
          v-model:value="searchForm.status"
          placeholder="状态"
          clearable
          :options="statusOptions"
        />
      </NGi>
    </HseSearchPanel>

    <!-- 表格 -->
    <HseDataGrid
      :columns="columns"
      :data="data"
      :loading="loading"
      :pager="true"
      :total="total"
      @page-change="onPageChange"
      @sort-change="onSortChange"
    >
      <template #planType="{ row }">
        <HseStatusTag :type="PLAN_TYPE_TAG[row.planType] || 'neutral'">
          {{ PLAN_TYPE_LABEL[row.planType] || row.planType || '-' }}
        </HseStatusTag>
      </template>
      <template #status="{ row }">
        <HseStatusTag :type="getStatusTag(row.status)">
          {{ getStatusLabel(row.status) }}
        </HseStatusTag>
      </template>
      <template #attendees="{ row }">
        <NText>{{ row.actualAttendees }} / {{ row.plannedAttendees }}</NText>
      </template>
      <template #exam="{ row }">
        <HseStatusTag :type="row.examRequired ? 'info' : 'neutral'">
          {{ row.examRequired ? `需要(${row.passScore}分)` : '不需要' }}
        </HseStatusTag>
      </template>
      <template #action="{ row }">
        <NSpace justify="center">
          <NButton size="small" type="primary" quaternary @click="openView(row)">
            查看
          </NButton>
          <NButton size="small" type="primary" quaternary @click="openEdit(row)">
            编辑
          </NButton>
          <NPopconfirm @positive-click="onDelete(row)">
            <template #trigger>
              <NButton size="small" type="error" quaternary>删除</NButton>
            </template>
            确定删除该培训计划吗？
          </NPopconfirm>
        </NSpace>
      </template>
    </HseDataGrid>

    <!-- 新增 / 编辑 / 查看 弹窗 -->
    <NModal
      v-model:show="formOpen"
      :title="
        formMode === 'create'
          ? '新增培训计划'
          : formMode === 'edit'
            ? '编辑培训计划'
            : '培训计划详情'
      "
      preset="card"
      style="width: 720px; max-width: 92vw"
      :mask-closable="false"
    >
      <NForm :disabled="formMode === 'view'" label-placement="top">
        <div class="grid grid-cols-2 gap-x-4">
          <NFormItem label="序号">
            <NInput v-model:value="formModel.planNo" placeholder="如：1 / 2（对齐实施计划表序号）" />
          </NFormItem>
          <NFormItem label="培训名称" required>
            <NInput v-model:value="formModel.title" placeholder="请输入培训名称" />
          </NFormItem>
          <NFormItem label="培训时间">
            <NInput v-model:value="formModel.trainingTime" placeholder="如：1月 / 每季度 / 上岗前" />
          </NFormItem>
          <NFormItem label="培训对象">
            <NInput v-model:value="formModel.targetAudience" placeholder="如：一线员工 / 乡镇作业中心经理" />
          </NFormItem>
          <NFormItem label="责任部门（人）">
            <NInput v-model:value="formModel.responsibleDept" placeholder="如：安环品质部 / 生产运营部" />
          </NFormItem>
          <NFormItem label="培训学时">
            <NInputNumber v-model:value="formModel.planHours" :min="0" :step="0.5" style="width: 100%" />
          </NFormItem>
          <NFormItem label="计划类型">
            <NSelect v-model:value="formModel.planType" :options="planTypeOptions" />
          </NFormItem>
          <NFormItem label="培训类型">
            <NInput v-model:value="formModel.trainingType" placeholder="如：安全培训、技能培训" />
          </NFormItem>
          <NFormItem label="培训师">
            <NInput v-model:value="formModel.trainerName" placeholder="请输入培训师姓名" />
          </NFormItem>
          <NFormItem label="计划人数">
            <NInputNumber v-model:value="formModel.plannedAttendees" :min="0" style="width: 100%" />
          </NFormItem>
          <NFormItem label="实际人数">
            <NInputNumber v-model:value="formModel.actualAttendees" :min="0" style="width: 100%" />
          </NFormItem>
          <NFormItem label="时长(小时)">
            <NInputNumber v-model:value="formModel.durationHours" :min="0.5" :step="0.5" style="width: 100%" />
          </NFormItem>
          <NFormItem label="开始日期">
            <NInput v-model:value="formModel.startDate" placeholder="YYYY-MM-DD" />
          </NFormItem>
          <NFormItem label="结束日期">
            <NInput v-model:value="formModel.endDate" placeholder="YYYY-MM-DD" />
          </NFormItem>
          <NFormItem label="培训地点">
            <NInput v-model:value="formModel.location" placeholder="请输入培训地点" />
          </NFormItem>
          <NFormItem label="状态">
            <NSelect v-model:value="formModel.status" :options="statusOptions" />
          </NFormItem>
          <NFormItem label="是否需要考试">
            <NRadioGroup v-model:value="formModel.examRequired">
              <NSpace :size="16">
                <NRadio :value="true">需要</NRadio>
                <NRadio :value="false">不需要</NRadio>
              </NSpace>
            </NRadioGroup>
          </NFormItem>
          <NFormItem v-if="formModel.examRequired" label="及格分数">
            <NInputNumber v-model:value="formModel.passScore" :min="0" :max="100" style="width: 100%" />
          </NFormItem>
        </div>
        <NFormItem label="培训内容">
          <NInput
            v-model:value="formModel.content"
            type="textarea"
            :rows="3"
            placeholder="请输入培训内容大纲"
          />
        </NFormItem>
        <NFormItem label="备注">
          <NInput v-model:value="formModel.remark" type="textarea" :rows="2" placeholder="其他说明" />
        </NFormItem>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="formOpen = false">关闭</NButton>
          <NButton
            v-if="formMode !== 'view'"
            type="primary"
            :loading="formLoading"
            @click="onSubmit"
          >
            保存
          </NButton>
        </NSpace>
      </template>
    </NModal>

    <!-- 通用导入 -->
    <HseImportDialog
      v-model:open="importOpen"
      title="导入培训计划"
      :preview-columns="importPreviewColumns"
      :preview-data="importPreviewData"
      :preview-error="importPreviewError"
      :confirming="importConfirming"
      :result="importResult"
      @download-template="onImportTemplate"
      @upload="onImportUpload"
      @confirm="onImportConfirm"
      @close="onImportDialogClose"
    />
  </HsePageLayout>
</template>
