<script lang="ts" setup>
/**
 * 考核总览（web-naive）
 * 从 web-antd 1:1 移植：Statistic + Tag → HseStatCard / NStatistic / NTag；
 * ECharts 趋势图用 LOCAL tokens 常量 + useEcharts(render) 模式。
 */
import type { AssessmentAnalysisApi } from '#/api/hse/assessment-analysis';
import type { ECOption, EchartsUIType } from '@vben/plugins/echarts';
import { EchartsUI, useEcharts } from '@vben/plugins/echarts';
import { computed, onMounted, ref, watch } from 'vue';

import { NCard, NStatistic, NTag } from 'naive-ui';
import { HseStatCard } from '#/components/hse';

defineOptions({ name: 'AssessmentOverview' });

const props = defineProps<{
  data: AssessmentAnalysisApi.OverviewData;
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

const trendRef = ref<EchartsUIType>();
const { renderEcharts: renderTrend, resize: resizeTrend } = useEcharts(trendRef);

function getRateTagType(rate: number): 'success' | 'info' | 'warning' | 'error' {
  if (rate >= 95) return 'success';
  if (rate >= 80) return 'info';
  if (rate >= 60) return 'warning';
  return 'error';
}

function formatMoney(value: number): string {
  if (value >= 10000) {
    return `${(value / 10000).toFixed(2)} 万`;
  }
  return value.toFixed(2);
}

const trendOption = computed<ECOption>(() => {
  const years = props.data.trend.map((t) => t.year);
  const accidentCounts = props.data.trend.map((t) => t.accidentCount);
  const weightedIndices = props.data.trend.map((t) => t.weightedIndex);
  const totalLoss = props.data.trend.map((t) => t.totalLoss);

  return {
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
      },
    },
    legend: {
      data: ['事故起数', '事故指数', '经济损失'],
      top: 0,
      textStyle: { color: tokens.colorTextBase },
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
      data: years,
      axisLine: { lineStyle: { color: tokens.colorBorder } },
      axisLabel: { formatter: '{value}年' },
    },
    yAxis: [
      {
        type: 'value',
        name: '数量',
        position: 'left',
        axisLabel: { color: tokens.colorTextBase },
        splitLine: { lineStyle: { color: tokens.colorBorder, type: 'dashed' } },
      },
      {
        type: 'value',
        name: '经济损失(元)',
        position: 'right',
        axisLabel: { color: tokens.colorTextBase },
        splitLine: { lineStyle: { color: tokens.colorBorder, type: 'dashed' } },
      },
    ],
    series: [
      {
        name: '事故起数',
        type: 'bar',
        data: accidentCounts,
        itemStyle: { color: tokens.colorError },
      },
      {
        name: '事故指数',
        type: 'line',
        data: weightedIndices,
        itemStyle: { color: tokens.colorPrimary },
        smooth: true,
        lineStyle: { width: 3 },
      },
      {
        name: '经济损失',
        type: 'line',
        yAxisIndex: 1,
        data: totalLoss,
        itemStyle: { color: tokens.colorWarning },
        smooth: true,
      },
    ],
  };
});

onMounted(() => {
  renderTrend(trendOption.value);
  window.addEventListener('resize', resizeTrend);
});

watch(
  () => props.data,
  () => {
    if (trendRef.value) renderTrend(trendOption.value);
  },
  { deep: true },
);
</script>

<template>
  <div class="assessment-overview">
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div>
        <HseStatCard
          title="事故起数"
          :value="data.actual.accidentCount"
          suffix="起"
          icon="lucide:alert-circle"
          color="red"
        />
        <div class="metric-target">目标：{{ data.targets.accidentCount }} 起</div>
        <NTag :type="getRateTagType(data.completionRates.accidentTargetRate)" size="small" :bordered="false">
          完成率 {{ Math.round(data.completionRates.accidentTargetRate) }}%
        </NTag>
      </div>
      <div>
        <HseStatCard
          title="三违次数"
          :value="data.actual.violationCount"
          suffix="次"
          icon="lucide:alert-triangle"
          color="orange"
        />
        <div class="metric-target">目标：{{ data.targets.violationCount }} 次</div>
        <NTag :type="getRateTagType(data.completionRates.violationTargetRate)" size="small" :bordered="false">
          完成率 {{ Math.round(data.completionRates.violationTargetRate) }}%
        </NTag>
      </div>
      <div>
        <HseStatCard
          title="培训完成率"
          :value="Math.round(data.completionRates.trainingCompletionRate)"
          suffix="%"
          icon="lucide:graduation-cap"
          color="green"
        />
        <div class="metric-target">目标：{{ data.targets.trainingCompletionRate }}%</div>
        <NTag :type="getRateTagType(data.completionRates.trainingCompletionRate)" size="small" :bordered="false">
          {{ data.actual.trainingQualifiedCount }}/{{ data.actual.trainingCount }} 人合格
        </NTag>
      </div>
      <div>
        <HseStatCard
          title="隐患整改率"
          :value="Math.round(data.completionRates.rectificationRate)"
          suffix="%"
          icon="lucide:check-circle"
          color="blue"
        />
        <div class="metric-target">目标：{{ data.targets.rectificationRate }}%</div>
        <NTag :type="getRateTagType(data.completionRates.rectificationRate)" size="small" :bordered="false">
          {{ data.actual.hazardCompletedCount }}/{{ data.actual.hazardCount }} 项完成
        </NTag>
      </div>
    </div>

    <NCard :bordered="false" class="mb-4">
      <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <NStatistic label="重大事故" :value="data.actual.majorAccidentCount" />
        <NStatistic label="事故指数" :value="data.actual.accidentWeightedIndex" />
        <NStatistic label="死亡人数" :value="data.actual.accidentCasualties" />
        <NStatistic label="受伤人数" :value="data.actual.accidentInjuries" />
        <NStatistic label="经济损失" :value="formatMoney(data.actual.accidentLoss)" />
        <NStatistic label="严重三违" :value="data.actual.violationSeriousCount" />
        <NStatistic label="逾期整改" :value="data.actual.hazardOverdueCount" />
        <NStatistic label="扣分驾驶员" :value="data.actual.demeritDriverCount" />
        <NStatistic label="本年扣分" :value="data.actual.currentYearDemeritPoints" />
        <NStatistic label="扣分率" :value="`${data.actual.demeritRate}%`" />
        <NStatistic label="网格巡查合规率" :value="`${data.actual.gridInspectionCompliance}%`" />
        <NStatistic label="平均风险评分" :value="Math.round(data.actual.riskAvgScore)" />
      </div>
    </NCard>

    <NCard :bordered="false" class="mb-4">
      <template #header>年度事故趋势（近5年）</template>
      <EchartsUI ref="trendRef" style="width: 100%; height: 280px" />
    </NCard>

    <NCard v-if="data.actual.gridChiefStats && data.actual.gridChiefStats.length > 0" :bordered="false">
      <template #header>网格长巡查统计</template>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <NCard
          v-for="stat in data.actual.gridChiefStats"
          :key="stat.gridLevel"
          size="small"
          :bordered="false"
        >
          <NStatistic label="网格长" :value="`${stat.chiefCount} 人`" />
          <NStatistic label="巡查" :value="`${stat.inspectionCount} 次`" />
        </NCard>
      </div>
    </NCard>
  </div>
</template>

<style scoped>
.metric-target {
  margin: 8px 0;
  color: hsl(var(--muted-foreground));
  font-size: 12px;
}
</style>
