<script lang="ts" setup>
import type { CockpitApi } from '#/api/hse/cockpit';
import type { ECOption, EchartsUIType } from '@vben/plugins/echarts';

import { computed, onMounted, ref, watch } from 'vue';

import { useEcharts, EchartsUI } from '@vben/plugins/echarts';
import { NRadioGroup, NRadioButton, NSelect } from 'naive-ui';

const props = defineProps<{
  data: CockpitApi.RiskTrendData | null;
  loading?: boolean;
}>();

const emit = defineEmits<{
  (e: 'periodChange', period: CockpitApi.TrendPeriod): void;
  (e: 'metricChange', metric: CockpitApi.TrendMetric): void;
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

const chartRef = ref<EchartsUIType>();
const { renderEcharts, resize } = useEcharts(chartRef);

const activePeriod = ref<CockpitApi.TrendPeriod>('daily');
const activeMetric = ref<CockpitApi.TrendMetric>('total');

const periodOptions = [
  { label: '日趋势', value: 'daily' },
  { label: '周趋势', value: 'weekly' },
  { label: '月趋势', value: 'monthly' },
];

const metricOptions = [
  { label: '综合评分', value: 'total' },
  { label: '三违风险', value: 'violation' },
  { label: '驾驶风险', value: 'driver' },
  { label: '培训风险', value: 'training' },
  { label: '事故风险', value: 'incident' },
  { label: '管理履职', value: 'management' },
];

const metricColors: Record<string, string> = {
  total: '#1890ff',
  violation: '#f5222d',
  driver: '#fa8c16',
  training: '#1890ff',
  incident: '#722ed1',
  management: '#13c2c2',
};

const chartOption = computed<ECOption>(() => {
  if (!props.data || !props.data.trend || props.data.trend.length === 0) {
    return {
      title: {
        text: '暂无数据',
        left: 'center',
        top: 'center',
        textStyle: {
          color: tokens.colorTextBase,
          fontSize: 14,
          fontWeight: 'normal',
        },
      },
      series: [],
      xAxis: {},
      yAxis: {},
    };
  }

  const dates = props.data.trend.map((item) => {
    const dateStr = typeof item.date === 'string' ? item.date : String(item.date);
    if (activePeriod.value === 'daily') {
      return dateStr.slice(5);
    }
    return dateStr;
  });

  const avgScores = props.data.trend.map((item) => item.avgScore);
  const highRiskCounts = props.data.trend.map((item) => item.highRiskCount);

  const color = metricColors[activeMetric.value] || '#1890ff';

  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'cross',
        crossStyle: {
          color: tokens.colorTextBase,
        },
      },
      formatter: (params: any) => {
        const idx = params[0].dataIndex;
        const item = props.data?.trend[idx];
        if (!item) return '';
        return `
          <div style="font-weight: 600; margin-bottom: 4px;">${item.date}</div>
          <div>平均积分: ${item.avgScore}分</div>
          <div>高风险人数: ${item.highRiskCount}人</div>
        `;
      },
    },
    legend: {
      data: ['平均积分', '高风险人数'],
      top: 0,
      right: 10,
      textStyle: {
        fontSize: 12,
        color: tokens.colorTextBase,
      },
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      top: '15%',
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      data: dates,
      boundaryGap: false,
      axisLabel: {
        fontSize: 11,
        color: tokens.colorTextBase,
      },
      axisLine: {
        lineStyle: {
          color: tokens.colorBorder,
        },
      },
      axisTick: {
        show: false,
      },
    },
    yAxis: [
      {
        type: 'value',
        name: '平均积分',
        nameTextStyle: {
          fontSize: 12,
          color: tokens.colorTextBase,
        },
        axisLabel: {
          fontSize: 12,
          color: tokens.colorTextBase,
        },
        splitLine: {
          lineStyle: {
            color: tokens.colorBorder,
            type: 'dashed',
          },
        },
      },
      {
        type: 'value',
        name: '高风险人数',
        nameTextStyle: {
          fontSize: 12,
          color: tokens.colorTextBase,
        },
        axisLabel: {
          fontSize: 12,
          color: tokens.colorTextBase,
        },
        splitLine: {
          show: false,
        },
      },
    ],
    series: [
      {
        name: '平均积分',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: {
          color,
          width: 2,
        },
        itemStyle: {
          color,
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: color + '30' },
              { offset: 1, color: color + '05' },
            ],
          },
        },
        data: avgScores,
      },
      {
        name: '高风险人数',
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: {
          color: '#f5222d',
          width: 2,
          type: 'dashed',
        },
        itemStyle: {
          color: '#f5222d',
        },
        data: highRiskCounts,
      },
    ],
  };
});

function handlePeriodChange() {
  emit('periodChange', activePeriod.value);
}

function handleMetricChange() {
  emit('metricChange', activeMetric.value);
}

watch(
  () => props.data,
  () => {
    if (chartRef.value) {
      renderEcharts(chartOption.value);
    }
  },
  { immediate: true, deep: true },
);

onMounted(() => {
  renderEcharts(chartOption.value);
  window.addEventListener('resize', resize);
});

defineExpose({
  activePeriod,
  activeMetric,
});
</script>

<template>
  <div class="risk-trend">
    <div class="trend-header">
      <NRadioGroup v-model:value="activePeriod" type="button" @update:value="handlePeriodChange">
        <NRadioButton
          v-for="opt in periodOptions"
          :key="opt.value"
          :value="opt.value"
        >
          {{ opt.label }}
        </NRadioButton>
      </NRadioGroup>
      <div class="metric-selector">
        <NSelect
          v-model:value="activeMetric"
          class="metric-select"
          :options="metricOptions"
          @update:value="handleMetricChange"
        />
      </div>
    </div>
    <EchartsUI ref="chartRef" style="width: 100%; height: 280px" />
  </div>
</template>

<style scoped>
.risk-trend {
  width: 100%;
}

.trend-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.metric-selector {
  display: flex;
  align-items: center;
}

.metric-select {
  width: 140px;
}
</style>
