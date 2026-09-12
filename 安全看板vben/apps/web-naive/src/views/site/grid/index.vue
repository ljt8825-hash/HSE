<script lang="ts" setup>
/**
 * 网格长巡查管理（web-naive · 阶段06B-1）
 * 原「网格管理」页，作为 /site/grid 父菜单的三级子页（/site/grid/mgmt）。
 * 契约来源：apps/web-antd/src/api/hse/site.ts（/site-mgmt/grid-areas）
 * 能力：年/月/级别/乡镇/状态筛选（动态 filter-options）、服务端统计与列表、完成率展示（后端返回，前端不重算）、
 *      网格 CRUD、详情、grid 通用导入。
 * 保留「三违记录」操作入口 + 抽屉：数据源为 mock（演示 UI，不依赖真实后端）；
 * 不请求 GET /violations/by-grid（未实现 TODO）；抽屉内明确标注 mock 未入库，与真实三违 CRUD 区分。
 */
import { computed, onMounted, reactive, ref } from 'vue';

import {
  NButton,
  NCard,
  NDescriptions,
  NDescriptionsItem,
  NDrawer,
  NDrawerContent,
  NForm,
  NFormItem,
  NGi,
  NInput,
  NModal,
  NPopconfirm,
  NProgress,
  NSelect,
  NSpace,
  NStatistic,
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
  createGridArea,
  deleteGridArea,
  getGridAreaFilterOptions,
  getGridAreaList,
  getSiteStats,
  updateGridArea,
  type SiteApi,
} from '#/api/hse/site';
import {
  getEmployeeSelectorList,
  getEmployeeSelectorBatch,
} from '#/api/hse/employee';
import { useGenericImport } from '#/views/hse/_shared/useGenericImport';
import { message } from '#/adapter/naive';

defineOptions({ name: 'SiteGridPatrolMgmt' });

// ===================== 映射 =====================
const LEVEL_OPTIONS = ['一级网格长', '二级网格长', '三级网格长'];
const POSITION_OPTIONS = ['网格长', '网格员', '安全员', '班组长'];
const FREQ_OPTIONS = ['每日一次', '每周一次', '每月一次', '每季度一次'];
// 旧版状态枚举：在岗 / 离岗 / 休假 / 调整，默认在岗
const GRID_STATUS_OPTIONS = ['在岗', '离岗', '休假', '调整'];
// 旧版风险等级枚举：重大 / 较大 / 一般 / 低，默认一般风险
const RISK_OPTIONS = ['重大风险', '较大风险', '一般风险', '低风险'];
const GRID_STATUS_TAG: Record<string, 'success' | 'info' | 'warning' | 'danger' | 'neutral'> = {
  在岗: 'success',
  离岗: 'info',
  休假: 'warning',
  调整: 'neutral',
};
const RECTIFY_TAG: Record<string, 'success' | 'info' | 'warning' | 'danger' | 'neutral'> = {
  已整改: 'success',
  整改中: 'warning',
  待整改: 'danger',
};

// 完成率分色：<60 红 / 60-79 橙 / 80-89 黄 / 90-99 蓝 / 100 绿
function completionColor(rate: number): string {
  if (rate >= 100) return '#18a058';
  if (rate >= 90) return '#2080f0';
  if (rate >= 80) return '#f0c927';
  if (rate >= 60) return '#f08c00';
  return '#d03050';
}

// ===================== 列表数据 =====================
const loading = ref(false);
const data = ref<SiteApi.GridArea[]>([]);
const total = ref(0);
const currentPage = ref(1);
// 默认全部显示：不启用分页，一次性取回全部网格（后端单页上限 200 行）
const pageSize = ref(1000);
const sortBy = ref<string | undefined>(undefined);
const sortOrder = ref<'asc' | 'desc' | undefined>(undefined);

const filterOptions = ref<SiteApi.GridAreaFilterOptions>({
  gridLevels: [],
  townships: [],
  statuses: [],
  years: [],
  months: [],
  monthOptions: [],
});

