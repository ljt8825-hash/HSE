<script lang="ts" setup>
/**
 * 证书管理（web-naive）
 * 统一使用 HSE 公共组件栈；接入真实 API。
 * 对应 web-antd 的 training/index.vue（培训记录/证书管理）。
 */
import { computed, h, nextTick, onMounted, reactive, ref, watch } from 'vue';

import {
  NButton,
  NCard,
  NDataTable,
  NDatePicker,
  NDivider,
  NForm,
  NFormItem,
  NGi,
  NInput,
  NModal,
  NPopconfirm,
  NSelect,
  NSpace,
  NStatistic,
  NTabPane,
  NTabs,
  NTag,
  NText,
  type DataTableColumns,
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
  createTrainingPlan,
  deleteTrainingAttachment,
  deleteTrainingPlan,
  exportTrainingRecords,
  getPlanStatusFlow,
  getTrainingAttachments,
  getTrainingPlanList,
  getTrainingStats,
  getTrainingTypes,
  getTrainingVersions,
  updateTrainingPlan,
  uploadTrainingAttachment,
  type PlanStatusFlowRule,
  type TrainingRecordApi,
  type TrainingTypeRule,
} from '#/api/hse/training';
import { useGenericImport } from '#/views/hse/_shared/useGenericImport';
import { message } from '#/adapter/naive';

defineOptions({ name: 'HseTrainingCertificates' });

// ===================== 映射 =====================
const trainingTypeRules = ref<TrainingTypeRule[]>([]);
const planStatusRules = ref<PlanStatusFlowRule>({ statuses: [], transitions: [] });

const legacyTypeOptions = [
  { value: 'safety', label: '安全培训' },
  { value: 'skills', label: '技能培训' },
  { value: 'emergency', label: '应急培训' },
  { value: 'induction', label: '岗前培训' },
  { value: 'regular', label: '日常培训' },
];

const legacyStatusOptions = [
  { value: 'draft', label: '草稿' },
  { value: 'planned', label: '已计划' },
  { value: 'ongoing', label: '进行中' },
  { value: 'completed', label: '已完成' },
  { value: 'cancelled', label: '已取消' },
];

const typeOptions = computed(() => {
  const ruleOpts = trainingTypeRules.value.map((r) => ({
    value: r.code,
    label: r.label,
  }));
  const merged = [...ruleOpts];
  legacyTypeOptions.forEach((o) => {
    if (!merged.find((m) => m.value === o.value)) merged.push(o);
  });
  // Also add Chinese type values that may exist in data
  const cnTypes = ['HSE', '新员工', '驾驶员', '太行', '复训', '消防培训', '安全培训', '技能培训', '应急培训', '岗前培训', '日常培训'];
  cnTypes.forEach((t) => {
    if (!merged.find((m) => m.value === t)) merged.push({ value: t, label: t });
  });
  return merged;
});

const statusOptions = computed(() => {
  const statuses = planStatusRules.value.statuses || [];
  const ruleOpts = statuses.map((s) => ({ value: s.code, label: s.label }));
  const merged = [...ruleOpts];
  legacyStatusOptions.forEach((o) => {
    if (!merged.find((m) => m.value === o.value)) merged.push(o);
  });
  const cnStatus = ['合格', '不合格'];
  cnStatus.forEach((s) => {
    if (!merged.find((m) => m.value === s)) merged.push({ value: s, label: s });
  });
  return merged;
});

/** 人员类型下拉：主要负责人、安全管理人员 置顶，再合并数据中已出现的其它值，保证既有值可正常显示/沿用 */
const personnelTypeOptions = computed(() => {
  const seen = new Set<string>();
  const list: { value: string; label: string }[] = [];
  const pinned = ['主要负责人', '安全管理人员'];
  pinned.forEach((v) => {
    if (!seen.has(v)) {
      list.push({ value: v, label: v });
      seen.add(v);
    }
  });
  (data.value || []).forEach((r) => {
    const v = r.personnelType;
    if (v && !seen.has(v)) {
      list.push({ value: v, label: v });
      seen.add(v);
    }
  });
  return list;
});

function getTypeTag(type: string): 'success' | 'info' | 'warning' | 'danger' | 'neutral' {
  const rule = trainingTypeRules.value.find((r) => r.code === type);
  if (rule?.semanticColor) {
    const color = rule.semanticColor;
    if (color === 'green' || color === 'success') return 'success';
    if (color === 'blue' || color === 'info' || color === 'cyan') return 'info';
    if (color === 'gold' || color === 'orange' || color === 'yellow' || color === 'warning') return 'warning';
    if (color === 'red' || color === 'danger') return 'danger';
  }
  const map: Record<string, 'success' | 'info' | 'warning' | 'danger' | 'neutral'> = {
    safety: 'danger',
    skills: 'info',
    emergency: 'warning',
    induction: 'success',
    regular: 'neutral',
    HSE: 'info',
    新员工: 'success',
    驾驶员: 'warning',
    太行: 'danger',
  };
  return map[type] || 'neutral';
}

