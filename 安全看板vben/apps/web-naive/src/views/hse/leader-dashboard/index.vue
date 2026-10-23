<script lang="ts" setup>
/**
 * 领导视角统一看板（P2 前端，钻取式单页，挂载于「安全总览」模块下）
 * 链路：作业中心 → 乡镇/公园列表 → 乡镇详情（累计卡 + 逐月趋势 + 经理入口）
 *       → 经理双口径页（双卡并排 + 辖区趋势 + 月明细）
 * 年份缺省 = 历年累计；环卫线 10 维 / 园林线 8 维；全部只读接口。
 */
import { computed, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';

import {
  NButton,
  NCard,
  NDescriptions,
  NDescriptionsItem,
  NDivider,
  NDrawer,
  NDrawerContent,
  NEmpty,
  NModal,
  NSelect,
  NSpin,
  NTag,
} from 'naive-ui';
import type { VxeTableGridColumns } from '@vben/plugins/vxe-table';
import { IconifyIcon } from '@vben/icons';

import {
  getLeaderCenters,
  getLeaderDimRecords,
  getLeaderEmployeeDetail,
  getLeaderManagerMonthDetail,
  getLeaderManagerOverview,
  getLeaderRolesByTown,
  getLeaderTownManagers,
  getLeaderTownTrend,
  getLeaderTownsByCenter,
} from '#/api/hse/leader-dashboard';
import type { LeaderDashboardApi } from '#/api/hse/leader-dashboard';
import { HseDataGrid, HsePageLayout } from '#/components/hse';
import { message } from '#/adapter/naive';
import LdModuleGrid from './ld-module-grid.vue';
import type { LdDim } from './ld-module-grid.vue';
import LdTrendTable from './ld-trend-table.vue';
import type { LdTrendRow } from './ld-trend-table.vue';

const router = useRouter();

const currentYear = new Date().getFullYear();
const year = ref<number | ''>(''); // '' = 历年累计
const yearOptions = [
  { label: '历年累计', value: '' },
  { label: `${currentYear}年`, value: currentYear },
  { label: `${currentYear - 1}年`, value: currentYear - 1 },
  { label: `${currentYear - 2}年`, value: currentYear - 2 },
];

type ViewLevel = 'center' | 'town' | 'townDetail' | 'roles' | 'manager';
const view = ref<ViewLevel>('center');

const centersData = ref<LeaderDashboardApi.CentersData | null>(null);
const townsData = ref<LeaderDashboardApi.TownsData | null>(null);
const rolesData = ref<LeaderDashboardApi.RolesData | null>(null);
const employeeDetail = ref<LeaderDashboardApi.EmployeeDetailData | null>(null);
const trendData = ref<LeaderDashboardApi.TrendData | null>(null);
const managersData = ref<LeaderDashboardApi.TownManagersData | null>(null);
const managerOverview = ref<LeaderDashboardApi.ManagerOverviewData | null>(null);
const managerMonthDetail = ref<LeaderDashboardApi.ManagerMonthDetailData | null>(null);

const selectedCenter = ref<LeaderDashboardApi.CenterNode | null>(null);
const selectedTown = ref<LeaderDashboardApi.TownSummaryRow | null>(null);
const selectedManager = ref<LeaderDashboardApi.ManagerBrief | null>(null);
const selectedMonth = ref(''); // '' = 历年累计

const loading = reactive({
  centers: false,
  towns: false,
  roles: false,
  employee: false,
  trend: false,
  manager: false,
  month: false,
});

const drawerVisible = ref(false);

/** 维度明细下钻弹窗（P3，2026-09-28 增 sub 子指标过滤） */
const dimDialog = reactive({
  show: false,
  loading: false,
  title: '',
  scope: '' as 'org' | 'personal' | '',
  scopeLabel: '',
  year: null as number | null,
  month: '',
  sub: '',
  subLabel: '',
  dateSpan: null as { from: string; to: string } | null,
  count: 0,
  fields: [] as LeaderDashboardApi.DimRecordField[],
  records: [] as Record<string, any>[],
});

/** 缺失值兜底（MonthCell 无 risks / drivers.personCount） */
const v = (x: number | undefined): number | string => (x == null ? '—' : x);

/** 环卫线 10 维概览配置 */
const ENV_MODULES: LdDim[] = [
  {
    key: 'accidents',
    label: '事故',
    icon: 'lucide:alert-triangle',
    color: '#f5222d',
    main: (s) => v(s?.accidents?.count),
    note: (s) => `重大 ${v(s?.accidents?.major)}`,
  },
  {
    key: 'drivers',
    label: '驾驶员',
    icon: 'lucide:car',
    color: '#fa8c16',
    main: (s) => v(s?.drivers?.personCount),
    note: (s) =>
      `记分${v(s?.drivers?.demeritCount)}·车检${v(s?.drivers?.vehicleCheckCount)}·驾检${v(s?.drivers?.driverCheckCount)}·违章${v(s?.drivers?.violationCount)}`,
  },
  {
    key: 'risks',
    label: '风险',
    icon: 'lucide:shield-check',
    color: '#8c8c8c',
    main: (s) => v(s?.risks?.count),
    note: () => '静态台账',
  },
  {
    key: 'hazards',
    label: '隐患',
    icon: 'lucide:zap',
    color: '#722ed1',
    main: (s) => v(s?.hazards?.count),
    note: () => '处',
  },
  {
    key: 'transferStations',
    label: '转运站',
    icon: 'lucide:warehouse',
    color: '#13c2c2',
    main: (s) => v(s?.transferStations?.checkCount),
    note: () => '检查次',
  },
  {
    key: 'violations',
    label: '三违',
    icon: 'lucide:user-x',
    color: '#fa541c',
    main: (s) => v(s?.violations?.count),
    note: (s) => `严重 ${v(s?.violations?.serious)}`,
  },
  {
    key: 'inspections',
    label: '巡查',
    icon: 'lucide:clipboard-check',
    color: '#1890ff',
    main: (s) => v(s?.inspections?.count),
    note: () => '巡查次',
  },
  {
    key: 'trainings',
    label: '培训',
    icon: 'lucide:graduation-cap',
    color: '#52c41a',
    main: (s) => v(s?.trainings?.recordCount),
    note: (s) => `${v(s?.trainings?.personCount)}人`,
  },
  {
    key: 'emergencies',
    label: '应急',
    icon: 'lucide:siren',
    color: '#eb2f96',
    main: (s) => v(s?.emergencies?.count),
    note: (s) => `通过 ${v(s?.emergencies?.passed)}`,
  },
  {
    key: 'assessments',
    label: '考核',
    icon: 'lucide:trophy',
    color: '#2f54eb',
    main: (s) => v(s?.assessments?.avgScore),
    note: (s) => `${v(s?.assessments?.targetCount)}人·优良${v(s?.assessments?.gradeGood)}`,
  },
];

/** 维度语义色索引（主数字 / 趋势表 / 表格数字统一来源，取自 ENV_MODULES） */
const DIM_COLOR = new Map(ENV_MODULES.map((d) => [d.key, d.color]));

/** 园林线 8 维（去驾驶员/转运站，巡查改「安全巡查」） */
const PARK_MODULES: LdDim[] = ENV_MODULES.filter(
  (m) => m.key !== 'drivers' && m.key !== 'transferStations',
).map((m) => (m.key === 'inspections' ? { ...m, label: '安全巡查' } : m));

const activeDims = computed<LdDim[]>(() => {
  const name = selectedCenter.value?.orgName || '';
  return name.includes('园林') ? PARK_MODULES : ENV_MODULES;
});

const scopeText = computed(() =>
  year.value === '' ? '历年累计' : `${year.value}年`,
);

/** 趋势表行（按维度集过滤；风险静态台账不入月度）
 *  trendKey：趋势数据键（t.rows[dim][trendKey]）；drillSub：下钻子指标，
 *  仅真过滤行携带（major/serious/gradeGood/passed/驾驶4子项），count/聚合行缺省=维度整体。 */
function buildTrendRows(t: LeaderDashboardApi.TrendData, dimKeys: Set<string>): LdTrendRow[] {
  const rows: LdTrendRow[] = [];
  const push = (dim: string, label: string, trendKey: string, drillSub?: string) => {
    if (!dimKeys.has(dim)) return;
    const arr: unknown = (t.rows as Record<string, any>)?.[dim]?.[trendKey];
    if (!Array.isArray(arr)) return;
    rows.push({
      label,
      values: arr as (number | string)[],
      color: DIM_COLOR.get(dim),
      dim,
      sub: drillSub,
    });
  };
  push('accidents', '事故', 'count');
  push('accidents', '重大事故', 'major', 'major');
  push('accidents', '事故加权指数', 'weightedIndex');
  push('drivers', '驾驶证记分', 'demeritCount', 'demeritCount');
  push('drivers', '车辆检查', 'vehicleCheckCount', 'vehicleCheckCount');
  push('drivers', '驾驶员检查', 'driverCheckCount', 'driverCheckCount');
  push('drivers', '驾驶员违章', 'violationCount', 'violationCount');
  push('hazards', '隐患', 'count');
  push('transferStations', '转运站检查', 'checkCount');
  push('violations', '三违', 'count');
  push('violations', '严重三违', 'serious', 'serious');
  push('inspections', '巡查', 'count');
  push('trainings', '培训人次', 'recordCount');
  push('trainings', '培训人数', 'personCount');
  push('emergencies', '应急演练', 'count');
  push('emergencies', '演练通过', 'passed', 'passed');
  push('assessments', '考核人数', 'targetCount');
  push('assessments', '考核优良', 'gradeGood', 'gradeGood');
  push('assessments', '考核均分', 'avgScore');
  return rows;
}

const activeTrendRows = computed<LdTrendRow[]>(() => {
  const t = trendData.value;
  if (!t) return [];
  const keys = new Set(activeDims.value.map((d) => d.key));
  return buildTrendRows(t, keys);
});

/** 经理页双卡数据源：选中月 → 月明细，否则累计 */
const dualData = computed(() => {
  if (selectedMonth.value && managerMonthDetail.value) return managerMonthDetail.value;
  return managerOverview.value;
});

function monthOptionLabel(m: string): string {
  const months = trendData.value?.months || [];
  const years = new Set(months.map((x) => x.slice(0, 4)));
  return years.size > 1 ? m.slice(2) : `${Number(m.slice(5))}月`;
}

const monthOptions = computed(() => [
  { label: '历年累计', value: '' },
  ...(trendData.value?.months || []).map((m) => ({ label: monthOptionLabel(m), value: m })),
]);

// ===== 数据拉取 =====
async function fetchCenters() {
  loading.centers = true;
  try {
    centersData.value = await getLeaderCenters();
  } catch (e: any) {
    message.error(e?.message || '获取作业中心失败');
  } finally {
    loading.centers = false;
  }
}

async function fetchTowns() {
  if (!selectedCenter.value) return;
  loading.towns = true;
  townsData.value = null;
  try {
    townsData.value = await getLeaderTownsByCenter(
      selectedCenter.value.id,
      year.value === '' ? undefined : year.value,
    );
  } catch (e: any) {
    message.error(e?.message || '获取乡镇汇总失败');
  } finally {
    loading.towns = false;
  }
}

async function fetchTownDetail() {
  const c = selectedCenter.value;
  const t = selectedTown.value;
  if (!c || !t) return;
  loading.trend = true;
  trendData.value = null;
  managersData.value = null;
  try {
    const [tr, mg] = await Promise.all([
      getLeaderTownTrend(c.id, t.id, year.value === '' ? undefined : year.value),
      getLeaderTownManagers(t.id),
    ]);
    trendData.value = tr;
    managersData.value = mg;
  } catch (e: any) {
    message.error(e?.message || '获取乡镇详情失败');
  } finally {
    loading.trend = false;
  }
}

async function fetchRoles() {
  const t = selectedTown.value;
  if (!t) return;
  loading.roles = true;
  rolesData.value = null;
  try {
    rolesData.value = await getLeaderRolesByTown(
      t.id,
      year.value === '' ? currentYear : year.value,
    );
  } catch (e: any) {
    message.error(e?.message || '获取角色分组失败');
  } finally {
    loading.roles = false;
  }
}

async function fetchManagerData() {
  const c = selectedCenter.value;
  const t = selectedTown.value;
  const m = selectedManager.value;
  if (!c || !t || !m) return;
  loading.manager = true;
  selectedMonth.value = '';
  managerMonthDetail.value = null;
  managerOverview.value = null;
  try {
    const [ov, tr] = await Promise.all([
      getLeaderManagerOverview(
        m.employeeId,
        t.id,
        year.value === '' ? undefined : year.value,
      ),
      getLeaderTownTrend(c.id, t.id, year.value === '' ? undefined : year.value),
    ]);
    managerOverview.value = ov;
    trendData.value = tr;
  } catch (e: any) {
    message.error(e?.message || '获取经理数据失败');
  } finally {
    loading.manager = false;
  }
}

async function handleMonthChange(m: string) {
  selectedMonth.value = m;
  if (!m) {
    managerMonthDetail.value = null;
    return;
  }
  const t = selectedTown.value;
  const mgr = selectedManager.value;
  if (!t || !mgr) return;
  loading.month = true;
  try {
    managerMonthDetail.value = await getLeaderManagerMonthDetail(mgr.employeeId, t.id, m);
  } catch (e: any) {
    message.error(e?.message || '获取月度明细失败');
  } finally {
    loading.month = false;
  }
}

async function fetchEmployee(employeeId: number) {
  loading.employee = true;
  employeeDetail.value = null;
  try {
    employeeDetail.value = await getLeaderEmployeeDetail(
      employeeId,
      year.value === '' ? undefined : year.value,
    );
  } catch (e: any) {
    message.error(e?.message || '获取员工明细失败');
  } finally {
    loading.employee = false;
  }
}

// ===== 维度明细下钻（P3：点击任意数字 → 明细弹窗；sub=子指标二次过滤） =====
async function openDimRecords(params: {
  scope: 'org' | 'personal';
  orgId?: number;
  employeeId?: number;
  dim: string;
  sub?: string;
  month?: string;
}) {
  const label =
    ENV_MODULES.find((m) => m.key === params.dim)?.label || params.dim;
  dimDialog.title = label;
  dimDialog.scope = params.scope;
  dimDialog.show = true;
  dimDialog.loading = true;
  dimDialog.sub = params.sub || '';
  dimDialog.subLabel = '';
  dimDialog.dateSpan = null;
  dimDialog.fields = [];
  dimDialog.records = [];
  try {
    const d = await getLeaderDimRecords({
      scope: params.scope,
      orgId: params.orgId,
      employeeId: params.employeeId,
      dim: params.dim,
      sub: params.sub,
      month: params.month,
      year: year.value === '' ? undefined : year.value,
    });
    dimDialog.scopeLabel = d.scopeLabel;
    dimDialog.year = d.year;
    dimDialog.month = d.month || '';
    dimDialog.sub = d.sub || '';
    dimDialog.subLabel = d.subLabel || '';
    dimDialog.dateSpan = d.dateSpan;
    dimDialog.count = d.count;
    dimDialog.fields = d.fields;
    dimDialog.records = d.records;
  } catch (e: any) {
    message.error(e?.message || '获取明细失败');
    dimDialog.show = false;
  } finally {
    dimDialog.loading = false;
  }
}

/** 辖区口径（默认当前选中乡镇；视图B 卡片内点击需显式传乡镇；sub 子指标可选） */
function openOrgDim(dim: string, month?: string, sub?: string) {
  const t = selectedTown.value;
  if (!t) return;
  openDimRecords({ scope: 'org', orgId: t.id, dim, sub, month });
}

/** 视图B：乡镇列表卡片内点击（此时 selectedTown 尚未选中；卡片主值=维度整体，不下钻子指标） */
function openTownCardDim(t: LeaderDashboardApi.TownSummaryRow, dim: string) {
  openDimRecords({ scope: 'org', orgId: t.id, dim });
}

/** 个人口径（经理页个人卡；sub 子指标可选） */
function openPersonalDim(dim: string, month?: string, sub?: string) {
  const m = selectedManager.value;
  if (!m) return;
  openDimRecords({ scope: 'personal', employeeId: m.employeeId, dim, sub, month });
}

/** 趋势表单元格点击：按行维度 + 子指标 + 列月份下钻辖区明细 */
function onTrendCellClick(row: LdTrendRow, index: number) {
  const month = trendData.value?.months?.[index];
  openOrgDim(row.dim || '', month, row.sub);
}

/** 明细弹窗动态列（列定义来自后端 fields，前端不重复维护映射）
 *  minWidth 替代 width：列至少 w 宽、可随容器拉伸均分，配合 autoWidth 消除右侧留白 */
function dimColumns(): VxeTableGridColumns {
  return dimDialog.fields.map((f) => ({
    field: f.k,
    title: f.label,
    minWidth: f.w,
    align: 'center',
  }));
}

// ===== 钻取交互 =====
function enterTown(center: LeaderDashboardApi.CenterNode) {
  selectedCenter.value = center;
  selectedTown.value = null;
  view.value = 'town';
  fetchTowns();
}

function enterTownDetail(town: LeaderDashboardApi.TownSummaryRow) {
  selectedTown.value = town;
  view.value = 'townDetail';
  fetchTownDetail();
}

function enterRoles() {
  view.value = 'roles';
  fetchRoles();
}

function enterManager(m: LeaderDashboardApi.ManagerBrief) {
  selectedManager.value = m;
  view.value = 'manager';
  fetchManagerData();
}

function openEmployee(emp: LeaderDashboardApi.EmployeeBrief) {
  drawerVisible.value = true;
  fetchEmployee(emp.employeeId);
}

function goCenter() {
  selectedCenter.value = null;
  selectedTown.value = null;
  selectedManager.value = null;
  selectedMonth.value = '';
  managerOverview.value = null;
  managerMonthDetail.value = null;
  view.value = 'center';
}

function goTown() {
  if (!selectedCenter.value) return;
  selectedTown.value = null;
  selectedManager.value = null;
  selectedMonth.value = '';
  managerOverview.value = null;
  managerMonthDetail.value = null;
  view.value = 'town';
  fetchTowns();
}

function goTownDetail() {
  if (!selectedTown.value) return;
  selectedManager.value = null;
  selectedMonth.value = '';
  managerOverview.value = null;
  managerMonthDetail.value = null;
  view.value = 'townDetail';
  fetchTownDetail();
}

function refresh() {
  if (view.value === 'center') fetchCenters();
  else if (view.value === 'town') fetchTowns();
  else if (view.value === 'townDetail') fetchTownDetail();
  else if (view.value === 'roles') fetchRoles();
  else fetchManagerData();
}

function handleYearChange() {
  refresh();
  message.success(year.value === '' ? '历年累计数据已加载' : `${year.value}年数据已加载`);
}

// ===== 跳转既有模块（下钻原单） =====
const JUMP: Partial<Record<string, () => void>> = {
  accidents: () => router.push('/accidents'),
  violations: () => router.push('/site/violation/records'),
  inspections: () => router.push('/objectives/assessment-monthly/mirror/grid-ledger'),
  trainings: () => router.push('/training/records'),
  assessments: () => router.push('/objectives/assessment-monthly'),
};

function jumpTo(key: string) {
  JUMP[key]?.();
}

// ===== 角色层表格列（人员跨模块计数） =====
const ROLE_ORDER: LeaderDashboardApi.RoleType[] = ['manager', 'admin', 'driver', 'other'];

function employeeColumns(): VxeTableGridColumns {
  return [
    { field: 'name', title: '姓名', width: 90, fixed: 'left' },
    { field: 'positionName', title: '岗位', width: 130 },
    {
      field: 'violations',
      title: '三违',
      width: 56,
      align: 'center',
      slots: { default: 'violationsCell' },
    },
    {
      field: 'accidents',
      title: '事故',
      width: 56,
      align: 'center',
      slots: { default: 'accidentsCell' },
    },
    {
      field: 'inspections',
      title: '巡查',
      width: 56,
      align: 'center',
      slots: { default: 'inspectionsCell' },
    },
    {
      field: 'trainings',
      title: '培训',
      width: 56,
      align: 'center',
      slots: { default: 'trainingsCell' },
    },
    {
      field: 'assessmentAvgScore',
      title: '考核均分',
      width: 80,
      align: 'center',
      slots: { default: 'assessmentCell' },
    },
    {
      field: 'action',
      title: '操作',
      width: 70,
      align: 'center',
      slots: { default: 'actionCell' },
    },
  ];
}

/** 角色分组（数据/高度/空态统一入口） */
function roleGroup(role: LeaderDashboardApi.RoleType) {
  return rolesData.value?.roles.find((r) => r.role === role);
}

// 员工明细表格列
function assessmentColumns(): VxeTableGridColumns {
  return [
    { field: 'month', title: '月份', width: 100 },
    {
      field: 'scoreTotal',
      title: '得分',
      width: 80,
      align: 'center',
      slots: { default: 'scoreTotalCell' },
    },
    { field: 'grade', title: '等级', width: 80, align: 'center' },
    { field: 'rankTownship', title: '乡镇排名', width: 100, align: 'center' },
    { field: 'cycleName', title: '考核周期' },
  ];
}

function detailColumns(type: 'accidents' | 'violations' | 'inspections' | 'trainings'): VxeTableGridColumns {
  const common: VxeTableGridColumns = [
    {
      field: 'action',
      title: '查看',
      width: 60,
      align: 'center',
      slots: { default: `action-${type}Cell` },
    },
  ];
  switch (type) {
    case 'accidents':
      return [
        { field: 'accidentNo', title: '事故编号', width: 120 },
        { field: 'title', title: '标题' },
        { field: 'level', title: '等级', width: 80, align: 'center' },
        { field: 'accidentDate', title: '日期', width: 110 },
        { field: 'township', title: '乡镇', width: 110 },
        ...common,
      ];
    case 'violations':
      return [
        { field: 'violationDate', title: '日期', width: 110 },
        { field: 'violationType', title: '类型' },
        { field: 'violationLevel', title: '等级', width: 80, align: 'center' },
        { field: 'violatorName', title: '违章人', width: 90 },
        ...common,
      ];
    case 'inspections':
      return [
        { field: 'inspectionDate', title: '日期', width: 110 },
        { field: 'areaTeam', title: '片区/班组' },
        { field: 'gridLevel', title: '网格等级', width: 90, align: 'center' },
        ...common,
      ];
    case 'trainings':
      return [
        { field: 'trainingDate', title: '日期', width: 110 },
        { field: 'trainingType', title: '培训类型' },
        { field: 'result', title: '结果', width: 80, align: 'center' },
        { field: 'trainer', title: '培训人', width: 90 },
        ...common,
      ];
  }
}

function insuranceColumns(): VxeTableGridColumns {
  return [
    { field: 'personName', title: '姓名', width: 90 },
    { field: 'insuranceType', title: '险种', width: 110 },
    { field: 'startDate', title: '生效日期', width: 110 },
    { field: 'expireDate', title: '到期日期', width: 110 },
    { field: 'premium', title: '保费(元)', width: 90, align: 'right' },
    {
      field: 'isCurrent',
      title: '状态',
      width: 80,
      align: 'center',
      slots: { default: 'insuranceStatusCell' },
    },
  ];
}

// 页面初始化
fetchCenters();
</script>

<template>
  <HsePageLayout title="领导视角统一看板" :auto-content-height="true">
    <div class="ld-toolbar">
      <div class="ld-breadcrumb">
        <span v-if="view === 'center'" class="crumb-item crumb-current">作业中心</span>
        <span v-else class="crumb-link" @click="goCenter">作业中心</span>
        <template v-if="view !== 'center' && selectedCenter">
          <IconifyIcon icon="lucide:chevron-right" :size="14" class="crumb-sep" />
          <span v-if="view === 'town'" class="crumb-item crumb-current">{{ selectedCenter.orgName }}</span>
          <span v-else class="crumb-link" @click="goTown">{{ selectedCenter.orgName }}</span>
        </template>
        <template v-if="view !== 'center' && selectedTown && (view === 'townDetail' || view === 'roles' || view === 'manager')">
          <IconifyIcon icon="lucide:chevron-right" :size="14" class="crumb-sep" />
          <span v-if="view === 'townDetail'" class="crumb-item crumb-current">{{ selectedTown.orgName }}</span>
          <span v-else class="crumb-link" @click="goTownDetail">{{ selectedTown.orgName }}</span>
        </template>
        <template v-if="view !== 'center' && view === 'manager' && selectedManager">
          <IconifyIcon icon="lucide:chevron-right" :size="14" class="crumb-sep" />
          <span class="crumb-item crumb-current">{{ selectedManager.name }}</span>
        </template>
      </div>
      <div class="ld-actions">
        <NButton
          v-if="view === 'townDetail'"
          quaternary
          size="small"
          @click="enterRoles"
        >
          <IconifyIcon icon="lucide:users" :size="15" />
          角色明细
        </NButton>
        <NButton quaternary size="small" @click="refresh">
          <IconifyIcon icon="lucide:refresh-cw" :size="15" />
          刷新
        </NButton>
        <NSelect
          v-model:value="year"
          :options="yearOptions"
          size="small"
          style="width: 120px"
          @update:value="handleYearChange"
        />
      </div>
    </div>

    <!-- 视图A：作业中心 -->
    <NSpin :show="loading.centers">
      <div v-if="view === 'center'" class="ld-center-grid">
        <NCard
          v-for="c in centersData?.centers || []"
          :key="c.id"
          class="ld-center-card"
          :bordered="false"
          @click="enterTown(c)"
        >
          <div class="center-icon">
            <IconifyIcon
              :icon="c.orgName.includes('环卫') ? 'lucide:trash-2' : 'lucide:tree-pine'"
              :size="26"
            />
          </div>
          <div class="center-name">{{ c.orgName }}</div>
          <div class="center-desc">
            {{ c.orgName.includes('园林') ? `下辖 ${c.townCount} 个公园` : `下辖 ${c.townCount} 个乡镇作业中心` }}
            <IconifyIcon icon="lucide:chevron-right" :size="14" />
          </div>
        </NCard>
        <NEmpty v-if="!loading.centers && (!centersData?.centers?.length)" description="暂无作业中心数据" />
      </div>
    </NSpin>

    <!-- 视图B：乡镇/公园列表（历年累计概览） -->
    <NSpin :show="loading.towns">
      <div v-if="view === 'town'">
        <div class="ld-towns-grid">
          <NCard
            v-for="t in townsData?.towns || []"
            :key="t.id"
            class="ld-town-card"
            :bordered="false"
            @click="enterTownDetail(t)"
          >
            <div class="town-head">
              <div class="town-name">{{ t.shortName || t.orgName }}</div>
              <div class="town-more">
                {{ scopeText }}
                <IconifyIcon icon="lucide:chevron-right" :size="13" />
              </div>
            </div>
            <LdModuleGrid
              :dims="activeDims"
              :data="t.summary"
              @dim-click="(k) => openTownCardDim(t, k)"
            />
          </NCard>
        </div>
        <NEmpty
          v-if="!loading.towns && !townsData?.towns?.length"
          description="该作业中心暂无乡镇数据"
        />
      </div>
    </NSpin>

    <!-- 视图C：乡镇/公园详情（累计卡 + 逐月趋势 + 经理入口） -->
    <NSpin :show="loading.trend">
      <div v-if="view === 'townDetail'">
        <div class="ld-section">
          <div class="ld-section-title">
            历年累计
            <span class="section-sub">{{ scopeText }}</span>
          </div>
          <LdModuleGrid
            v-if="trendData"
            :dims="activeDims"
            :data="trendData.summary"
            @dim-click="openOrgDim"
          />
          <NEmpty v-else description="暂无汇总数据" />
        </div>

        <div class="ld-section">
          <div class="ld-section-title">
            逐月趋势
            <span class="section-sub">风险为静态台账，不参与月度</span>
          </div>
          <LdTrendTable
            :rows="activeTrendRows"
            :months="trendData?.months || []"
            @cell-click="onTrendCellClick"
          />
        </div>

        <div class="ld-section">
          <div class="ld-section-title">
            {{ managersData?.roleLabel || '经理' }}
            <span class="section-sub">点击查看双口径累计与逐月明细</span>
          </div>
          <div v-if="managersData?.managers?.length" class="ld-mgr-cards">
            <div
              v-for="m in managersData.managers"
              :key="m.employeeId"
              class="ld-mgr-card"
              @click="enterManager(m)"
            >
              <div class="mgr-avatar">{{ m.name.slice(0, 1) }}</div>
              <div class="mgr-info">
                <div class="mgr-name">{{ m.name }}</div>
                <div class="mgr-pos">{{ m.positionName }}</div>
              </div>
              <IconifyIcon icon="lucide:chevron-right" :size="16" class="mgr-arrow" />
            </div>
          </div>
          <NEmpty
            v-else-if="!loading.trend"
            description="暂无经理/管理员（仅可查看辖区累计）"
            :size="'small'"
          />
        </div>
      </div>
    </NSpin>

    <!-- 视图D：角色分组（M1 保留） -->
    <NSpin :show="loading.roles">
      <div v-if="view === 'roles'">
        <div v-if="rolesData" class="ld-role-summary">
          <NTag size="small" :bordered="false" type="info">
            {{ rolesData.town.shortName }} · {{ rolesData.year }}年 · 在岗 {{ rolesData.employeeCount }} 人
          </NTag>
        </div>
        <div class="ld-role-grid">
          <NCard
            v-for="role in ROLE_ORDER"
            :key="role"
            class="ld-role-card"
            :bordered="false"
          >
            <template #header>
              <div class="role-head">
                <span>{{ roleGroup(role)?.label || role }}</span>
                <NTag size="small" :bordered="false" type="default">
                  {{ roleGroup(role)?.count || 0 }} 人
                </NTag>
              </div>
            </template>
            <HseDataGrid
              :columns="employeeColumns()"
              :data="roleGroup(role)?.employees || []"
              :pager="false"
              row-key="employeeId"
              :height="(roleGroup(role)?.employees?.length || 0) > 10 ? 420 : undefined"
            >
              <template #violationsCell="{ row }">
                <span
                  class="ld-num ld-num-click"
                  :style="{ color: DIM_COLOR.get('violations') }"
                  @click.stop="openEmployee(row)"
                  >{{ row.summary.violations }}</span
                >
              </template>
              <template #accidentsCell="{ row }">
                <span
                  class="ld-num ld-num-click"
                  :style="{ color: DIM_COLOR.get('accidents') }"
                  @click.stop="openEmployee(row)"
                  >{{ row.summary.accidents }}</span
                >
              </template>
              <template #inspectionsCell="{ row }">
                <span
                  class="ld-num ld-num-click"
                  :style="{ color: DIM_COLOR.get('inspections') }"
                  @click.stop="openEmployee(row)"
                  >{{ row.summary.inspections }}</span
                >
              </template>
              <template #trainingsCell="{ row }">
                <span
                  class="ld-num ld-num-click"
                  :style="{ color: DIM_COLOR.get('trainings') }"
                  @click.stop="openEmployee(row)"
                  >{{ row.summary.trainings }}</span
                >
              </template>
              <template #assessmentCell="{ row }">
                <span
                  class="ld-num ld-num-click"
                  :style="{ color: DIM_COLOR.get('assessments') }"
                  @click.stop="openEmployee(row)"
                >
                  {{ row.summary.assessmentCount > 0 ? row.summary.assessmentAvgScore : '—' }}
                </span>
              </template>
              <template #actionCell="{ row }">
                <NButton size="tiny" type="primary" secondary @click="openEmployee(row)">
                  明细
                </NButton>
              </template>
            </HseDataGrid>
            <NEmpty
              v-if="!(roleGroup(role)?.employees?.length)"
              description="暂无人员"
            />
          </NCard>
        </div>
      </div>
    </NSpin>

    <!-- 视图E：经理双口径（双卡并排 + 辖区趋势 + 月明细） -->
    <div v-if="view === 'manager'">
      <div class="ld-mgr-head">
        <div class="mgr-avatar lg">
          {{ (managerOverview?.employee?.name || selectedManager?.name || '').slice(0, 1) }}
        </div>
        <div class="mgr-info">
          <div class="mgr-name">
            {{ managerOverview?.employee?.name || selectedManager?.name }}
            <NTag size="small" :bordered="false" type="primary">
              {{ managersData?.roleLabel }}
            </NTag>
          </div>
          <div class="mgr-sub">
            {{ managerOverview?.employee?.employeeCode }} · {{ managerOverview?.employee?.positionName || selectedManager?.positionName }}
          </div>
        </div>
        <div class="mgr-month">
          <span class="mgr-month-label">查看月份</span>
          <NSelect
            v-model:value="selectedMonth"
            :options="monthOptions"
            size="small"
            style="width: 130px"
            @update:value="handleMonthChange"
          />
        </div>
      </div>

      <div class="ld-dual-cards">
        <NCard class="ld-dual-card" :bordered="false">
          <template #header>
            <div class="dual-head">
              <span>辖区（全组织）</span>
              <NTag size="small" :bordered="false" :type="selectedMonth ? 'info' : 'default'">
                {{ selectedMonth || scopeText }}
              </NTag>
            </div>
          </template>
          <NSpin :show="loading.manager || loading.month">
            <LdModuleGrid
              v-if="dualData"
              :dims="activeDims"
              :data="dualData.jurisdiction"
              @dim-click="(k) => openOrgDim(k, selectedMonth || undefined)"
            />
            <NEmpty v-else description="暂无数据" />
          </NSpin>
        </NCard>
        <NCard class="ld-dual-card" :bordered="false">
          <template #header>
            <div class="dual-head">
              <span>个人（本人归因）</span>
              <NTag size="small" :bordered="false" :type="selectedMonth ? 'info' : 'default'">
                {{ selectedMonth || scopeText }}
              </NTag>
            </div>
          </template>
          <NSpin :show="loading.manager || loading.month">
            <LdModuleGrid
              v-if="dualData"
              :dims="activeDims"
              :data="dualData.personal"
              @dim-click="(k) => openPersonalDim(k, selectedMonth || undefined)"
            />
            <NEmpty v-else description="暂无数据" />
          </NSpin>
        </NCard>
      </div>

      <div class="ld-section">
        <div class="ld-section-title">
          辖区逐月趋势
          <span class="section-sub">风险为静态台账，不参与月度</span>
        </div>
        <LdTrendTable
          :rows="activeTrendRows"
          :months="trendData?.months || []"
          @cell-click="onTrendCellClick"
        />
      </div>
    </div>

    <!-- 员工跨模块明细抽屉 -->
    <NDrawer v-model:show="drawerVisible" :width="760" placement="right">
      <NDrawerContent :title="employeeDetail?.employee.name || '员工明细'" closable>
        <NSpin :show="loading.employee">
          <div v-if="employeeDetail" class="ld-detail">
            <NDescriptions :column="2" size="small" bordered>
              <NDescriptionsItem label="工号">{{ employeeDetail.employee.employeeCode }}</NDescriptionsItem>
              <NDescriptionsItem label="岗位">{{ employeeDetail.employee.positionName }}</NDescriptionsItem>
              <NDescriptionsItem label="所属组织">{{ employeeDetail.employee.orgName }}</NDescriptionsItem>
              <NDescriptionsItem label="直接上级">{{ employeeDetail.employee.supervisorName || '—' }}</NDescriptionsItem>
            </NDescriptions>

            <NDivider title-placement="left" class="ld-divider">
              <span class="divider-title">月度考核</span>
              <span class="divider-link" @click="jumpTo('assessments')">考核门户 →</span>
            </NDivider>
            <HseDataGrid
              :columns="assessmentColumns()"
              :data="employeeDetail.assessment"
              :pager="false"
            >
              <template #scoreTotalCell="{ row }">
                <span class="ld-num" :style="{ color: DIM_COLOR.get('assessments') }">{{ row.scoreTotal }}</span>
              </template>
            </HseDataGrid>
            <NEmpty v-if="!employeeDetail.assessment.length" description="本年暂无考核记录" />

            <NDivider title-placement="left" class="ld-divider">
              <span class="divider-title">事故</span>
            </NDivider>
            <HseDataGrid
              :columns="detailColumns('accidents')"
              :data="employeeDetail.accidents"
              :pager="false"
            >
              <template #action-accidentsCell>
                <NButton size="tiny" type="primary" secondary @click="jumpTo('accidents')">
                  原单
                </NButton>
              </template>
            </HseDataGrid>
            <NEmpty v-if="!employeeDetail.accidents.length" description="本年无事故记录" />

            <NDivider title-placement="left" class="ld-divider">
              <span class="divider-title">三违</span>
            </NDivider>
            <HseDataGrid
              :columns="detailColumns('violations')"
              :data="employeeDetail.violations"
              :pager="false"
            >
              <template #action-violationsCell>
                <NButton size="tiny" type="primary" secondary @click="jumpTo('violations')">
                  原单
                </NButton>
              </template>
            </HseDataGrid>
            <NEmpty v-if="!employeeDetail.violations.length" description="本年无三违记录" />

            <NDivider title-placement="left" class="ld-divider">
              <span class="divider-title">网格长巡查</span>
            </NDivider>
            <HseDataGrid
              :columns="detailColumns('inspections')"
              :data="employeeDetail.inspections"
              :pager="false"
            >
              <template #action-inspectionsCell>
                <NButton size="tiny" type="primary" secondary @click="jumpTo('inspections')">
                  原单
                </NButton>
              </template>
            </HseDataGrid>
            <NEmpty v-if="!employeeDetail.inspections.length" description="本年无巡查记录" />

            <NDivider title-placement="left" class="ld-divider">
              <span class="divider-title">培训</span>
            </NDivider>
            <HseDataGrid
              :columns="detailColumns('trainings')"
              :data="employeeDetail.trainings"
              :pager="false"
            >
              <template #action-trainingsCell>
                <NButton size="tiny" type="primary" secondary @click="jumpTo('trainings')">
                  原单
                </NButton>
              </template>
            </HseDataGrid>
            <NEmpty v-if="!employeeDetail.trainings.length" description="本年无培训记录" />

            <NDivider title-placement="left" class="ld-divider">
              <span class="divider-title">人员保险（公司集采，当前保单）</span>
            </NDivider>
            <HseDataGrid
              :columns="insuranceColumns()"
              :data="employeeDetail.insurance"
              :pager="false"
            >
              <template #insuranceStatusCell="{ row }">
                <NTag v-if="row.isCurrent" size="small" type="success">有效</NTag>
                <NTag v-else size="small">失效</NTag>
              </template>
            </HseDataGrid>
            <NEmpty v-if="!employeeDetail.insurance.length" description="无保险记录" />
          </div>
        </NSpin>
      </NDrawerContent>
    </NDrawer>

    <!-- 维度明细下钻弹窗（P3；宽度按内容自适应，列少时自动缩窄消除右侧留白） -->
    <NModal
      v-model:show="dimDialog.show"
      preset="card"
      class="ld-dim-modal"
      style="width: fit-content; min-width: 560px; max-width: 92vw"
      :title="`${dimDialog.title}明细`"
    >
      <div class="dim-head">
        <NTag size="small" :bordered="false" :type="dimDialog.scope === 'personal' ? 'success' : 'info'">
          {{ dimDialog.scope === 'personal' ? '个人口径' : '辖区口径' }}
        </NTag>
        <NTag v-if="dimDialog.subLabel" size="small" :bordered="false" type="warning">
          {{ dimDialog.subLabel }}
        </NTag>
        <span class="dim-sub">
          {{ dimDialog.scopeLabel }}
          <template v-if="dimDialog.year"> · {{ dimDialog.year }}年</template>
          <template v-else-if="dimDialog.dateSpan"> · 历年累计</template>
          <template v-if="dimDialog.month"> · {{ Number(dimDialog.month.slice(5)) }}月</template>
          <template v-if="dimDialog.dateSpan"> · {{ dimDialog.dateSpan.from }} ~ {{ dimDialog.dateSpan.to }}</template>
          · 共 {{ dimDialog.count }} 条
        </span>
      </div>
      <NSpin :show="dimDialog.loading">
        <HseDataGrid
          :columns="dimColumns()"
          :data="dimDialog.records"
          :pager="false"
          auto-width
          :height="dimDialog.records.length > 14 ? 520 : undefined"
        />
        <NEmpty
          v-if="!dimDialog.loading && !dimDialog.records.length"
          description="暂无明细记录"
        />
      </NSpin>
    </NModal>
  </HsePageLayout>
</template>

<style scoped>
.ld-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
  flex-wrap: wrap;
}

