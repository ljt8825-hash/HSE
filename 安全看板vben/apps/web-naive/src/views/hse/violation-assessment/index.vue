<script lang="ts" setup>
/**
 * 三违管理考核（web-naive · 二级菜单「三违管理」→ 三级「三违管理考核」；镜像于「目标职责/月度考核门户」）
 * 分 Tab：乡镇作业中心经理 / 管理员。每 Tab 按「考核周期」筛选。
 * 列池对齐「安全文化建设」的活动列交互：
 *   - 预置列池：3 个自动列（网格长巡查考核/三违巡查/三违信息填报，值来自已落库扣分，只读）
 *                + 若干人工列（未按时整改/违章指挥/劳保用品未佩戴/无证上岗/现场隐患未上报，可手填，计入考核分数）。
 *   - 「增加列」= 下拉，从列池中选择当前隐藏的列显示；
 *   - 「删除列」= 下拉，隐藏当前显示的列（数据保留，可再「增加列」恢复）。
 *   - 列显隐持久化到 hse_sanwei_ledger_config（按 周期+岗位）；人工列数值经「保存」落库。
 * 自动列扣分来源（hse_assessment_deduction 已落库生效值，只读）：
 *   网格长巡查考核 = kind grid_unchecked_monthly；三违巡查 = kind violation_event；三违信息填报 = kind violation_unrectified。
 */
import { computed, onMounted, ref } from 'vue';
import type { VxeTableGridColumns } from '#/adapter/vxe-table';

import { NButton, NDropdown, NInputNumber, NSelect, NSpace, NTag } from 'naive-ui';
import { IconifyIcon } from '@vben/icons';

import { HseDataGrid, HsePageLayout } from '#/components/hse';
import type { ViolationAssessmentApi } from '#/api/hse/violation-assessment';
import {
  getViolationAssessmentConfig,
  getViolationAssessmentList,
  saveViolationAssessmentConfig,
} from '#/api/hse/violation-assessment';
import { getAssessmentCycleList } from '#/api/hse/assessment-monthly';
import { message } from '#/adapter/naive';

defineOptions({ name: 'ViolationAssessment' });

const POSITIONS = ['乡镇作业中心经理', '管理员'] as const;
const POSITION_TABS = POSITIONS.map((p) => ({ label: p, key: p }));

// ===================== 考核周期下拉 =====================
const cycleOptions = ref<{ label: string; value: number }[]>([]);
const selectedCycleId = ref<number | null>(null);
const loadingCycles = ref(false);

async function loadCycles() {
  loadingCycles.value = true;
  try {
    const res = await getAssessmentCycleList({ page: 1, page_size: 200, sort_by: 'id', sort_order: 'DESC' });
    const list = res?.list ?? [];
    cycleOptions.value = list.map((c) => ({
      label: `${c.assessmentYear}-${String(c.assessmentMonth).padStart(2, '0')}（${c.cycleCode}）`,
      value: c.id,
    }));
    if (!cycleOptions.value.some((o) => o.value === selectedCycleId.value)) {
      selectedCycleId.value = cycleOptions.value[0]?.value ?? null;
    }
  } catch {
    cycleOptions.value = [];
  } finally {
    loadingCycles.value = false;
  }
}

// ===================== Tab：岗位 =====================
const activePosition = ref<string>('乡镇作业中心经理');

// ===================== 列表：考核对象 + 三自动列扣分 =====================
const loading = ref(false);
const rows = ref<ViolationAssessmentApi.ListRow[]>([]);

async function loadList() {
  if (!selectedCycleId.value || !activePosition.value) return;
  loading.value = true;
  try {
    const res = await getViolationAssessmentList({
      cycleId: selectedCycleId.value,
      position: activePosition.value,
    });
    rows.value = res?.rows ?? [];
  } catch {
    rows.value = [];
  } finally {
    loading.value = false;
  }
}

// ===================== 列池（预置） =====================
const poolCols = ref<ViolationAssessmentApi.CustomColumn[]>([]);
const cells = ref<Record<string, Record<string, number>>>({});
const loadingConfig = ref(false);

async function loadConfig() {
  if (!selectedCycleId.value || !activePosition.value) return;
  loadingConfig.value = true;
  try {
    const res = await getViolationAssessmentConfig({
      cycleId: selectedCycleId.value,
      position: activePosition.value,
    });
    poolCols.value = res?.columns ?? [];
    cells.value = res?.cells ?? {};
  } catch {
    poolCols.value = [];
    cells.value = {};
  } finally {
    loadingConfig.value = false;
  }
}

async function loadAll() {
  await Promise.all([loadList(), loadConfig()]);
}

// ===================== 增加列 / 删除列（下拉，对齐安全文化建设） =====================
const shownCols = computed(() => poolCols.value.filter((c) => c.shown));
const addableOptions = computed(() =>
  poolCols.value.filter((c) => !c.shown).map((c) => ({ label: c.title, key: c.key })),
);
const removableOptions = computed(() =>
  poolCols.value.filter((c) => c.shown).map((c) => ({ label: c.title, key: c.key })),
);

