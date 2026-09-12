<script lang="ts" setup>
/**
 * 指标分析（web-naive）
 * 从 web-antd 1:1 移植：Tabs/Table → NTabs/NDataTable(render)；ECharts 柱状图用 LOCAL tokens。
 * 原 web-antd 版本依赖 assessment API 的 IndicatorAnalysisData（categories/indicators/chartData）。
 * assessment-analysis API 未提供该端点，此处改为基于 OverviewData（实际值 vs 目标值）派生指标，
 * 保留「多类别 Tab + 指标表 + 柱状图」的完整交互与渲染逻辑。
 */
import type { AssessmentAnalysisApi } from '#/api/hse/assessment-analysis';
import type { DataTableColumns } from 'naive-ui';
import type { ECOption, EchartsUIType } from '@vben/plugins/echarts';
import { EchartsUI, useEcharts } from '@vben/plugins/echarts';
import { computed, h, onMounted, ref, watch } from 'vue';

import { NDataTable, NTabPane, NTabs, NTag, NCard } from 'naive-ui';

defineOptions({ name: 'IndicatorAnalysis' });

interface IndicatorRow {
  name: string;
  value: number;
  target: number;
  unit: string;
  score: number;
  status: 'excellent' | 'good' | 'warning' | 'danger';
}

interface IndicatorCategory {
  categoryKey: string;
  category: string;
  indicators: IndicatorRow[];
  chartData: { labels: string[]; values: number[] };
}

const props = defineProps<{
  data: AssessmentAnalysisApi.OverviewData;
}>();

// Canvas 无法解析 CSS 变量，颜色必须用 hex 字符串
const tokens = {
  colorTextBase: '#1f1f1f',
  colorPrimary: '#1890ff',
  colorError: '#f5222d',
  colorWarning: '#faad14',
  colorSuccess: '#52c41a',
  colorBgElevated: '#ffffff',
  colorBorder: '#f0f0f0',
  colorBgContainer: '#ffffff',
};

function clamp(n: number): number {
  return Math.max(0, Math.min(100, n));
}

function buildRow(
  name: string,
  value: number,
  target: number,
  unit: string,
  lowerBetter = false,
): IndicatorRow {
  let score: number;
  if (target > 0) {
    score = lowerBetter
      ? clamp(Math.round((1 - value / target) * 100))
      : clamp(Math.round((value / target) * 100));
  } else {
    score = value === 0 ? 100 : 0;
  }
  let status: IndicatorRow['status'] = 'danger';
  if (score >= 90) status = 'excellent';
  else if (score >= 80) status = 'good';
  else if (score >= 60) status = 'warning';
  return { name, value, target, unit, score, status };
}

const categories = ((): IndicatorCategory[] => {
  const o = props.data;
  const safety: IndicatorRow[] = [
    buildRow('事故起数', o.actual.accidentCount, o.targets.accidentCount, '起', true),
    buildRow('重大事故', o.actual.majorAccidentCount, o.targets.majorAccidentCount, '起', true),
    buildRow('三违次数', o.actual.violationCount, o.targets.violationCount, '次', true),
    buildRow('严重三违', o.actual.violationSeriousCount, o.targets.violationCount, '次', true),
  ];
  const management: IndicatorRow[] = [
    buildRow('培训完成率', Math.round(o.completionRates.trainingCompletionRate), o.targets.trainingCompletionRate, '%'),
    buildRow('隐患整改率', Math.round(o.completionRates.rectificationRate), o.targets.rectificationRate, '%'),
    buildRow('扣分率', o.actual.demeritRate, o.targets.demeritRate, '%', true),
    buildRow('网格巡查合规率', o.actual.gridInspectionCompliance, o.targets.gridInspectionCompliance, '%'),
  ];

  const toChart = (rows: IndicatorRow[]) => ({
    labels: rows.map((r) => r.name),
    values: rows.map((r) => r.score),
  });

  return [
    { categoryKey: 'safety', category: '安全指标', indicators: safety, chartData: toChart(safety) },
    { categoryKey: 'management', category: '管理指标', indicators: management, chartData: toChart(management) },
  ];
})();

const activeCategory = ref(categories[0]?.categoryKey || 'safety');

const chartRef = ref<EchartsUIType>();
const { renderEcharts: renderChart, resize: resizeChart } = useEcharts(chartRef);

