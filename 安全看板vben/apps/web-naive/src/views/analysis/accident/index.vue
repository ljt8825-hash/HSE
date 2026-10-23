<script lang="ts" setup>
/**
 * 事故分析中心（web-naive，2026-09-30 重设计）
 *
 * ── 页面布局规范（与驾驶员风险中心 2026-09-30 重设计同一套）──────────
 *   顶部筛选卡 → 核心指标 HseStatCard 行 → 等高卡片网格（趋势+等级 / 分类+责任）
 *   → 乡镇分布全宽 → 明细数据表格。
 *
 * 设计要点：
 *   - 等高紧凑网格：行内卡片 h-full + 内容区 fill-height 撑满，消除留白；
 *   - 图表 height="100%" 自适应撑满（useEcharts 自带 ResizeObserver）；
 *   - 统计卡使用系统组件 HseStatCard，语义色统一 HSE 色板；
 *   - 功能/数据流/接口/路由保持不变。
 */
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
  NButton,
  NCard,
  NEmpty,
  NForm,
  NFormItem,
  NGi,
  NGrid,
  NInput,
  NRadioButton,
  NRadioGroup,
  NSelect,
  NStatistic,
  NTabPane,
  NTabs,
} from 'naive-ui';
import type { VxeTableGridColumns } from '@vben/plugins/vxe-table';

import { IconifyIcon } from '@vben/icons';
import {
  EchartsUI,
  useEcharts,
  type ECOption,
  type EchartsUIType,
} from '@vben/plugins/echarts';

import {
  getAccidentClassification,
  getAccidentOverview,
  getAccidentResponsible,
  getAccidentTrend,
  type AccidentAnalysisApi,
} from '#/api/hse/accident-analysis';
import { HseDataGrid, HsePageLayout, HseStatCard } from '#/components/hse';
import { message } from '#/adapter/naive';

defineOptions({ name: 'HseAccidentAnalysis' });

const router = useRouter();

/* ────────────────────────────── 视觉令牌 ──────────────────────────────
 * Canvas 无法解析 CSS 变量，图表颜色必须使用 hex 字符串。
 * 与驾驶员风险中心重设计同一套 HSE 语义色。
 */
const tokens = {
  colorTextBase: '#1f1f1f',
  colorTextSecondary: '#8c8c8c',
  colorPrimary: '#2080f0',
  colorError: '#f5222d',
  colorWarning: '#faad14',
  colorSuccess: '#52c41a',
  colorBorder: '#f0f0f0',
  colorBgElevated: '#ffffff',
};

/** 区块垂直间距（与 grid gap 保持一致） */
const BLOCK_GAP = 16;

/* ───────────────────────── B1 查询筛选栏 ───────────────────────── */

type CategoryFilter = 'all' | '交通事故' | '生产安全事故';

/**
 * 查询筛选栏采用「草稿 → 提交」模式：
 *   draft   —— 与表单控件双向绑定，改动不立即生效
 *   applied —— 点击「查询」/「重置」后提交的生效条件，驱动接口与图表
 */
const draft = reactive({
  period: 'year' as AccidentAnalysisApi.TrendPeriod,
  year: new Date().getFullYear(),
  category: 'all' as CategoryFilter,
  keyword: '',
});

const applied = reactive({ ...draft });

const periodOptions = [
  { label: '年度趋势', value: 'year' as AccidentAnalysisApi.TrendPeriod },
  { label: '月度趋势', value: 'month' as AccidentAnalysisApi.TrendPeriod },
];

const categoryOptions = [
  { label: '全部分类', value: 'all' as CategoryFilter },
  { label: '交通事故', value: '交通事故' as CategoryFilter },
  { label: '生产安全事故', value: '生产安全事故' as CategoryFilter },
];

const yearOptions = computed(() => {
  const current = new Date().getFullYear();
  const years: number[] = [];
  for (let y = current; y >= current - 5; y--) {
    years.push(y);
  }
  return years.map((y) => ({ label: `${y}年`, value: y }));
});

/** 事故类型 → 一级分类（与后端 CASE WHEN 口径一致） */
function toCategory(accidentType: string): '交通事故' | '生产安全事故' {
  return accidentType === '交通事故' ? '交通事故' : '生产安全事故';
}

/* ───────────────────────── 数据源与加载态 ───────────────────────── */

const overviewData = ref<AccidentAnalysisApi.OverviewData | null>(null);
const trendData = ref<AccidentAnalysisApi.TrendData | null>(null);
const classificationData =
  ref<AccidentAnalysisApi.ClassificationData | null>(null);
const responsibleData = ref<AccidentAnalysisApi.ResponsibleData | null>(null);

const loading = reactive({
  overview: false,
  trend: false,
  classification: false,
  responsible: false,
  refreshing: false,
});

async function loadOverview() {
  loading.overview = true;
  try {
    overviewData.value = await getAccidentOverview();
  } catch (e: any) {
    message.error(e.message || '加载事故总览失败');
  } finally {
    loading.overview = false;
  }
}

async function loadTrend() {
  loading.trend = true;
  try {
    trendData.value = await getAccidentTrend({
      period: applied.period,
      year: applied.period === 'month' ? applied.year : undefined,
    });
  } catch (e: any) {
    message.error(e.message || '加载事故趋势失败');
  } finally {
    loading.trend = false;
  }
}

