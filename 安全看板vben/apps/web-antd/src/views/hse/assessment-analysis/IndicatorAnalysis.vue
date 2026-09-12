<template>
  <div class="indicator-analysis">
    <a-tabs v-model:activeKey="activeCategory" class="indicator-tabs">
      <a-tab-pane v-for="cat in data.categories" :key="cat.categoryKey" :tab="cat.category">
        <div class="indicator-content">
          <Card :bordered="false" class="indicator-table-section">
            <a-table
              :columns="columns"
              :data-source="cat.indicators"
              :pagination="false"
              row-key="name"
              size="middle"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'value'">
                  <span class="indicator-value">{{ record.value }}{{ record.unit || '' }}</span>
                </template>
                <template v-if="column.key === 'target'">
                  <span class="indicator-target">{{ record.target }}{{ record.unit || '' }}</span>
                </template>
                <template v-if="column.key === 'score'">
                  <span :style="{ color: getScoreColor(record.score), fontWeight: 600 }">{{ record.score }}</span>
                </template>
                <template v-if="column.key === 'status'">
                  <a-tag :color="getStatusColor(record.status)">{{ getStatusText(record.status) }}</a-tag>
                </template>
              </template>
            </a-table>
          </Card>
          <Card :title="`${cat.category}分布`" :bordered="false" class="indicator-chart-section">
            <EchartsUI
              v-if="activeCategory === cat.categoryKey"
              ref="chartRef"
              style="width: 100%; height: 300px"
            />
          </Card>
        </div>
      </a-tab-pane>
    </a-tabs>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, watch, nextTick } from 'vue';
import type { ECOption, EchartsUIType } from '@vben/plugins/echarts';
import { EchartsUI, useEcharts } from '@vben/plugins/echarts';
import { useAntdDesignTokens } from '@vben/hooks';
import { Card } from 'ant-design-vue';
import type { AssessmentApi } from '#/api/hse/assessment';

const props = defineProps<{
  data: AssessmentApi.IndicatorAnalysisData;
}>();

const activeCategory = ref(props.data.categories[0]?.categoryKey || 'accident');
const chartRef = ref<EchartsUIType>();
const { tokens } = useAntdDesignTokens();
const { renderEcharts } = useEcharts(chartRef);

const columns = [
  { key: 'name', title: '指标名称', width: 180 },
  { key: 'value', title: '当前值', width: 100, align: 'center' },
  { key: 'target', title: '目标值', width: 100, align: 'center' },
  { key: 'score', title: '得分', width: 80, align: 'center' },
  { key: 'status', title: '状态', width: 100, align: 'center' },
];

const chartOption = computed<ECOption>(() => {
  const category = props.data.categories.find(c => c.categoryKey === activeCategory.value);
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
    yAxis: { type: 'value', axisLabel: { color: tokens.colorTextBase }, splitLine: { lineStyle: { color: tokens.colorBorder, type: 'dashed' } } },
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

function getScoreColor(score: number) {
  if (score >= 90) return tokens.colorSuccess;
  if (score >= 80) return tokens.colorPrimary;
  if (score >= 60) return tokens.colorWarning;
  return tokens.colorError;
}

function getStatusColor(status: string) {
  const colors: Record<string, string> = {
    excellent: 'green',
    good: 'blue',
    warning: 'orange',
    danger: 'red',
  };
  return colors[status] || 'default';
}

function getStatusText(status: string) {
  const texts: Record<string, string> = {
    excellent: '优秀',
    good: '良好',
    warning: '预警',
    danger: '危险',
  };
  return texts[status] || status;
}

onMounted(() => {
  nextTick(() => renderEcharts(chartOption.value));
});

watch([chartOption, tokens], () => {
  nextTick(() => renderEcharts(chartOption.value));
}, { deep: true });

watch(activeCategory, () => {
  nextTick(() => renderEcharts(chartOption.value));
});
</script>

<style lang="less" scoped>
.indicator-analysis {
  .indicator-tabs {
    :deep(.ant-tabs-tab) {
      padding: 10px 16px;
      font-size: 14px;
    }
  }

  .indicator-content {
    display: flex;
    gap: 16px;

    .indicator-table-section,
    .indicator-chart-section {
      flex: 1;
      min-width: 0;
    }

    .indicator-chart-section {
      min-width: 0;
    }
  }

  .indicator-value {
    font-weight: 600;
    color: hsl(var(--foreground));
  }

  .indicator-target {
    color: hsl(var(--muted-foreground));
  }

}
</style>

<!-- 设计系统对齐：保留 :deep(.ant-tabs-tab{padding;font-size}) —— Tab 内边距/字号布局调整，主题无关 -->