.ld-breadcrumb {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 14px;
}

.crumb-item {
  color: hsl(var(--foreground));
  font-weight: 500;
}

.crumb-link {
  color: var(--primary-color);
  cursor: pointer;
}

.crumb-link:hover {
  opacity: 0.8;
}

.crumb-sep {
  color: hsl(var(--muted-foreground));
}

.ld-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* 视图A：作业中心卡片 */
.ld-center-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.ld-center-card {
  cursor: pointer;
  transition:
    box-shadow 0.2s,
    transform 0.2s;
}

.ld-center-card:hover {
  background: color-mix(in srgb, hsl(var(--success)) 8%, hsl(var(--card)));
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.1);
  transform: translateY(-2px);
}

.center-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  border-radius: 12px;
  color: var(--primary-color);
  background: color-mix(in srgb, var(--primary-color) 12%, transparent);
  margin-bottom: 12px;
}

.center-name {
  font-size: 18px;
  font-weight: 700;
  color: hsl(var(--foreground));
}

.center-desc {
  margin-top: 6px;
  font-size: 13px;
  color: hsl(var(--muted-foreground));
  display: flex;
  align-items: center;
  gap: 4px;
}

/* 视图B：乡镇/公园卡片（每行固定 3 列） */
.ld-towns-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}