function getTypeLabel(type: string): string {
  const opt = typeOptions.value.find((o) => o.value === type);
  return opt?.label || type || '-';
}

function getStatusTag(status: string): 'success' | 'info' | 'warning' | 'danger' | 'neutral' {
  const rule = (planStatusRules.value.statuses || []).find((s) => s.code === status);
  if (rule?.semanticColor) {
    const color = rule.semanticColor;
    if (color === 'green' || color === 'success') return 'success';
    if (color === 'blue' || color === 'info' || color === 'cyan') return 'info';
    if (color === 'gold' || color === 'orange' || color === 'yellow' || color === 'warning') return 'warning';
    if (color === 'red' || color === 'danger') return 'danger';
  }
  const map: Record<string, 'success' | 'info' | 'warning' | 'danger' | 'neutral'> = {
    draft: 'neutral',
    planned: 'warning',
    ongoing: 'info',
    completed: 'success',
    cancelled: 'danger',
    合格: 'success',
    不合格: 'danger',
  };
  return map[status] || 'neutral';
}

function getStatusLabel(status: string): string {
  const opt = statusOptions.value.find((o) => o.value === status);
  return opt?.label || status || '-';
}

function getExpiryTag(status?: string): 'success' | 'info' | 'warning' | 'danger' | 'neutral' {
  const map: Record<string, 'success' | 'info' | 'warning' | 'danger' | 'neutral'> = {
    normal: 'success',
    expiring: 'warning',
    expired: 'danger',
    unknown: 'neutral',
  };
  return map[status || 'unknown'] || 'neutral';
}

function getExpiryLabel(status?: string): string {
  const map: Record<string, string> = {
    normal: '正常',
    expiring: '临期',
    expired: '过期',
    unknown: '未知',
  };
  return map[status || 'unknown'] || '未知';
}

// ===================== 列表数据 =====================
const loading = ref(false);
const data = ref<TrainingRecordApi.TrainingRecordItem[]>([]);
const total = ref(0);
const currentPage = ref(1);
const pageSize = ref(20);
const sortBy = ref<string | undefined>(undefined);
const sortOrder = ref<'asc' | 'desc' | undefined>(undefined);

const searchForm = reactive<{
  keyword: string;
  type: string | null;
  status: string | null;
  dateRange: [number, number] | null;
}>({
  keyword: '',
  type: null,
  status: null,
  dateRange: null,
});

function toDateStr(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// 统计
const statsData = ref<TrainingRecordApi.TrainingStats>({
  totalPlans: 0,
  ongoing: 0,
  completed: 0,
  totalAttendees: 0,
  passRate: 0,
  byType: {},
});

async function loadData() {
  loading.value = true;
  try {
    const params: Record<string, any> = {
      page: currentPage.value,
      pageSize: pageSize.value,
      keyword: searchForm.keyword || undefined,
      type: searchForm.type || undefined,
      status: searchForm.status || undefined,
      sortField: sortBy.value,
      sortOrder: sortOrder.value,
    };
    if (searchForm.dateRange && searchForm.dateRange.length === 2) {
      params.startDate = toDateStr(searchForm.dateRange[0]);
      params.endDate = toDateStr(searchForm.dateRange[1]);
    }
    const res = await getTrainingPlanList(params as TrainingRecordApi.RecordListParams);
    data.value = (res.list ?? []).map((r: any) => ({ ...r, trainingDate: listDate(r.trainingDate) }));
    total.value = res.total ?? 0;
  } catch {
    data.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
}

async function loadStats() {
  try {
    const stats = await getTrainingStats();
    statsData.value = stats;
  } catch {
    /* ignore */
  }
}

function onSearch() {
  currentPage.value = 1;
  loadData();
}

function onReset() {
  searchForm.keyword = '';
  searchForm.type = null;
  searchForm.status = null;
  searchForm.dateRange = null;
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
} = useGenericImport('training-records');
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
    const blob = await exportTrainingRecords();
    triggerDownload(blob, '培训证书记录.csv');
  } catch {
    message.error('导出失败');
  }
}

// ===================== 新增 / 编辑 / 查看 =====================
// 证书管理弹窗表单模型：字段与表格列保持一致
interface CertificateFormModel {
  name: string;
  trainingType: string;
  department: string;
  position: string;
  personnelType: string;
  trainingDate: string;
  validity: string;
  result: string;
  expiryStatus: string;
}

const formOpen = ref(false);
const formMode = ref<'create' | 'edit' | 'view'>('create');
const formLoading = ref(false);
const editingId = ref<number | null>(null);
const formModel = reactive<CertificateFormModel>({
  name: '',
  trainingType: 'safety',
  department: '',
  position: '',
  personnelType: '',
  trainingDate: '',
  validity: '',
  result: '合格',
  expiryStatus: 'normal',
});

function resetForm() {
  formModel.name = '';
  formModel.trainingType = 'safety';
  formModel.department = '';
  formModel.position = '';
  formModel.personnelType = '';
  formModel.trainingDate = '';
  formModel.validity = '';
  formModel.result = '合格';
  formModel.expiryStatus = 'normal';
}

