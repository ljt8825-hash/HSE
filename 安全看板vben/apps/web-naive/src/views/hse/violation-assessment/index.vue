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
import { computed, nextTick, onActivated, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { VxeTableGridColumns } from '#/adapter/vxe-table';

import { NButton, NDropdown, NInputNumber, NModal, NSelect, NSpace, NSpin, NTag } from 'naive-ui';
import { IconifyIcon } from '@vben/icons';

import { HseDataGrid, HsePageLayout } from '#/components/hse';
import type { ViolationAssessmentApi } from '#/api/hse/violation-assessment';
import {
  getDriverDeductions,
  getViolationAssessmentConfig,
  getViolationAssessmentDeductions,
  getViolationAssessmentList,
  getUnrectifiedDeductions,
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
      value: Number(c.id), // 周期主键为 bigint，后端返回字符串；统一转数字以匹配 applyDrillQuery 的 Number(violCycle)
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
  if (key === 'manual_rectify') return row.rectifiedDeduct ?? 0;
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
/** 考核分数 = 当前展示的自动列扣分 + 当前展示的人工列数值 + 公司查处扣分（即「所属乡镇/作业中心」列至「考核分数」列之间分数的和） */
function totalScore(row: ViolationAssessmentApi.ListRow): number {
  let s = 0;
  for (const c of shownCols.value) {
    s += c.kind === 'auto' ? autoValue(row, c.key) : (manualCell(row, c.key) || 0);
  }
  // 公司查处扣分为固定列（不入列池增删），需单独计入考核分数
  s += row.companyDeduct?.score ?? 0;
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

// ===================== 扣分数字 → 二级悬浮明细（哪天/什么原因） =====================
/** 「未按时整改」明细缓存用虚拟 kind（非 hse_assessment_deduction 的真实 kind） */
const UNRECTIFIED_LEDGER_KEY = 'unrectified_ledger';
/** 「驾驶员三违」明细缓存用虚拟 kind（非 hse_assessment_deduction 的真实 kind，数据源 driver_monthly） */
const DRIVER_LEDGER_KEY = 'driver_ledger';
/** 自动列 key → 对应 hse_assessment_deduction.source_detail.kind（用于取明细） */
const DEDUC_KINDS: Record<string, string[]> = {
  grid: ['grid_unchecked_monthly'],
  violation: ['violation_event'],
  unrectified: ['violation_unrectified'],
  // 未按时整改：值来自台账实时推导（无落库扣分记录），明细走独立接口，虚拟 key 仅用于缓存索引与弹窗渲染
  manual_rectify: [UNRECTIFIED_LEDGER_KEY],
};
/** 自动列 key → 明细 kind 列表（不存在返回空数组） */
function deducKindsFor(colKey: string): string[] {
  return DEDUC_KINDS[colKey] ?? [];
}

/** 明细缓存：`${targetId}::${kindsKey}` -> 明细数组 | null（null=未加载） */
const deductionMap = ref<Record<string, ViolationAssessmentApi.DeductionDetail[] | null>>({});
const deductionLoading = ref<Record<string, boolean>>({});

function deducKey(row: ViolationAssessmentApi.ListRow, kindsKey: string): string {
  return `${String(row.targetId)}::${kindsKey}`;
}

async function loadDeductions(row: ViolationAssessmentApi.ListRow, kinds: string[]) {
  if (!selectedCycleId.value) return;
  const kindsKey = kinds.join(',');
  const key = deducKey(row, kindsKey);
  if (deductionMap.value[key] || deductionLoading.value[key]) return;
  deductionLoading.value[key] = true;
  try {
    const res = await getViolationAssessmentDeductions({
      cycleId: selectedCycleId.value,
      targetId: row.targetId,
      kinds,
    });
    deductionMap.value[key] = res?.list ?? [];
  } catch {
    deductionMap.value[key] = [];
  } finally {
    deductionLoading.value[key] = false;
  }
}

/** 「未按时整改」：从台账按乡镇逐条拉取真三违未整改明细（无落库扣分记录，走独立接口） */
async function loadUnrectifiedDeduct(row: ViolationAssessmentApi.ListRow) {
  if (!selectedCycleId.value) return;
  const key = deducKey(row, UNRECTIFIED_LEDGER_KEY);
  if (deductionMap.value[key] || deductionLoading.value[key]) return;
  deductionLoading.value[key] = true;
  try {
    const res = await getUnrectifiedDeductions({ cycleId: selectedCycleId.value, targetId: row.targetId });
    deductionMap.value[key] = res?.list ?? [];
  } catch {
    deductionMap.value[key] = [];
  } finally {
    deductionLoading.value[key] = false;
  }
}

/** 「驾驶员三违」：从 driver_monthly 按乡镇拉取当日驾驶员考核分（无落库扣分记录，走独立接口） */
async function loadDriverDeduct(row: ViolationAssessmentApi.ListRow) {
  if (!selectedCycleId.value) return;
  const key = deducKey(row, DRIVER_LEDGER_KEY);
  if (deductionMap.value[key] || deductionLoading.value[key]) return;
  deductionLoading.value[key] = true;
  try {
    const res = await getDriverDeductions({ cycleId: selectedCycleId.value, targetId: row.targetId });
    deductionMap.value[key] = (res?.list ?? []) as unknown as ViolationAssessmentApi.DeductionDetail[];
  } catch {
    deductionMap.value[key] = [];
  } finally {
    deductionLoading.value[key] = false;
  }
}

// ===================== 扣分明细弹窗（统一为「目标职责·自动评分」的分项+合计样式） =====================
const deductModalShow = ref(false);
/** 当前弹窗列：grid / violation / unrectified / company（company 数据在行内，无需接口） */
const deductColKey = ref<string>('');
const deductRow = ref<ViolationAssessmentApi.ListRow | null>(null);

function openAutoDeduct(row: ViolationAssessmentApi.ListRow, colKey: string) {
  deductRow.value = row;
  deductColKey.value = colKey;
  deductModalShow.value = true;
  if (colKey === 'manual_rectify') loadUnrectifiedDeduct(row);
  else if (colKey === 'driver') loadDriverDeduct(row);
  else loadDeductions(row, deducKindsFor(colKey));
}
function openCompanyDeduct(row: ViolationAssessmentApi.ListRow) {
  deductRow.value = row;
  deductColKey.value = 'company';
  deductModalShow.value = true;
}
function deductTitle(): string {
  if (deductColKey.value === 'company') return '公司查处扣分 · 扣分明细';
  const col = poolCols.value.find((c) => c.key === deductColKey.value);
  return `${(col && col.title) || deductColKey.value} · 扣分明细`;
}
const deductLoading = computed(() => {
  if (deductColKey.value === 'company') return false;
  if (!deductRow.value) return false;
  const kkey = deducKey(
    deductRow.value as any,
    deductColKey.value === 'driver' ? DRIVER_LEDGER_KEY : deducKindsFor(deductColKey.value).join(','),
  );
  return !!deductionLoading.value[kkey];
});
/** 网格缺巡：每条记录把缺巡日期展开为一行；无日期（历史数据）回退聚合说明 */
function gridRows(
  list: ViolationAssessmentApi.DeductionDetail[],
): { label: string; sub?: string; value: string }[] {
  const rows: { label: string; sub?: string; value: string }[] = [];
  for (const d of list) {
    const md = d.detail && d.detail.missedDates;
    const u = d.detail ? d.detail.unit : null;
    const unit = Number(u) > 0 ? Number(u) : 1;
    if (Array.isArray(md) && md.length) {
      // 逐日展开不得超过本次实扣分次数（2天1次/3天1次等非整日频率
      // 每日应巡为小数，逐日列表会多于缺次，故按实扣（score/unit）截取最早日期，保证与合计一致）
      const paid = Math.max(1, Math.ceil(Number(d.score || 0) / unit));
      for (let i = 0; i < md.length && i < paid; i++) {
        rows.push({ label: `${md[i]} 未巡查`, value: `-${formatScore(unit)} 分` });
      }
    } else if (d.detail && d.detail.summary) {
      rows.push({ label: d.detail.summary, value: `-${formatScore(d.score)} 分` });
    }
  }
  return rows;
}
/** 弹窗明细行：可定位行带 loc 目标（grid=网格长巡查台账 / driver=驾驶员月度考核） */
interface DeductRow {
  label: string;
  sub?: string;
  value: string;
  recordId?: string | number;
  month?: string;
  driver?: string;
  loc?: '' | 'grid' | 'driver';
}
/** 当前弹窗的分项行 */
const deductRows = computed<DeductRow[]>(() => {
  const row = deductRow.value;
  if (!row) return [];
  if (deductColKey.value === 'company') {
    const cd = row.companyDeduct;
    return (cd && cd.details ? cd.details : []).map((d) => ({
      label: `${d.date} ${d.violatorName} ${d.behavior}`,
      value: `-${formatScore(d.score)} 分`,
      recordId: d.recordId != null ? d.recordId : undefined,
      month: /^\d{4}-\d{2}/.test(d.date || '') ? String(d.date).slice(0, 7) : undefined,
      loc: d.recordId != null ? ('grid' as const) : '',
    }));
  }
  if (deductColKey.value === 'driver') {
    const list =
      (deductionMap.value[deducKey(row, DRIVER_LEDGER_KEY)] as unknown as import('#/api/hse/violation-assessment').DriverDeductDetail[]) ?? [];
    return list.map((d) => ({
      label: `${d.name}${d.department ? `（${d.department}）` : ''}`,
      sub: d.month ? `当月考核分 · ${d.month}` : undefined,
      value: `-${formatScore(d.score)} 分`,
      month: d.month,
      driver: d.name,
      loc: ('driver' as const),
    }));
  }
  const kkey = deducKindsFor(deductColKey.value).join(',');
  const list = deductionMap.value[deducKey(row, kkey)] ?? [];
  if (deductColKey.value === 'grid') return gridRows(list);
  return list.map((d) => {
    const dateStr = deducDateLabel(d);
    // 三违信息填报等从网格台账溯源：source_table=grid_inspection_records 时按 source_id 定位到网格台账原始记录
    const gridRecId = d.recordId != null ? d.recordId : d.sourceTable === 'grid_inspection_records' ? d.sourceId : undefined;
    return {
      label: `${dateStr !== '—' ? `${dateStr} ` : ''}${d.item || ''}`,
      sub: deducSub(d) || undefined,
      value: `-${formatScore(d.score)} 分`,
      recordId: gridRecId != null ? gridRecId : undefined,
      month: /^\d{4}-\d{2}/.test(dateStr) ? dateStr.slice(0, 7) : undefined,
      loc: gridRecId != null ? ('grid' as const) : '',
    };
  });
});

/** 点击可定位明细行：grid → 网格长巡查台账；driver → 驾驶员月度考核 */
const router = useRouter();
function locate(r?: DeductRow) {
  if (!r) return;
  deductModalShow.value = false;
  if (r.loc === 'driver') {
    void router.push({
      path: '/site/driver/monthly',
      query: { month: r.month || '', driver: r.driver || '' },
    });
    return;
  }
  if (r.loc === 'grid' && r.recordId != null) {
    void router.push({
      path: '/site/grid/ledger',
      query: {
        recordId: String(r.recordId),
        ...(r.month ? { month: r.month } : {}),
      },
    });
  }
}
const deductTotal = computed(() => {
  const row = deductRow.value;
  if (!row) return 0;
  if (deductColKey.value === 'company') return row.companyDeduct?.score ?? 0;
  if (deductColKey.value === 'driver') return row.driverDeduct ?? 0;
  const kkey = deducKindsFor(deductColKey.value).join(',');
  return (deductionMap.value[deducKey(row, kkey)] ?? []).reduce((a, d) => a + Number(d.score || 0), 0);
});

/** 明细日期显示：优先 violation_date；月度聚合类（如网格缺巡）无单日时回退到「年月」周期 */
function deducDateLabel(d: ViolationAssessmentApi.DeductionDetail): string {
  if (d.date) return d.date;
  const dt = d.detail;
  if (dt && dt.year && dt.month) return `${dt.year}-${String(dt.month).padStart(2, '0')}`;
  return '—';
}

/** 明细附加上下文（情况说明/行为/特殊项目/来源/扣至/备注）拼接，无则空串 */
function deducSub(d: ViolationAssessmentApi.DeductionDetail): string {
  const parts: string[] = [];
  const dt = d.detail;
  if (dt) {
    if (dt.summary) parts.push(String(dt.summary));
    if (dt.violationBehavior) parts.push(`行为：${dt.violationBehavior}`);
    if (dt.specialItem) parts.push(`特殊项目：${dt.specialItem}`);
    if (dt.checkSourceText) parts.push(`来源：${dt.checkSourceText}`);
    if (dt.deductPosition) parts.push(`扣至：${dt.deductPosition}`);
  }
  if (d.remark) parts.push(d.remark);
  return parts.join('；');
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
      title: '公司查处扣分',
      field: 'companyDeduct',
      minWidth: 110,
      align: 'center',
      slots: { default: 'companyDeduct' },
      titleHelp: {
        content: '来源：公司管理（总网格长+一级网格长：黄殿兴/刘金涛/张康/刘菲/韩晓亮/黄元同）当月查处三违的扣分；违章行为含「头盔/安全帽」每起→5 分，其他三违每起→1 分。管理员tab 按被查处人直接上级（班长/片区长）归属本人直接下属；乡镇作业中心经理 tab 按全镇累计。与二级菜单「三违分析」的公司查处扣分同口径同来源。',
      },
    },
    {
      title: '考核分数',
      field: 'scoreTotal',
      minWidth: 110,
      align: 'center',
      slots: { default: 'scoreTotal' },
      titleHelp: {
        content: '考核分数 = 当前展示的（网格长巡查考核 + 三违巡查 + 三违信息填报 + 各人工列 + 公司查处扣分）之和，即“所属乡镇/作业中心”列至本列之间展示分数的和。',
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

// 支持外部下钻：query 携带 violCycle（考核周期 id）/ violPos（岗位名）时，加载后自动定位
// （自动评分页「三违管理」列扣分明细点击下钻使用；无 query 时行为与默认一致）
const route = useRoute();

// 支持外部定位：query 携带 violTarget（目标 targetId）时，加载后高亮定位到该人所在行。
// 高亮停留 HIGHLIGHT_HOLD_MS 后自动淡出（fading 触发 CSS 过渡），间隔至全部清除，避免常驻高亮。
const HIGHLIGHT_HOLD_MS = 3000;
const HIGHLIGHT_FADE_MS = 800;
const hlTargetId = ref<number | null>(null);
const hlFading = ref(false);
let hlTimer: ReturnType<typeof setTimeout> | null = null;
function locateRowClassName(params: { row: any }): string {
  if (hlTargetId.value == null || String(params?.row?.targetId) !== String(hlTargetId.value)) {
    return '';
  }
  return hlFading.value ? 'viol-locate-row viol-locate-fading' : 'viol-locate-row';
}
function clearHlTimer() {
  if (hlTimer) {
    clearTimeout(hlTimer);
    hlTimer = null;
  }
}
function scrollToHlRow() {
  if (hlTargetId.value == null) return;
  // 等 VXE 渲染目标行后再滚动聚焦到该行
  nextTick(() => {
    setTimeout(() => {
      const el = document.querySelector<HTMLElement>(
        `.vxe-body--row[data-row-key="${hlTargetId.value}"]`,
      );
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      // 定位触发后：先停留，再淡出，最后清除
      clearHlTimer();
      hlFading.value = false;
      hlTimer = setTimeout(() => {
        hlFading.value = true;
        hlTimer = setTimeout(() => {
          hlTargetId.value = null;
          hlFading.value = false;
        }, HIGHLIGHT_FADE_MS);
      }, HIGHLIGHT_HOLD_MS);
    }, 120);
  });
}
onUnmounted(() => {
  clearHlTimer();
});

/** 从路由 query 应用外部下钻参数（岗位/周期/目标行），并加载后定位高亮目标行 */
async function applyDrillQuery() {
  const qPos = route.query.violPos;
  if (qPos && POSITIONS.includes(qPos as any)) activePosition.value = qPos as string;
  const qCycle = route.query.violCycle;
  if (qCycle) {
    const id = Number(qCycle);
    if (Number.isFinite(id) && id > 0) selectedCycleId.value = id;
  }
  const qTarget = route.query.violTarget;
  if (qTarget) {
    const t = Number(qTarget);
    if (Number.isFinite(t) && t > 0) hlTargetId.value = t;
  }
  await loadCycles();
  if (selectedCycleId.value) {
    await loadAll();
    scrollToHlRow();
  }
}

onMounted(() => {
  applyDrillQuery();
});

// Tabbar keep-alive：页面被缓存后 onMounted 不再触发。再次从自动评分页三违列下钻进入
// （query.violCycle/violPos/violTarget 变化）时，重新加载并定位高亮目标行。
watch(
  () => [route.query.violCycle, route.query.violPos, route.query.violTarget],
  () => {
    applyDrillQuery();
  },
);
// keep-alive：每次标签页被重新激活（再次下钻进入）时，仅当携带 violTarget 才重新定位高亮，
// 避免普通切换标签页时重复重载整页数据。
onActivated(() => {
  const t = Number(route.query.violTarget);
  if (Number.isFinite(t) && t > 0) applyDrillQuery();
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
    <HseDataGrid :columns="allColumns" :data="rows" :loading="loading || loadingConfig" :pager="false" row-key="targetId" :row-class-name="locateRowClassName">
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
        <template v-else-if="column?.field && (DEDUC_KINDS[String(column.field)] || String(column.field) === 'driver') && autoValue(row as any, String(column.field)) > 0">
          <NTag
            :bordered="false"
            size="small"
            type="warning"
            class="deduc-click"
            @click="openAutoDeduct(row as any, String(column.field))"
          >
            {{ formatScore(autoValue(row as any, String(column.field))) }}
          </NTag>
        </template>
        <NTag v-else-if="autoValue(row as any, String(column?.field)) > 0" :bordered="false" size="small" type="warning">
          {{ formatScore(autoValue(row as any, String(column?.field))) }}
        </NTag>
        <NTag v-else :bordered="false" size="small" type="success">{{ formatScore(autoValue(row as any, String(column?.field))) }}</NTag>
      </template>
      <template #companyDeduct="{ row }">
        <NTag
          v-if="(row.companyDeduct?.score ?? 0) > 0"
          :bordered="false"
          size="small"
          type="warning"
          class="deduc-click"
          @click="openCompanyDeduct(row as any)"
        >
          {{ formatScore(row.companyDeduct?.score) }}
        </NTag>
        <NTag v-else :bordered="false" size="small" type="success">
          {{ formatScore(row.companyDeduct?.score ?? 0) }}
        </NTag>
      </template>
      <template #scoreTotal="{ row }">
        <NTag v-if="totalScore(row) > 0" :bordered="false" size="small" type="error">
          {{ formatScore(totalScore(row)) }}
        </NTag>
        <NTag v-else :bordered="false" size="small" type="success">{{ formatScore(totalScore(row)) }}</NTag>
      </template>
    </HseDataGrid>

    <!-- 扣分明细：统一「目标职责·自动评分」的分项+合计弹窗样式 -->
    <NModal
      v-model:show="deductModalShow"
      preset="card"
      :title="deductTitle()"
      style="width: 420px; max-width: 92vw"
      :mask-closable="true"
    >
      <div class="sanwei-breakdown">
        <NSpin :show="deductLoading">
          <div
            v-for="(r, ri) in deductRows"
            :key="ri"
            class="sanwei-breakdown-item"
            :class="{ 'locate-link': !!r.loc }"
            @click="r.loc && locate(r)"
          >
            <div class="sanwei-breakdown-main">
              <span class="sanwei-breakdown-label">{{ r.label }}</span>
              <span v-if="r.sub" class="sanwei-breakdown-sub">{{ r.sub }}</span>
            </div>
            <span class="sanwei-breakdown-val">{{ r.value }}</span>
          </div>
          <div v-if="!deductLoading && deductRows.length === 0" class="sanwei-breakdown-empty">
            暂无扣分明细
          </div>
          <div class="sanwei-breakdown-total">
            <span>合计</span>
            <span>{{ formatScore(deductTotal) }} 分</span>
          </div>
        </NSpin>
      </div>
    </NModal>
  </HsePageLayout>
</template>

<style scoped>
/* 人工列（增加列）数字输入框内容居中对齐 */
.manual-cell-center {
  :deep(.n-input__input-el) {
    text-align: center;
  }
}

/* 可点击的扣分数字 */
.deduc-click {
  cursor: pointer;
  transition: filter 0.15s;
  &:hover {
    filter: brightness(1.15);
  }
}

/* 扣分明细弹窗 · 统一「目标职责·自动评分」的分项+合计样式 */
.sanwei-breakdown {
  min-width: 240px;
}
.sanwei-breakdown-item {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  padding: 5px 6px;
  border-radius: 4px;
}
.sanwei-breakdown-item:hover {
  background: rgba(245, 158, 11, 0.14);
}
/* 可定位行：hover 强调 + 表意点击（未按时整改明细 → 跳转网格台账原始记录） */
.sanwei-breakdown-item.locate-link {
  cursor: pointer;
}
.sanwei-breakdown-item.locate-link:hover {
  background: rgba(37, 99, 235, 0.12);
  box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.35);
}
.sanwei-breakdown-main {
  min-width: 0;
  flex: 1;
}
.sanwei-breakdown-label {
  display: block;
  font-size: 13px;
  line-height: 1.5;
  word-break: break-word;
}
.sanwei-breakdown-sub {
  display: block;
  margin-top: 2px;
  font-size: 12px;
  color: var(--v-ben-muted-foreground, #6b7280);
  line-height: 1.4;
}
.sanwei-breakdown-val {
  flex-shrink: 0;
  font-weight: 600;
  color: #d97706;
  font-variant-numeric: tabular-nums;
}
.sanwei-breakdown-total {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  border-top: 1px dashed #d0d5dd;
  margin-top: 6px;
  padding: 6px 6px 0;
  font-weight: 600;
}
.sanwei-breakdown-empty {
  padding: 12px 6px;
  text-align: center;
  color: #8a919f;
  font-size: 13px;
}

/* 外部下钻定位到目标人所在行：高亮该行（自动评分页三违明细点击跳转）。
   停留后加 .viol-locate-fading 触发背景/文字色过渡淡出，再被置空彻底取消高亮 */
:deep(.vxe-body--row.viol-locate-row) {
  background: rgba(37, 99, 235, 0.14) !important;
  transition:
    background-color 0.8s ease,
    color 0.8s ease;
}
:deep(.vxe-body--row.viol-locate-row.viol-locate-fading) {
  background: rgba(37, 99, 235, 0) !important;
}
:deep(.vxe-body--row.viol-locate-row.viol-locate-fading .vxe-cell) {
  color: inherit;
  font-weight: 400;
}
:deep(.vxe-body--row.viol-locate-row .vxe-cell) {
  color: #1d4ed8;
  font-weight: 600;
}
</style>