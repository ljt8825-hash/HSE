<template>
  <div class="accident-trend">
    <Space wrap class="trend-header">
      <Radio.Group v-model:value="activePeriod" button-style="solid" @change="handlePeriodChange">
        <Radio.Button
          v-for="opt in periodOptions"
          :key="opt.value"
          :value="opt.value"
        >
          {{ opt.label }}
        </Radio.Button>
      </Radio.Group>
      <div v-if="activePeriod === 'month'" class="year-selector">
        <Select v-model:value="selectedYear" class="year-select" @change="handleYearChange">
          <Select.Option v-for="y in yearOptions" :key="y" :value="y">{{ y }}年</Select.Option>
        </Select>
      </div>
    </Space>

    <div class="chart-panel">
      <EchartsUI ref="trendChartRef" style="width: 100%; height: 280px" />
      <Empty v-if="!(activePeriod === 'year' ? data?.yearly?.length : data?.monthly?.length)" class="chart-empty" description="暂无数据" />
    </div>

    <div class="chart-panel type-chart">
      <Typography.Text strong class="chart-title">分类趋势对比</Typography.Text>
      <EchartsUI ref="typeTrendChartRef" style="width: 100%; height: 220px" />
      <Empty v-if="!(activePeriod === 'year' ? data?.typeYearly?.length : data?.typeMonthly?.length)" class="chart-empty" description="暂无数据" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { Empty, Radio, Select, Space, Typography } from 'ant-design-vue';
import type { EchartsUIType } from '@vben/plugins/echarts';

import { useAntdDesignTokens } from '@vben/hooks';
import { EchartsUI, useEcharts } from '@vben/plugins/echarts';
import type { AccidentAnalysisApi } from '#/api/hse/accident-analysis';

const props = defineProps<{
  data: AccidentAnalysisApi.TrendData | null;
}>();

const emit = defineEmits<{
  (e: 'period-change', period: AccidentAnalysisApi.TrendPeriod, year?: number): void;
}>();

const activePeriod = ref<AccidentAnalysisApi.TrendPeriod>('year');
const selectedYear = ref(new Date().getFullYear());

const periodOptions = [
  { label: '年度趋势', value: 'year' as AccidentAnalysisApi.TrendPeriod },
  { label: '月度趋势', value: 'month' as AccidentAnalysisApi.TrendPeriod },
];

const yearOptions = computed(() => {
  const currentYear = new Date().getFullYear();
  const years: number[] = [];
  for (let y = currentYear; y >= currentYear - 5; y--) {
    years.push(y);
  }
  return years;
});

function handlePeriodChange() {
  emit('period-change', activePeriod.value, activePeriod.value === 'month' ? selectedYear.value : undefined);
}

function handleYearChange(year: unknown) {
  if (typeof year !== 'number') return;
  selectedYear.value = year;
  emit('period-change', 'month', selectedYear.value);
}

const trendChartRef = ref<EchartsUIType>();
const typeTrendChartRef = ref<EchartsUIType>();
const { renderEcharts: renderTrendChart } = useEcharts(trendChartRef);
const { renderEcharts: renderTypeTrendChart } = useEcharts(typeTrendChartRef);
const { tokens } = useAntdDesignTokens();

