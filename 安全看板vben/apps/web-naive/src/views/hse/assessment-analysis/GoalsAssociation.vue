<script lang="ts" setup>
/**
 * 目标责任书关联（web-naive）
 * 从 web-antd 1:1 移植：Row/Col/Card/Progress/Tag → Tailwind Grid / NCard / NProgress / NTag。
 */
import type { AssessmentAnalysisApi } from '#/api/hse/assessment-analysis';

import { computed } from 'vue';

import { IconifyIcon } from '@vben/icons';
import { NCard, NProgress, NTag } from 'naive-ui';

defineOptions({ name: 'GoalsAssociation' });

const props = defineProps<{
  data: AssessmentAnalysisApi.GoalsData;
}>();

const completedCount = computed(() => props.data.goals.filter((g) => g.status === 'completed').length);
const inProgressCount = computed(() => props.data.goals.filter((g) => g.status === 'in_progress').length);
const warningCount = computed(() => props.data.goals.filter((g) => g.status === 'warning').length);

function getCategoryIcon(category: string): string {
  const icons: Record<string, string> = {
    安全事故: 'lucide:alert-circle',
    三违管理: 'lucide:alert-triangle',
    培训考核: 'lucide:graduation-cap',
    隐患整改: 'lucide:check-circle',
    驾驶风险: 'lucide:car',
    风险管控: 'lucide:shield-alert',
  };
  return icons[category] || 'lucide:target';
}

function getStatusType(status: AssessmentAnalysisApi.GoalStatus): 'success' | 'info' | 'warning' {
  const map: Record<AssessmentAnalysisApi.GoalStatus, 'success' | 'info' | 'warning'> = {
    completed: 'success',
    in_progress: 'info',
    warning: 'warning',
  };
  return map[status];
}

function getStatusText(status: AssessmentAnalysisApi.GoalStatus): string {
  const texts: Record<AssessmentAnalysisApi.GoalStatus, string> = {
    completed: '已完成',
    in_progress: '进行中',
    warning: '预警',
  };
  return texts[status];
}

function getProgressStatus(status: AssessmentAnalysisApi.GoalStatus): 'success' | 'error' | 'default' {
  if (status === 'completed') return 'success';
  if (status === 'warning') return 'error';
  return 'default';
}
</script>

<template>
  <div class="goals-association">
    <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <NCard
        v-for="item in data.goals"
        :key="item.id"
        :bordered="false"
        class="goal-card"
        :class="`status-${item.status}`"
      >
        <div class="card-icon">
          <IconifyIcon :icon="getCategoryIcon(item.category)" :size="28" />
        </div>
        <div class="card-content">
          <div class="card-header">
            <span class="card-name">{{ item.name }}</span>
            <NTag :type="getStatusType(item.status)" size="small" :bordered="false">
              {{ getStatusText(item.status) }}
            </NTag>
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
            <NProgress
              type="line"
              :percentage="Math.round(item.completionRate)"
              :status="getProgressStatus(item.status)"
            />
            <span class="progress-text">完成率 {{ Math.round(item.completionRate) }}%</span>
          </div>
          <div class="card-gap" :class="{ danger: item.gap > 0 }">
            <span>差距: {{ item.gap }} {{ item.targetUnit }}</span>
          </div>
          <div class="card-desc">{{ item.description }}</div>
        </div>
      </NCard>
    </div>

    <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
      <NCard :bordered="false" class="summary-item completed">
        <span class="summary-icon"><IconifyIcon icon="lucide:check-circle" :size="24" /></span>
        <span class="summary-count">{{ completedCount }}</span>
        <span class="summary-label">已完成</span>
      </NCard>
      <NCard :bordered="false" class="summary-item in-progress">
        <span class="summary-icon"><IconifyIcon icon="lucide:clock" :size="24" /></span>
        <span class="summary-count">{{ inProgressCount }}</span>
        <span class="summary-label">进行中</span>
      </NCard>
      <NCard :bordered="false" class="summary-item warning">
        <span class="summary-icon"><IconifyIcon icon="lucide:alert-triangle" :size="24" /></span>
        <span class="summary-count">{{ warningCount }}</span>
        <span class="summary-label">预警</span>
      </NCard>
    </div>
  </div>
</template>

<style scoped>
.goals-association .goal-card {
  height: 100%;
  border-left: 4px solid hsl(var(--border));
}

.goals-association .goal-card.status-completed {
  border-left-color: #52c41a;
}

.goals-association .goal-card.status-in_progress {
  border-left-color: #1890ff;
}

.goals-association .goal-card.status-warning {
  border-left-color: #faad14;
}

.goals-association .card-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: hsl(var(--muted));
  flex-shrink: 0;
}

.goals-association .card-content {
  flex: 1;
}

.goals-association .card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.goals-association .card-name {
  font-size: 15px;
  font-weight: 600;
  color: hsl(var(--foreground));
}

.goals-association .card-values {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 12px;
}

.goals-association .value-item {
  flex: 1;
}

.goals-association .value-label {
  display: block;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  margin-bottom: 4px;
}

.goals-association .value-number {
  font-size: 20px;
  font-weight: 600;
  color: hsl(var(--foreground));
}

.goals-association .value-unit {
  font-size: 12px;
  font-weight: normal;
  color: hsl(var(--muted-foreground));
  margin-left: 2px;
}

.goals-association .value-arrow {
  color: #d9d9d9;
}

.goals-association .card-progress {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.goals-association .card-progress :deep(.n-progress) {
  flex: 1;
}

.goals-association .progress-text {
  font-size: 13px;
  font-weight: 500;
  color: #52c41a;
  white-space: nowrap;
}

.goals-association .card-gap {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  margin-bottom: 8px;
}

.goals-association .card-gap.danger {
  color: #f5222d;
  font-weight: 500;
}

.goals-association .card-desc {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  line-height: 1.5;
}

.goals-association .summary-item {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.goals-association .summary-item.completed .summary-icon,
.goals-association .summary-item.completed .summary-count {
  color: #52c41a;
}

.goals-association .summary-item.in-progress .summary-icon,
.goals-association .summary-item.in-progress .summary-count {
  color: #1890ff;
}

.goals-association .summary-item.warning .summary-icon,
.goals-association .summary-item.warning .summary-count {
  color: #faad14;
}

.goals-association .summary-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: hsl(var(--muted));
}

.goals-association .summary-count {
  font-size: 28px;
  font-weight: 700;
  color: hsl(var(--foreground));
}

.goals-association .summary-label {
  font-size: 14px;
  color: hsl(var(--muted-foreground));
}
</style>
