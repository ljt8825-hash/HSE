<template>
  <div class="target-progress">
    <Card v-if="data.contractVersion" class="contract-info" :bordered="false">
      <div class="contract-header">
        <IconifyIcon icon="lucide:file-check" :size="20" class="contract-icon" />
        <span class="contract-name">{{ data.contractVersion.name }}</span>
        <a-tag color="blue">{{ data.contractVersion.version }}</a-tag>
        <a-tag :color="data.contractVersion.status === '生效中' ? 'green' : 'default'">{{ data.contractVersion.status }}</a-tag>
      </div>
      <div class="contract-meta">
        <span class="meta-item">生效日期: {{ data.contractVersion.effectiveDate }}</span>
        <span class="meta-item">到期日期: {{ data.contractVersion.expiryDate }}</span>
        <span class="meta-item">年度: {{ data.currentYear }}</span>
      </div>
    </Card>
    <Card v-else class="contract-info" :bordered="false">
      <div class="contract-header">
        <IconifyIcon icon="lucide:file-check" :size="20" class="contract-icon" />
        <span class="contract-name">{{ data.currentYear }}年度HSE目标责任书</span>
        <a-tag color="orange">默认目标</a-tag>
      </div>
    </Card>

    <Card class="target-table-section" :bordered="false">
      <a-table
        :columns="columns"
        :data-source="data.targets"
        :pagination="false"
        row-key="id"
        size="middle"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'targetValue'">
            <span class="value-text">{{ record.targetValue }}{{ record.targetUnit || '' }}</span>
          </template>
          <template v-if="column.key === 'actualValue'">
            <span class="value-text" :class="{ 'value-warn': record.gap > 0 }">{{ record.actualValue }}{{ record.actualUnit || '' }}</span>
          </template>
          <template v-if="column.key === 'gap'">
            <span :class="record.gap > 0 ? 'gap-negative' : 'gap-positive'">
              {{ record.gap > 0 ? '+' : '' }}{{ record.gap }}{{ record.targetUnit || '' }}
            </span>
          </template>
          <template v-if="column.key === 'completionRate'">
            <a-progress
              :percent="record.completionRate"
              :stroke-color="getProgressColor(record.completionRate)"
              :size="'small'"
            />
          </template>
          <template v-if="column.key === 'status'">
            <a-tag :color="getStatusColor(record.status)">{{ getStatusText(record.status) }}</a-tag>
          </template>
          <template v-if="column.key === 'responsibilityLevel'">
            <a-tag :color="getLevelColor(record.responsibilityLevel)">{{ record.responsibilityLevel }}</a-tag>
          </template>
        </template>
      </a-table>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { IconifyIcon } from '@vben/icons';
import { Card } from 'ant-design-vue';
import type { AssessmentApi } from '#/api/hse/assessment';

const props = defineProps<{
  data: AssessmentApi.TargetProgressData;
}>();

const columns = [
  { key: 'name', title: '目标名称', width: 160 },
  { key: 'category', title: '类别', width: 100 },
  { key: 'targetValue', title: '目标值', width: 90, align: 'center' },
  { key: 'actualValue', title: '实际值', width: 90, align: 'center' },
  { key: 'gap', title: '差距', width: 80, align: 'center' },
  { key: 'completionRate', title: '完成率', width: 150 },
  { key: 'status', title: '状态', width: 80, align: 'center' },
  { key: 'responsibleUnit', title: '责任单位', width: 120 },
  { key: 'responsibilityLevel', title: '责任层级', width: 100, align: 'center' },
];

function getProgressColor(percent: number) {
  if (percent >= 100) return 'hsl(var(--success))';
  if (percent >= 80) return 'hsl(var(--primary))';
  if (percent >= 60) return 'hsl(var(--warning))';
  return 'hsl(var(--error))';
}

function getStatusColor(status: string) {
  const colors: Record<string, string> = {
    completed: 'green',
    in_progress: 'blue',
    warning: 'orange',
    danger: 'red',
  };
  return colors[status] || 'default';
}

function getStatusText(status: string) {
  const texts: Record<string, string> = {
    completed: '已完成',
    in_progress: '进行中',
    warning: '预警',
    danger: '危险',
  };
  return texts[status] || status;
}

function getLevelColor(level: string) {
  const colors: Record<string, string> = {
    '公司': 'purple',
    '部门': 'blue',
    '环卫作业中心': 'cyan',
    '乡镇作业中心': 'green',
    '片区': 'orange',
    '班组': 'gold',
    '员工': 'default',
    '网格长': 'magenta',
  };
  return colors[level] || 'default';
}
</script>

<style lang="less" scoped>
.target-progress {
  .contract-info {
    margin-bottom: 16px;

    .contract-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;

      .contract-icon {
        color: #1890ff;
      }

      .contract-name {
        font-size: 16px;
        font-weight: 600;
        color: hsl(var(--foreground));
      }
    }

    .contract-meta {
      display: flex;
      gap: 24px;
      font-size: 13px;
      color: hsl(var(--muted-foreground));
    }
  }

  .target-table-section {
  }

  .value-text {
    font-weight: 600;
    color: hsl(var(--foreground));

    &.value-warn {
      color: #f5222d;
    }
  }

  .gap-negative {
    color: #f5222d;
    font-weight: 600;
  }

  .gap-positive {
    color: #52c41a;
    font-weight: 600;
  }
}
</style>
