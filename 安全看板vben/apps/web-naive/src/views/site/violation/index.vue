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
  NAlert,
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
  NImage,
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
  getViolationEvidenceChain,
  getViolationFilterOptions,
  getViolationList,
  getViolationStats,
  rectifyViolation,
  reviewViolation,
  updateViolation,
  type ViolationApi,
  type ViolationEvidenceChain,
} from '#/api/hse/violations';
import { getEmployeeSelectorBatch, getEmployeeSelectorList } from '#/api/hse/employee';
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
//   company=公司检查（E-08-04 冻结口径：company 来源触发 GRIDVIOL001 责任传递，扣分由后端规则引擎计算）
//   / township=乡镇查处 / self=自查自纠 / 空=未标注
// E-09：company 前端显示文案统一为「公司检查」（枚举值不变，仍为 'company'）
const CHECK_SOURCE_OPTIONS: { label: string; value: ViolationApi.CheckSource }[] = [
  { label: '公司检查', value: 'company' },
  { label: '乡镇查处', value: 'township' },
  { label: '自查自纠', value: 'self' },
];
const CHECK_SOURCE_TEXT: Record<string, string> = {
  company: '公司检查',
  township: '乡镇查处',
  self: '自查自纠',
};
/** 列表列展示配色：公司检查最醒目，未标注为灰 */
const CHECK_SOURCE_TAG: Record<string, 'error' | 'warning' | 'default' | 'info'> = {
  company: 'error',
  township: 'warning',
  self: 'info',
};

// ===== E-08-02：扣分状态（服务端派生七态，标签文案与后端 DEDUCTION_STATUS_LABELS 一致） =====
const DEDUCTION_STATUS_OPTIONS: { label: string; value: ViolationApi.DeductionStatus }[] = [
  { label: '已扣分', value: 'deducted' },
  { label: '应扣未扣', value: 'pending_deduct' },
  { label: '不扣分', value: 'no_deduct' },
  { label: '身份未解析', value: 'unresolved' },
  { label: '待核验', value: 'pending_review' },
  { label: '已撤销', value: 'revoked' },
  { label: '历史正式记录', value: 'history' },
];
const DEDUCTION_STATUS_TEXT: Record<string, string> = Object.fromEntries(
  DEDUCTION_STATUS_OPTIONS.map((o) => [o.value, o.label]),
);
const DEDUCTION_STATUS_TAG: Record<string, 'success' | 'warning' | 'error' | 'default' | 'info'> = {
  deducted: 'success',
  pending_deduct: 'warning',
  no_deduct: 'info',
  unresolved: 'warning',
  pending_review: 'warning',
  revoked: 'error',
  history: 'default',
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
  // E-08-01：记录来源（正式字段 source_type 白名单两态）+ 含已撤销
  sourceType: undefined as 'grid_candidate' | 'history' | undefined,
  includeDeleted: false,
  // E-08-02：扣分状态筛选（服务端白名单七态）
  deductionStatus: undefined as ViolationApi.DeductionStatus | undefined,
});
// E-08-01：记录来源下拉（A=网格候选确认 / B=历史正式）
const SOURCE_TYPE_OPTIONS = [
  { label: '网格候选确认', value: 'grid_candidate' },
  { label: '历史正式', value: 'history' },
];
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
      sourceType: searchForm.sourceType,
      includeDeleted: searchForm.includeDeleted ? '1' : undefined,
      deductionStatus: searchForm.deductionStatus,
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
    areaTeamOptions.value = (res.areaTeams ?? []).map((a: string) => ({ label: a, value: a }));
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
  searchForm.sourceType = undefined;
  searchForm.includeDeleted = false;
  searchForm.deductionStatus = undefined;
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
// E-09：选择器原始信息（姓名/性别/组织/作业单元/岗位），用于违规人员只读信息回显。
// 身份一律以 employee.id 为准（禁止姓名/nickname/WPS Creator/area_team 推断）。
type EmployeeSelectorRow = {
  employee_id: number;
  employee_code?: string;
  name: string;
  gender?: string;
  org_name?: string;
  unit_name?: string;
  position_name?: string;
};
const employeeInfoMap = ref<Map<number, EmployeeSelectorRow>>(new Map());
const areaTeamOptions = ref<{ label: string; value: string }[]>([]);
function resolveEmployeeId(e: any): number {
  return Number(e?.employee_id ?? e?.id ?? e?.value ?? 0);
}
async function searchEmployees(keyword: string) {
  try {
    const res = (await getEmployeeSelectorList({ keyword: keyword || undefined, limit: 30 })) ?? [];
    const nextMap = new Map(employeeInfoMap.value);
    for (const e of res as any[]) {
      const id = resolveEmployeeId(e);
      if (id > 0) nextMap.set(id, e as EmployeeSelectorRow);
    }
    employeeInfoMap.value = nextMap;
    employeeOptions.value = res.map((e: any) => ({
      label: `${e.name ?? e.label ?? ''}（${e.employee_code ?? e.id ?? ''}）`,
      value: resolveEmployeeId(e),
    }));
  } catch {
    employeeOptions.value = [];
  }
}
// E-09：编辑/查看模式下回显未在当前搜索结果中的人员信息
async function ensureEmployeeInfo(ids: number[]) {
  const missing = ids.filter((id) => id > 0 && !employeeInfoMap.value.has(id));
  if (!missing.length) return;
  try {
    const res = (await getEmployeeSelectorBatch(missing)) ?? [];
    const nextMap = new Map(employeeInfoMap.value);
    for (const e of res as any[]) {
      const id = resolveEmployeeId(e);
      if (id > 0) nextMap.set(id, e as EmployeeSelectorRow);
    }
    employeeInfoMap.value = nextMap;
  } catch {
    /* 回显失败不阻塞表单 */
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
  // E-08-08：三违行为（具体项目，与历史台账 violation_behavior 同字段；
  // 三违扣分由服务端责任解析及规则配置计算（分值以规则库配置为准），
  // 前端不做任何分值计算，仅展示服务端返回的实际扣分结果）
  violationBehavior: '',
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
  // E-09：检查区域（复用后端 filter-options.areaTeams，不重建 area_team 逻辑）
  areaTeam: '',
});

