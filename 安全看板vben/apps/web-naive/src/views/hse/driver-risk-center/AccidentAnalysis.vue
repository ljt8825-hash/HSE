<script lang="ts" setup>
/**
 * 交通事故分析（web-naive 迁移）
 * 事故等级分布饼图 + 年度趋势柱状图；图表配置与 antd 版本保持一致
 */
import { computed, onMounted, ref, watch } from 'vue';

import { NEmpty, NStatistic } from 'naive-ui';

import { IconifyIcon } from '@vben/icons';
import type { ECOption, EchartsUIType } from '@vben/plugins/echarts';
import { EchartsUI, useEcharts } from '@vben/plugins/echarts';

import type { DriverRiskCenterApi } from '#/api/hse/driver-risk-center';

const props = defineProps<{
  data: DriverRiskCenterApi.AccidentStatisticsData | null;
}>();

const levelChartRef = ref<EchartsUIType>();
const trendChartRef = ref<EchartsUIType>();
const { renderEcharts: renderLevelChart } = useEcharts(levelChartRef);
const { renderEcharts: renderTrendChart } = useEcharts(trendChartRef);

// Canvas 无法解析 CSS 变量，图表配色使用固定色值
const tokens = {
  colorTextBase: '#1f1f1f',
  colorPrimary: '#1890ff',
  colorError: '#f5222d',
  colorWarning: '#faad14',
  colorSuccess: '#52c41a',
  colorBgElevated: '#ffffff',
  colorBorder: '#f0f0f0',
};

const levelChartOption = computed<ECOption>(() => {
  if (
    !props.data?.levelDistribution ||
    props.data.levelDistribution.length === 0
  ) {
    return {
      title: {
        text: '暂无数据',
        left: 'center',
        top: 'center',
        textStyle: {
          color: tokens.colorTextBase,
          fontSize: 12,
          fontWeight: 'normal',
        },
      },
      series: [],
    };
  }

  const colors = [
    tokens.colorSuccess,
    tokens.colorWarning,
    tokens.colorPrimary,
    tokens.colorError,
  ];
  return {
    tooltip: {
      trigger: 'item',
      backgroundColor: tokens.colorBgElevated,
      textStyle: { color: tokens.colorTextBase },
      formatter: '{b}: {c}起 ({d}%)',
    },
    series: [
      {
        type: 'pie',
        radius: ['45%', '70%'],
        center: ['50%', '50%'],
        label: {
          show: true,
          fontSize: 11,
          formatter: '{b}\n{d}%',
        },
        data: props.data.levelDistribution.map((item, index) => ({
          name: item.level,
          value: item.count,
          itemStyle: { color: colors[index % colors.length] },
        })),
      },
    ],
  };
});

const trendChartOption = computed<ECOption>(() => {
  if (!props.data?.yearlyTrend || props.data.yearlyTrend.length === 0) {
    return {
      title: {
        text: '暂无数据',
        left: 'center',
        top: 'center',
        textStyle: {
          color: tokens.colorTextBase,
          fontSize: 12,
          fontWeight: 'normal',
        },
      },
      series: [],
    };
  }

  const years = props.data.yearlyTrend.map((item) => {
    const d = new Date(item.year);
    return `${d.getFullYear()}年`;
  });
  const counts = props.data.yearlyTrend.map((item) => item.count);

  return {
    tooltip: {
      trigger: 'axis',
      backgroundColor: tokens.colorBgElevated,
      textStyle: { color: tokens.colorTextBase },
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
      data: years,
      axisLabel: {
        fontSize: 11,
        color: tokens.colorTextBase,
      },
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        fontSize: 11,
        color: tokens.colorTextBase,
      },
      splitLine: {
        lineStyle: { color: tokens.colorBorder, type: 'dashed' },
      },
    },
    series: [
      {
        type: 'bar',
        data: counts,
        itemStyle: {
          color: tokens.colorPrimary,
          borderRadius: [4, 4, 0, 0],
        },
        barWidth: '40%',
      },
    ],
  };
});

watch(
  () => props.data,
  () => {
    renderLevelChart(levelChartOption.value);
    renderTrendChart(trendChartOption.value);
  },
  { deep: true },
);

onMounted(() => {
  renderLevelChart(levelChartOption.value);
  renderTrendChart(trendChartOption.value);
});
</script>

<template>
  <div class="accident-analysis">
    <div class="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
      <NStatistic label="事故总数">
        <template #prefix>
          <IconifyIcon icon="lucide:car-front" />
        </template>
        <span :style="{ color: 'hsl(var(--primary))' }">
          {{ data?.overall?.accidentTotalCount || 0 }}
        </span>
      </NStatistic>
      <NStatistic label="涉事人数">
        <template #prefix>
          <IconifyIcon icon="lucide:users" />
        </template>
        <span :style="{ color: 'hsl(var(--error))' }">
          {{ data?.overall?.accidentDriverCount || 0 }}
        </span>
      </NStatistic>
      <NStatistic label="责任事故">
        <template #prefix>
          <IconifyIcon icon="lucide:shield-alert" />
        </template>
        <span :style="{ color: 'hsl(var(--warning))' }">
          {{ data?.overall?.responsibleCount || 0 }}
        </span>
      </NStatistic>
    </div>

    <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div>
        <div class="section-title">事故等级分布</div>
        <EchartsUI
          v-if="data?.levelDistribution?.length"
          ref="levelChartRef"
          height="200px"
          width="100%"
        />
        <NEmpty v-else description="暂无数据" />
      </div>
      <div>
        <div class="section-title">年度趋势</div>
        <EchartsUI
          v-if="data?.yearlyTrend?.length"
          ref="trendChartRef"
          height="200px"
          width="100%"
        />
        <NEmpty v-else description="暂无数据" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.accident-analysis .section-title {
  margin-bottom: 12px;
  font-weight: 600;
  color: hsl(var(--foreground));
}
</style>
