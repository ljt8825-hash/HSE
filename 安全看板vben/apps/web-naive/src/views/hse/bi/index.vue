<template>
  <HsePageLayout title="BI 数据看板" :auto-content-height="true">
    <template #extra>
      <div class="bi-toolbar">
        <NSelect
          v-model:value="yearValue"
          class="bi-year-select"
          size="small"
          :options="yearOptions"
          @update:value="handleYearChange"
        />
        <NSelect
          v-model:value="monthValue"
          class="bi-month-select"
          size="small"
          :options="monthOptions"
          :disabled="yearValue === 'all'"
        />
        <NButton size="small" secondary type="primary" :loading="loading" @click="reloadAll">
          <template #icon>
            <IconifyIcon icon="lucide:refresh-cw" />
          </template>
          刷新数据
        </NButton>
      </div>
    </template>

    <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 mb-4">
      <HseStatCard
        v-for="stat in statItems"
        :key="stat.key"
        :title="stat.label"
        :value="stat.value"
        :icon="stat.icon"
        :color="stat.color"
        :suffix="stat.suffix"
        :loading="loading"
      />
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
      <NCard
        :title="`安全指标趋势${chartPeriod}`"
        :bordered="false"
        class="lg:col-span-2 chart-card"
      >
        <template #header-extra>
          <NRadioGroup v-model:value="trendDim" size="small">
            <NRadioButton
              v-for="(metric, key) in trendMetrics"
              :key="key"
              :value="key"
            >
              {{ metric.label }}
            </NRadioButton>
          </NRadioGroup>
        </template>
        <div class="chart-box" style="height: 320px">
          <EchartsUI ref="trendChartRef" style="width: 100%; height: 100%" />
          <NEmpty v-if="!hasTrendData" class="chart-empty" description="暂无趋势数据" />
        </div>
      </NCard>

      <NCard :title="`隐患乡镇分布${chartPeriod}`" :bordered="false" class="chart-card">
        <div class="chart-box" style="height: 320px">
          <EchartsUI ref="hazardChartRef" style="width: 100%; height: 100%" />
          <NEmpty v-if="!hasHazardData" class="chart-empty" description="暂无隐患分布数据" />
        </div>
      </NCard>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <NCard :title="`乡镇三违排行${chartPeriod}`" :bordered="false" class="chart-card">
        <template #header-extra>
          <NRadioGroup v-model:value="rankingMode" size="small">
            <NRadioButton value="companyChecks">公司巡查</NRadioButton>
            <NRadioButton value="inspections">乡镇巡查</NRadioButton>
          </NRadioGroup>
        </template>
        <div class="chart-box" style="height: 320px">
          <EchartsUI ref="rankingChartRef" style="width: 100%; height: 100%" />
          <NEmpty v-if="!hasRankingData" class="chart-empty" description="暂无排行数据" />
        </div>
      </NCard>

      <NCard :title="`事故等级分布${chartPeriod}`" :bordered="false" class="chart-card">
        <div class="chart-box" style="height: 320px">
          <EchartsUI ref="accidentChartRef" style="width: 100%; height: 100%" />
          <NEmpty v-if="!hasAccidentData" class="chart-empty" description="暂无事故分布数据" />
        </div>
      </NCard>

      <NCard :title="`演练乡镇分布${chartPeriod}`" :bordered="false" class="chart-card">
        <div class="chart-box" style="height: 320px">
          <EchartsUI ref="emergencyChartRef" style="width: 100%; height: 100%" />
          <NEmpty v-if="!hasEmergencyData" class="chart-empty" description="暂无演练分布数据" />
        </div>
      </NCard>
    </div>
  </HsePageLayout>
</template>

<script lang="ts" setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue';

import { NCard, NButton, NEmpty, NRadioButton, NRadioGroup, NSelect } from 'naive-ui';
import { IconifyIcon } from '@vben/icons';
import {
  EchartsUI,
  useEcharts,
  type ECOption,
  type EchartsUIType,
} from '@vben/plugins/echarts';

import {
  getBiMap,
  getBiOverview,
  getBiRanking,
  getBiTrend,
  type BiApi,
} from '#/api/hse/bi';
import HsePageLayout from '#/components/hse/HsePageLayout.vue';
import HseStatCard from '#/components/hse/HseStatCard.vue';
import { message } from '#/adapter/naive';

