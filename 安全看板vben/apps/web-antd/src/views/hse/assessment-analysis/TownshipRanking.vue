<template>
  <div class="township-ranking">
    <Card :bordered="false" class="ranking-header">
      <a-radio-group v-model:value="viewMode" @change="handleViewModeChange">
        <a-radio value="table">列表视图</a-radio>
        <a-radio value="card">卡片视图</a-radio>
      </a-radio-group>
    </Card>

    <Card v-if="viewMode === 'table'" :bordered="false" class="table-view">
      <a-table :columns="tableColumns" :data-source="filteredData" :pagination="false" row-key="townshipId">
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'rank'">
            <span :class="getRankClass(record.overallRank)">{{ record.overallRank }}</span>
          </template>
          <template v-if="column.key === 'overallScore'">
            <span :class="getScoreClass(record.overallScore)">{{ record.overallScore.toFixed(1) }}</span>
          </template>
          <template v-if="column.key === 'riskLevel'">
            <a-tag :color="getRiskLevelColor(record.avgRiskScore)">{{ getRiskLevelText(record.avgRiskScore) }}</a-tag>
          </template>
        </template>
      </a-table>
    </Card>

    <div v-else class="card-view">
      <Row :gutter="[16, 16]" class="card-grid">
        <Col v-for="item in filteredData" :key="item.townshipId" :xs="24" :sm="12" :lg="8">
          <Card :bordered="false" class="township-card" :class="getCardClass(item.overallScore)">
          <div class="card-header">
            <span class="card-rank" :class="getRankClass(item.overallRank)">{{ item.overallRank }}</span>
            <span class="card-name">{{ item.townshipName }}</span>
            <a-tag :color="getRiskLevelColor(item.avgRiskScore)">{{ getRiskLevelText(item.avgRiskScore) }}</a-tag>
          </div>
          <div class="card-score">
            <span class="score-value">{{ item.overallScore.toFixed(1) }}</span>
            <span class="score-label">综合得分</span>
          </div>
          <div class="card-stats">
            <div class="stat-item">
              <span class="stat-value" :class="{ danger: item.accidentCount > 0 }">{{ item.accidentCount }}</span>
              <span class="stat-label">事故</span>
            </div>
            <div class="stat-item">
              <span class="stat-value" :class="{ warning: item.violationCount > 0 }">{{ item.violationCount }}</span>
              <span class="stat-label">三违</span>
            </div>
            <div class="stat-item">
              <span class="stat-value">{{ item.demeritPoints5y }}</span>
              <span class="stat-label">扣分</span>
            </div>
            <div class="stat-item">
              <span class="stat-value">{{ item.resolvedHazardCount }}/{{ item.hazardCount }}</span>
              <span class="stat-label">整改</span>
            </div>
          </div>
          </Card>
        </Col>
      </Row>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { Card, Col, Row } from 'ant-design-vue';
import type { AssessmentAnalysisApi } from '#/api/hse/assessment-analysis';

const props = defineProps<{
  data: AssessmentAnalysisApi.TownshipRankingData;
}>();

const viewMode = ref('table');

const filteredData = computed(() => {
  return props.data.rankings;
});

function handleViewModeChange(e: any) {
  viewMode.value = e.target.value;
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

function getRiskLevelColor(score: number): string {
  if (score >= 70) return 'red';
  if (score >= 50) return 'orange';
  if (score >= 30) return 'gold';
  return 'green';
}

function getRiskLevelText(score: number): string {
  if (score >= 70) return '重大风险';
  if (score >= 50) return '高风险';
  if (score >= 30) return '中风险';
  return '低风险';
}

const tableColumns = [
  { key: 'rank', title: '排名', width: 60, align: 'center' },
  { key: 'townshipName', title: '乡镇/片区', width: 150 },
  { key: 'unitType', title: '类型', width: 80 },
  { key: 'overallScore', title: '综合得分', width: 100, align: 'center' },
  { key: 'riskLevel', title: '风险等级', width: 100, align: 'center' },
  { key: 'accidentCount', title: '事故起数', width: 80, align: 'center' },
  { key: 'violationCount', title: '三违次数', width: 80, align: 'center' },
  { key: 'demeritPoints5y', title: '扣分', width: 80, align: 'center' },
  { key: 'hazardCount', title: '隐患数', width: 80, align: 'center' },
  { key: 'resolvedHazardCount', title: '已整改', width: 80, align: 'center' },
];
</script>

<style lang="less" scoped>
.township-ranking {
  .ranking-header {
    margin-bottom: 16px;
  }

  .table-view {
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
      color: #fff;
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
      color: #fff;
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
      color: #fff;
      font-weight: 700;
      font-size: 12px;
    }

    .rank-normal {
      color: hsl(var(--muted-foreground));
      font-size: 14px;
    }

    .score-excellent { color: #52c41a; font-weight: 600; }
    .score-good { color: #1890ff; font-weight: 600; }
    .score-warning { color: #faad14; font-weight: 600; }
    .score-danger { color: #f5222d; font-weight: 600; }
  }

  .card-view {
    .card-grid {
      width: 100%;
    }

    .township-card {
      height: 100%;
      border-left: 4px solid hsl(var(--border));
      transition: all 0.3s ease;

      &.card-excellent { border-left-color: #52c41a; }
      &.card-good { border-left-color: #1890ff; }
      &.card-warning { border-left-color: #faad14; }
      &.card-danger { border-left-color: #f5222d; }

      &:hover {
        transform: translateY(-4px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
      }

      .card-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 12px;

        .card-rank {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 14px;

          &.rank-gold { background: hsl(var(--warning)); color: #fff; }
          &.rank-silver { background: hsl(var(--muted-foreground)); color: #fff; }
          &.rank-bronze { background: hsl(var(--warning) / 0.75); color: #fff; }
          &.rank-normal { background: hsl(var(--border)); color: hsl(var(--muted-foreground)); }
        }

        .card-name {
          flex: 1;
          font-size: 15px;
          font-weight: 600;
          color: hsl(var(--foreground));
        }
      }

      .card-score {
        text-align: center;
        margin-bottom: 16px;
        padding: 12px;
        background: hsl(var(--muted));
        border-radius: 8px;

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
      }

      .card-stats {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 8px;

        .stat-item {
          text-align: center;

          .stat-value {
            display: block;
            font-size: 16px;
            font-weight: 600;
            color: hsl(var(--foreground));

            &.danger { color: #f5222d; }
            &.warning { color: #faad14; }
          }

          .stat-label {
            font-size: 11px;
            color: hsl(var(--muted-foreground));
          }
        }
      }
    }
  }
}
</style>

<!-- 设计系统对齐：保留 :deep(.ant-table-thead>tr>th{background:hsl(var(--muted))}) —— 已用语义变量，主题可跟随 -->

