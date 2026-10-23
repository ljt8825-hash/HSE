<script lang="ts" setup>
/**
 * 公司HSE考核分析中心（web-naive）
 * 从 web-antd 1:1 移植外壳：Page → HsePageLayout；Tabs/Select/Button → NTabs/NSelect/NButton。
 * 数据统一通过 assessment-analysis API 的 5 个端点拉取，分发给各子组件（props 驱动）。
 */
import {
  getAssessmentDeduction,
  getAssessmentGoals,
  getAssessmentOverview,
  getDepartmentRanking,
  getTownshipRanking,
} from '#/api/hse/assessment-analysis';
import type { AssessmentAnalysisApi } from '#/api/hse/assessment-analysis';

import { IconifyIcon } from '@vben/icons';
import { NButton, NSelect, NSpace, NSpin, NTabPane, NTabs } from 'naive-ui';

import { HsePageLayout } from '#/components/hse';
import { onMounted, ref } from 'vue';

import AssessmentOverview from './AssessmentOverview.vue';
import DepartmentRanking from './DepartmentRanking.vue';
import DeductionAnalysis from './DeductionAnalysis.vue';
import DeductionDetail from './DeductionDetail.vue';
import GoalsAssociation from './GoalsAssociation.vue';
import IndicatorAnalysis from './IndicatorAnalysis.vue';
import TargetProgress from './TargetProgress.vue';
import TownshipRanking from './TownshipRanking.vue';
import { message } from '#/adapter/naive';

defineOptions({ name: 'HseAssessmentAnalysis' });

const currentYear = new Date().getFullYear();
const activeTab = ref('overview');
const selectedPeriod = ref('year');
const loading = ref(false);

const overviewData = ref<AssessmentAnalysisApi.OverviewData | null>(null);
const deptData = ref<AssessmentAnalysisApi.DepartmentRankingData | null>(null);
const townshipData = ref<AssessmentAnalysisApi.TownshipRankingData | null>(null);
const goalsData = ref<AssessmentAnalysisApi.GoalsData | null>(null);
const deductionData = ref<AssessmentAnalysisApi.DeductionData | null>(null);

const periodOptions = [
  { label: '年度', value: 'year' },
  { label: '季度', value: 'quarter' },
  { label: '月度', value: 'month' },
];

async function fetchData() {
  loading.value = true;
  try {
    const [overview, dept, township, goals, deduction] = await Promise.all([
      getAssessmentOverview(),
      getDepartmentRanking(),
      getTownshipRanking(),
      getAssessmentGoals(),
      getAssessmentDeduction(),
    ]);
    overviewData.value = overview;
    deptData.value = dept;
    townshipData.value = township;
    goalsData.value = goals;
    deductionData.value = deduction;
  } catch (e) {
    console.error('Fetch assessment-analysis data error:', e);
    message.error('考核分析数据加载失败');
  } finally {
    loading.value = false;
  }
}

function handleExport() {
  message.info('报告导出功能开发中');
}

onMounted(() => {
  fetchData();
});
</script>

<template>
  <HsePageLayout
    :title="$t('page.hse.assessmentAnalysis')"
    :description="`${currentYear}年度考核数据总览`"
  >
    <template #extra>
      <NSpace :size="8">
        <NSelect v-model:value="selectedPeriod" :options="periodOptions" style="width: 120px" />
        <NButton type="primary" @click="handleExport">
          <template #icon><IconifyIcon icon="lucide:download" :size="16" /></template>
          导出报告
        </NButton>
      </NSpace>
    </template>

    <NTabs v-model:value="activeTab" type="line">
      <NTabPane name="overview" tab="考核总览">
        <NSpin v-if="loading && !overviewData" />
        <AssessmentOverview v-else-if="overviewData" :data="overviewData" />
      </NTabPane>
      <NTabPane name="department" tab="部门排名">
        <NSpin v-if="loading && !deptData" />
        <DepartmentRanking v-else-if="deptData" :data="deptData" />
      </NTabPane>
      <NTabPane name="township" tab="乡镇排名">
        <NSpin v-if="loading && !townshipData" />
        <TownshipRanking v-else-if="townshipData" :data="townshipData" />
      </NTabPane>
      <NTabPane name="indicator" tab="指标分析">
        <NSpin v-if="loading && !overviewData" />
        <IndicatorAnalysis v-else-if="overviewData" :data="overviewData" />
      </NTabPane>
      <NTabPane name="goals" tab="目标责任书">
        <NSpin v-if="loading && !goalsData" />
        <GoalsAssociation v-else-if="goalsData" :data="goalsData" />
      </NTabPane>
      <NTabPane name="target" tab="目标完成进度">
        <NSpin v-if="loading && !goalsData" />
        <TargetProgress v-else-if="goalsData" :data="goalsData" />
      </NTabPane>
      <NTabPane name="deduction" tab="扣分原因分析">
        <NSpin v-if="loading && !deductionData" />
        <DeductionAnalysis v-else-if="deductionData" :data="deductionData" />
      </NTabPane>
      <NTabPane name="detail" tab="扣分明细">
        <NSpin v-if="loading && !deductionData" />
        <DeductionDetail v-else-if="deductionData" :data="deductionData" />
      </NTabPane>
    </NTabs>
  </HsePageLayout>
</template>
