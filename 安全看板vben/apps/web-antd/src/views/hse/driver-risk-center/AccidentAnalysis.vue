<template>
  <div class="accident-analysis">
    <Row :gutter="[16, 16]" class="mb-4">
      <Col :xs="24" :sm="8">
        <Statistic title="事故总数" :value="data?.overall?.accidentTotalCount || 0" :value-style="{ color: 'hsl(var(--primary))' }">
          <template #prefix><IconifyIcon icon="lucide:car-front" /></template>
        </Statistic>
      </Col>
      <Col :xs="24" :sm="8">
        <Statistic title="涉事人数" :value="data?.overall?.accidentDriverCount || 0" :value-style="{ color: 'hsl(var(--error))' }">
          <template #prefix><IconifyIcon icon="lucide:users" /></template>
        </Statistic>
      </Col>
      <Col :xs="24" :sm="8">
        <Statistic title="责任事故" :value="data?.overall?.responsibleCount || 0" :value-style="{ color: 'hsl(var(--warning))' }">
          <template #prefix><IconifyIcon icon="lucide:shield-alert" /></template>
        </Statistic>
      </Col>
    </Row>

    <Row :gutter="[16, 16]">
      <Col :xs="24" :lg="12">
        <div class="section-title">事故等级分布</div>
        <EchartsUI v-if="data?.levelDistribution?.length" ref="levelChartRef" style="width: 100%; height: 200px" />
        <Empty v-else description="暂无数据" />
      </Col>
      <Col :xs="24" :lg="12">
        <div class="section-title">年度趋势</div>
        <EchartsUI v-if="data?.yearlyTrend?.length" ref="trendChartRef" style="width: 100%; height: 200px" />
        <Empty v-else description="暂无数据" />
      </Col>
    </Row>
  </div>
</template>

<script setup lang="ts">
import { Col, Empty, Row, Statistic } from 'ant-design-vue';
import { ref, computed, watch, onMounted } from 'vue';
import { IconifyIcon } from '@vben/icons';
import type { EchartsUIType } from '@vben/plugins/echarts';

import { useAntdDesignTokens } from '@vben/hooks';
import { EchartsUI, useEcharts } from '@vben/plugins/echarts';
import type { DriverRiskCenterApi } from '#/api/hse/driver-risk-center';

const props = defineProps<{
  data: DriverRiskCenterApi.AccidentStatisticsData | null;
}>();

const levelChartRef = ref<EchartsUIType>();
const trendChartRef = ref<EchartsUIType>();
const { renderEcharts: renderLevelChart } = useEcharts(levelChartRef);
const { renderEcharts: renderTrendChart } = useEcharts(trendChartRef);
const { tokens } = useAntdDesignTokens();

const levelChartOption = computed<Parameters<ReturnType<typeof useEcharts>['renderEcharts']>[0]>(() => {
  if (!props.data?.levelDistribution || props.data.levelDistribution.length === 0) {
    return {
      title: {
        text: '暂无数据',
        left: 'center',
        top: 'center',
        textStyle: { color: tokens.colorTextBase, fontSize: 12, fontWeight: 'normal' },
      },
      series: [],
    };
  }

  const colors = [tokens.colorSuccess, tokens.colorWarning, tokens.colorPrimary, tokens.colorError];
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

const trendChartOption = computed<Parameters<ReturnType<typeof useEcharts>['renderEcharts']>[0]>(() => {
  if (!props.data?.yearlyTrend || props.data.yearlyTrend.length === 0) {
    return {
      title: {
        text: '暂无数据',
        left: 'center',
        top: 'center',
        textStyle: { color: tokens.colorTextBase, fontSize: 12, fontWeight: 'normal' },
      },
      series: [],
    };
  }

  const years = props.data.yearlyTrend.map(item => {
    const d = new Date(item.year);
    return d.getFullYear() + '年';
  });
  const counts = props.data.yearlyTrend.map(item => item.count);

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

watch([() => props.data, tokens], () => {
  renderLevelChart(levelChartOption.value);
  renderTrendChart(trendChartOption.value);
}, { deep: true });

onMounted(() => {
  renderLevelChart(levelChartOption.value);
  renderTrendChart(trendChartOption.value);
});
</script>

<style lang="less" scoped>
.accident-analysis {
  .section-title {
    margin-bottom: 12px;
    color: hsl(var(--foreground));
    font-weight: 600;
  }
}
</style>
