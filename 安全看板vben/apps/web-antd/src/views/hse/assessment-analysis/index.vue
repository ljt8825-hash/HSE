<template>
  <Page auto-content-height class="hse-page">
    <template #title>公司HSE考核分析中心</template>
    <template #description>{{ currentYear }}年度考核数据总览</template>
    <template #extra>
      <div class="page-actions">
        <Space :size="8">
          <HelpButton menuCode="HSE_ASSESSMENT_LIST" />
          <a-select v-model:value="selectedDept" style="width: 160px" placeholder="选择部门">
            <a-select-option value="all">全公司</a-select-option>
            <a-select-option v-for="dept in departmentOptions" :key="dept.value" :value="dept.value">{{ dept.label }}</a-select-option>
          </a-select>
          <a-select v-model:value="selectedPeriod" style="width: 140px" placeholder="选择周期">
            <a-select-option value="year">年度</a-select-option>
            <a-select-option value="quarter">季度</a-select-option>
            <a-select-option value="month">月度</a-select-option>
          </a-select>
          <a-button type="primary">
            <IconifyIcon icon="lucide:download" :size="16" />
            导出报告
          </a-button>
        </Space>
      </div>
    </template>

    <a-tabs v-model:activeKey="activeTab" class="main-tabs">
      <a-tab-pane key="overview" tab="考核总览">
        <AssessmentOverview v-if="overviewData" :data="overviewData" />
      </a-tab-pane>
      <a-tab-pane key="ranking" tab="组织排名">
        <Card v-if="rankingData" :bordered="false" class="ranking-container">
          <div class="ranking-level-selector">
            <a-radio-group v-model:value="rankingLevel" button-style="solid" @change="fetchRanking">
              <a-radio-button value="department">部门</a-radio-button>
              <a-radio-button value="center">环卫作业中心</a-radio-button>
              <a-radio-button value="township">乡镇作业中心</a-radio-button>
              <a-radio-button value="area">片区</a-radio-button>
            </a-radio-group>
          </div>
          <a-table
            :columns="rankingColumns"
            :data-source="rankingData.rankings"
            :pagination="false"
            row-key="orgId"
            size="middle"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'overallRank'">
                <span :class="getRankClass(record.overallRank)">{{ record.overallRank }}</span>
              </template>
              <template v-if="column.key === 'overallScore'">
                <span :class="getScoreClass(record.overallScore)">{{ record.overallScore }}</span>
              </template>
              <template v-if="column.key === 'topDeductions'">
                <a-tag v-for="ded in record.topDeductions.slice(0, 3)" :key="ded.category" color="orange">
                  {{ ded.category }}: -{{ ded.deductionPoints }}分
                </a-tag>
              </template>
            </template>
          </a-table>
        </Card>
        <div v-else class="loading-placeholder">
          <a-spin />
        </div>
      </a-tab-pane>
      <a-tab-pane key="indicator" tab="指标分析">
        <IndicatorAnalysis v-if="indicatorData" :data="indicatorData" />
      </a-tab-pane>
      <a-tab-pane key="targets" tab="目标责任书">
        <TargetProgress v-if="targetProgressData" :data="targetProgressData" />
      </a-tab-pane>
      <a-tab-pane key="deduction" tab="扣分原因分析">
        <DeductionDetail />
      </a-tab-pane>
    </a-tabs>
  </Page>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';
import { Card, Space } from 'ant-design-vue';
import { HelpButton } from '#/components/hse';
import AssessmentOverview from './AssessmentOverview.vue';
import IndicatorAnalysis from './IndicatorAnalysis.vue';
import TargetProgress from './TargetProgress.vue';
import DeductionDetail from './DeductionDetail.vue';
import {
  getAssessmentRanking,
  getIndicatorAnalysis,
  getTargetProgress,
} from '#/api/hse/assessment';
import type { AssessmentApi } from '#/api/hse/assessment';
import { getAssessmentOverview as getOverviewLegacy } from '#/api/hse/assessment-analysis';
import type { AssessmentAnalysisApi } from '#/api/hse/assessment-analysis';

const currentYear = new Date().getFullYear();
const activeTab = ref('overview');
const selectedDept = ref('all');
const selectedPeriod = ref('year');
const rankingLevel = ref('department');