// E-09：违规人员只读信息（选择 employee 后展示，禁止手工修改身份信息）
const selectedViolatorInfo = computed(() => {
  const id = formModel.violatorId;
  if (!id) return null;
  return employeeInfoMap.value.get(id) ?? null;
});

function resetForm() {
  Object.assign(formModel, {
    violationType: '',
    violationLevel: '',
    riskLevel: '中',
    description: '',
    violationBehavior: '',
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
    areaTeam: '',
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
    violationBehavior: row.violationBehavior ?? '',
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
    areaTeam: row.areaTeam ?? '',
  });
  if (row.violatorId) {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    ensureEmployeeInfo([row.violatorId]);
  }
  formOpen.value = true;
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
        content: '检查来源未明确时，系统不会自动生成责任扣分（后端按检查来源有效性判定），请先确认检查来源。是否继续保存？',
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
      formOpen.value = false;
      onRefresh();
    } else {
      const created = await createViolation(payload);
      message.success('创建成功');
      formOpen.value = false;
      onRefresh();
      // E-09 §七：提交后进入「处理结果」——复用详情抽屉（含责任传递结果区域），
      // 展示后端计算结果，前端不自行计算扣分/责任对象。
      if (created && (created as ViolationApi.ViolationItem).id) {
        openView(created as ViolationApi.ViolationItem);
      }
    }
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

