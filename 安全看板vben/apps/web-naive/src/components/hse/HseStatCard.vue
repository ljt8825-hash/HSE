<script lang="ts" setup>
import { computed } from 'vue';

import { IconifyIcon } from '@vben/icons';

interface Props {
  /** 指标标题 */
  title?: string;
  /** 指标数值 */
  value?: string | number;
  /** 图标（iconify 名称，如 lucide:gauge） */
  icon?: string;
  /** 语义色：blue/green/red/ororange/purple/cyan 或直接 hex */
  color?: string;
  /** 是否可点击 */
  clickable?: boolean;
  /** 加载态 */
  loading?: boolean;
  /** 单位后缀 */
  suffix?: string;
}

const props = withDefaults(defineProps<Props>(), {
  title: '',
  value: '',
  icon: '',
  color: 'blue',
  clickable: false,
  loading: false,
  suffix: '',
});

const emit = defineEmits<{ click: [] }>();

const colorVar = computed(() => {
  const map: Record<string, string> = {
    blue: 'var(--primary-color)',
    green: '#52c41a',
    red: '#f5222d',
    orange: '#fa8c16',
    purple: '#722ed1',
    cyan: '#13c2c2',
    yellow: '#faad14',
    default: 'var(--primary-color)',
  };
  return map[props.color] ?? props.color;
});

function onClick() {
  if (props.clickable) emit('click');
}
</script>

<template>
  <div
    class="hse-stat-card"
    :class="{ 'is-clickable': clickable }"
    @click="onClick"
  >
    <div v-if="icon" class="stat-icon" :style="{ color: colorVar }">
      <IconifyIcon :icon="icon" :size="22" />
    </div>
    <div class="stat-body">
      <div class="stat-title">{{ title }}</div>
      <div class="stat-value">
        <span v-if="loading" class="stat-loading">--</span>
        <template v-else>
          {{ value }}<span v-if="suffix" class="stat-suffix">{{ suffix }}</span>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.hse-stat-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px 20px;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 10px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  height: 100%;
  box-sizing: border-box;
}

.is-clickable {
  cursor: pointer;
  transition:
    box-shadow 0.2s,
    transform 0.2s;
}

.is-clickable:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  transform: translateY(-2px);
}

.stat-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 10px;
  flex-shrink: 0;
  background: color-mix(in srgb, currentColor 14%, transparent);
}

.stat-body {
  min-width: 0;
}

.stat-title {
  font-size: 13px;
  color: hsl(var(--muted-foreground));
  margin-bottom: 6px;
}

.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: hsl(var(--foreground));
  line-height: 1.1;
}

.stat-suffix {
  font-size: 13px;
  font-weight: 500;
  color: hsl(var(--muted-foreground));
  margin-left: 4px;
}

.stat-loading {
  opacity: 0.4;
}
</style>