function cleanCellsForPersist(): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const [ek, rc] of Object.entries(cells.value)) {
    const clean: Record<string, number> = {};
    for (const [k, v] of Object.entries(rc ?? {})) {
      const n = Number(v);
      if (!Number.isNaN(n)) clean[k] = n;
    }
    out[ek] = clean;
  }
  return out;
}

async function persistConfig(tip?: string) {
  if (!selectedCycleId.value || !activePosition.value) return;
  await saveViolationAssessmentConfig({
    cycleId: selectedCycleId.value,
    position: activePosition.value,
    columns: poolCols.value,
    cells: cleanCellsForPersist(),
  });
  if (tip) message.success(tip);
}

async function handleAddColumn(key: string | number) {
  const col = poolCols.value.find((c) => c.key === String(key));
  if (!col || col.shown) return;
  col.shown = true;
  await persistConfig(`已增加「${col.title}」列`);
}
async function handleRemoveColumn(key: string | number) {
  const col = poolCols.value.find((c) => c.key === String(key));
  if (!col || !col.shown) return;
  col.shown = false;
  await persistConfig(`已删除「${col.title}」列（数据保留，可再增加）`);
}

// ===================== 单元格与考核分数 =====================
function autoValue(row: ViolationAssessmentApi.ListRow, key: string): number {
  if (key === 'grid') return row.gridDeduct ?? 0;
  if (key === 'violation') return row.violationDeduct ?? 0;
  if (key === 'unrectified') return row.unrectifiedDeduct ?? 0;
  if (key === 'driver') return row.driverDeduct ?? 0;
  return 0;
}
function manualCell(row: ViolationAssessmentApi.ListRow, colKey: string): number {
  return cells.value[String(row.employeeId)]?.[colKey] ?? 0;
}
function setManualCell(row: ViolationAssessmentApi.ListRow, colKey: string, v: number | null) {
  const ek = String(row.employeeId);
  cells.value[ek] = cells.value[ek] ?? {};
  cells.value[ek]![colKey] = v == null ? 0 : v;
}
/** 考核分数 = 当前展示的自动列扣分 + 当前展示的人工列数值（即「所属乡镇/作业中心」列至「考核分数」列之间分数的和） */
function totalScore(row: ViolationAssessmentApi.ListRow): number {
  let s = 0;
  for (const c of shownCols.value) {
    s += c.kind === 'auto' ? autoValue(row, c.key) : (manualCell(row, c.key) || 0);
  }
  return Math.round(s * 100) / 100;
}

function formatScore(v: number | null | undefined): string {
  if (v == null || Number.isNaN(Number(v))) return '-';
  const n = Number(v);
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}
function deptText(row: ViolationAssessmentApi.ListRow): string {
  return row.township || row.department || '-';
}

// ===================== 列 =====================
const baseColumns = [
  { type: 'checkbox', width: 50, align: 'center' as const, fixed: 'left' as const },
  { type: 'seq', title: '序号', width: 70, align: 'center' as const },
  { title: '姓名', field: 'name', minWidth: 110, align: 'center' as const },
  { title: '岗位', field: 'position', minWidth: 130, align: 'center' as const },
  { title: '所属乡镇/作业中心', field: 'dept', minWidth: 150, align: 'center' as const, showOverflow: 'tooltip' as const, slots: { default: 'dept' } },
];

const colHelp: Record<string, string> = {
  grid: '来源：二级菜单「网格管理」扣分项（kind=grid_unchecked_monthly），网格长巡查次数不达标/未完成巡检按月落库的生效扣分。',
  violation: '来源：二级菜单「三违管理」扣分项——巡查次数是否达标（kind=violation_event，一条违规记录=一条扣分）。',
  unrectified: '来源：三违台账中信息填报问题（kind=violation_unrectified）。',
  driver: '来源：三级菜单「驾驶员月度考核」当考核月份「考核分数」列之和（五项子项合计 + 当月三违条数），按部门乡镇归属合计该乡镇匹配驾驶员分数；仅「乡镇作业中心经理」tab 回填，管理员为 0。',
};

function buildColumn(c: ViolationAssessmentApi.CustomColumn): Record<string, any> {
  const col: Record<string, any> = {
    title: c.title,
    field: c.key,
    key: c.key,
    minWidth: c.kind === 'manual' ? 120 : 110,
    align: 'center',
    showOverflow: 'tooltip',
    slots: { default: 'cell' },
  };
  if (c.kind === 'auto' && colHelp[c.key]) col.titleHelp = { content: colHelp[c.key] };
  return col;
}

