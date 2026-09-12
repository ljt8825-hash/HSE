<script lang="ts" setup>
/**
 * 超龄人员管理（web-naive）
 * 以 web-antd 同视图为行为契约对齐：服务端分页 / 搜索 / 统计卡 / 规则说明 /
 * 查看（详情抽屉：基本信息 + 附件列表 + 历史版本）/ 编辑（保险管控弹窗）/
 * 通用导入（over-age 模块）/ CSV 导出。
 */
import { nextTick, reactive, ref, onMounted } from 'vue';
import {
  NAlert,
  NButton,
  NCard,
  NInputNumber,
  NPopconfirm,
  NDatePicker,
  NDescriptions,
  NDescriptionsItem,
  NDrawer,
  NDrawerContent,
  NForm,
  NFormItemGi,
  NGi,
  NGrid,
  NInput,
  NModal,
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
  getOverAgeAutoList,
  getOverAgeAutoStats,
  getFilterOptions,
  exportOverAgeAutoList,
  type EmployeeApi,
} from '#/api/hse/employee';
import {
  getInsuranceAttachments,
  uploadInsuranceAttachment,
  deleteInsuranceAttachment,
  getInsuranceVersions,
  getOverAgeDetail,
  updateOverAge,
  createOverAge,
  deleteOverAge,
} from '#/api/hse/insurance';
import type { InsuranceApi } from '#/api/hse/insurance';
import { useGenericImport } from '#/views/hse/_shared/useGenericImport';
import { message } from '#/adapter/naive';

defineOptions({ name: 'PersonnelOverAge' });