// 绑定员工姓名映射（grid_areas.personnel_id → 员工展示名），用于表格与详情回显
const bindNameMap = ref<Record<string, string>>({});
async function attachBindNames(rows: SiteApi.GridArea[]) {
  const ids = Array.from(
    new Set(rows.map((r) => r.personnelId).filter((v): v is number => typeof v === 'number' && !!v)),
  );
  if (!ids.length) {
    bindNameMap.value = {};
    return;
  }
  try {
    const list = await getEmployeeSelectorBatch(ids);
    const map: Record<string, string> = {};
    for (const it of list) {
      map[String(it.employee_id)] = it.unit_name || it.org_name
        ? `${it.name}（${it.unit_name || it.org_name}）`
        : it.name;
    }
    bindNameMap.value = map;
  } catch {
    bindNameMap.value = {};
  }
}
const searchForm = reactive({
  keyword: '',
  gridLevel: undefined as string | undefined,
  township: undefined as string | undefined,
  status: undefined as string | undefined,
  patrolFrequency: undefined as string | undefined,
});

/** 顶部单月度下拉（YYYY-MM）：按巡查日期统计每月数据，替代原「年份 + 月份」两个下拉 */
const selectedMonth = ref('');
const monthOptions = ref<{ label: string; value: string }[]>([]);

/** 将 YYYY-MM 拆分为后端 grid-areas 需要的 year(YYYY) / month(1-12) */
function splitMonth(ym: string): { year?: string; month?: string } {
  const m = /^(\d{4})-(\d{2})$/.exec((ym || '').trim());
  if (!m) return {};
  return { year: m[1], month: String(Number(m[2])) };
}

async function loadData() {
  loading.value = true;
  try {
    const ym = splitMonth(selectedMonth.value);
    const res = await getGridAreaList({
      page: currentPage.value,
      pageSize: pageSize.value,
      keyword: searchForm.keyword || undefined,
      gridLevel: searchForm.gridLevel,
      township: searchForm.township,
      status: searchForm.status,
      patrolFrequency: searchForm.patrolFrequency,
      year: ym.year,
      month: ym.month,
      sortField: sortBy.value,
      sortOrder: sortOrder.value,
    } as any);
    data.value = res.list ?? [];
    total.value = res.total ?? 0;
    attachBindNames(data.value);
  } catch {
    data.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
}
async function loadFilterOptions() {
  try {
    const res = await getGridAreaFilterOptions();
    filterOptions.value = {
      gridLevels: res.gridLevels ?? [],
      townships: res.townships ?? [],
      statuses: res.statuses ?? [],
      years: res.years ?? [],
      months: res.months ?? [],
      monthOptions: res.monthOptions ?? [],
    };
    monthOptions.value = (res.monthOptions ?? []).map((m) => ({ label: m, value: m }));
    // 默认选中最近一个有数据的月份（最新在前），保证进入页面即有实际月巡查次数
    if (!selectedMonth.value || !monthOptions.value.some((o) => o.value === selectedMonth.value)) {
      selectedMonth.value = monthOptions.value[0]?.value ?? '';
    }
  } catch {
    /* ignore */
  }
}

// 当前顶部月份（提取后传给 getSiteStats；未选中 → 无参数）
function currentFilterParams(): { year?: number; month?: number } {
  const ym = splitMonth(selectedMonth.value);
  return {
    year: ym.year ? Number(ym.year) : undefined,
    month: ym.month ? Number(ym.month) : undefined,
  };
}

// 服务端统计（网格总数 / 在岗人员 / 平均完成率；第 4 卡「网格级别：三级」为既有硬编码，保持原样）
const statTotal = ref(0);
const statOnDuty = ref(0);
const statAvgRate = ref(0);
const statItems = computed(() => [
  { key: 'total', label: '网格总数', value: statTotal.value },
  { key: 'onDuty', label: '在岗人员', value: statOnDuty.value },
  { key: 'avgRate', label: '平均完成率', value: `${statAvgRate.value}%` },
  { key: 'level', label: '网格级别', value: '三级' },
]);
// 查询 / 保存后 / 删除后刷新时携带当前年-月；重置后两值均空 → getSiteStats() 无参数（不传 { year: undefined, month: undefined }）
async function loadStats() {
  try {
    const p = currentFilterParams();
    const s = p.year || p.month
      ? await getSiteStats({ year: p.year, month: p.month })
      : await getSiteStats();
    statTotal.value = s.totalGridAreas ?? 0;
    statOnDuty.value = s.onDutyGridPersonnel ?? 0;
    statAvgRate.value = s.avgCompletionRate ?? 0;
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
    gridLevel: undefined,
    township: undefined,
    status: undefined,
    patrolFrequency: undefined,
  });
  onSearch();
}
/** 顶部月份切换：重新拉取该月统计与列表（月巡查次数/完成率按所选月重新计算） */
function onMonthChange() {
  currentPage.value = 1;
  loadData();
  loadStats();
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
// 网格无真实导出端点（隐藏 export 已取消，改为前端 CSV 导出）
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
} = useGenericImport('grid');
bindImportRefresh(onRefresh);

