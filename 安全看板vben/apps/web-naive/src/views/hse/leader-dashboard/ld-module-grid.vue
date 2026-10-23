<script lang="ts" setup>
/**
 * 领导视角统一看板 · 维度概览格网格（环卫 10 格 / 园林 8 格）
 * dims 由父级按作业中心类型提供；data 兼容 Summary10 与 MonthCell
 * （MonthCell 缺 risks / drivers.personCount，main/note 返回 '—'）。
 */
import { IconifyIcon } from '@vben/icons';

export interface LdDim {
  key: string;
  label: string;
  icon: string;
  color: string;
  main: (s: any) => string | number;
  note: (s: any) => string;
}

defineProps<{
  dims: LdDim[];
  data: any;
}>();

const emit = defineEmits<{ (e: 'dim-click', key: string): void }>();
</script>

<template>
  <div class="lm-grid">
    <div
      v-for="d in dims"
      :key="d.key"
      class="lm-cell lm-clickable"
      :style="{ '--mod-color': d.color }"
      @click.stop="emit('dim-click', d.key)"
    >
      <div class="lm-label">{{ d.label }}</div>
      <div class="lm-icon">
        <IconifyIcon :icon="d.icon" :size="14" />
      </div>
      <div class="lm-main">{{ d.main(data) }}</div>
      <div class="lm-note">{{ d.note(data) }}</div>
    </div>
  </div>
</template>

<style scoped>
.lm-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 10px;
}

.lm-cell {
  padding: 10px 8px;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  text-align: center;
  background: hsl(var(--card));
  min-width: 0;
  transition:
    border-color 0.15s,
    box-shadow 0.15s,
    transform 0.15s;
}

.lm-clickable {
  cursor: pointer;
}

.lm-clickable:hover {
  border-color: hsl(var(--success));
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.08);
  transform: translateY(-1px);
}

.lm-label {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  margin-bottom: 4px;
}

.lm-icon {
  color: var(--mod-color);
  display: flex;
  justify-content: center;
  margin-bottom: 4px;
}

.lm-main {
  font-size: 18px;
  font-weight: 700;
  color: var(--mod-color);
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
}

.lm-note {
  font-size: 11px;
  color: hsl(var(--muted-foreground));
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

@media (max-width: 1200px) {
  .lm-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}
</style>
