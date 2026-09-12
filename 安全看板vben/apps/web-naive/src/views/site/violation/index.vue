<script lang="ts" setup>
/**
 * 三违管理（web-naive · 阶段06B-1）
 * 契约来源：apps/web-antd/src/api/hse/violations.ts（violations.ts 适配层已按契约创建）
 * 能力：统计卡片 / 筛选 / 服务端分页列表 / 详情抽屉 / 新增·编辑 / 整改 / 复查 / 删除(二次确认) /
 *      批量删除(checkbox) / 导入(useGenericImport 'violation') / 导出(Blob)
 * 边界：不调用 GET /violations/by-grid（未实现 TODO）；不改服务端；表格无列宽/顺序拖动。
 */
import { computed, onMounted, reactive, ref } from 'vue';
import {
  NButton,
  NCard,
  NDatePicker,
  NDescriptions,
  NDescriptionsItem,
  NDrawer,
  NDrawerContent,
  NForm,
  NFormItem,
  NGi,
  NInput,
  NInputNumber,
  NModal,
  NPopconfirm,
  NSelect,
  NSpace,
  NStatistic,
  NSwitch,
  NTabPane,
  NTag,
  NTabs,
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
  batchDeleteViolations,
  createViolation,
  deleteViolation,
  exportViolations,
  getDepartmentRanking,
  getEmployeeViolationCount,
  getHighRiskEmployees,
  getPositionRanking,
  getViolationFilterOptions,
  getViolationList,
  getViolationStats,
  rectifyViolation,
  reviewViolation,
  updateViolation,
  type ViolationApi,
} from '#/api/hse/violations';
import { getEmployeeSelectorList } from '#/api/hse/employee';
import { useGenericImport } from '#/views/hse/_shared/useGenericImport';
import { dialog, message } from '#/adapter/naive';

defineOptions({ name: 'SiteViolation' });

// ===================== 映射 =====================
const VIOLATION_TYPE_OPTIONS = [
  { label: '违章指挥', value: '违章指挥' },
  { label: '违章作业', value: '违章作业' },
  { label: '违反劳动纪律', value: '违反劳动纪律' },
];
const LEVEL_OPTIONS = [
  { label: '严重', value: '严重' },
  { label: '一般', value: '一般' },
  { label: '轻微', value: '轻微' },
];
const RISK_OPTIONS = [
  { label: '高', value: '高' },
  { label: '中', value: '中' },
  { label: '低', value: '低' },
];
const STATUS_OPTIONS = [
  { label: '待处理', value: '待处理' },
  { label: '整改中', value: '整改中' },
  { label: '待复查', value: '待复查' },
  { label: '已关闭', value: '已关闭' },
];
const STATUS_TAG: Record<string, 'success' | 'info' | 'warning' | 'danger' | 'neutral'> = {
  待处理: 'danger',
  整改中: 'warning',
  待复查: 'info',
  已关闭: 'success',
};
const LEVEL_TAG: Record<string, 'success' | 'info' | 'warning' | 'danger' | 'neutral'> = {
  严重: 'danger',
  一般: 'warning',
  轻微: 'info',
};
const TYPE_TAG: Record<string, 'success' | 'info' | 'warning' | 'danger' | 'neutral'> = {
  违章指挥: 'danger',
  违章作业: 'warning',
  违反劳动纪律: 'info',
};

// ===== 阶段2a：查处来源 =====
// 字典与后端 violation_records.check_source 一致：
//   company=公司查处（阶段3 计 5 分/次）/ township=乡镇查处 / self=自查自纠 / 空=未标注
const CHECK_SOURCE_OPTIONS: { label: string; value: ViolationApi.CheckSource }[] = [
  { label: '公司查处', value: 'company' },
  { label: '乡镇查处', value: 'township' },
  { label: '自查自纠', value: 'self' },
];
const CHECK_SOURCE_TEXT: Record<string, string> = {
  company: '公司查处',
  township: '乡镇查处',
  self: '自查自纠',
};
/** 列表列展示配色：公司查处最醒目，未标注为灰 */
const CHECK_SOURCE_TAG: Record<string, 'error' | 'warning' | 'default' | 'info'> = {
  company: 'error',
  township: 'warning',
  self: 'info',
};

// ===================== 列表数据 =====================
const loading = ref(false);
const data = ref<ViolationApi.ViolationItem[]>([]);
const total = ref(0);
const currentPage = ref(1);
const pageSize = ref(20);
const sortBy = ref<string | undefined>(undefined);
const sortOrder = ref<'asc' | 'desc' | undefined>(undefined);