async function loadClassification() {
  loading.classification = true;
  try {
    classificationData.value = await getAccidentClassification();
  } catch (e: any) {
    message.error(e.message || '加载事故分类失败');
  } finally {
    loading.classification = false;
  }
}

async function loadResponsible(page = 1, pageSize = linkedPagination.pageSize) {
  loading.responsible = true;
  try {
    responsibleData.value = await getAccidentResponsible({ page, pageSize });
    linkedPagination.itemCount =
      responsibleData.value?.linkedEmployees?.total ?? 0;
    linkedPagination.page = page;
  } catch (e: any) {
    message.error(e.message || '加载责任人员分析失败');
  } finally {
    loading.responsible = false;
  }
}

/** 全量刷新（页头「刷新数据」按钮） */
async function reloadAll() {
  loading.refreshing = true;
  try {
    await Promise.all([
      loadOverview(),
      loadTrend(),
      loadClassification(),
      loadResponsible(1),
    ]);
  } finally {
    loading.refreshing = false;
  }
}

/** 筛选栏「查询」：提交草稿条件并按条件重新拉取趋势数据 */
function handleSearch() {
  Object.assign(applied, draft);
  loadTrend();
}

/** 筛选栏「重置」：恢复默认条件并提交 */
function handleReset() {
  draft.period = 'year';
  draft.year = new Date().getFullYear();
  draft.category = 'all';
  draft.keyword = '';
  Object.assign(applied, draft);
  loadTrend();
}

/** 趋势卡内周期/年份切换：直接生效并重拉趋势（不经过筛选栏草稿） */
function onTrendPeriodChange() {
  loadTrend();
}

/* ───────────────────────── B2 核心指标 ───────────────────────── */

function formatLoss(loss?: number) {
  if (!loss) return '0元';
  if (loss >= 10_000) return `${(loss / 10_000).toFixed(1)}万元`;
  return `${loss.toFixed(0)}元`;
}

const overview = computed(() => overviewData.value);

/* ───────────────────────── B3 图表分析区 ───────────────────────── */

const trendChartRef = ref<EchartsUIType>();
const typeTrendChartRef = ref<EchartsUIType>();
const typeChartRef = ref<EchartsUIType>();
const levelChartRef = ref<EchartsUIType>();
const positionChartRef = ref<EchartsUIType>();
const deptChartRef = ref<EchartsUIType>();
const townshipChartRef = ref<EchartsUIType>();

const { renderEcharts: renderTrendChart } = useEcharts(trendChartRef);
const { renderEcharts: renderTypeTrendChart } = useEcharts(typeTrendChartRef);
const { renderEcharts: renderTypeChart } = useEcharts(typeChartRef);
const { renderEcharts: renderLevelChart } = useEcharts(levelChartRef);
const { renderEcharts: renderPositionChart } = useEcharts(positionChartRef);
const { renderEcharts: renderDeptChart } = useEcharts(deptChartRef);
const { renderEcharts: renderTownshipChart } = useEcharts(townshipChartRef);

const isYearly = computed(() => applied.period === 'year');

/** 受「事故分类」筛选影响的类型明细 */
const filteredTypeDetails = computed(() => {
  const list = classificationData.value?.typeDetails ?? [];
  if (applied.category === 'all') return list;
  return list.filter((t) => toCategory(t.accidentType) === applied.category);
});

/** 受「事故分类」筛选影响的一级分类汇总卡 */
const filteredCategories = computed(() => {
  const list = classificationData.value?.categories ?? [];
  if (applied.category === 'all') return list;
  return list.filter((c) => c.category === applied.category);
});

const hasTrendData = computed(() =>
  isYearly.value
    ? (trendData.value?.yearly?.length ?? 0) > 0
    : (trendData.value?.monthly?.length ?? 0) > 0,
);

const hasTypeTrendData = computed(() =>
  isYearly.value
    ? (trendData.value?.typeYearly?.length ?? 0) > 0
    : (trendData.value?.typeMonthly?.length ?? 0) > 0,
);

const hasLevelData = computed(
  () => (classificationData.value?.levelDetails?.length ?? 0) > 0,
);

const hasTypeDetailData = computed(
  () => filteredTypeDetails.value.length > 0,
);

const trendChartOption = computed<ECOption>(() => {
  const data = isYearly.value ? trendData.value?.yearly : trendData.value?.monthly;
  if (!data || data.length === 0) return { series: [] };

  const labels = isYearly.value
    ? data.map((d: any) => `${d.year}年`)
    : data.map((d: any) => `${d.month}月`);

  return {
    tooltip: {
      trigger: 'axis',
      backgroundColor: tokens.colorBgElevated,
      textStyle: { color: tokens.colorTextBase },
    },
    legend: {
      data: ['事故总数', '责任事故'],
      top: 0,
      textStyle: { fontSize: 12, color: tokens.colorTextBase },
    },
    grid: { left: '3%', right: '4%', bottom: '3%', top: '14%', containLabel: true },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: labels,
      axisLabel: { fontSize: 12, color: tokens.colorTextBase },
      axisLine: { lineStyle: { color: tokens.colorBorder } },
    },
    yAxis: {
      type: 'value',
      axisLabel: { fontSize: 12, color: tokens.colorTextBase },
      splitLine: { lineStyle: { color: tokens.colorBorder, type: 'dashed' } },
    },
    series: [
      {
        name: '事故总数',
        type: 'line',
        smooth: true,
        data: data.map((d: any) => d.count),
        lineStyle: { color: tokens.colorError, width: 3 },
        itemStyle: { color: tokens.colorError },
        areaStyle: { color: tokens.colorError, opacity: 0.16 },
      },
      {
        name: '责任事故',
        type: 'line',
        smooth: true,
        data: data.map((d: any) => d.responsibleCount),
        lineStyle: { color: tokens.colorWarning, width: 2, type: 'dashed' },
        itemStyle: { color: tokens.colorWarning },
      },
    ],
  };
});