function openCreate() {
  // 新增：直接在表格顶部插入一行，用户填写后失焦自动落库（见 persistRowDiff 的临时行分支）
  const tempId = -new Date().getTime();
  const fresh: TrainingRecordApi.TrainingRecordItem = {
    id: tempId,
    name: '',
    trainingType: 'safety',
    department: '',
    position: '',
    personnelType: '',
    trainingDate: '',
    validity: '',
    result: '合格',
    expiryStatus: 'normal',
  };
  data.value = [fresh, ...data.value];
  total.value = (total.value || 0) + 1;
  takeRowSnapshot(fresh);
  // 自动聚焦：待表格渲染出临时行后，激活「姓名」单元格进入编辑态，用户可直接键入，失焦即落库
  nextTick(() => {
    const $grid = gridRef.value?.gridApi?.grid as any;
    if ($grid && typeof $grid.setEditRow === 'function') {
      try {
        $grid.setEditRow(fresh, 'name');
      } catch {
        /* 聚焦失败不阻断新增 */
      }
    }
  });
}

function openEdit(row: TrainingRecordApi.TrainingRecordItem) {
  resetForm();
  formMode.value = 'edit';
  editingId.value = row.id;
  Object.assign(formModel, {
    name: row.name || '',
    trainingType: row.trainingType || 'safety',
    department: row.department || '',
    position: row.position || '',
    personnelType: row.personnelType || '',
    trainingDate: row.trainingDate || '',
    validity: row.validity || '',
    result: row.result || '合格',
    expiryStatus: row.expiryStatus || 'normal',
  });
  formOpen.value = true;
}

function openView(row: TrainingRecordApi.TrainingRecordItem) {
  openEdit(row);
  formMode.value = 'view';
  detailTab.value = 'attachments';
  attachmentList.value = [];
  versionList.value = [];
  if (row.id != null) {
    fetchAttachments(row.id);
    fetchVersions(row.id);
  }
}

// ===================== 附件与版本（查看详情） =====================
const detailTab = ref<'attachments' | 'versions'>('attachments');
const attachmentList = ref<TrainingRecordApi.TrainingAttachment[]>([]);
const attachmentLoading = ref(false);
const attachmentVersion = ref('1.0');
const versionList = ref<TrainingRecordApi.TrainingVersionRecord[]>([]);
const versionLoading = ref(false);
const attachmentInput = ref<HTMLInputElement | null>(null);

function formatFileSize(size?: number): string {
  if (size == null) return '-';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(2)} MB`;
}

function formatDateTime(date?: string): string {
  if (!date) return '-';
  return date.replace('T', ' ').slice(0, 19);
}

function formatDate(value: string | number | null | undefined): string {
  if (value == null || value === '') return '-';
  const s = String(value);
  // 兼容 "2026-03-18"、"2026/3/18" 等纯日期文本，直接归整为 xxxx-xx-xx
  const m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) {
    return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  }
  // ISO / 时间字符串：按本地时区转日期，避免 UTC 导致的少一天，也剥离时分秒
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${mo}-${day}`;
  }
  return s.slice(0, 10) || '-';
}

/** 行数据路径统一用空串表示缺失日期，避免哨兵值 '-' 被误入库，保证编辑框显示为 YYYY-MM-DD */
function listDate(v: string | number | null | undefined): string {
  const f = formatDate(v);
  return f === '-' ? '' : f;
}

async function fetchAttachments(recordId: number) {
  attachmentLoading.value = true;
  try {
    const res = await getTrainingAttachments(recordId);
    attachmentList.value = Array.isArray(res) ? res : [];
  } catch {
    attachmentList.value = [];
  } finally {
    attachmentLoading.value = false;
  }
}

async function fetchVersions(recordId: number) {
  versionLoading.value = true;
  try {
    const res = await getTrainingVersions(recordId);
    versionList.value = Array.isArray(res) ? res : [];
  } catch {
    versionList.value = [];
  } finally {
    versionLoading.value = false;
  }
}

async function handleUploadAttachment(file?: File) {
  if (!file || editingId.value == null) return;
  attachmentLoading.value = true;
  try {
    await uploadTrainingAttachment(editingId.value, file, {
      version: attachmentVersion.value || '1.0',
    });
    message.success('附件上传成功');
    await fetchAttachments(editingId.value);
    await fetchVersions(editingId.value);
  } catch {
    /* 拦截器已提示 */
  } finally {
    attachmentLoading.value = false;
  }
}

function onAttachmentFileChange(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) {
    handleUploadAttachment(file);
  }
  input.value = '';
}

async function handleDeleteAttachment(row: TrainingRecordApi.TrainingAttachment) {
  if (editingId.value == null) return;
  try {
    await deleteTrainingAttachment(editingId.value, row.id);
    message.success('附件已删除');
    await fetchAttachments(editingId.value);
    await fetchVersions(editingId.value);
  } catch {
    /* 拦截器已提示 */
  }
}

