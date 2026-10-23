<script lang="ts" setup>
import type { CockpitApi } from '#/api/hse/cockpit';

import { computed } from 'vue';

import { IconifyIcon } from '@vben/icons';

const props = defineProps<{
  data: CockpitApi.ManagementExecutionData | null;
  loading?: boolean;
}>();

const hasData = computed(() => {
  if (!props.data || !props.data.summary) return false;
  const { totalInspections, totalProblems, completedCount } = props.data.summary;
  return totalInspections > 0 || totalProblems > 0 || completedCount > 0;
});

const metricCards = computed(() => {
  if (!props.data || !props.data.summary) return [];
  const { problemFoundRate, rectificationRate } = props.data.summary;

  const executionRate = computedExecutionRate.value;

  return [
    {
      key: 'execution',
      label: '巡查完成率',
      value: executionRate,
      icon: 'lucide:clipboard-check',
      color: '#52c41a',
      description: '执行指标',
    },
    {
      key: 'quality',
      label: '问题发现率',
      value: problemFoundRate,
      icon: 'lucide:search',
      color: '#1890ff',
      description: '质量指标',
    },
    {
      key: 'closure',
      label: '整改完成率',
      value: rectificationRate,
      icon: 'lucide:check-circle',
      color: '#722ed1',
      description: '闭环指标',
    },
  ];
});

const computedExecutionRate = computed(() => {
  if (!props.data || !props.data.execution || !props.data.execution.gridLevels) return 0;
  const levels = props.data.execution.gridLevels;
  if (levels.length === 0) return 0;

  let totalActual = 0;
  let totalExpected = 0;
  levels.forEach((level) => {
    totalActual += level.actualCount || 0;
    totalExpected += level.expectedCount || 0;
  });

  return totalExpected > 0
    ? parseFloat(((totalActual / totalExpected) * 100).toFixed(2))
    : 0;
});

function getProgressColor(value: number): string {
  if (value >= 90) return '#52c41a';
  if (value >= 70) return '#1890ff';
  if (value >= 50) return '#faad14';
  return '#f5222d';
}
</script>

<template>
  <div class="management-execution">
    <div v-if="!hasData" class="empty-state">
      <IconifyIcon icon="lucide:inbox" :size="40" class="empty-icon" />
      <p class="empty-text">暂无数据</p>
    </div>

    <div v-else class="execution-content">
      <div class="metric-cards">
        <div
          v-for="metric in metricCards"
          :key="metric.key"
          class="metric-card"
        >
          <div class="metric-icon" :style="{ backgroundColor: metric.color + '15', color: metric.color }">
            <IconifyIcon :icon="metric.icon" :size="20" />
          </div>
          <div class="metric-info">
            <div class="metric-label">{{ metric.label }}</div>
            <div class="metric-value" :style="{ color: metric.color }">
              {{ metric.value }}<span class="metric-unit">%</span>
            </div>
          </div>
        </div>
      </div>

      <div class="progress-section">
        <div
          v-for="metric in metricCards"
          :key="metric.key"
          class="progress-item"
        >
          <div class="progress-header">
            <span class="progress-label">{{ metric.label }}</span>
            <span class="progress-value" :style="{ color: getProgressColor(metric.value) }">
              {{ metric.value }}%
            </span>
          </div>
          <div class="progress-bar">
            <div
              class="progress-fill"
              :style="{
                width: Math.min(metric.value, 100) + '%',
                backgroundColor: getProgressColor(metric.value),
              }"
            ></div>
          </div>
        </div>
      </div>

      <div v-if="data?.summary" class="summary-stats">
        <div class="stat-item">
          <span class="stat-label">总巡查次数</span>
          <span class="stat-value">{{ data.summary.totalInspections }}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">发现问题数</span>
          <span class="stat-value">{{ data.summary.totalProblems }}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">已整改数</span>
          <span class="stat-value" style="color: #52c41a">{{ data.summary.completedCount }}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">逾期数</span>
          <span class="stat-value" style="color: #f5222d">{{ data.summary.overdueCount }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.management-execution {
  width: 100%;
  height: 100%;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 280px;
  color: hsl(var(--muted-foreground));
}

.empty-icon {
  margin-bottom: 16px;
  opacity: 0.5;
}

.empty-text {
  font-size: 14px;
}

.execution-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.metric-cards {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.metric-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: hsl(var(--muted));
  border-radius: 8px;
}

.metric-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.metric-info {
  flex: 1;
  min-width: 0;
}

.metric-label {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  margin-bottom: 4px;
}

.metric-value {
  font-size: 22px;
  font-weight: 600;
  line-height: 1.2;
}

.metric-unit {
  font-size: 13px;
  font-weight: 400;
  margin-left: 2px;
}

.progress-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.progress-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.progress-label {
  font-size: 13px;
  color: hsl(var(--muted-foreground));
}

.progress-value {
  font-size: 13px;
  font-weight: 500;
}

.progress-bar {
  height: 8px;
  background: hsl(var(--border));
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.5s ease;
}

.summary-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  padding-top: 16px;
  border-top: 1px solid hsl(var(--border));
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.stat-label {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.stat-value {
  font-size: 16px;
  font-weight: 600;
  color: hsl(var(--foreground));
}

@media (max-width: 768px) {
  .metric-cards {
    grid-template-columns: 1fr;
  }

  .summary-stats {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
