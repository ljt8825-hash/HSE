<template>
  <div class="department-ranking">
    <Card :bordered="false" class="ranking-tabs">
      <a-tabs v-model:activeKey="activeTab" @change="handleTabChange">
        <a-tab-pane key="safety" tab="安全排名">
          <a-table :columns="safetyColumns" :data-source="filteredData" :pagination="false" row-key="deptId">
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'rank'">
                <span :class="getRankClass(record.safetyRank)">{{ record.safetyRank }}</span>
              </template>
              <template v-if="column.key === 'score'">
                <span :class="getScoreClass(record.safetyScore)">{{ record.safetyScore.toFixed(1) }}</span>
              </template>
            </template>
          </a-table>
        </a-tab-pane>
        <a-tab-pane key="risk" tab="风险排名">
          <a-table :columns="riskColumns" :data-source="filteredData" :pagination="false" row-key="deptId">
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'rank'">
                <span :class="getRankClass(record.riskRank)">{{ record.riskRank }}</span>
              </template>
              <template v-if="column.key === 'score'">
                <span :class="getScoreClass(record.riskScore)">{{ record.riskScore.toFixed(1) }}</span>
              </template>
            </template>
          </a-table>
        </a-tab-pane>
        <a-tab-pane key="accident" tab="事故排名">
          <a-table :columns="accidentColumns" :data-source="filteredData" :pagination="false" row-key="deptId">
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'rank'">
                <span :class="getRankClass(record.accidentRank)">{{ record.accidentRank }}</span>
              </template>
              <template v-if="column.key === 'score'">
                <span :class="getScoreClass(record.accidentScore)">{{ record.accidentScore.toFixed(1) }}</span>
              </template>
            </template>
          </a-table>
        </a-tab-pane>
        <a-tab-pane key="rectification" tab="整改排名">
          <a-table :columns="rectificationColumns" :data-source="filteredData" :pagination="false" row-key="deptId">
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'rank'">
                <span :class="getRankClass(record.rectificationRank)">{{ record.rectificationRank }}</span>
              </template>
              <template v-if="column.key === 'score'">
                <span :class="getScoreClass(record.rectificationScore)">{{ record.rectificationScore.toFixed(1) }}</span>
              </template>
            </template>
          </a-table>
        </a-tab-pane>
        <a-tab-pane key="management" tab="管理排名">
          <a-table :columns="managementColumns" :data-source="filteredData" :pagination="false" row-key="deptId">
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'rank'">
                <span :class="getRankClass(record.managementRank)">{{ record.managementRank }}</span>
              </template>
              <template v-if="column.key === 'score'">
                <span :class="getScoreClass(record.managementScore)">{{ record.managementScore.toFixed(1) }}</span>
              </template>
            </template>
          </a-table>
        </a-tab-pane>
        <a-tab-pane key="overall" tab="综合排名">
          <a-table :columns="overallColumns" :data-source="filteredData" :pagination="false" row-key="deptId">
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'rank'">
                <span :class="getRankClass(record.safetyRank)">{{ record.safetyRank }}</span>
              </template>
              <template v-if="column.key === 'overallScore'">
                <span :class="getScoreClass(record.overallScore)">{{ record.overallScore.toFixed(1) }}</span>
              </template>
              <template v-if="column.key === 'managementScore'">
                <span :class="getScoreClass(record.managementScore)">{{ record.managementScore.toFixed(1) }}</span>
              </template>
            </template>
          </a-table>
        </a-tab-pane>
      </a-tabs>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { Card } from 'ant-design-vue';
import type { AssessmentAnalysisApi } from '#/api/hse/assessment-analysis';

const props = defineProps<{
  data: AssessmentAnalysisApi.DepartmentRankingData;
}>();

const activeTab = ref('safety');

const filteredData = computed(() => {
  return props.data.rankings;
});

function handleTabChange(key: string) {
  activeTab.value = key;
}

function getRankClass(rank: number): string {
  if (rank === 1) return 'rank-gold';
  if (rank === 2) return 'rank-silver';
  if (rank === 3) return 'rank-bronze';
  return 'rank-normal';
}

function getScoreClass(score: number): string {
  if (score >= 90) return 'score-excellent';
  if (score >= 80) return 'score-good';
  if (score >= 60) return 'score-warning';
  return 'score-danger';
}

const safetyColumns = [
  { key: 'rank', title: '排名', width: 60, align: 'center' },
  { key: 'deptName', title: '部门名称', width: 150 },
  { key: 'unitType', title: '类型', width: 80 },
  { key: 'score', title: '安全得分', width: 100, align: 'center' },
  { key: 'accidentCount', title: '事故起数', width: 80, align: 'center' },
  { key: 'majorAccidentCount', title: '重大事故', width: 80, align: 'center' },
  { key: 'violationCount', title: '三违次数', width: 80, align: 'center' },
  { key: 'seriousViolationCount', title: '严重三违', width: 80, align: 'center' },
];

