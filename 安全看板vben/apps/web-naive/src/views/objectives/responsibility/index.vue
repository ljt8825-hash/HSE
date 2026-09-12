<script lang="ts" setup>
/**
 * 目标责任书管理（web-naive · 阶段06B-2）
 * 契约来源：apps/web-antd/src/views/goals/index.vue + apps/web-antd/src/api/hse/goals.ts
 * 能力：服务端分页列表 / 关键词·部门·签订情况筛选 / 统计卡（已签订·未签订可点击联动筛选）/
 *      查看责任书详情 / 录入·编辑（员工远程检索，保持员工 ID/编号/姓名关联语义）/ 软删除 /
 *      模板 Blob 下载 / 专用导入（importResponsibility：新增·更新·未匹配·总数·未匹配样例）/ 对账差异次级入口。
 * 边界：不改服务端契约；不伪造写入成功（错误如实提示）；导出无真实端点 → 隐藏。
 */
import { computed, onMounted, reactive, ref } from 'vue';

import {
  NAlert,
  NButton,
  NCard,
  NDatePicker,
  NDescriptions,
  NDescriptionsItem,
  NForm,
  NFormItem,
  NGi,
  NInput,
  NModal,
  NPopconfirm,
  NSelect,
  NSpace,
  NStatistic,
  NText,
  NUpload,
  type UploadFileInfo,
} from 'naive-ui';

import {
  HseActionBar,
  HseDataGrid,
  HsePageLayout,
  HseSearchPanel,
  HseStatusTag,
  type HseActionKey,
} from '#/components/hse';
import type { VxeTableGridColumns } from '#/adapter/vxe-table';
import {
  createResponsibility,
  deleteResponsibility,
  downloadResponsibilityTemplate,
  getResponsibility,
  getResponsibilityRoster,
  getResponsibilityRosterStats,
  getResponsibilityUnmatched,
  getRosterDepartments,
  importResponsibility,
  lookupEmployees,
  updateResponsibility,
  type ResponsibilityRosterApi,
} from '#/api/hse/goals';
import { message } from '#/adapter/naive';

defineOptions({ name: 'ObjectivesResponsibility' });

// ===================== 筛选 =====================
const searchForm = reactive({
  keyword: '',
  department: undefined as string | undefined,
  signStatus: undefined as string | undefined,
});
const departmentOptions = ref<string[]>([]);

// ===================== 统计 =====================
const statsData = ref({ total: 0, signed: 0, unsigned: 0, signRate: 0 });
const statItems = computed(() => [
  { key: 'total', label: '员工总数', value: statsData.value.total, color: 'blue', icon: 'lucide:users' },
  { key: 'signed', label: '已签订', value: statsData.value.signed, color: 'green', icon: 'lucide:check-circle-2' },
  { key: 'unsigned', label: '未签订', value: statsData.value.unsigned, color: 'red', icon: 'lucide:circle-slash' },
  { key: 'signRate', label: '签订率', value: `${statsData.value.signRate}%`, color: 'orange', icon: 'lucide:bar-chart-3' },
]);
/** 点击已签订/未签订统计卡 → 联动签订情况筛选（再次点击取消） */
function handleStatClick(stat: { key: string }) {
  if (stat.key !== 'signed' && stat.key !== 'unsigned') return;
  const next = searchForm.signStatus === stat.key ? undefined : stat.key;
  searchForm.signStatus = next;
  currentPage.value = 1;
  onSearch();
}

// ===================== 各作业中心签订情况（竖向柱状图，按人数） =====================
/** 非乡镇的中心/职能部门，柱状图不展示 */
const CENTER_EXCLUDE = ['安环管理部', '财务部', '环卫作业中心', '人力综合部', '生产管理部', '项目管理层'];
const centerStats = ref<
  Array<{ name: string; shortName: string; signed: number; unsigned: number; total: number }>
>([]);
const centerLoading = ref(false);

/** 各作业中心签订情况：复用统计接口按部门聚合（不改服务端契约）。
 *  始终按整体口径（不带 keyword/signStatus 过滤），作为各中心的全局概览。 */
