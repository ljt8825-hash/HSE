<script lang="ts" setup>
import { computed } from 'vue';

import { Card, Statistic } from 'ant-design-vue';
import { IconifyIcon } from '@vben/icons';

interface Props {
  title: string;
  value: number | string;
  icon?: string;
  color?:
    | 'blue'
    | 'green'
    | 'orange'
    | 'red'
    | 'purple'
    | 'cyan'
    | 'info'
    | 'success'
    | 'warning'
    | 'danger'
    | 'primary'
    | 'error'
    | 'default';
  suffix?: string;
  prefix?: string;
  trend?: number;
  clickable?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  color: 'default',
  value: 0,
  clickable: false,
});

const emit = defineEmits<{
  click: [event: MouseEvent];
}>();

const colorClass = computed(() => {
  const map: Record<string, string> = {
    blue: 'stat-card-blue',
    info: 'stat-card-blue',
    primary: 'stat-card-blue',
    green: 'stat-card-green',
    success: 'stat-card-green',
    orange: 'stat-card-orange',
    warning: 'stat-card-orange',
    red: 'stat-card-red',
    danger: 'stat-card-red',
    error: 'stat-card-red',
    purple: 'stat-card-purple',
    cyan: 'stat-card-cyan',
    default: '',
  };
  return map[props.color] || '';
});

function handleClick(e: MouseEvent) {
  emit('click', e);
}
</script>

<template>
  <Card
    :class="['hse-stat-card', colorClass, { 'stat-card-clickable': clickable }]"
    :bordered="false"
    hoverable
    :body-style="{ padding: '20px' }"
    @click="handleClick"
  >
    <div class="stat-content">
      <div class="stat-info">
        <div class="stat-title">{{ title }}</div>
        <Statistic
          class="stat-value"
          :value="value"
          :suffix="suffix"
          :prefix="prefix"
          :value-style="{ fontSize: '24px', fontWeight: 600 }"
        />
      </div>
      <div v-if="icon" class="stat-icon">
        <IconifyIcon :icon="icon" class="icon" />
      </div>
    </div>
  </Card>
</template>

<style lang="scss" scoped>
.hse-stat-card {
  transition: all 0.3s;
  border-radius: 8px;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-left: 4px solid transparent;

  .stat-content {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .stat-info {
    flex: 1;
  }

  .stat-title {
    font-size: 14px;
    color: hsl(var(--muted-foreground));
    margin-bottom: 8px;
  }

  .stat-icon {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(var(--primary-color-rgb), 0.1);

    .icon {
      font-size: 24px;
      color: var(--primary-color);
    }
  }

  &.stat-card-blue .stat-icon {
    background: hsl(var(--primary) / 0.1);
    .icon { color: hsl(var(--primary)); }
  }
  &.stat-card-green .stat-icon {
    background: hsl(var(--success) / 0.1);
    .icon { color: hsl(var(--success)); }
  }
  &.stat-card-orange .stat-icon {
    background: hsl(var(--warning) / 0.1);
    .icon { color: hsl(var(--warning)); }
  }
  &.stat-card-red .stat-icon {
    background: hsl(var(--error) / 0.1);
    .icon { color: hsl(var(--error)); }
  }
  &.stat-card-purple .stat-icon {
    background: hsl(var(--primary) / 0.1);
    .icon { color: hsl(var(--primary)); }
  }
  &.stat-card-cyan .stat-icon {
    background: hsl(var(--info) / 0.1);
    .icon { color: hsl(var(--info)); }
  }

  // 语义化左侧色条：强化正向/负向/中性的视觉分级
  &.stat-card-blue { border-left-color: hsl(var(--primary)); }
  &.stat-card-green { border-left-color: hsl(var(--success)); }
  &.stat-card-orange { border-left-color: hsl(var(--warning)); }
  &.stat-card-red { border-left-color: hsl(var(--error)); }
  &.stat-card-purple { border-left-color: hsl(var(--primary)); }
  &.stat-card-cyan { border-left-color: hsl(var(--info)); }

  // 数值按语义着色：正向绿 / 负向红 / 中性蓝，提升扫读层级
  &.stat-card-blue .stat-value :deep(.ant-statistic-content) { color: hsl(var(--primary)); }
  &.stat-card-green .stat-value :deep(.ant-statistic-content) { color: hsl(var(--success)); }
  &.stat-card-orange .stat-value :deep(.ant-statistic-content) { color: hsl(var(--warning)); }
  &.stat-card-red .stat-value :deep(.ant-statistic-content) { color: hsl(var(--error)); }
  &.stat-card-purple .stat-value :deep(.ant-statistic-content) { color: hsl(var(--primary)); }
  &.stat-card-cyan .stat-value :deep(.ant-statistic-content) { color: hsl(var(--info)); }

  &.stat-card-clickable {
    cursor: pointer;
    &:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
    }
  }
}
</style>
