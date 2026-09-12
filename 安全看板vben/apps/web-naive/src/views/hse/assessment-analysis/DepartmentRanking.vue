<script lang="ts" setup>
/**
 * 部门排名（web-naive）
 * 从 web-antd 1:1 移植：Card + Tabs + Table → NCard + NTabs + NDataTable(render)。
 * NDataTable 不支持 #bodyCell 插槽的类型安全，排名徽标/得分着色全部用 render 函数实现。
 */
import type { AssessmentAnalysisApi } from '#/api/hse/assessment-analysis';
import type { DataTableColumns } from 'naive-ui';

import { computed, h, ref } from 'vue';

import { NCard, NDataTable, NTabPane, NTabs } from 'naive-ui';

defineOptions({ name: 'DepartmentRanking' });

type RankingItem = AssessmentAnalysisApi.DepartmentRankingItem;

const props = defineProps<{
  data: AssessmentAnalysisApi.DepartmentRankingData;
}>();

const activeTab = ref('safety');

const filteredData = computed(() => props.data.rankings);

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

function renderRank(rank: number) {
  return h('span', { class: getRankClass(rank) }, String(rank));
}

function renderScore(score: number) {
  return h('span', { class: getScoreClass(score) }, score.toFixed(1));
}

const safetyColumns: DataTableColumns<RankingItem> = [
  { title: '排名', key: 'rank', width: 60, align: 'center', render: (row) => renderRank(row.safetyRank) },
  { title: '部门名称', key: 'deptName', width: 150 },
  { title: '类型', key: 'unitType', width: 80 },
  { title: '安全得分', key: 'score', width: 100, align: 'center', render: (row) => renderScore(row.safetyScore) },
  { title: '事故起数', key: 'accidentCount', width: 80, align: 'center' },
  { title: '重大事故', key: 'majorAccidentCount', width: 80, align: 'center' },
  { title: '三违次数', key: 'violationCount', width: 80, align: 'center' },
  { title: '严重三违', key: 'seriousViolationCount', width: 80, align: 'center' },
];

const riskColumns: DataTableColumns<RankingItem> = [
  { title: '排名', key: 'rank', width: 60, align: 'center', render: (row) => renderRank(row.riskRank) },
  { title: '部门名称', key: 'deptName', width: 150 },
  { title: '类型', key: 'unitType', width: 80 },
  { title: '风险得分', key: 'score', width: 100, align: 'center', render: (row) => renderScore(row.riskScore) },
  { title: '员工数', key: 'employeeCount', width: 80, align: 'center' },
  { title: '重大风险', key: 'majorRiskCount', width: 80, align: 'center' },
  { title: '高风险', key: 'highRiskCount', width: 80, align: 'center' },
  { title: '平均评分', key: 'avgRiskScore', width: 100, align: 'center' },
];

const accidentColumns: DataTableColumns<RankingItem> = [
  { title: '排名', key: 'rank', width: 60, align: 'center', render: (row) => renderRank(row.accidentRank) },
  { title: '部门名称', key: 'deptName', width: 150 },
  { title: '类型', key: 'unitType', width: 80 },
  { title: '事故得分', key: 'score', width: 100, align: 'center', render: (row) => renderScore(row.accidentScore) },
  { title: '事故起数', key: 'accidentCount', width: 80, align: 'center' },
  { title: '重大事故', key: 'majorAccidentCount', width: 80, align: 'center' },
  { title: '已结案', key: 'accidentClosedCount', width: 80, align: 'center' },
];

const rectificationColumns: DataTableColumns<RankingItem> = [
  { title: '排名', key: 'rank', width: 60, align: 'center', render: (row) => renderRank(row.rectificationRank) },
  { title: '部门名称', key: 'deptName', width: 150 },
  { title: '类型', key: 'unitType', width: 80 },
  { title: '整改得分', key: 'score', width: 100, align: 'center', render: (row) => renderScore(row.rectificationScore) },
  { title: '整改任务', key: 'taskCount', width: 80, align: 'center' },
  { title: '已完成', key: 'completedTaskCount', width: 80, align: 'center' },
  { title: '逾期', key: 'overdueTaskCount', width: 80, align: 'center' },
];