.ld-town-card {
  cursor: pointer;
  transition:
    box-shadow 0.2s,
    transform 0.2s;
}

.ld-town-card:hover {
  background: color-mix(in srgb, hsl(var(--success)) 8%, hsl(var(--card)));
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.1);
  transform: translateY(-2px);
}

.town-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.town-name {
  font-size: 17px;
  font-weight: 700;
  color: hsl(var(--foreground));
}

.town-more {
  font-size: 12px;
  color: var(--primary-color);
  display: flex;
  align-items: center;
  gap: 2px;
}

/* 视图C：乡镇详情区段 */
.ld-section {
  margin-bottom: 18px;
}

.ld-section-title {
  font-size: 15px;
  font-weight: 600;
  color: hsl(var(--foreground));
  margin-bottom: 10px;
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.section-sub {
  font-size: 12px;
  font-weight: 400;
  color: hsl(var(--muted-foreground));
}

/* 经理入口卡片 */
.ld-mgr-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
}

.ld-mgr-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid hsl(var(--border));
  border-radius: 10px;
  cursor: pointer;
  background: hsl(var(--card));
  transition:
    box-shadow 0.2s,
    border-color 0.2s;
}

.ld-mgr-card:hover {
  border-color: hsl(var(--success));
  background: color-mix(in srgb, hsl(var(--success)) 8%, hsl(var(--card)));
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.mgr-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  flex: none;
  font-size: 15px;
  font-weight: 600;
  color: #fff;
  background: linear-gradient(135deg, var(--primary-color), color-mix(in srgb, var(--primary-color) 60%, #fff));
}

.mgr-avatar.lg {
  width: 44px;
  height: 44px;
  font-size: 18px;
}

.mgr-info {
  min-width: 0;
  flex: 1;
}

.mgr-name {
  font-size: 14px;
  font-weight: 600;
  color: hsl(var(--foreground));
  display: flex;
  align-items: center;
  gap: 6px;
}

.mgr-pos {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  margin-top: 2px;
}

.mgr-arrow {
  color: hsl(var(--muted-foreground));
  flex: none;
}

/* 视图E：经理页 */
.ld-mgr-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border: 1px solid hsl(var(--border));
  border-radius: 10px;
  background: hsl(var(--card));
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.mgr-month {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
}

.mgr-month-label {
  font-size: 13px;
  color: hsl(var(--muted-foreground));
}

.ld-dual-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(420px, 1fr));
  gap: 16px;
  margin-bottom: 18px;
}

