<template>
  <div class="goals-association">
    <Row :gutter="[16, 16]" class="goals-cards">
      <Col v-for="item in data.goals" :key="item.id" :xs="24" :lg="12">
        <Card :bordered="false" class="goal-card" :class="getStatusClass(item.status)">
        <div class="card-icon">
          <IconifyIcon :icon="getCategoryIcon(item.category)" :size="28" />
        </div>
        <div class="card-content">
          <div class="card-header">
            <span class="card-name">{{ item.name }}</span>
            <a-tag :color="getStatusColor(item.status)">{{ getStatusText(item.status) }}</a-tag>
          </div>
          <div class="card-values">
            <div class="value-item">
              <span class="value-label">目标值</span>
              <span class="value-number">{{ item.targetValue }}<span class="value-unit">{{ item.targetUnit }}</span></span>
            </div>
            <div class="value-arrow">
              <IconifyIcon icon="lucide:arrow-right" :size="16" />
            </div>
            <div class="value-item">
              <span class="value-label">实际值</span>
              <span class="value-number">{{ item.actualValue }}<span class="value-unit">{{ item.actualUnit }}</span></span>
            </div>
          </div>
          <div class="card-progress">
            <Progress :percent="Math.round(item.completionRate)" :status="item.status === 'warning' ? 'exception' : 'normal'" />
            <span class="progress-text">完成率 {{ Math.round(item.completionRate) }}%</span>
          </div>
          <div class="card-gap" :class="{ danger: item.gap > 0 }">
            <span>差距: {{ item.gap }} {{ item.targetUnit }}</span>
          </div>
          <div class="card-desc">{{ item.description }}</div>
        </div>
        </Card>
      </Col>
    </Row>

    <Row :gutter="[16, 16]" class="goals-summary">
      <Col :xs="24" :md="8">
        <Card :bordered="false" class="summary-item completed">
        <span class="summary-icon">
          <IconifyIcon icon="lucide:check-circle" :size="24" />
        </span>
        <span class="summary-count">{{ completedCount }}</span>
        <span class="summary-label">已完成</span>
        </Card>
      </Col>
      <Col :xs="24" :md="8">
        <Card :bordered="false" class="summary-item in-progress">
        <span class="summary-icon">
          <IconifyIcon icon="lucide:clock" :size="24" />
        </span>
        <span class="summary-count">{{ inProgressCount }}</span>
        <span class="summary-label">进行中</span>
        </Card>
      </Col>
      <Col :xs="24" :md="8">
        <Card :bordered="false" class="summary-item warning">
        <span class="summary-icon">
          <IconifyIcon icon="lucide:alert-triangle" :size="24" />
        </span>
        <span class="summary-count">{{ warningCount }}</span>
        <span class="summary-label">预警</span>
        </Card>
      </Col>
    </Row>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { IconifyIcon } from '@vben/icons';
import { Card, Col, Progress, Row } from 'ant-design-vue';
import type { AssessmentAnalysisApi } from '#/api/hse/assessment-analysis';

const props = defineProps<{
  data: AssessmentAnalysisApi.GoalsData;
}>();

const completedCount = computed(() => props.data.goals.filter(g => g.status === 'completed').length);
const inProgressCount = computed(() => props.data.goals.filter(g => g.status === 'in_progress').length);
const warningCount = computed(() => props.data.goals.filter(g => g.status === 'warning').length);

function getCategoryIcon(category: string): string {
  const icons: Record<string, string> = {
    '安全事故': 'lucide:alert-circle',
    '三违管理': 'lucide:alert-triangle',
    '培训考核': 'lucide:graduation-cap',
    '隐患整改': 'lucide:check-circle',
    '驾驶风险': 'lucide:car',
    '风险管控': 'lucide:shield-alert',
  };
  return icons[category] || 'lucide:target';
}

function getStatusClass(status: AssessmentAnalysisApi.GoalStatus): string {
  return `status-${status}`;
}