async function fetchCenterStats() {
  centerLoading.value = true;
  try {
    const depts = departmentOptions.value;
    if (!depts.length) {
      centerStats.value = [];
      return;
    }
    const results = await Promise.all(
      depts.map(async (dept) => {
        const res = await getResponsibilityRosterStats({ department: dept });
        return { name: dept, signed: res.signed, unsigned: res.unsigned, total: res.total };
      }),
    );
    centerStats.value = results
      .filter((r) => r.total > 0 && !CENTER_EXCLUDE.includes(r.name))
      .map((r) => ({ ...r, shortName: r.name.replace('作业中心', '') }));
  } catch {
    centerStats.value = [];
  } finally {
    centerLoading.value = false;
  }
}

/** 柱状图统一比例尺：以人数最多者为满高，并向上取整到 4 的倍数，保证 Y 轴刻度为整数 */
const CENTER_CHART_H = 220;
const centerMaxTotal = computed(() => Math.max(1, ...centerStats.value.map((c) => c.total)));
const centerMaxNice = computed(() => Math.max(4, Math.ceil(centerMaxTotal.value / 4) * 4));
/** 人数 → 像素高度 */
function barHeight(v: number): string {
  if (v <= 0) return '0px';
  return `${Math.max((v / centerMaxNice.value) * CENTER_CHART_H, 2)}px`;
}

// ===================== 列表 =====================
const loading = ref(false);
const data = ref<ResponsibilityRosterApi.RosterItem[]>([]);
const total = ref(0);
const currentPage = ref(1);
const pageSize = ref(10);
const sortBy = ref<string | undefined>(undefined);
const sortOrder = ref<'asc' | 'desc' | undefined>(undefined);

async function fetchStats() {
  try {
    // 统计卡始终反映整体口径（受关键词/部门筛选，但不受 signStatus 自身过滤）：
    // 点击「已签订/未签订」卡片只联动筛选下方列表，不应改变统计卡的总人数。
    const res = await getResponsibilityRosterStats({
      keyword: searchForm.keyword || undefined,
      department: searchForm.department,
    });
    statsData.value = {
      total: res.total,
      signed: res.signed,
      unsigned: res.unsigned,
      signRate: res.signRate,
    };
  } catch {
    /* 拦截器已提示 */
  }
}

