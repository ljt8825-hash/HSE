<script lang="ts" setup>
/**
 * 消防设施管理（web-naive · 阶段06B-1）
 * 契约来源：apps/web-antd/src/api/hse/site.ts（site.ts 适配层已按契约创建，/site-mgmt/fire-equipment）
 * 能力：统计（服务端 getSiteStats）/ 筛选 / 服务端分页列表 / 详情抽屉 / 新增·编辑 / 删除(二次确认) /
 *      导入(useGenericImport 'fire-facility') / 刷新；负责人从员工选择器真实拉取（核对现有 employee.ts 契约后复用）
 * 边界：不改服务端；表格无列宽/顺序拖动；若站点关联等旧版行为依赖不存在接口，将如实记录阻断。
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
  NSpin,
  NStatistic,
  NTag,
  NText,
  NAlert,
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
  createFireEquipment,
  deleteFireEquipment,
  getFireEquipmentList,
  getSiteStats,
  updateFireEquipment,
  type SiteApi,
} from '#/api/hse/site';
import { getDeptTree, getEmployeeList, type EmployeeApi } from '#/api/hse/employee';
import { useGenericImport } from '#/views/hse/_shared/useGenericImport';
import { message } from '#/adapter/naive';

defineOptions({ name: 'SiteFireFacility' });

// ===================== 映射 =====================
const TYPE_OPTIONS = ['灭火器', '消防栓', '喷淋系统', '烟感探测器', '应急照明', '疏散指示牌', '防火门'];
const STATUS_OPTIONS = ['正常', '过期', '损坏', '维修中', '缺失'];
const STATUS_TAG: Record<string, 'success' | 'info' | 'warning' | 'danger' | 'neutral'> = {
  正常: 'success',
  过期: 'danger',
  损坏: 'danger',
  维修中: 'warning',
  缺失: 'warning',
};

// ===================== 列表数据 =====================
const loading = ref(false);
const data = ref<SiteApi.FireEquipment[]>([]);
const total = ref(0);
const currentPage = ref(1);
const pageSize = ref(20);
const sortBy = ref<string | undefined>(undefined);
const sortOrder = ref<'asc' | 'desc' | undefined>(undefined);

const searchForm = reactive({
  keyword: '',
  type: undefined as string | undefined,
  status: undefined as string | undefined,
  location: undefined as string | undefined,
  year: undefined as string | undefined,
  month: undefined as string | undefined,
  expiryRange: null as [number, number] | null,
});

async function loadData() {
  loading.value = true;
  try {
    const res = await getFireEquipmentList({
      page: currentPage.value,
      pageSize: pageSize.value,
      keyword: searchForm.keyword || undefined,
      type: searchForm.type,
      status: searchForm.status,
      location: searchForm.location,
      year: searchForm.year,
      month: searchForm.month,
      startDate: searchForm.expiryRange?.[0]
        ? formatTs(searchForm.expiryRange[0])
        : undefined,
      endDate: searchForm.expiryRange?.[1]
        ? formatTs(searchForm.expiryRange[1])
        : undefined,
      sortField: sortBy.value,
      sortOrder: sortOrder.value,
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

// 服务端站点统计（含消防设施 4 项：总数 / 正常 / 异常 / 已过期）
const statTotal = ref(0);
const statNormal = ref(0);
const statAbnormal = ref(0);
const statExpired = ref(0);
// 到期日期预警统计（纯前端，基于当前列表数据；缺/无效到期日期不计入任何分桶）
const expiryStats = computed(() => {
  const rows = data.value || [];
  let normal = 0;
  let expiring = 0;
  let expired = 0;
  for (const row of rows) {
    if (!row.expiryDate) continue;
    const diff = diffDays(row.expiryDate);
    if (diff < 0) expired++;
    else if (diff <= 30) expiring++;
    else normal++;
  }
  return { total: rows.length, normal, expiring, expired };
});
const statItems = computed(() => [
  { key: 'total', label: '设施总数', value: expiryStats.value.total, type: 'default' },
  { key: 'normal', label: '正常', value: expiryStats.value.normal, type: 'default' },
  { key: 'expiring', label: '即将到期', value: expiryStats.value.expiring, type: 'warning' },
  { key: 'expired', label: '已过期', value: expiryStats.value.expired, type: 'error' },
]);
async function loadStats() {
  try {
    const s = await getSiteStats();
    statTotal.value = s.totalFireEquipment ?? 0;
    statNormal.value = s.normalFireEquipment ?? 0;
    statAbnormal.value = s.abnormalFireEquipment ?? 0;
    statExpired.value = s.expiredFireEquipment ?? 0;
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
  Object.assign(searchForm, {
    keyword: '',
    type: undefined,
    status: undefined,
    location: undefined,
    year: undefined,
    month: undefined,
    expiryRange: null,
  });
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

// ===================== 操作栏 / 导入 =====================
// 消防设施导出：复用 HseDataGrid 内置 CSV 导出
function handleExport() {
  gridRef.value?.gridApi?.grid?.exportData({ type: 'csv' });
}

// ===================== 批量删除 =====================
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
    for (const row of rows) {
      await deleteFireEquipment(row.id);
    }
    message.success(`已批量删除 ${rows.length} 条`);
    onRefresh();
  } catch {
    /* 拦截器已提示 */
  }
}