const columns: DataTableColumns<IndicatorRow> = [
  { title: '指标名称', key: 'name', width: 180 },
  { title: '当前值', key: 'value', width: 100, align: 'center', render: (row) => h('span', { class: 'indicator-value' }, `${row.value}${row.unit}`) },
  { title: '目标值', key: 'target', width: 100, align: 'center', render: (row) => h('span', { class: 'indicator-target' }, `${row.target}${row.unit}`) },
  { title: '得分', key: 'score', width: 80, align: 'center', render: (row) => h('span', { style: { color: getScoreColor(row.score), fontWeight: 600 } }, String(row.score)) },
  {
    title: '状态',
    key: 'status',
    width: 100,
    align: 'center',
    render: (row) => h(NTag, { type: getStatusType(row.status), size: 'small', bordered: false }, { default: () => getStatusText(row.status) }),
  },
];

function getScoreColor(score: number): string {
  if (score >= 90) return tokens.colorSuccess;
  if (score >= 80) return tokens.colorPrimary;
  if (score >= 60) return tokens.colorWarning;
  return tokens.colorError;
}

function getStatusType(status: string): 'success' | 'info' | 'warning' | 'error' {
  const map: Record<string, 'success' | 'info' | 'warning' | 'error'> = {
    excellent: 'success',
    good: 'info',
    warning: 'warning',
    danger: 'error',
  };
  return map[status] || 'info';
}

function getStatusText(status: string): string {
  const texts: Record<string, string> = {
    excellent: '优秀',
    good: '良好',
    warning: '预警',
    danger: '危险',
  };
  return texts[status] || status;
}

const chartOption = computed<ECOption>(() => {
  const category = categories.find((c) => c.categoryKey === activeCategory.value) || categories[0];
  if (!category) return { series: [] };
  const colors = [tokens.colorPrimary, tokens.colorSuccess, tokens.colorWarning, tokens.colorError, tokens.colorPrimary];
  return {
    tooltip: { trigger: 'axis', backgroundColor: tokens.colorBgElevated, textStyle: { color: tokens.colorTextBase } },
    grid: { left: '3%', right: '4%', bottom: '3%', top: '10%', containLabel: true },
    xAxis: {
      type: 'category',
      data: category.chartData.labels,
      axisLabel: { fontSize: 12, color: tokens.colorTextBase },
      axisLine: { lineStyle: { color: tokens.colorBorder } },
    },
    yAxis: {
      type: 'value',
      max: 100,
      axisLabel: { color: tokens.colorTextBase },
      splitLine: { lineStyle: { color: tokens.colorBorder, type: 'dashed' } },
    },
    series: [
      {
        type: 'bar',
        data: category.chartData.values,
        itemStyle: {
          color: (params: any) => colors[params.dataIndex % colors.length] || tokens.colorPrimary,
          borderRadius: [4, 4, 0, 0],
        },
        barWidth: '50%',
        label: { show: true, position: 'top', fontSize: 12, color: tokens.colorTextBase },
      },
    ],
  };
});

onMounted(() => {
  renderChart(chartOption.value);
  window.addEventListener('resize', resizeChart);
});

watch(
  () => props.data,
  () => {
    if (chartRef.value) renderChart(chartOption.value);
  },
  { deep: true },
);

watch(activeCategory, () => {
  if (chartRef.value) renderChart(chartOption.value);
});
</script>

<template>
  <div class="indicator-analysis">
    <NTabs v-model:value="activeCategory" type="line">
      <NTabPane v-for="cat in categories" :key="cat.categoryKey" :name="cat.categoryKey" :tab="cat.category">
        <div class="indicator-content">
          <NDataTable
            :columns="columns"
            :data="cat.indicators"
            :pagination="false"
            size="small"
            :scroll-x="600"
          />
          <NCard :title="`${cat.category}得分分布`" :bordered="false" class="indicator-chart-section">
            <EchartsUI ref="chartRef" style="width: 100%; height: 300px" />
          </NCard>
        </div>
      </NTabPane>
    </NTabs>
  </div>
</template>

<style scoped>
.indicator-analysis .indicator-content {
  display: flex;
  gap: 16px;
}

.indicator-analysis .indicator-content > :deep(.n-data-table),
.indicator-analysis .indicator-chart-section {
  flex: 1;
  min-width: 0;
}

.indicator-analysis .indicator-value {
  font-weight: 600;
  color: hsl(var(--foreground));
}

.indicator-analysis .indicator-target {
  color: hsl(var(--muted-foreground));
}
</style>