const attachmentColumns: DataTableColumns<TrainingRecordApi.TrainingAttachment> = [
  {
    title: '文件名',
    key: 'originalName',
    ellipsis: { tooltip: true },
    render: (row) =>
      h('div', { class: 'flex items-center gap-1' }, [
        h(
          'a',
          {
            href: row.fileUrl,
            target: '_blank',
            rel: 'noopener',
            class: 'text-primary',
          },
          { default: () => row.originalName },
        ),
        row.isLatest
          ? h(NTag, { size: 'small', type: 'success', bordered: false }, { default: () => '最新' })
          : null,
      ]),
  },
  { title: '版本', key: 'version', width: 90, render: (row) => row.version || '-' },
  { title: '大小', key: 'fileSize', width: 90, render: (row) => formatFileSize(row.fileSize) },
  { title: '上传人', key: 'uploadedBy', width: 110, render: (row) => row.uploadedBy || '-' },
  { title: '上传时间', key: 'createdAt', width: 160, render: (row) => formatDateTime(row.createdAt) },
  {
    title: '操作',
    key: 'action',
    width: 150,
    render: (row) =>
      h(NSpace, { size: 4, justify: 'center' }, {
        default: () => [
          h(
            'a',
            { href: row.fileUrl, target: '_blank', rel: 'noopener', class: 'text-primary' },
            { default: () => '下载' },
          ),
          h(
            NPopconfirm,
            { onPositiveClick: () => handleDeleteAttachment(row) },
            {
              trigger: () =>
                h(NButton, { size: 'small', type: 'error', quaternary: true }, { default: () => '删除' }),
              default: () => '确定删除该附件吗？',
            },
          ),
        ],
      }),
  },
];

const CHANGE_TYPE_TAG: Record<string, 'success' | 'info' | 'warning' | 'error' | 'default'> = {
  create: 'info',
  update: 'warning',
  import: 'success',
  revise: 'warning',
  delete: 'error',
};

const CHANGE_TYPE_LABEL: Record<string, string> = {
  create: '创建',
  update: '更新',
  import: '导入',
  revise: '修订',
  delete: '删除',
};

const versionColumns: DataTableColumns<TrainingRecordApi.TrainingVersionRecord> = [
  { title: '版本', key: 'version', width: 100, render: (row) => row.version || '-' },
  {
    title: '变更类型',
    key: 'changeType',
    width: 110,
    render: (row) =>
      h(
        NTag,
        { size: 'small', bordered: false, type: CHANGE_TYPE_TAG[row.changeType] ?? 'default' },
        { default: () => CHANGE_TYPE_LABEL[row.changeType] ?? row.changeType ?? '-' },
      ),
  },
  {
    title: '变更说明',
    key: 'changeSummary',
    ellipsis: { tooltip: true },
    render: (row) => row.changeSummary || '-',
  },
  { title: '操作人', key: 'changedBy', width: 110, render: (row) => row.changedBy || '-' },
  { title: '时间', key: 'createdAt', width: 160, render: (row) => formatDateTime(row.createdAt) },
];

async function onSubmit() {
  if (!formModel.name) {
    message.warning('姓名不能为空');
    return;
  }
  formLoading.value = true;
  try {
    // 证书管理实际保存到 training_records，字段与 training plan 不同；
    // 按后端可识别字段构造 payload（含人员类型/有效期）。
    const payload = {
      name: formModel.name,
      training_type: formModel.trainingType,
      dept: formModel.department,
      position: formModel.position,
      training_date: formModel.trainingDate,
      result: formModel.result,
      personnel_type: formModel.personnelType,
      validity: formModel.validity,
      duration_minutes: 0,
      content: '',
      trainer: '',
      remark: '',
    };
    // 防御：临时新增行（负 id）不存在后端记录，编辑保存退化为全量创建，避免“记录不存在”
    if (formMode.value === 'edit' && editingId.value != null && editingId.value > 0) {
      await updateTrainingPlan(editingId.value, payload as any);
      message.success('编辑成功');
    } else {
      const created = (await createTrainingPlan(payload as any)) as any;
      message.success('新增成功');
      // 新增行追加到列表底部（而非刷新后跳到第一行）
      if (created && created.id != null) {
        data.value = [...data.value, created];
        total.value = (total.value || 0) + 1;
      } else {
        await onRefresh();
      }
    }
    formOpen.value = false;
    if (formMode.value === 'edit') onRefresh();
  } catch {
    /* 拦截器已提示 */
  } finally {
    formLoading.value = false;
  }
}

async function onDelete(row: TrainingRecordApi.TrainingRecordItem) {
  if (row.id < 0) {
    // 临时新增行（负 id）尚未落库：仅从表格中移除本地行
    data.value = data.value.filter((r) => r.id !== row.id);
    total.value = Math.max(0, (total.value || 0) - 1);
    rowSnapshots.value.delete(row.id);
    message.success('已移除');
    return;
  }
  try {
    await deleteTrainingPlan(row.id);
    message.success('删除成功');
    onRefresh();
  } catch {
    /* 拦截器已提示 */
  }
}

// ===================== 批量删除 =====================
const gridRef = ref<any>(null);
function getSelectedRows(): any[] {
  try {
    return gridRef.value?.gridApi?.grid?.getCheckboxRecords?.() ?? [];
  } catch {
    return [];
  }
}

