<script lang="ts" setup>
/**
 * 人员保险管理（web-naive）
 * 统一使用 HSE 公共组件栈：HsePageLayout + HseSearchPanel + HseActionBar + HseDataGrid + HseImportDialog + HseStatusTag
 */
import { reactive, ref, onMounted } from 'vue';
import type { UploadFileInfo } from 'naive-ui';

import {
  NButton,
  NCard,
  NDivider,
  NEmpty,
  NAlert,
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
  NTag,
  NUpload,
} from 'naive-ui';
import { BookOpenText, FileUp, Upload } from '@vben/icons';

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
  createPersonnel,
  deletePersonnel,
  deleteInsuranceAttachment,
  deletePolicy,
  exportPersonnelInsurance,
  getInsuranceAttachments,
  getPersonnelDepartments,
  getPersonnelList,
  getPersonnelStats,
  getPolicyDocuments,
  getPolicyFile,
  importPolicyPdf,
  updatePersonnel,
  updatePolicy,
  uploadInsuranceAttachment,
  type InsuranceApi,
  type InsurancePolicyDocument,
} from '#/api/hse/insurance';
import { useGenericImport } from '#/views/hse/_shared/useGenericImport';
import { message } from '#/adapter/naive';

defineOptions({ name: 'InsurancePersonnel' });

// ===================== 映射 =====================
const COMPLIANCE_TAG: Record<
  string,
  'success' | 'info' | 'warning' | 'danger' | 'neutral'
> = {
  compliant: 'success',
  noncompliant: 'danger',
  unknown: 'neutral',
};
const COMPLIANCE_LABEL: Record<string, string> = {
  compliant: '合规',
  noncompliant: '不合规',
  unknown: '未知',
};

const PERSONNEL_INSURANCE_TYPES = [
  { label: '雇主责任险', value: '雇主责任险' },
  { label: '工伤保险', value: '工伤保险' },
];

// ===================== 列表数据 =====================
const loading = ref(false);
const data = ref<InsuranceApi.PersonnelItemPivoted[]>([]);
const total = ref(0);
const currentPage = ref(1);
const pageSize = ref(20);
const sortBy = ref<string | undefined>(undefined);
const sortOrder = ref<'asc' | 'desc' | undefined>(undefined);

const searchForm = reactive({
  keyword: '',
  department: '' as string | null,
  insuranceStatus: '' as string | null,
  complianceStatus: '' as string | null,
});

/** 当前高亮的统计卡片（点击卡片联动筛选） */
const activeCard = ref<
  'expired' | 'insured' | 'noncompliant' | 'total' | null
>(null);

const departmentOptions = ref<{ label: string; value: string }[]>([]);
const deptLoading = ref(false);

