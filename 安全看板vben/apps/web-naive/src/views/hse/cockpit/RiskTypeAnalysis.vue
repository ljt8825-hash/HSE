<script lang="ts" setup>
import type { CockpitApi } from '#/api/hse/cockpit';
import type { ECOption, EchartsUIType } from '@vben/plugins/echarts';

import { computed, onMounted, ref, watch } from 'vue';

import { useEcharts, EchartsUI } from '@vben/plugins/echarts';

const props = defineProps<{
  data: CockpitApi.RiskTypeAnalysisData | null;
  loading?: boolean;
}>();

const emit = defineEmits<{
  (e: 'typeClick', typeCode: string): void;
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
const { renderEcharts, resize, getChartInstance } = useEcharts(chartRef);

const riskTypeColors: Record<string, string> = {
  violation: '#f5222d',
  driver_compliance: '#fa8c16',
  incident: '#722ed1',
  training_compliance: '#1890ff',
  management_execution: '#13c2c2',
};

const chartOption = computed<ECOption>(() => {
  if (!props.data || !props.data.riskTypes || props.data.riskTypes.length === 0) {
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

  const categories = props.data.riskTypes.map((item) => item.typeName);
  const avgScores = props.data.riskTypes.map((item) => item.avgScore);
  const highRiskCounts = props.data.riskTypes.map((item) => item.highRiskCount);
  const colors = props.data.riskTypes.map(
    (item) => riskTypeColors[item.typeCode] || '#1890ff',
  );

  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'shadow',
      },
      formatter: (params: any) => {
        const idx = params[0].dataIndex;
        const item = props.data?.riskTypes[idx];
        if (!item) return '';
        return `
          <div style="font-weight: 600; margin-bottom: 4px;">${item.typeName}</div>
          <div>平均积分: ${item.avgScore}分</div>
          <div>高风险人数: ${item.highRiskCount}人</div>
        `;
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
      data: categories,
      axisLabel: {
        fontSize: 12,
        color: tokens.colorTextBase,
        interval: 0,
        rotate: 0,
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
        type: 'bar',
        barWidth: '30%',
        data: avgScores.map((value, index) => ({
          value,
          itemStyle: {
            color: colors[index],
            borderRadius: [4, 4, 0, 0],
          },
        })),
      },
      {
        name: '高风险人数',
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        symbol: 'circle',
        symbolSize: 8,
        lineStyle: {
          color: '#f5222d',
          width: 2,
        },
        itemStyle: {
          color: '#f5222d',
        },
        data: highRiskCounts,
      },
    ],
  };
});

function handleChartClick(params: any) {
  if (params.componentType === 'series') {
    const idx = params.dataIndex;
    const item = props.data?.riskTypes[idx];
    if (item) {
      emit('typeClick', item.typeCode);
    }
  }
}

watch(
  () => props.data,
  () => {
    renderEcharts(chartOption.value);
    const instance = getChartInstance();
    if (instance) {
      instance.on('click', handleChartClick);
    }
  },
  { immediate: true, deep: true },
);

onMounted(() => {
  renderEcharts(chartOption.value);
  const instance = getChartInstance();
  if (instance) {
    instance.on('click', handleChartClick);
  }
  window.addEventListener('resize', resize);
});
</script>

<template>
  <div class="risk-type-analysis">
    <EchartsUI ref="chartRef" style="width: 100%; height: 320px" />
  </div>
</template>

<style scoped>
.risk-type-analysis {
  width: 100%;
  height: 320px;
}
</style>