const searchForm = reactive({
  keyword: '',
  violationType: undefined as string | undefined,
  areaTeam: undefined as string | undefined,
  gridLevel: undefined as string | undefined,
  startDate: undefined as string | undefined,
  endDate: undefined as string | undefined,
  checkSource: undefined as ViolationApi.CheckSource | undefined,
});
const dateRange = ref<[number, number] | null>(null);
const filterOptions = ref<ViolationApi.ViolationFilterOptions>({ areaTeams: [], gridLevels: [] });

async function loadData() {
  loading.value = true;
  try {
    const res = await getViolationList({
      page: currentPage.value,
      pageSize: pageSize.value,
      keyword: searchForm.keyword || undefined,
      violationType: searchForm.violationType,
      areaTeam: searchForm.areaTeam,
      gridLevel: searchForm.gridLevel,
      startDate: searchForm.startDate,
      endDate: searchForm.endDate,
      checkSource: searchForm.checkSource,
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

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function onDateRangeChange(value: [number, number] | null) {
  dateRange.value = value;
  if (value && value[0] && value[1]) {
    searchForm.startDate = formatDate(new Date(value[0]));
    searchForm.endDate = formatDate(new Date(value[1]));
  } else {
    searchForm.startDate = undefined;
    searchForm.endDate = undefined;
  }
}

const statTotal = ref(0);
const statL1 = ref(0);
const statL2 = ref(0);
const statL3 = ref(0);
const statItems = computed(() => [
  { key: 'total', label: '违章总数', value: statTotal.value },
  { key: 'l1', label: '一级网格长（本月）', value: statL1.value },
  { key: 'l2', label: '二级网格长（本月）', value: statL2.value },
  { key: 'l3', label: '三级网格长（本月）', value: statL3.value },
]);
async function loadStats() {
  try {
    const s = await getViolationStats();
    statTotal.value = s.total ?? 0;
    statL1.value = s.level1Month ?? 0;
    statL2.value = s.level2Month ?? 0;
    statL3.value = s.level3Month ?? 0;
  } catch {
    /* ignore */
  }
}
async function loadFilterOptions() {
  try {
    const res = await getViolationFilterOptions();
    filterOptions.value = {
      areaTeams: res.areaTeams ?? [],
      gridLevels: res.gridLevels ?? [],
      // 查处来源为固定字典，后端返回则用后端，否则回退前端常量（兼容未升级后端）
      checkSources: res.checkSources?.length ? res.checkSources : CHECK_SOURCE_OPTIONS,
    };
  } catch {
    /* ignore */
  }
}

function onSearch() {
  currentPage.value = 1;
  loadData();
  loadStats();
}
function onReset() {
  searchForm.keyword = '';
  searchForm.violationType = undefined;
  searchForm.areaTeam = undefined;
  searchForm.gridLevel = undefined;
  searchForm.startDate = undefined;
  searchForm.endDate = undefined;
  searchForm.checkSource = undefined;
  dateRange.value = null;
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

// ===================== 操作栏 / 导入 / 导出 =====================
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
} = useGenericImport('violation');
bindImportRefresh(onRefresh);

async function onRefresh() {
  await Promise.all([loadData(), loadStats(), loadFilterOptions()]);
}
function triggerDownload(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}
function onExport() {
  exportViolations()
    .then((blob: Blob) => triggerDownload(blob, '三违管理列表.csv'))
    .catch(() => message.error('导出失败'));
}

// ===================== 统计分析（辅助能力，独立次级入口） =====================
const statsModalOpen = ref(false);
const statsTab = ref('employee');
const employeeViolationCount = ref<ViolationApi.EmployeeViolationCount[]>([]);
const highRiskEmployees = ref<ViolationApi.HighRiskEmployee[]>([]);
const departmentRanking = ref<ViolationApi.DepartmentRanking[]>([]);
const positionRanking = ref<ViolationApi.PositionRanking[]>([]);
const statsLoading = ref(false);
async function openStatsModal() {
  statsModalOpen.value = true;
  await loadStatsData();
}
async function loadStatsData() {
  statsLoading.value = true;
  try {
    const [emp, risk, dept, pos] = await Promise.all([
      getEmployeeViolationCount(),
      getHighRiskEmployees(),
      getDepartmentRanking(),
      getPositionRanking(),
    ]);
    employeeViolationCount.value = emp ?? [];
    highRiskEmployees.value = risk ?? [];
    departmentRanking.value = dept ?? [];
    positionRanking.value = pos ?? [];
  } catch {
    message.error('获取统计分析数据失败');
  } finally {
    statsLoading.value = false;
  }
}

// 人员选择（员工选择器，选择后保留 ID + 姓名）
const employeeOptions = ref<{ label: string; value: number }[]>([]);
async function searchEmployees(keyword: string) {
  try {
    const res = await getEmployeeSelectorList({ keyword: keyword || undefined, limit: 30 });
    employeeOptions.value = (res ?? []).map((e: any) => ({
      label: `${e.name ?? e.label ?? ''}（${e.employee_code ?? e.id ?? ''}）`,
      value: Number(e.id ?? e.value ?? 0),
    }));
  } catch {
    employeeOptions.value = [];
  }
}

// ===================== 新增 / 编辑 / 查看 =====================
const formOpen = ref(false);
const formMode = ref<'create' | 'edit' | 'view'>('create');
const formLoading = ref(false);
const editingId = ref<number | null>(null);
const formModel = reactive({
  violationType: '',
  violationLevel: '',
  riskLevel: '中',
  description: '',
  location: '',
  violationDate: '',
  occurTime: '',
  violatorId: undefined as number | undefined,
  violatorName: '',
  violatorIdCard: '',
  inspectorId: undefined as number | undefined,
  inspectorName: '',
  handlerId: undefined as number | undefined,
  handlerName: '',
  punisherId: undefined as number | undefined,
  punisherName: '',
  punishmentType: '',
  punishmentAmount: undefined as number | undefined,
  rectification: '',
  needRetraining: false,
  status: '待处理',
  remark: '',
  // 阶段2a：查处来源，默认空 = 未标注
  checkSource: undefined as ViolationApi.CheckSource | undefined,
});

function resetForm() {
  Object.assign(formModel, {
    violationType: '',
    violationLevel: '',
    riskLevel: '中',
    description: '',
    location: '',
    violationDate: '',
    occurTime: '',
    violatorId: undefined,
    violatorName: '',
    violatorIdCard: '',
    inspectorId: undefined,
    inspectorName: '',
    handlerId: undefined,
    handlerName: '',
    punisherId: undefined,
    punisherName: '',
    punishmentType: '',
    punishmentAmount: undefined,
    rectification: '',
    needRetraining: false,
    status: '待处理',
    remark: '',
    checkSource: undefined,
  });
}
function openCreate() {
  resetForm();
  formMode.value = 'create';
  editingId.value = null;
  formOpen.value = true;
}
function openEdit(row: ViolationApi.ViolationItem) {
  resetForm();
  formMode.value = 'edit';
  editingId.value = row.id;
  Object.assign(formModel, {
    violationType: row.violationType ?? '',
    violationLevel: row.violationLevel ?? '',
    riskLevel: row.riskLevel ?? '中',
    description: row.description ?? '',
    location: row.location ?? '',
    violationDate: row.violationDate ?? '',
    occurTime: row.occurTime ?? '',
    violatorId: row.violatorId ?? undefined,
    violatorName: row.violatorName ?? '',
    violatorIdCard: row.violatorIdCard ?? '',
    inspectorId: row.inspectorId ?? undefined,
    inspectorName: row.inspectorName ?? '',
    handlerId: row.handlerId ?? undefined,
    handlerName: row.handlerName ?? '',
    punisherId: row.punisherId ?? undefined,
    punisherName: row.punisherName ?? '',
    punishmentType: row.punishmentType ?? '',
    punishmentAmount: row.punishmentAmount ?? undefined,
    rectification: row.rectification ?? '',
    needRetraining: row.needRetraining ?? false,
    status: row.status ?? '待处理',
    remark: row.remark ?? '',
    checkSource: row.checkSource ?? undefined,
  });
  formOpen.value = true;
}
function openView(row: ViolationApi.ViolationItem) {
  currentViolation.value = row;
  detailDrawerVisible.value = true;
}

async function onSubmit() {
  if (!formModel.violationType) {
    message.warning('请选择三违类型');
    return;
  }
  if (!formModel.violationLevel) {
    message.warning('请选择严重程度');
    return;
  }
  if (!formModel.description) {
    message.warning('请输入违章描述');
    return;
  }
  if (!formModel.violationDate) {
    message.warning('请选择违章日期');
    return;
  }
  // 阶段2 收尾 A1：查处来源——新建必填（从源头消灭 NULL）；编辑历史空值记录提示补选后可保存
  if (!formModel.checkSource) {
    if (formMode.value !== 'edit') {
      message.warning('请选择查处来源');
      return;
    }
    const confirmed = await new Promise<boolean>((resolve) => {
      dialog.warning({
        title: '未标注查处来源',
        content: '该记录未标注查处来源，未标注将按 1 分/次计分，建议补选。是否继续保存？',
        positiveText: '继续保存',
        negativeText: '返回补选',
        onPositiveClick: () => resolve(true),
        onNegativeClick: () => resolve(false),
        onClose: () => resolve(false),
      });
    });
    if (!confirmed) return;
  }
  formLoading.value = true;
  try {
    const payload: Partial<ViolationApi.ViolationItem> = { ...formModel };
    if (formMode.value === 'edit' && editingId.value != null) {
      await updateViolation(editingId.value, payload);
      message.success('更新成功');
    } else {
      await createViolation(payload);
      message.success('创建成功');
    }
    formOpen.value = false;
    onRefresh();
  } catch {
    /* 拦截器已提示 */
  } finally {
    formLoading.value = false;
  }
}

// ===================== 整改 / 复查 =====================
const rectifyOpen = ref(false);
const rectifyLoading = ref(false);
const rectifyingId = ref<number | null>(null);
const rectifyForm = reactive({ handlerId: null as number | null, rectification: '' });
function openRectify(row: ViolationApi.ViolationItem) {
  rectifyingId.value = row.id;
  rectifyForm.handlerId = row.handlerId ?? null;
  rectifyForm.rectification = row.rectification ?? '';
  rectifyOpen.value = true;
}
async function onRectifySave() {
  if (rectifyForm.handlerId == null) {
    message.warning('请选择处理人员');
    return;
  }
  if (!rectifyForm.rectification) {
    message.warning('请输入整改措施');
    return;
  }
  if (rectifyingId.value == null) {
    return;
  }
  rectifyLoading.value = true;
  try {
    await rectifyViolation(rectifyingId.value, {
      rectification: rectifyForm.rectification,
      handlerId: rectifyForm.handlerId ?? undefined,
    });
    message.success('整改提交成功');
    rectifyOpen.value = false;
    onRefresh();
  } catch {
    /* 拦截器已提示 */
  } finally {
    rectifyLoading.value = false;
  }
}

const reviewOpen = ref(false);
const reviewLoading = ref(false);
const reviewingId = ref<number | null>(null);
const reviewForm = reactive({ reviewResult: '', remark: '' });
function openReview(row: ViolationApi.ViolationItem) {
  reviewingId.value = row.id;
  reviewForm.reviewResult = '';
  reviewForm.remark = '';
  reviewOpen.value = true;
}
async function onReviewSave() {
  if (!reviewForm.reviewResult) {
    message.warning('请选择复查结果');
    return;
  }
  if (reviewingId.value == null) {
    return;
  }
  reviewLoading.value = true;
  try {
    await reviewViolation(reviewingId.value, {
      reviewResult: reviewForm.reviewResult,
      remark: reviewForm.remark || undefined,
    });
    message.success('复查完成');
    reviewOpen.value = false;
    onRefresh();
  } catch {
    /* 拦截器已提示 */
  } finally {
    reviewLoading.value = false;
  }
}

// ===================== 删除 / 批量删除 =====================
async function onDelete(row: ViolationApi.ViolationItem) {
  try {
    await deleteViolation(row.id);
    message.success('删除成功');
    onRefresh();
  } catch {
    /* 拦截器已提示 */
  }
}

const gridRef = ref<{ gridApi: any } | null>(null);
async function onBatchDelete() {
  let rows: ViolationApi.ViolationItem[] = [];
  try {
    rows = gridRef.value?.gridApi?.grid?.getCheckboxRecords?.() ?? [];
  } catch {
    rows = [];
  }
  if (!rows.length) {
    message.warning('请先勾选要删除的记录');
    return;
  }
  const ids = rows.map((r) => r.id);
  try {
    await batchDeleteViolations(ids);
    message.success(`已删除 ${ids.length} 条记录`);
    onRefresh();
  } catch {
    /* 拦截器已提示 */
  }
}

// ===================== 详情抽屉 =====================
const detailDrawerVisible = ref(false);
const currentViolation = ref<ViolationApi.ViolationItem | null>(null);

// ===================== 表格列 =====================
const columns = ref<VxeTableGridColumns>([
  { type: 'checkbox', width: 50, align: 'center' },
  {
    title: '序号',
    field: 'index',
    minWidth: 70,
    align: 'center',
    formatter: (params: any) =>
      (currentPage.value - 1) * pageSize.value + (params?.rowIndex ?? 0) + 1,
  },
  { title: '分组名称', field: 'areaTeam', minWidth: 120, align: 'center' },
  { title: '姓名', field: 'inspectorName', minWidth: 110, align: 'center' },
  { title: '所属岗位', field: 'position', minWidth: 120, align: 'center' },
  { title: '网格等级', field: 'gridLevel', minWidth: 100, align: 'center' },
  { title: '日期', field: 'violationDate', minWidth: 120, align: 'center', sortable: true, formatter: ({ cellValue }) => { const s = cellValue == null ? '' : String(cellValue); return s ? (s.length >= 10 ? s.slice(0, 10) : s) : '-'; } },
  // 阶段2a：查处来源（公司查处=error 醒目 / 乡镇=warning / 自查=info / 未标注=灰）
  {
    title: '查处来源',
    field: 'checkSource',
    minWidth: 110,
    align: 'center',
    slots: { default: 'checkSource' },
  },
  { title: '三违行为', field: 'violationBehavior', minWidth: 180, align: 'center', showOverflow: 'tooltip' },
  { title: '违章人姓名', field: 'violatorName', minWidth: 110, align: 'center' },
  { title: '违章人性别', field: 'violatorGender', minWidth: 90, align: 'center' },
  { title: '违章人年龄', field: 'violatorAge', minWidth: 90, align: 'center' },
  { title: '创建时间', field: 'createdAt', minWidth: 170, align: 'center', sortable: true, formatter: ({ cellValue }) => { const s = cellValue == null ? '' : String(cellValue); return s ? (s.length >= 10 ? s.slice(0, 10) : s) : '-'; } },
  {
    title: '状态',
    field: 'status',
    minWidth: 100,
    align: 'center',
    sortable: true,
    slots: { default: 'status' },
  },
  {
    title: '操作',
    field: 'action',
    width: 260,
    align: 'center',
    fixed: 'right',
    slots: { default: 'action' },
  },
]);

onMounted(() => {
  onRefresh();
});
</script>

<template>
  <HsePageLayout
    :description="$t('page.hse.siteViolationDesc')"
    :title="$t('page.hse.siteViolation')"
  >
    <template #extra>
      <HseActionBar
        :actions="actionState"
        @refresh="onRefresh"
        @download-template="onImportTemplate"
        @import="() => (importOpen = true)"
        @export="onExport"
        @create="openCreate"
      />
    </template>

    <!-- 统计卡 + 统计分析入口（辅助能力，独立于标准工具栏） -->
    <div class="mb-4">
      <div class="mb-3 flex items-center justify-between">
        <div class="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-4">
          <NCard v-for="s in statItems" :key="s.key" :bordered="false">
            <NStatistic :label="s.label" :value="s.value" />
          </NCard>
        </div>
      </div>
      <NSpace justify="end">
        <NButton size="small" secondary @click="openStatsModal">统计分析</NButton>
      </NSpace>
    </div>

    <!-- 搜索 -->
    <HseSearchPanel @query="onSearch" @reset="onReset">
      <NGi>
        <NInput
          v-model:value="searchForm.keyword"
          placeholder="搜索违章描述 / 违章人员"
          clearable
          @keyup.enter="onSearch"
        />
      </NGi>
      <NGi>
        <NSelect
          v-model:value="searchForm.violationType"
          placeholder="三违类型"
          clearable
          :options="VIOLATION_TYPE_OPTIONS"
        />
      </NGi>
      <NGi>
        <NSelect
          v-model:value="searchForm.areaTeam"
          placeholder="分组名称"
          clearable
          filterable
          :options="filterOptions.areaTeams.map((v) => ({ label: v, value: v }))"
        />
      </NGi>
      <NGi>
        <NSelect
          v-model:value="searchForm.gridLevel"
          placeholder="网格等级"
          clearable
          :options="filterOptions.gridLevels.map((v) => ({ label: v, value: v }))"
        />
      </NGi>
      <NGi>
        <NDatePicker
          v-model:value="dateRange"
          type="daterange"
          clearable
          placeholder="违章日期范围"
          style="width: 100%"
          @update:value="onDateRangeChange"
        />
      </NGi>
      <NGi>
        <NSelect
          v-model:value="searchForm.checkSource"
          placeholder="查处来源"
          clearable
          :options="CHECK_SOURCE_OPTIONS"
        />
      </NGi>
    </HseSearchPanel>

    <!-- 批量删除 -->
    <NSpace class="mb-2" justify="end">
      <NPopconfirm @positive-click="onBatchDelete">
        <template #trigger>
          <NButton type="error" secondary>批量删除</NButton>
        </template>
        删除前请先勾选记录；确定删除选中的记录吗？
      </NPopconfirm>
    </NSpace>

    <!-- 表格 -->
    <HseDataGrid
      ref="gridRef"
      :columns="columns"
      :data="data"
      :loading="loading"
      :pager="true"
      :total="total"
      @page-change="onPageChange"
      @sort-change="onSortChange"
    >
      <template #status="{ row }">
        <HseStatusTag :type="STATUS_TAG[row.status] || 'neutral'">
          {{ row.status || '-' }}
        </HseStatusTag>
      </template>
      <template #checkSource="{ row }">
        <NTag
          v-if="row.checkSource"
          size="small"
          :bordered="false"
          :type="CHECK_SOURCE_TAG[row.checkSource] || 'default'"
        >
          {{ CHECK_SOURCE_TEXT[row.checkSource] || row.checkSource }}
        </NTag>
        <span v-else style="opacity: 0.45">未标注</span>
      </template>
      <template #action="{ row }">
        <NSpace justify="center" :size="4">
          <NButton size="tiny" type="primary" quaternary @click="openView(row)">查看</NButton>
          <NButton size="tiny" type="primary" quaternary @click="openEdit(row)">编辑</NButton>
          <NButton size="tiny" type="primary" quaternary @click="openView(row)">三违记录</NButton>
          <NPopconfirm @positive-click="onDelete(row)">
            <template #trigger>
              <NButton size="tiny" type="error" quaternary>删除</NButton>
            </template>
            确定删除该违章记录吗？
          </NPopconfirm>
          <NButton
            v-if="row.status === '待处理' || row.status === '整改中'"
            size="tiny"
            type="warning"
            quaternary
            @click="openRectify(row)"
          >
            整改
          </NButton>
          <NButton v-if="row.status === '待复查'" size="tiny" type="primary" quaternary @click="openReview(row)">
            复查
          </NButton>
        </NSpace>
      </template>
    </HseDataGrid>

    <!-- 详情抽屉 -->
    <NDrawer v-model:show="detailDrawerVisible" :width="560">
      <NDrawerContent v-if="currentViolation" :title="`违章详情 #${currentViolation.id}`">
        <NDescriptions :column="1" bordered label-placement="left">
          <NDescriptionsItem label="三违类型">
            <HseStatusTag :type="TYPE_TAG[currentViolation.violationType] || 'neutral'">
              {{ currentViolation.violationType }}
            </HseStatusTag>
          </NDescriptionsItem>
          <NDescriptionsItem label="严重程度">
            <HseStatusTag :type="LEVEL_TAG[currentViolation.violationLevel] || 'neutral'">
              {{ currentViolation.violationLevel }}
            </HseStatusTag>
          </NDescriptionsItem>
          <NDescriptionsItem label="状态">
            <HseStatusTag :type="STATUS_TAG[currentViolation.status] || 'neutral'">
              {{ currentViolation.status }}
            </HseStatusTag>
          </NDescriptionsItem>
          <NDescriptionsItem label="违章描述">{{ currentViolation.description }}</NDescriptionsItem>
          <NDescriptionsItem label="违章地点">{{ currentViolation.location || '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="违章日期">{{ currentViolation.violationDate || '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="发生时间">{{ currentViolation.occurTime || '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="违章人姓名">{{ currentViolation.violatorName || '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="违章人性别">{{ currentViolation.violatorGender || '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="违章人年龄">
            {{ currentViolation.violatorAge ?? '-' }}
          </NDescriptionsItem>
          <NDescriptionsItem label="违章人身份证号">
            {{ currentViolation.violatorIdCard || '-' }}
          </NDescriptionsItem>
          <NDescriptionsItem label="检查人员">{{ currentViolation.inspectorName || '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="处理人员">{{ currentViolation.handlerName || '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="处罚人员">{{ currentViolation.punisherName || '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="所属岗位">{{ currentViolation.position || '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="分组名称">{{ currentViolation.areaTeam || '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="整改措施">{{ currentViolation.rectification || '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="复查结果">{{ currentViolation.reviewResult || '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="处罚类型">{{ currentViolation.punishmentType || '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="处罚金额">
            {{ currentViolation.punishmentAmount ?? '-' }}
          </NDescriptionsItem>
          <NDescriptionsItem label="是否需要复训">
            <HseStatusTag :type="currentViolation.needRetraining ? 'danger' : 'success'">
              {{ currentViolation.needRetraining ? '需要复训' : '无需复训' }}
            </HseStatusTag>
          </NDescriptionsItem>
          <NDescriptionsItem label="备注">{{ currentViolation.remark || '-' }}</NDescriptionsItem>
        </NDescriptions>
      </NDrawerContent>
    </NDrawer>

    <!-- 新增 / 编辑 弹窗 -->
    <NModal
      v-model:show="formOpen"
      :title="formMode === 'create' ? '新增违章' : '编辑违章'"
      preset="card"
      style="width: 680px; max-width: 92vw"
      :mask-closable="false"
    >
      <NForm label-placement="top">
        <div class="grid grid-cols-2 gap-x-4">
          <NFormItem label="三违类型" required>
            <NSelect v-model:value="formModel.violationType" :options="VIOLATION_TYPE_OPTIONS" />
          </NFormItem>
          <NFormItem label="严重程度" required>
            <NSelect v-model:value="formModel.violationLevel" :options="LEVEL_OPTIONS" />
          </NFormItem>
          <NFormItem label="风险等级">
            <NSelect v-model:value="formModel.riskLevel" :options="RISK_OPTIONS" />
          </NFormItem>
          <NFormItem label="状态">
            <NSelect v-model:value="formModel.status" :options="STATUS_OPTIONS" />
          </NFormItem>
          <NFormItem label="违章日期" required>
            <NInput v-model:value="formModel.violationDate" placeholder="YYYY-MM-DD" />
          </NFormItem>
          <NFormItem label="发生时间">
            <NInput v-model:value="formModel.occurTime" placeholder="HH:mm:ss（选填）" />
          </NFormItem>
          <NFormItem label="违章地点">
            <NInput v-model:value="formModel.location" placeholder="选填" />
          </NFormItem>
          <NFormItem label="违章人身份证号">
            <NInput v-model:value="formModel.violatorIdCard" placeholder="选填" />
          </NFormItem>
          <!-- 阶段2a：查处来源（默认空=未标注；公司查处阶段3 计 5 分/次，其余 1 分/次） -->
          <NFormItem label="查处来源">
            <NSelect
              v-model:value="formModel.checkSource"
              placeholder="未标注"
              clearable
              :options="CHECK_SOURCE_OPTIONS"
            />
          </NFormItem>
          <NFormItem label="违章人员">
            <NSelect
              v-model:value="formModel.violatorId"
              placeholder="选择违章人员"
              clearable
              filterable
              :options="employeeOptions"
              @search="searchEmployees"
            />
          </NFormItem>
          <NFormItem label="违章人姓名（兜底）">
            <NInput v-model:value="formModel.violatorName" placeholder="未选择人员时可填写姓名" />
          </NFormItem>
          <NFormItem label="检查人员">
            <NSelect
              v-model:value="formModel.inspectorId"
              placeholder="选择检查人员"
              clearable
              filterable
              :options="employeeOptions"
              @search="searchEmployees"
            />
          </NFormItem>
          <NFormItem label="处理人员">
            <NSelect
              v-model:value="formModel.handlerId"
              placeholder="选择处理人员"
              clearable
              filterable
              :options="employeeOptions"
              @search="searchEmployees"
            />
          </NFormItem>
          <NFormItem label="处罚人员">
            <NSelect
              v-model:value="formModel.punisherId"
              placeholder="选择处罚人员"
              clearable
              filterable
              :options="employeeOptions"
              @search="searchEmployees"
            />
          </NFormItem>
          <NFormItem label="处罚类型">
            <NInput v-model:value="formModel.punishmentType" placeholder="选填" />
          </NFormItem>
          <NFormItem label="处罚金额">
            <NInputNumber
              v-model:value="formModel.punishmentAmount"
              :min="0"
              placeholder="选填"
              style="width: 100%"
            />
          </NFormItem>
          <NFormItem label="是否需要复训">
            <NSwitch v-model:value="formModel.needRetraining" />
          </NFormItem>
        </div>
        <NFormItem label="违章描述" required>
          <NInput
            v-model:value="formModel.description"
            type="textarea"
            :rows="2"
            placeholder="请输入违章描述"
          />
        </NFormItem>
        <NFormItem label="整改措施">
          <NInput v-model:value="formModel.rectification" type="textarea" :rows="2" placeholder="选填" />
        </NFormItem>
        <NFormItem label="备注">
          <NInput v-model:value="formModel.remark" type="textarea" :rows="2" placeholder="选填" />
        </NFormItem>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="formOpen = false">关闭</NButton>
          <NButton type="primary" :loading="formLoading" @click="onSubmit">保存</NButton>
        </NSpace>
      </template>
    </NModal>

    <!-- 整改弹窗（处理人员选择，handlerId 必填） -->
    <NModal
      v-model:show="rectifyOpen"
      title="违章整改"
      preset="card"
      style="width: 520px; max-width: 92vw"
      :mask-closable="false"
    >
      <NForm label-placement="top">
        <NFormItem label="处理人员" required>
          <NSelect
            v-model:value="rectifyForm.handlerId"
            placeholder="选择处理人员"
            clearable
            filterable
            :options="employeeOptions"
            @search="searchEmployees"
          />
        </NFormItem>
        <NFormItem label="整改措施" required>
          <NInput
            v-model:value="rectifyForm.rectification"
            type="textarea"
            :rows="3"
            placeholder="请输入整改措施"
          />
        </NFormItem>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="rectifyOpen = false">取消</NButton>
          <NButton type="primary" :loading="rectifyLoading" @click="onRectifySave">提交整改</NButton>
        </NSpace>
      </template>
    </NModal>

    <!-- 复查弹窗 -->
    <NModal
      v-model:show="reviewOpen"
      title="违章复查"
      preset="card"
      style="width: 520px; max-width: 92vw"
      :mask-closable="false"
    >
      <NForm label-placement="top">
        <NFormItem label="复查结果" required>
          <NSelect
            v-model:value="reviewForm.reviewResult"
            :options="[
              { label: '通过', value: '通过' },
              { label: '不通过', value: '不通过' },
            ]"
          />
        </NFormItem>
        <NFormItem label="备注">
          <NInput v-model:value="reviewForm.remark" type="textarea" :rows="2" placeholder="选填" />
        </NFormItem>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="reviewOpen = false">取消</NButton>
          <NButton type="primary" :loading="reviewLoading" @click="onReviewSave">提交复查</NButton>
        </NSpace>
      </template>
    </NModal>

    <!-- 统计分析弹窗（4 页签：员工三违次数 / 高风险人员 / 部门排行 / 岗位排行） -->
    <NModal
      v-model:show="statsModalOpen"
      title="三违统计分析"
      preset="card"
      style="width: 860px; max-width: 94vw"
      :mask-closable="false"
    >
      <NTabs v-model:value="statsTab" type="card">
        <NTabPane name="employee" tab="员工三违次数">
          <HseDataGrid
            :columns="[
              { title: '排名', field: 'rank', width: 70, align: 'center', formatter: (p: any) => (p?.rowIndex ?? 0) + 1 },
              { title: '员工姓名', field: 'employeeName', minWidth: 140, align: 'center' },
              { title: '员工ID', field: 'employeeId', width: 90, align: 'center' },
              { title: '三违次数', field: 'violationCount', width: 100, align: 'center' },
            ]"
            :data="employeeViolationCount"
            :loading="statsLoading"
            :pager="false"
          />
        </NTabPane>
        <NTabPane name="highRisk" tab="高风险人员">
          <HseDataGrid
            :columns="[
              { title: '排名', field: 'rank', width: 70, align: 'center', formatter: (p: any) => (p?.rowIndex ?? 0) + 1 },
              { title: '员工姓名', field: 'employeeName', minWidth: 140, align: 'center' },
              { title: '员工ID', field: 'employeeId', width: 90, align: 'center' },
              { title: '高风险次数', field: 'highRiskCount', width: 110, align: 'center' },
            ]"
            :data="highRiskEmployees"
            :loading="statsLoading"
            :pager="false"
          />
        </NTabPane>
        <NTabPane name="department" tab="部门排行">
          <HseDataGrid
            :columns="[
              { title: '排名', field: 'rank', width: 70, align: 'center', formatter: (p: any) => (p?.rowIndex ?? 0) + 1 },
              { title: '部门', field: 'department', minWidth: 200, align: 'center' },
              { title: '三违次数', field: 'violationCount', width: 100, align: 'center' },
            ]"
            :data="departmentRanking"
            :loading="statsLoading"
            :pager="false"
          />
        </NTabPane>
        <NTabPane name="position" tab="岗位排行">
          <HseDataGrid
            :columns="[
              { title: '排名', field: 'rank', width: 70, align: 'center', formatter: (p: any) => (p?.rowIndex ?? 0) + 1 },
              { title: '岗位', field: 'position', minWidth: 200, align: 'center' },
              { title: '三违次数', field: 'violationCount', width: 100, align: 'center' },
            ]"
            :data="positionRanking"
            :loading="statsLoading"
            :pager="false"
          />
        </NTabPane>
      </NTabs>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="statsModalOpen = false">关闭</NButton>
        </NSpace>
      </template>
    </NModal>

    <!-- 通用导入（violation 模块） -->
    <HseImportDialog
      v-model:open="importOpen"
      title="导入三违记录"
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