const trendChartOption = computed<Parameters<ReturnType<typeof useEcharts>['renderEcharts']>[0]>(() => {
  const isYearly = activePeriod.value === 'year';
  const trendData = isYearly ? props.data?.yearly : props.data?.monthly;

  if (!trendData || trendData.length === 0) {
    return { series: [] };
  }

  const labels = isYearly
    ? trendData.map((d: any) => d.year + '年')
    : trendData.map((d: any) => d.month + '月');
  const counts = trendData.map((d: any) => d.count);
  const responsibleCounts = trendData.map((d: any) => d.responsibleCount);

  return {
    tooltip: {
      trigger: 'axis',
      backgroundColor: tokens.colorBgElevated,
      textStyle: { color: tokens.colorTextBase },
      formatter: (params: any) => {
        let result = `<div style="font-weight: 600; margin-bottom: 8px;">${params[0].axisValue}</div>`;
        params.forEach((item: any) => {
          result += `<div style="margin: 4px 0;"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${item.color};margin-right:8px;"></span>${item.seriesName}: ${item.value}</div>`;
        });
        return result;
      },
    },
    legend: { data: ['事故总数', '责任事故'], top: 0, textStyle: { fontSize: 12, color: tokens.colorTextBase } },
    grid: { left: '3%', right: '4%', bottom: '3%', top: '12%', containLabel: true },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: labels,
      axisLabel: { fontSize: 12, color: tokens.colorTextBase },
      axisLine: { lineStyle: { color: tokens.colorBorder } },
    },
    yAxis: { type: 'value', axisLabel: { fontSize: 12, color: tokens.colorTextBase }, splitLine: { lineStyle: { color: tokens.colorBorder, type: 'dashed' } } },
    series: [
      {
        name: '事故总数',
        type: 'line',
        smooth: true,
        data: counts,
        lineStyle: { color: tokens.colorError, width: 3 },
        itemStyle: { color: tokens.colorError },
        areaStyle: {
          color: tokens.colorError,
          opacity: 0.16,
        },
      },
      {
        name: '责任事故',
        type: 'line',
        smooth: true,
        data: responsibleCounts,
        lineStyle: { color: tokens.colorWarning, width: 2, type: 'dashed' },
        itemStyle: { color: tokens.colorWarning },
      },
    ],
  };
});

const typeTrendChartOption = computed<Parameters<ReturnType<typeof useEcharts>['renderEcharts']>[0]>(() => {
  const isYearly = activePeriod.value === 'year';
  const typeData = isYearly ? props.data?.typeYearly : props.data?.typeMonthly;

  if (!typeData || typeData.length === 0) {
    return { series: [] };
  }

  const labels = isYearly
    ? [...new Set(typeData.map((d: any) => d.year + '年'))]
    : [...new Set(typeData.map((d: any) => d.month + '月'))];

  const productionData = labels.map(label => {
    const item = typeData.find((d: any) => (isYearly ? d.year + '年' === label : d.month + '月' === label) && d.category === '生产安全事故');
    return item ? item.count : 0;
  });
  const trafficData = labels.map(label => {
    const item = typeData.find((d: any) => (isYearly ? d.year + '年' === label : d.month + '月' === label) && d.category === '交通事故');
    return item ? item.count : 0;
  });

  return {
    tooltip: { trigger: 'axis', backgroundColor: tokens.colorBgElevated, textStyle: { color: tokens.colorTextBase } },
    legend: { data: ['生产安全事故', '交通事故'], top: 0, textStyle: { fontSize: 12, color: tokens.colorTextBase } },
    grid: { left: '3%', right: '4%', bottom: '3%', top: '12%', containLabel: true },
    xAxis: { type: 'category', data: labels, axisLabel: { fontSize: 12, color: tokens.colorTextBase } },
    yAxis: { type: 'value', axisLabel: { fontSize: 12, color: tokens.colorTextBase }, splitLine: { lineStyle: { color: tokens.colorBorder, type: 'dashed' } } },
    series: [
      { name: '生产安全事故', type: 'bar', data: productionData, itemStyle: { color: tokens.colorError, borderRadius: [4, 4, 0, 0] }, barWidth: '30%' },
      { name: '交通事故', type: 'bar', data: trafficData, itemStyle: { color: tokens.colorPrimary, borderRadius: [4, 4, 0, 0] }, barWidth: '30%' },
    ],
  };
});

watch([() => props.data, tokens], () => {
  nextTick(() => {
    renderTrendChart(trendChartOption.value);
    renderTypeTrendChart(typeTrendChartOption.value);
  });
}, { deep: true });

onMounted(() => {
  nextTick(() => {
    renderTrendChart(trendChartOption.value);
    renderTypeTrendChart(typeTrendChartOption.value);
  });
});
</script>

<style lang="less" scoped>
.accident-trend {
  .trend-header {
    margin-bottom: 16px;
  }

  .chart-panel {
    position: relative;
    min-height: 252px;
  }

  .chart-title {
    display: block;
    margin-bottom: 16px;
  }

  .chart-empty {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0;
  }
}
</style>