async function loadData() {
  loading.value = true;
  try {
    const res = await getPersonnelList({
      page: currentPage.value,
      pageSize: pageSize.value,
      keyword: searchForm.keyword || undefined,
      department: searchForm.department || undefined,
      insuranceStatus: searchForm.insuranceStatus || undefined,
      complianceStatus: searchForm.complianceStatus || undefined,
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

// ===================== 统计 =====================
const statTotal = ref(0);
const statInsured = ref(0);
const statNoncompliant = ref(0);
const statExpired = ref(0);

async function loadStats() {
  try {
    const stats = await getPersonnelStats();
    statTotal.value = stats.total ?? 0;
    statInsured.value = stats.active ?? 0;
    statNoncompliant.value = stats.noncompliant ?? 0;
    statExpired.value = stats.expired ?? 0;
  } catch {
    /* ignore */
  }
}

async function loadDepartments() {
  deptLoading.value = true;
  try {
    const res = await getPersonnelDepartments();
    departmentOptions.value = (res.departments ?? []).map((d) => ({
      label: d,
      value: d,
    }));
  } catch {
    departmentOptions.value = [];
  } finally {
    deptLoading.value = false;
  }
}

function onSearch() {
  // 手动查询时取消统计卡高亮（筛选条件保留在搜索表单里）
  activeCard.value = null;
  currentPage.value = 1;
  loadData();
  loadStats();
}

function onReset() {
  searchForm.keyword = '';
  searchForm.department = null;
  searchForm.insuranceStatus = null;
  searchForm.complianceStatus = null;
  activeCard.value = null;
  onSearch();
}

/** 统计卡点击 → 联动筛选（在职人数=全部；已参保/已过期=保险状态；不合规=合规状态） */
function applyCardFilter(
  key: 'expired' | 'insured' | 'noncompliant' | 'total',
) {
  activeCard.value = key;
  searchForm.insuranceStatus = null;
  searchForm.complianceStatus = null;
  switch (key) {
    case 'insured':
      searchForm.insuranceStatus = 'insured';
      break;
    case 'expired':
      searchForm.insuranceStatus = 'expired';
      break;
    case 'noncompliant':
      searchForm.complianceStatus = 'noncompliant';
      break;
    default:
      break;
  }
  currentPage.value = 1;
  loadData();
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
const actionState = ref<Partial<Record<HseActionKey, { hidden?: boolean }>>>(
  {},
);

// 通用导入
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
  // 模块标识必须与后端 server/routes/import.js 的 NATIVE_IMPORT_MODULES key 完全一致。
  // 后端 key 为 'personnel'（targetTable: personnel_insurance）；写成 'insurance-personnel'
  // 会匹配不到原生配置，降级 Python 引擎导致人员保险数据写不进库（同车辆保险踩过的坑）。
} = useGenericImport('personnel');
bindImportRefresh(onRefresh);

async function onRefresh() {
  await Promise.all([loadData(), loadStats(), loadDepartments()]);
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
    const blob = await exportPersonnelInsurance();
    triggerDownload(blob, `人员保险清单_${new Date().toISOString().slice(0, 10)}.csv`);
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
const editingInsuranceType = ref<string>('雇主责任险');

const formModel = reactive<{
  employeeId: number | null;
  personName: string;
  insuranceType: string;
  policyNo: string;
  coverageAmount: number | null;
  premium: number | null;
  startDate: string;
  expireDate: string;
  remark: string;
}>({
  employeeId: null,
  personName: '',
  insuranceType: '雇主责任险',
  policyNo: '',
  coverageAmount: null,
  premium: null,
  startDate: '',
  expireDate: '',
  remark: '',
});

function resetForm() {
  formModel.employeeId = null;
  formModel.personName = '';
  formModel.insuranceType = '雇主责任险';
  formModel.policyNo = '';
  formModel.coverageAmount = null;
  formModel.premium = null;
  formModel.startDate = '';
  formModel.expireDate = '';
  formModel.remark = '';
}

function openCreate() {
  resetForm();
  formMode.value = 'create';
  editingId.value = null;
  editingInsuranceType.value = '雇主责任险';
  formOpen.value = true;
}

function openEdit(row: InsuranceApi.PersonnelItemPivoted, insType: 'employer' | 'injury' = 'employer') {
  resetForm();
  const info = insType === 'injury' ? row.injury : row.employer;
  if (!info?.id) {
    message.warning('该险种无记录可编辑');
    return;
  }
  formMode.value = 'edit';
  editingId.value = info.id;
  editingInsuranceType.value = insType === 'injury' ? '工伤保险' : '雇主责任险';
  formModel.employeeId = row.employeeId;
  formModel.personName = row.personName || '';
  formModel.insuranceType = editingInsuranceType.value;
  formModel.policyNo = info.policyNo || '';
  formModel.coverageAmount = info.coverage ?? null;
  formModel.premium = info.premium ?? null;
  formModel.startDate = info.startDate ? info.startDate.slice(0, 10) : '';
  formModel.expireDate = info.expireDate ? info.expireDate.slice(0, 10) : '';
  formOpen.value = true;
}

function openView(row: InsuranceApi.PersonnelItemPivoted) {
  // 查看默认展示雇主险信息（如有），否则工伤险
  const info = row.employer?.id ? row.employer : row.injury;
  resetForm();
  formMode.value = 'view';
  editingId.value = info?.id ?? null;
  if (editingId.value != null) loadAttachments(editingId.value);
  formModel.employeeId = row.employeeId;
  formModel.personName = row.personName || '';
  formModel.insuranceType = row.employer?.id ? '雇主责任险' : '工伤保险';
  formModel.policyNo = info?.policyNo || '';
  formModel.coverageAmount = info?.coverage ?? null;
  formModel.premium = info?.premium ?? null;
  formModel.startDate = info?.startDate ? info.startDate.slice(0, 10) : '';
  formModel.expireDate = info?.expireDate ? info.expireDate.slice(0, 10) : '';
  formOpen.value = true;
}

async function onSubmit() {
  if (formMode.value === 'create' && !formModel.employeeId) {
    message.warning('请填写员工ID');
    return;
  }
  if (!formModel.insuranceType) {
    message.warning('请选择保险类型');
    return;
  }
  formLoading.value = true;
  try {
    const payload: InsuranceApi.PersonnelFormData = {
      insuranceType: formModel.insuranceType,
      policyNo: formModel.policyNo || undefined,
      coverageAmount: formModel.coverageAmount ?? undefined,
      premium: formModel.premium ?? undefined,
      startDate: formModel.startDate || null,
      expireDate: formModel.expireDate || null,
      remark: formModel.remark || undefined,
    };
    if (formMode.value === 'create') {
      payload.employeeId = formModel.employeeId ?? undefined;
      await createPersonnel(payload);
      message.success('新增成功');
    } else if (editingId.value != null) {
      await updatePersonnel(editingId.value, payload);
      message.success('编辑成功');
    }
    formOpen.value = false;
    onRefresh();
  } catch {
    /* 拦截器已提示 */
  } finally {
    formLoading.value = false;
  }
}

async function onDelete(row: InsuranceApi.PersonnelItemPivoted) {
  try {
    // 透视行可能关联两条记录（雇主险 + 工伤险），逐条删除
    const ids: number[] = [];
    if (row.employer?.id) ids.push(row.employer.id);
    if (row.injury?.id) ids.push(row.injury.id);
    if (!ids.length) {
      message.warning('无记录可删除');
      return;
    }
    for (const id of ids) {
      await deletePersonnel(id);
    }
    message.success('删除成功');
    onRefresh();
  } catch {
    /* 拦截器已提示 */
  }
}

// ===================== 保单管理（主保单 PDF） =====================
const policyList = ref<InsurancePolicyDocument[]>([]);
const policyLoading = ref(false);
const policyManageVisible = ref(false);
const policyEditVisible = ref(false);
const policyEditLoading = ref(false);
const policyEditing = ref<InsurancePolicyDocument | null>(null);
const policyFile = ref<File | null>(null);
const policyForm = reactive({
  name: '',
  type: '雇主责任险',
  policyNo: '',
  year: '',
});

const POLICY_TYPES = [
  { label: '雇主责任险', value: '雇主责任险' },
  { label: '工伤保险', value: '工伤保险' },
];

const policyColumns = ref<VxeTableGridColumns>([
  { title: '保险类型', field: 'type', align: 'center', slots: { default: 'policyType' } },
  { title: '保单号', field: 'policyNo', align: 'center', minWidth: 200, showOverflow: 'tooltip' },
  { title: '保险年份', field: 'year', align: 'center' },
  {
    title: '操作',
    field: 'action',
    align: 'center',
    slots: { default: 'policyAction' },
  },
]);

async function loadPolicies() {
  policyLoading.value = true;
  try {
    const res = await getPolicyDocuments();
    policyList.value = res.list ?? [];
  } catch {
    policyList.value = [];
  } finally {
    policyLoading.value = false;
  }
}

function openPolicyManage() {
  policyManageVisible.value = true;
  loadPolicies();
}

function openPolicyImport() {
  policyEditing.value = null;
  policyForm.name = '';
  policyForm.type = '雇主责任险';
  policyForm.policyNo = '';
  policyForm.year = '';
  policyFile.value = null;
  policyEditVisible.value = true;
}

function openPolicyEdit(p: InsurancePolicyDocument) {
  policyEditing.value = p;
  policyForm.name = p.name || '';
  policyForm.type = p.type || '雇主责任险';
  policyForm.policyNo = p.policyNo || '';
  policyForm.year = p.year || '';
  policyFile.value = null;
  policyEditVisible.value = true;
}

async function handlePolicySubmit() {
  if (!policyForm.name.trim()) {
    message.warning('请填写保单名称');
    return;
  }
  policyEditLoading.value = true;
  try {
    if (policyEditing.value) {
      await updatePolicy(policyEditing.value.id, {
        name: policyForm.name.trim(),
        type: policyForm.type,
        policyNo: policyForm.policyNo.trim(),
        year: policyForm.year.trim(),
      });
      message.success('更新成功');
    } else {
      if (!policyFile.value) {
        message.warning('请先选择 PDF 文件');
        return;
      }
      await importPolicyPdf(policyFile.value, {
        name: policyForm.name.trim(),
        type: policyForm.type,
        policyNo: policyForm.policyNo.trim(),
        year: policyForm.year.trim(),
      });
      message.success('导入成功');
    }
    policyEditVisible.value = false;
    loadPolicies();
  } catch {
    /* 拦截器已提示 */
  } finally {
    policyEditLoading.value = false;
  }
}

async function handlePolicyDelete(p: InsurancePolicyDocument) {
  try {
    await deletePolicy(p.id);
    message.success('删除成功');
    loadPolicies();
  } catch {
    /* 拦截器已提示 */
  }
}

async function openPolicyFile(id: number) {
  try {
    const blob = await getPolicyFile('policies', id);
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch {
    message.error('保单打开失败');
  }
}

// 保单 PDF 上传（NUpload custom-request）
function handlePolicyFileUpload({
  file,
  onFinish,
  onError,
}: {
  file: UploadFileInfo;
  onFinish?: () => void;
  onError?: () => void;
}) {
  const rawFile = file.file;
  if (!rawFile) {
    onError?.();
    return;
  }
  const isPdf =
    rawFile.type === 'application/pdf' || /\.pdf$/i.test(rawFile.name || '');
  if (!isPdf) {
    message.error('仅支持 PDF 文件');
    onError?.();
    return;
  }
  if (rawFile.size / 1024 / 1024 > 10) {
    message.error('文件大小不能超过 10MB');
    onError?.();
    return;
  }
  policyFile.value = rawFile;
  if (!policyForm.name) policyForm.name = (rawFile.name || '').replace(/\.pdf$/i, '');
  onFinish?.();
}

// ===================== 附件（详情） =====================
const attachmentList = ref<InsuranceApi.InsuranceAttachment[]>([]);
const attachmentLoading = ref(false);
const attachmentBizId = ref<number | null>(null);

const attachmentColumns = ref<VxeTableGridColumns>([
  { title: '文件名', field: 'originalName', minWidth: 180, showOverflow: 'tooltip' },
  { title: '版本', field: 'version', width: 80, align: 'center', slots: { default: 'version' } },
  { title: '大小', field: 'fileSize', width: 100, align: 'center', slots: { default: 'size' } },
  { title: '上传人', field: 'uploadedBy', width: 90, align: 'center' },
  {
    title: '操作',
    field: 'action',
    width: 130,
    align: 'center',
    slots: { default: 'attachmentAction' },
  },
]);

async function loadAttachments(bizId: number) {
  attachmentBizId.value = bizId;
  attachmentLoading.value = true;
  try {
    const res = await getInsuranceAttachments('personnel', bizId);
    attachmentList.value = res ?? [];
  } catch {
    attachmentList.value = [];
  } finally {
    attachmentLoading.value = false;
  }
}

function handleAttachmentUpload({
  file,
  onFinish,
  onError,
}: {
  file: UploadFileInfo;
  onFinish?: () => void;
  onError?: () => void;
}) {
  const rawFile = file.file;
  if (!rawFile || attachmentBizId.value == null) {
    onError?.();
    return;
  }
  if (rawFile.size / 1024 / 1024 > 10) {
    message.error('文件大小不能超过 10MB');
    onError?.();
    return;
  }
  uploadInsuranceAttachment('personnel', attachmentBizId.value, rawFile, {
    uploadedBy: 'admin',
  })
    .then(() => {
      message.success('上传成功');
      loadAttachments(attachmentBizId.value as number);
      onFinish?.();
    })
    .catch(() => {
      message.error('上传失败');
      onError?.();
    });
}

async function handleAttachmentDelete(a: InsuranceApi.InsuranceAttachment) {
  if (attachmentBizId.value == null) return;
  try {
    await deleteInsuranceAttachment('personnel', attachmentBizId.value, a.id);
    message.success('删除成功');
    loadAttachments(attachmentBizId.value);
  } catch {
    message.error('删除失败');
  }
}

function handleAttachmentDownload(a: InsuranceApi.InsuranceAttachment) {
  if (a.fileUrl) window.open(a.fileUrl, '_blank');
}

// 文件大小格式化
function formatFileSize(bytes: number): string {
  if (!bytes) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

/** 保险类型：按是否存在雇主险/工伤险记录合成（有记录即计入，与参保状态解耦） */
function getInsuranceType(row: InsuranceApi.PersonnelItemPivoted): string {
  const hasEmp = row.employer?.recordExists;
  const hasInj = row.injury?.recordExists;
  if (hasEmp && hasInj) return '雇主责任险+工伤保险';
  if (hasEmp) return '雇主责任险';
  if (hasInj) return '工伤保险';
  return '未参保';
}

function getInsuranceTypeTag(
  row: InsuranceApi.PersonnelItemPivoted,
): 'info' | 'neutral' | 'success' {
  const hasEmp = row.employer?.recordExists;
  const hasInj = row.injury?.recordExists;
  if (hasEmp && hasInj) return 'success';
  if (hasEmp || hasInj) return 'info';
  return 'neutral';
}

/** 保险起期/止期/保费：优先雇主险，其次工伤险（原列展示语义） */
function pickInsInfo(row: InsuranceApi.PersonnelItemPivoted) {
  return row.employer?.id ? row.employer : row.injury;
}

// ===================== 表格列 =====================
const columns = ref<VxeTableGridColumns>([
  { title: '姓名', field: 'personName', minWidth: 100, align: 'center' },
  { title: '部门', field: 'department', minWidth: 120, align: 'center' },
  { title: '岗位', field: 'position', minWidth: 120, align: 'center' },
  {
    title: '保险类型',
    field: 'insuranceType',
    minWidth: 150,
    align: 'center',
    slots: { default: 'insuranceType' },
  },
  {
    title: '保险状态',
    field: 'complianceStatus',
    minWidth: 100,
    align: 'center',
    sortable: true,
    slots: { default: 'compliance' },
  },
  { title: '入职日期', field: 'entryDate', minWidth: 110, align: 'center' },
  {
    title: '保险起期',
    field: 'policyStart',
    minWidth: 120,
    align: 'center',
    slots: { default: 'policyStart' },
  },
  {
    title: '保险止期',
    field: 'policyEnd',
    minWidth: 120,
    align: 'center',
    slots: { default: 'policyEnd' },
  },
  {
    title: '保费',
    field: 'premium',
    minWidth: 110,
    align: 'center',
    slots: { default: 'premium' },
  },
  {
    title: '操作',
    field: 'action',
    minWidth: 260,
    align: 'center',
    fixed: 'right',
    slots: { default: 'action' },
  },
]);

onMounted(() => {
  loadData();
  loadStats();
  loadDepartments();
});
</script>

<template>
  <HsePageLayout title="人员保险" description="拉取花名册在职人员，动态展示雇主责任险与工伤保险信息">
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
        <NButton @click="openPolicyManage">
          <template #icon>
            <BookOpenText class="size-4" />
          </template>
          保单管理
        </NButton>
      </NSpace>
    </template>

    <!-- 统计卡（点击联动筛选：在职人数=全部；已参保/已过期=保险状态；不合规=合规状态） -->
    <div class="mb-4 grid grid-cols-4 gap-3">
      <NCard
        :bordered="false"
        class="card-clickable"
        :class="{ 'card-active': activeCard === 'total' }"
        @click="applyCardFilter('total')"
      >
        <NStatistic label="在职人数" :value="statTotal" />
      </NCard>
      <NCard
        :bordered="false"
        class="card-clickable"
        :class="{ 'card-active': activeCard === 'insured' }"
        @click="applyCardFilter('insured')"
      >
        <NStatistic label="已参保" :value="statInsured" />
      </NCard>
      <NCard
        :bordered="false"
        class="card-clickable"
        :class="{ 'card-active': activeCard === 'noncompliant' }"
        @click="applyCardFilter('noncompliant')"
      >
        <NStatistic label="不合规" :value="statNoncompliant" />
      </NCard>
      <NCard
        :bordered="false"
        class="card-clickable"
        :class="{ 'card-active': activeCard === 'expired' }"
        @click="applyCardFilter('expired')"
      >
        <NStatistic label="已过期" :value="statExpired" />
      </NCard>
    </div>

    <!-- 搜索 -->
    <HseSearchPanel @query="onSearch" @reset="onReset">
      <NGi>
        <NInput
          v-model:value="searchForm.keyword"
          placeholder="姓名/身份证/手机号"
          clearable
          @keyup.enter="onSearch"
        />
      </NGi>
      <NGi>
        <NSelect
          v-model:value="searchForm.department"
          placeholder="全部部门"
          clearable
          filterable
          :loading="deptLoading"
          :options="departmentOptions"
          @update:value="(_v: string | null, _opt: any) => {}"
        />
      </NGi>
      <NGi>
        <NSelect
          v-model:value="searchForm.complianceStatus"
          placeholder="保险状态"
          clearable
          :options="[
            { label: '合规', value: 'compliant' },
            { label: '不合规', value: 'noncompliant' },
          ]"
          @update:value="(_v: string | null, _opt: any) => {}"
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
      :row-key="'rowKey'"
      auto-width
      @page-change="onPageChange"
      @sort-change="onSortChange"
    >
      <template #insuranceType="{ row }">
        <HseStatusTag :type="getInsuranceTypeTag(row)">
          {{ getInsuranceType(row) }}
        </HseStatusTag>
      </template>
      <template #compliance="{ row }">
        <HseStatusTag :type="COMPLIANCE_TAG[row.complianceStatus] || 'neutral'">
          {{ COMPLIANCE_LABEL[row.complianceStatus] || row.complianceStatus || '-' }}
        </HseStatusTag>
      </template>
      <template #policyStart="{ row }">
        {{ pickInsInfo(row)?.startDate || '-' }}
      </template>
      <template #policyEnd="{ row }">
        {{ pickInsInfo(row)?.expireDate || '-' }}
      </template>
      <template #premium="{ row }">
        {{ pickInsInfo(row)?.premium ? `${pickInsInfo(row)?.premium} 元` : '-' }}
      </template>
      <template #action="{ row }">
        <NSpace justify="center" :wrap="false" :size="4">
          <NButton size="small" type="primary" quaternary @click="openView(row)">
            查看
          </NButton>
          <NButton size="small" type="primary" quaternary @click="openEdit(row, 'employer')">
            编辑
          </NButton>
          <NPopconfirm @positive-click="onDelete(row)">
            <template #trigger>
              <NButton size="small" type="error" quaternary>删除</NButton>
            </template>
            确定删除该人员的保险记录吗？
          </NPopconfirm>
        </NSpace>
      </template>
    </HseDataGrid>

    <!-- 新增 / 编辑 / 查看 弹窗 -->
    <NModal
      v-model:show="formOpen"
      :title="
        formMode === 'create'
          ? '新增人员保险'
          : formMode === 'edit'
            ? '编辑人员保险'
            : '人员保险详情'
      "
      preset="card"
      style="width: 680px; max-width: 92vw"
      :mask-closable="false"
    >
      <NForm :disabled="formMode === 'view'" label-placement="top">
        <div class="grid grid-cols-2 gap-x-4">
          <NFormItem label="员工ID" required>
            <NInputNumber
              v-model:value="formModel.employeeId"
              placeholder="请输入员工ID"
              :min="1"
              style="width: 100%"
              :disabled="formMode === 'edit'"
            />
          </NFormItem>
          <NFormItem label="姓名">
            <NInput v-model:value="formModel.personName" placeholder="选填" :disabled="formMode === 'edit'" />
          </NFormItem>
          <NFormItem label="保险类型" required>
            <NSelect
              v-model:value="formModel.insuranceType"
              :options="PERSONNEL_INSURANCE_TYPES"
            />
          </NFormItem>
          <NFormItem label="保单号">
            <NInput v-model:value="formModel.policyNo" placeholder="选填" />
          </NFormItem>
          <NFormItem label="保额（元）">
            <NInputNumber
              v-model:value="formModel.coverageAmount"
              placeholder="选填"
              :min="0"
              style="width: 100%"
            />
          </NFormItem>
          <NFormItem label="保费（元）">
            <NInputNumber
              v-model:value="formModel.premium"
              placeholder="选填"
              :min="0"
              style="width: 100%"
            />
          </NFormItem>
          <NFormItem label="保险起期">
            <NInput v-model:value="formModel.startDate" placeholder="YYYY-MM-DD" />
          </NFormItem>
          <NFormItem label="保险到期">
            <NInput v-model:value="formModel.expireDate" placeholder="YYYY-MM-DD" />
          </NFormItem>
        </div>
        <NFormItem label="备注">
          <NInput
            v-model:value="formModel.remark"
            type="textarea"
            :rows="2"
            placeholder="选填"
          />
        </NFormItem>
      </NForm>
      <template v-if="formMode === 'view'">
        <NDivider title-placement="left">附件列表</NDivider>
        <div class="mb-3 flex items-center gap-2">
          <NUpload
            :custom-request="handleAttachmentUpload"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
            :show-file-list="false"
          >
            <NButton size="small" type="primary">
              <template #icon><Upload class="size-4" /></template>
              上传附件
            </NButton>
          </NUpload>
          <span class="text-muted" style="font-size: 12px">支持 PDF/Word/Excel/图片，单文件不超过 10MB</span>
        </div>
        <HseDataGrid
          :columns="attachmentColumns"
          :data="attachmentList"
          :loading="attachmentLoading"
          :pager="false"
          row-key="id"
          :height="300"
        >
          <template #version="{ row }">
            <span v-if="row.isLatest">v{{ row.version }}</span>
            <span v-else class="text-muted">v{{ row.version }}</span>
          </template>
          <template #size="{ row }">{{ formatFileSize(row.fileSize) }}</template>
          <template #attachmentAction="{ row }">
            <NSpace justify="center">
              <NButton size="small" type="primary" quaternary @click="handleAttachmentDownload(row)">
                下载
              </NButton>
              <NPopconfirm @positive-click="handleAttachmentDelete(row)">
                <template #trigger>
                  <NButton size="small" type="error" quaternary>删除</NButton>
                </template>
                确定删除该附件吗？
              </NPopconfirm>
            </NSpace>
          </template>
        </HseDataGrid>
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
      title="导入人员保险"
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

    <!-- 保单管理 -->
    <NModal
      v-model:show="policyManageVisible"
      title="保单管理"
      preset="card"
      style="width: 760px; max-width: 92vw"
    >
      <template #header-extra>
        <NButton type="primary" size="small" @click="openPolicyImport">
          <template #icon><FileUp class="size-4" /></template>
          导入保单
        </NButton>
      </template>
      <NAlert type="info" :show-icon="false" class="mb-3">
        保单主文档管理：上传 PDF 保单文件后，可在线预览、编辑保单号/年份，或删除。
      </NAlert>
      <HseDataGrid
        :columns="policyColumns"
        :data="policyList"
        :loading="policyLoading"
        :pager="false"
        row-key="id"
        :height="360"
      >
        <template #policyType="{ row }">
          <NTag :type="row.type === '工伤保险' ? 'success' : 'info'">{{ row.type }}</NTag>
        </template>
        <template #policyAction="{ row }">
          <NSpace justify="center" :wrap="false" :size="4">
            <NButton size="small" type="primary" quaternary @click="openPolicyFile(row.id)">
              查看
            </NButton>
            <NButton size="small" type="primary" quaternary @click="openPolicyEdit(row)">
              编辑
            </NButton>
            <NPopconfirm @positive-click="handlePolicyDelete(row)">
              <template #trigger>
                <NButton size="small" type="error" quaternary>删除</NButton>
              </template>
              确定删除该保单吗？
            </NPopconfirm>
          </NSpace>
        </template>
      </HseDataGrid>
      <NEmpty v-if="!policyLoading && policyList.length === 0" description="暂无保单，请先导入保单" class="py-6" />
    </NModal>

    <!-- 保单导入 / 编辑 -->
    <NModal
      v-model:show="policyEditVisible"
      :title="policyEditing ? '编辑保单' : '导入保单'"
      preset="card"
      style="width: 520px; max-width: 92vw"
      :mask-closable="false"
    >
      <NForm label-placement="top">
        <NAlert v-if="!policyEditing" type="info" :show-icon="false" class="mb-3">
          上传 PDF 保单文件，导入后在「保单管理」中点击即可在线预览。
        </NAlert>
        <NFormItem label="保单名称" required>
          <NInput v-model:value="policyForm.name" placeholder="如：2026年度雇主责任险保单" />
        </NFormItem>
        <NFormItem label="保险类型" required>
          <NSelect v-model:value="policyForm.type" :options="POLICY_TYPES" />
        </NFormItem>
        <NFormItem label="保单号">
          <NInput v-model:value="policyForm.policyNo" placeholder="如：PICC-2026-XXXX" />
        </NFormItem>
        <NFormItem label="保险年份">
          <NInput v-model:value="policyForm.year" placeholder="如：2026" />
        </NFormItem>
        <NFormItem v-if="!policyEditing" label="保单文件 (PDF)">
          <NUpload
            :custom-request="handlePolicyFileUpload"
            accept=".pdf"
            :show-file-list="true"
            :max="1"
          >
            <NButton>
              <template #icon><Upload class="size-4" /></template>
              选择 PDF 文件
            </NButton>
          </NUpload>
          <span class="text-muted" style="font-size: 12px">仅支持 PDF，单文件不超过 10MB</span>
        </NFormItem>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="policyEditVisible = false">取消</NButton>
          <NButton type="primary" :loading="policyEditLoading" @click="handlePolicySubmit">保存</NButton>
        </NSpace>
      </template>
    </NModal>
  </HsePageLayout>
</template>

<style scoped>
/* 统计卡可点击 + 选中高亮 */
.card-clickable {
  cursor: pointer;
  transition:
    box-shadow 0.2s ease,
    border-color 0.2s ease;
}
.card-clickable:hover {
  box-shadow: 0 2px 10px rgb(0 0 0 / 10%);
}
.card-active {
  border-color: #18a058 !important;
  box-shadow: 0 0 0 1px #18a058 inset;
}
.card-active .n-statistic-label,
.card-active .n-statistic-value {
  color: #18a058;
  font-weight: 600;
}
</style>
