<template>
  <div class="township-ranking">
    <Card :bordered="false" class="ranking-header">
      <div class="ranking-header-row">
        <a-radio-group v-model:value="viewMode" @change="handleViewModeChange">
          <a-radio value="table">列表视图</a-radio>
          <a-radio value="card">卡片视图</a-radio>
        </a-radio-group>
        <a-tag v-if="data.cycleName" color="blue">考核周期：{{ data.cycleName }}</a-tag>
      </div>
    </Card>

    <Card v-if="viewMode === 'table'" :bordered="false" class="table-view">
      <a-table :columns="tableColumns" :data-source="filteredData" :pagination="false" row-key="targetId">
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'rank'">
            <span :class="getRankClass(record.overallRank)">{{ record.overallRank ?? '-' }}</span>
          </template>
          <template v-if="column.key === 'manager'">
            <span v-if="record.hasData && record.scoreSource === 'manager'">{{ record.managerName }}</span>
            <a-tooltip
              v-else-if="record.scoreSource === 'admin_aggregate'"
              :title="`管理员聚合得分：${record.adminCount}人平均 ${record.adminAvgScore}，最高 ${record.adminMaxScore}`"
            >
              <span class="admin-aggregate">管理员（{{ record.adminCount ?? '-' }}人）</span>
            </a-tooltip>
            <span v-else>无考核对象</span>
          </template>
          <template v-if="column.key === 'scoreTotal'">
            <span :class="getScoreClass(record.scoreTotal)">
              {{ record.scoreTotal != null ? record.scoreTotal.toFixed(1) : '-' }}
            </span>
          </template>
          <template v-if="column.key === 'grade'">
            <a-tag v-if="record.grade" :color="getGradeColor(record.grade)">{{ record.grade }}</a-tag>
            <span v-else>-</span>
          </template>
          <template v-if="column.key === 'reviewStatus'">
            <span>{{ getReviewText(record.reviewStatus) }}</span>
          </template>
        </template>
      </a-table>
    </Card>

    <div v-else class="card-view">
      <Row :gutter="[16, 16]" class="card-grid">
        <Col v-for="item in filteredData" :key="item.targetId ?? item.townshipId" :xs="24" :sm="12" :lg="8">
          <Card :bordered="false" class="township-card" :class="getCardClass(item.scoreTotal)">
            <div class="card-header">
              <span class="card-rank" :class="getRankClass(item.overallRank)">{{ item.overallRank ?? '-' }}</span>
              <span class="card-name">{{ item.townshipName }}</span>
              <a-tag v-if="item.grade" :color="getGradeColor(item.grade)">{{ item.grade }}</a-tag>
            </div>
            <div class="card-manager">
              <span v-if="item.hasData && item.scoreSource === 'manager'" class="manager-name">
                {{ item.managerName }}（经理）
              </span>
              <span v-else-if="item.scoreSource === 'admin_aggregate'" class="manager-name admin-aggregate">
                管理员聚合（{{ item.adminCount ?? '-' }}人平均）
              </span>
              <span v-else class="manager-name">无考核对象</span>
            </div>
            <div class="card-score">
              <span class="score-value">{{ item.scoreTotal != null ? item.scoreTotal.toFixed(1) : '-' }}</span>
              <span class="score-label">综合得分</span>
            </div>
            <div v-if="item.hasData" class="card-stats">
              <div class="stat-item">
                <span class="stat-label">审核</span>
                <span class="stat-value">{{ getReviewText(item.reviewStatus) }}</span>
              </div>
              <div v-if="item.scoreSource === 'admin_aggregate'" class="stat-item">
                <span class="stat-label">管理员最高分</span>
                <span class="stat-value">{{ item.adminMaxScore ?? '-' }}</span>
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

function getRankClass(rank: number | null): string {
  if (rank == null) return 'rank-normal';
  if (rank === 1) return 'rank-gold';
  if (rank === 2) return 'rank-silver';
  if (rank === 3) return 'rank-bronze';
  return 'rank-normal';
}

function getScoreClass(score: number | null): string {
  if (score == null) return 'score-danger';
  if (score >= 90) return 'score-excellent';
  if (score >= 80) return 'score-good';
  if (score >= 60) return 'score-warning';
  return 'score-danger';
}

function getCardClass(score: number | null): string {
  if (score == null) return 'card-danger';
  if (score >= 90) return 'card-excellent';
  if (score >= 80) return 'card-good';
  if (score >= 60) return 'card-warning';
  return 'card-danger';
}

function getGradeColor(grade: string | null): string {
  if (!grade) return 'default';
  if (grade === 'A') return 'green';
  if (grade === 'B') return 'blue';
  if (grade === 'C') return 'orange';
  return 'red';
}

function getReviewText(status: string | null): string {
  if (!status) return '-';
  const map: Record<string, string> = {
    pending: '待审',
    approved: '已确认（锁定）',
    rejected: '已驳回',
    adjusted: '已调整（锁定）',
  };
  return map[status] ?? status;
}

const tableColumns = [
  { key: 'rank', title: '排名', width: 60, align: 'center' },
  { key: 'townshipName', title: '乡镇/片区', width: 150 },
  { key: 'manager', title: '经理', width: 100, align: 'center' },
  { key: 'scoreTotal', title: '综合得分', width: 100, align: 'center' },
  { key: 'grade', title: '等级', width: 70, align: 'center' },
  { key: 'reviewStatus', title: '审核状态', width: 100, align: 'center' },
];
</script>

<style lang="less" scoped>
.township-ranking {
  .ranking-header {
    margin-bottom: 16px;

    .ranking-header-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
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

    .admin-aggregate {
      cursor: help;
      color: hsl(var(--muted-foreground));
      text-decoration: underline dotted;
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
        margin-bottom: 8px;

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

      .card-manager {
        margin-bottom: 12px;

        .manager-name {
          font-size: 13px;
          color: hsl(var(--muted-foreground));
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
        grid-template-columns: repeat(1, 1fr);
        gap: 8px;

        .stat-item {
          text-align: center;

          .stat-value {
            display: block;
            font-size: 14px;
            font-weight: 600;
            color: hsl(var(--foreground));
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