async function loadData() {
  loading.value = true;
  try {
    const params: ResponsibilityRosterApi.RosterListParams = {
      page: currentPage.value,
      pageSize: pageSize.value,
      keyword: searchForm.keyword || undefined,
      department: searchForm.department,
      signStatus: (searchForm.signStatus as ResponsibilityRosterApi.RosterListParams['signStatus']) || undefined,
      sortField: sortBy.value,
      sortOrder: sortOrder.value,
    };
    const res = await getResponsibilityRoster(params);
    data.value = res.list || [];
    total.value = res.total || 0;
  } catch {
    data.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
}

async function onRefresh() {
  await Promise.all([loadData(), fetchStats()]);
}

function onSearch() {
  currentPage.value = 1;
  onRefresh();
}
function onReset() {
  Object.assign(searchForm, { keyword: '', department: undefined, signStatus: undefined });
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

async function loadDepartments() {
  try {
    departmentOptions.value = await getRosterDepartments();
  } catch {
    departmentOptions.value = [];
  }
}

// ===================== 表格列 =====================
const columns: VxeTableGridColumns = [
  { type: 'checkbox', width: 50, align: 'center', fixed: 'left' },
  { title: '员工编号', field: 'employeeCode', width: 120, align: 'center' },
  { title: '姓名', field: 'name', width: 100, align: 'center' },
  { title: '所属部门', field: 'department', minWidth: 160, align: 'center', showOverflow: 'tooltip' },
  { title: '班组', field: 'team', minWidth: 120, align: 'center', showOverflow: 'tooltip' },
  { title: '职位', field: 'position', minWidth: 120, align: 'center', showOverflow: 'tooltip' },
  { title: '入职日期', field: 'hireDate', width: 120, align: 'center', sortable: true, formatter: ({ cellValue }) => (cellValue ? fmtDate(cellValue as string) : '-') },
  { title: '直接上级', field: 'supervisor', minWidth: 120, align: 'center' },
  {
    title: '责任书签订情况',
    field: 'signStatus',
    width: 150,
    align: 'center',
    sortable: true,
    slots: { default: 'signStatus' },
  },
  {
    title: '操作',
    field: 'action',
    width: 200,
    align: 'center',
    fixed: 'right',
    slots: { default: 'action' },
  },
];

// ===================== 详情 =====================
const showViewModal = ref(false);
const viewDetail = ref<ResponsibilityRosterApi.ResponsibilityDetail | null>(null);
async function handleView(row: ResponsibilityRosterApi.RosterItem) {
  if (!row.contractId) {
    message.info('该员工尚未录入责任书记录');
    return;
  }
  try {
    viewDetail.value = await getResponsibility(row.contractId);
    showViewModal.value = true;
  } catch {
    /* 拦截器已提示 */
  }
}

// ===================== 录入 / 编辑 =====================
const showFormModal = ref(false);
const saving = ref(false);
const formMode = ref<'create' | 'edit'>('create');
const editingContractId = ref<number | null>(null);
const employeeOptions = ref<ResponsibilityRosterApi.EmployeeOption[]>([]);
const signDateTs = ref<number | null>(null);
const form = reactive({
  employeeId: undefined as number | undefined,
  employeeCode: '',
  employeeName: '',
  title: '',
  contractType: '目标责任书',
  status: 'signed' as 'signed' | 'unsigned',
  signDate: '' as string,
});

const employeeSelectOptions = computed(() =>
  employeeOptions.value.map((o) => ({
    value: o.employeeId,
    label: `${o.employeeCode} - ${o.name}${o.department ? `（${o.department}）` : ''}`,
  })),
);

function resetForm() {
  Object.assign(form, {
    employeeId: undefined,
    employeeCode: '',
    employeeName: '',
    title: '',
    contractType: '目标责任书',
    status: 'signed',
    signDate: '',
  });
  signDateTs.value = null;
  employeeOptions.value = [];
}

function openCreateModal() {
  formMode.value = 'create';
  editingContractId.value = null;
  resetForm();
  showFormModal.value = true;
}

/** 行内"录入责任书"（未签订员工快速录入） */
function openCreateForRow(row: ResponsibilityRosterApi.RosterItem) {
  formMode.value = 'create';
  editingContractId.value = null;
  resetForm();
  form.employeeId = row.employeeId;
  form.employeeCode = row.employeeCode || '';
  form.employeeName = row.name;
  employeeOptions.value = [
    {
      employeeId: row.employeeId,
      employeeCode: row.employeeCode || '',
      name: row.name,
      idCard: null,
      department: row.department,
      position: row.position,
    },
  ];
  showFormModal.value = true;
}

async function handleEdit(row: ResponsibilityRosterApi.RosterItem) {
  if (!row.contractId) {
    message.info('该员工尚未录入责任书记录，无法编辑');
    return;
  }
  try {
    const detail = await getResponsibility(row.contractId);
    formMode.value = 'edit';
    editingContractId.value = detail.contractId;
    form.employeeId = detail.employeeId;
    form.employeeCode = detail.employeeCode;
    form.employeeName = detail.name;
    form.title = detail.title || '';
    form.contractType = detail.contractType || '目标责任书';
    form.status = detail.status;
    form.signDate = detail.signDate || '';
    signDateTs.value = form.signDate ? new Date(form.signDate).getTime() : null;
    employeeOptions.value = [
      {
        employeeId: detail.employeeId,
        employeeCode: detail.employeeCode,
        name: detail.name,
        idCard: null,
        department: detail.department,
        position: detail.position,
      },
    ];
    showFormModal.value = true;
  } catch {
    /* 拦截器已提示 */
  }
}

function closeFormModal() {
  showFormModal.value = false;
  resetForm();
}

async function handleEmpSearch(keyword: string) {
  if (!keyword) {
    employeeOptions.value = [];
    return;
  }
  try {
    employeeOptions.value = await lookupEmployees(keyword);
  } catch {
    employeeOptions.value = [];
  }
}

/** Naive NSelect @update:value 真实签名 (value, option)；option 带员工信息 */
function handleEmpChange(value: number | null, option: { name?: string; employeeCode?: string } | null | Array<any>) {
  const opt = Array.isArray(option) ? (option[0] as any) : option;
  form.employeeId = value ?? undefined;
  form.employeeName = opt?.name || '';
  form.employeeCode = opt?.employeeCode || '';
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fmtDate(value: string | number | null | undefined): string {
  const s = value == null ? '' : String(value);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

async function handleSave() {
  if (formMode.value === 'create' && !form.employeeId) {
    message.warning('请先选择员工');
    return;
  }
  saving.value = true;
  try {
    if (formMode.value === 'edit' && editingContractId.value) {
      await updateResponsibility(editingContractId.value, {
        title: form.title || undefined,
        contractType: form.contractType,
        status: form.status,
        signDate: form.signDate || null,
      });
      message.success('责任书更新成功');
    } else {
      await createResponsibility({
        employeeId: form.employeeId,
        title: form.title || undefined,
        contractType: form.contractType,
        status: form.status,
        signDate: form.signDate || null,
      });
      message.success('责任书保存成功');
    }
    showFormModal.value = false;
    resetForm();
    await onRefresh();
    await fetchCenterStats();
  } catch {
    /* 拦截器已提示（不伪造成功） */
  } finally {
    saving.value = false;
  }
}

// ===================== 删除（软删除） =====================
async function handleDelete(row: ResponsibilityRosterApi.RosterItem) {
  if (!row.contractId) {
    message.info('该员工尚未录入责任书记录');
    return;
  }
  try {
    await deleteResponsibility(row.contractId as number);
    message.success('删除成功');
    await onRefresh();
    await fetchCenterStats();
  } catch {
    /* 拦截器已提示 */
  }
}

// ===================== 导入（专用端点） =====================
const showImportModal = ref(false);
const importing = ref(false);
const importFile = ref<File | null>(null);
const importResult = ref<ResponsibilityRosterApi.ImportResult | null>(null);

function handleImportFileChange(options: { file: UploadFileInfo }) {
  const f = options.file;
  importFile.value = (f.file as File) || null;
}
function handleImportFileRemove() {
  importFile.value = null;
}

async function handleImport() {
  if (!importFile.value) {
    message.warning('请先选择文件');
    return;
  }
  importing.value = true;
  importResult.value = null;
  try {
    const res = await importResponsibility(importFile.value);
    importResult.value = res;
    message.success(`导入完成：新增 ${res.inserted}，更新 ${res.updated}，未匹配 ${res.unmatched}`);
    await onRefresh();
    await fetchCenterStats();
  } catch {
    /* 拦截器已提示 */
  } finally {
    importing.value = false;
  }
}

function triggerDownload(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

async function handleDownloadTemplate() {
  try {
    const blob = (await downloadResponsibilityTemplate()) as Blob;
    triggerDownload(blob, '责任书签订台账导入模板.xlsx');
  } catch {
    message.error('下载模板失败');
  }
}

// ===================== 对账差异（次级入口） =====================
const showDiffModal = ref(false);
const diffLoading = ref(false);
const diffList = ref<ResponsibilityRosterApi.UnmatchedItem[]>([]);
const diffTotal = ref(0);
async function openDiffModal() {
  showDiffModal.value = true;
  diffLoading.value = true;
  try {
    const res = await getResponsibilityUnmatched();
    diffList.value = res.list;
    diffTotal.value = res.total;
  } catch {
    diffList.value = [];
    diffTotal.value = 0;
  } finally {
    diffLoading.value = false;
  }
}

const diffColumns: VxeTableGridColumns = [
  { title: '员工编码', field: 'employeeCode', width: 120, align: 'center' },
  { title: '姓名', field: 'name', width: 100, align: 'center' },
  { title: '身份证号', field: 'idCard', width: 190, align: 'center', showOverflow: 'tooltip' },
  {
    title: '源目标责任书',
    field: 'sourceSigned',
    width: 110,
    align: 'center',
    slots: { default: 'diffSigned' },
  },
  { title: '说明', field: 'reason', width: 220, align: 'left', showOverflow: 'tooltip' },
];

// ===================== 操作列菜单 =====================
function onActionMenuSelect(key: string | number, row: ResponsibilityRosterApi.RosterItem) {
  if (key === 'edit') {
    if (row.contractId) {
      handleEdit(row);
    } else {
      openCreateForRow(row);
    }
  } else if (key === 'delete' && row.contractId) {
    handleDelete(row);
  }
}

// ===================== 工具栏（对账差异为次级入口，不改变公共 HseActionBar） =====================
const actionState = ref<Partial<Record<HseActionKey, { hidden?: boolean }>>>({
  export: {},
});

// ===================== 导出 / 批量删除 =====================
const gridRef = ref<any>(null);
function handleExport() {
  gridRef.value?.gridApi?.grid?.exportData({ type: 'csv' });
}
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
    await Promise.all(rows.map((r) => deleteResponsibility(r.contractId)));
    message.success('批量删除成功');
    await onRefresh();
    await fetchCenterStats();
  } catch {
    message.error('批量删除失败');
  }
}

onMounted(async () => {
  await loadDepartments();
  await onRefresh();
  await fetchCenterStats();
});
</script>

<template>
  <HsePageLayout title="目标责任书管理">
    <!-- 统计卡（已签订/未签订可点击联动筛选）+ 对账差异次级入口 -->
    <div class="mb-4">
      <div class="mb-3 flex items-center justify-between">
        <NText depth="2" class="text-sm">签订统计</NText>
        <NButton size="small" secondary @click="openDiffModal">
          对账差异
        </NButton>
      </div>
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <NCard
          v-for="s in statItems"
          :key="s.key"
          :bordered="false"
          :class="{ 'cursor-pointer transition-shadow hover:shadow-md': s.key === 'signed' || s.key === 'unsigned' }"
          @click="handleStatClick(s)"
        >
          <NStatistic :label="s.label" :value="s.value" />
        </NCard>
      </div>
    </div>

    <!-- 各作业中心签订情况（竖向分组柱状图，按人数） -->
    <div class="mb-4">
      <div class="mb-2">
        <NText depth="2" class="text-sm">各作业中心签订情况（按人数）</NText>
      </div>
      <div class="mb-3 flex justify-center">
        <NSpace size="small" :wrap="false">
          <NText depth="3" class="text-xs inline-flex items-center gap-1">
            <span class="inline-block h-3 w-3 rounded-sm" style="background:#2080f0"></span>已签订
          </NText>
          <NText depth="3" class="text-xs inline-flex items-center gap-1">
            <span class="inline-block h-3 w-3 rounded-sm" style="background:#f0c020"></span>未签订
          </NText>
        </NSpace>
      </div>
      <NCard :bordered="false">
        <div v-if="centerLoading" class="py-10 text-center text-gray-400 text-sm">加载中…</div>
        <div v-else-if="!centerStats.length" class="py-10 text-center text-gray-400 text-sm">暂无数据</div>
        <div v-else class="center-chart">
          <div class="grid-bg">
            <div
              v-for="i in 5"
              :key="i"
              class="grid-line"
              :style="{ bottom: `${(i - 1) * 25}%` }"
            >
              <span class="grid-label">{{ Math.round((centerMaxNice / 4) * (i - 1)) }}</span>
            </div>
          </div>
          <div class="bars-area">
            <div v-for="c in centerStats" :key="c.name" class="center-col">
              <div class="center-bar-pair">
                <div class="center-bar signed" :style="{ height: barHeight(c.signed) }"></div>
                <div class="center-bar unsigned" :style="{ height: barHeight(c.unsigned) }"></div>
                <div class="center-tip">
                  <div class="tip-row"><span class="dot" style="background:#2080f0"></span>已签订：{{ c.signed }} 人</div>
                  <div class="tip-row"><span class="dot" style="background:#f0c020"></span>未签订：{{ c.unsigned }} 人</div>
                  <div class="tip-row tip-sum">合计：{{ c.total }} 人</div>
                </div>
              </div>
              <div class="center-label" :title="c.name">{{ c.shortName }}</div>
            </div>
          </div>
        </div>
      </NCard>
    </div>

    <!-- 工具栏：刷新/下载模板/导入/新增；批量删除 -->
    <template #extra>
      <NSpace>
        <NButton type="error" @click="onBatchDelete">批量删除</NButton>
        <HseActionBar
          :actions="actionState"
          @refresh="onRefresh"
          @export="handleExport"
          @download-template="handleDownloadTemplate"
          @import="() => (showImportModal = true)"
          @create="openCreateModal"
        />
      </NSpace>
    </template>

    <!-- 筛选 -->
    <HseSearchPanel @query="onSearch" @reset="onReset">
      <NGi>
        <NInput
          v-model:value="searchForm.keyword"
          placeholder="员工编号 / 姓名"
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
          :options="departmentOptions.map((v) => ({ label: v, value: v }))"
        />
      </NGi>
      <NGi>
        <NSelect
          v-model:value="searchForm.signStatus"
          placeholder="签订情况"
          clearable
          :options="[
            { label: '已签订', value: 'signed' },
            { label: '未签订', value: 'unsigned' },
            { label: '未签订·无源', value: 'unsigned_no_source' },
          ]"
        />
      </NGi>
    </HseSearchPanel>

    <!-- 列表 -->
    <HseDataGrid
      ref="gridRef"
      :columns="columns"
      :data="data"
      :loading="loading"
      :pager="true"
      :total="total"
      scroll-x="1240"
      @page-change="onPageChange"
      @sort-change="onSortChange"
    >
      <template #signStatus="{ row }">
        <HseStatusTag v-if="row.signStatus === 'signed'" type="success">已签订</HseStatusTag>
        <HseStatusTag v-else-if="row.noSourceRecord" type="neutral">未签订·无源</HseStatusTag>
        <HseStatusTag v-else type="danger">未签订</HseStatusTag>
      </template>
      <template #action="{ row }">
        <NSpace justify="center">
          <NButton size="small" type="primary" quaternary @click="handleView(row)">
            查看
          </NButton>
          <NButton
            size="small"
            type="primary"
            quaternary
            @click="onActionMenuSelect('edit', row)"
          >
            编辑
          </NButton>
          <NPopconfirm @positive-click="handleDelete(row)">
            <template #trigger>
              <NButton size="small" type="error" quaternary>删除</NButton>
            </template>
            确认删除该责任书？
          </NPopconfirm>
        </NSpace>
      </template>
    </HseDataGrid>

    <!-- 录入/编辑责任书 -->
    <NModal
      v-model:show="showFormModal"
      :title="formMode === 'edit' ? '编辑责任书' : '新增/录入责任书'"
      preset="card"
      style="width: 560px; max-width: 92vw"
      :mask-closable="false"
      @after-leave="closeFormModal"
    >
      <NForm label-placement="left" :label-width="100">
        <NFormItem label="员工" required>
          <NSelect
            v-model:value="form.employeeId"
            placeholder="输入员工编号 / 姓名 / 身份证号检索"
            clearable
            filterable
            remote
            :disabled="formMode === 'edit'"
            :options="employeeSelectOptions"
            :loading="false"
            @search="handleEmpSearch"
            @update:value="handleEmpChange"
          />
        </NFormItem>
        <NFormItem label="责任书标题">
          <NInput v-model:value="form.title" placeholder="留空则自动生成：{姓名} 目标责任书" />
        </NFormItem>
        <NFormItem label="责任书类型">
          <NSelect
            v-model:value="form.contractType"
            :options="[
              { label: '目标责任书', value: '目标责任书' },
              { label: '安全生产责任书', value: '安全生产责任书' },
              { label: '岗位责任书', value: '岗位责任书' },
            ]"
          />
        </NFormItem>
        <NFormItem label="签订状态" required>
          <NSelect
            v-model:value="form.status"
            :options="[
              { label: '已签订', value: 'signed' },
              { label: '未签订', value: 'unsigned' },
            ]"
          />
        </NFormItem>
        <NFormItem label="签订日期">
          <NDatePicker
            v-model:value="signDateTs"
            type="date"
            clearable
            style="width: 100%"
            @update:value="(v) => (form.signDate = v ? formatDate(new Date(v)) : '')"
          />
        </NFormItem>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="closeFormModal">取消</NButton>
          <NButton type="primary" :loading="saving" @click="handleSave">保存</NButton>
        </NSpace>
      </template>
    </NModal>

    <!-- 查看责任书 -->
    <NModal
      v-model:show="showViewModal"
      title="查看责任书"
      preset="card"
      style="width: 560px; max-width: 92vw"
    >
      <NDescriptions v-if="viewDetail" :column="1" bordered label-placement="left" size="small">
        <NDescriptionsItem label="员工编号">{{ viewDetail.employeeCode || '-' }}</NDescriptionsItem>
        <NDescriptionsItem label="姓名">{{ viewDetail.name || '-' }}</NDescriptionsItem>
        <NDescriptionsItem label="所属部门">{{ viewDetail.department || '-' }}</NDescriptionsItem>
        <NDescriptionsItem label="班组">{{ viewDetail.team || '-' }}</NDescriptionsItem>
        <NDescriptionsItem label="职位">{{ viewDetail.position || '-' }}</NDescriptionsItem>
        <NDescriptionsItem label="直接上级">{{ viewDetail.supervisor || '-' }}</NDescriptionsItem>
        <NDescriptionsItem label="责任书标题">{{ viewDetail.title || '-' }}</NDescriptionsItem>
        <NDescriptionsItem label="责任书类型">{{ viewDetail.contractType || '-' }}</NDescriptionsItem>
        <NDescriptionsItem label="签订情况">
          <HseStatusTag :type="viewDetail.status === 'signed' ? 'success' : 'danger'">
            {{ viewDetail.status === 'signed' ? '已签订' : '未签订' }}
          </HseStatusTag>
        </NDescriptionsItem>
        <NDescriptionsItem label="签订日期">{{ viewDetail.signDate || '-' }}</NDescriptionsItem>
      </NDescriptions>
    </NModal>

    <!-- 导入责任书签订数据（专用端点） -->
    <NModal
      v-model:show="showImportModal"
      title="导入责任书签订数据"
      preset="card"
      style="width: 560px; max-width: 92vw"
      :mask-closable="false"
    >
      <div class="mb-2">
        <NButton type="primary" quaternary size="small" @click="handleDownloadTemplate">
          下载导入模板
        </NButton>
        <NText depth="3" class="text-xs">
          （按 员工编号 / 姓名 / 身份证号 匹配花名册，其余列为花名册数据）
        </NText>
      </div>
      <NUpload
        accept=".xlsx,.xls,.csv"
        :max="1"
        :show-file-list="true"
        @change="handleImportFileChange"
        @remove="handleImportFileRemove"
      >
        <NButton>选择文件（.xlsx / .xls / .csv）</NButton>
      </NUpload>
      <NAlert
        v-if="importResult"
        type="success"
        class="mt-3"
        show-icon
        :title="`导入完成：新增 ${importResult.inserted} 条，更新 ${importResult.updated} 条，未匹配 ${importResult.unmatched} 条（共 ${importResult.total} 行）`"
      >
        <template v-if="importResult.unmatchedSamples.length" #default>
          <div>未匹配样例：</div>
          <div v-for="(s, i) in importResult.unmatchedSamples" :key="i">
            {{ s.employeeCode || s.name || s.idCard || '（无标识）' }}
          </div>
        </template>
      </NAlert>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="showImportModal = false">关闭</NButton>
          <NButton type="primary" :loading="importing" @click="handleImport">开始导入</NButton>
        </NSpace>
      </template>
    </NModal>

    <!-- 对账差异（次级入口，只读） -->
    <NModal
      v-model:show="showDiffModal"
      title="对账差异（源文件有、但不在职花名册）"
      preset="card"
      style="width: 760px; max-width: 94vw"
    >
      <NAlert type="info" class="mb-3" show-icon>
        共 {{ diffTotal }} 条：以下人员出现在导入源文件中，但不在当前在职花名册内，按口径视为已离职，未导入责任书。
      </NAlert>
      <HseDataGrid
        :columns="diffColumns"
        :data="diffList"
        :loading="diffLoading"
        :pager="false"
        scroll-x="860"
      >
        <template #diffSigned="{ row }">
          <HseStatusTag :type="row.sourceSigned ? 'success' : 'danger'">
            {{ row.sourceSigned ? '有' : '无' }}
          </HseStatusTag>
        </template>
      </HseDataGrid>
    </NModal>
  </HsePageLayout>