// 网格导出：复用 HseDataGrid 内置 CSV 导出
const gridRef = ref<any>(null);
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
      await deleteGridArea(row.id);
    }
    message.success(`已批量删除 ${rows.length} 条`);
    onRefresh();
  } catch {
    /* 拦截器已提示 */
  }
}

async function onRefresh() {
  await Promise.all([loadData(), loadStats(), loadFilterOptions()]);
}

// ===================== 新增 / 编辑 / 查看 =====================
const formOpen = ref(false);
const formMode = ref<'create' | 'edit' | 'view'>('create');
const formLoading = ref(false);
const editingId = ref<number | null>(null);
const formModel = reactive<Partial<SiteApi.GridArea> & { gridPersonnel?: string }>({
  gridCode: '',
  name: '',
  gridLevel: '',
  position: '',
  gridPersonnel: '',
  personnelId: null,
  phone: '',
  township: '',
  patrolFrequency: '',
  riskLevel: '一般风险',
  area: '',
  remarks: '',
  status: '在岗',
});

function resetForm() {
  Object.assign(formModel, {
    gridCode: '',
    name: '',
    gridLevel: '',
    position: '',
    gridPersonnel: '',
    personnelId: null,
    phone: '',
    township: '',
    patrolFrequency: '',
    riskLevel: '一般风险',
    area: '',
    remarks: '',
    status: '在岗',
  });
}
function openCreate() {
  resetForm();
  formMode.value = 'create';
  editingId.value = null;
  formOpen.value = true;
}
function openEdit(row: SiteApi.GridArea) {
  resetForm();
  formMode.value = 'edit';
  editingId.value = row.id;
  Object.assign(formModel, {
    gridCode: row.gridCode ?? '',
    name: row.name ?? '',
    gridLevel: row.gridLevel ?? '',
    position: row.position ?? '',
    gridPersonnel: (row as any).gridPersonnel ?? '',
    personnelId: row.personnelId ?? null,
    phone: row.phone ?? '',
    township: row.township ?? '',
    patrolFrequency: row.patrolFrequency ?? '',
    riskLevel: row.riskLevel ?? '一般风险',
    area: row.area ?? '',
    remarks: row.remarks ?? '',
    status: row.status ?? '在岗',
  });
  formOpen.value = true;
  hydratePersonnelName(row.personnelId ?? null);
}
function openView(row: SiteApi.GridArea) {
  currentRecord.value = row;
  detailDrawerVisible.value = true;
}

// 员工选择（远程搜索，网格负责人绑定 personnel_id）
const employeeOptions = ref<{ label: string; value: number }[]>([]);
const employeeSearching = ref(false);
async function searchEmployees(keyword: string) {
  employeeSearching.value = true;
  try {
    const list = await getEmployeeSelectorList({ keyword: keyword || undefined, limit: 20 });
    employeeOptions.value = (list || []).map((it) => ({
      label: it.unit_name || it.org_name
        ? `${it.name}（${it.unit_name || it.org_name}）`
        : it.name,
      value: it.employee_id,
    }));
  } catch {
    employeeOptions.value = [];
  } finally {
    employeeSearching.value = false;
  }
}
// 编辑/查看时按 personnelId 回显员工姓名
async function hydratePersonnelName(personnelId: number | null) {
  if (!personnelId) {
    employeeOptions.value = [];
    return;
  }
  try {
    const list = await getEmployeeSelectorBatch([personnelId]);
    const it = list?.[0];
    if (it) {
      formModel.personnelId = it.employee_id;
      employeeOptions.value = [
        {
          label: it.unit_name || it.org_name
            ? `${it.name}（${it.unit_name || it.org_name}）`
            : it.name,
          value: it.employee_id,
        },
      ];
    }
  } catch {
    /* ignore */
  }
}

