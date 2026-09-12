<template>
  <div class="assessment-overview">
    <Row :gutter="[16, 16]" class="mb-4">
      <Col :xs="24" :sm="12" :lg="6">
        <Card :bordered="false">
          <Statistic title="事故起数" :value="data.actual.accidentCount" suffix="起" :value-style="{ color: 'hsl(var(--error))' }">
            <template #prefix><IconifyIcon icon="lucide:alert-circle" /></template>
          </Statistic>
          <div class="metric-target">目标：{{ data.targets.accidentCount }} 起</div>
          <Tag :color="getRateTagColor(data.completionRates.accidentTargetRate)">完成率 {{ Math.round(data.completionRates.accidentTargetRate) }}%</Tag>
        </Card>
      </Col>
      <Col :xs="24" :sm="12" :lg="6">
        <Card :bordered="false">
          <Statistic title="三违次数" :value="data.actual.violationCount" suffix="次" :value-style="{ color: data.actual.violationCount > data.targets.violationCount ? 'hsl(var(--warning))' : undefined }">
            <template #prefix><IconifyIcon icon="lucide:alert-triangle" /></template>
          </Statistic>
          <div class="metric-target">目标：{{ data.targets.violationCount }} 次</div>
          <Tag :color="getRateTagColor(data.completionRates.violationTargetRate)">完成率 {{ Math.round(data.completionRates.violationTargetRate) }}%</Tag>
        </Card>
      </Col>
      <Col :xs="24" :sm="12" :lg="6">
        <Card :bordered="false">
          <Statistic title="培训完成率" :value="Math.round(data.completionRates.trainingCompletionRate)" suffix="%" :value-style="{ color: 'hsl(var(--success))' }">
            <template #prefix><IconifyIcon icon="lucide:graduation-cap" /></template>
          </Statistic>
          <div class="metric-target">目标：{{ data.targets.trainingCompletionRate }}%</div>
          <Tag :color="getRateTagColor(data.completionRates.trainingCompletionRate)">{{ data.actual.trainingQualifiedCount }}/{{ data.actual.trainingCount }} 人合格</Tag>
        </Card>
      </Col>
      <Col :xs="24" :sm="12" :lg="6">
        <Card :bordered="false">
          <Statistic title="隐患整改率" :value="Math.round(data.completionRates.rectificationRate)" suffix="%" :value-style="{ color: 'hsl(var(--primary))' }">
            <template #prefix><IconifyIcon icon="lucide:check-circle" /></template>
          </Statistic>
          <div class="metric-target">目标：{{ data.targets.rectificationRate }}%</div>
          <Tag :color="getRateTagColor(data.completionRates.rectificationRate)">{{ data.actual.hazardCompletedCount }}/{{ data.actual.hazardCount }} 项完成</Tag>
        </Card>
      </Col>
    </Row>

    <Card :bordered="false" class="mb-4">
      <Row :gutter="[16, 16]">
        <Col :xs="12" :sm="8" :md="6" :lg="2"><Statistic title="重大事故" :value="data.actual.majorAccidentCount" /></Col>
        <Col :xs="12" :sm="8" :md="6" :lg="2"><Statistic title="事故指数" :value="data.actual.accidentWeightedIndex" /></Col>
        <Col :xs="12" :sm="8" :md="6" :lg="2"><Statistic title="死亡人数" :value="data.actual.accidentCasualties" /></Col>
        <Col :xs="12" :sm="8" :md="6" :lg="2"><Statistic title="受伤人数" :value="data.actual.accidentInjuries" /></Col>
        <Col :xs="12" :sm="8" :md="6" :lg="2"><Statistic title="经济损失" :value="formatMoney(data.actual.accidentLoss)" /></Col>
        <Col :xs="12" :sm="8" :md="6" :lg="2"><Statistic title="严重三违" :value="data.actual.violationSeriousCount" /></Col>
        <Col :xs="12" :sm="8" :md="6" :lg="2"><Statistic title="逾期整改" :value="data.actual.hazardOverdueCount" /></Col>
        <Col :xs="12" :sm="8" :md="6" :lg="2"><Statistic title="扣分驾驶员" :value="data.actual.demeritDriverCount" /></Col>
        <Col :xs="12" :sm="8" :md="6" :lg="2"><Statistic title="本年扣分" :value="data.actual.currentYearDemeritPoints" /></Col>
        <Col :xs="12" :sm="8" :md="6" :lg="2"><Statistic title="扣分率" :value="data.actual.demeritRate" suffix="%" /></Col>
        <Col :xs="12" :sm="8" :md="6" :lg="2"><Statistic title="网格巡查合规率" :value="data.actual.gridInspectionCompliance" suffix="%" /></Col>
        <Col :xs="12" :sm="8" :md="6" :lg="2"><Statistic title="平均风险评分" :value="Math.round(data.actual.riskAvgScore)" /></Col>
      </Row>
    </Card>

    <Card :bordered="false" class="mb-4">
      <template #title>年度事故趋势（近5年）</template>
      <EchartsUI ref="trendChartRef" style="width: 100%; height: 280px" />
    </Card>

    <Card v-if="data.actual.gridChiefStats && data.actual.gridChiefStats.length > 0" :bordered="false">
      <template #title>网格长巡查统计</template>
      <Row :gutter="[16, 16]">
        <Col v-for="stat in data.actual.gridChiefStats" :key="stat.gridLevel" :xs="24" :sm="12" :lg="6">
          <Card size="small" :bordered="false">
            <Statistic title="网格长" :value="stat.chiefCount" suffix="人" />
            <Statistic title="巡查" :value="stat.inspectionCount" suffix="次" />
          </Card>
        </Col>
      </Row>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { Card, Col, Row, Statistic, Tag } from 'ant-design-vue';