const typeTrendChartOption = computed<ECOption>(() => {
  const raw = isYearly.value
    ? trendData.value?.typeYearly
    : trendData.value?.typeMonthly;
  if (!raw || raw.length === 0) return { series: [] };

  const labels = [
    ...new Set(
      raw.map((d: any) => (isYearly.value ? `${d.year}年` : `${d.month}月`)),
    ),
  ];

  const buildSeries = (category: string) => ({
    name: category,
    type: 'bar' as const,
    data: labels.map((label) => {
      const hit = raw.find(
        (d: any) =>
          (isYearly.value ? `${d.year}年` : `${d.month}月`) === label &&
          d.category === category,
      );
      return hit ? hit.count : 0;
    }),
    itemStyle: {
      color:
        category === '交通事故' ? tokens.colorPrimary : tokens.colorError,
      borderRadius: [4, 4, 0, 0] as [number, number, number, number],
    },
    barWidth: '30%',
  });

  const series =
    applied.category === 'all'
      ? [buildSeries('生产安全事故'), buildSeries('交通事故')]
      : [buildSeries(applied.category)];

  return {
    tooltip: {
      trigger: 'axis',
      backgroundColor: tokens.colorBgElevated,
      textStyle: { color: tokens.colorTextBase },
    },
    legend: {
      data: series.map((s) => s.name),
      top: 0,
      textStyle: { fontSize: 12, color: tokens.colorTextBase },
    },
    grid: { left: '3%', right: '4%', bottom: '3%', top: '14%', containLabel: true },
    xAxis: {
      type: 'category',
      data: labels,
      axisLabel: { fontSize: 12, color: tokens.colorTextBase },
    },
    yAxis: {
      type: 'value',
      axisLabel: { fontSize: 12, color: tokens.colorTextBase },
      splitLine: { lineStyle: { color: tokens.colorBorder, type: 'dashed' } },
    },
    series,
  };
});

const typeChartOption = computed<ECOption>(() => {
  const list = filteredTypeDetails.value;
  if (list.length === 0) return { series: [] };
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: '3%', right: '4%', bottom: '3%', top: '8%', containLabel: true },
    xAxis: {
      type: 'category',
      data: list.map((t) => t.accidentType),
      axisLabel: { fontSize: 11, color: tokens.colorTextBase, rotate: 15 },
    },
    yAxis: {
      type: 'value',
      axisLabel: { fontSize: 11, color: tokens.colorTextBase },
      splitLine: { lineStyle: { color: tokens.colorBorder, type: 'dashed' } },
    },
    series: [
      {
        type: 'bar',
        data: list.map((t) => t.count),
        itemStyle: { color: tokens.colorError, borderRadius: [4, 4, 0, 0] },
        barWidth: '50%',
      },
    ],
  };
});

const levelChartOption = computed<ECOption>(() => {
  const list = classificationData.value?.levelDetails ?? [];
  if (list.length === 0) return { series: [] };
  const colors: Record<string, string> = {
    特别重大: tokens.colorError,
    重大: tokens.colorError,
    较大: tokens.colorWarning,
    一般: tokens.colorWarning,
    未分级: tokens.colorBorder,
  };
  return {
    tooltip: {
      trigger: 'item',
      formatter: '{b}: {c}起 ({d}%)',
      backgroundColor: tokens.colorBgElevated,
      textStyle: { color: tokens.colorTextBase },
    },
    legend: {
      bottom: 0,
      textStyle: { fontSize: 11, color: tokens.colorTextBase },
    },
    series: [
      {
        type: 'pie',
        radius: ['42%', '66%'],
        center: ['50%', '46%'],
        label: { show: true, fontSize: 11, formatter: '{b}\n{d}%' },
        data: list.map((l) => ({
          name: l.level,
          value: l.count,
          itemStyle: { color: colors[l.level] || tokens.colorPrimary },
        })),
      },
    ],
  };
});

/** 横向条形图通用配置（岗位 / 部门 / 属地） */
function buildHorizontalBar(
  names: string[],
  values: number[],
  color: string,
  seriesName: string,
): ECOption {
  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      backgroundColor: tokens.colorBgElevated,
      textStyle: { color: tokens.colorTextBase },
    },
    grid: { left: '3%', right: '6%', bottom: '3%', top: '6%', containLabel: true },
    xAxis: {
      type: 'value',
      axisLabel: { fontSize: 11, color: tokens.colorTextBase },
      splitLine: { lineStyle: { color: tokens.colorBorder, type: 'dashed' } },
    },
    yAxis: {
      type: 'category',
      data: names,
      axisLabel: { fontSize: 11, color: tokens.colorTextBase },
    },
    series: [
      {
        name: seriesName,
        type: 'bar',
        data: values,
        itemStyle: { color, borderRadius: [0, 4, 4, 0] },
        barWidth: '55%',
      },
    ],
  };
}

