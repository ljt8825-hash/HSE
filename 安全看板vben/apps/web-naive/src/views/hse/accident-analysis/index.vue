<script lang="ts" setup>
/**
 * 事故分析中心（web-naive）
 *
 * ── 统一页面布局规范（本中心所有区块一致）─────────────────────────
 *   B1 查询筛选栏   → 页面级筛选条件 + 查询/重置操作（卡片 header-extra）
 *   B2 统计概览区   → 核心指标 NStatistic 网格
 *   B3 图表分析区   → 趋势（全宽）/ 分类 + 等级 / 岗位 + 部门 / 属地（全宽）
 *   B4 明细数据表格 → NTabs 切换 + NDataTable（卡片 header-extra 放表格级操作）
 *
 * 区块顺序固定：筛选 → 概览 → 图表 → 明细；区块间距统一 16px；
 * 卡片内边距统一 16px；卡片标题统一「16px 图标 + 15px/600 文字」。
 *
 * 组件约束：仅使用 vben admin 内置组件（Page / EchartsUI / IconifyIcon）
 * 与 naive-ui 原生组件，不引入任何自定义或二次封装组件。
 */
import { computed, h, nextTick, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
  NButton,
  NCard,
  NDataTable,
  NEmpty,
  NForm,
  NFormItem,
  NGi,
  NGrid,
  NInput,
  NRadioButton,
  NRadioGroup,
  NSelect,
  NSpin,
  NStatistic,
  NTabPane,
  NTabs,
  NTag,
  type DataTableColumns,
} from 'naive-ui';

import { Page } from '@vben/common-ui';
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
import { message } from '#/adapter/naive';

defineOptions({ name: 'HseAccidentAnalysis' });

const router = useRouter();

/* ────────────────────────────── 视觉令牌 ──────────────────────────────
 * Canvas 无法解析 CSS 变量，图表颜色必须使用 hex 字符串。
 * 与页面其它 HSE 中心保持同一套语义色。
 */
const tokens = {
  colorTextBase: '#1f1f1f',
  colorTextSecondary: '#8c8c8c',
  colorPrimary: '#1890ff',
  colorError: '#f5222d',
  colorWarning: '#faad14',
  colorSuccess: '#52c41a',
  colorBorder: '#f0f0f0',
  colorBgElevated: '#ffffff',
};

/** 区块垂直间距（与 NGrid y-gap 保持一致） */
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

/* ───────────────────────── B2 统计概览区 ───────────────────────── */

function formatLoss(loss?: number) {
  if (!loss) return '0元';
  if (loss >= 10_000) return `${(loss / 10_000).toFixed(1)}万元`;
  return `${loss.toFixed(0)}元`;
}

