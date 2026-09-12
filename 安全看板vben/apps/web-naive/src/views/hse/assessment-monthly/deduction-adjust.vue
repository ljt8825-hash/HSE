<script lang="ts" setup>
/**
 * 扣分调整 → 考核标准配置（web-naive）
 * 依据：管理员月度安全生产管理考核标准.xlsx / 乡镇作业中心经理月度安全生产管理考核标准.xlsx
 * 能力：按岗位（管理员/乡镇作业中心经理）Tab 展示考核项；考核项/扣分标准/分值可单元格编辑，
 *      编辑关闭即保存，后续评分/扣分按修改后的标准计算。
 * 列：序号/项目分类/考核项·基本要求/扣（加）分标准/分值/类型/备注。
 */
import { computed, onMounted, ref } from 'vue';
import type { VxeTableGridColumns } from '#/adapter/vxe-table';

import { NAlert, NButton, NTabs, NTabPane, NTag } from 'naive-ui';
import { RotateCw } from '@vben/icons';

import {
  HseDataGrid,
} from '#/components/hse';
import {
  getStandardList,
  updateStandard,
  type AssessmentMonthlyApi,
} from '#/api/hse/assessment-monthly';
import { message } from '#/adapter/naive';

defineOptions({ name: 'AssessmentMonthlyAdjust' });

const loading = ref(false);
const standardGroups = ref<AssessmentMonthlyApi.StandardGroup[]>([]);
const activePosition = ref<string>('manager');

const gridRef = ref<InstanceType<typeof HseDataGrid> | null>(null);

const RULE_TYPE_TEXT: Record<string, string> = {
  deduction: '扣分',
  bonus: '加分',
  veto: '否决',
};
const RULE_TYPE_TAG: Record<string, 'error' | 'success' | 'warning' | 'info' | 'neutral'> = {
  deduction: 'error',
  bonus: 'success',
  veto: 'warning',
};

const currentItems = computed<AssessmentMonthlyApi.AssessmentStandard[]>(() => {
  const group = standardGroups.value.find((g) => g.position === activePosition.value);
  return group?.items || [];
});

const columns = computed<VxeTableGridColumns>(() => [
  { title: '序号', field: 'sortOrder', width: 60, align: 'center' },
  { title: '项目分类', field: 'category', minWidth: 140, align: 'left', showOverflow: 'tooltip' },
  {
    title: '考核项 / 基本要求',
    field: 'itemName',
    minWidth: 260,
    align: 'left',
    showOverflow: 'tooltip',
    editRender: { name: 'input' },
  },
  {
    title: '扣（加）分标准',
    field: 'deductionRule',
    minWidth: 260,
    align: 'left',
    showOverflow: 'tooltip',
    editRender: { name: 'input' },
  },
  {
    title: '分值',
    field: 'deductionScore',
    width: 110,
    align: 'center',
    slots: { default: 'scoreCell' },
    editRender: { name: 'input', props: { type: 'number' } },
  },
  { title: '类型', field: 'ruleType', width: 90, align: 'center', slots: { default: 'typeCell' } },
  { title: '备注', field: 'remark', width: 100, align: 'center' },
]);

async function loadData() {
  loading.value = true;
  try {
    const res = await getStandardList();
    standardGroups.value = res.positions || [];
    if (standardGroups.value.length > 0) {
      const exists = standardGroups.value.some((g) => g.position === activePosition.value);
      if (!exists) {
        activePosition.value = standardGroups.value[0]!.position;
      }
    }
  } catch {
    standardGroups.value = [];
  } finally {
    loading.value = false;
  }
}

function handleTabChange(position: string) {
  activePosition.value = position;
}

function scoreText(row: AssessmentMonthlyApi.AssessmentStandard) {
  if (row.deductionScore === null || row.deductionScore === undefined) return '-';
  const v = Number(row.deductionScore);
  if (row.ruleType === 'bonus') return `+${v}`;
  if (row.ruleType === 'veto') return '否决';
  return `${v}`;
}

async function onCellEditClosed(payload: { row: AssessmentMonthlyApi.AssessmentStandard; column: any }) {
  const row = payload?.row;
  if (!row?.id) return;
  const $grid = gridRef.value?.gridApi?.grid as any;
  if ($grid && typeof $grid.validate === 'function') {
    const result = await $grid.validate(row);
    const isValid = result === true || result === undefined || result === null;
    if (!isValid) {
      $grid.revertData(row);
      return;
    }
  }
  try {
    await updateStandard(row.id, {
      item_name: row.itemName,
      deduction_rule: row.deductionRule,
      deduction_score:
        row.deductionScore === null || row.deductionScore === undefined || row.deductionScore === ''
          ? null
          : Number(row.deductionScore),
    });
    message.success('考核标准已更新，后续评分按新标准计算');
  } catch {
    /* 拦截器已提示 */
  }
}

onMounted(() => {
  loadData();
});
</script>

<template>
  <div>
    <div class="mb-3 flex items-center justify-between">
      <NAlert type="info" :show-icon="true" class="min-w-0 flex-1 mr-3">
        <template #header>考核标准配置说明</template>
        本页按岗位展示月度安全生产管理考核标准。考核项、扣（加）分标准、分值均可直接点击单元格修改，
        修改后自动保存，后续评分 / 扣分将按修改后的标准计算。
      </NAlert>
      <NButton :loading="loading" @click="loadData">
        <template #icon><RotateCw :size="16" /></template>
        刷新
      </NButton>
    </div>

    <NTabs v-model:value="activePosition" type="line" animated class="mb-3" @update:value="handleTabChange">
      <NTabPane
        v-for="group in standardGroups"
        :key="group.position"
        :name="group.position"
        :tab="`${group.positionName}（${group.items.length} 项）`"
      />
    </NTabs>

    <HseDataGrid
      ref="gridRef"
      :columns="columns"
      :data="currentItems"
      :loading="loading"
      :pager="false"
      editable
      edit-mode="cell"
      auto-width
      @edit-closed="onCellEditClosed"
    >
      <template #scoreCell="{ row }">
        <span
          :class="{
            'text-danger font-semibold': row.ruleType === 'deduction',
            'text-success font-semibold': row.ruleType === 'bonus',
            'text-warning font-semibold': row.ruleType === 'veto',
          }"
        >
          {{ scoreText(row) }}
        </span>
      </template>
      <template #typeCell="{ row }">
        <NTag :bordered="false" size="small" :type="RULE_TYPE_TAG[row.ruleType] || 'default'">
          {{ RULE_TYPE_TEXT[row.ruleType] || row.ruleType }}
        </NTag>
      </template>
    </HseDataGrid>
  </div>
</template>

<style scoped>
.text-danger {
  color: hsl(var(--error));
}
.text-success {
  color: hsl(var(--success));
}
.text-warning {
  color: hsl(var(--warning));
}
</style>