const allColumns = computed<VxeTableGridColumns>(() =>
  [
    ...baseColumns,
    ...shownCols.value.map(buildColumn),
    {
      title: '考核分数',
      field: 'scoreTotal',
      minWidth: 110,
      align: 'center',
      slots: { default: 'scoreTotal' },
      titleHelp: {
        content: '考核分数 = 当前展示的（网格长巡查考核 + 三违巡查 + 三违信息填报 + 各人工列）之和，即“所属乡镇/作业中心”列至本列之间展示分数的和。',
      },
    },
  ] as VxeTableGridColumns,
);

// ===================== 保存 =====================
const saving = ref(false);
async function onSaveConfig() {
  if (!selectedCycleId.value || !activePosition.value) {
    message.warning('请先选择考核周期');
    return;
  }
  saving.value = true;
  try {
    await persistConfig();
    message.success('已保存');
  } catch {
    /* 拦截器已提示 */
  } finally {
    saving.value = false;
  }
}

// ===================== 交互 =====================
async function onCycleChange() {
  await loadAll();
}
async function onPositionChange() {
  await loadAll();
}

onMounted(async () => {
  await loadCycles();
  if (selectedCycleId.value) await loadAll();
});
</script>

<template>
  <HsePageLayout
    title="三违管理考核"
    description="三违管理 · 乡镇作业中心经理 / 管理员三违相关扣分考核台账（列池下拉增删，对齐安全文化建设）"
  >
    <template #extra>
      <NSpace>
        <NButton type="primary" :disabled="!selectedCycleId" :loading="saving" @click="onSaveConfig">
          <template #icon><IconifyIcon icon="lucide:save" /></template>
          保存
        </NButton>
        <NButton :disabled="!rows.length" color="#2563eb" @click="loadAll">
          <template #icon><IconifyIcon icon="lucide:refresh-cw" /></template>
          刷新
        </NButton>
      </NSpace>
    </template>

    <!-- Tab：乡镇作业中心经理 / 管理员 -->
    <div class="mb-4 flex items-center rounded-md bg-muted p-1">
      <button
        v-for="tab in POSITION_TABS"
        :key="tab.key"
        class="rounded px-3 py-1 text-sm transition-colors"
        :class="
          activePosition === tab.key
            ? 'bg-background font-medium shadow-sm'
            : 'text-muted-foreground hover:bg-muted/70'
        "
        @click="activePosition = tab.key; onPositionChange()"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- 考核周期下拉 + 增加列/删除列（下拉按钮，对齐安全文化建设） -->
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <NSelect
        v-model:value="selectedCycleId"
        placeholder="请选择考核周期"
        :options="cycleOptions"
        :loading="loadingCycles"
        clearable
        style="max-width: 320px"
        @update:value="onCycleChange"
      />
      <NSpace>
        <NDropdown :options="addableOptions" trigger="click" @select="handleAddColumn">
          <NButton :disabled="!addableOptions.length" :loading="loadingConfig">
            <template #icon><IconifyIcon icon="lucide:columns" /></template>
            增加列
          </NButton>
        </NDropdown>
        <NDropdown :options="removableOptions" trigger="click" @select="handleRemoveColumn">
          <NButton :disabled="!removableOptions.length" :loading="loadingConfig">
            <template #icon><IconifyIcon icon="lucide:delete" /></template>
            删除列
          </NButton>
        </NDropdown>
      </NSpace>
    </div>

    <!-- 说明：增删列仅控制展示，数据保留 -->
    <div class="mb-4 text-xs text-muted-foreground">
      「增加列」从预置列池选择隐藏的列展示；「删除列」隐藏当前展示的列（数据保留，可再增加）。展示列数变化后请「保存」。
    </div>

    <!-- 列表 -->
    <HseDataGrid :columns="allColumns" :data="rows" :loading="loading || loadingConfig" :pager="false" row-key="targetId">
      <template #dept="{ row }">
        <span>{{ deptText(row) }}</span>
      </template>
      <template #cell="{ row, column }">
        <template v-if="(poolCols.find((c) => c.key === column?.field) || {}).kind === 'manual'">
          <NInputNumber
            class="manual-cell-center"
            :value="manualCell(row as any, String(column?.field))"
            :min="0"
            size="small"
            style="width: 100px"
            @update:value="(v) => setManualCell(row as any, String(column?.field), v as any)"
          />
        </template>
        <NTag v-else-if="autoValue(row as any, String(column?.field)) > 0" :bordered="false" size="small" type="error">
          {{ formatScore(autoValue(row as any, String(column?.field))) }}
        </NTag>
        <span v-else>{{ formatScore(autoValue(row as any, String(column?.field))) }}</span>
      </template>
      <template #scoreTotal="{ row }">
        <NTag v-if="totalScore(row) > 0" :bordered="false" size="small" type="warning">
          {{ formatScore(totalScore(row)) }}
        </NTag>
        <span v-else>{{ formatScore(totalScore(row)) }}</span>
      </template>
    </HseDataGrid>
  </HsePageLayout>
</template>

<style scoped>
/* 人工列（增加列）数字输入框内容居中对齐 */
.manual-cell-center {
  :deep(.n-input__input-el) {
    text-align: center;
  }
}
</style>