const overviewData = ref<AssessmentAnalysisApi.OverviewData | null>(null);
const rankingData = ref<AssessmentApi.RankingData | null>(null);
const indicatorData = ref<AssessmentApi.IndicatorAnalysisData | null>(null);
const targetProgressData = ref<AssessmentApi.TargetProgressData | null>(null);

const rankingColumns = [
  { key: 'overallRank', title: '排名', width: 60, align: 'center' },
  { key: 'orgName', title: '组织名称', width: 150 },
  { key: 'orgType', title: '类型', width: 100 },
  { key: 'overallScore', title: '综合得分', width: 100, align: 'center' },
  { key: 'topDeductions', title: '主要扣分项', width: 300 },
  { key: 'accidentCount', title: '事故数', width: 70, align: 'center' },
  { key: 'violationCount', title: '三违数', width: 70, align: 'center' },
  { key: 'employeeCount', title: '员工数', width: 70, align: 'center' },
];

const departmentOptions = [
  { value: 'dept-1', label: '第一分公司' },
  { value: 'dept-2', label: '第二分公司' },
  { value: 'dept-3', label: '第三分公司' },
  { value: 'dept-4', label: '第四分公司' },
  { value: 'dept-5', label: '第五分公司' },
];

function getRankClass(rank: number) {
  if (rank === 1) return 'rank-gold';
  if (rank === 2) return 'rank-silver';
  if (rank === 3) return 'rank-bronze';
  return '';
}

function getScoreClass(score: number) {
  if (score >= 90) return 'score-excellent';
  if (score >= 80) return 'score-good';
  if (score >= 70) return 'score-warning';
  return 'score-danger';
}

async function fetchData() {
  try {
    const [overviewDataRes, rankingDataRes, indicatorDataRes, targetProgressRes] = await Promise.all([
      getOverviewLegacy(),
      getAssessmentRanking(rankingLevel.value),
      getIndicatorAnalysis(),
      getTargetProgress(),
    ]);

    overviewData.value = overviewDataRes;
    rankingData.value = rankingDataRes;
    indicatorData.value = indicatorDataRes;
    targetProgressData.value = targetProgressRes;
  } catch (e) {
    console.error('Fetch assessment data error:', e);
  }
}

async function fetchRanking() {
  try {
    const res = await getAssessmentRanking(rankingLevel.value);
    rankingData.value = res;
  } catch (e) {
    console.error('Fetch ranking error:', e);
  }
}

onMounted(() => {
  fetchData();
});
</script>

<style lang="less" scoped>
.assessment-analysis-center {
  .page-actions {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .main-tabs {
    :deep(.ant-tabs-nav) {
      margin-bottom: 0;
    }

    :deep(.ant-tabs-tab) {
      padding: 12px 20px;
      font-size: 14px;
      font-weight: 500;
    }

    :deep(.ant-tabs-tab-active) {
      .ant-tabs-tab-btn {
        font-weight: 600;
      }
    }

    :deep(.ant-tabs-content) {
      padding-top: 16px;
    }

    :deep(.ant-tabs-tabpane) {
      min-height: 300px;
    }
  }

  .ranking-container {
    .ranking-level-selector {
      margin-bottom: 16px;
    }
  }

  .loading-placeholder {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 300px;
  }

  .rank-gold {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    background: hsl(var(--warning));
    border-radius: 50%;
    color: hsl(var(--warning-foreground));
    font-weight: 700;
    font-size: 13px;
  }

  .rank-silver {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    background: hsl(var(--muted-foreground));
    border-radius: 50%;
    color: hsl(var(--primary-foreground));
    font-weight: 700;
    font-size: 13px;
  }

  .rank-bronze {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    background: hsl(var(--warning) / 0.75);
    border-radius: 50%;
    color: hsl(var(--warning-foreground));
    font-weight: 700;
    font-size: 13px;
  }

  .score-excellent { color: hsl(var(--success)); font-weight: 700; }
  .score-good { color: hsl(var(--primary)); font-weight: 600; }
  .score-warning { color: hsl(var(--warning)); font-weight: 600; }
  .score-danger { color: hsl(var(--error)); font-weight: 700; }
}
</style>

<!-- 设计系统对齐：保留 5 处 :deep(.ant-tabs-*) —— 均为 Tab 间距/内边距/字重布局调整，主题无关，不影响主题色切换 -->