const managementColumns: DataTableColumns<RankingItem> = [
  { title: '排名', key: 'rank', width: 60, align: 'center', render: (row) => renderRank(row.managementRank) },
  { title: '部门名称', key: 'deptName', width: 150 },
  { title: '类型', key: 'unitType', width: 80 },
  { title: '管理得分', key: 'score', width: 100, align: 'center', render: (row) => renderScore(row.managementScore) },
  { title: '网格合规率', key: 'gridCompliance', width: 100, align: 'center' },
  { title: '总网格长', key: 'totalGridChiefCount', width: 80, align: 'center' },
  { title: '一级网格长', key: 'level1GridChiefCount', width: 80, align: 'center' },
  { title: '二级网格长', key: 'level2GridChiefCount', width: 80, align: 'center' },
  { title: '三级网格长', key: 'level3GridChiefCount', width: 80, align: 'center' },
  { title: '巡查次数', key: 'inspectionCount', width: 80, align: 'center' },
  { title: '驾驶员', key: 'driverCount', width: 80, align: 'center' },
  { title: '本年扣分', key: 'demeritPointsCurrent', width: 80, align: 'center' },
];

const overallColumns: DataTableColumns<RankingItem> = [
  { title: '综合排名', key: 'rank', width: 80, align: 'center', render: (row) => renderRank(row.safetyRank) },
  { title: '部门名称', key: 'deptName', width: 150 },
  { title: '类型', key: 'unitType', width: 80 },
  { title: '综合得分', key: 'overallScore', width: 100, align: 'center', render: (row) => renderScore(row.overallScore) },
  { title: '安全得分', key: 'safetyScore', width: 100, align: 'center' },
  { title: '风险得分', key: 'riskScore', width: 100, align: 'center' },
  { title: '事故得分', key: 'accidentScore', width: 100, align: 'center' },
  { title: '整改得分', key: 'rectificationScore', width: 100, align: 'center' },
  { title: '管理得分', key: 'managementScore', width: 100, align: 'center', render: (row) => renderScore(row.managementScore) },
];

const rowKey = (row: RankingItem) => row.deptId;
</script>

<template>
  <div class="department-ranking">
    <NCard :bordered="false" class="ranking-tabs">
      <NTabs v-model:value="activeTab" type="line">
        <NTabPane name="safety" tab="安全排名">
          <NDataTable
            :columns="safetyColumns"
            :data="filteredData"
            :row-key="rowKey"
            :pagination="false"
            size="small"
            :scroll-x="700"
          />
        </NTabPane>
        <NTabPane name="risk" tab="风险排名">
          <NDataTable
            :columns="riskColumns"
            :data="filteredData"
            :row-key="rowKey"
            :pagination="false"
            size="small"
            :scroll-x="700"
          />
        </NTabPane>
        <NTabPane name="accident" tab="事故排名">
          <NDataTable
            :columns="accidentColumns"
            :data="filteredData"
            :row-key="rowKey"
            :pagination="false"
            size="small"
            :scroll-x="650"
          />
        </NTabPane>
        <NTabPane name="rectification" tab="整改排名">
          <NDataTable
            :columns="rectificationColumns"
            :data="filteredData"
            :row-key="rowKey"
            :pagination="false"
            size="small"
            :scroll-x="650"
          />
        </NTabPane>
        <NTabPane name="management" tab="管理排名">
          <NDataTable
            :columns="managementColumns"
            :data="filteredData"
            :row-key="rowKey"
            :pagination="false"
            size="small"
            :scroll-x="1000"
          />
        </NTabPane>
        <NTabPane name="overall" tab="综合排名">
          <NDataTable
            :columns="overallColumns"
            :data="filteredData"
            :row-key="rowKey"
            :pagination="false"
            size="small"
            :scroll-x="900"
          />
        </NTabPane>
      </NTabs>
    </NCard>
  </div>
</template>

<style scoped>
.department-ranking :deep(.rank-gold),
.department-ranking :deep(.rank-silver),
.department-ranking :deep(.rank-bronze) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  font-weight: 700;
  font-size: 12px;
  color: #fff;
}

.department-ranking :deep(.rank-gold) {
  background: hsl(var(--warning));
}

.department-ranking :deep(.rank-silver) {
  background: hsl(var(--muted-foreground));
}

.department-ranking :deep(.rank-bronze) {
  background: hsl(var(--warning) / 0.75);
}

.department-ranking :deep(.rank-normal) {
  color: hsl(var(--muted-foreground));
  font-size: 14px;
}

.department-ranking :deep(.score-excellent) {
  color: #52c41a;
  font-weight: 600;
}

.department-ranking :deep(.score-good) {
  color: #1890ff;
  font-weight: 600;
}

.department-ranking :deep(.score-warning) {
  color: #faad14;
  font-weight: 600;
}

.department-ranking :deep(.score-danger) {
  color: #f5222d;
  font-weight: 600;
}
</style>
