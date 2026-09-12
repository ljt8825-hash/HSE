<script lang="ts" setup>
/**
 * 目标完成进度（web-naive）
 * 从 web-antd 1:1 移植：Table/Progress/Tag → NDataTable(render)/NProgress/NTag。
 * 数据来源为 GoalsData.goals（字段结构与 web-antd 的 TargetProgressData 高度一致）。
 */
import type { AssessmentAnalysisApi } from '#/api/hse/assessment-analysis';
import type { DataTableColumns } from 'naive-ui';

import { h } from 'vue';

import { IconifyIcon } from '@vben/icons';
import { NCard, NDataTable, NProgress, NTag } from 'naive-ui';

defineOptions({ name: 'TargetProgress' });

type GoalItem = AssessmentAnalysisApi.GoalItem;

const props = defineProps<{
  data: AssessmentAnalysisApi.GoalsData;
}>();

function getProgressColor(percent: number): string {
  if (percent >= 100) return 'hsl(var(--success))';
  if (percent >= 80) return 'hsl(var(--primary))';
  if (percent >= 60) return 'hsl(var(--warning))';
  return 'hsl(var(--error))';
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

const columns: DataTableColumns<GoalItem> = [
  { title: '目标名称', key: 'name', width: 160 },
  { title: '类别', key: 'category', width: 100 },
  {
    title: '目标值',
    key: 'targetValue',
    width: 110,
    align: 'center',
    render: (row) => h('span', { class: 'value-text' }, `${row.targetValue}${row.targetUnit || ''}`),
  },
  {
    title: '实际值',
    key: 'actualValue',
    width: 110,
    align: 'center',
    render: (row) =>
      h('span', { class: row.gap > 0 ? 'value-text value-warn' : 'value-text' }, `${row.actualValue}${row.actualUnit || ''}`),
  },
  {
    title: '差距',
    key: 'gap',
    width: 100,
    align: 'center',
    render: (row) =>
      h('span', { class: row.gap > 0 ? 'gap-negative' : 'gap-positive' }, `${row.gap > 0 ? '+' : ''}${row.gap}${row.targetUnit || ''}`),
  },
  {
    title: '完成率',
    key: 'completionRate',
    width: 160,
    render: (row) =>
      h(NProgress, {
        type: 'line',
        percentage: Math.round(row.completionRate),
        color: getProgressColor(row.completionRate),
        height: 12,
      }),
  },
  {
    title: '状态',
    key: 'status',
    width: 90,
    align: 'center',
    render: (row) =>
      h(NTag, { type: getStatusType(row.status), size: 'small', bordered: false }, { default: () => getStatusText(row.status) }),
  },
];
</script>

<template>
  <div class="target-progress">
    <NCard v-if="data.contractVersion" class="contract-info" :bordered="false">
      <div class="contract-header">
        <IconifyIcon icon="lucide:file-check" :size="20" class="contract-icon" />
        <span class="contract-name">{{ data.contractVersion.name }}</span>
        <NTag size="small" :bordered="false" type="info">{{ data.contractVersion.version }}</NTag>
        <NTag size="small" :bordered="false" :type="data.contractVersion.status === '生效中' ? 'success' : 'default'">
          {{ data.contractVersion.status }}
        </NTag>
      </div>
      <div class="contract-meta">
        <span class="meta-item">生效日期: {{ data.contractVersion.effectiveDate }}</span>
        <span class="meta-item">到期日期: {{ data.contractVersion.expiryDate }}</span>
        <span class="meta-item">年度: {{ data.currentYear }}</span>
      </div>
    </NCard>
    <NCard v-else class="contract-info" :bordered="false">
      <div class="contract-header">
        <IconifyIcon icon="lucide:file-check" :size="20" class="contract-icon" />
        <span class="contract-name">{{ data.currentYear }}年度HSE目标责任书</span>
        <NTag size="small" :bordered="false" type="warning">默认目标</NTag>
      </div>
    </NCard>

    <NCard class="target-table-section" :bordered="false">
      <NDataTable
        :columns="columns"
        :data="data.goals"
        :pagination="false"
        size="small"
        :scroll-x="900"
      />
    </NCard>
  </div>
</template>

<style scoped>
.target-progress .contract-info {
  margin-bottom: 16px;
}

.target-progress .contract-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.target-progress .contract-icon {
  color: #1890ff;
}

.target-progress .contract-name {
  font-size: 16px;
  font-weight: 600;
  color: hsl(var(--foreground));
}

.target-progress .contract-meta {
  display: flex;
  gap: 24px;
  font-size: 13px;
  color: hsl(var(--muted-foreground));
}

.target-progress .value-text {
  font-weight: 600;
  color: hsl(var(--foreground));
}

.target-progress .value-text.value-warn {
  color: #f5222d;
}

.target-progress .gap-negative {
  color: #f5222d;
  font-weight: 600;
}

.target-progress .gap-positive {
  color: #52c41a;
  font-weight: 600;
}
</style>