const riskColumns = [
  { key: 'rank', title: '排名', width: 60, align: 'center' },
  { key: 'deptName', title: '部门名称', width: 150 },
  { key: 'unitType', title: '类型', width: 80 },
  { key: 'score', title: '风险得分', width: 100, align: 'center' },
  { key: 'employeeCount', title: '员工数', width: 80, align: 'center' },
  { key: 'majorRiskCount', title: '重大风险', width: 80, align: 'center' },
  { key: 'highRiskCount', title: '高风险', width: 80, align: 'center' },
  { key: 'avgRiskScore', title: '平均评分', width: 100, align: 'center' },
];

const accidentColumns = [
  { key: 'rank', title: '排名', width: 60, align: 'center' },
  { key: 'deptName', title: '部门名称', width: 150 },
  { key: 'unitType', title: '类型', width: 80 },
  { key: 'score', title: '事故得分', width: 100, align: 'center' },
  { key: 'accidentCount', title: '事故起数', width: 80, align: 'center' },
  { key: 'majorAccidentCount', title: '重大事故', width: 80, align: 'center' },
  { key: 'accidentClosedCount', title: '已结案', width: 80, align: 'center' },
];

const rectificationColumns = [
  { key: 'rank', title: '排名', width: 60, align: 'center' },
  { key: 'deptName', title: '部门名称', width: 150 },
  { key: 'unitType', title: '类型', width: 80 },
  { key: 'score', title: '整改得分', width: 100, align: 'center' },
  { key: 'taskCount', title: '整改任务', width: 80, align: 'center' },
  { key: 'completedTaskCount', title: '已完成', width: 80, align: 'center' },
  { key: 'overdueTaskCount', title: '逾期', width: 80, align: 'center' },
];

const managementColumns = [
  { key: 'rank', title: '排名', width: 60, align: 'center' },
  { key: 'deptName', title: '部门名称', width: 150 },
  { key: 'unitType', title: '类型', width: 80 },
  { key: 'score', title: '管理得分', width: 100, align: 'center' },
  { key: 'gridCompliance', title: '网格合规率', width: 100, align: 'center' },
  { key: 'totalGridChiefCount', title: '总网格长', width: 80, align: 'center' },
  { key: 'level1GridChiefCount', title: '一级网格长', width: 80, align: 'center' },
  { key: 'level2GridChiefCount', title: '二级网格长', width: 80, align: 'center' },
  { key: 'level3GridChiefCount', title: '三级网格长', width: 80, align: 'center' },
  { key: 'inspectionCount', title: '巡查次数', width: 80, align: 'center' },
  { key: 'driverCount', title: '驾驶员', width: 80, align: 'center' },
  { key: 'demeritPointsCurrent', title: '本年扣分', width: 80, align: 'center' },
];

const overallColumns = [
  { key: 'rank', title: '综合排名', width: 80, align: 'center' },
  { key: 'deptName', title: '部门名称', width: 150 },
  { key: 'unitType', title: '类型', width: 80 },
  { key: 'overallScore', title: '综合得分', width: 100, align: 'center' },
  { key: 'safetyScore', title: '安全得分', width: 100, align: 'center' },
  { key: 'riskScore', title: '风险得分', width: 100, align: 'center' },
  { key: 'accidentScore', title: '事故得分', width: 100, align: 'center' },
  { key: 'rectificationScore', title: '整改得分', width: 100, align: 'center' },
  { key: 'managementScore', title: '管理得分', width: 100, align: 'center' },
];
</script>

<style lang="less" scoped>
.department-ranking {
    .ranking-tabs {
    :deep(.ant-tabs-nav) {
      margin-bottom: 16px;
    }

    :deep(.ant-table-thead > tr > th) {
      background: hsl(var(--muted));
      font-weight: 600;
    }

    .rank-gold {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      background: hsl(var(--warning));
      border-radius: 50%;
      color: hsl(var(--warning-foreground));
      font-weight: 700;
      font-size: 12px;
    }

    .rank-silver {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      background: hsl(var(--muted-foreground));
      border-radius: 50%;
      color: hsl(var(--primary-foreground));
      font-weight: 700;
      font-size: 12px;
    }

    .rank-bronze {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      background: hsl(var(--warning) / 0.75);
      border-radius: 50%;
      color: hsl(var(--warning-foreground));
      font-weight: 700;
      font-size: 12px;
    }

    .rank-normal {
      color: hsl(var(--muted-foreground));
      font-size: 14px;
    }

    .score-excellent { color: hsl(var(--success)); font-weight: 600; }
    .score-good { color: hsl(var(--primary)); font-weight: 600; }
    .score-warning { color: hsl(var(--warning)); font-weight: 600; }
    .score-danger { color: hsl(var(--error)); font-weight: 600; }
  }
}
</style>

<!-- 设计系统对齐：保留 :deep(.ant-tabs-nav{margin-bottom}) 与 :deep(.ant-table-thead>tr>th{background:hsl(var(--muted))}) —— 表头背景已用语义变量，主题可跟随；间距为布局调整 -->