const positionChartOption = computed<ECOption>(() => {
  const list = (responsibleData.value?.positionDistribution ?? []).filter(
    (p) => p.responsibleCount > 0,
  );
  if (list.length === 0) return { series: [] };
  return buildHorizontalBar(
    list.map((p) => p.positionName).reverse(),
    list.map((p) => p.responsibleCount).reverse(),
    tokens.colorWarning,
    '责任事故',
  );
});

const deptChartOption = computed<ECOption>(() => {
  const list = (responsibleData.value?.departmentDistribution ?? []).filter(
    (d) => d.responsibleCount > 0,
  );
  if (list.length === 0) return { series: [] };
  return buildHorizontalBar(
    list.map((d) => d.departmentName).reverse(),
    list.map((d) => d.responsibleCount).reverse(),
    tokens.colorPrimary,
    '责任事故',
  );
});

const townshipChartOption = computed<ECOption>(() => {
  const list = classificationData.value?.townshipDistribution ?? [];
  if (list.length === 0) return { series: [] };
  return buildHorizontalBar(
    list.map((t) => t.township).reverse(),
    list.map((t) => t.count).reverse(),
    tokens.colorError,
    '事故数',
  );
});

const hasPositionData = computed(
  () => (responsibleData.value?.positionDistribution ?? []).some((p) => p.responsibleCount > 0),
);
const hasDeptData = computed(
  () => (responsibleData.value?.departmentDistribution ?? []).some((d) => d.responsibleCount > 0),
);
const hasTownshipData = computed(
  () => (classificationData.value?.townshipDistribution ?? []).length > 0,
);

function renderAllCharts() {
  renderTrendChart(trendChartOption.value);
  renderTypeTrendChart(typeTrendChartOption.value);
  renderTypeChart(typeChartOption.value);
  renderLevelChart(levelChartOption.value);
  renderPositionChart(positionChartOption.value);
  renderDeptChart(deptChartOption.value);
  renderTownshipChart(townshipChartOption.value);
}

watch(
  () => [
    trendData.value,
    classificationData.value,
    responsibleData.value,
    applied.period,
    applied.category,
  ],
  () => nextTick(renderAllCharts),
  { deep: true },
);

/* ───────────────────────── B4 明细数据表格区 ───────────────────────── */

const detailTab = ref<'top' | 'linked'>('top');

const linkedPagination = reactive({
  page: 1,
  pageSize: 20,
  itemCount: 0,
  showSizePicker: true,
  pageSizes: [10, 20, 50],
});

function formatDate(v?: string) {
  if (!v) return '-';
  return String(v).slice(0, 10);
}

/** 姓名 → employeeId 映射（用于 TOP 排行跳转风险画像） */
const employeeIdMap = computed(() => {
  const map = new Map<string, number>();
  (responsibleData.value?.linkedEmployees?.list ?? []).forEach((emp) => {
    map.set(emp.name, emp.employeeId);
  });
  return map;
});

const topResponsible = computed(() =>
  responsibleData.value?.topResponsible ?? [],
);
const linkedEmployees = computed(
  () => responsibleData.value?.linkedEmployees?.list ?? [],
);

/** 关键词过滤（前端，作用于当前已加载数据） */
const filteredTopRows = computed(() => {
  const kw = applied.keyword.trim();
  if (!kw) return topResponsible.value;
  return topResponsible.value.filter((r) => r.personName.includes(kw));
});

const filteredLinkedRows = computed(() => {
  const kw = applied.keyword.trim();
  if (!kw) return linkedEmployees.value;
  return linkedEmployees.value.filter(
    (r) =>
      r.name.includes(kw) ||
      (r.positionName ?? '').includes(kw) ||
      (r.orgName ?? '').includes(kw),
  );
});

function goRiskProfile(employeeId: number) {
  router.push(`/hse-advanced/risk-profile/${employeeId}`);
}

/** 本地排序（TOP/关联两张表均为前端排序；HseDataGrid 仅上报 sort-change，数据由本地重排） */
type AccidentSortState = { field?: string; order?: 'asc' | 'desc' };
const topSort = ref<AccidentSortState>({});
const linkedSort = ref<AccidentSortState>({});
function applySort(rows: any[], state: AccidentSortState, fields: string[]): any[] {
  const field = state.field;
  const order = state.order;
  if (!order || !field || !fields.includes(field)) return rows;
  const dir = order === 'asc' ? 1 : -1;
  return rows.slice().sort((a, b) => (Number(a?.[field]) - Number(b?.[field])) * dir);
}
const sortedTopRows = computed(() =>
  applySort(filteredTopRows.value, topSort.value, ['accidentCount', 'responsibleCount']),
);
const sortedLinkedRows = computed(() =>
  applySort(filteredLinkedRows.value, linkedSort.value, ['accidentCount', 'responsibleCount']),
);
function onTopSortChange(p: { sortBy?: string; sortOrder?: 'asc' | 'desc' }) {
  topSort.value = { field: p.sortBy, order: p.sortOrder };
}
function onLinkedSortChange(p: { sortBy?: string; sortOrder?: 'asc' | 'desc' }) {
  linkedSort.value = { field: p.sortBy, order: p.sortOrder };
}