async function onSubmit() {
  if (!formModel.name) {
    message.warning('请输入网格名称');
    return;
  }
  if (!formModel.gridCode) {
    message.warning('请输入网格编号');
    return;
  }
  formLoading.value = true;
  try {
    // gridPersonnel 仅为旧版表单展示临时字段：提交前必须删除（与旧版一致，不入后端契约）
    const payload: Partial<SiteApi.GridArea> = { ...formModel };
    delete (payload as any).gridPersonnel;
    payload.personnelId = formModel.personnelId ?? null;
    if (formMode.value === 'edit' && editingId.value != null) {
      await updateGridArea(editingId.value, payload);
      message.success('更新成功');
    } else {
      await createGridArea(payload);
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
async function onDelete(row: SiteApi.GridArea) {
  try {
    await deleteGridArea(row.id);
    message.success('删除成功');
    onRefresh();
  } catch {
    /* 拦截器已提示 */
  }
}

// ===================== 三违记录（mock，保留旧版交互） =====================
interface GridViolationMock {
  id: number;
  inspectionDate: string;
  inspectorName: string;
  violatorName: string;
  violationBehavior: string;
  violationType: string;
  rectificationStatus: '待整改' | '整改中' | '已整改';
}

const violationColumns = ref<VxeTableGridColumns>([
  { title: '检查日期', field: 'inspectionDate', width: 120, align: 'center' },
  { title: '检查人', field: 'inspectorName', width: 100, align: 'center' },
  { title: '违章人', field: 'violatorName', width: 100, align: 'center' },
  { title: '违章行为', field: 'violationBehavior', minWidth: 260, align: 'left', showOverflow: 'tooltip' },
  { title: '违章类型', field: 'violationType', width: 110, align: 'center' },
  {
    title: '整改状态',
    field: 'rectificationStatus',
    width: 100,
    align: 'center',
    slots: { default: 'rectify' },
  },
]);

/** 与旧版一致的 mock 数据池（演示 UI；真实接口 GET /violations/by-grid 为未实现 TODO） */
function getMockViolations(grid: SiteApi.GridArea | null): GridViolationMock[] {
  const pool: GridViolationMock[] = [
    {
      id: 1,
      inspectionDate: '2026-07-03',
      inspectorName: '王建国',
      violatorName: '李伟',
      violationBehavior: '在作业区域内未按规定佩戴安全帽，且未系好下颚带，存在高空坠物打击风险。',
      violationType: '违章指挥',
      rectificationStatus: '已整改',
    },
    {
      id: 2,
      inspectionDate: '2026-07-08',
      inspectorName: '赵敏',
      violatorName: '张强',
      violationBehavior: '配电箱未上锁、未悬挂警示标识，非电工人员可随意触碰，存在触电隐患。',
      violationType: '违章作业',
      rectificationStatus: '整改中',
    },
    {
      id: 3,
      inspectionDate: '2026-07-12',
      inspectorName: '王建国',
      violatorName: '陈晓东',
      violationBehavior: '高处作业未系安全带，且脚手架脚手板未满铺，存在高处坠落风险。',
      violationType: '违反劳动纪律',
      rectificationStatus: '待整改',
    },
  ];
  // 完成率低于 80 时补充一条（保持与旧版一致的行为）
  const completionRate = grid?.completionRate ?? 100;
  if (completionRate < 80) {
    pool.push({
      id: 4,
      inspectionDate: '2026-07-18',
      inspectorName: '刘洋',
      violatorName: '周涛',
      violationBehavior: '特种作业人员无证上岗操作起重设备，且未办理作业许可审批手续。',
      violationType: '违章指挥',
      rectificationStatus: '待整改',
    });
  }
  return pool;
}

const violationDrawerVisible = ref(false);
const violationDrawerGrid = ref<SiteApi.GridArea | null>(null);
const violationLoading = ref(false);
const violationList = ref<GridViolationMock[]>([]);

async function loadGridViolations(gridId: number) {
  // TODO[GRID_VIOLATION_INTEGRATION]: 后期对接三违数据接口（GET /violations/by-grid 未实现）
  // 当前返回 mock 数据演示 UI（不依赖真实后端）
  void gridId;
  violationLoading.value = true;
  try {
    violationList.value = getMockViolations(violationDrawerGrid.value);
  } finally {
    violationLoading.value = false;
  }
}
function handleViewViolations(record: SiteApi.GridArea) {
  violationDrawerGrid.value = record;
  violationDrawerVisible.value = true;
  loadGridViolations(record.id);
}

// ===================== 详情抽屉 =====================
const detailDrawerVisible = ref(false);
const currentRecord = ref<SiteApi.GridArea | null>(null);

// ===================== 表格列 =====================
const columns = ref<VxeTableGridColumns>([
  { type: 'checkbox', width: 50, align: 'center', fixed: 'left' },
  {
    title: '序号',
    field: 'index',
    width: 70,
    align: 'center',
    formatter: (params: any) =>
      (currentPage.value - 1) * pageSize.value + (params?.rowIndex ?? 0) + 1,
  },
  { title: '网格编号', field: 'gridCode', minWidth: 110, align: 'center' },
  {
    title: '网格负责人',
    field: 'name',
    minWidth: 120,
    align: 'center',
    showOverflow: 'tooltip',
    slots: { default: 'owner' },
  },
  {
    title: '绑定员工',
    field: 'personnelId',
    minWidth: 150,
    align: 'center',
    showOverflow: 'tooltip',
    slots: { default: 'bind' },
  },
  { title: '网格级别', field: 'gridLevel', minWidth: 100, align: 'center' },
  { title: '职务', field: 'position', minWidth: 140, align: 'center', showOverflow: 'tooltip' },
  { title: '巡查频率', field: 'patrolFrequency', minWidth: 110, align: 'center' },
  {
    title: '完成率',
    field: 'completionRate',
    minWidth: 140,
    align: 'center',
    slots: { default: 'completion' },
  },
  { title: '月巡查次数', field: 'monthPatrolCount', minWidth: 100, align: 'center' },
  { title: '年巡查次数', field: 'yearPatrolCount', minWidth: 100, align: 'center' },
  {
    title: '操作',
    field: 'action',
    width: 170,
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
    :description="$t('page.hse.siteGridPatrolMgmtDesc')"
    :title="$t('page.hse.siteGridPatrolMgmt')"
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

    <!-- 顶部月份下拉：按巡查日期统计每月数据（结构对齐 驾驶员·月度考核 为内容区第一个子元素） -->
    <div class="mb-4">
      <NSelect
        v-model:value="selectedMonth"
        placeholder="请选择月份"
        :options="monthOptions"
        style="max-width: 320px"
        @update:value="onMonthChange"
      />
    </div>

    <!-- 统计卡 -->
    <div class="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
      <NCard v-for="s in statItems" :key="s.key" :bordered="false">
        <NStatistic :label="s.label" :value="s.value" />
      </NCard>
    </div>

    <!-- 搜索 -->
    <HseSearchPanel @query="onSearch" @reset="onReset">
      <NGi>
        <NInput
          v-model:value="searchForm.keyword"
          placeholder="网格名称 / 编号"
          clearable
          @keyup.enter="onSearch"
        />
      </NGi>
      <NGi>
        <NSelect
          v-model:value="searchForm.gridLevel"
          placeholder="网格级别"
          clearable
          :options="filterOptions.gridLevels.map((v) => ({ label: v, value: v }))"
        />
      </NGi>
      <NGi>
        <NSelect
          v-model:value="searchForm.township"
          placeholder="所属乡镇"
          clearable
          filterable
          :options="filterOptions.townships.map((v) => ({ label: v, value: v }))"
        />
      </NGi>
      <NGi>
        <NSelect
          v-model:value="searchForm.status"
          placeholder="状态"
          clearable
          :options="filterOptions.statuses.map((v) => ({ label: v, value: v }))"
        />
      </NGi>
      <NGi>
        <NSelect
          v-model:value="searchForm.patrolFrequency"
          placeholder="巡查频率"
          clearable
          :options="FREQ_OPTIONS.map((v) => ({ label: v, value: v }))"
        />
      </NGi>
    </HseSearchPanel>

    <!-- 表格 -->
    <HseDataGrid
      ref="gridRef"
      :columns="columns"
      :data="data"
      :loading="loading"
      :pager="false"
      :total="total"
      @sort-change="onSortChange"
    >
      <template #completion="{ row }">
        <div class="flex items-center justify-center gap-2">
          <div class="w-16 shrink-0">
            <NProgress
              type="line"
              :percentage="row.completionRate ?? 0"
              :color="completionColor(row.completionRate ?? 0)"
              :height="8"
            />
          </div>
          <span class="tabular-nums text-xs text-gray-500">{{ row.completionRate ?? 0 }}%</span>
        </div>
      </template>
      <template #owner="{ row }">{{ row.name || '-' }}</template>
      <template #bind="{ row }">
        <span v-if="row.personnelId && bindNameMap[String(row.personnelId)]">
          {{ bindNameMap[String(row.personnelId)] }}
        </span>
        <span v-else-if="row.personnelId">已绑定 #{{ row.personnelId }}</span>
        <span v-else class="text-gray-400">未绑定</span>
      </template>
      <template #action="{ row }">
        <NSpace justify="center" :size="4">
          <NButton size="tiny" type="primary" quaternary @click="openView(row)">查看</NButton>
          <NButton size="tiny" type="primary" quaternary @click="openEdit(row)">编辑</NButton>
          <NPopconfirm @positive-click="onDelete(row)">
            <template #trigger>
              <NButton size="tiny" type="error" quaternary>删除</NButton>
            </template>
            确定删除该网格吗？
          </NPopconfirm>
        </NSpace>
      </template>
    </HseDataGrid>

    <!-- 详情抽屉 -->
    <NDrawer v-model:show="detailDrawerVisible" :width="560">
      <NDrawerContent v-if="currentRecord" :title="`网格详情 #${currentRecord.id}`">
        <NDescriptions :column="1" bordered label-placement="left">
          <NDescriptionsItem label="网格编号">{{ currentRecord.gridCode || '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="网格名称">{{ currentRecord.name }}</NDescriptionsItem>
          <NDescriptionsItem label="网格级别">{{ currentRecord.gridLevel || '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="职务">{{ currentRecord.position || '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="网格负责人">
            {{ (currentRecord as any).gridPersonnel || '-' }}
          </NDescriptionsItem>
          <NDescriptionsItem label="绑定员工">
            <template v-if="currentRecord.personnelId">
              {{ currentRecord.personnelId && bindNameMap[String(currentRecord.personnelId)]
                ? bindNameMap[String(currentRecord.personnelId)]
                : `已绑定员工 #${currentRecord.personnelId}` }}
            </template>
            <span v-else class="text-gray-400">未绑定</span>
          </NDescriptionsItem>
          <NDescriptionsItem label="联系电话">{{ currentRecord.phone || '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="所属乡镇">{{ currentRecord.township || '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="巡查频率">{{ currentRecord.patrolFrequency || '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="风险等级">{{ currentRecord.riskLevel || '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="完成率">
            <NProgress
              type="line"
              :percentage="currentRecord.completionRate ?? 0"
              :color="completionColor(currentRecord.completionRate ?? 0)"
              :height="8"
            />
          </NDescriptionsItem>
          <NDescriptionsItem label="状态">
            <HseStatusTag :type="GRID_STATUS_TAG[currentRecord.status] || 'neutral'">
              {{ currentRecord.status || '-' }}
            </HseStatusTag>
          </NDescriptionsItem>
          <NDescriptionsItem label="区域">{{ currentRecord.area || '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="备注">{{ currentRecord.remarks || '-' }}</NDescriptionsItem>
        </NDescriptions>
      </NDrawerContent>
    </NDrawer>

    <!-- 阶段6：网格三违记录入口（保留旧版交互，当前展示 mock 数据，未入库） -->
    <NDrawer v-model:show="violationDrawerVisible" :width="680">
      <NDrawerContent :title="`${violationDrawerGrid?.name ?? ''} - 三违记录`">
        <NAlert type="warning" class="mb-3" title="演示数据">
          以下为示例数据（未入库）。真实网格-三违数据接口尚未实现，接入需另行授权后端任务。
        </NAlert>
        <HseDataGrid
          :columns="violationColumns"
          :data="violationList"
          :loading="violationLoading"
          :pager="false"
        >
          <template #rectify="{ row }">
            <HseStatusTag :type="RECTIFY_TAG[row.rectificationStatus] || 'neutral'">
              {{ row.rectificationStatus }}
            </HseStatusTag>
          </template>
        </HseDataGrid>
      </NDrawerContent>
    </NDrawer>

    <!-- 新增 / 编辑 弹窗 -->
    <NModal
      v-model:show="formOpen"
      :title="formMode === 'create' ? '新增网格' : '编辑网格'"
      preset="card"
      style="width: 680px; max-width: 92vw"
      :mask-closable="false"
    >
      <NForm label-placement="top">
        <div class="grid grid-cols-2 gap-x-4">
          <NFormItem label="网格名称" required>
            <NInput v-model:value="formModel.name" placeholder="请输入网格名称" />
          </NFormItem>
          <NFormItem label="网格编号" required>
            <NInput v-model:value="formModel.gridCode" placeholder="请输入网格编号" />
          </NFormItem>
          <NFormItem label="网格级别">
            <NSelect
              v-model:value="formModel.gridLevel"
              :options="LEVEL_OPTIONS.map((v) => ({ label: v, value: v }))"
            />
          </NFormItem>
          <NFormItem label="职务">
            <NSelect
              v-model:value="formModel.position"
              :options="POSITION_OPTIONS.map((v) => ({ label: v, value: v }))"
            />
          </NFormItem>
          <NFormItem label="网格负责人">
            <NSelect
              v-model:value="formModel.personnelId"
              placeholder="搜索并选择员工（绑定 personnel_id）"
              clearable
              filterable
              remote
              :loading="employeeSearching"
              :options="employeeOptions"
              :consistent-menu-width="false"
              @search="searchEmployees"
              @focus="!formModel.personnelId && searchEmployees('')"
            />
          </NFormItem>
          <NFormItem label="联系电话">
            <NInput v-model:value="formModel.phone" placeholder="请输入联系电话" />
          </NFormItem>
          <NFormItem label="所属乡镇">
            <NInput v-model:value="formModel.township" placeholder="选填" />
          </NFormItem>
          <NFormItem label="区域">
            <NInput v-model:value="formModel.area" placeholder="选填" />
          </NFormItem>
          <NFormItem label="巡查频率">
            <NSelect
              v-model:value="formModel.patrolFrequency"
              :options="FREQ_OPTIONS.map((v) => ({ label: v, value: v }))"
            />
          </NFormItem>
          <NFormItem label="风险等级">
            <NSelect
              v-model:value="formModel.riskLevel"
              :options="RISK_OPTIONS.map((v) => ({ label: v, value: v }))"
            />
          </NFormItem>
          <NFormItem label="状态">
            <NSelect
              v-model:value="formModel.status"
              :options="GRID_STATUS_OPTIONS.map((v) => ({ label: v, value: v }))"
            />
          </NFormItem>
        </div>
        <NFormItem label="备注">
          <NInput v-model:value="formModel.remarks" type="textarea" :rows="2" placeholder="选填" />
        </NFormItem>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="formOpen = false">关闭</NButton>
          <NButton type="primary" :loading="formLoading" @click="onSubmit">保存</NButton>
        </NSpace>
      </template>
    </NModal>

    <!-- 通用导入（grid 模块） -->
    <HseImportDialog
      v-model:open="importOpen"
      title="导入网格数据"
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