defineOptions({ name: 'HseBiDashboard' });

/** Canvas 无法解析 CSS 变量，图表颜色必须使用 hex 字符串 */
const COLORS = {
  violations: '#f5222d',
  inspections: '#1890ff',
  hazards: '#fa8c16',
  trainings: '#52c41a',
  accidents: '#722ed1',
  emergencies: '#13c2c2',
};

/* ────────────────────────── 年份 / 月份筛选 ────────────────────────── */
const yearValue = ref<number | 'all'>(new Date().getFullYear());
const monthValue = ref<number | 'all'>('all');

const yearOptions = computed(() => [
  { label: '历年累计', value: 'all' as const },
  ...Array.from({ length: 6 }, (_, i) => {
    const y = new Date().getFullYear() - i;
    return { label: `${y}年`, value: y };
  }),
]);

const monthOptions = computed(() => [
  { label: '全年', value: 'all' as const },
  ...Array.from({ length: 12 }, (_, i) => ({ label: `${i + 1}月`, value: i + 1 })),
]);

function yearParam(): number | undefined {
  return yearValue.value === 'all' ? undefined : yearValue.value;
}

function monthParam(): number | undefined {
  return monthValue.value === 'all' ? undefined : monthValue.value;
}

function handleYearChange(value: number | 'all') {
  if (value === 'all') monthValue.value = 'all';
}

/* ────────────────────────── 数据加载 ────────────────────────── */
const loading = ref(false);
const overviewData = ref<BiApi.OverviewData | null>(null);
const trendData = ref<BiApi.TrendData | null>(null);
const rankingData = ref<BiApi.RankingData | null>(null);
/** 乡镇三违排行口径切换：公司巡查（companyChecks）/ 乡镇巡查（inspections，网格长巡查按乡镇归因） */
const rankingMode = ref<'companyChecks' | 'inspections'>('companyChecks');
const RANKING_META = {
  companyChecks: { seriesName: '公司管理检查次数', color: '#1890ff' },
  inspections: { seriesName: '网格长巡查次数', color: '#13c2c2' },
};
const hazardMap = ref<BiApi.MapData | null>(null);
const accidentMap = ref<BiApi.MapData | null>(null);
const emergencyMap = ref<BiApi.MapData | null>(null);

async function loadAll() {
  loading.value = true;
  try {
    const year = yearParam();
    const month = monthParam();
    const [o, t, r, hz, ac, em] = await Promise.all([
      getBiOverview(year, month),
      getBiTrend(year, month),
      getBiRanking(rankingMode.value, { top: 10, year, month }),
      getBiMap('hazards', year, month),
      getBiMap('accidents', year, month),
      getBiMap('emergencies', year, month),
    ]);
    overviewData.value = o;
    trendData.value = t;
    rankingData.value = r;
    hazardMap.value = hz;
    accidentMap.value = ac;
    emergencyMap.value = em;
  } catch {
    message.error('BI 数据加载失败，请稍后重试');
  } finally {
    loading.value = false;
  }
}

/* ────────────────────────── 指标卡 ────────────────────────── */
/** 图表卡片标题范围后缀（历年累计为空串，保持原标题） */
const chartPeriod = computed(() => {
  const y = overviewData.value?.year;
  const m = overviewData.value?.month;
  if (y == null) return '';
  return m == null ? `（${y}年）` : `（${y}年${m}月）`;
});

const statItems = computed(() => {
  const s = overviewData.value?.summary;
  const y = overviewData.value?.year;
  const m = overviewData.value?.month;
  const period =
    y == null ? '累计' : m == null ? `（${y}年）` : `（${y}年${m}月）`;
  const fmt = (n: number | undefined) =>
    n == null ? '--' : Number(n).toLocaleString('zh-CN');
  return [
    { key: 'hazards', label: `隐患${period}`, value: fmt(s?.hazards.count), icon: 'lucide:alert-triangle', color: 'orange', suffix: '项' },
    { key: 'violations', label: `三违${period}`, value: fmt(s?.violations.count), icon: 'lucide:alert-octagon', color: 'red', suffix: '起' },
    { key: 'inspections', label: `网格长巡查${period}`, value: fmt(s?.inspections.count), icon: 'lucide:map-pin', color: 'blue', suffix: '次' },
    { key: 'trainings', label: `培训记录${period}`, value: fmt(s?.trainings.recordCount), icon: 'lucide:graduation-cap', color: 'green', suffix: '条' },
    { key: 'accidents', label: `事故${period}`, value: fmt(s?.accidents.count), icon: 'lucide:car-front', color: 'purple', suffix: '起' },
    { key: 'emergencies', label: `应急演练${period}`, value: fmt(s?.emergencies.count), icon: 'lucide:shield-check', color: 'cyan', suffix: '场' },
  ];
});