/** 概览指标定义：label / value / 语义色 / 图标 */
const overviewStats = computed(() => {
  const d = overviewData.value;
  return [
    {
      key: 'totalCount',
      label: '事故总数',
      value: d?.totalCount ?? 0,
      color: tokens.colorError,
      icon: 'lucide:flame',
    },
    {
      key: 'involvedCount',
      label: '涉及人数',
      value: d?.involvedCount ?? 0,
      color: tokens.colorPrimary,
      icon: 'lucide:users',
    },
    {
      key: 'responsibleCount',
      label: '责任人数',
      value: d?.responsibleCount ?? 0,
      color: tokens.colorWarning,
      icon: 'lucide:shield-alert',
    },
    {
      key: 'majorCount',
      label: '重大事故',
      value: d?.majorCount ?? 0,
      color: tokens.colorError,
      icon: 'lucide:alert-octagon',
    },
    {
      key: 'totalCasualties',
      label: '伤亡人数',
      value: d?.totalCasualties ?? 0,
      color: tokens.colorError,
      icon: 'lucide:heart-pulse',
    },
    {
      key: 'totalInjuries',
      label: '受伤人数',
      value: d?.totalInjuries ?? 0,
      color: tokens.colorWarning,
      icon: 'lucide:bandage',
    },
    {
      key: 'totalLoss',
      label: '经济损失',
      value: formatLoss(d?.totalLoss),
      color: tokens.colorSuccess,
      icon: 'lucide:coins',
    },
  ];
});

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
    grid: { left: '3%', right: '4%', bottom: '3%', top: '12%', containLabel: true },
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
    grid: { left: '3%', right: '4%', bottom: '3%', top: '12%', containLabel: true },
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
    tooltip: { trigger: 'item', formatter: '{b}: {c}起 ({d}%)' },
    series: [
      {
        type: 'pie',
        radius: ['40%', '70%'],
        center: ['50%', '50%'],
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

const topColumns: DataTableColumns<AccidentAnalysisApi.TopResponsiblePerson> = [
  {
    title: '排名',
    key: 'rank',
    width: 72,
    align: 'center',
    render: (_row, index) => `${index + 1}`,
  },
  { title: '责任人员', key: 'personName', minWidth: 110 },
  {
    title: '事故数',
    key: 'accidentCount',
    width: 96,
    sorter: (a, b) => a.accidentCount - b.accidentCount,
  },
  {
    title: '责任事故',
    key: 'responsibleCount',
    width: 104,
    sorter: (a, b) => a.responsibleCount - b.responsibleCount,
  },
  { title: '重大事故', key: 'majorCount', width: 104 },
  { title: '伤亡', key: 'casualties', width: 88 },
  { title: '受伤', key: 'injuries', width: 88 },
  {
    title: '最近事故日期',
    key: 'latestAccidentDate',
    width: 130,
    render: (row) => formatDate(row.latestAccidentDate),
  },
  {
    title: '操作',
    key: 'actions',
    width: 110,
    align: 'center',
    render: (row) => {
      const employeeId = employeeIdMap.value.get(row.personName);
      if (!employeeId) return '-';
      return h(
        NButton,
        {
          text: true,
          type: 'primary',
          size: 'small',
          onClick: () => goRiskProfile(employeeId),
        },
        { default: () => '风险画像' },
      );
    },
  },
];

const linkedColumns: DataTableColumns<AccidentAnalysisApi.LinkedEmployee> = [
  { title: '姓名', key: 'name', minWidth: 100 },
  { title: '工号', key: 'employeeCode', width: 120 },
  {
    title: '岗位',
    key: 'positionName',
    minWidth: 130,
    render: (row) => row.positionName || '-',
  },
  {
    title: '所属部门',
    key: 'orgName',
    minWidth: 160,
    render: (row) => row.orgName || '-',
  },
  {
    title: '事故数',
    key: 'accidentCount',
    width: 96,
    sorter: (a, b) => a.accidentCount - b.accidentCount,
  },
  {
    title: '责任事故',
    key: 'responsibleCount',
    width: 104,
    sorter: (a, b) => a.responsibleCount - b.responsibleCount,
  },
  {
    title: '最近事故日期',
    key: 'latestAccidentDate',
    width: 130,
    render: (row) => formatDate(row.latestAccidentDate),
  },
  {
    title: '操作',
    key: 'actions',
    width: 110,
    align: 'center',
    render: (row) =>
      h(
        NButton,
        {
          text: true,
          type: 'primary',
          size: 'small',
          onClick: () => goRiskProfile(row.employeeId),
        },
        { default: () => '风险画像' },
      ),
  },
];

function handleLinkedPageChange(page: number) {
  void loadResponsible(page, linkedPagination.pageSize);
}

function handleLinkedPageSizeChange(pageSize: number) {
  linkedPagination.pageSize = pageSize;
  void loadResponsible(1, pageSize);
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
  <Page
    :title="$t('page.hse.accidentAnalysis')"
    description="HSE事故风险分析与责任追踪"
  >
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

      <!-- ============ B2 统计概览区 ============ -->
      <NCard
        class="section-card"
        size="small"
        :bordered="false"
        :content-style="{ padding: '16px' }"
      >
        <template #header>
          <div class="card-title">
            <IconifyIcon icon="lucide:gauge" :size="16" />
            <span>核心指标概览</span>
            <NTag size="small" :bordered="false" type="info">
              {{ applied.period === 'year' ? '全量周期' : `${applied.year}年` }}
            </NTag>
          </div>
        </template>
        <template #header-extra>
          <span class="card-extra-text">数据口径：未删除事故记录</span>
        </template>

        <NSpin :show="loading.overview">
          <NGrid
            cols="2 s:3 m:4 l:4"
            responsive="self"
            :x-gap="16"
            :y-gap="16"
          >
            <NGi v-for="item in overviewStats" :key="item.key">
              <div class="stat-cell">
                <div
                  class="stat-cell__icon"
                  :style="{ color: item.color }"
                >
                  <IconifyIcon :icon="item.icon" :size="18" />
                </div>
                <NStatistic :label="item.label">
                  <template #default>
                    <span class="stat-cell__value" :style="{ color: item.color }">
                      {{ item.value }}
                    </span>
                  </template>
                </NStatistic>
              </div>
            </NGi>
          </NGrid>
        </NSpin>
      </NCard>

      <!-- ============ B3 图表分析区 ============ -->
      <div class="chart-region" :style="{ gap: `${BLOCK_GAP}px` }">
        <!-- B3-1 事故趋势（全宽） -->
        <NCard
          class="section-card"
          size="small"
          :bordered="false"
          :content-style="{ padding: '16px' }"
        >
          <template #header>
            <div class="card-title">
              <IconifyIcon icon="lucide:trending-up" :size="16" />
              <span>事故趋势</span>
            </div>
          </template>
          <template #header-extra>
            <span class="card-extra-text">
              {{ applied.period === 'year' ? '逐年' : `${applied.year}年逐月` }}
            </span>
          </template>
          <NGrid cols="1 l:2" responsive="self" :x-gap="16" :y-gap="16">
            <NGi>
              <div class="chart-subtitle">事故总数 / 责任事故</div>
              <div class="chart-box">
                <EchartsUI
                  ref="trendChartRef"
                  style="width: 100%; height: 280px"
                />
                <NEmpty v-if="!hasTrendData" class="chart-empty" description="暂无趋势数据" />
              </div>
            </NGi>
            <NGi>
              <div class="chart-subtitle">分类趋势对比</div>
              <div class="chart-box">
                <EchartsUI
                  ref="typeTrendChartRef"
                  style="width: 100%; height: 280px"
                />
                <NEmpty
                  v-if="!hasTypeTrendData"
                  class="chart-empty"
                  description="暂无分类趋势数据"
                />
              </div>
            </NGi>
          </NGrid>
        </NCard>

        <!-- B3-2 事故分类 + 事故等级 -->
        <NGrid cols="1 m:2 l:2" responsive="self" :x-gap="16" :y-gap="16">
          <NGi>
            <NCard
              class="section-card"
              size="small"
              :bordered="false"
              :content-style="{ padding: '16px' }"
            >
              <template #header>
                <div class="card-title">
                  <IconifyIcon icon="lucide:layers" :size="16" />
                  <span>事故分类分析</span>
                </div>
              </template>
              <NGrid
                v-if="filteredCategories.length"
                cols="1 s:2"
                responsive="self"
                :x-gap="12"
                :y-gap="12"
              >
                <NGi v-for="c in filteredCategories" :key="c.category">
                  <NCard size="small" class="sub-card">
                    <template #header>
                      <div class="sub-card__title">
                        <IconifyIcon
                          :icon="
                            c.category === '交通事故'
                              ? 'lucide:car-front'
                              : 'lucide:hard-hat'
                          "
                          :size="14"
                        />
                        <span>{{ c.category }}</span>
                      </div>
                    </template>
                    <NGrid cols="3" :x-gap="8" :y-gap="8">
                      <NGi><NStatistic label="事故数" :value="c.count" /></NGi>
                      <NGi>
                        <NStatistic label="责任数" :value="c.responsibleCount" />
                      </NGi>
                      <NGi>
                        <NStatistic
                          label="伤亡"
                          :value="c.casualties"
                          :value-style="{ color: tokens.colorError }"
                        />
                      </NGi>
                      <NGi>
                        <NStatistic
                          label="受伤"
                          :value="c.injuries"
                          :value-style="{ color: tokens.colorWarning }"
                        />
                      </NGi>
                      <NGi>
                        <NStatistic
                          label="重大"
                          :value="c.majorCount"
                          :value-style="{ color: tokens.colorError }"
                        />
                      </NGi>
                    </NGrid>
                  </NCard>
                </NGi>
              </NGrid>
              <NEmpty v-else description="暂无分类数据" />

              <div class="chart-subtitle mt-3">事故类型明细</div>
              <div class="chart-box">
                <EchartsUI
                  ref="typeChartRef"
                  style="width: 100%; height: 240px"
                />
                <NEmpty
                  v-if="!filteredTypeDetails.length"
                  class="chart-empty"
                  description="暂无类型明细数据"
                />
              </div>
            </NCard>
          </NGi>

          <NGi>
            <NCard
              class="section-card"
              size="small"
              :bordered="false"
              :content-style="{ padding: '16px' }"
            >
              <template #header>
                <div class="card-title">
                  <IconifyIcon icon="lucide:pie-chart" :size="16" />
                  <span>事故等级分布</span>
                </div>
              </template>
              <div class="chart-box">
                <EchartsUI
                  ref="levelChartRef"
                  style="width: 100%; height: 260px"
                />
                <NEmpty
                  v-if="!(classificationData?.levelDetails?.length)"
                  class="chart-empty"
                  description="暂无等级数据"
                />
              </div>
            </NCard>
          </NGi>
        </NGrid>

        <!-- B3-3 责任岗位 + 责任部门 -->
        <NGrid cols="1 m:2 l:2" responsive="self" :x-gap="16" :y-gap="16">
          <NGi>
            <NCard
              class="section-card"
              size="small"
              :bordered="false"
              :content-style="{ padding: '16px' }"
            >
              <template #header>
                <div class="card-title">
                  <IconifyIcon icon="lucide:briefcase" :size="16" />
                  <span>责任人员岗位分布</span>
                </div>
              </template>
              <div class="chart-box">
                <EchartsUI
                  ref="positionChartRef"
                  style="width: 100%; height: 240px"
                />
                <NEmpty
                  v-if="!hasPositionData"
                  class="chart-empty"
                  description="暂无责任事故数据"
                />
              </div>
            </NCard>
          </NGi>
          <NGi>
            <NCard
              class="section-card"
              size="small"
              :bordered="false"
              :content-style="{ padding: '16px' }"
            >
              <template #header>
                <div class="card-title">
                  <IconifyIcon icon="lucide:building-2" :size="16" />
                  <span>责任人员部门分布</span>
                </div>
              </template>
              <div class="chart-box">
                <EchartsUI
                  ref="deptChartRef"
                  style="width: 100%; height: 240px"
                />
                <NEmpty
                  v-if="!hasDeptData"
                  class="chart-empty"
                  description="暂无责任事故数据"
                />
              </div>
            </NCard>
          </NGi>
        </NGrid>

        <!-- B3-4 乡镇/单位分布（全宽） -->
        <NCard
          class="section-card"
          size="small"
          :bordered="false"
          :content-style="{ padding: '16px' }"
        >
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
              ref="townshipChartRef"
              style="width: 100%; height: 300px"
            />
            <NEmpty
              v-if="!hasTownshipData"
              class="chart-empty"
              description="暂无属地数据"
            />
          </div>
        </NCard>
      </div>

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
            <NDataTable
              size="small"
              :columns="topColumns"
              :data="filteredTopRows"
              :loading="loading.responsible"
              :row-key="(row: AccidentAnalysisApi.TopResponsiblePerson) => row.personName"
              :max-height="420"
              striped
            />
          </NTabPane>
          <NTabPane name="linked" tab="事故关联人员">
            <NDataTable
              remote
              size="small"
              :columns="linkedColumns"
              :data="filteredLinkedRows"
              :loading="loading.responsible"
              :row-key="(row: AccidentAnalysisApi.LinkedEmployee) => row.employeeId"
              :pagination="linkedPagination"
              :max-height="420"
              striped
              @update:page="handleLinkedPageChange"
              @update:page-size="handleLinkedPageSizeChange"
            />
          </NTabPane>
        </NTabs>
      </NCard>
    </div>
  </Page>
</template>

<style scoped>
/* ── 统一卡片容器 ───────────────────────────────────────────── */
.section-card {
  border-radius: 8px;
}

/* ── 统一卡片标题：16px 图标 + 15px/600 文字 ─────────────────── */
.card-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
  line-height: 20px;
}

.sub-card__title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
}

.sub-card {
  border-radius: 6px;
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

/* ── 区块容器：统一 16px 垂直间距 ───────────────────────────── */
.accident-analysis {
  display: flex;
  flex-direction: column;
}

.chart-region {
  display: flex;
  flex-direction: column;
}

/* ── 概览指标单元 ───────────────────────────────────────────── */
.stat-cell {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 100%;
  padding: 12px 14px;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  box-sizing: border-box;
}

.stat-cell__icon {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: color-mix(in srgb, currentColor 14%, transparent);
}

.stat-cell__value {
  font-size: 22px;
  font-weight: 700;
  line-height: 1.2;
}

/* ── 图表容器：统一高度与空态定位 ───────────────────────────── */
.chart-subtitle {
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 600;
  color: hsl(var(--foreground));
}

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

.mt-3 {
  margin-top: 12px;
}
</style>