const topColumns: VxeTableGridColumns = [
  {
    title: '排名',
    field: 'rank',
    width: 72,
    align: 'center',
    slots: { default: 'rankCell' },
  },
  { title: '责任人员', field: 'personName', minWidth: 110 },
  {
    title: '事故数',
    field: 'accidentCount',
    width: 96,
    sortable: true,
  },
  {
    title: '责任事故',
    field: 'responsibleCount',
    width: 104,
    sortable: true,
  },
  { title: '重大事故', field: 'majorCount', width: 104 },
  { title: '伤亡', field: 'casualties', width: 88 },
  { title: '受伤', field: 'injuries', width: 88 },
  {
    title: '最近事故日期',
    field: 'latestAccidentDate',
    width: 130,
    slots: { default: 'latestDateCell' },
  },
  {
    title: '操作',
    field: 'actions',
    width: 110,
    align: 'center',
    slots: { default: 'topActionCell' },
  },
];

const linkedColumns: VxeTableGridColumns = [
  { title: '姓名', field: 'name', minWidth: 100 },
  { title: '工号', field: 'employeeCode', width: 120 },
  {
    title: '岗位',
    field: 'positionName',
    minWidth: 130,
    slots: { default: 'positionCell' },
  },
  {
    title: '所属部门',
    field: 'orgName',
    minWidth: 160,
    slots: { default: 'orgCell' },
  },
  {
    title: '事故数',
    field: 'accidentCount',
    width: 96,
    sortable: true,
  },
  {
    title: '责任事故',
    field: 'responsibleCount',
    width: 104,
    sortable: true,
  },
  {
    title: '最近事故日期',
    field: 'latestAccidentDate',
    width: 130,
    slots: { default: 'latestDateCell' },
  },
  {
    title: '操作',
    field: 'actions',
    width: 110,
    align: 'center',
    slots: { default: 'linkedActionCell' },
  },
];

function onLinkedPageChange(payload: { currentPage: number; pageSize: number }) {
  linkedPagination.page = payload.currentPage;
  linkedPagination.pageSize = payload.pageSize;
  void loadResponsible(payload.currentPage, payload.pageSize);
}

