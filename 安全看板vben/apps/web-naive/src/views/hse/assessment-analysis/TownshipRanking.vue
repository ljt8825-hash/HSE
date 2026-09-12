<script lang="ts" setup>
/**
 * 乡镇作业中心排名（web-naive）
 * 从 web-antd 1:1 移植：Radio.Group 切换列表/卡片视图；Table → NDataTable(render)，Row/Col → Tailwind Grid。
 */
import type { AssessmentAnalysisApi } from '#/api/hse/assessment-analysis';
import type { DataTableColumns } from 'naive-ui';

import { computed, h, ref } from 'vue';

import { NCard, NDataTable, NRadio, NRadioGroup, NTag } from 'naive-ui';

defineOptions({ name: 'TownshipRanking' });

type TownshipItem = AssessmentAnalysisApi.TownshipRankingItem;
type TagType = 'error' | 'info' | 'success' | 'warning';

const props = defineProps<{
  data: AssessmentAnalysisApi.TownshipRankingData;
}>();

const viewMode = ref('table');

const filteredData = computed(() => props.data.rankings);

function handleViewModeChange(value: string) {
  viewMode.value = value;
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

function getCardClass(score: number): string {
  if (score >= 90) return 'card-excellent';
  if (score >= 80) return 'card-good';
  if (score >= 60) return 'card-warning';
  return 'card-danger';
}

function getRiskLevelType(score: number): TagType {
  if (score >= 70) return 'error';
  if (score >= 50) return 'warning';
  if (score >= 30) return 'info';
  return 'success';
}

function getRiskLevelText(score: number): string {
  if (score >= 70) return '重大风险';
  if (score >= 50) return '高风险';
  if (score >= 30) return '中风险';
  return '低风险';
}

const tableColumns: DataTableColumns<TownshipItem> = [
  {
    title: '排名',
    key: 'rank',
    width: 60,
    align: 'center',
    render: (row) => h('span', { class: getRankClass(row.overallRank) }, String(row.overallRank)),
  },
  { title: '乡镇/片区', key: 'townshipName', width: 150 },
  { title: '类型', key: 'unitType', width: 80 },
  {
    title: '综合得分',
    key: 'overallScore',
    width: 100,
    align: 'center',
    render: (row) => h('span', { class: getScoreClass(row.overallScore) }, row.overallScore.toFixed(1)),
  },
  {
    title: '风险等级',
    key: 'riskLevel',
    width: 100,
    align: 'center',
    render: (row) =>
      h(
        NTag,
        { type: getRiskLevelType(row.avgRiskScore), size: 'small', bordered: false },
        { default: () => getRiskLevelText(row.avgRiskScore) },
      ),
  },
  { title: '事故起数', key: 'accidentCount', width: 80, align: 'center' },
  { title: '三违次数', key: 'violationCount', width: 80, align: 'center' },
  { title: '扣分', key: 'demeritPoints5y', width: 80, align: 'center' },
  { title: '隐患数', key: 'hazardCount', width: 80, align: 'center' },
  { title: '已整改', key: 'resolvedHazardCount', width: 80, align: 'center' },
];

const rowKey = (row: TownshipItem) => row.townshipId;
</script>

<template>
  <div class="township-ranking">
    <NCard :bordered="false" class="ranking-header">
      <NRadioGroup :value="viewMode" @update:value="handleViewModeChange">
        <NRadio value="table">列表视图</NRadio>
        <NRadio value="card">卡片视图</NRadio>
      </NRadioGroup>
    </NCard>

    <NCard v-if="viewMode === 'table'" :bordered="false" class="table-view">
      <NDataTable
        :columns="tableColumns"
        :data="filteredData"
        :row-key="rowKey"
        :pagination="false"
        size="small"
        :scroll-x="900"
      />
    </NCard>

    <div v-else class="card-view">
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <NCard
          v-for="item in filteredData"
          :key="item.townshipId"
          :bordered="false"
          class="township-card"
          :class="getCardClass(item.overallScore)"
        >
          <div class="card-header">
            <span class="card-rank" :class="getRankClass(item.overallRank)">
              {{ item.overallRank }}
            </span>
            <span class="card-name">{{ item.townshipName }}</span>
            <NTag :type="getRiskLevelType(item.avgRiskScore)" size="small" :bordered="false">
              {{ getRiskLevelText(item.avgRiskScore) }}
            </NTag>
          </div>
          <div class="card-score">
            <span class="score-value">{{ item.overallScore.toFixed(1) }}</span>
            <span class="score-label">综合得分</span>
          </div>
          <div class="card-stats">
            <div class="stat-item">
              <span class="stat-value" :class="{ danger: item.accidentCount > 0 }">
                {{ item.accidentCount }}
              </span>
              <span class="stat-label">事故</span>
            </div>
            <div class="stat-item">
              <span class="stat-value" :class="{ warning: item.violationCount > 0 }">
                {{ item.violationCount }}
              </span>
              <span class="stat-label">三违</span>
            </div>
            <div class="stat-item">
              <span class="stat-value">{{ item.demeritPoints5y }}</span>
              <span class="stat-label">扣分</span>
            </div>
            <div class="stat-item">
              <span class="stat-value">
                {{ item.resolvedHazardCount }}/{{ item.hazardCount }}
              </span>
              <span class="stat-label">整改</span>
            </div>
          </div>
        </NCard>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ranking-header {
  margin-bottom: 16px;
}

.table-view :deep(.rank-gold),
.table-view :deep(.rank-silver),
.table-view :deep(.rank-bronze) {
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

.table-view :deep(.rank-gold) {
  background: hsl(var(--warning));
}

.table-view :deep(.rank-silver) {
  background: hsl(var(--muted-foreground));
}

.table-view :deep(.rank-bronze) {
  background: hsl(var(--warning) / 0.75);
}

.table-view :deep(.rank-normal) {
  color: hsl(var(--muted-foreground));
  font-size: 14px;
}

.table-view :deep(.score-excellent) {
  color: #52c41a;
  font-weight: 600;
}

.table-view :deep(.score-good) {
  color: #1890ff;
  font-weight: 600;
}

.table-view :deep(.score-warning) {
  color: #faad14;
  font-weight: 600;
}

.table-view :deep(.score-danger) {
  color: #f5222d;
  font-weight: 600;
}

.township-card {
  height: 100%;
  border-left: 4px solid hsl(var(--border));
  transition: all 0.3s ease;
}

.township-card.card-excellent {
  border-left-color: #52c41a;
}

.township-card.card-good {
  border-left-color: #1890ff;
}

.township-card.card-warning {
  border-left-color: #faad14;
}

.township-card.card-danger {
  border-left-color: #f5222d;
}

.township-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 4px 12px rgb(0 0 0 / 10%);
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.card-rank {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  font-weight: 700;
  font-size: 14px;
  flex-shrink: 0;
}

.card-rank.rank-gold {
  background: hsl(var(--warning));
  color: #fff;
}

.card-rank.rank-silver {
  background: hsl(var(--muted-foreground));
  color: #fff;
}

.card-rank.rank-bronze {
  background: hsl(var(--warning) / 0.75);
  color: #fff;
}

.card-rank.rank-normal {
  background: hsl(var(--border));
  color: hsl(var(--muted-foreground));
}

.card-name {
  flex: 1;
  font-size: 15px;
  font-weight: 600;
  color: hsl(var(--foreground));
}

.card-score {
  text-align: center;
  margin-bottom: 16px;
  padding: 12px;
  background: hsl(var(--muted));
  border-radius: 8px;
}

.score-value {
  display: block;
  font-size: 32px;
  font-weight: 700;
  color: hsl(var(--foreground));
}

.score-label {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.card-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.stat-item {
  text-align: center;
}

.stat-value {
  display: block;
  font-size: 16px;
  font-weight: 600;
  color: hsl(var(--foreground));
}

.stat-value.danger {
  color: #f5222d;
}

.stat-value.warning {
  color: #faad14;
}

.stat-label {
  font-size: 11px;
  color: hsl(var(--muted-foreground));
}
</style>