/* ────────────────────────── 趋势图 ────────────────────────── */
type TrendDim = 'violations' | 'inspections' | 'hazards' | 'trainings' | 'accidents';

const trendMetrics: Record<TrendDim, { label: string; color: string }> = {
  violations: { label: '三违起数', color: COLORS.violations },
  inspections: { label: '网格长巡查', color: COLORS.inspections },
  hazards: { label: '隐患数', color: COLORS.hazards },
  trainings: { label: '培训记录', color: COLORS.trainings },
  accidents: { label: '事故数', color: COLORS.accidents },
};

const trendDim = ref<TrendDim>('violations');

function seriesOf(dim: TrendDim): number[] {
  const rows = trendData.value?.rows;
  if (!rows) return [];
  switch (dim) {
    case 'violations':
      return rows.violations.count;
    case 'inspections':
      return rows.inspections.count;
    case 'hazards':
      return rows.hazards.count;
    case 'trainings':
      return rows.trainings.recordCount;
    case 'accidents':
      return rows.accidents.count;
    default:
      return [];
  }
}

/* ────────────────────────── 图表渲染 ────────────────────────── */
const trendChartRef = ref<EchartsUIType>();
const hazardChartRef = ref<EchartsUIType>();
const rankingChartRef = ref<EchartsUIType>();
const accidentChartRef = ref<EchartsUIType>();
const emergencyChartRef = ref<EchartsUIType>();

const { renderEcharts: renderTrend } = useEcharts(trendChartRef);
const { renderEcharts: renderHazard } = useEcharts(hazardChartRef);
const { renderEcharts: renderRanking } = useEcharts(rankingChartRef);
const { renderEcharts: renderAccident } = useEcharts(accidentChartRef);
const { renderEcharts: renderEmergency } = useEcharts(emergencyChartRef);

function hexA(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Y 轴顶值：按所选指标真实最大值动态取整留头（0/全零 → 0~1 基线） */
function niceYMax(maxVal: number): number {
  if (!maxVal || maxVal <= 0) return 1;
  const v = maxVal * 1.15;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const norm = v / mag;
  let nice: number;
  if (norm <= 1) nice = 1;
  else if (norm <= 2) nice = 2;
  else if (norm <= 5) nice = 5;
  else nice = 10;
  return nice * mag;
}

function lineOption(categories: string[], data: number[], name: string, color: string): ECOption {
  const maxVal = data.reduce((m, v) => Math.max(m, v), 0);
  // 单月/短跨度为单点或少量点，常显数值标签；累计（70 月）点过密则隐藏避免叠字
  const showLabel = categories.length > 0 && categories.length <= 12;
  return {
    tooltip: { trigger: 'axis' },
    grid: { left: 48, right: 24, top: 32, bottom: 32 },
    xAxis: { type: 'category', data: categories, boundaryGap: false },
    yAxis: { type: 'value', min: 0, max: niceYMax(maxVal), splitNumber: 4, minInterval: 1 },
    series: [
      {
        name,
        type: 'line',
        smooth: true,
        data,
        symbol: 'circle',
        symbolSize: 6,
        label: showLabel
          ? { show: true, position: 'top', fontSize: 10, formatter: (p) => String(p.value) }
          : { show: false },
        itemStyle: { color },
        lineStyle: { color, width: 2 },
        areaStyle: { color: hexA(color, 0.12) },
      },
    ],
  };
}

function pieOption(rows: BiApi.MapRow[], name: string, palette: string[]): ECOption {
  return {
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: { orient: 'vertical', left: 'right', top: 'middle', textStyle: { fontSize: 12 } },
    series: [
      {
        name,
        type: 'pie',
        radius: ['42%', '68%'],
        label: { formatter: '{b}\n{c}' },
        data: rows.map((r, i) => ({
          name: r.name,
          value: r.value,
          itemStyle: { color: palette[i % palette.length] },
        })),
      },
    ],
  };
}

function barOption(rows: BiApi.RankingRow[], name: string, color: string): ECOption {
  const names = rows.map(r => r.name ?? r.shortName ?? r.orgName ?? '');
  const values = rows.map(r => r.value);
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 8, right: 40, top: 16, bottom: 16, containLabel: true },
    xAxis: { type: 'value', minInterval: 1 },
    yAxis: { type: 'category', data: [...names].reverse(), axisLabel: { fontSize: 12 } },
    series: [
      {
        name,
        type: 'bar',
        data: [...values].reverse(),
        barWidth: 14,
        itemStyle: { color, borderRadius: [0, 4, 4, 0] },
      },
    ],
  };
}

