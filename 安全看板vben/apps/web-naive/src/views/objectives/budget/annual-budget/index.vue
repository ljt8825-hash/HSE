<script lang="ts" setup>
/**
 * 年度预算（web-naive · 内存版骨架）
 * 安全费用预算及支出 → 三级菜单「年度预算」
 * 选年份 → 引用「物资价格库」单价 → 生成年度预算汇总表（分类/物资/计划数量/计划金额）→ 导出 Excel。
 *
 * 内存版：数据存于页面内存（SPA 会话内），未落库、未接后端。
 * 生成逻辑（年度填报表 / 自动带出单价 / 审批流）为后续补充项，本骨架提供可交互基础。
 */
import { computed, onMounted, reactive, ref } from 'vue';

import {
  NButton,
  NCard,
  NInputNumber,
  NSelect,
  NStatistic,
} from 'naive-ui';

import { HseDataGrid, HsePageLayout } from '#/components/hse';
import type { VxeTableGridColumns } from '#/adapter/vxe-table';
import { message } from '#/adapter/naive';
import { useMaterialPrice } from '../../_shared/useMaterialPrice';
import { exportExcel } from '../../_shared/excel';

defineOptions({ name: 'ObjectivesBudgetAnnual' });

const { materialData, materialCategories, loadMaterials } = useMaterialPrice();

// 进入页面即从后端加载已落库的物资价格
onMounted(loadMaterials);

const currentYear = new Date().getFullYear();
const selectedYear = ref(currentYear + 1);

const yearOptions = computed(() => {
  const opts: { label: string; value: number }[] = [];
  for (let y = currentYear - 1; y <= currentYear + 3; y += 1) {
    opts.push({ label: `${y} 年`, value: y });
  }
  return opts;
});

// 计划数量：key = `${year}__${materialId}`，存于内存（刷新丢失）
const quantities = reactive<Record<string, number>>({});
function qtyKey(year: number, id: string) {
  return `${year}__${id}`;
}
function getQty(year: number, id: string): number {
  return quantities[qtyKey(year, id)] ?? 0;
}
function setQty(year: number, id: string, val: number | null) {
  quantities[qtyKey(year, id)] = val ?? 0;
}

interface PlanRow {
  id: string;
  categoryKey: string;
  categoryLabel: string;
  name: string;
  spec: string;
  unitPrice: number;
  quantity: number;
  amount: number;
}

const rows = computed<PlanRow[]>(() => {
  const out: PlanRow[] = [];
  for (const cat of materialCategories) {
    for (const m of materialData[cat.key] || []) {
      const qty = getQty(selectedYear.value, m.id);
      out.push({
        id: m.id,
        categoryKey: cat.key,
        categoryLabel: cat.label,
        name: m.name,
        spec: m.spec,
        unitPrice: m.unitPrice,
        quantity: qty,
        amount: Number((qty * m.unitPrice).toFixed(4)),
      });
    }
  }
  return out;
});

const hasPriceData = computed(() => rows.value.length > 0);

const totalItems = computed(() => rows.value.length);
const totalAmount = computed(() =>
  Number(rows.value.reduce((sum, r) => sum + r.amount, 0).toFixed(4)),
);

const categorySummary = computed(() => {
  const map: Record<string, { label: string; count: number; amount: number }> = {};
  for (const r of rows.value) {
    const entry =
      map[r.categoryKey] ?? (map[r.categoryKey] = { label: r.categoryLabel, count: 0, amount: 0 });
    entry.count += 1;
    entry.amount = Number((entry.amount + r.amount).toFixed(4));
  }
  return Object.values(map);
});

const statItems = computed(() => [
  { key: 'year', label: '预算年度', value: `${selectedYear.value} 年` },
  { key: 'items', label: '物资总项数', value: totalItems.value },
  { key: 'amount', label: '预算总金额(万元)', value: totalAmount.value.toFixed(4) },
]);

