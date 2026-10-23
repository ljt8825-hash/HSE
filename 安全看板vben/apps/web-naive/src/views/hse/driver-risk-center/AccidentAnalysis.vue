<script lang="ts" setup>
/**
 * 交通事故分析（web-naive 迁移，2026-09-30 重设计）
 * 事故等级分布饼图 + 年度趋势柱状图；图表自适应撑满卡片
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

// HSE 系统语义色（Canvas 固定值）：成功绿、预警黄、信息蓝、危险红
const tokens = {
  colorSuccess: '#52c41a',
  colorWarning: '#faad14',
  colorPrimary: '#2080f0',
  colorError: '#f5222d',
  colorBorder: '#f0f0f0',
  colorTextBase: '#1f1f1f',
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
      backgroundColor: 'rgba(255, 255, 255, 0.92)',
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
          color: tokens.colorTextBase,
          formatter: '{b}\n{d}%',
        },
        labelLine: {
          length: 10,
          length2: 8,
        },
        emphasis: { scaleSize: 4 },
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
      backgroundColor: 'rgba(255, 255, 255, 0.92)',
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
    <div class="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
      <div class="stat-chip">
        <NStatistic label="事故总数">
          <template #prefix>
            <IconifyIcon icon="lucide:car-front" />
          </template>
          <span class="value-primary">
            {{ data?.overall?.accidentTotalCount || 0 }}
          </span>
        </NStatistic>
      </div>
      <div class="stat-chip">
        <NStatistic label="涉事人数">
          <template #prefix>
            <IconifyIcon icon="lucide:users" />
          </template>
          <span class="value-danger">
            {{ data?.overall?.accidentDriverCount || 0 }}
          </span>
        </NStatistic>
      </div>
      <div class="stat-chip">
        <NStatistic label="责任事故">
          <template #prefix>
            <IconifyIcon icon="lucide:shield-alert" />
          </template>
          <span class="value-warning">
            {{ data?.overall?.responsibleCount || 0 }}
          </span>
        </NStatistic>
      </div>
    </div>

    <div class="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-2">
      <div class="flex min-h-0 min-w-0 flex-col">
        <div class="section-title">事故等级分布</div>
        <div class="min-h-0 flex-1">
          <EchartsUI
            v-if="data?.levelDistribution?.length"
            ref="levelChartRef"
            height="100%"
            width="100%"
          />
          <NEmpty v-else description="暂无数据" />
        </div>
      </div>
      <div class="flex min-h-0 min-w-0 flex-col">
        <div class="section-title">年度趋势</div>
        <div class="min-h-0 flex-1">
          <EchartsUI
            v-if="data?.yearlyTrend?.length"
            ref="trendChartRef"
            height="100%"
            width="100%"
          />
          <NEmpty v-else description="暂无数据" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.accident-analysis {
  display: flex;
  flex-direction: column;
}
.accident-analysis .stat-chip {
  padding: 10px 12px;
  background: hsl(var(--muted));
  border-radius: 8px;
}
.accident-analysis .stat-chip :deep(.n-statistic-label) {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}
.accident-analysis .stat-chip :deep(.n-statistic-value) {
  font-size: 18px;
  color: hsl(var(--foreground));
}
.accident-analysis .value-primary {
  color: #2080f0;
}
.accident-analysis .value-danger {
  color: #f5222d;
}
.accident-analysis .value-warning {
  color: #f0a020;
}
.accident-analysis .section-title {
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 600;
  color: hsl(var(--muted-foreground));
}
</style>