function getStatusColor(status: AssessmentAnalysisApi.GoalStatus): string {
  const colors: Record<AssessmentAnalysisApi.GoalStatus, string> = {
    completed: 'green',
    in_progress: 'blue',
    warning: 'orange',
  };
  return colors[status];
}

function getStatusText(status: AssessmentAnalysisApi.GoalStatus): string {
  const texts: Record<AssessmentAnalysisApi.GoalStatus, string> = {
    completed: '已完成',
    in_progress: '进行中',
    warning: '预警',
  };
  return texts[status];
}
</script>

<style lang="less" scoped>
.goals-association {
  .goals-cards {
    margin-bottom: 20px;

    .goal-card {
      height: 100%;
      border-left: 4px solid hsl(var(--border));

      :deep(.ant-card-body) {
        display: flex;
        gap: 16px;
      }

      &.status-completed { border-left-color: #52c41a; }
      &.status-in_progress { border-left-color: #1890ff; }
      &.status-warning { border-left-color: #faad14; }

      .card-icon {
        width: 48px;
        height: 48px;
        border-radius: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: hsl(var(--muted));
        flex-shrink: 0;

        &.icon-danger { background: rgba(245, 34, 45, 0.1); color: #f5222d; }
        &.icon-warning { background: rgba(250, 173, 20, 0.1); color: #faad14; }
        &.icon-success { background: rgba(82, 196, 26, 0.1); color: #52c41a; }
        &.icon-info { background: rgba(24, 144, 255, 0.1); color: #1890ff; }
      }

      .card-content {
        flex: 1;

        .card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 12px;

          .card-name {
            font-size: 15px;
            font-weight: 600;
            color: hsl(var(--foreground));
          }
        }

        .card-values {
          display: flex;
          align-items: center;
          gap: 16px;
          margin-bottom: 12px;

          .value-item {
            flex: 1;

            .value-label {
              display: block;
              font-size: 12px;
              color: hsl(var(--muted-foreground));
              margin-bottom: 4px;
            }

            .value-number {
              font-size: 20px;
              font-weight: 600;
              color: hsl(var(--foreground));

              .value-unit {
                font-size: 12px;
                font-weight: normal;
                color: hsl(var(--muted-foreground));
                margin-left: 2px;
              }
            }
          }

          .value-arrow {
            color: #d9d9d9;
          }
        }

        .card-progress {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 8px;

          .progress-bar {
            flex: 1;
            height: 8px;
            background: hsl(var(--border));
            border-radius: 4px;
            overflow: hidden;

            .progress-fill {
              height: 100%;
              background: hsl(var(--success));
              border-radius: 4px;
              transition: width 0.3s ease;
            }
          }

          .progress-text {
            font-size: 13px;
            font-weight: 500;
            color: #52c41a;
            white-space: nowrap;
          }
        }

        .card-gap {
          font-size: 12px;
          color: hsl(var(--muted-foreground));
          margin-bottom: 8px;

          &.danger {
            color: #f5222d;
            font-weight: 500;
          }
        }

        .card-desc {
          font-size: 12px;
          color: hsl(var(--muted-foreground));
          line-height: 1.5;
        }
      }
    }
  }

  .goals-summary {
    .summary-item {
      height: 100%;

      :deep(.ant-card-body) {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 12px;
      }

      &.completed {
        .summary-icon { color: #52c41a; }
        .summary-count { color: #52c41a; }
      }

      &.in-progress {
        .summary-icon { color: #1890ff; }
        .summary-count { color: #1890ff; }
      }

      &.warning {
        .summary-icon { color: #faad14; }
        .summary-count { color: #faad14; }
      }

      .summary-icon {
        width: 40px;
        height: 40px;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: hsl(var(--muted));
      }

      .summary-count {
        font-size: 28px;
        font-weight: 700;
        color: hsl(var(--foreground));
      }

      .summary-label {
        font-size: 14px;
        color: hsl(var(--muted-foreground));
      }
    }
  }
}
</style>

<!-- 设计系统对齐：保留 2 处 :deep(.ant-card-body{display:flex}) —— 卡片体内布局(flex/gap)，主题无关；如需可改为 a-card :body-style，但当前无主题割裂风险 -->