async function onBatchDelete() {
  const rows = getSelectedRows();
  if (!rows.length) {
    message.warning('请先勾选要删除的记录');
    return;
  }
  try {
    const tempRows = rows.filter((r) => r && r.id < 0);
    const realRows = rows.filter((r) => r && r.id >= 0);
    if (tempRows.length) {
      const tempIds = new Set(tempRows.map((r) => r.id));
      data.value = data.value.filter((r) => !tempIds.has(r.id));
      total.value = Math.max(0, (total.value || 0) - tempRows.length);
      tempRows.forEach((r) => rowSnapshots.value.delete(r.id));
    }
    if (realRows.length) {
      await Promise.all(realRows.map((row) => deleteTrainingPlan(row.id)));
    }
    message.success(`已删除 ${rows.length} 条记录`);
    onRefresh();
  } catch {
    /* 拦截器已提示 */
  }
}

// ===================== 表格列 =====================
// 单元格内联编辑（edit-mode="cell"）：以下可见数据列点击即可编辑，关闭时自动保存。
// 编辑插槽仅对白名单字段生效，避免把只读字段（时效状态/操作）误置为可编辑。
// 单元格内联编辑（edit-mode="cell"）：白名单列点击即编辑，关闭时自动保存。
// 各数据列 showOverflow:false → 内容全部显示（不省略、自动换行）、居中；autoWidth 让列宽平均铺满容器。
const COL_MIN = 140;
const columns = ref<VxeTableGridColumns>([
  { type: 'checkbox', width: 50, align: 'center', fixed: 'left' },
  {
    title: '姓名',
    field: 'name',
    minWidth: COL_MIN,
    align: 'center',
    showOverflow: false,
    editRender: {},
    slots: { default: 'name', edit: 'name-edit' },
  },
  {
    title: '培训类型',
    field: 'trainingType',
    minWidth: 210,
    align: 'center',
    showOverflow: 'title',
    editRender: {},
    // VXE 列原生支持 cellStyle，但当前类型声明未包含，故整列 as any 透传；
    // whiteSpace:nowrap 保证内容单行显示不换行，避免把行撑高
    cellStyle: { padding: '0 8px', whiteSpace: 'nowrap' },
    slots: { edit: 'trainingType-edit' },
  } as any,
  {
    title: '所属部门',
    field: 'department',
    minWidth: COL_MIN,
    align: 'center',
    showOverflow: false,
    editRender: {},
    slots: { default: 'dept', edit: 'dept-edit' },
  },
  {
    title: '职位',
    field: 'position',
    minWidth: COL_MIN,
    align: 'center',
    showOverflow: false,
    // 职位由花名册自动匹配的权威值，只读展示（不提供 edit 插槽，点击不进入编辑）
    editRender: {},
    formatter: ({ cellValue }: any) => (cellValue ? cellValue : '-'),
  },
  {
    title: '人员类型',
    field: 'personnelType',
    minWidth: COL_MIN,
    align: 'center',
    showOverflow: false,
    editRender: {},
    formatter: ({ cellValue }) => (cellValue ? cellValue : '-'),
    slots: { edit: 'personnelType-edit' },
  },
  {
    title: '考试日期',
    field: 'trainingDate',
    minWidth: COL_MIN,
    align: 'center',
    showOverflow: false,
    // 与 grid-ledger 模块已验证的日期行内编辑一致：使用 VXE 原生 input 编辑器，
    // 避免“自定义 slot + formatter”在 vxe cell 模式下失焦后值未回写字段、导致保存的是旧值的问题。
    editRender: { name: 'input', type: 'text' },
    formatter: ({ cellValue }) => (cellValue ? formatDate(cellValue) : '-'),
  } as any,
  {
    title: '有效期',
    field: 'validity',
    minWidth: COL_MIN,
    align: 'center',
    showOverflow: false,
    editRender: {},
    formatter: ({ cellValue }) => (cellValue ? cellValue : '-'),
    slots: { edit: 'validity-edit' },
  },
  {
    title: '培训结果',
    field: 'result',
    minWidth: COL_MIN,
    align: 'center',
    showOverflow: false,
    editRender: {},
    slots: { default: 'result', edit: 'result-edit' },
  },
  {
    title: '时效状态',
    field: 'expiryStatus',
    minWidth: COL_MIN,
    align: 'center',
    showOverflow: false,
    slots: { default: 'expiry' },
  },
  {
    title: '操作',
    field: 'action',
    width: 200,
    align: 'center',
    fixed: 'right',
    slots: { default: 'action' },
  },
]);

// 培训结果（合格/不合格）单元格编辑下拉：基础值 + 当前数据中出现的其它值
const resultOptions = computed(() => {
  const base = [
    { value: '合格', label: '合格' },
    { value: '不合格', label: '不合格' },
  ];
  data.value.forEach((r) => {
    if (r.result && !base.find((b) => b.value === r.result)) {
      base.push({ value: r.result, label: r.result });
    }
  });
  return base;
});