// E-09 §八：责任传递结果——责任对象（按 targetEmployeeName 去重，同 employee_id 只显示一次；
// 数据全部来自后端 evidence-chain 返回，前端不含任何业务规则/人员硬编码。
// 数据源优先 deductionStatusInfo.deductions（camelCase，网格候选域）；
// 手工创建记录（source_type=NULL）走 evidenceChain.deductions 原始行（snake_case）回退。）
const transmissionTargets = computed(() => {
  const ec = evidenceChain.value;
  if (!ec) return [];
  const infoRows = ec.deductionStatusInfo?.deductions ?? [];
  const rows = infoRows.length
    ? infoRows
    : (ec.deductions ?? []).map((d: any) => ({
        id: d.id,
        // 全局序列化为驼峰；snake_case 仅作旧后端兼容
        targetEmployeeName: d.targetEmployeeName ?? d.target_employee_name ?? null,
        cycleName: d.cycleName ?? d.cycle_name ?? null,
        confirmedScore: d.confirmedScore ?? d.confirmed_score,
        suggestedScore: d.suggestedScore ?? d.suggested_score,
        metricCode: d.metricCode ?? d.metric_code,
        deductionItem: d.deductionItem ?? d.deduction_item,
        isDeleted: !!(d.isDeleted ?? d.is_deleted),
      }));
  const seen = new Set<string>();
  const out: NonNullable<ViolationApi.DeductionStatusInfo['deductions']> = [];
  for (const d of rows) {
    if (!d || d.isDeleted) continue;
    const key = String(d.targetEmployeeName ?? `deduction-${d.id}`);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(d);
  }
  return out;
});
const failClosedNotice = computed(() => {
  const info = evidenceChain.value?.deductionStatusInfo;
  if (!info) return null;
  if (info.status === 'unresolved') {
    return { type: 'warning' as const, text: '未能确定责任对象，本次不产生扣分（fail-closed，不做身份猜测）。' };
  }
  if (info.status === 'no_deduct') {
    return { type: 'info' as const, text: '按当前检查来源规则，本事件不产生扣分。' };
  }
  if (info.status === 'pending_deduct') {
    return { type: 'warning' as const, text: '已满足扣分条件，等待评分周期运行后产生扣分；扣分对象以规则引擎计算结果为准。' };
  }
  return null;
});