.ld-dual-card {
  min-width: 0;
}

.dual-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: 600;
  width: 100%;
}

/* 视图D：角色分组 */
.ld-role-summary {
  margin-bottom: 12px;
}

.ld-role-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
  align-items: start;
}

.ld-role-card {
  min-width: 0;
}

.role-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: 600;
}

/* 明细抽屉 */
.ld-detail {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ld-divider {
  margin: 6px 0 10px;
}

.divider-title {
  font-weight: 600;
}

.divider-link {
  margin-left: 8px;
  font-size: 12px;
  color: var(--primary-color);
  cursor: pointer;
}

/* 表格/卡片内语义数字 */
.ld-num {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

/* 角色表数字可点击 → 打开员工明细抽屉 */
.ld-num-click {
  cursor: pointer;
  border-radius: 4px;
  padding: 1px 4px;
  transition:
    background 0.15s,
    box-shadow 0.15s;
}

.ld-num-click:hover {
  background: color-mix(in srgb, hsl(var(--success)) 14%, transparent);
  box-shadow: 0 0 0 1px color-mix(in srgb, hsl(var(--success)) 40%, transparent);
}

/* 维度明细下钻弹窗 */
.dim-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.dim-sub {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

/* 本页所有 HseDataGrid（角色明细 / 员工明细抽屉）行悬浮高亮 = 安全绿，与其他模块列表一致 */
:deep(.vxe-grid) {
  --vxe-ui-table-row-hover-background-color: color-mix(in srgb, hsl(var(--success)) 10%, transparent);
  --vxe-ui-table-row-hover-striped-background-color: color-mix(in srgb, hsl(var(--success)) 10%, transparent);
  --vxe-ui-table-row-hover-current-background-color: color-mix(in srgb, hsl(var(--success)) 10%, transparent);
}
</style>