const expiryStatusOptions = [
  { value: 'normal', label: '正常' },
  { value: 'expiring', label: '临期' },
  { value: 'expired', label: '过期' },
  { value: 'unknown', label: '未知' },
];

// ===================== 单元格内联编辑保存 =====================
// 思路与 accidents 模块一致：HseDataGrid 在 cell 模式下关闭编辑时 emit edit-closed { row, column }，
// row 已含最新值；对比行快照得出本次变更字段，构造最小 snake_case payload 调 PUT /training/records/:id。
const rowSaving = ref<Set<number>>(new Set());
const rowSnapshots = ref<Map<number, string>>(new Map());

function snapshotKey(row: any): string {
  return JSON.stringify({
    name: row.name ?? null,
    trainingType: row.trainingType ?? null,
    result: row.result ?? null,
    department: row.department ?? null,
    trainingDate: row.trainingDate ?? null,
    personnelType: row.personnelType ?? null,
    validity: row.validity ?? null,
  });
}

function takeRowSnapshot(row: any) {
  if (!row || row.id == null) return;
  rowSnapshots.value.set(row.id, snapshotKey(row));
}

function rebuildSnapshots() {
  data.value.forEach((r) => takeRowSnapshot(r));
}

watch(data, () => rebuildSnapshots(), { deep: false });
onMounted(() => rebuildSnapshots());

async function onCellEditClosed(payload: { row: any; column?: any }) {
  const row = payload?.row;
  const column = payload?.column;
  if (!row || row.id == null) return;
  const changedKey = column?.field || column?.property || null;
  await persistRowDiff(row, changedKey);
}

async function persistRowDiff(row: any, changedKey?: string | null) {
  if (row.id == null) return;
  if (rowSaving.value.has(row.id)) return;

  const prevRaw = rowSnapshots.value.get(row.id);
  let prev: any = null;
  let changedFields: string[] = [];
  if (prevRaw) {
    try {
      prev = JSON.parse(prevRaw);
    } catch {
      prev = null;
    }
    if (prev) {
      for (const key of Object.keys(prev)) {
        if ((row[key] ?? null) !== (prev[key] ?? null)) {
          changedFields.push(key);
        }
      }
    }
  }

  const TRUSTED_FIELDS = new Set(['name', 'trainingType', 'result', 'department', 'trainingDate', 'personnelType', 'validity']);
  let toPersist = changedFields.filter((f) => TRUSTED_FIELDS.has(f));
  if (changedKey) {
    // edit-closed 表明用户对该单元格做了编辑：只要字段在白名单，直接落库该字段，
    // 不再受“快照 diff 是否判中”约束（如日期列从空值/tab 跳转等边界易被 diff 漏判而漏保存）。
    if (!TRUSTED_FIELDS.has(changedKey)) return;
    toPersist = [changedKey];
  }
  if (!toPersist.length) {
    takeRowSnapshot(row);
    return;
  }

  rowSaving.value.add(row.id);
  try {
    if (row.id < 0) {
      // 新增插入的临时行（负 id）：首次编辑字段即整行落库创建
      const payload = {
        name: row.name || '',
        training_type: row.trainingType || 'safety',
        dept: row.department || '',
        position: row.position || '',
        training_date: row.trainingDate || '',
        result: row.result || '合格',
        personnel_type: row.personnelType || '',
        validity: row.validity || '',
        duration_minutes: 0,
        content: '',
        trainer: '',
        remark: '',
      };
      const created = (await createTrainingPlan(payload as any)) as any;
      if (created && created.id != null) {
        const idx = data.value.findIndex((r) => r.id === row.id);
        if (idx >= 0) {
          data.value[idx] = { ...row, ...created, id: created.id, trainingDate: listDate(row.trainingDate || created.trainingDate) };
          takeRowSnapshot(data.value[idx]);
        }
        message.success('新增成功');
      } else {
        message.warning('新增行尚未保存：请至少填写姓名');
      }
      return;
    }

    const camel: Record<string, any> = {};
    for (const f of toPersist) camel[f] = row[f];
    // camelCase → snake_case（仅本模块白名单字段）
    const SNAKE_KEYS: Record<string, string> = {
      name: 'name',
      trainingType: 'training_type',
      result: 'result',
      department: 'dept',
      trainingDate: 'training_date',
      personnelType: 'personnel_type',
      validity: 'validity',
    };
    const snake: Record<string, any> = {};
    for (const f of toPersist) {
      const sk = SNAKE_KEYS[f];
      if (sk) {
        // 考试日期为空时置空，而非传空串，避免后端 COALESCE('', ...) 触发
        // Postgres date 类型解析报错导致“保存失败→还原旧值”。
        snake[sk] = f === 'trainingDate' && !camel[f] ? null : (camel[f] ?? null);
      }
    }

    await updateTrainingPlan(row.id, snake as any);
    message.success(`保存成功（${toPersist.join('/')}）`);
    takeRowSnapshot(row);
  } catch (e: any) {
    message.error('保存失败：' + (e?.message || '未知错误'));
    if (prev && changedKey) {
      row[changedKey] = prev[changedKey];
    }
  } finally {
    rowSaving.value.delete(row.id);
  }
}