// ===================== 详情抽屉 =====================
const detailDrawerVisible = ref(false);
const currentViolation = ref<ViolationApi.ViolationItem | null>(null);
// E-08-01：证据链（grid_candidate 行经结构化外键追溯 candidate→gir→deduction→audit）
const evidenceChain = ref<ViolationEvidenceChain | null>(null);
const evidenceChainLoading = ref(false);
function openView(row: ViolationApi.ViolationItem) {
  currentViolation.value = row;
  detailDrawerVisible.value = true;
  evidenceChain.value = null;
  evidenceChainLoading.value = true;
  getViolationEvidenceChain(row.id)
    .then((r) => (evidenceChain.value = r))
    .catch(() => (evidenceChain.value = null))
    .finally(() => (evidenceChainLoading.value = false));
}

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
  // E-08-01：记录来源（正式字段 source_type；禁弱字段猜测）
  {
    title: '记录来源',
    field: 'sourceType',
    minWidth: 110,
    align: 'center',
    slots: { default: 'sourceType' },
  },
  // E-08-01：扣分条数（deduction 关联计数）
  {
    title: '扣分',
    field: 'deductionCount',
    minWidth: 80,
    align: 'center',
    formatter: ({ cellValue }: any) =>
      cellValue == null ? '-' : Number(cellValue) > 0 ? `${cellValue} 条` : '0',
  },
  // E-08-02：扣分状态（服务端派生七态：已扣分/应扣未扣/不扣分/身份未解析/待核验/已撤销/历史正式记录）
  {
    title: '扣分状态',
    field: 'deductionStatus',
    minWidth: 110,
    align: 'center',
    slots: { default: 'deductionStatus' },
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
      <!-- E-08-01：记录来源（正式字段 source_type；禁弱字段猜测） -->
      <NGi>
        <NSelect
          v-model:value="searchForm.sourceType"
          placeholder="记录来源"
          clearable
          :options="SOURCE_TYPE_OPTIONS"
        />
      </NGi>
      <!-- E-08-01：含已撤销/软删记录 -->
      <NGi>
        <div class="flex items-center gap-2" style="height: 34px">
          <NSwitch v-model:value="searchForm.includeDeleted" size="small" />
          <span style="opacity: 0.7">含已撤销</span>
        </div>
      </NGi>
      <!-- E-08-02：扣分状态筛选（服务端派生七态） -->
      <NGi>
        <NSelect
          v-model:value="searchForm.deductionStatus"
          placeholder="扣分状态"
          clearable
          :options="DEDUCTION_STATUS_OPTIONS"
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
      <!-- E-08-01：记录来源（source_type='grid_candidate'=网格候选确认；NULL=历史正式） -->
      <template #sourceType="{ row }">
        <NTag v-if="row.sourceType === 'grid_candidate'" size="small" :bordered="false" type="success">
          网格候选确认
        </NTag>
        <NTag v-else size="small" :bordered="false">历史正式</NTag>
        <NTag v-if="row.isDeleted" size="small" type="error" :bordered="false" style="margin-left: 4px">
          已撤销
        </NTag>
      </template>
      <!-- E-08-02：扣分状态（服务端派生） -->
      <template #deductionStatus="{ row }">
        <NTag
          v-if="row.deductionStatus"
          size="small"
          :bordered="false"
          :type="DEDUCTION_STATUS_TAG[row.deductionStatus] || 'default'"
        >
          {{ DEDUCTION_STATUS_TEXT[row.deductionStatus] || row.deductionStatus }}
        </NTag>
        <span v-else style="opacity: 0.45">-</span>
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
          <!-- E-08-01：来源与追溯（正式字段，禁弱字段猜测） -->
          <NDescriptionsItem label="查处来源">
            {{ currentViolation.checkSource
              ? (CHECK_SOURCE_TEXT[currentViolation.checkSource] || currentViolation.checkSource)
              : '未标注' }}
          </NDescriptionsItem>
          <NDescriptionsItem label="记录来源">
            <NTag
              v-if="currentViolation.sourceType === 'grid_candidate'"
              size="small"
              :bordered="false"
              type="success"
            >
              网格候选确认
            </NTag>
            <span v-else>历史正式</span>
          </NDescriptionsItem>
          <NDescriptionsItem label="记录ID">#{{ currentViolation.id }}</NDescriptionsItem>
          <NDescriptionsItem label="原始记录ID">
            {{ currentViolation.sourceRecordId ?? '-' }}
          </NDescriptionsItem>
          <NDescriptionsItem label="候选ID">
            {{ currentViolation.candidateId ?? '-' }}
          </NDescriptionsItem>
          <NDescriptionsItem label="确认人ID">
            {{ currentViolation.confirmedBy ?? '-' }}
          </NDescriptionsItem>
          <NDescriptionsItem label="确认时间">
            {{ currentViolation.confirmedAt || '-' }}
          </NDescriptionsItem>
          <NDescriptionsItem label="是否已撤销">
            {{ currentViolation.isDeleted ? '已撤销（软删保留）' : '否' }}
          </NDescriptionsItem>
          <NDescriptionsItem label="扣分记录">
            {{ currentViolation.deductionCount != null ? `${currentViolation.deductionCount} 条` : '-' }}
          </NDescriptionsItem>
          <NDescriptionsItem v-if="currentViolation.imageContent" label="图片证据">
            <NImage
              :src="currentViolation.imageContent"
              width="160"
              style="border-radius: 4px"
            />
          </NDescriptionsItem>
        </NDescriptions>

        <!-- E-09 §八：责任传递结果（核心区域）
             链路：违规事件 → 责任解析（后端派生） → 责任对象 → 考核结果
             数据全部来自后端 evidence-chain（deductionStatusInfo / deductions），
             前端只做展示：不含扣分规则、不含 6702/16人名单/任何人员硬编码。 -->
        <div class="mb-2 mt-4 font-medium">责任传递结果</div>
        <div v-if="evidenceChainLoading" style="opacity: 0.6">加载中…</div>
        <template v-else-if="evidenceChain">
          <NDescriptions :column="1" bordered label-placement="left" size="small">
            <NDescriptionsItem label="违规事件">
              #{{ currentViolation.id }}｜
              {{ currentViolation.checkSource
                ? (CHECK_SOURCE_TEXT[currentViolation.checkSource] || currentViolation.checkSource)
                : '未标注' }}｜
              {{ currentViolation.violationDate || '-' }}｜
              {{ currentViolation.violatorName || '-' }}
              <template v-if="currentViolation.position">（{{ currentViolation.position }}）</template>
            </NDescriptionsItem>
            <NDescriptionsItem label="责任解析">
              <NTag
                size="small"
                :bordered="false"
                :type="evidenceChain.deductionStatusInfo
                  ? (DEDUCTION_STATUS_TAG[evidenceChain.deductionStatusInfo.status] || 'default')
                  : 'default'"
              >
                {{ evidenceChain.deductionStatusInfo?.label || '-' }}
              </NTag>
            </NDescriptionsItem>
          </NDescriptions>
          <NAlert
            v-if="failClosedNotice"
            :type="failClosedNotice.type"
            :bordered="false"
            class="mt-2"
          >
            {{ failClosedNotice.text }}
          </NAlert>
          <template v-if="transmissionTargets.length > 0">
            <div class="mb-1 mt-3" style="font-weight: 500">责任对象与考核结果（{{ transmissionTargets.length }} 人）</div>
            <NDescriptions
              v-for="t in transmissionTargets"
              :key="t.id"
              :column="1"
              bordered
              label-placement="left"
              size="small"
              class="mt-1"
            >
              <NDescriptionsItem label="考核对象">{{ t.targetEmployeeName || '-' }}</NDescriptionsItem>
              <NDescriptionsItem label="考核周期">{{ t.cycleName || '-' }}</NDescriptionsItem>
              <NDescriptionsItem label="扣分分值">
                {{ t.confirmedScore ?? t.suggestedScore ?? '-' }} 分
              </NDescriptionsItem>
              <NDescriptionsItem label="规则/扣分项">
                {{ t.metricCode || '-' }}<template v-if="t.deductionItem"> / {{ t.deductionItem }}</template>
              </NDescriptionsItem>
            </NDescriptions>
          </template>
          <div
            v-else-if="!failClosedNotice"
            class="mt-2"
            style="font-size: 12px; opacity: 0.6"
          >
            暂无责任对象与扣分记录。
          </div>
        </template>
        <div v-else style="opacity: 0.5">责任传递结果不可用（服务暂不可达，可稍后重试）</div>

        <!-- E-08-02：扣分状态说明（服务端由真实字段/结构化外键派生，全记录类型适用） -->
        <div class="mb-2 mt-4 font-medium">扣分状态说明</div>
        <div v-if="evidenceChainLoading" style="opacity: 0.6">加载中…</div>
        <template v-else-if="evidenceChain?.deductionStatusInfo">
          <NSpace align="center" :size="8" class="mb-1">
            <NTag
              size="small"
              :bordered="false"
              :type="DEDUCTION_STATUS_TAG[evidenceChain.deductionStatusInfo.status] || 'default'"
            >
              {{ evidenceChain.deductionStatusInfo.label }}
            </NTag>
            <span v-if="currentViolation.deductionTotalScore != null && Number(currentViolation.deductionTotalScore) > 0" style="opacity: 0.75">
              合计扣分：{{ currentViolation.deductionTotalScore }} 分
            </span>
          </NSpace>
          <div style="opacity: 0.8">{{ evidenceChain.deductionStatusInfo.explanation }}</div>
          <template v-if="(evidenceChain.deductionStatusInfo.deductions?.length ?? 0) > 0">
            <NDescriptions
              v-for="d in evidenceChain.deductionStatusInfo.deductions"
              :key="d.id"
              :column="1"
              bordered
              label-placement="left"
              size="small"
              class="mt-2"
            >
              <NDescriptionsItem label="扣分记录 ID">{{ d.id }}</NDescriptionsItem>
              <NDescriptionsItem label="扣分分值">
                {{ d.confirmedScore ?? d.suggestedScore ?? '-' }} 分
                <NTag v-if="d.isDeleted" size="tiny" type="error" :bordered="false" style="margin-left: 4px">已撤销（软删）</NTag>
                <NTag v-else size="tiny" type="success" :bordered="false" style="margin-left: 4px">有效</NTag>
              </NDescriptionsItem>
              <NDescriptionsItem label="评估对象">{{ d.targetEmployeeName || '-' }}</NDescriptionsItem>
              <NDescriptionsItem label="考核周期">{{ d.cycleName || '-' }}</NDescriptionsItem>
              <NDescriptionsItem label="扣分来源">{{ d.deductionSource ?? 'auto' }}（{{ d.metricCode || '-' }}）</NDescriptionsItem>
              <NDescriptionsItem label="产生时间">{{ d.createdAt || '-' }}</NDescriptionsItem>
            </NDescriptions>
          </template>
        </template>

        <!-- E-08-01：证据链（网格候选确认行：vr→candidate→gir→deduction→audit 结构化追溯） -->
        <template v-if="currentViolation.sourceType === 'grid_candidate'">
          <div class="mb-2 mt-4 font-medium">证据链追溯</div>
          <div v-if="evidenceChainLoading" style="opacity: 0.6">加载中…</div>
          <template v-else-if="evidenceChain">
            <NDescriptions :column="1" bordered label-placement="left" size="small">
              <NDescriptionsItem label="候选状态">
                {{ evidenceChain.candidate?.candidateStatus || '-' }}
                （{{ evidenceChain.candidate?.dictBehaviorName || evidenceChain.candidate?.behaviorText || '-' }}）
              </NDescriptionsItem>
              <NDescriptionsItem label="候选原始行为">
                {{ evidenceChain.candidate?.rawViolationBehavior || '-' }}
              </NDescriptionsItem>
              <NDescriptionsItem label="候选检查来源">
                {{ evidenceChain.candidate?.inspectionSource || '-' }}
              </NDescriptionsItem>
              <NDescriptionsItem label="原始巡查记录">
                #{{ evidenceChain.gridRecord?.id ?? evidenceChain.candidate?.gridRecordId ?? '-' }}
                <template v-if="evidenceChain.gridRecord">
                  ｜{{ evidenceChain.gridRecord.inspectionDate || '-' }}
                  ｜巡查人：{{ evidenceChain.gridRecord.personnelName || '-' }}
                  ｜片区：{{ evidenceChain.gridRecord.areaTeam || '-' }}
                  ｜网格：{{ evidenceChain.gridRecord.gridLevel || '-' }}
                </template>
              </NDescriptionsItem>
              <NDescriptionsItem v-if="evidenceChain.gridRecord?.imageContent" label="巡查图片">
                <NImage
                  :src="evidenceChain.gridRecord.imageContent"
                  width="160"
                  style="border-radius: 4px"
                />
              </NDescriptionsItem>
            </NDescriptions>
            <div class="mb-2 mt-4 font-medium">扣分记录（{{ evidenceChain.deductions?.length ?? 0 }}）</div>
            <NDescriptions
              v-for="(d, idx) in evidenceChain.deductions ?? []"
              :key="d.id as number"
              :column="1"
              bordered
              label-placement="left"
              size="small"
              class="mb-2"
              :title="`#${idx + 1}`"
            >
              <NDescriptionsItem label="扣分项">{{ d.deductionItem ?? '-' }}</NDescriptionsItem>
              <NDescriptionsItem label="确认扣分">{{ d.confirmedScore ?? d.suggestedScore ?? '-' }}</NDescriptionsItem>
              <NDescriptionsItem label="周期/指标">
                {{ d.cycleId ?? '-' }} / {{ d.metricCode ?? '-' }}
              </NDescriptionsItem>
              <NDescriptionsItem label="状态">{{ d.isDeleted ? '已撤销' : '有效' }}</NDescriptionsItem>
            </NDescriptions>
            <div v-if="!evidenceChain.deductions?.length" style="opacity: 0.5">无扣分记录</div>
            <div class="mb-2 mt-4 font-medium">审计记录（{{ evidenceChain.audits?.length ?? 0 }}）</div>
            <div
              v-for="(a, idx) in evidenceChain.audits ?? []"
              :key="a.id as number"
              class="mb-1"
              style="font-size: 12px; opacity: 0.8"
            >
              #{{ idx + 1 }} [{{ a.action }}] {{ a.tableName }}#{{ a.recordId }}
              · {{ a.username || '-' }} · {{ String(a.createdAt || '').slice(0, 19) }}
            </div>
            <div v-if="!evidenceChain.audits?.length" style="opacity: 0.5">无审计记录</div>
          </template>
          <div v-else style="opacity: 0.5">证据链不可用（记录可能为历史数据或服务暂不可达）</div>
        </template>
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
          <!-- E-08-08：三违行为（具体项目）。三违扣分由服务端责任解析及规则配置计算，
               前端仅展示服务端返回的实际扣分结果，只录入文本、不做任何分值计算 -->
          <NFormItem label="三违行为（具体项目）">
            <NInput
              v-model:value="formModel.violationBehavior"
              placeholder="如：骑车不戴头盔；多个项目用逗号分隔（选填）"
            />
          </NFormItem>
          <NFormItem label="违章地点">
            <NInput v-model:value="formModel.location" placeholder="选填" />
          </NFormItem>
          <!-- E-09 §五.6：检查区域（复用后端 filter-options.areaTeams 正式数据，不重建 area_team 逻辑） -->
          <NFormItem label="检查区域">
            <NSelect
              v-model:value="formModel.areaTeam"
              placeholder="选填"
              clearable
              :options="areaTeamOptions"
            />
          </NFormItem>
          <NFormItem label="违章人身份证号">
            <NInput v-model:value="formModel.violatorIdCard" placeholder="选填" />
          </NFormItem>
          <!-- E-08-08：查处来源为必填参考输入；后端按登录人正式身份（组织/岗位范围）
               权威判定公司检查 / 乡镇自查，前端标注不被直接信任。责任扣分由后端规则引擎决定 -->
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
          <!-- E-09 §五.3：选择 employee 后的只读身份信息（employee.id 为唯一业务身份，
               禁止手工修改；信息来自员工选择器正式数据，不含姓名猜测/area_team 推断） -->
          <NFormItem v-if="formModel.violatorId" label="违规人员身份信息（只读）">
            <div class="w-full rounded border border-neutral-200 px-3 py-2 text-xs leading-5" style="background: rgba(128,128,128,0.06)">
              <template v-if="selectedViolatorInfo">
                <div>姓名：{{ selectedViolatorInfo.name }}（#{{ selectedViolatorInfo.employee_id }}<template v-if="selectedViolatorInfo.employee_code"> / {{ selectedViolatorInfo.employee_code }}</template>）</div>
                <div>性别：{{ selectedViolatorInfo.gender || '—' }}　所属组织：{{ selectedViolatorInfo.org_name || '—' }}</div>
                <div>作业单元：{{ selectedViolatorInfo.unit_name || '—' }}　当前岗位：{{ selectedViolatorInfo.position_name || '—' }}</div>
              </template>
              <span v-else style="opacity: 0.5">身份信息加载中…</span>
            </div>
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
