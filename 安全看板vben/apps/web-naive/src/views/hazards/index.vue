<script lang="ts" setup>
/**
 * 隐患排查治理（web-naive）
 * 统计卡 + 主表模式；服务端分页 / 导入 / 导出 / 新增 / 编辑 / 删除
 */
import { computed, reactive, ref, onMounted, watch } from 'vue';
import {
  NButton,
  NCard,
  NDescriptions,
  NDescriptionsItem,
  NDrawer,
  NDrawerContent,
  NEmpty,
  NForm,
  NFormItem,
  NGi,
  NInput,
  NModal,
  NPopconfirm,
  NRadio,
  NRadioGroup,
  NSelect,
  NSpace,
  NStatistic,
  NTabPane,
  NTabs,
  NTag,
  NUpload,
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
  HAZARD_EXPIRY_LABEL as EXPIRY_LABEL,
  HAZARD_EXPIRY_TAG as EXPIRY_TAG,
  HAZARD_RISK_TAG as RISK_TAG,
  HAZARD_STATUS_LABEL as STATUS_LABEL,
  HAZARD_STATUS_TAG as STATUS_TAG,
} from '#/components/hse';
import type { VxeTableGridColumns } from '#/adapter/vxe-table';
import {
  closeHazard,
  createHazard,
  deleteHazard,
  deleteHazardAttachment,
  exportHazards,
  getHazardAttachments,
  getHazardList,
  getHazardStats,
  getHazardVersions,
  getHighRiskReminders,
  getOverdueReminders,
  getRelatedRisk,
  getResponsibleOverdueAnalysis,
  rectifyHazard,
  reviewHazard,
  submitReviewHazard,
  updateHazard,
  uploadHazardAttachment,
  type HazardApi,
  type HazardAttachment,
  type HazardVersionRecord,
  type ResponsibleOverdueItem,
} from '#/api/hse/hazard';
import { lookupEmployees } from '#/api/hse/goals';
import { getEmployeeSelectorBatch } from '#/api/hse/employee';
import { useGenericImport } from '#/views/hse/_shared/useGenericImport';
import { message } from '#/adapter/naive';
import { useRouter } from 'vue-router';
import { IconifyIcon } from '@vben/icons';

defineOptions({ name: 'HazardsList' });

// ===================== 工具函数 =====================
function formatDate(date?: string | null): string {
  if (!date) return '-';
  try {
    const d = new Date(date);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  } catch {
    return date;
  }
}

function todayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

// ===================== 枚举映射 =====================
const HAZARD_TYPE_OPTIONS = [
  { label: '设施设备', value: '设施设备' },
  { label: '作业环境', value: '作业环境' },
  { label: '管理体系', value: '管理体系' },
  { label: '人员行为', value: '人员行为' },
  { label: '其他', value: '其他' },
];

const RISK_LEVEL_OPTIONS = [
  { label: '重大', value: '重大' },
  { label: '一级', value: '一级' },
  { label: '二级', value: '二级' },
  { label: '三级', value: '三级' },
];

const STATUS_OPTIONS = [
  { label: '发现', value: 'discovered' },
  { label: '整改中', value: 'processing' },
  { label: '待复查', value: 'pending_review' },
  { label: '关闭', value: 'closed' },
];

// ===================== 列表数据 =====================
const loading = ref(false);
const data = ref<HazardApi.HazardItem[]>([]);
const total = ref(0);
const currentPage = ref(1);
const pageSize = ref(20);
const sortBy = ref<string | undefined>(undefined);
const sortOrder = ref<'asc' | 'desc' | undefined>(undefined);

const searchForm = reactive({
  keyword: '',
  hazardType: '' as string | null,
  riskLevel: '' as string | null,
  status: '' as string | null,
});

