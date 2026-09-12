<template>
  <div class="risk-trend" v-loading="loading">
    <div class="trend-header">
      <a-radio-group v-model:value="activePeriod" button-style="solid" @change="handlePeriodChange">
        <a-radio-button
          v-for="opt in periodOptions"
          :key="opt.value"
          :value="opt.value"
        >
          {{ opt.label }}
        </a-radio-button>
      </a-radio-group>
    </div>

    <div class="trend-chart">
      <EchartsUI ref="chartRef" style="width: 100%; height: 300px" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import type { EchartsUIType } from '@vben/plugins/echarts';

import { EchartsUI, useEcharts } from '@vben/plugins/echarts';
import type { RiskProfileDetailApi } from '#/api/hse/risk-profile-detail';

const props = defineProps<{
  data: RiskProfileDetailApi.TrendData | null;
  loading: boolean;
}>();

const emit = defineEmits<{
  (e: 'period-change', period: RiskProfileDetailApi.TrendPeriod): void;
}>();

const chartRef = ref<EchartsUIType>();
const { renderEcharts } = useEcharts(chartRef);
const activePeriod = ref<RiskProfileDetailApi.TrendPeriod>('week');

const periodOptions = [
  { label: '日趋势', value: 'day' as RiskProfileDetailApi.TrendPeriod },
  { label: '周趋势', value: 'week' as RiskProfileDetailApi.TrendPeriod },
  { label: '月趋势', value: 'month' as RiskProfileDetailApi.TrendPeriod },
];

function handlePeriodChange() {
  emit('period-change', activePeriod.value);
}

const chartOption = computed<Parameters<ReturnType<typeof useEcharts>['renderEcharts']>[0]>(() => {
  if (!props.data || !props.data.trend || props.data.trend.length === 0) {
    return {
      title: {
        text: '暂无趋势数据',
        left: 'center',
        top: 'center',
        textStyle: { color: '#999', fontSize: 14, fontWeight: 'normal' },
      },
      series: [],
    };
  }

  const dates = props.data.trend.map(d => formatPeriodDate(d.periodDate));
  const avgScores = props.data.trend.map(d => d.avgScore);
  const maxScores = props.data.trend.map(d => d.maxScore);
  const minScores = props.data.trend.map(d => d.minScore);

  return {
    tooltip: {
      trigger: 'axis',
      formatter: (params: any) => {
        const date = params[0].axisValue;
        let result = `<div style="font-weight: 600; margin-bottom: 8px;">${date}</div>`;
        params.forEach((item: any) => {
          result += `<div style="display: flex; align-items: center; margin: 4px 0;">
            <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: ${item.color}; margin-right: 8px;"></span>
            <span>${item.seriesName}: ${item.value}</span>
          </div>`;
        });
        return result;
      },
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      top: '10%',
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: dates,
      axisLabel: {
        fontSize: 12,
        color: '#8c8c8c',
        rotate: dates.length > 8 ? 45 : 0,
      },
      axisLine: {
        lineStyle: { color: '#f0f0f0' },
      },
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 100,
      axisLabel: {
        fontSize: 12,
        color: '#8c8c8c',
      },
      axisLine: {
        show: false,
      },
      splitLine: {
        lineStyle: { color: '#f0f0f0', type: 'dashed' },
      },
    },
    series: [
      {
        name: '平均积分',
        type: 'line',
        smooth: true,
        data: avgScores,
        lineStyle: { color: '#1890ff', width: 3 },
        itemStyle: { color: '#1890ff' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(24, 144, 255, 0.3)' },
              { offset: 1, color: 'rgba(24, 144, 255, 0.05)' },
            ],
          },
        },
      },
      {
        name: '最高积分',
        type: 'line',
        smooth: true,
        data: maxScores,
        lineStyle: { color: '#52c41a', width: 2, type: 'dashed' },
        itemStyle: { color: '#52c41a' },
      },
      {
        name: '最低积分',
        type: 'line',
        smooth: true,
        data: minScores,
        lineStyle: { color: '#ff4d4f', width: 2, type: 'dashed' },
        itemStyle: { color: '#ff4d4f' },
      },
    ],
  };
});

function formatPeriodDate(dateStr?: string) {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

watch(() => props.data, () => {
  renderEcharts(chartOption.value);
}, { deep: true });

onMounted(() => {
  renderEcharts(chartOption.value);
});
</script>

<style lang="less" scoped>
.risk-trend {
  padding: 16px;

  .trend-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;

  }

  .trend-chart {
    background: #fff;
    border-radius: 8px;
  }
}
</style>