</template>

<style scoped>
/* ===== 各作业中心签订情况：竖向分组柱状图 ===== */
.center-chart {
  position: relative;
  height: 220px;
  padding: 0 8px 0 36px;
}
/* 网格层：虚线水平网格 + Y 轴刻度 */
.grid-bg {
  position: absolute;
  inset: 0 8px 0 36px;
  pointer-events: none;
  z-index: 0;
}
.grid-line {
  position: absolute;
  left: 0;
  right: 0;
  border-top: 1px dashed #e5e7eb;
}
.grid-label {
  position: absolute;
  left: -8px;
  top: -8px;
  transform: translateX(-100%);
  font-size: 11px;
  color: #9ca3af;
}
/* 柱条层 */
.bars-area {
  position: absolute;
  inset: 0 8px 0 36px;
  display: flex;
  align-items: flex-end;
  justify-content: space-around;
  gap: 4px;
  border-bottom: 1px solid #d1d5db;
  z-index: 1;
}
.center-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1 1 0;
  min-width: 48px;
}
.center-bar-pair {
  position: relative;
  display: flex;
  align-items: flex-end;
  gap: 3px;
  transition: transform 0.2s ease;
}
.center-bar-pair:hover {
  transform: translateY(-3px);
}
.center-bar {
  width: 14px;
  border-radius: 4px 4px 0 0;
  cursor: pointer;
  transition: height 0.4s ease, filter 0.2s ease;
}
.center-bar.signed {
  background: #2080f0;
}
.center-bar.unsigned {
  background: #f0c020;
}
.center-bar-pair:hover .center-bar {
  filter: brightness(1.08);
}
/* 悬浮提示：显示数量 */
.center-tip {
  position: absolute;
  left: 50%;
  bottom: calc(100% + 8px);
  transform: translateX(-50%) translateY(4px);
  min-width: 130px;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.82);
  color: #fff;
  font-size: 12px;
  line-height: 1.7;
  white-space: nowrap;
  text-align: left;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.25);
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transition: opacity 0.2s ease, transform 0.2s ease, visibility 0.2s;
  z-index: 20;
}
.center-bar-pair:hover .center-tip {
  opacity: 1;
  visibility: visible;
  transform: translateX(-50%) translateY(0);
}
.center-tip .dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 2px;
  margin-right: 6px;
  vertical-align: middle;
}
.center-tip .tip-sum {
  margin-top: 2px;
  padding-top: 4px;
  border-top: 1px solid rgba(255, 255, 255, 0.18);
  font-weight: 600;
}
.center-label {
  margin-top: 8px;
  font-size: 12px;
  color: #555;
  text-align: center;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
