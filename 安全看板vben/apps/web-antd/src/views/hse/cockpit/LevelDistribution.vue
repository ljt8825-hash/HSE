<script lang="ts" setup>
import type { CockpitApi } from '#/api/hse/cockpit';
import type { EchartsUIType } from '@vben/plugins/echarts';

import { computed, onMounted, ref, watch } from 'vue';

import { useAntdDesignTokens } from '@vben/hooks';
import { useEcharts, EchartsUI } from '@vben/plugins/echarts';

const props = defineProps<{
  data: CockpitApi.LevelDistributionData | null;
  loading?: boolean;
}>();

const emit = defineEmits<{
  (e: 'levelClick', levelCode: string): void;
}>();

const chartRef = ref<EchartsUIType>();
const { renderEcharts, resize, getChartInstance } = useEcharts(chartRef);
const { tokens } = useAntdDesignTokens();

const defaultColors = computed(() => ({
  low: tokens.colorSuccess,
  medium: tokens.colorWarning,
  high: tokens.colorWarning,
  critical: tokens.colorError,
}));

const chartOption = computed<Parameters<ReturnType<typeof useEcharts>['renderEcharts']>[0]>(() => {
  if (!props.data || !props.data.levels || props.data.levels.length === 0) {
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
    };
  }

  const data = props.data.levels.map((level) => ({
    name: level.levelName,
    value: level.count,
    itemStyle: {
      color:
        level.colorCode ||
        defaultColors.value[level.levelCode as keyof typeof defaultColors.value] ||
        tokens.colorPrimary,
    },
    levelCode: level.levelCode,
  }));

  return {
    tooltip: {
      trigger: 'item',
      backgroundColor: tokens.colorBgElevated,
      textStyle: { color: tokens.colorTextBase },
      formatter: '{b}: {c}人 ({d}%)',
    },
    legend: {
      orient: 'vertical',
      right: '5%',
      top: 'center',
      itemWidth: 12,
      itemHeight: 12,
      textStyle: {
        fontSize: 12,
        color: tokens.colorTextBase,
      },
      formatter: (name: string) => {
        const item = data.find((d) => d.name === name);
        return item ? `${name}  ${item.value}人` : name;
      },
    },
    series: [
      {
        name: '风险等级分布',
        type: 'pie',
        radius: ['50%', '70%'],
        center: ['35%', '50%'],
        avoidLabelOverlap: false,
        itemStyle: {
          borderRadius: 4,
          borderColor: tokens.colorBgContainer,
          borderWidth: 2,
        },
        label: {
          show: false,
          position: 'center',
        },
        emphasis: {
          label: {
            show: true,
            fontSize: 16,
            fontWeight: 'bold',
            formatter: '{b}\n{c}人',
          },
        },
        labelLine: {
          show: false,
        },
        data,
      },
    ],
  };
});

function handleChartClick(params: any) {
  if (params.data && params.data.levelCode) {
    emit('levelClick', params.data.levelCode);
  }
}

watch(
  [() => props.data, tokens],
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
  <div class="level-distribution" v-loading="loading">
    <EchartsUI ref="chartRef" style="width: 100%; height: 320px" />
  </div>
</template>

<style scoped>
.level-distribution {
  width: 100%;
  height: 320px;
}
</style>