const columns: VxeTableGridColumns = [
  {
    title: '序号',
    field: 'index',
    width: 70,
    align: 'center',
    formatter: (params: any) => (params?.rowIndex ?? 0) + 1,
  },
  { title: '分类', field: 'categoryLabel', width: 120, align: 'center' },
  { title: '物资名称', field: 'name', minWidth: 160, align: 'center', showOverflow: 'tooltip' },
  { title: '规格', field: 'spec', minWidth: 120, align: 'center', showOverflow: 'tooltip' },
  {
    title: '单价（万元）',
    field: 'unitPrice',
    width: 140,
    align: 'center',
    formatter: (params: any) => (params?.cellValue != null ? Number(params.cellValue).toFixed(4) : '-'),
  },
  {
    title: '计划数量',
    field: 'quantity',
    width: 150,
    align: 'center',
    slots: { default: 'qty' },
  },
  {
    title: '计划金额（万元）',
    field: 'amount',
    width: 150,
    align: 'center',
    formatter: (params: any) => (params?.cellValue != null ? Number(params.cellValue).toFixed(4) : '-'),
  },
];

const summaryColumns: VxeTableGridColumns = [
  {
    title: '序号',
    field: 'index',
    width: 70,
    align: 'center',
    formatter: (params: any) => (params?.rowIndex ?? 0) + 1,
  },
  { title: '分类', field: 'label', width: 160, align: 'center' },
  { title: '项数', field: 'count', width: 120, align: 'center' },
  {
    title: '合计金额（万元）',
    field: 'amount',
    width: 160,
    align: 'center',
    formatter: (params: any) => (params?.cellValue != null ? Number(params.cellValue).toFixed(4) : '-'),
  },
];

function syncFromPriceLibrary() {
  if (!hasPriceData.value) {
    message.warning('价格库暂无数据，请先在「物资价格库」导入物资');
    return;
  }
  message.success(`已引用价格库 ${totalItems.value} 项物资，请在「计划数量」列填写年度计划量`);
}

function exportAnnual() {
  const detail: (string | number)[][] = [
    ['分类', '物资名称', '规格', '单价（万元）', '计划数量', '计划金额（万元）'],
  ];
  for (const r of rows.value) {
    detail.push([r.categoryLabel, r.name, r.spec || '-', r.unitPrice, r.quantity, r.amount]);
  }
  const summary: (string | number)[][] = [['分类', '项数', '合计金额（万元）']];
  for (const s of categorySummary.value) {
    summary.push([s.label, s.count, s.amount]);
  }
  exportExcel(`年度安全费用预算_${selectedYear.value}.xlsx`, [
    { name: '预算明细', data: detail },
    { name: '分类汇总', data: summary },
  ]);
}
</script>

<template>
  <HsePageLayout title="年度预算">
    <template #extra>
      <div class="flex flex-wrap items-center gap-2">
        <NSelect
          v-model:value="selectedYear"
          placeholder="选择预算年度"
          style="width: 130px"
          :options="yearOptions"
        />
        <NButton @click="syncFromPriceLibrary">引用价格库</NButton>
        <NButton type="primary" @click="exportAnnual">导出</NButton>
      </div>
    </template>

    <div class="mb-4 grid grid-cols-3 gap-3">
      <NCard v-for="s in statItems" :key="s.key" :bordered="false">
        <NStatistic :label="s.label" :value="s.value" />
      </NCard>
    </div>

    <div v-if="!hasPriceData" class="py-12 text-center text-gray-400">
      价格库暂无数据。请先在「物资价格库」页导入消防器材 / 广告公司 / 安全物资 / 安全证的单价，
      再回到本页点击「引用价格库」生成年度预算。
    </div>

    <template v-else>
      <div class="mb-2 text-sm text-gray-500">
        明细表：引用价格库单价，在「计划数量」列填写 {{ selectedYear }} 年度计划量，计划金额自动计算。
      </div>
      <HseDataGrid
        :columns="columns"
        :data="rows"
        :loading="false"
        :pager="false"
        scroll-x="900"
      >
        <template #qty="{ row }">
          <NInputNumber
            :value="row.quantity"
            :min="0"
            :precision="0"
            size="small"
            style="width: 100%"
            @update:value="(v: number | null) => setQty(selectedYear, row.id, v)"
          />
        </template>
      </HseDataGrid>

      <div class="mt-6 mb-2 text-sm font-medium">分类汇总</div>
      <HseDataGrid
        :columns="summaryColumns"
        :data="categorySummary"
        :loading="false"
        :pager="false"
        scroll-x="500"
      />
    </template>
  </HsePageLayout>
</template>