/** 导出当前 Tab 表格为 CSV（纯前端，不依赖后端导出接口） */
function exportCurrentTable() {
  const isTop = detailTab.value === 'top';
  const header = isTop
    ? [
        '排名',
        '责任人员',
        '事故数',
        '责任事故',
        '重大事故',
        '伤亡',
        '受伤',
        '最近事故日期',
      ]
    : [
        '姓名',
        '工号',
        '岗位',
        '所属部门',
        '事故数',
        '责任事故',
        '最近事故日期',
      ];
  const body = isTop
    ? filteredTopRows.value.map((r, i) => [
        i + 1,
        r.personName,
        r.accidentCount,
        r.responsibleCount,
        r.majorCount,
        r.casualties,
        r.injuries,
        formatDate(r.latestAccidentDate),
      ])
    : filteredLinkedRows.value.map((r) => [
        r.name,
        r.employeeCode ?? '-',
        r.positionName || '-',
        r.orgName || '-',
        r.accidentCount,
        r.responsibleCount,
        formatDate(r.latestAccidentDate),
      ]);

  const escape = (v: unknown) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv =
    '﻿' +
    [header, ...body].map((row) => row.map(escape).join(',')).join('\r\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `事故分析-${isTop ? '责任人员TOP' : '事故关联人员'}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  message.success('导出成功');
}

/* ───────────────────────── 生命周期 ───────────────────────── */

onMounted(async () => {
  await Promise.all([
    loadOverview(),
    loadTrend(),
    loadClassification(),
    loadResponsible(1),
  ]);
  await nextTick();
  renderAllCharts();
});
</script>

<template>
  <HsePageLayout
    auto-content-height
    title="事故分析中心"
    description="HSE事故风险分析与责任追踪"
  >
    <template #title>
      <div class="page-title">
        <IconifyIcon icon="lucide:flame" :size="20" />
        <span>事故分析中心</span>
      </div>
    </template>
    <template #description>HSE事故风险分析与责任追踪</template>
    <template #extra>
      <NButton
        size="small"
        secondary
        type="primary"
        :loading="loading.refreshing"
        @click="reloadAll"
      >
        <template #icon>
          <IconifyIcon icon="lucide:refresh-cw" />
        </template>
        刷新数据
      </NButton>
    </template>

    <div class="accident-analysis" :style="{ gap: `${BLOCK_GAP}px` }">
      <!-- ============ B1 查询筛选栏 ============ -->
      <NCard
        class="section-card"
        size="small"
        :bordered="false"
        :content-style="{ padding: '16px' }"
      >
        <template #header>
          <div class="card-title">
            <IconifyIcon icon="lucide:filter" :size="16" />
            <span>查询筛选</span>
          </div>
        </template>
        <template #header-extra>
          <div class="card-actions">
            <NButton size="small" tertiary @click="handleReset">
              <template #icon>
                <IconifyIcon icon="lucide:rotate-ccw" />
              </template>
              重置
            </NButton>
            <NButton size="small" type="primary" @click="handleSearch">
              <template #icon>
                <IconifyIcon icon="lucide:search" />
              </template>
              查询
            </NButton>
          </div>
        </template>

        <NForm label-placement="left" :label-width="72" :model="draft">
          <NGrid
            cols="1 s:2 m:2 l:4"
            responsive="self"
            :x-gap="16"
            :y-gap="12"
          >
            <NGi>
              <NFormItem label="统计周期">
                <NRadioGroup v-model:value="draft.period" size="small">
                  <NRadioButton
                    v-for="opt in periodOptions"
                    :key="opt.value"
                    :value="opt.value"
                  >
                    {{ opt.label }}
                  </NRadioButton>
                </NRadioGroup>
              </NFormItem>
            </NGi>
            <NGi>
              <NFormItem label="年份">
                <NSelect
                  v-model:value="draft.year"
                  size="small"
                  :disabled="draft.period !== 'month'"
                  :options="yearOptions"
                />
              </NFormItem>
            </NGi>
            <NGi>
              <NFormItem label="事故分类">
                <NSelect
                  v-model:value="draft.category"
                  size="small"
                  :options="categoryOptions"
                />
              </NFormItem>
            </NGi>
            <NGi>
              <NFormItem label="关键词">
                <NInput
                  v-model:value="draft.keyword"
                  size="small"
                  clearable
                  placeholder="责任人 / 岗位 / 部门"
                />
              </NFormItem>
            </NGi>
          </NGrid>
        </NForm>
      </NCard>

      <!-- ============ B2 核心指标 ============ -->
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <HseStatCard
          title="事故总数"
          :value="overview?.totalCount || 0"
          icon="lucide:flame"
          color="red"
          :loading="loading.overview"
        />
        <HseStatCard
          title="涉及人数"
          :value="overview?.involvedCount || 0"
          icon="lucide:users"
          color="blue"
          :loading="loading.overview"
        />
        <HseStatCard
          title="责任人数"
          :value="overview?.responsibleCount || 0"
          icon="lucide:shield-alert"
          color="yellow"
          :loading="loading.overview"
        />
        <HseStatCard
          title="重大事故"
          :value="overview?.majorCount || 0"
          icon="lucide:alert-octagon"
          color="red"
          :loading="loading.overview"
        />
      </div>

      <!-- ============ B3 图表分析区（两行等高，撑满剩余空间） ============ -->
      <div class="grid grid-cols-1 gap-4 lg:grid-cols-12 chart-row">
        <!-- B3-1 事故趋势（7/12） -->
        <div class="lg:col-span-7">
          <NCard class="section-card h-full" size="small" :bordered="false">
            <template #header>
              <div class="card-title">
                <IconifyIcon icon="lucide:trending-up" :size="16" />
                <span>事故趋势</span>
              </div>
            </template>
            <template #header-extra>
              <div class="card-actions">
                <NRadioGroup
                  v-model:value="applied.period"
                  size="small"
                  @update:value="onTrendPeriodChange"
                >
                  <NRadioButton
                    v-for="opt in periodOptions"
                    :key="opt.value"
                    :value="opt.value"
                  >
                    {{ opt.label }}
                  </NRadioButton>
                </NRadioGroup>
                <NSelect
                  v-if="applied.period === 'month'"
                  v-model:value="applied.year"
                  size="small"
                  class="year-select"
                  :options="yearOptions"
                  @update:value="onTrendPeriodChange"
                />
              </div>
            </template>

            <div class="fill-height">
              <div class="trend-summary">
                <div class="stat-chip">
                  <NStatistic label="伤亡人数">
                    <span class="value-danger">
                      {{ overview?.totalCasualties || 0 }}
                    </span>
                  </NStatistic>
                </div>
                <div class="stat-chip">
                  <NStatistic label="受伤人数">
                    <span class="value-warning">
                      {{ overview?.totalInjuries || 0 }}
                    </span>
                  </NStatistic>
                </div>
                <div class="stat-chip">
                  <NStatistic label="经济损失">
                    <span class="value-success">
                      {{ formatLoss(overview?.totalLoss) }}
                    </span>
                  </NStatistic>
                </div>
              </div>

              <div class="grid min-h-0 flex-1 grid-cols-1 gap-4 xl:grid-cols-2">
                <div class="flex min-h-0 min-w-0 flex-col">
                  <div class="section-title">事故总数 / 责任事故</div>
                  <div class="min-h-0 flex-1">
                    <EchartsUI
                      v-if="hasTrendData"
                      ref="trendChartRef"
                      height="100%"
                      width="100%"
                    />
                    <div v-else class="chart-empty-cell">
                      <NEmpty description="暂无趋势数据" />
                    </div>
                  </div>
                </div>
                <div class="flex min-h-0 min-w-0 flex-col">
                  <div class="section-title">分类趋势对比</div>
                  <div class="min-h-0 flex-1">
                    <EchartsUI
                      v-if="hasTypeTrendData"
                      ref="typeTrendChartRef"
                      height="100%"
                      width="100%"
                    />
                    <div v-else class="chart-empty-cell">
                      <NEmpty description="暂无分类趋势数据" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </NCard>
        </div>

        <!-- B3-2 事故等级分布（5/12） -->
        <div class="lg:col-span-5">
          <NCard class="section-card h-full" size="small" :bordered="false">
            <template #header>
              <div class="card-title">
                <IconifyIcon icon="lucide:pie-chart" :size="16" />
                <span>事故等级分布</span>
              </div>
            </template>
            <div class="fill-height">
              <div class="min-h-0 flex-1">
                <EchartsUI
                  v-if="hasLevelData"
                  ref="levelChartRef"
                  height="100%"
                  width="100%"
                />
                <div v-else class="chart-empty-cell">
                  <NEmpty description="暂无等级数据" />
                </div>
              </div>
            </div>
          </NCard>
        </div>
      </div>

      <div class="grid grid-cols-1 gap-4 lg:grid-cols-12 chart-row">
        <!-- B3-3 事故分类分析（7/12） -->
        <div class="lg:col-span-7">
          <NCard class="section-card h-full" size="small" :bordered="false">
            <template #header>
              <div class="card-title">
                <IconifyIcon icon="lucide:layers" :size="16" />
                <span>事故分类分析</span>
              </div>
            </template>
            <div class="fill-height">
              <div
                v-if="filteredCategories.length"
                class="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2"
              >
                <div
                  v-for="c in filteredCategories"
                  :key="c.category"
                  class="cat-block"
                >
                  <div class="cat-block__head">
                    <IconifyIcon
                      :icon="
                        c.category === '交通事故'
                          ? 'lucide:car-front'
                          : 'lucide:hard-hat'
                      "
                      :size="15"
                      :style="{
                        color:
                          c.category === '交通事故'
                            ? tokens.colorPrimary
                            : tokens.colorError,
                      }"
                    />
                    <span class="cat-block__name">{{ c.category }}</span>
                    <span class="cat-block__count">
                      <b :style="{ color: tokens.colorError }">
                        {{ c.count }}
                      </b>
                      起
                    </span>
                  </div>
                  <div class="cat-block__stats">
                    <span>责任 <b>{{ c.responsibleCount }}</b></span>
                    <span>
                      伤亡
                      <b :style="{ color: tokens.colorError }">
                        {{ c.casualties }}
                      </b>
                    </span>
                    <span>
                      受伤
                      <b :style="{ color: tokens.colorWarning }">
                        {{ c.injuries }}
                      </b>
                    </span>
                    <span>
                      重大
                      <b :style="{ color: tokens.colorError }">
                        {{ c.majorCount }}
                      </b>
                    </span>
                  </div>
                </div>
              </div>
              <NEmpty v-else description="暂无分类数据" />

              <div class="flex min-h-0 min-w-0 flex-1 flex-col">
                <div class="section-title">事故类型明细</div>
                <div class="min-h-0 flex-1">
                  <EchartsUI
                    v-if="hasTypeDetailData"
                    ref="typeChartRef"
                    height="100%"
                    width="100%"
                  />
                  <div v-else class="chart-empty-cell">
                    <NEmpty description="暂无类型明细数据" />
                  </div>
                </div>
              </div>
            </div>
          </NCard>
        </div>

        <!-- B3-4 责任人员分析（5/12） -->
        <div class="lg:col-span-5">
          <NCard class="section-card h-full" size="small" :bordered="false">
            <template #header>
              <div class="card-title">
                <IconifyIcon icon="lucide:users" :size="16" />
                <span>责任人员分析</span>
              </div>
            </template>
            <div class="fill-height">
              <div class="flex min-h-0 min-w-0 flex-1 flex-col">
                <div class="section-title">岗位分布</div>
                <div class="min-h-0 flex-1">
                  <EchartsUI
                    v-if="hasPositionData"
                    ref="positionChartRef"
                    height="100%"
                    width="100%"
                  />
                  <div v-else class="chart-empty-cell">
                    <NEmpty description="暂无责任事故数据" />
                  </div>
                </div>
              </div>
              <div class="flex min-h-0 min-w-0 flex-1 flex-col">
                <div class="section-title">部门分布</div>
                <div class="min-h-0 flex-1">
                  <EchartsUI
                    v-if="hasDeptData"
                    ref="deptChartRef"
                    height="100%"
                    width="100%"
                  />
                  <div v-else class="chart-empty-cell">
                    <NEmpty description="暂无责任事故数据" />
                  </div>
                </div>
              </div>
            </div>
          </NCard>
        </div>
      </div>

      <!-- B3-5 乡镇/单位分布（全宽） -->
      <NCard class="section-card" size="small" :bordered="false">
        <template #header>
          <div class="card-title">
            <IconifyIcon icon="lucide:map-pin" :size="16" />
            <span>乡镇 / 单位分布</span>
          </div>
        </template>
        <template #header-extra>
          <span class="card-extra-text">按事故数降序 TOP20</span>
        </template>
        <div class="chart-box">
          <EchartsUI
            v-if="hasTownshipData"
            ref="townshipChartRef"
            style="width: 100%; height: 280px"
          />
          <NEmpty v-else class="chart-empty" description="暂无属地数据" />
        </div>
      </NCard>

      <!-- ============ B4 明细数据表格区 ============ -->
      <NCard
        class="section-card"
        size="small"
        :bordered="false"
        :content-style="{ padding: '16px' }"
      >
        <template #header>
          <div class="card-title">
            <IconifyIcon icon="lucide:table-2" :size="16" />
            <span>明细数据</span>
          </div>
        </template>
        <template #header-extra>
          <div class="card-actions">
            <span class="card-extra-text">数据口径：未删除事故记录</span>
            <span class="card-extra-text">
              共
              {{
                detailTab === 'top'
                  ? filteredTopRows.length
                  : linkedPagination.itemCount
              }}
              条
            </span>
            <NButton size="small" tertiary @click="exportCurrentTable">
              <template #icon>
                <IconifyIcon icon="lucide:download" />
              </template>
              导出CSV
            </NButton>
          </div>
        </template>

        <NTabs v-model:value="detailTab" type="line">
          <NTabPane name="top" tab="责任人员TOP排行">
            <HseDataGrid
              :columns="topColumns"
              :data="sortedTopRows"
              :loading="loading.responsible"
              row-key="personName"
              :pager="false"
              :height="420"
              @sort-change="onTopSortChange"
            >
              <template #rankCell="{ rowIndex }">{{ rowIndex + 1 }}</template>
              <template #latestDateCell="{ row }">
                {{ formatDate(row.latestAccidentDate) }}
              </template>
              <template #topActionCell="{ row }">
                <NButton
                  v-if="employeeIdMap.get(row.personName)"
                  text
                  type="primary"
                  size="small"
                  @click="goRiskProfile(employeeIdMap.get(row.personName) as number)"
                >
                  风险画像
                </NButton>
                <span v-else>-</span>
              </template>
            </HseDataGrid>
          </NTabPane>
          <NTabPane name="linked" tab="事故关联人员">
            <HseDataGrid
              :columns="linkedColumns"
              :data="sortedLinkedRows"
              :loading="loading.responsible"
              row-key="employeeId"
              :pager="{ pageSizes: [10, 20, 50] }"
              :total="linkedPagination.itemCount"
              :current-page="linkedPagination.page"
              :page-size="linkedPagination.pageSize"
              :height="420"
              @page-change="onLinkedPageChange"
              @sort-change="onLinkedSortChange"
            >
              <template #positionCell="{ row }">{{ row.positionName || '-' }}</template>
              <template #orgCell="{ row }">{{ row.orgName || '-' }}</template>
              <template #latestDateCell="{ row }">
                {{ formatDate(row.latestAccidentDate) }}
              </template>
              <template #linkedActionCell="{ row }">
                <NButton text type="primary" size="small" @click="goRiskProfile(row.employeeId)">
                  风险画像
                </NButton>
              </template>
            </HseDataGrid>
          </NTabPane>
        </NTabs>
      </NCard>
    </div>
  </HsePageLayout>