async function fetchRules() {
  try {
    const [types, flow] = await Promise.all([getTrainingTypes(), getPlanStatusFlow()]);
    trainingTypeRules.value = types || [];
    planStatusRules.value = flow || { statuses: [], transitions: [] };
  } catch {
    trainingTypeRules.value = [];
    planStatusRules.value = { statuses: [], transitions: [] };
  }
}

onMounted(async () => {
  await fetchRules();
  await Promise.all([loadData(), loadStats()]);
});
</script>

<template>
  <HsePageLayout
    :description="$t('page.hse.trainingCertificatesDesc')"
    :title="$t('page.hse.trainingCertificates')"
  >
    <template #extra>
      <NSpace>
        <HseActionBar
          :actions="actionState"
          @refresh="onRefresh"
          @download-template="onImportTemplate"
          @import="() => (importOpen = true)"
          @export="onExport"
          @create="openCreate"
        />
        <NPopconfirm @positive-click="onBatchDelete">
          <template #trigger>
            <NButton type="error">批量删除</NButton>
          </template>
          确定删除选中的记录吗？
        </NPopconfirm>
      </NSpace>
    </template>

    <!-- 统计卡 -->
    <div class="mb-4 grid grid-cols-5 gap-3">
      <NCard :bordered="false">
        <NStatistic label="培训总数" :value="statsData.totalPlans" />
      </NCard>
      <NCard :bordered="false">
        <NStatistic label="进行中" :value="statsData.ongoing" />
      </NCard>
      <NCard :bordered="false">
        <NStatistic label="已完成" :value="statsData.completed" />
      </NCard>
      <NCard :bordered="false">
        <NStatistic label="参训人次" :value="statsData.totalAttendees" />
      </NCard>
      <NCard :bordered="false">
        <NStatistic label="通过率" :value="`${(statsData.passRate ?? 0).toFixed(1)}%`" />
      </NCard>
    </div>

    <!-- 搜索 -->
    <HseSearchPanel @query="onSearch" @reset="onReset">
      <NGi>
        <NInput
          v-model:value="searchForm.keyword"
          placeholder="姓名/培训师/证书编号"
          clearable
          @keyup.enter="onSearch"
        />
      </NGi>
      <NGi>
        <NSelect
          v-model:value="searchForm.type"
          placeholder="培训类型"
          clearable
          :options="typeOptions"
        />
      </NGi>
      <NGi>
        <NSelect
          v-model:value="searchForm.status"
          placeholder="培训结果"
          clearable
          :options="statusOptions"
        />
      </NGi>
      <NGi>
        <NDatePicker
          v-model:value="searchForm.dateRange"
          type="daterange"
          clearable
          placeholder="培训日期范围"
          style="width: 100%"
        />
      </NGi>
    </HseSearchPanel>

    <!-- 单元格编辑提示 -->
    <NText depth="3" class="mb-2 block text-xs">
      提示：点击「姓名 / 培训类型 / 培训结果 / 部门 / 考试日期」单元格可直接编辑，失焦或回车后自动保存。
    </NText>

    <!-- 表格：单元格内联编辑（点击白名单单元格即进入编辑，关闭时自动保存） -->
    <HseDataGrid
      ref="gridRef"
      :columns="columns"
      :data="data"
      :loading="loading"
      :pager="true"
      :total="total"
      :auto-width="true"
      editable
      edit-mode="cell"
      @page-change="onPageChange"
      @sort-change="onSortChange"
      @edit-closed="onCellEditClosed"
    >
      <template #name="{ row }">
        <NText>{{ row.name || '-' }}</NText>
      </template>
      <template #trainingType="{ row }">
        <div class="flex justify-center w-full">
          <HseStatusTag :type="getTypeTag(row.trainingType)">
            {{ getTypeLabel(row.trainingType) }}
          </HseStatusTag>
        </div>
      </template>
      <template #result="{ row }">
        <HseStatusTag :type="getStatusTag(row.result)">
          {{ getStatusLabel(row.result) }}
        </HseStatusTag>
      </template>
      <template #dept="{ row }">
        <NText>{{ row.department || '-' }}</NText>
      </template>
      <template #expiry="{ row }">
        <HseStatusTag :type="getExpiryTag(row.expiryStatus)">
          {{ getExpiryLabel(row.expiryStatus) }}
        </HseStatusTag>
      </template>

      <!-- ===== 单元格编辑插槽（edit-mode=cell 时由 VXE 渲染） ===== -->
      <template #name-edit="{ row }">
        <NInput v-model:value="row.name" placeholder="姓名" />
      </template>
      <template #trainingType-edit="{ row }">
        <NInput v-model:value="row.trainingType" placeholder="培训类型" />
      </template>
      <template #result-edit="{ row }">
        <NSelect v-model:value="row.result" :options="resultOptions" clearable placeholder="培训结果" />
      </template>
      <template #dept-edit="{ row }">
        <NInput v-model:value="row.department" placeholder="部门" />
      </template>
      <template #personnelType-edit="{ row }">
        <NSelect
          v-model:value="row.personnelType"
          :options="personnelTypeOptions"
          filterable
          clearable
          placeholder="人员类型"
        />
      </template>
      <template #validity-edit="{ row }">
        <NInput v-model:value="row.validity" placeholder="有效期" />
      </template>

      <template #action="{ row }">
        <NSpace justify="center">
          <!-- 临时新增行（负 id）尚无后端记录：直接走单元格内联编辑落库，不再提供弹窗查看/编辑 -->
          <template v-if="row.id > 0">
            <NButton size="small" type="primary" quaternary @click="openView(row)">
              查看
            </NButton>
            <NButton size="small" type="primary" quaternary @click="openEdit(row)">
              编辑
            </NButton>
          </template>
          <NPopconfirm @positive-click="onDelete(row)">
            <template #trigger>
              <NButton size="small" type="error" quaternary>删除</NButton>
            </template>
            确定删除该培训记录吗？
          </NPopconfirm>
        </NSpace>
      </template>
    </HseDataGrid>

    <!-- 新增 / 编辑 / 查看 弹窗 -->
    <NModal
      v-model:show="formOpen"
      :title="
        formMode === 'create'
          ? '新增培训记录'
          : formMode === 'edit'
            ? '编辑培训记录'
            : '培训记录详情'
      "
      preset="card"
      style="width: 720px; max-width: 92vw"
      :mask-closable="false"
    >
      <NForm :disabled="formMode === 'view'" label-placement="top">
        <div class="grid grid-cols-2 gap-x-4">
          <NFormItem label="姓名" required>
            <NInput v-model:value="formModel.name" placeholder="请输入姓名" />
          </NFormItem>
          <NFormItem label="培训类型" required>
            <NInput v-model:value="formModel.trainingType" placeholder="请输入培训类型" />
          </NFormItem>
          <NFormItem label="部门">
            <NInput v-model:value="formModel.department" placeholder="请输入部门" />
          </NFormItem>
          <NFormItem label="岗位">
            <NInput v-model:value="formModel.position" placeholder="请输入岗位" />
          </NFormItem>
          <NFormItem label="人员类型">
            <NInput v-model:value="formModel.personnelType" placeholder="请输入人员类型" />
          </NFormItem>
          <NFormItem label="有效期">
            <NInput v-model:value="formModel.validity" placeholder="请输入有效期" />
          </NFormItem>
          <NFormItem label="考试日期">
            <NInput v-model:value="formModel.trainingDate" placeholder="YYYY-MM-DD" />
          </NFormItem>
          <NFormItem label="培训结果">
            <NSelect v-model:value="formModel.result" :options="resultOptions" clearable />
          </NFormItem>
          <NFormItem label="时效状态" class="col-span-2">
            <NSelect v-model:value="formModel.expiryStatus" :options="expiryStatusOptions" disabled />
          </NFormItem>
        </div>
        <NText v-if="formMode !== 'view'" depth="3" class="mt-2 block text-xs">
          注：人员类型、有效期已接入后端 training_records 表，可正常保存。
        </NText>
      </NForm>

      <!-- 查看模式：附件与版本履历（对齐基线 training/index.vue 详情抽屉能力） -->
      <template v-if="formMode === 'view'">
        <NDivider />
        <NTabs v-model:value="detailTab" type="line">
          <NTabPane name="attachments" tab="附件列表">
            <div class="mb-3 flex items-center gap-2">
              <span class="text-sm text-gray-500">新版本号：</span>
              <NInput v-model:value="attachmentVersion" style="width: 100px" />
              <NButton size="small" type="primary" :loading="attachmentLoading" @click="attachmentInput?.click()">
                上传附件
              </NButton>
              <input
                ref="attachmentInput"
                type="file"
                class="hidden"
                @change="onAttachmentFileChange"
              />
            </div>
            <NDataTable
              v-if="attachmentList.length"
              :columns="attachmentColumns"
              :data="attachmentList"
              :loading="attachmentLoading"
              size="small"
              :bordered="false"
              :pagination="false"
            />
            <NText v-else depth="3">暂无附件，点击右上角上传</NText>
          </NTabPane>
          <NTabPane name="versions" tab="历史版本">
            <NDataTable
              v-if="versionList.length"
              :columns="versionColumns"
              :data="versionList"
              :loading="versionLoading"
              size="small"
              :bordered="false"
              :pagination="false"
            />
            <NText v-else depth="3">暂无版本变更记录</NText>
          </NTabPane>
        </NTabs>
      </template>
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
      title="导入培训证书记录"
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

<style scoped>
/* 单元格编辑态：贴合行高、去掉多余垂直留白，避免编辑框出现时整行高度跳动 */
:deep(.vxe-cell--edit) {
  padding-top: 0 !important;
  padding-bottom: 0 !important;
}
:deep(.vxe-cell--edit .n-input),
:deep(.vxe-cell--edit .n-select) {
  height: 28px;
  font-size: 13px;
}
:deep(.vxe-cell--edit .n-input .n-input__input-el),
:deep(.vxe-cell--edit .n-select .n-base-selection) {
  height: 28px;
  min-height: 28px;
}
</style>