import { useAntdDesignTokens } from '@vben/hooks';
import { IconifyIcon } from '@vben/icons';
import type { EchartsUIType } from '@vben/plugins/echarts';
import { EchartsUI, useEcharts } from '@vben/plugins/echarts';
import type { AssessmentAnalysisApi } from '#/api/hse/assessment-analysis';

const props = defineProps<{
  data: AssessmentAnalysisApi.OverviewData;
}>();

const trendChartRef = ref<EchartsUIType>();
const { renderEcharts } = useEcharts(trendChartRef);
const { tokens } = useAntdDesignTokens();

function getRateTagColor(rate: number): 'green' | 'blue' | 'orange' | 'red' {
  if (rate >= 95) return 'green';
  if (rate >= 80) return 'blue';
  if (rate >= 60) return 'orange';
  return 'red';
}

function formatMoney(value: number): string {
  if (value >= 10000) {
    return `${(value / 10000).toFixed(2)} 万`;
  }
  return `${value.toFixed(2)}`;
}

function initTrendChart() {
  const years = props.data.trend.map(t => t.year);
  const accidentCounts = props.data.trend.map(t => t.accidentCount);
  const weightedIndices = props.data.trend.map(t => t.weightedIndex);

  renderEcharts({
    tooltip: {
      trigger: 'axis',
      backgroundColor: tokens.colorBgElevated,
      textStyle: { color: tokens.colorTextBase },
      formatter: (params: any) => {
        const year = params[0].name;
        let html = `<div style="font-weight: bold; margin-bottom: 8px;">${year}年</div>`;
        params.forEach((item: any) => {
          const unit = item.seriesName === '经济损失' ? ' 元' : item.seriesName === '事故指数' ? ' 分' : ' 起';
          html += `<div style="display: flex; justify-content: space-between; gap: 20px;">
            <span>${item.seriesName}</span>
            <span style="font-weight: bold;">${item.value}${unit}</span>
          </div>`;
        });
        return html;
      }
    },
    legend: {
      data: ['事故起数', '事故指数', '经济损失'],
      top: 0,
      textStyle: { color: tokens.colorTextBase }
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      top: '15%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: years,
      axisLine: { lineStyle: { color: tokens.colorBorder } },
      axisLabel: {
        formatter: '{value}年'
      }
    },
    yAxis: [
      {
        type: 'value',
        name: '数量',
        position: 'left',
        axisLabel: { color: tokens.colorTextBase },
        splitLine: { lineStyle: { color: tokens.colorBorder, type: 'dashed' } }
      },
      {
        type: 'value',
        name: '经济损失(元)',
        position: 'right',
        axisLabel: { color: tokens.colorTextBase },
        splitLine: { lineStyle: { color: tokens.colorBorder, type: 'dashed' } }
      }
    ],
    series: [
      {
        name: '事故起数',
        type: 'bar',
        data: accidentCounts,
        itemStyle: {
          color: tokens.colorError
        }
      },
      {
        name: '事故指数',
        type: 'line',
        data: weightedIndices,
        itemStyle: {
          color: tokens.colorPrimary
        },
        smooth: true,
        lineStyle: {
          width: 3
        }
      },
      {
        name: '经济损失',
        type: 'line',
        yAxisIndex: 1,
        data: props.data.trend.map(t => t.totalLoss),
        itemStyle: {
          color: tokens.colorWarning
        },
        smooth: true
      }
    ]
  });
}

onMounted(() => {
  initTrendChart();
});

watch([() => props.data, tokens], () => {
  initTrendChart();
}, { deep: true });
</script>

<style lang="less" scoped>
.metric-target {
  margin: 8px 0;
  color: hsl(var(--muted-foreground));
  font-size: 12px;
}
</style>
