<script lang="ts" setup>
/**
 * 扣分明细（web-naive）
 * 从 web-antd 1:1 移植视觉意图：类别筛选 + 明细表 + 总扣分汇总。
 * 因 assessment-analysis API 未提供单条扣分明细端点，本组件改为基于
 * DeductionData.reasonAnalysis 按 reasonType 聚合展示（无额外后端调用）。
 */
import type { AssessmentAnalysisApi } from '#/api/hse/assessment-analysis';
import type { DataTableColumns } from 'naive-ui';

import { computed, h, ref } from 'vue';

import { NCard, NDataTable, NRadio, NRadioGroup, NTag } from 'naive-ui';

defineOptions({ name: 'DeductionDetail' });

type ReasonItem = AssessmentAnalysisApi.ReasonAnalysisItem;

const props = defineProps<{
  data: AssessmentAnalysisApi.DeductionData;
}>();

const categories = computed(() => {
  const unique = Array.from(new Set(props.data.reasonAnalysis.map((i) => i.reasonType)));
  return unique;
});

const currentCategory = ref<string>('');

// 默认选中第一个类别
if (categories.value.length > 0) {
  currentCategory.value = categories.value[0] ?? '';
}

const filteredItems = computed(() =>
  props.data.reasonAnalysis.filter((i) => i.reasonType === currentCategory.value),
);

const totalDeduction = computed(() =>
  filteredItems.value.reduce((sum, i) => sum + i.deductionPoints, 0),
);

function getSeverityType(severity: string): 'error' | 'warning' | 'info' | 'default' {
  const map: Record<string, 'error' | 'warning' | 'info' | 'default'> = {
    重大: 'error',
    较大: 'warning',
    一般: 'warning',
    轻微: 'info',
  };
  return map[severity] || 'default';
}

const columns: DataTableColumns<ReasonItem> = [
  { title: '具体原因', key: 'subReason', width: 200 },
  { title: '次数', key: 'count', width: 100, align: 'center' },
  {
    title: '扣分数',
    key: 'deductionPoints',
    width: 120,
    align: 'center',
    render: (row) =>
      h(
        'span',
        { class: 'points-deducted' },
        row.deductionPoints > 0 ? `-${row.deductionPoints}` : '0',
      ),
  },
  {
    title: '严重程度',
    key: 'severity',
    width: 120,
    align: 'center',
    render: (row) =>
      h(NTag, { type: getSeverityType(row.severity), size: 'small', bordered: false }, { default: () => row.severity }),
  },
];

function onCategoryChange(value: string) {
  currentCategory.value = value;
}
</script>

<template>
  <div class="deduction-detail">
    <NCard :bordered="false" class="category-selector">
      <span class="selector-label">扣分类别:</span>
      <NRadioGroup
        v-if="categories.length"
        :value="currentCategory"
        @update:value="onCategoryChange"
      >
        <NRadio v-for="cat in categories" :key="cat" :value="cat" :label="cat" />
      </NRadioGroup>
      <span v-else class="selector-label">暂无数据</span>
    </NCard>

    <NCard :bordered="false" class="total-deduction">
      <div class="deduction-summary">
        <span class="summary-label">总扣分:</span>
        <span class="summary-value">{{ totalDeduction }}</span>
        <span class="summary-unit">分</span>
      </div>
    </NCard>

    <NCard :bordered="false" class="detail-table-section">
      <NDataTable
        :columns="columns"
        :data="filteredItems"
        :pagination="false"
        size="small"
        :scroll-x="600"
      />
    </NCard>
  </div>
</template>

<style scoped>
.deduction-detail .category-selector {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.deduction-detail .selector-label {
  font-size: 14px;
  font-weight: 600;
  color: hsl(var(--foreground));
}

.deduction-detail .total-deduction {
  margin-bottom: 16px;
}

.deduction-detail .deduction-summary {
  display: flex;
  align-items: baseline;
  gap: 4px;
}

.deduction-detail .summary-label {
  font-size: 14px;
  color: hsl(var(--muted-foreground));
}

.deduction-detail .summary-value {
  font-size: 32px;
  font-weight: 700;
  color: #f5222d;
}

.deduction-detail .summary-unit {
  font-size: 14px;
  color: hsl(var(--muted-foreground));
}

.deduction-detail .points-deducted {
  color: #f5222d;
  font-weight: 700;
  font-size: 16px;
}
</style>
