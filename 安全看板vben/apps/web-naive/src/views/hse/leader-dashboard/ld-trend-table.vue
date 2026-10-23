<script lang="ts" setup>
/**
 * 领导视角统一看板 · 逐月趋势表
 * 行 = 维度子指标（横向），列 = 月份（时间轴，横向滚动）。
 * 同一年份月份显示「N月」，跨年显示「YY-MM」。
 */
import { computed } from 'vue';

export interface LdTrendRow {
  label: string;
  values: (number | string)[];
  /** 数字语义色（跟随维度），缺省用默认前景色 */
  color?: string;
  /** 维度键（点击数字下钻用，缺省整行不可点击） */
  dim?: string;
  /** 子指标键（下钻时按子指标二次过滤，缺省=维度整体） */
  sub?: string;
}

const props = defineProps<{
  rows: LdTrendRow[];
  months: string[];
}>();

const emit = defineEmits<{ (e: 'cell-click', row: LdTrendRow, index: number): void }>();

const multiYear = computed(() => {
  const years = new Set(props.months.map((m) => m.slice(0, 4)));
  return years.size > 1;
});

function monthLabel(m: string): string {
  if (multiYear.value) return m.slice(2);
  return `${Number(m.slice(5))}月`;
}

/** 数字 > 0 才可下钻（0 / '—' 无可点击明细） */
function clickable(cell: number | string): boolean {
  return typeof cell === 'number' && cell > 0;
}
</script>

<template>
  <div v-if="rows.length && months.length" class="lt-scroll">
    <table class="lt-table">
      <thead>
        <tr>
          <th class="lt-dim">维度</th>
          <th v-for="m in months" :key="m" class="lt-month">{{ monthLabel(m) }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.label">
          <td class="lt-dim">{{ row.label }}</td>
          <td
            v-for="(cell, i) in row.values"
            :key="i"
            class="lt-cell"
            :class="{ 'lt-clickable': row.dim && clickable(cell) }"
            :style="row.color ? { color: row.color } : undefined"
            @click.stop="row.dim && clickable(cell) && emit('cell-click', row, i)"
          >
            {{ cell }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
  <div v-else class="lt-empty">暂无逐月数据</div>
</template>

<style scoped>
.lt-scroll {
  overflow-x: auto;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  background: hsl(var(--card));
}

.lt-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  min-width: max-content;
}

.lt-table th,
.lt-table td {
  padding: 6px 10px;
  text-align: center;
  border-bottom: 1px solid hsl(var(--border));
  border-right: 1px solid hsl(var(--border));
  white-space: nowrap;
}

.lt-table tr:last-child td {
  border-bottom: none;
}

.lt-table th:last-child,
.lt-table td:last-child {
  border-right: none;
}

.lt-dim {
  text-align: left !important;
  font-weight: 500;
  color: hsl(var(--foreground));
  background: hsl(var(--muted) / 0.35);
  position: sticky;
  left: 0;
  z-index: 1;
}

.lt-month {
  color: hsl(var(--muted-foreground));
  font-weight: 500;
  background: hsl(var(--card));
}

.lt-cell {
  font-variant-numeric: tabular-nums;
  color: hsl(var(--foreground));
}

.lt-clickable {
  cursor: pointer;
}

.lt-clickable:hover {
  color: hsl(var(--success));
  font-weight: 600;
}

.lt-table tbody tr:hover .lt-cell {
  background: color-mix(in srgb, hsl(var(--success)) 10%, transparent);
}

.lt-table tbody tr:hover .lt-dim {
  background: color-mix(in srgb, hsl(var(--success)) 16%, transparent);
}

.lt-empty {
  padding: 24px;
  text-align: center;
  color: hsl(var(--muted-foreground));
  font-size: 13px;
  border: 1px dashed hsl(var(--border));
  border-radius: 8px;
}
</style>