// ===================== 动作状态 =====================
// 消防设施 export 已取消隐藏，改为前端 CSV 导出
const actionState = ref<Partial<Record<HseActionKey, { hidden?: boolean }>>>({
  export: {},
});
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
} = useGenericImport('fire-facility');
// 导入确认成功后：刷新列表 + 执行负责人-花名册匹配校验（旧版行为恢复）
async function onImportSuccess() {
  await Promise.all([loadData(), loadStats(), loadRosterByStation()]);
  await checkPersonnelMatch();
}
bindImportRefresh(onImportSuccess);

async function onRefresh() {
  await Promise.all([loadData(), loadStats(), loadTransferStations(), loadRosterByStation()]);
}

// ===================== 站点关联 / 花名册（旧版行为恢复） =====================
// 安装位置选项：各乡镇转运站（动态加载，兜底硬编码，与旧版一致）
const locationOptions = ref<string[]>([
  '宁津镇转运站',
  '柴胡店镇转运站',
  '时集镇转运站',
  '保店镇转运站',
]);
async function loadTransferStations() {
  try {
    const deptTree = await getDeptTree({ includeInactive: false });
    const stations = new Set<string>();
    function collect(nodes: EmployeeApi.DeptNode[]) {
      for (const node of nodes) {
        if (node.level === 2 && node.name.includes('转运站')) {
          stations.add(node.name);
        }
        if (node.children?.length) {
          collect(node.children);
        }
      }
    }
    collect(deptTree);
    if (stations.size > 0) {
      locationOptions.value = Array.from(stations).sort();
    }
    // stations 为空时保持兜底列表（与旧版行为一致）
  } catch {
    /* 兜底：保持兜底列表 */
  }
}

// 从转运站名提取乡镇（兼容：web-naive EmployeeListParams 无 township 参数，
// 采用全量拉取 + org_path 二级部门过滤方案，不改后端）
function getTownshipFromStation(stationName: string): string {
  return stationName.replace('转运站', '').trim();
}
function getSecondaryDept(orgPath?: string): string {
  if (!orgPath) return '';
  const parts = orgPath.split('/').filter(Boolean);
  return parts[1] || '';
}

const managerOptions = ref<{ label: string; value: string; phone?: string }[]>([]);
const rosterEmployees = ref<EmployeeApi.EmployeeItem[]>([]);
const rosterTip = ref('');

// 按安装位置加载花名册人员（过滤 org_path 二级部门 === 转运站名）
async function fetchRosterForLocation(location: string) {
  if (!location) {
    managerOptions.value = [];
    rosterEmployees.value = [];
    rosterTip.value = '';
    return;
  }
  try {
    const township = getTownshipFromStation(location);
    const res = await getEmployeeList({ township: township as any, pageSize: 9999 } as any);
    const employees = (res.list || []).filter((emp) => getSecondaryDept(emp.org_path) === location);
    rosterEmployees.value = employees;
    managerOptions.value = employees.map((e) => ({
      label: `${e.name || ''}（${e.employee_code || ''}）`,
      value: e.name || '',
      phone: e.phone || '',
    }));
    if (employees.length === 0) {
      rosterTip.value = `未找到 ${location} 的花名册人员，可手动输入`;
    } else {
      rosterTip.value = `已关联 ${location} 花名册 ${employees.length} 人`;
    }
  } catch {
    managerOptions.value = [];
    rosterEmployees.value = [];
    rosterTip.value = '花名册加载失败，可手动输入';
  }
}