</template>

<style scoped>
/* ── 统一卡片容器 ───────────────────────────────────────────── */
.section-card {
  border-radius: 8px;
}

/* ── 统一卡片标题：16px 图标 + 15px/600 文字 ─────────────────── */
.page-title,
.card-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
  line-height: 20px;
}

/* ── 卡片右上操作区 / 辅助说明 ───────────────────────────────── */
.card-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.card-extra-text {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.year-select {
  width: 110px;
}

/* ── 区块容器：统一 16px 垂直间距 ─────────────────────────────
 * height:100% 使容器高度确定（对应 Page auto-content-height 的固定内容区），
 * 两行图表区即可均分剩余空间；内容超高时溢出传导给外层滚动容器。
 */
.accident-analysis {
  display: flex;
  flex-direction: column;
  height: 100%;
}

/* 图表行：等高两行，均分剩余空间；min-height 兜底防止内容超高时塌缩 */
.chart-row {
  flex: 1 1 0%;
  min-height: 400px;
}

.fill-height {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

/* ── 趋势卡顶部统计条 ───────────────────────────────────────── */
.trend-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.stat-chip {
  padding: 10px 12px;
  background: hsl(var(--muted));
  border-radius: 8px;
}

.stat-chip :deep(.n-statistic-label) {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.stat-chip :deep(.n-statistic-value) {
  font-size: 18px;
  font-weight: 600;
  color: hsl(var(--foreground));
}

.value-danger {
  color: #f5222d;
}

.value-warning {
  color: #f0a020;
}

.value-success {
  color: #52c41a;
}

/* ── 图表标题 ───────────────────────────────────────────────── */
.section-title {
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 600;
  color: hsl(var(--muted-foreground));
}

/* ── 分类汇总块 ─────────────────────────────────────────────── */
.cat-block {
  padding: 12px 14px;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
}

.cat-block__head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.cat-block__name {
  font-size: 14px;
  font-weight: 600;
}

.cat-block__count {
  margin-left: auto;
  font-size: 13px;
  color: hsl(var(--muted-foreground));
}

.cat-block__count b {
  font-size: 22px;
  font-weight: 700;
  line-height: 1;
}

.cat-block__stats {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 20px;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.cat-block__stats b {
  font-size: 14px;
  font-weight: 600;
  color: hsl(var(--foreground));
}

/* ── 图表容器：空态定位 ─────────────────────────────────────── */
.chart-box {
  position: relative;
  width: 100%;
}

.chart-empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0;
}

/* 等高卡片内空态：垂直水平居中撑满 */
.chart-empty-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 120px;
}
</style>