async function loadData() {
  loading.value = true;
  try {
    const params: HazardApi.HazardListParams = {
      page: currentPage.value,
      pageSize: pageSize.value,
      keyword: searchForm.keyword || undefined,
      hazardType: searchForm.hazardType || undefined,
      riskLevel: searchForm.riskLevel || undefined,
      status: searchForm.status || undefined,
      sortField: sortBy.value,
      sortOrder: sortOrder.value,
    };
    const res = await getHazardList(params);
    // 浅拷贝为可写对象，避免 vxe-table 在 row-key/列映射时尝试给 readonly Proxy 写入导致 [Vue warn] target is readonly
    data.value = (res.list ?? []).map((r) => ({ ...r }));
    total.value = res.total ?? 0;
  } catch {
    data.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
}

// ===================== 统计卡 =====================
const stats = reactive({
  total: 0,
  discovered: 0,
  processing: 0,
  pendingReview: 0,
  closed: 0,
  highRisk: 0,
  overdue: 0,
  byDepartment: [] as { departmentName: string; total: number }[],
  byPosition: [] as { positionName: string; total: number }[],
  byRegion: [] as { region: string; total: number }[],
  repeatedHazards: [] as {
    description: string;
    repeatCount: number;
    firstDiscovered: string;
    lastDiscovered: string;
  }[],
});

async function loadStats() {
  try {
    const s = await getHazardStats();
    stats.total = s.total ?? 0;
    stats.discovered = s.discovered ?? s.unresolved ?? 0;
    stats.processing = s.processing ?? 0;
    stats.pendingReview = s.pendingReview ?? 0;
    stats.closed = s.closed ?? s.resolved ?? 0;
    stats.highRisk = s.highRiskCount ?? 0;
    stats.overdue = s.overdueCount ?? 0;
    stats.byDepartment = (s.byDepartment ?? []).map((d, i) => ({ id: i + 1, ...d }));
    stats.byPosition = (s.byPosition ?? []).map((d, i) => ({ id: i + 1, ...d }));
    stats.byRegion = (s.byRegion ?? []).map((d, i) => ({ id: i + 1, ...d }));
    stats.repeatedHazards = s.repeatedHazards ?? [];
  } catch {
    // ignore
  }
}

function onStatCardClick(filter: { status?: string; riskLevel?: string }) {
  searchForm.keyword = '';
  searchForm.hazardType = null;
  searchForm.status = filter.status ?? null;
  searchForm.riskLevel = filter.riskLevel ?? null;
  onSearch();
}

// ===================== 搜索 =====================
function onSearch() {
  currentPage.value = 1;
  loadData();
}
function onReset() {
  searchForm.keyword = '';
  searchForm.hazardType = null;
  searchForm.riskLevel = null;
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
} = useGenericImport('hazards');
bindImportRefresh(onRefresh);

async function onRefresh() {
  await Promise.all([loadData(), loadStats()]);
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

async function onExport() {
  try {
    const blob = await exportHazards();
    triggerDownload(blob, `隐患清单_${todayStr()}.csv`);
    message.success('导出成功');
  } catch {
    message.error('导出失败');
  }
}

// ===================== 新增 / 编辑 / 查看 =====================
const formOpen = ref(false);
const formMode = ref<'create' | 'edit' | 'view'>('create');
const formLoading = ref(false);
const editingId = ref<number | null>(null);
const formModel = reactive<HazardApi.HazardFormData>({
  description: '',
  measure: '',
  hazardType: '',
  riskLevel: '',
  location: '',
  checkDate: '',
  fixDate: null,
  rectification: '',
  deadlineDays: 30,
  remark: '',
});

function resetForm() {
  formModel.description = '';
  formModel.measure = '';
  formModel.hazardType = '';
  formModel.riskLevel = '';
  formModel.location = '';
  formModel.checkDate = '';
  formModel.fixDate = null;
  formModel.rectification = '';
  formModel.deadlineDays = 30;
  formModel.remark = '';
}

function openCreate() {
  resetForm();
  formMode.value = 'create';
  editingId.value = null;
  formOpen.value = true;
}
function openEdit(row: HazardApi.HazardItem) {
  resetForm();
  formMode.value = 'edit';
  editingId.value = row.id;
  Object.assign(formModel, {
    description: row.description,
    measure: row.measure ?? '',
    hazardType: row.hazardType ?? '',
    riskLevel: row.riskLevel ?? '',
    location: row.location ?? '',
    checkDate: row.checkDate ?? '',
    fixDate: row.fixDate ?? null,
    rectification: row.rectification ?? '',
    deadlineDays: row.deadlineDays ?? 30,
    remark: row.remark ?? '',
  });
  formOpen.value = true;
}

async function onSubmit() {
  if (!formModel.description) {
    message.warning('隐患描述不能为空');
    return;
  }
  formLoading.value = true;
  try {
    if (formMode.value === 'edit' && editingId.value != null) {
      await updateHazard(editingId.value, { ...formModel });
      message.success('编辑成功');
    } else {
      await createHazard({ ...formModel });
      message.success('新增成功');
    }
    formOpen.value = false;
    onRefresh();
  } catch {
    // 拦截器已提示
  } finally {
    formLoading.value = false;
  }
}

async function onDelete(row: HazardApi.HazardItem) {
  try {
    await deleteHazard(row.id);
    message.success('删除成功');
    onRefresh();
  } catch {
    // 拦截器已提示
  }
}

// ===================== 员工远程检索（复用 responsibility lookupEmployees 模式，保持员工 ID/编号/姓名关联语义） =====================
const employeeOptions = ref<Awaited<ReturnType<typeof lookupEmployees>>>([]);
const empLoading = ref(false);
const employeeSelectOptions = computed(() =>
  employeeOptions.value.map((o) => ({
    value: o.employeeId,
    label: `${o.employeeCode} - ${o.name}${o.department ? `（${o.department}）` : ''}`,
  })),
);

async function handleEmpSearch(keyword: string) {
  if (!keyword) {
    employeeOptions.value = [];
    return;
  }
  empLoading.value = true;
  try {
    employeeOptions.value = await lookupEmployees(keyword);
  } catch {
    employeeOptions.value = [];
  } finally {
    empLoading.value = false;
  }
}

function todayDash(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ===================== 整改流转（discovered → processing → pending_review → (pass|fail) → closed） =====================
const router = useRouter();

const rectifyModalVisible = ref(false);
const rectifyLoading = ref(false);
const rectifyTargetId = ref<number | null>(null);
const rectifyForm = reactive({
  correctorId: undefined as number | undefined,
  rectification: '',
  rectifyDate: '',
});

function openRectify(row: HazardApi.HazardItem) {
  rectifyTargetId.value = row.id;
  rectifyForm.correctorId = row.correctorId ?? undefined;
  rectifyForm.rectification = '';
  rectifyForm.rectifyDate = todayDash();
  rectifyModalVisible.value = true;
}

async function onConfirmRectify() {
  if (!rectifyTargetId.value) return;
  if (!rectifyForm.rectification) {
    message.warning('请输入整改结果');
    return;
  }
  rectifyLoading.value = true;
  try {
    await rectifyHazard(rectifyTargetId.value, {
      correctorId: rectifyForm.correctorId,
      rectification: rectifyForm.rectification,
      rectifyDate: rectifyForm.rectifyDate || undefined,
    });
    message.success('整改提交成功');
    rectifyModalVisible.value = false;
    onRefresh();
  } catch {
    // 拦截器已提示
  } finally {
    rectifyLoading.value = false;
  }
}

async function onSubmitReview(row: HazardApi.HazardItem) {
  try {
    await submitReviewHazard(row.id);
    message.success('提交复查成功');
    onRefresh();
  } catch {
    // 拦截器已提示
  }
}

const reviewModalVisible = ref(false);
const reviewLoading = ref(false);
const reviewTargetId = ref<number | null>(null);
const reviewForm = reactive({
  reviewerId: undefined as number | undefined,
  reviewResult: 'pass' as 'pass' | 'fail',
  reviewNote: '',
  reviewDate: '',
});

function openReview(row: HazardApi.HazardItem) {
  reviewTargetId.value = row.id;
  reviewForm.reviewerId = row.reviewerId ?? undefined;
  reviewForm.reviewResult = 'pass';
  reviewForm.reviewNote = '';
  reviewForm.reviewDate = todayDash();
  reviewModalVisible.value = true;
}

async function onConfirmReview() {
  if (!reviewTargetId.value) return;
  reviewLoading.value = true;
  try {
    await reviewHazard(reviewTargetId.value, {
      reviewerId: reviewForm.reviewerId,
      reviewResult: reviewForm.reviewResult,
      reviewNote: reviewForm.reviewNote || undefined,
      reviewDate: reviewForm.reviewDate || undefined,
    });
    message.success(
      reviewForm.reviewResult === 'pass' ? '复查合格，隐患已关闭' : '复查不合格，重新整改',
    );
    reviewModalVisible.value = false;
    onRefresh();
  } catch {
    // 拦截器已提示
  } finally {
    reviewLoading.value = false;
  }
}

const closeModalVisible = ref(false);
const closeLoading = ref(false);
const closeTargetId = ref<number | null>(null);
const closeForm = reactive({ closeNote: '' });

function openClose(row: HazardApi.HazardItem) {
  closeTargetId.value = row.id;
  closeForm.closeNote = '';
  closeModalVisible.value = true;
}

async function onConfirmClose() {
  if (!closeTargetId.value) return;
  closeLoading.value = true;
  try {
    await closeHazard(closeTargetId.value, { closeNote: closeForm.closeNote || undefined });
    message.success('隐患关闭成功');
    closeModalVisible.value = false;
    onRefresh();
  } catch {
    // 拦截器已提示
  } finally {
    closeLoading.value = false;
  }
}

// ===================== 详情抽屉（基本信息 + 关联风险 + 附件 + 版本履历） =====================
const detailDrawerVisible = ref(false);
const currentHazard = ref<HazardApi.HazardItem | null>(null);
const detailActiveTab = ref('info');
const relatedRisk = ref<HazardApi.RelatedRisk | null>(null);
const relatedRiskLoading = ref(false);
const attachmentList = ref<HazardAttachment[]>([]);
const attachmentLoading = ref(false);
const versionList = ref<HazardVersionRecord[]>([]);
const versionLoading = ref(false);
const employeeNameMap = ref<Record<number, string>>({});

/** 员工 ID → 姓名批量回显（详情抽屉） */
async function resolveEmployeeNames(ids: (number | null | undefined)[]) {
  const uniq = Array.from(
    new Set(ids.filter((x): x is number => typeof x === 'number' && x > 0)),
  );
  if (!uniq.length) return;
  try {
    const res = await getEmployeeSelectorBatch(uniq);
    const map: Record<number, string> = {};
    (res || []).forEach((e) => {
      map[e.employee_id] = e.name;
    });
    employeeNameMap.value = { ...employeeNameMap.value, ...map };
  } catch {
    // 回显失败不阻断（兜底显示 fallback）
  }
}

function empName(id?: number | null, fallback?: string | null): string {
  if (id && employeeNameMap.value[id]) return employeeNameMap.value[id];
  return fallback || '-';
}

function openView(row: HazardApi.HazardItem) {
  currentHazard.value = row;
  detailActiveTab.value = 'info';
  relatedRisk.value = null;
  attachmentList.value = [];
  versionList.value = [];
  detailDrawerVisible.value = true;
  fetchAttachments(row.id);
  fetchVersions(row.id);
  fetchRelatedRisk(row.id);
  resolveEmployeeNames([
    row.finderId,
    row.responsibleId,
    row.correctorId,
    row.reviewerId,
    (row as unknown as { checkerId?: number }).checkerId,
    (row as unknown as { fixerId?: number }).fixerId,
  ]);
}

async function fetchRelatedRisk(id: number) {
  relatedRiskLoading.value = true;
  try {
    relatedRisk.value = (await getRelatedRisk(id)) || null;
  } catch {
    relatedRisk.value = null;
  } finally {
    relatedRiskLoading.value = false;
  }
}

function handleNavigateToRisk(riskId: number) {
  if (!riskId) return;
  detailDrawerVisible.value = false;
  router.push({ path: '/risk/list', query: { highlightRiskId: String(riskId) } });
}

async function fetchAttachments(id: number) {
  attachmentLoading.value = true;
  try {
    attachmentList.value = (await getHazardAttachments(id)) || [];
  } catch {
    attachmentList.value = [];
  } finally {
    attachmentLoading.value = false;
  }
}

/** NUpload 自定义上传（naive-ui custom-request），与后端 uploadDocument.single('file') 对齐 */
function handleUploadRequest({
  file,
  onFinish,
  onError,
}: {
  file: { file?: File | null };
  onFinish: () => void;
  onError: () => void;
}) {
  const raw = file.file;
  if (!raw || !currentHazard.value) {
    onError();
    return;
  }
  if (raw.size / 1024 / 1024 >= 10) {
    message.error('文件大小不能超过 10MB');
    onError();
    return;
  }
  uploadHazardAttachment(currentHazard.value.id, raw, { uploadedBy: 'admin' })
    .then(() => {
      message.success('上传成功');
      fetchAttachments(currentHazard.value!.id);
      onFinish();
    })
    .catch(() => {
      message.error('上传失败');
      onError();
    });
}

function handleDownloadAttachment(record: HazardAttachment) {
  if (record.fileUrl) {
    window.open(record.fileUrl, '_blank');
  }
}

async function handleDeleteAttachment(record: HazardAttachment) {
  if (!currentHazard.value) return;
  try {
    await deleteHazardAttachment(currentHazard.value.id, record.id);
    message.success('删除成功');
    fetchAttachments(currentHazard.value.id);
  } catch {
    // 拦截器已提示
  }
}

async function fetchVersions(id: number) {
  versionLoading.value = true;
  try {
    versionList.value = (await getHazardVersions(id)) || [];
  } catch {
    versionList.value = [];
  } finally {
    versionLoading.value = false;
  }
}

function formatFileSize(bytes?: number): string {
  if (!bytes) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function formatDateTime(date?: string | null): string {
  if (!date) return '-';
  const d = new Date(date);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const CHANGE_TYPE_TAG: Record<string, 'success' | 'info' | 'warning' | 'error' | 'default'> = {
  create: 'success',
  update: 'info',
  import: 'warning',
  revise: 'warning',
  delete: 'error',
};
const CHANGE_TYPE_LABEL: Record<string, string> = {
  create: '新增',
  update: '更新',
  import: '导入',
  revise: '修订',
  delete: '删除',
};

// ===================== 统计分析抽屉（getHazardStats 增强字段） =====================
const showStatistics = ref(false);
const statisticsActiveTab = ref('overview');

// ===================== 隐患提醒抽屉 =====================
const showReminders = ref(false);
const reminderActiveTab = ref('highRisk');
const highRiskList = ref<HazardApi.HazardItem[]>([]);
const overdueList = ref<
  (HazardApi.HazardItem & { responsibleName?: string; overdueDays?: number })[]
>([]);
const responsibleOverdueList = ref<ResponsibleOverdueItem[]>([]);

async function fetchReminders() {
  try {
    const [hr, od, rs] = await Promise.all([
      getHighRiskReminders(),
      getOverdueReminders(),
      getResponsibleOverdueAnalysis(),
    ]);
    highRiskList.value = hr.list || [];
    overdueList.value = od.list || [];
    responsibleOverdueList.value = (rs.list || []).map((r, i) => ({
      id: r.responsibleId ?? i + 1,
      ...r,
    }));
  } catch {
    // 拦截器已提示
  }
}

watch(showReminders, (val) => {
  if (val) fetchReminders();
});

// ===================== 抽屉/Modal 表格列定义 =====================
const attachmentColumns = ref<VxeTableGridColumns>([
  { title: '文件名', field: 'originalName', minWidth: 180, align: 'left', showOverflow: 'tooltip', slots: { default: 'originalName' } },
  { title: '版本', field: 'version', width: 130, align: 'center', slots: { default: 'version' } },
  { title: '大小', field: 'fileSize', width: 90, align: 'center', slots: { default: 'fileSize' } },
  { title: '上传人', field: 'uploadedBy', width: 100, align: 'center' },
  { title: '操作', field: 'action', width: 120, align: 'center', slots: { default: 'action' } },
]);

const versionColumns = ref<VxeTableGridColumns>([
  { title: '版本号', field: 'version', width: 90, align: 'center' },
  { title: '变更类型', field: 'changeType', width: 90, align: 'center', slots: { default: 'changeType' } },
  { title: '变更说明', field: 'changeSummary', minWidth: 160, align: 'left', showOverflow: 'tooltip' },
  { title: '操作人', field: 'changedBy', width: 100, align: 'center' },
  { title: '变更时间', field: 'createdAt', width: 150, align: 'center', slots: { default: 'createdAt' } },
]);

function rankColumns(name: string): VxeTableGridColumns {
  return [
    { title: '排名', type: 'seq', width: 60, align: 'center' },
    { title: name, field: name === '部门' ? 'departmentName' : name === '岗位' ? 'positionName' : 'region', minWidth: 120, align: 'left' },
    { title: '隐患数', field: 'total', width: 100, align: 'center' },
  ];
}

const repeatedColumns = ref<VxeTableGridColumns>([
  { title: '隐患描述', field: 'description', minWidth: 200, align: 'left', showOverflow: 'tooltip' },
  { title: '重复次数', field: 'repeatCount', width: 90, align: 'center' },
  { title: '首次发现', field: 'firstDiscovered', width: 120, align: 'center' },
  { title: '最近发现', field: 'lastDiscovered', width: 120, align: 'center' },
]);

const highRiskColumns = ref<VxeTableGridColumns>([
  { title: '隐患描述', field: 'description', minWidth: 200, align: 'left', showOverflow: 'tooltip' },
  { title: '风险等级', field: 'riskLevel', width: 90, align: 'center', slots: { default: 'riskLevel' } },
  { title: '位置', field: 'location', width: 130, align: 'left', showOverflow: 'tooltip' },
  { title: '状态', field: 'status', width: 90, align: 'center', slots: { default: 'status' } },
]);

const overdueColumns = ref<VxeTableGridColumns>([
  { title: '隐患描述', field: 'description', minWidth: 200, align: 'left', showOverflow: 'tooltip' },
  { title: '责任人', field: 'responsibleName', width: 120, align: 'center' },
  { title: '超期天数', field: 'overdueDays', width: 100, align: 'center', slots: { default: 'overdueDays' } },
  { title: '状态', field: 'status', width: 90, align: 'center', slots: { default: 'status' } },
]);

const responsibleColumns = ref<VxeTableGridColumns>([
  { title: '责任人', field: 'responsibleName', minWidth: 120, align: 'left' },
  { title: '部门', field: 'department', width: 120, align: 'left', showOverflow: 'tooltip' },
  { title: '岗位', field: 'position', width: 120, align: 'left', showOverflow: 'tooltip' },
  { title: '隐患总数', field: 'totalHazards', width: 90, align: 'center' },
  { title: '已关闭', field: 'closedHazards', width: 90, align: 'center' },
  { title: '超期数', field: 'overdueHazards', width: 90, align: 'center', slots: { default: 'overdueHazards' } },
]);

// ===================== 表格列 =====================
const hazardColumns = ref<VxeTableGridColumns>([
  { title: '序号', field: '_index', type: 'seq', width: 60, align: 'center' },
  { title: '隐患描述', field: 'description', minWidth: 260, align: 'center', showOverflow: 'tooltip' },
  { title: '整改措施', field: 'measure', minWidth: 220, align: 'center', showOverflow: 'tooltip' },
  { title: '隐患位置', field: 'location', minWidth: 110, align: 'center', showOverflow: 'tooltip' },
  { title: '检查时间', field: 'checkDate', minWidth: 110, align: 'center', sortable: true, slots: { default: 'checkDate' } },
  { title: '整改期限(天)', field: 'deadlineDays', minWidth: 100, align: 'center' },
  { title: '到期提醒', field: 'expiryStatus', minWidth: 90, align: 'center', slots: { default: 'expiry' } },
  { title: '状态', field: 'status', minWidth: 80, align: 'center', sortable: true, slots: { default: 'status' } },
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
  loadData();
  loadStats();
});
</script>

<template>
  <HsePageLayout
    :description="$t('page.hse.hazardsDesc')"
    :title="$t('page.hse.hazards')"
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
      <NButton size="small" @click="showStatistics = true">
        <template #icon>
          <IconifyIcon icon="lucide:bar-chart-3" :size="16" />
        </template>
        统计分析
      </NButton>
      <NButton size="small" @click="showReminders = true">
        <template #icon>
          <IconifyIcon icon="lucide:bell" :size="16" />
        </template>
        隐患提醒
      </NButton>
    </template>

    <!-- 统计卡（点击可快速筛选） -->
    <div class="mb-4 grid grid-cols-3 gap-3 md:grid-cols-6">
      <NCard :bordered="false" class="cursor-pointer transition-shadow hover:shadow-md" @click="onStatCardClick({})">
        <NStatistic label="隐患总数" :value="stats.total" />
      </NCard>
      <NCard :bordered="false" class="cursor-pointer transition-shadow hover:shadow-md" @click="onStatCardClick({ status: 'discovered' })">
        <NStatistic label="待整改" :value="stats.discovered" />
      </NCard>
      <NCard :bordered="false" class="cursor-pointer transition-shadow hover:shadow-md" @click="onStatCardClick({ status: 'processing' })">
        <NStatistic label="整改中" :value="stats.processing" />
      </NCard>
      <NCard :bordered="false" class="cursor-pointer transition-shadow hover:shadow-md" @click="onStatCardClick({ status: 'pending_review' })">
        <NStatistic label="待复查" :value="stats.pendingReview" />
      </NCard>
      <NCard :bordered="false" class="cursor-pointer transition-shadow hover:shadow-md" @click="onStatCardClick({ status: 'closed' })">
        <NStatistic label="已关闭" :value="stats.closed" />
      </NCard>
      <NCard :bordered="false" class="cursor-pointer transition-shadow hover:shadow-md" @click="onStatCardClick({ riskLevel: '重大' })">
        <NStatistic label="重大隐患" :value="stats.highRisk" />
      </NCard>
    </div>

    <!-- 搜索 -->
    <HseSearchPanel @query="onSearch" @reset="onReset">
      <NGi>
        <NInput
          v-model:value="searchForm.keyword"
          placeholder="隐患描述 / 位置"
          clearable
          @keyup.enter="onSearch"
        />
      </NGi>
      <NGi>
        <NSelect
          v-model:value="searchForm.hazardType"
          placeholder="隐患类型"
          clearable
          :options="HAZARD_TYPE_OPTIONS"
          @update:value="onSearch"
        />
      </NGi>
      <NGi>
        <NSelect
          v-model:value="searchForm.riskLevel"
          placeholder="风险等级"
          clearable
          :options="RISK_LEVEL_OPTIONS"
          @update:value="onSearch"
        />
      </NGi>
      <NGi>
        <NSelect
          v-model:value="searchForm.status"
          placeholder="状态"
          clearable
          :options="STATUS_OPTIONS"
          @update:value="onSearch"
        />
      </NGi>
    </HseSearchPanel>

    <!-- 表格 -->
    <HseDataGrid
      :columns="hazardColumns"
      :data="data"
      :loading="loading"
      :pager="true"
      :total="total"
      @page-change="onPageChange"
      @sort-change="onSortChange"
    >
      <template #checkDate="{ row }">
        {{ formatDate(row.checkDate) }}
      </template>
      <template #expiry="{ row }">
        <HseStatusTag :type="EXPIRY_TAG[row.expiryStatus || 'unknown'] || 'neutral'">
          {{ EXPIRY_LABEL[row.expiryStatus || 'unknown'] || '未知' }}
        </HseStatusTag>
      </template>
      <template #status="{ row }">
        <HseStatusTag :type="STATUS_TAG[row.status || ''] || 'neutral'">
          {{ STATUS_LABEL[row.status || ''] || row.status || '-' }}
        </HseStatusTag>
      </template>
      <template #action="{ row }">
        <NSpace justify="center" :size="4" :wrap-item="false">
          <NButton size="small" type="primary" quaternary @click="openView(row)">
            查看
          </NButton>
          <NButton size="small" type="primary" quaternary @click="openEdit(row)">
            编辑
          </NButton>
          <NButton
            v-if="row.status === 'discovered'"
            size="small"
            type="primary"
            quaternary
            @click="openRectify(row)"
          >
            整改
          </NButton>
          <NButton
            v-if="row.status === 'processing'"
            size="small"
            type="primary"
            quaternary
            @click="onSubmitReview(row)"
          >
            提交复查
          </NButton>
          <NButton
            v-if="row.status === 'pending_review'"
            size="small"
            type="warning"
            quaternary
            @click="openReview(row)"
          >
            复查确认
          </NButton>
          <NButton
            v-if="row.status !== 'closed'"
            size="small"
            type="warning"
            quaternary
            @click="openClose(row)"
          >
            关闭
          </NButton>
          <NPopconfirm @positive-click="onDelete(row)">
            <template #trigger>
              <NButton size="small" type="error" quaternary>删除</NButton>
            </template>
            确定删除该隐患记录吗？
          </NPopconfirm>
        </NSpace>
      </template>
    </HseDataGrid>

    <!-- 新增 / 编辑 / 查看 弹窗 -->
    <NModal
      v-model:show="formOpen"
      :title="
        formMode === 'create'
          ? '新增隐患'
          : formMode === 'edit'
            ? '编辑隐患'
            : '隐患详情'
      "
      preset="card"
      style="width: 720px; max-width: 92vw"
      :mask-closable="false"
    >
      <NForm :disabled="formMode === 'view'" label-placement="top">
        <div class="grid grid-cols-2 gap-x-4">
          <NFormItem label="隐患类型">
            <NSelect
              v-model:value="formModel.hazardType"
              placeholder="请选择"
              :options="HAZARD_TYPE_OPTIONS"
            />
          </NFormItem>
          <NFormItem label="风险等级">
            <NSelect
              v-model:value="formModel.riskLevel"
              placeholder="请选择"
              :options="RISK_LEVEL_OPTIONS"
            />
          </NFormItem>
          <NFormItem label="隐患位置">
            <NInput v-model:value="formModel.location" placeholder="选填" />
          </NFormItem>
          <NFormItem label="整改期限(天)">
            <NInput
              :value="String(formModel.deadlineDays ?? 30)"
              placeholder="默认30天"
              @update:value="(v: string) => (formModel.deadlineDays = Number(v) || 30)"
            />
          </NFormItem>
          <NFormItem label="检查时间">
            <NInput v-model:value="formModel.checkDate" placeholder="YYYY-MM-DD" />
          </NFormItem>
          <NFormItem label="整改时间">
            <NInput v-model:value="formModel.fixDate" placeholder="YYYY-MM-DD（选填）" />
          </NFormItem>
        </div>
        <NFormItem label="隐患描述" required>
          <NInput
            v-model:value="formModel.description"
            type="textarea"
            :rows="3"
            placeholder="请输入隐患描述"
          />
        </NFormItem>
        <NFormItem label="整改措施">
          <NInput
            v-model:value="formModel.measure"
            type="textarea"
            :rows="2"
            placeholder="请输入整改措施"
          />
        </NFormItem>
        <NFormItem label="整改结果">
          <NInput
            v-model:value="formModel.rectification"
            type="textarea"
            :rows="2"
            placeholder="选填"
          />
        </NFormItem>
        <NFormItem label="备注">
          <NInput
            v-model:value="formModel.remark"
            type="textarea"
            :rows="2"
            placeholder="选填"
          />
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

    <!-- 通用导入（hazard 模块） -->
    <HseImportDialog
      v-model:open="importOpen"
      title="导入隐患数据"
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

    <!-- 整改提交 Modal -->
    <NModal
      v-model:show="rectifyModalVisible"
      title="整改提交"
      preset="card"
      style="width: 640px; max-width: 92vw"
      :mask-closable="false"
    >
      <NForm label-placement="top">
        <NFormItem label="整改人">
          <NSelect
            v-model:value="rectifyForm.correctorId"
            placeholder="选择整改人"
            clearable
            filterable
            remote
            :options="employeeSelectOptions"
            :loading="empLoading"
            @search="handleEmpSearch"
          />
        </NFormItem>
        <NFormItem label="整改结果" required>
          <NInput
            v-model:value="rectifyForm.rectification"
            type="textarea"
            :rows="3"
            placeholder="请输入整改结果描述"
          />
        </NFormItem>
        <NFormItem label="整改日期">
          <NInput v-model:value="rectifyForm.rectifyDate" placeholder="YYYY-MM-DD" />
        </NFormItem>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="rectifyModalVisible = false">取消</NButton>
          <NButton type="primary" :loading="rectifyLoading" @click="onConfirmRectify">
            提交
          </NButton>
        </NSpace>
      </template>
    </NModal>

    <!-- 复查确认 Modal -->
    <NModal
      v-model:show="reviewModalVisible"
      title="复查确认"
      preset="card"
      style="width: 640px; max-width: 92vw"
      :mask-closable="false"
    >
      <NForm label-placement="top">
        <NFormItem label="复查人">
          <NSelect
            v-model:value="reviewForm.reviewerId"
            placeholder="选择复查人"
            clearable
            filterable
            remote
            :options="employeeSelectOptions"
            :loading="empLoading"
            @search="handleEmpSearch"
          />
        </NFormItem>
        <NFormItem label="复查结果" required>
          <NRadioGroup v-model:value="reviewForm.reviewResult">
            <NSpace>
              <NRadio value="pass">合格（关闭隐患）</NRadio>
              <NRadio value="fail">不合格（重新整改）</NRadio>
            </NSpace>
          </NRadioGroup>
        </NFormItem>
        <NFormItem label="复查意见">
          <NInput
            v-model:value="reviewForm.reviewNote"
            type="textarea"
            :rows="3"
            placeholder="请输入复查意见"
          />
        </NFormItem>
        <NFormItem label="复查日期">
          <NInput v-model:value="reviewForm.reviewDate" placeholder="YYYY-MM-DD" />
        </NFormItem>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="reviewModalVisible = false">取消</NButton>
          <NButton type="primary" :loading="reviewLoading" @click="onConfirmReview">
            确认
          </NButton>
        </NSpace>
      </template>
    </NModal>

    <!-- 关闭隐患 Modal -->
    <NModal
      v-model:show="closeModalVisible"
      title="关闭隐患"
      preset="card"
      style="width: 520px; max-width: 92vw"
      :mask-closable="false"
    >
      <NForm label-placement="top">
        <NFormItem label="关闭说明">
          <NInput
            v-model:value="closeForm.closeNote"
            type="textarea"
            :rows="3"
            placeholder="请输入关闭说明"
          />
        </NFormItem>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="closeModalVisible = false">取消</NButton>
          <NButton type="primary" :loading="closeLoading" @click="onConfirmClose">
            确认关闭
          </NButton>
        </NSpace>
      </template>
    </NModal>

    <!-- 隐患详情抽屉（基本信息 + 关联风险 + 附件 + 版本履历） -->
    <NDrawer v-model:show="detailDrawerVisible" :width="760">
      <NDrawerContent v-if="currentHazard" title="隐患详情" closable>
        <NTabs v-model:value="detailActiveTab" type="line">
          <NTabPane name="info" tab="基本信息">
            <NDescriptions :column="1" bordered label-placement="left" size="small">
              <NDescriptionsItem label="隐患类型">
                {{ currentHazard.hazardType || '-' }}
              </NDescriptionsItem>
              <NDescriptionsItem label="风险等级">
                <HseStatusTag
                  v-if="currentHazard.riskLevel"
                  :type="RISK_TAG[currentHazard.riskLevel] || 'neutral'"
                >
                  {{ currentHazard.riskLevel }}
                </HseStatusTag>
                <span v-else>-</span>
              </NDescriptionsItem>
              <NDescriptionsItem label="隐患状态">
                <HseStatusTag :type="STATUS_TAG[currentHazard.status || ''] || 'neutral'">
                  {{ STATUS_LABEL[currentHazard.status || ''] || currentHazard.status || '-' }}
                </HseStatusTag>
              </NDescriptionsItem>
              <NDescriptionsItem label="隐患描述">
                {{ currentHazard.description }}
              </NDescriptionsItem>
              <NDescriptionsItem label="整改措施">
                {{ currentHazard.measure || '-' }}
              </NDescriptionsItem>
              <NDescriptionsItem label="隐患位置">
                {{ currentHazard.location || '-' }}
              </NDescriptionsItem>
              <NDescriptionsItem label="检查时间">
                {{ formatDate(currentHazard.checkDate) }}
              </NDescriptionsItem>
              <NDescriptionsItem label="整改期限">
                {{ currentHazard.deadlineDays || 30 }}天
              </NDescriptionsItem>
              <NDescriptionsItem label="发现人">
                {{ empName(currentHazard.finderId) }}
              </NDescriptionsItem>
              <NDescriptionsItem label="责任人">
                {{ empName(currentHazard.responsibleId) }}
              </NDescriptionsItem>
              <NDescriptionsItem label="整改人">
                {{ empName(currentHazard.correctorId) }}
              </NDescriptionsItem>
              <NDescriptionsItem label="复查人">
                {{ empName(currentHazard.reviewerId) }}
              </NDescriptionsItem>
              <NDescriptionsItem label="检查人员">
                {{ empName(currentHazard.checkerId, currentHazard.checker) }}
              </NDescriptionsItem>
              <NDescriptionsItem label="整改人员">
                {{ empName(currentHazard.fixerId, currentHazard.fixer) }}
              </NDescriptionsItem>
              <NDescriptionsItem label="整改时间">
                {{ formatDate(currentHazard.fixDate) }}
              </NDescriptionsItem>
              <NDescriptionsItem label="整改结果">
                {{ currentHazard.rectification || '-' }}
              </NDescriptionsItem>
              <NDescriptionsItem label="复查时间">
                {{ formatDate(currentHazard.reviewDate) }}
              </NDescriptionsItem>
              <NDescriptionsItem label="复查结果">
                <NTag v-if="currentHazard.reviewResult" :type="currentHazard.reviewResult === 'pass' ? 'success' : 'error'">
                  {{ currentHazard.reviewResult === 'pass' ? '合格' : '不合格' }}
                </NTag>
                <span v-else>-</span>
              </NDescriptionsItem>
              <NDescriptionsItem label="到期提醒">
                <HseStatusTag :type="EXPIRY_TAG[currentHazard.expiryStatus || 'unknown'] || 'neutral'">
                  {{ EXPIRY_LABEL[currentHazard.expiryStatus || 'unknown'] || '未知' }}
                </HseStatusTag>
              </NDescriptionsItem>
              <NDescriptionsItem v-if="currentHazard.remark" label="备注">
                {{ currentHazard.remark }}
              </NDescriptionsItem>
            </NDescriptions>

            <!-- 关联风险联动 -->
            <div class="mt-4 rounded border border-dashed border-gray-300 p-3">
              <div class="mb-2 flex items-center gap-1 text-sm font-medium">
                <IconifyIcon icon="lucide:link" :size="14" />
                <span>关联风险点</span>
              </div>
              <template v-if="relatedRiskLoading">
                <span class="text-xs text-gray-400">加载中...</span>
              </template>
              <template v-else-if="relatedRisk">
                <div class="space-y-1 text-sm">
                  <div class="flex items-center gap-2">
                    <span class="text-gray-500">风险名称：</span>
                    <NButton size="tiny" type="primary" quaternary @click="handleNavigateToRisk(relatedRisk!.id)">
                      {{ relatedRisk.name }}
                    </NButton>
                    <HseStatusTag :type="RISK_TAG[relatedRisk.level] || 'neutral'">
                      {{ relatedRisk.level }}
                    </HseStatusTag>
                  </div>
                  <div>
                    <span class="text-gray-500">风险位置：</span>{{ relatedRisk.location || '-' }}
                  </div>
                  <div>
                    <span class="text-gray-500">管控措施：</span>{{ relatedRisk.measures || '-' }}
                  </div>
                  <div>
                    <span class="text-gray-500">最近排查：</span>{{ formatDate(relatedRisk.lastHazardCheckDate) }}
                  </div>
                  <div>
                    <span class="text-gray-500">隐患数：</span>
                    <NTag size="small" type="warning">{{ relatedRisk.hazardCount || 0 }}</NTag>
                  </div>
                </div>
              </template>
              <template v-else>
                <span class="text-xs text-gray-400">暂无关联风险点</span>
              </template>
            </div>
          </NTabPane>

          <NTabPane name="attachments" tab="附件列表">
            <div class="mb-3 flex items-center gap-2">
              <NUpload
                :show-file-list="false"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                :custom-request="handleUploadRequest"
              >
                <NButton size="small" type="primary">
                  <template #icon>
                    <IconifyIcon icon="lucide:upload" :size="14" />
                  </template>
                  上传附件
                </NButton>
              </NUpload>
              <span class="text-xs text-gray-400">支持 PDF/Word/Excel/图片，单文件不超过 10MB</span>
            </div>
            <HseDataGrid
              v-if="attachmentList.length"
              :columns="attachmentColumns"
              :data="attachmentList"
              :loading="attachmentLoading"
            >
              <template #originalName="{ row }">
                <NButton size="tiny" type="primary" quaternary @click="handleDownloadAttachment(row)">
                  {{ row.originalName }}
                </NButton>
              </template>
              <template #fileSize="{ row }">
                {{ formatFileSize(row.fileSize) }}
              </template>
              <template #version="{ row }">
                <NTag v-if="row.isLatest" size="small" type="info">
                  v{{ row.version }}（最新）
                </NTag>
                <NTag v-else size="small">v{{ row.version }}</NTag>
              </template>
              <template #action="{ row }">
                <NSpace>
                  <NButton size="tiny" type="primary" quaternary @click="handleDownloadAttachment(row)">
                    下载
                  </NButton>
                  <NPopconfirm @positive-click="handleDeleteAttachment(row)">
                    <template #trigger>
                      <NButton size="tiny" type="error" quaternary>删除</NButton>
                    </template>
                    确定删除该附件吗？
                  </NPopconfirm>
                </NSpace>
              </template>
            </HseDataGrid>
            <NEmpty v-else description="暂无附件" />
          </NTabPane>

          <NTabPane name="versions" tab="历史版本">
            <HseDataGrid
              v-if="versionList.length"
              :columns="versionColumns"
              :data="versionList"
              :loading="versionLoading"
            >
              <template #changeType="{ row }">
                <NTag size="small" :type="CHANGE_TYPE_TAG[row.changeType] || 'default'">
                  {{ CHANGE_TYPE_LABEL[row.changeType] || row.changeType }}
                </NTag>
              </template>
              <template #createdAt="{ row }">
                {{ formatDateTime(row.createdAt) }}
              </template>
            </HseDataGrid>
            <NEmpty v-else description="暂无版本记录" />
          </NTabPane>
        </NTabs>
      </NDrawerContent>
    </NDrawer>

    <!-- 隐患统计分析抽屉 -->
    <NDrawer v-model:show="showStatistics" :width="820">
      <NDrawerContent title="隐患统计分析" closable>
        <NTabs v-model:value="statisticsActiveTab" type="line">
          <NTabPane name="overview" tab="总体概览">
            <div class="grid grid-cols-3 gap-3">
              <NCard :bordered="false" class="text-center">
                <div class="text-2xl font-semibold">{{ stats.total }}</div>
                <div class="text-xs text-gray-500">隐患总数</div>
              </NCard>
              <NCard :bordered="false" class="text-center">
                <div class="text-2xl font-semibold text-blue-500">{{ stats.discovered }}</div>
                <div class="text-xs text-gray-500">待整改</div>
              </NCard>
              <NCard :bordered="false" class="text-center">
                <div class="text-2xl font-semibold text-orange-500">{{ stats.processing }}</div>
                <div class="text-xs text-gray-500">整改中</div>
              </NCard>
              <NCard :bordered="false" class="text-center">
                <div class="text-2xl font-semibold text-cyan-500">{{ stats.pendingReview }}</div>
                <div class="text-xs text-gray-500">待复查</div>
              </NCard>
              <NCard :bordered="false" class="text-center">
                <div class="text-2xl font-semibold text-green-500">{{ stats.closed }}</div>
                <div class="text-xs text-gray-500">已关闭</div>
              </NCard>
              <NCard :bordered="false" class="text-center">
                <div class="text-2xl font-semibold text-red-500">{{ stats.highRisk }}</div>
                <div class="text-xs text-gray-500">重大隐患</div>
              </NCard>
            </div>
          </NTabPane>
          <NTabPane name="department" tab="部门排行">
            <HseDataGrid
              v-if="stats.byDepartment.length"
              :columns="rankColumns('部门')"
              :data="stats.byDepartment"
            />
            <NEmpty v-else description="暂无数据" />
          </NTabPane>
          <NTabPane name="position" tab="岗位排行">
            <HseDataGrid
              v-if="stats.byPosition.length"
              :columns="rankColumns('岗位')"
              :data="stats.byPosition"
            />
            <NEmpty v-else description="暂无数据" />
          </NTabPane>
          <NTabPane name="region" tab="区域排行">
            <HseDataGrid
              v-if="stats.byRegion.length"
              :columns="rankColumns('区域')"
              :data="stats.byRegion"
            />
            <NEmpty v-else description="暂无数据" />
          </NTabPane>
          <NTabPane name="repeated" tab="重复隐患">
            <HseDataGrid
              v-if="stats.repeatedHazards.length"
              :columns="repeatedColumns"
              :data="stats.repeatedHazards"
            />
            <NEmpty v-else description="暂无数据" />
          </NTabPane>
        </NTabs>
      </NDrawerContent>
    </NDrawer>

    <!-- 隐患提醒抽屉 -->
    <NDrawer v-model:show="showReminders" :width="760">
      <NDrawerContent title="隐患提醒" closable>
        <NTabs v-model:value="reminderActiveTab" type="line">
          <NTabPane name="highRisk" tab="重大隐患">
            <HseDataGrid
              v-if="highRiskList.length"
              :columns="highRiskColumns"
              :data="highRiskList"
            >
              <template #riskLevel="{ row }">
                <HseStatusTag :type="RISK_TAG[row.riskLevel] || 'neutral'">
                  {{ row.riskLevel }}
                </HseStatusTag>
              </template>
              <template #status="{ row }">
                <HseStatusTag :type="STATUS_TAG[row.status || ''] || 'neutral'">
                  {{ STATUS_LABEL[row.status || ''] || row.status || '-' }}
                </HseStatusTag>
              </template>
            </HseDataGrid>
            <NEmpty v-else description="暂无重大隐患" />
          </NTabPane>
          <NTabPane name="overdue" tab="超期隐患">
            <HseDataGrid
              v-if="overdueList.length"
              :columns="overdueColumns"
              :data="overdueList"
            >
              <template #overdueDays="{ row }">
                <span class="text-red-500">{{ row.overdueDays }}天</span>
              </template>
              <template #status="{ row }">
                <HseStatusTag :type="STATUS_TAG[row.status || ''] || 'neutral'">
                  {{ STATUS_LABEL[row.status || ''] || row.status || '-' }}
                </HseStatusTag>
              </template>
            </HseDataGrid>
            <NEmpty v-else description="暂无超期隐患" />
          </NTabPane>
          <NTabPane name="responsible" tab="责任人超期统计">
            <HseDataGrid
              v-if="responsibleOverdueList.length"
              :columns="responsibleColumns"
              :data="responsibleOverdueList"
            >
              <template #overdueHazards="{ row }">
                <span class="text-red-500">{{ row.overdueHazards }}</span>
              </template>
            </HseDataGrid>
            <NEmpty v-else description="暂无数据" />
          </NTabPane>
        </NTabs>
      </NDrawerContent>
    </NDrawer>
  </HsePageLayout>
</template>