function handleLocationChange(value: string | null) {
  const loc = typeof value === 'string' ? value : '';
  formModel.manager = '';
  formModel.phone = '';
  fetchRosterForLocation(loc);
}

// 选择负责人时回填既有电话字段
// Naive NSelect @update:value 回调签名：(value, option)；第一个参数是选中值（姓名），第二个参数才是带 phone 的 option。
function handleManagerSelect(
  _value: string | number | null,
  option: { phone?: string } | null,
) {
  if (option?.phone) {
    formModel.phone = option.phone;
  }
}

// ===================== 导入后人员匹配校验（旧版行为恢复） =====================
const rosterByStation = ref<Record<string, EmployeeApi.EmployeeItem[]>>({});
const personnelMatchVisible = ref(false);
const personnelMatchLoading = ref(false);
const personnelMatchResult = ref<{
  total: number;
  matched: number;
  mismatches: Array<{ id: number; name: string; location: string; manager: string; rosterNames: string[] }>;
} | null>(null);

function isManagerMismatch(record: SiteApi.FireEquipment): boolean {
  if (!record.manager || !record.location) return false;
  const roster = rosterByStation.value[record.location];
  if (!roster) return false;
  return !roster.some((emp) => emp.name === record.manager);
}

async function loadRosterByStation() {
  try {
    const res = await getEmployeeList({ pageSize: 9999 } as any);
    const grouped: Record<string, EmployeeApi.EmployeeItem[]> = {};
    for (const emp of res.list || []) {
      const station = getSecondaryDept(emp.org_path);
      if (station && station.includes('转运站')) {
        if (!grouped[station]) grouped[station] = [];
        grouped[station].push(emp);
      }
    }
    rosterByStation.value = grouped;
  } catch {
    rosterByStation.value = {};
  }
}

async function checkPersonnelMatch() {
  personnelMatchLoading.value = true;
  personnelMatchVisible.value = true;
  try {
    await loadRosterByStation();
    const mismatches: Array<{ id: number; name: string; location: string; manager: string; rosterNames: string[] }> = [];
    let matched = 0;
    for (const facility of data.value) {
      if (!facility.manager) continue;
      const station = facility.location || '';
      const roster = rosterByStation.value[station] || [];
      const found = roster.some((emp) => emp.name === facility.manager);
      if (found) {
        matched++;
      } else {
        mismatches.push({
          id: facility.id,
          name: facility.name,
          location: station || '-',
          manager: facility.manager,
          rosterNames: roster.map((e) => e.name),
        });
      }
    }
    personnelMatchResult.value = {
      total: data.value.filter((f) => f.manager).length,
      matched,
      mismatches,
    };
  } finally {
    personnelMatchLoading.value = false;
  }
}