function renderAllCharts() {
  renderTrendChart();
  renderHazardChart();
  renderRankingChart();
  renderAccidentChart();
  renderEmergencyChart();
}

function renderTrendChart() {
  const t = trendData.value;
  if (!t) return;
  const metric = trendMetrics[trendDim.value];
  const months = t.months;
  const firstMonth = months[0];
  if (!firstMonth) return;
  const sameYear = months.every(m => m.slice(0, 4) === firstMonth.slice(0, 4));
  const categories = months.map(m =>
    sameYear ? `${Number(m.slice(5))}月` : `${m.slice(0, 4)}年${Number(m.slice(5))}月`,
  );
  renderTrend(lineOption(categories, seriesOf(trendDim.value), metric.label, metric.color));
}

function renderHazardChart() {
  const rows = hazardMap.value?.rows ?? [];
  renderHazard(
    pieOption(rows, '隐患乡镇分布', [
      COLORS.hazards,
      COLORS.violations,
      COLORS.inspections,
      COLORS.trainings,
      COLORS.accidents,
      COLORS.emergencies,
      '#8c8c8c',
    ]),
  );
}

function renderRankingChart() {
  const rows = rankingData.value?.rows ?? [];
  const meta = RANKING_META[rankingMode.value];
  renderRanking(barOption(rows, meta.seriesName, meta.color));
}

function renderAccidentChart() {
  const rows = accidentMap.value?.rows ?? [];
  renderAccident(
    pieOption(rows, '事故等级分布', [
      COLORS.violations,
      '#faad14',
      COLORS.inspections,
      COLORS.trainings,
      '#722ed1',
    ]),
  );
}

function renderEmergencyChart() {
  const rows = emergencyMap.value?.rows ?? [];
  renderEmergency(
    pieOption(rows, '演练乡镇分布', [
      COLORS.emergencies,
      COLORS.hazards,
      COLORS.inspections,
      COLORS.trainings,
      COLORS.violations,
      '#8c8c8c',
    ]),
  );
}

/* ────────────────────────── 数据有无 ────────────────────────── */
/** 趋势图是否有真实数据：任一指标任一月份非零才算有（无数据月如 11 月全 0 → 空态） */
const hasTrendData = computed(() => {
  const rows = trendData.value?.rows;
  if (!rows) return false;
  const any = (arr?: number[]) => (arr ?? []).some(n => n > 0);
  return (
    any(rows?.violations.count) ||
    any(rows?.inspections.count) ||
    any(rows?.hazards.count) ||
    any(rows?.trainings.recordCount) ||
    any(rows?.accidents.count)
  );
});
const hasHazardData = computed(() => (hazardMap.value?.rows.length ?? 0) > 0);
const hasRankingData = computed(() => (rankingData.value?.rows.length ?? 0) > 0);
const hasAccidentData = computed(() => (accidentMap.value?.rows.length ?? 0) > 0);
const hasEmergencyData = computed(() => (emergencyMap.value?.rows.length ?? 0) > 0);

/* ────────────────────────── 生命周期 ────────────────────────── */
async function reloadAll() {
  await loadAll();
  await nextTick();
  renderAllCharts();
}

onMounted(async () => {
  await loadAll();
  await nextTick();
  renderAllCharts();
});

watch(yearValue, reloadAll);
watch(monthValue, reloadAll);
watch(rankingMode, reloadAll);
watch(trendDim, renderTrendChart);
</script>

<style scoped>
.bi-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
}

.bi-year-select {
  width: 130px;
}

.bi-month-select {
  width: 100px;
}

.chart-card :deep(.n-card-header) {
  padding-bottom: 4px;
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

.mb-4 {
  margin-bottom: 16px;
}
</style>