// ===================== 工具函数 =====================
const DEFAULT_MALE_THRESHOLD = 60;
const DEFAULT_FEMALE_THRESHOLD = 50;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
/** 时间戳(ms) → 'YYYY-MM-DD'，用于保险管控字段提交 */
function toIso(ts?: number | null): string {
  if (!ts) return '';
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
/** 'YYYY-MM-DD' → 时间戳(ms)，用于 NDatePicker 反填 */
function toStamp(dateStr?: string | null): number | null {
  if (!dateStr) return null;
  const t = new Date(dateStr).getTime();
  return Number.isNaN(t) ? null : t;
}
/** Date|number → 'YYYYMMDD'，用于导出文件名 */
function ymd(date?: Date | number): string {
  const d = date instanceof Date ? date : new Date(date ?? Date.now());
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

function formatDate(date?: string | null): string {
  if (!date) return '-';
  try {
    return new Date(date).toLocaleDateString('zh-CN');
  } catch {
    return date;
  }
}

function maskIdCard(idCard?: string): string {
  if (!idCard) return '-';
  if (idCard.startsWith('ENC:')) return '***加密数据***';
  return idCard.replace(/^(.{6}).*(.{4})$/, '$1********$2');
}

function maskPhone(phone?: string): string {
  if (!phone) return '-';
  if (phone.startsWith('ENC:')) return '***加密数据***';
  return phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2');
}

function getAgeTagColor(age: number): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
  if (age >= 70) return 'danger';
  if (age >= 65) return 'warning';
  if (age >= 60) return 'info';
  return 'success';
}

/** 超龄人员均为公司需要优化的高龄人员，风险等级统一标注「高风险」，不再按超龄年数分级 */
function getOverAgeRiskLevel(
  _years: number,
): { label: string; type: 'success' | 'warning' | 'error'; color?: { color: string; borderColor: string; textColor: string } } {
  return { label: '高风险', type: 'error' };
}

function formatFileSize(bytes: number): string {
  if (!bytes) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function formatDateTime(date?: string | null): string {
  if (!date) return '-';
  try {
    const d = new Date(date);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return date;
  }
}

/** 按性别取阈值：优先后端下发值，缺失回落占位默认 */
function getGenderThreshold(gender?: string): number {
  const t = stats.value.thresholds || {};
  if (gender === '女') return t['女'] ?? DEFAULT_FEMALE_THRESHOLD;
  return t['男'] ?? DEFAULT_MALE_THRESHOLD;
}
function getGenderThresholdText(gender?: string): string {
  const v = getGenderThreshold(gender);
  if (gender === '女') return `女性 ${v}岁`;
  if (gender === '男') return `男性 ${v}岁`;
  return `默认 ${v}岁`;
}

function getChangeTypeColor(type: string): 'success' | 'info' | 'warning' | 'error' | 'default' {
  switch (type) {
    case 'create': return 'success';
    case 'update': return 'info';
    case 'import': return 'success';
    case 'revise': return 'warning';
    case 'delete': return 'error';
    default: return 'default';
  }
}
function getChangeTypeText(type: string): string {
  switch (type) {
    case 'create': return '新增';
    case 'update': return '更新';
    case 'import': return '导入';
    case 'revise': return '修订';
    case 'delete': return '删除';
    default: return type;
  }
}

// ===================== 列表数据 =====================
const loading = ref(false);
const data = ref<EmployeeApi.OverAgeAutoItem[]>([]);
const total = ref(0);
const currentPage = ref(1);
const pageSize = ref(20);

const stats = ref<EmployeeApi.OverAgeAutoStats>({
  total: 0,
  byGender: {},
  byAgeGroup: {},
  topDepartments: [],
  thresholds: { 男: DEFAULT_MALE_THRESHOLD, 女: DEFAULT_FEMALE_THRESHOLD },
});

const searchForm = reactive({
  keyword: '',
  gender: '' as string | null,
  ageMin: null as number | null,
  ageMax: null as number | null,
  overAgeMin: null as number | null,
  overAgeMax: null as number | null,
  deptName: '' as string | null,
});

const deptOptions = ref<{ label: string; value: string }[]>([]);
async function loadDeptOptions() {
  try {
    const opts = await getFilterOptions();
    deptOptions.value = (opts.departments ?? []).map((d) => ({ label: d, value: d }));
  } catch {
    /* ignore */
  }
}

async function loadData() {
  loading.value = true;
  try {
    const res = await getOverAgeAutoList({
      page: currentPage.value,
      pageSize: pageSize.value,
      keyword: searchForm.keyword || undefined,
      gender: searchForm.gender || undefined,
      deptName: searchForm.deptName || undefined,
      ageMin: searchForm.ageMin || undefined,
      ageMax: searchForm.ageMax || undefined,
      overAgeMin: searchForm.overAgeMin || undefined,
      overAgeMax: searchForm.overAgeMax || undefined,
    } as any);
    data.value = res.list ?? [];
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
    const s = await getOverAgeAutoStats();
    if (s) {
      // F7：接口未下发 thresholds 时保留占位默认值，避免阈值展示变 undefined
      stats.value = { ...s, thresholds: s.thresholds || stats.value.thresholds };
    }
  } catch {
    // ignore
  }
}

// ===================== 搜索 =====================
function onSearch() {
  currentPage.value = 1;
  loadData();
}
function onReset() {
  searchForm.keyword = '';
  searchForm.gender = null;
  searchForm.ageMin = null;
  searchForm.ageMax = null;
  searchForm.overAgeMin = null;
  searchForm.overAgeMax = null;
  searchForm.deptName = null;
  onSearch();
}
function onPageChange(payload: { currentPage: number; pageSize: number }) {
  currentPage.value = payload.currentPage;
  pageSize.value = payload.pageSize;
  loadData();
}

// ===================== 操作栏 =====================
// 超龄人员基线有「导入 + 下载模板 + 导出」，无「新增」
const actionState = ref<Partial<Record<HseActionKey, { hidden?: boolean }>>>({
  create: { hidden: true },
});

async function onRefresh() {
  await Promise.all([loadData(), loadStats()]);
}

// ===================== 通用导入（over-age 模块） =====================
const {
  importOpen,
  importPreviewColumns,
  importPreviewData,
  importPreviewError,
  importConfirming,
  importResult,
  onDownloadTemplate,
  onUpload,
  onConfirmImport,
  onImportClose,
  bindRefresh,
} = useGenericImport('over-age');
bindRefresh(onRefresh);

// ===================== 导出（CSV Blob → 下载） =====================
async function onExport() {
  try {
    const blob = await exportOverAgeAutoList();
    // 校验 Content-Type：非 CSV/文本（如 JSON 错误响应）时解析并报错提示
    if (blob && blob.type && !blob.type.includes('csv') && !blob.type.includes('text')) {
      const text = await blob.text();
      try {
        const err = JSON.parse(text);
        message.error(err.message || '导出失败');
        return;
      } catch {
        // 非 JSON，继续下载
      }
    }
    const url = window.URL.createObjectURL(new Blob([blob]));
    const link = document.createElement('a');
    link.href = url;
    link.download = `超龄人员清单_${ymd()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
    message.success('导出成功');
  } catch (e) {
    console.warn('导出失败:', e);
    message.error('导出失败');
  }
}

// ===================== 表格列 =====================
const overAgeColumns = ref<VxeTableGridColumns>([
  { type: 'checkbox', width: 50, align: 'center', fixed: 'left' },
  { title: '序号', field: '_index', type: 'seq', width: 60, align: 'center' },
  { title: '姓名', field: 'name', minWidth: 100, align: 'center' },
  { title: '性别', field: 'gender', minWidth: 70, align: 'center' },
  { title: '年龄', field: 'age', minWidth: 90, align: 'center', slots: { default: 'age' } },
  { title: '超龄年数', field: 'over_age_years', minWidth: 100, align: 'center', slots: { default: 'overAge' } },
  { title: '风险等级', field: 'riskLevel', minWidth: 100, align: 'center', slots: { default: 'riskLevel' } },
  { title: '出生日期', field: 'birth_date', minWidth: 120, align: 'center', slots: { default: 'birthDate' }, formatter: ({ cellValue }) => (cellValue ? formatDate(cellValue) : '-') },
  { title: '身份证号', field: 'id_card', minWidth: 170, align: 'center', slots: { default: 'idCard' } },
  { title: '部门', field: 'dept_name', minWidth: 140, align: 'center', showOverflow: 'tooltip' },
  { title: '岗位', field: 'position_name', minWidth: 130, align: 'center', showOverflow: 'tooltip' },
  { title: '联系方式', field: 'phone', minWidth: 130, align: 'center', slots: { default: 'phone' } },
  {
    title: '操作',
    field: 'action',
    width: 200,
    align: 'center',
    fixed: 'right',
    slots: { default: 'action' },
  },
]);

// ===================== 查看（详情抽屉） =====================
const detailDrawerVisible = ref(false);
const detailActiveTab = ref('info');
const currentDetail = ref<any>(null);

const attachmentList = ref<InsuranceApi.InsuranceAttachment[]>([]);
const attachmentLoading = ref(false);
const attachmentColumns = ref<VxeTableGridColumns>([
  { title: '文件名', field: 'originalName', minWidth: 160, align: 'left', slots: { default: 'fileName' } },
  { title: '版本', field: 'version', width: 130, align: 'center', slots: { default: 'version' } },
  { title: '大小', field: 'fileSize', width: 100, align: 'center', slots: { default: 'fileSize' } },
  { title: '上传人', field: 'uploadedBy', width: 100, align: 'center' },
  { title: '操作', field: 'action', width: 120, align: 'center', slots: { default: 'attachmentAction' } },
]);

const versionList = ref<InsuranceApi.InsuranceVersionRecord[]>([]);
const versionLoading = ref(false);
const versionColumns = ref<VxeTableGridColumns>([
  { title: '版本号', field: 'version', width: 100, align: 'center' },
  { title: '变更类型', field: 'changeType', width: 100, align: 'center', slots: { default: 'changeType' } },
  { title: '变更说明', field: 'changeSummary', minWidth: 160, align: 'left', showOverflow: 'tooltip' },
  { title: '操作人', field: 'changedBy', width: 100, align: 'center' },
  { title: '变更时间', field: 'createdAt', width: 170, align: 'center', slots: { default: 'createdAt' } },
]);

async function handleViewDetail(record: any) {
  currentDetail.value = record;
  detailActiveTab.value = 'info';
  detailDrawerVisible.value = true;
  await nextTick();
  const bizId = record.over_age_id || record.id;
  fetchAttachments(bizId);
  fetchVersions(bizId);
}

async function fetchAttachments(bizId: number) {
  attachmentLoading.value = true;
  try {
    const res = await getInsuranceAttachments('overage', bizId);
    attachmentList.value = res || [];
  } catch (err) {
    console.warn('获取附件列表失败:', err);
    attachmentList.value = [];
  } finally {
    attachmentLoading.value = false;
  }
}

async function fetchVersions(bizId: number) {
  versionLoading.value = true;
  try {
    const res = await getInsuranceVersions('overage', bizId);
    versionList.value = res || [];
  } catch (err) {
    console.warn('获取版本履历失败:', err);
    versionList.value = [];
  } finally {
    versionLoading.value = false;
  }
}

function handleAttachmentChange({ file }: { file?: any }) {
  const raw: File | undefined = file?.file ?? file;
  if (!raw || !(raw instanceof File)) return;
  if (raw.size / 1024 / 1024 >= 10) {
    message.error('文件大小不能超过 10MB');
    return;
  }
  if (!currentDetail.value) return;
  const bizId = currentDetail.value.over_age_id || currentDetail.value.id;
  uploadInsuranceAttachment('overage', bizId, raw, { uploadedBy: 'admin' })
    .then(() => {
      message.success('上传成功');
      fetchAttachments(bizId);
    })
    .catch(() => message.error('上传失败'));
}

function handleDownloadAttachment(record: InsuranceApi.InsuranceAttachment) {
  if (record.fileUrl) window.open(record.fileUrl, '_blank');
}

async function handleDeleteAttachment(record: InsuranceApi.InsuranceAttachment) {
  if (!currentDetail.value) return;
  const bizId = currentDetail.value.over_age_id || currentDetail.value.id;
  try {
    await deleteInsuranceAttachment('overage', bizId, record.id);
    message.success('删除成功');
    fetchAttachments(bizId);
  } catch (err) {
    console.warn('删除附件失败:', err);
    message.error('删除失败');
  }
}

// ===================== 编辑（保险管控弹窗） =====================
const editModalVisible = ref(false);
const editLoading = ref(false);
const editingRecord = ref<any>(null);
const editForm = ref({
  control_type: '',
  actual_insurance: '',
  has_injury: false,
  has_employer: false,
  compliance: '',
  expire_date: null as number | null,
  optimize_status: '待处理',
  optimize_date: null as number | null,
  optimize_remark: '',
});

const controlTypeOptions = [
  { label: '重点关注', value: '重点关注' },
  { label: '一般关注', value: '一般关注' },
  { label: '定期复查', value: '定期复查' },
];
const complianceOptions = [
  { label: '合规', value: '合规' },
  { label: '不合规', value: '不合规' },
  { label: '待确认', value: '待确认' },
];
const optimizeStatusOptions = [
  { label: '待处理', value: '待处理' },
  { label: '处理中', value: '处理中' },
  { label: '已完成', value: '已完成' },
  { label: '无需处理', value: '无需处理' },
];

async function openEditDialog(record: any) {
  editingRecord.value = record;
  editModalVisible.value = true;
  const defaultForm = {
    control_type: '',
    actual_insurance: '',
    has_injury: false,
    has_employer: false,
    compliance: '',
    expire_date: null as number | null,
    optimize_status: '待处理',
    optimize_date: null as number | null,
    optimize_remark: '',
  };
  if (record.over_age_id) {
    try {
      const detail = await getOverAgeDetail(record.over_age_id);
      editForm.value = {
        control_type: detail.control_type || '',
        actual_insurance: detail.actual_insurance || '',
        has_injury: detail.has_injury || false,
        has_employer: detail.has_employer || false,
        compliance: detail.compliance || '',
        expire_date: toStamp(detail.expire_date),
        optimize_status: detail.optimize_status || '待处理',
        optimize_date: toStamp(detail.optimize_date),
        optimize_remark: detail.optimize_remark || '',
      };
      return;
    } catch {
      // 无记录则使用默认值
    }
  }
  editForm.value = defaultForm;
}

async function handleEditSave() {
  if (!editingRecord.value) return;
  editLoading.value = true;
  try {
    const payload = {
      ...editForm.value,
      expire_date: editForm.value.expire_date ? toIso(editForm.value.expire_date) : null,
      optimize_date: editForm.value.optimize_date ? toIso(editForm.value.optimize_date) : null,
    };
    if (editingRecord.value.over_age_id) {
      await updateOverAge(editingRecord.value.over_age_id, payload);
    } else {
      await createOverAge({
        personnel_id: editingRecord.value.id,
        name: editingRecord.value.name,
        id_card: editingRecord.value.id_card,
        gender: editingRecord.value.gender,
        birth_date: editingRecord.value.birth_date,
        age: editingRecord.value.age,
        dept: editingRecord.value.dept_name,
        position: editingRecord.value.position_name,
        ...payload,
      });
    }
    message.success('保存成功');
    editModalVisible.value = false;
    onRefresh();
  } catch (e: any) {
    message.error(e?.message || '保存失败');
  } finally {
    editLoading.value = false;
  }
}

// 删除超龄人员记录（复用既有 deleteOverAge 后端，带二次确认）
async function handleDelete(row: any) {
  const id = row.over_age_id || row.id;
  if (id == null) return;
  try {
    await deleteOverAge(id);
    message.success('删除成功');
    onRefresh();
  } catch (e: any) {
    message.error(e?.message || '删除失败');
  }
}

// ===================== 导出（CSV）/ 批量删除 =====================
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
    await Promise.all(
      rows.map((row) => deleteOverAge(row.over_age_id || row.id)),
    );
    message.success(`已删除 ${rows.length} 条`);
    onRefresh();
  } catch (e: any) {
    message.error(e?.message || '批量删除失败');
  }
}

onMounted(async () => {
  // 先取阈值（详情抽屉阈值文案首帧为后端权威值）
  await loadStats();
  loadData();
  loadDeptOptions();
});
</script>

<template>
  <HsePageLayout :title="$t('page.hse.overAge')" :description="$t('page.hse.overAgeDesc')">
    <template #extra>
      <NSpace>
        <HseActionBar
          :actions="actionState"
          @refresh="onRefresh"
          @download-template="onDownloadTemplate"
          @import="() => (importOpen = true)"
          @export="onExport"
        />
        <NButton
          type="error"
          @click="onBatchDelete"
        >
          批量删除
        </NButton>
      </NSpace>
    </template>

    <!-- 统计卡 -->
    <div class="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
      <NCard :bordered="false">
        <NStatistic label="超龄人员总数" :value="stats.total" />
      </NCard>
      <NCard :bordered="false">
        <NStatistic label="男性超龄" :value="stats.byGender['男'] || stats.byGender['1'] || 0" />
      </NCard>
      <NCard :bordered="false">
        <NStatistic label="女性超龄" :value="stats.byGender['女'] || stats.byGender['2'] || 0" />
      </NCard>
      <NCard :bordered="false">
        <NStatistic label="70岁以上" :value="stats.byAgeGroup['70岁以上'] || 0" />
      </NCard>
    </div>

    <!-- 搜索 -->
    <HseSearchPanel @query="onSearch" @reset="onReset">
      <NGi>
        <NInput
          v-model:value="searchForm.keyword"
          placeholder="姓名 / 工号"
          clearable
          @keyup.enter="onSearch"
        />
      </NGi>
      <NGi>
        <NSelect
          v-model:value="searchForm.gender"
          placeholder="性别"
          clearable
          :options="[
            { label: '男', value: '男' },
            { label: '女', value: '女' },
          ]"
        />
      </NGi>
      <NGi>
        <NInputNumber
          v-model:value="searchForm.ageMin"
          placeholder="年龄≥"
          clearable
          :min="0"
          style="width: 100%"
        />
      </NGi>
      <NGi>
        <NInputNumber
          v-model:value="searchForm.ageMax"
          placeholder="年龄≤"
          clearable
          :min="0"
          style="width: 100%"
        />
      </NGi>
      <NGi>
        <NInputNumber
          v-model:value="searchForm.overAgeMin"
          placeholder="超龄年数≥"
          clearable
          :min="0"
          style="width: 100%"
        />
      </NGi>
      <NGi>
        <NInputNumber
          v-model:value="searchForm.overAgeMax"
          placeholder="超龄年数≤"
          clearable
          :min="0"
          style="width: 100%"
        />
      </NGi>
      <NGi>
        <NSelect
          v-model:value="searchForm.deptName"
          placeholder="部门"
          clearable
          :options="deptOptions"
          filterable
        />
      </NGi>
    </HseSearchPanel>

    <!-- 表格 -->
    <HseDataGrid
      ref="gridRef"
      :columns="overAgeColumns"
      :data="data"
      :loading="loading"
      :pager="true"
      :total="total"
      @page-change="onPageChange"
    >
      <template #age="{ row }">
        <HseStatusTag :type="getAgeTagColor(row.age)">
          {{ row.age }} 岁
        </HseStatusTag>
      </template>
      <template #overAge="{ row }">
        <NTag type="error" size="small" round>超龄 {{ row.over_age_years }} 年</NTag>
      </template>
      <template #riskLevel="{ row }">
        <NTag size="small" :bordered="false" v-bind="getOverAgeRiskLevel(row.over_age_years)">
          {{ getOverAgeRiskLevel(row.over_age_years).label }}
        </NTag>
      </template>
      <template #birthDate="{ row }">
        {{ formatDate(row.birth_date) }}
      </template>
      <template #idCard="{ row }">
        {{ maskIdCard(row.id_card) }}
      </template>
      <template #phone="{ row }">
        {{ maskPhone(row.phone) }}
      </template>
      <template #action="{ row }">
        <NSpace justify="center">
          <NButton size="small" type="primary" quaternary @click="handleViewDetail(row)">查看</NButton>
          <NButton size="small" type="primary" quaternary @click="openEditDialog(row)">编辑</NButton>
          <NPopconfirm @positive-click="handleDelete(row)">
            <template #trigger>
              <NButton size="small" type="error" quaternary>删除</NButton>
            </template>
            确定删除该超龄人员记录吗？
          </NPopconfirm>
        </NSpace>
      </template>
    </HseDataGrid>

    <!-- 详情抽屉 -->
    <NDrawer v-model:show="detailDrawerVisible" :width="720">
      <NDrawerContent title="超龄人员详情" :native-scrollbar="false">
        <template v-if="currentDetail">
          <NTabs v-model:value="detailActiveTab">
            <!-- 基本信息 -->
            <NTabPane name="info" tab="基本信息">
              <NAlert
                type="warning"
                :show-icon="true"
                class="mb-4"
                :title="getGenderThresholdText(currentDetail.gender)"
                :description="`当前年龄 ${currentDetail.age} 岁，已超龄 ${currentDetail.over_age_years || 0} 年`"
              />
              <NDescriptions :column="2" bordered size="small">
                <NDescriptionsItem label="姓名">{{ currentDetail.name }}</NDescriptionsItem>
                <NDescriptionsItem label="性别">{{ currentDetail.gender || '-' }}</NDescriptionsItem>
                <NDescriptionsItem label="身份证号">{{ maskIdCard(currentDetail.id_card) }}</NDescriptionsItem>
                <NDescriptionsItem label="工号">{{ currentDetail.employee_code || '-' }}</NDescriptionsItem>
                <NDescriptionsItem label="出生日期">{{ formatDate(currentDetail.birth_date) }}</NDescriptionsItem>
                <NDescriptionsItem label="年龄">
                  <NTag type="error" size="small">{{ currentDetail.age }} 岁</NTag>
                </NDescriptionsItem>
                <NDescriptionsItem label="年龄阈值">{{ getGenderThreshold(currentDetail.gender) }} 岁</NDescriptionsItem>
                <NDescriptionsItem label="超龄年数">
                  <NTag type="warning" size="small">{{ currentDetail.over_age_years || 0 }} 年</NTag>
                </NDescriptionsItem>
                <NDescriptionsItem label="部门">{{ currentDetail.dept_name || currentDetail.dept || '-' }}</NDescriptionsItem>
                <NDescriptionsItem label="岗位">{{ currentDetail.position_name || currentDetail.position || '-' }}</NDescriptionsItem>
                <NDescriptionsItem label="联系方式">{{ maskPhone(currentDetail.phone) }}</NDescriptionsItem>
                <NDescriptionsItem label="人员分类">{{ currentDetail.person_category || '-' }}</NDescriptionsItem>
                <NDescriptionsItem label="是否公益岗">{{ currentDetail.is_public_welfare ? '是' : '否' }}</NDescriptionsItem>
              </NDescriptions>
            </NTabPane>

            <!-- 附件列表 -->
            <NTabPane name="attachments" tab="附件列表">
              <div class="mb-3 flex items-center gap-3">
                <NUpload
                  :default-upload="false"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                  :show-file-list="false"
                  @change="handleAttachmentChange"
                >
                  <NButton type="primary" size="small">上传附件</NButton>
                </NUpload>
                <span class="text-xs text-muted-foreground">支持 PDF/Word/Excel/图片，单文件不超过 10MB</span>
              </div>
              <HseDataGrid
                :columns="attachmentColumns"
                :data="attachmentList"
                :loading="attachmentLoading"
                :pager="false"
              >
                <template #fileName="{ row }">
                  <a class="cursor-pointer text-[var(--vxe-ui-font-primary-color)] hover:underline" @click="handleDownloadAttachment(row)">
                    {{ row.originalName }}
                  </a>
                </template>
                <template #version="{ row }">
                  <NTag v-if="row.isLatest" type="info" size="small">v{{ row.version }} (最新)</NTag>
                  <NTag v-else size="small">v{{ row.version }}</NTag>
                </template>
                <template #fileSize="{ row }">
                  {{ formatFileSize(row.fileSize) }}
                </template>
                <template #attachmentAction="{ row }">
                  <NSpace justify="center" :size="4">
                    <NButton size="small" type="primary" text @click="handleDownloadAttachment(row)">下载</NButton>
                    <NButton size="small" type="error" text @click="handleDeleteAttachment(row)">删除</NButton>
                  </NSpace>
                </template>
              </HseDataGrid>
            </NTabPane>

            <!-- 历史版本 -->
            <NTabPane name="versions" tab="历史版本">
              <HseDataGrid
                :columns="versionColumns"
                :data="versionList"
                :loading="versionLoading"
                :pager="false"
              >
                <template #changeType="{ row }">
                  <NTag :type="getChangeTypeColor(row.changeType)" size="small">
                    {{ getChangeTypeText(row.changeType) }}
                  </NTag>
                </template>
                <template #createdAt="{ row }">
                  {{ formatDateTime(row.createdAt) }}
                </template>
              </HseDataGrid>
            </NTabPane>
          </NTabs>
        </template>
      </NDrawerContent>
    </NDrawer>

    <!-- 编辑保险管控弹窗 -->
    <NModal
      v-model:show="editModalVisible"
      title="编辑保险管控信息"
      preset="card"
      style="width: 720px; max-width: 92vw"
      :mask-closable="false"
    >
      <NForm :model="editForm" label-placement="top">
        <NGrid :cols="2" :x-gap="16">
          <NFormItemGi :span="1" label="管控类型">
            <NSelect
              v-model:value="editForm.control_type"
              :options="controlTypeOptions"
              placeholder="请选择管控类型"
              clearable
            />
          </NFormItemGi>
          <NFormItemGi :span="1" label="实际保险">
            <NInput v-model:value="editForm.actual_insurance" placeholder="如：雇主责任险、意外险" />
          </NFormItemGi>
          <NFormItemGi :span="1" label="工伤险">
            <NRadioGroup v-model:value="editForm.has_injury">
              <NRadio :value="true">有</NRadio>
              <NRadio :value="false">无</NRadio>
            </NRadioGroup>
          </NFormItemGi>
          <NFormItemGi :span="1" label="雇主险">
            <NRadioGroup v-model:value="editForm.has_employer">
              <NRadio :value="true">有</NRadio>
              <NRadio :value="false">无</NRadio>
            </NRadioGroup>
          </NFormItemGi>
          <NFormItemGi :span="1" label="合规情况">
            <NSelect
              v-model:value="editForm.compliance"
              :options="complianceOptions"
              placeholder="请选择"
              clearable
            />
          </NFormItemGi>
          <NFormItemGi :span="1" label="保险到期日">
            <NDatePicker v-model:value="editForm.expire_date" type="date" style="width: 100%" />
          </NFormItemGi>
          <NFormItemGi :span="1" label="优化状态">
            <NSelect v-model:value="editForm.optimize_status" :options="optimizeStatusOptions" />
          </NFormItemGi>
          <NFormItemGi :span="1" label="优化日期">
            <NDatePicker v-model:value="editForm.optimize_date" type="date" style="width: 100%" />
          </NFormItemGi>
          <NFormItemGi :span="2" label="优化备注">
            <NInput v-model:value="editForm.optimize_remark" placeholder="备注信息" />
          </NFormItemGi>
        </NGrid>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton :disabled="editLoading" @click="editModalVisible = false">取消</NButton>
          <NButton type="primary" :loading="editLoading" @click="handleEditSave">保存</NButton>
        </NSpace>
      </template>
    </NModal>

    <!-- 通用导入（over-age 模块） -->
    <HseImportDialog
      v-model:open="importOpen"
      title="导入超龄人员"
      :preview-columns="importPreviewColumns"
      :preview-data="importPreviewData"
      :preview-error="importPreviewError"
      :confirming="importConfirming"
      :result="importResult"
      @download-template="onDownloadTemplate"
      @upload="onUpload"
      @confirm="onConfirmImport"
      @close="onImportClose"
    />
  </HsePageLayout>
</template>