function handleDownloadMatchErrors() {
  if (!personnelMatchResult.value?.mismatches.length) return;
  const headers = '设施名称,安装位置,负责人,花名册人员,状态\n';
  const rows = personnelMatchResult.value.mismatches
    .map((r) => {
      const roster = r.rosterNames.length ? r.rosterNames.join('、') : '无';
      return `"${r.name}","${r.location}","${r.manager}","${roster}","不匹配"`;
    })
    .join('\n');
  const blob = new Blob(['\uFEFF' + headers + rows], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'fire-facility_personnel_mismatch.csv';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

// ===================== 负责人选择（站点花名册为主选） =====================

// ===================== 新增 / 编辑 / 查看 =====================
const formOpen = ref(false);
const formMode = ref<'create' | 'edit' | 'view'>('create');
const formLoading = ref(false);
const editingId = ref<number | null>(null);
const formModel = reactive<Partial<SiteApi.FireEquipment>>({
  name: '',
  type: '',
  model: '',
  location: '',
  status: '正常',
  quantity: 1,
  installDate: '',
  expiryDate: '',
  lastCheckDate: '',
  nextCheckDate: '',
  manager: '',
  phone: '',
  remark: '',
});

function resetForm() {
  Object.assign(formModel, {
    name: '',
    type: '',
    model: '',
    location: '',
    status: '正常',
    quantity: 1,
    installDate: '',
    expiryDate: '',
    lastCheckDate: '',
    nextCheckDate: '',
    manager: '',
    phone: '',
    remark: '',
  });
}
function openCreate() {
  resetForm();
  formMode.value = 'create';
  editingId.value = null;
  formOpen.value = true;
}
function openEdit(row: SiteApi.FireEquipment) {
  resetForm();
  formMode.value = 'edit';
  editingId.value = row.id;
  Object.assign(formModel, {
    name: row.name ?? '',
    type: row.type ?? '',
    model: row.model ?? '',
    location: row.location ?? '',
    status: row.status ?? '正常',
    quantity: row.quantity ?? 1,
    installDate: row.installDate ?? '',
    expiryDate: row.expiryDate ?? '',
    lastCheckDate: row.lastCheckDate ?? '',
    nextCheckDate: row.nextCheckDate ?? '',
    manager: row.manager ?? '',
    phone: row.phone ?? '',
    remark: row.remark ?? '',
  });
  formOpen.value = true;
}
function openView(row: SiteApi.FireEquipment) {
  currentRecord.value = row;
  detailDrawerVisible.value = true;
}

async function onSubmit() {
  if (!formModel.name) {
    message.warning('请输入设施名称');
    return;
  }
  if (!formModel.type) {
    message.warning('请选择设施类型');
    return;
  }
  formLoading.value = true;
  try {
    const payload: Partial<SiteApi.FireEquipment> = { ...formModel };
    if (formMode.value === 'edit' && editingId.value != null) {
      await updateFireEquipment(editingId.value, payload);
      message.success('更新成功');
    } else {
      await createFireEquipment(payload);
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

// ===================== 删除 =====================
async function onDelete(row: SiteApi.FireEquipment) {
  try {
    await deleteFireEquipment(row.id);
    message.success('删除成功');
    onRefresh();
  } catch {
    /* 拦截器已提示 */
  }
}

// ===================== 行编辑（快速修改；弹窗编辑保留） =====================
const gridRef = ref<any>(null);
/** 行内编辑中的行 id（区别于弹窗 editingId） */
const rowEditingId = ref<string | null>(null);

const editRules: Record<string, any[]> = {};

function startEdit(row: SiteApi.FireEquipment) {
  rowEditingId.value = String(row.id);
  gridRef.value?.beginEdit(row);
}

async function onEditSave(payload: { row: SiteApi.FireEquipment }) {
  rowEditingId.value = null;
  const row = payload?.row;
  if (!row?.id) return;
  try {
    await updateFireEquipment(row.id, {
      status: row.status,
      lastCheckDate: row.lastCheckDate || null,
    });
    message.success('保存成功');
    onRefresh();
  } catch {
    /* 拦截器已提示 */
  }
}

function onEditCancel() {
  rowEditingId.value = null;
  // VXE 已自动回滚原始数据（keepSource），无需额外处理
}

// ===================== 详情抽屉 =====================
const detailDrawerVisible = ref(false);
const currentRecord = ref<SiteApi.FireEquipment | null>(null);

// 日期格式化（YYYY-MM-DD）
function formatDate(value: string | number | null | undefined): string {
  const s = value == null ? '' : String(value);
  return s.length >= 10 ? s.slice(0, 10) : s;
}
// 时间戳（NDatePicker 返回值）转 YYYY-MM-DD
function formatTs(ts: number): string {
  const d = new Date(ts);
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

// 到期日距今的天数（今天=0，昨天=-1；本地时区，避免时区偏移；无效日期返回 NaN）
function diffDays(value: string): number {
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return NaN;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

// ===================== 表格列 =====================
const columns = ref<VxeTableGridColumns>([
  { type: 'checkbox', width: 50, align: 'center', fixed: 'left' },
  { title: '设施名称', field: 'name', minWidth: 160, align: 'center', showOverflow: 'tooltip' },
  { title: '型号', field: 'model', minWidth: 130, align: 'center' },
  { title: '位置', field: 'location', minWidth: 160, align: 'center', showOverflow: 'tooltip' },
  {
    title: '状态',
    field: 'status',
    minWidth: 100,
    align: 'center',
    sortable: true,
    slots: { default: 'status' },
    editRender: {
      name: 'select',
      options: STATUS_OPTIONS.map((v) => ({ label: v, value: v })),
    },
  },
  { title: '数量', field: 'quantity', minWidth: 80, align: 'center' },
  { title: '安装日期', field: 'installDate', minWidth: 120, align: 'center', formatter: ({ cellValue }) => (cellValue ? formatDate(cellValue) : '-') },
  { title: '到期日期', field: 'expiryDate', minWidth: 140, align: 'center', slots: { default: 'expiryDate' }, formatter: ({ cellValue }) => (cellValue ? formatDate(cellValue) : '-') },
  { title: '负责人', field: 'manager', minWidth: 130, align: 'center', slots: { default: 'manager' } },
  {
    title: '操作',
    field: 'action',
    width: 180,
    align: 'center',
    fixed: 'right',
    slots: { default: 'action' },
  },
]);

onMounted(async () => {
  await onRefresh();
});
</script>

<template>
  <HsePageLayout
    :description="$t('page.hse.siteFireFacilityDesc')"
    :title="$t('page.hse.siteFireFacility')"
  >
    <template #extra>
      <NSpace>
        <NButton
          type="error"
          secondary
          @click="onBatchDelete"
        >
          批量删除
        </NButton>
        <HseActionBar
          :actions="actionState"
          @refresh="onRefresh"
          @download-template="onImportTemplate"
          @import="() => (importOpen = true)"
          @export="handleExport"
          @create="openCreate"
        />
      </NSpace>
    </template>

    <!-- 统计卡 -->
    <div class="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
      <NCard v-for="s in statItems" :key="s.key" :bordered="false">
        <NStatistic :label="s.label">
          <NText :type="s.type" strong>{{ s.value }}</NText>
        </NStatistic>
      </NCard>
    </div>

    <!-- 搜索 -->
    <HseSearchPanel @query="onSearch" @reset="onReset">
      <NGi>
        <NInput
          v-model:value="searchForm.keyword"
          placeholder="设施名称 / 型号"
          clearable
          @keyup.enter="onSearch"
        />
      </NGi>
      <NGi>
        <NSelect
          v-model:value="searchForm.type"
          placeholder="类型"
          clearable
          :options="TYPE_OPTIONS.map((v) => ({ label: v, value: v }))"
        />
      </NGi>
      <NGi>
        <NSelect
          v-model:value="searchForm.status"
          placeholder="状态"
          clearable
          :options="STATUS_OPTIONS.map((v) => ({ label: v, value: v }))"
        />
      </NGi>
      <NGi>
        <NInput v-model:value="searchForm.location" placeholder="位置" clearable @keyup.enter="onSearch" />
      </NGi>
      <NGi>
        <NInput
          v-model:value="searchForm.year"
          placeholder="年份（如 2026）"
          clearable
          @keyup.enter="onSearch"
        />
      </NGi>
      <NGi>
        <NInput
          v-model:value="searchForm.month"
          placeholder="月份（1-12）"
          clearable
          @keyup.enter="onSearch"
        />
      </NGi>
      <NGi>
        <NDatePicker
          v-model:value="searchForm.expiryRange"
          type="daterange"
          placeholder="到期日期范围"
          clearable
          format="yyyy-MM-dd"
          @update:value="onSearch"
        />
      </NGi>
    </HseSearchPanel>

    <!-- 表格 -->
    <HseDataGrid
      ref="gridRef"
      :columns="columns"
      :data="data"
      :loading="loading"
      :pager="true"
      :total="total"
      :editable="true"
      :edit-rules="editRules"
      @page-change="onPageChange"
      @sort-change="onSortChange"
      @edit-save="onEditSave"
      @edit-cancel="onEditCancel"
    >
      <template #manager="{ row }">
        <NSpace :size="4" justify="center">
          <NText>{{ row.manager || '-' }}</NText>
          <HseStatusTag v-if="isManagerMismatch(row)" type="warning" size="small">
            不匹配
          </HseStatusTag>
        </NSpace>
      </template>
      <template #status="{ row }">
        <HseStatusTag :type="STATUS_TAG[row.status] || 'neutral'">
          {{ row.status || '-' }}
        </HseStatusTag>
      </template>
      <template #expiryDate="{ row }">
        <NTag v-if="!row.expiryDate" type="default">-</NTag>
        <NTag v-else-if="diffDays(row.expiryDate) < 0" type="error">已过期 {{ formatDate(row.expiryDate) }}</NTag>
        <NTag v-else-if="diffDays(row.expiryDate) <= 30" type="warning">{{ formatDate(row.expiryDate) }}</NTag>
        <span v-else>{{ formatDate(row.expiryDate) }}</span>
      </template>
      <template #action="{ row }">
        <NSpace v-if="String(row.id) !== rowEditingId" justify="center" :size="4">
          <NButton size="tiny" type="primary" quaternary @click="openView(row)">查看</NButton>
          <NButton size="tiny" type="primary" quaternary @click="startEdit(row)">编辑</NButton>
          <NPopconfirm @positive-click="onDelete(row)">
            <template #trigger>
              <NButton size="tiny" type="error" quaternary>删除</NButton>
            </template>
            确定删除该消防设施吗？
          </NPopconfirm>
        </NSpace>
        <NSpace v-else justify="center" :size="4">
          <NButton size="tiny" type="primary" @click="gridRef?.saveEdit(row)">保存</NButton>
          <NButton size="tiny" @click="gridRef?.cancelEdit(row)">取消</NButton>
        </NSpace>
      </template>
    </HseDataGrid>

    <!-- 详情抽屉 -->
    <NDrawer v-model:show="detailDrawerVisible" :width="560">
      <NDrawerContent v-if="currentRecord" :title="`消防设施详情 #${currentRecord.id}`">
        <NDescriptions :column="1" bordered label-placement="left">
          <NDescriptionsItem label="设施名称">{{ currentRecord.name }}</NDescriptionsItem>
          <NDescriptionsItem label="类型">{{ currentRecord.type || '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="型号">{{ currentRecord.model || '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="位置">{{ currentRecord.location || '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="状态">
            <HseStatusTag :type="STATUS_TAG[currentRecord.status] || 'neutral'">
              {{ currentRecord.status || '-' }}
            </HseStatusTag>
          </NDescriptionsItem>
          <NDescriptionsItem label="数量">{{ currentRecord.quantity ?? '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="安装日期">{{ currentRecord.installDate || '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="到期日期">{{ currentRecord.expiryDate || '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="上次检查">{{ currentRecord.lastCheckDate || '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="下次检查">{{ currentRecord.nextCheckDate || '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="负责人">{{ currentRecord.manager || '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="联系电话">{{ currentRecord.phone || '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="备注">{{ currentRecord.remark || '-' }}</NDescriptionsItem>
        </NDescriptions>
      </NDrawerContent>
      <template #footer>
        <NSpace justify="end">
          <NButton v-if="currentRecord" type="primary" size="small" @click="openEdit(currentRecord)">
            弹窗编辑
          </NButton>
        </NSpace>
      </template>
    </NDrawer>

    <!-- 新增 / 编辑 弹窗 -->
    <NModal
      v-model:show="formOpen"
      :title="formMode === 'create' ? '新增消防设施' : '编辑消防设施'"
      preset="card"
      style="width: 680px; max-width: 92vw"
      :mask-closable="false"
    >
      <NForm label-placement="top">
        <div class="grid grid-cols-2 gap-x-4">
          <NFormItem label="设施名称" required>
            <NInput v-model:value="formModel.name" placeholder="请输入设施名称" />
          </NFormItem>
          <NFormItem label="设施类型" required>
            <NSelect
              v-model:value="formModel.type"
              :options="TYPE_OPTIONS.map((v) => ({ label: v, value: v }))"
            />
          </NFormItem>
          <NFormItem label="型号">
            <NInput v-model:value="formModel.model" placeholder="选填" />
          </NFormItem>
          <NFormItem label="位置（转运站）">
            <NSelect
              v-model:value="formModel.location"
              placeholder="选择安装位置（转运站）"
              clearable
              filterable
              :options="locationOptions.map((v) => ({ label: v, value: v }))"
              @update:value="handleLocationChange"
            />
          </NFormItem>
          <NFormItem label="状态">
            <NSelect
              v-model:value="formModel.status"
              :options="STATUS_OPTIONS.map((v) => ({ label: v, value: v }))"
            />
          </NFormItem>
          <NFormItem label="数量">
            <NInputNumber v-model:value="formModel.quantity" :min="0" style="width: 100%" />
          </NFormItem>
          <NFormItem label="安装日期">
            <NInput v-model:value="formModel.installDate" placeholder="YYYY-MM-DD" />
          </NFormItem>
          <NFormItem label="到期日期">
            <NInput v-model:value="formModel.expiryDate" placeholder="YYYY-MM-DD" />
          </NFormItem>
          <NFormItem label="上次检查">
            <NInput v-model:value="formModel.lastCheckDate" placeholder="YYYY-MM-DD" />
          </NFormItem>
          <NFormItem label="下次检查">
            <NInput v-model:value="formModel.nextCheckDate" placeholder="YYYY-MM-DD" />
          </NFormItem>
          <NFormItem label="负责人">
            <NSelect
              v-model:value="formModel.manager"
              placeholder="选择或输入负责人"
              clearable
              filterable
              :options="managerOptions"
              @update:value="handleManagerSelect"
            />
            <NText v-if="rosterTip" depth="3" class="mt-1 block text-xs">
              {{ rosterTip }}
            </NText>
          </NFormItem>
          <NFormItem label="联系电话">
            <NInput v-model:value="formModel.phone" placeholder="选择负责人后自动回填" />
          </NFormItem>
        </div>
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

    <!-- 导入后人员匹配校验弹窗 -->
    <NModal
      v-model:show="personnelMatchVisible"
      title="导入人员匹配校验"
      preset="card"
      style="width: 860px; max-width: 94vw"
      :mask-closable="false"
    >
      <NSpin :show="personnelMatchLoading">
        <template v-if="personnelMatchResult">
          <NAlert
            :type="personnelMatchResult.mismatches.length === 0 ? 'success' : 'warning'"
            class="mb-3"
          >
            匹配 {{ personnelMatchResult.matched }} 条，不匹配 {{ personnelMatchResult.mismatches.length }} 条（共 {{ personnelMatchResult.total }} 条已填负责人）。
          </NAlert>
          <HseDataGrid
            v-if="personnelMatchResult.mismatches.length > 0"
            :columns="[
              { title: '设施名称', field: 'name', minWidth: 160, align: 'left', showOverflow: 'tooltip' },
              { title: '安装位置', field: 'location', width: 150, align: 'center' },
              { title: '负责人', field: 'manager', width: 110, align: 'center' },
              { title: '花名册人员', field: 'rosterNames', minWidth: 200, align: 'left', showOverflow: 'tooltip', formatter: (p: any) => (p?.row?.rosterNames?.length ? p.row.rosterNames.join('、') : '无') },
              { title: '状态', field: 'status', width: 90, align: 'center', slots: { default: 'matchStatus' } },
            ]"
            :data="personnelMatchResult.mismatches"
            :pager="false"
          >
            <template #matchStatus>
              <HseStatusTag type="warning" size="small">不匹配</HseStatusTag>
            </template>
          </HseDataGrid>
          <NAlert v-else type="success" title="全部匹配">
            所有已填负责人的设施均能在对应转运站花名册中找到。
          </NAlert>
        </template>
      </NSpin>
      <template #footer>
        <NSpace justify="end">
          <NButton
            v-if="personnelMatchResult?.mismatches.length"
            secondary
            @click="handleDownloadMatchErrors"
          >
            下载不匹配记录
          </NButton>
          <NButton type="primary" @click="personnelMatchVisible = false">关闭</NButton>
        </NSpace>
      </template>
    </NModal>

    <!-- 通用导入（fire-facility 模块） -->
    <HseImportDialog
      v-model:open="importOpen"
      title="导入消防设施"
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
