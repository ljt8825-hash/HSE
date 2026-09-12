<template>
  <div class="accident-classification">
    <Row v-if="data?.categories?.length" :gutter="[16, 16]" class="mb-4">
      <Col
        v-for="item in data?.categories"
        :key="item.category"
        :xs="24"
        :sm="12"
      >
        <Card size="small" :bordered="false">
          <template #title>
            <Space>
              <IconifyIcon :icon="getCategoryIcon(item.category)" :style="{ color: getCategoryColor(item.category) }" />
              <span>{{ item.category }}</span>
            </Space>
          </template>
          <Row :gutter="[16, 16]">
            <Col :span="8"><Statistic title="事故数" :value="item.count" /></Col>
            <Col :span="8"><Statistic title="责任数" :value="item.responsibleCount" /></Col>
            <Col :span="8"><Statistic title="伤亡" :value="item.casualties" :value-style="{ color: tokens.colorError }" /></Col>
            <Col :span="8"><Statistic title="受伤" :value="item.injuries" :value-style="{ color: tokens.colorWarning }" /></Col>
            <Col :span="8"><Statistic title="重大" :value="item.majorCount" :value-style="{ color: tokens.colorError }" /></Col>
          </Row>
        </Card>
      </Col>
    </Row>

    <Row :gutter="[16, 16]">
      <Col :xs="24" :lg="12">
        <div class="chart-panel">
          <Typography.Text strong class="chart-title">事故类型明细</Typography.Text>
          <EchartsUI ref="typeChartRef" style="width: 100%; height: 240px" />
          <Empty v-if="!data?.typeDetails?.length" class="chart-empty" description="暂无数据" />
        </div>
      </Col>
      <Col :xs="24" :lg="12">
        <div class="chart-panel">
          <Typography.Text strong class="chart-title">事故等级分布</Typography.Text>
          <EchartsUI ref="levelChartRef" style="width: 100%; height: 240px" />
          <Empty v-if="!data?.levelDetails?.length" class="chart-empty" description="暂无数据" />
        </div>
      </Col>
    </Row>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { Card, Col, Empty, Row, Space, Statistic, Typography } from 'ant-design-vue';
import { useAntdDesignTokens } from '@vben/hooks';
import { IconifyIcon } from '@vben/icons';
import type { EchartsUIType } from '@vben/plugins/echarts';

import { EchartsUI, useEcharts } from '@vben/plugins/echarts';
import type { AccidentAnalysisApi } from '#/api/hse/accident-analysis';

const props = defineProps<{
  data: AccidentAnalysisApi.ClassificationData | null;
}>();

const typeChartRef = ref<EchartsUIType>();
const levelChartRef = ref<EchartsUIType>();
const { renderEcharts: renderTypeChart } = useEcharts(typeChartRef);
const { renderEcharts: renderLevelChart } = useEcharts(levelChartRef);
const { tokens } = useAntdDesignTokens();

function getCategoryColor(category: string) {
  if (category === '交通事故') return tokens.colorPrimary;
  return tokens.colorError;
}

function getCategoryIcon(category: string) {
  if (category === '交通事故') return 'lucide:car-front';
  return 'lucide:hard-hat';
}

const typeChartOption = computed<Parameters<ReturnType<typeof useEcharts>['renderEcharts']>[0]>(() => {
  if (!props.data?.typeDetails || props.data.typeDetails.length === 0) {
    return { series: [] };
  }
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: '3%', right: '4%', bottom: '3%', top: '8%', containLabel: true },
    xAxis: {
      type: 'category',
      data: props.data.typeDetails.map(t => t.accidentType),
    axisLabel: { fontSize: 11, color: tokens.colorTextBase, rotate: 15 },
    },
    yAxis: { type: 'value', axisLabel: { fontSize: 11, color: tokens.colorTextBase }, splitLine: { lineStyle: { color: tokens.colorBorder, type: 'dashed' } } },
    series: [
      {
        type: 'bar',
        data: props.data.typeDetails.map(t => t.count),
        itemStyle: {
          color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: tokens.colorError }, { offset: 1, color: tokens.colorError } ] },
          borderRadius: [4, 4, 0, 0],
        },
        barWidth: '50%',
      },
    ],
  };
});

const levelChartOption = computed<Parameters<ReturnType<typeof useEcharts>['renderEcharts']>[0]>(() => {
  if (!props.data?.levelDetails || props.data.levelDetails.length === 0) {
    return { series: [] };
  }
  const colors: Record<string, string> = { '特别重大': tokens.colorError, '重大': tokens.colorError, '较大': tokens.colorWarning, '一般': tokens.colorWarning, '未分级': tokens.colorBorder };
  return {
    tooltip: { trigger: 'item', formatter: '{b}: {c}起 ({d}%)' },
    series: [
      {
        type: 'pie',
        radius: ['40%', '70%'],
        center: ['50%', '50%'],
        label: { show: true, fontSize: 11, formatter: '{b}\n{d}%' },
        data: props.data.levelDetails.map(l => ({
          name: l.level,
          value: l.count,
          itemStyle: { color: colors[l.level] || tokens.colorPrimary },
        })),
      },
    ],
  };
});

watch([() => props.data, tokens], () => {
  nextTick(() => {
    renderTypeChart(typeChartOption.value);
    renderLevelChart(levelChartOption.value);
  });
}, { deep: true });

onMounted(() => {
  nextTick(() => {
    renderTypeChart(typeChartOption.value);
    renderLevelChart(levelChartOption.value);
  });
});
</script>

<style lang="less" scoped>
.accident-classification {
  .chart-panel {
    position: relative;
    min-height: 272px;
  }

  .chart-title {
    display: block;
    margin-bottom: 12px;
  }

  .chart-empty {
    position: absolute;
    inset: 52px 0 0;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0;
  }
}
</style>
