<script lang="ts" setup>
/**
 * 安全文化建设（web-naive · 一级菜单「目标职责」→ 二级「安全文化建设」）
 * UI 布局参照三级菜单「月度考核」（site/driver/monthly）：
 *   HsePageLayout(title+description) → #extra 动作栏 → 月份下拉(内容区首个子元素) →
 *   HseSearchPanel 筛选 → HseDataGrid 列表(checkbox+操作列) → 详情抽屉。
 * 后端契约：GET /api/hse/safety-culture/list（只读查询+计算扣分）、POST /import（选月份上传专项活动台帐Excel）。
 * 扣分口径：表格「扣分」列>0 优先；否则按未开展√项×单位分值；生效扣分被类别上限钳制。
 */
import { computed, nextTick, onActivated, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import type { VxeTableGridColumns } from '#/adapter/vxe-table';

import {
  NButton,
  NAlert,
  NCheckbox,
  NDescriptions,
  NDescriptionsItem,
  NDrawer,
  NDrawerContent,
  NDropdown,
  NGi,
  NInput,
  NInputNumber,
  NModal,
  NSelect,
  NSpace,
  NTag,
} from 'naive-ui';
import { IconifyIcon } from '@vben/icons';

import { HseActionBar, HseDataGrid, HsePageLayout, HseSearchPanel, type HseActionKey } from '#/components/hse';
import type { SafetyCultureApi } from '#/api/hse/safety-culture';
import { getSafetyCultureList, importSafetyCulture, saveLedger, deleteLedger, continueLedgerMonthly } from '#/api/hse/safety-culture';
import { dialog, message } from '#/adapter/naive';

defineOptions({ name: 'SafetyCulture' });

// ===================== 列表数据 =====================
const loading = ref(false);
const allRows = ref<SafetyCultureApi.Record[]>([]);
const data = ref<SafetyCultureApi.Record[]>([]);
const total = ref(0);

const searchForm = reactive({ level: '', dept: '', keyword: '' });

const levelOptions = [
  { label: '乡镇主管（经理）', value: '乡镇主管' },
  { label: '管理员', value: '管理员' },
];

/** 当前选中月份（列表按此过滤），下拉选项由数据中的月份动态生成 */
const selectedMonth = ref('');
const monthOptions = ref<{ label: string; value: string }[]>([]);

// 支持外部下钻：query 携带 month（YYYY-MM）/ level（岗位：乡镇主管/管理员）时，加载后自动定位
// （自动评分页「安全文化建设」列扣分明细点击下钻使用；无 query 时行为与默认一致）
const route = useRoute();
const drillQuery = computed(() => ({
  month: typeof route.query.month === 'string' ? route.query.month : '',
  level: typeof route.query.level === 'string' ? route.query.level : '',
}));

// 支持外部定位：query 携带 emp（考核对象 employeeId）时，加载后高亮定位到该人所在行
const hlEmpId = ref<number | null>(null);
let hlTimer: ReturnType<typeof setTimeout> | null = null;
function safetyRowClassName(params: { row: any }): string {
  return hlEmpId.value != null && Number(params?.row?.employeeId) === hlEmpId.value
    ? 'safety-locate-row'
    : '';
}
function scrollToHlRow() {
  if (hlEmpId.value == null) return;
  nextTick(() => {
    setTimeout(() => {
      document.querySelector<HTMLElement>('.vxe-body--row.safety-locate-row')?.scrollIntoView({
        block: 'center',
        behavior: 'smooth',
      });
    }, 120);
  });
}
function scheduleHlFadeOut() {
  if (hlTimer) clearTimeout(hlTimer);
  hlTimer = setTimeout(() => {
    hlEmpId.value = null;
  }, 3800);
}
onUnmounted(() => {
  if (hlTimer) clearTimeout(hlTimer);
});

/** 外部定位轻量复现：query 携带 emp 时，基于当前已加载数据高亮该人所在行并滚动聚焦 */
function applyExternalLocate() {
  const qEmp = typeof route.query.emp === 'string' ? Number(route.query.emp) : NaN;
  if (!Number.isFinite(qEmp) || qEmp <= 0) return;
  hlEmpId.value = qEmp;
  scrollToHlRow();
  scheduleHlFadeOut();
}
/** keep-alive：每次标签页被重新激活（再次从自动评分页下钻进入）时，基于当前数据重新高亮定位 */
onActivated(() => {
  applyExternalLocate();
});

const currentMonth = computed(() => {
  const now = new Date();
  return `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, '0')}`;
});

/** 月份步进（YYYY-MM 加/减 n 个月，跨年由 Date 自动处理） */
function monthStep(ym: string, n: number): string {
  const [y = 0, m = 0] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}`;
}

/**
 * 月份下拉占位补全：把「最大台账月的下一个月 → 当前月」的连续缺失月份 push 到下拉尾部。
 * - 不改变默认选中（opts 已按 'YYYY-MM' 倒序，首元素即最近有台账月份）。
 * - 历史缺口（早于最大台账月）保持不变，仅正向补未来缺失月，使 2026-08、2026-09 等自动可选。
 */
function fillPlaceholderMonths(opts: { label: string; value: string }[]) {
  const max = opts[0]?.value ?? ''; // 已倒序 → 首元素为最大台账月
  if (!max) {
    if (currentMonth.value && !opts.some((o) => o.value === currentMonth.value)) {
      opts.push({ label: currentMonth.value, value: currentMonth.value });
    }
    return;
  }
  let cursor = monthStep(max, 1);
  while (cursor <= (currentMonth.value || max)) {
    if (!opts.some((o) => o.value === cursor)) {
      opts.push({ label: cursor, value: cursor });
    }
    cursor = monthStep(cursor, 1);
  }
}

/**
 * 后端 GET /safety-culture/list 的 page_size 上限为 200；台账跨月累积后按分页拉全，
 * 前端再做「月份 + 岗位 + 乡镇 + 姓名」过滤（对齐月度考核的本地过滤策略）。
 */
async function fetchAll(): Promise<SafetyCultureApi.Record[]> {
  const size = 200;
  const all: SafetyCultureApi.Record[] = [];
  let page = 1;
  let total = Number.POSITIVE_INFINITY;
  while (all.length < total && page <= 30) {
    const res = await getSafetyCultureList({ page, page_size: size } as any);
    const list = res?.list ?? [];
    for (const r of list) {
      all.push(r);
    }
    total = res?.total ?? all.length;
    if (list.length < size) break;
    page++;
  }
  return all;
}

async function loadData() {
  loading.value = true;
  try {
    allRows.value = await fetchAll();
    // 月份下拉：仅取台账出现过的月份，倒序；默认选中最近一个**有数据**的月份
    // （当前月可能无台账，故不再把 currentMonth 并入第一顺位，避免默认显示空月份）
    const set = new Set<string>();
    for (const r of allRows.value) if (r.month) set.add(r.month);
    monthOptions.value = [...set]
      .sort((a, b) => b.localeCompare(a))
      .map((m) => ({ label: m, value: m }));
    // 月份占位：从「最大台账月+1 .. 当前月」的缺失月份 push 到尾部补齐（默认选中不变，历史缺口不动）
    fillPlaceholderMonths(monthOptions.value);
    // 外部下钻（自动评分页点击下钻）：优先定位 query.month / query.level；query.month 不在下拉时补入
    const dq = drillQuery.value;
    if (dq.month && !monthOptions.value.some((o) => o.value === dq.month)) {
      monthOptions.value.push({ label: dq.month, value: dq.month });
      monthOptions.value.sort((a, b) => b.value.localeCompare(a.value));
    }
    if (dq.month) {
      selectedMonth.value = dq.month;
    } else if (!monthOptions.value.some((o) => o.value === selectedMonth.value)) {
      selectedMonth.value = monthOptions.value[0]?.value ?? currentMonth.value;
    }
    if (dq.level && levelOptions.some((o) => o.value === dq.level)) {
      searchForm.level = dq.level;
    }
    applyMonthColumns();
    applyFilter();
    // 外部定位（自动评分页点击下钻）：按 query.emp 高亮该人所在行，停留后自动淡出
    const qEmp = typeof route.query.emp === 'string' ? Number(route.query.emp) : NaN;
    if (Number.isFinite(qEmp) && qEmp > 0) {
      hlEmpId.value = qEmp;
      scrollToHlRow();
      scheduleHlFadeOut();
    }
  } catch {
    allRows.value = [];
    data.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
}

/** 当前月份 + 岗位 + 乡镇 + 姓名 过滤后的集合 */
function filteredRows(): SafetyCultureApi.Record[] {
  const kw = searchForm.keyword.trim();
  const dept = searchForm.dept.trim();
  return allRows.value.filter(
    (r) =>
      (!selectedMonth.value || (r.month || '') === selectedMonth.value) &&
      (!searchForm.level || (r.level || '') === searchForm.level) &&
      (!kw || (r.name || '').includes(kw)) &&
      (!dept || (r.dept || '').includes(dept)),
  );
}

/** 不分页：月份 + 筛选后全部展示（对齐月度考核） */
function applyFilter() {
  const rows = filteredRows();
  total.value = rows.length;
  data.value = rows;
}

/** 当前选中月份查不到台账 → 视为满分（0扣分），列表顶部给提示 */
const isEmptyMonth = computed(
  () => !!selectedMonth.value && !allRows.value.some((r) => r.month === selectedMonth.value),
);

function onRefresh() {
  return loadData();
}
function onSearch() {
  applyFilter();
}
function onReset() {
  Object.assign(searchForm, { level: '', dept: '', keyword: '' });
  onSearch();
}
async function onMonthChange() {
  const m = selectedMonth.value;
  // 空月份自动延续上月：切到尚无台账的月份时，以上月台账行为基准复制生成本月页面（幂等），
  // 再由人工在系统里编辑，无需依赖 Excel 导入。
  if (m && !allRows.value.some((r) => r.month === m)) {
    try {
      const r = await continueLedgerMonthly({ month: m });
      if (r.inserted > 0) {
        message.success(`已按上月（${r.sourceMonth}）自动生成 ${r.inserted} 条台账，可在下方编辑`);
        await onRefresh();
        return;
      }
    } catch {
      /* 拦截器已提示 */
    }
  }
  applyMonthColumns();
  applyFilter();
}

// ===================== 动态活动列（「增加列」/「删除列」，对齐「自动评分」页机制） =====================
// 专项活动名按「选中月份」区分：每月表头不同，列/选项/记忆都以月份为维度
const shownActivityNames = ref<string[]>([]);
const ACTIVITY_COL_STORAGE_PREFIX = 'hse:safety-culture:activity-columns';

/** 当前选中月份出现的专项活动名（去重，排序稳定） */
const monthActivityNames = computed(() => {
  const set = new Set<string>();
  for (const r of allRows.value) {
    if ((r.month || '') !== selectedMonth.value) continue;
    for (const a of r.activities || []) set.add(a.name);
  }
  return [...set];
});

/**
 * 当前选中月份的活动列模型：按 Excel 列序返回 [{ name, group | null }]（去重）。
 * group：活动若属于某个分组表头（如「安全生产月活动」下的 悬挂横幅/应急演练/应急演练签到表）则为其分组名，否则 null。
 */
const monthActivityCols = computed<{ name: string; group: string | null }[]>(() => {
  const seen = new Map<string, string | null>();
  for (const r of allRows.value) {
    if ((r.month || '') !== selectedMonth.value) continue;
    for (const a of r.activities || []) {
      if (!seen.has(a.name)) seen.set(a.name, !a.group ? null : a.group);
    }
  }
  return [...seen].map(([name, group]) => ({ name, group }));
});

function activityColsKey(): string {
  return `${ACTIVITY_COL_STORAGE_PREFIX}:${selectedMonth.value || 'default'}`;
}

function readActivityColumns(): string[] | null {
  try {
    const raw = localStorage.getItem(activityColsKey());
    return raw ? (JSON.parse(raw) as string[]) : null;
  } catch {
    return null;
  }
}
function persistActivityColumns(list: string[]) {
  try {
    localStorage.setItem(activityColsKey(), JSON.stringify(list));
  } catch {
    /* 忽略存储失败 */
  }
}

/** 按当前选中月份刷新活动列：首见该月默认全显示其当月活动，已自定义过则恢复该月的自定义列 */
function applyMonthColumns() {
  const names = monthActivityNames.value;
  const saved = readActivityColumns();
  // 结构变化检测：缓存列中存在当前月已不存在的活动名（如旧「安全生产月活动」被展开为
  // 悬挂横幅/应急演练/应急演练签到表 等子项后，旧列名失效）→ 视为该月活动结构变化，
  // 重置为当前月的完整活动列，保证新展开的子活动默认可见。
  const obsolete = (saved ?? []).filter((n) => !names.includes(n));
  if (saved === null || obsolete.length > 0) {
    shownActivityNames.value = [...names];
    persistActivityColumns(shownActivityNames.value);
  } else {
    shownActivityNames.value = saved.filter((n) => names.includes(n));
  }
}

/** 「增加列」下拉选项：当前月份台账中存在但当前未显示的活动 */
const addableActivityOptions = computed(() =>
  monthActivityNames.value
    .filter((n) => !shownActivityNames.value.includes(n))
    .map((n) => ({ label: n, key: n })),
);
/** 「删除列」下拉选项：当前已显示的活动 */
const removableActivityOptions = computed(() =>
  shownActivityNames.value.map((n) => ({ label: n, key: n })),
);

function handleAddColumn(key: string | number) {
  const name = String(key);
  if (name && !shownActivityNames.value.includes(name)) {
    shownActivityNames.value = [...shownActivityNames.value, name];
    persistActivityColumns(shownActivityNames.value);
    message.success(`已增加「${name}」列`);
  }
}
function handleRemoveColumn(key: string | number) {
  const name = String(key);
  if (shownActivityNames.value.includes(name)) {
    shownActivityNames.value = shownActivityNames.value.filter((n) => n !== name);
    persistActivityColumns(shownActivityNames.value);
    message.success(`已删除「${name}」列`);
  }
}

// ===================== 列 =====================
function missingText(row: SafetyCultureApi.Record) {
  if (!row.missingLabels?.length) return '已全部开展';
  return row.missingLabels.join('、');
}
function formatScore(v: number | null | undefined): string {
  if (v == null || Number.isNaN(Number(v))) return '-';
  const n = Number(v);
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

// 活动列（「专项活动台帐」活动名，表头每月不同）：固定列 + 动态活动列 + 固定列
// 列序：姓名 | 岗位 | 所属乡镇/作业中心 | 表格扣分 | [专项活动…] | 计算扣分 | 生效扣分（不显示「未开展项」「考核对象」）
const baseColumns = [
  { type: 'checkbox', width: 50, align: 'center' as const, fixed: 'left' as const },
  { title: '姓名', field: 'name', minWidth: 110, align: 'center' as const },
  { title: '岗位', field: 'level', minWidth: 130, align: 'center' as const },
  { title: '所属乡镇/作业中心', field: 'dept', minWidth: 150, align: 'center' as const, showOverflow: 'tooltip' as const },
  {
    title: '表格扣分',
    field: 'manualDeduct',
    minWidth: 100,
    align: 'center' as const,
    slots: { default: 'manualDeduct' },
    titleHelp: {
      content:
        '来源：专项活动台账 Excel 中人工填写的「扣分」列。当该表存在「扣分」列时以此为准（即便为 0），作为最终生效扣分的优先依据。',
    },
  },
];
const tailColumns = [
  {
    title: '计算扣分',
    field: 'rawScore',
    minWidth: 100,
    align: 'center' as const,
    slots: { default: 'rawScore' },
    titleHelp: {
      content:
        '当台账无「扣分」列时，按「未开展专项活动项数 × 单位分值」计算的分数；有「扣分」列时等于表格扣分。',
    },
  },
  {
    title: '生效扣分',
    field: 'cappedScore',
    minWidth: 100,
    align: 'center' as const,
    slots: { default: 'cappedScore' },
    titleHelp: {
      content:
        '考核最终生效扣分 = min(计算扣分, 类别上限)。上限按岗位分别设置（管理员/经理），默认 20，可配置为 100。',
    },
  },
  {
    title: '考核分数',
    key: 'scoreSummary',
    minWidth: 100,
    align: 'center' as const,
    slots: { default: 'scoreSummary' },
    titleHelp: {
      content: '考核分数 = 本月生效扣分（安全建设项月度考核分），>0 标橙警示。',
    },
  },
  { title: '操作', field: 'action', width: 170, align: 'center' as const, fixed: 'right' as const, slots: { default: 'action' } },
];
/** 单个活动叶子列（渲染 ✅/❌） */
function leafActivityColumn(name: string): Record<string, any> {
  return {
    title: name,
    field: name,
    key: name,
    minWidth: 150,
    align: 'center',
    showOverflow: 'tooltip',
    slots: { default: 'activityCol' },
  };
}

/**
 * 动态活动列：把属于同一分组（如「安全生产月活动」）且 ≥2 个可见子项的活动合并为
 * 一个带 children 的父级表头列，对齐 Excel 的双层表头；否则按独立叶子列展示。
 * 叶子列顺序沿用 Excel 列序（activity_groups 有序数组回传）。
 */
const activityColumns = computed<VxeTableGridColumns>(() => {
  const visible = monthActivityCols.value.filter((c) =>
    shownActivityNames.value.includes(c.name),
  );
  const cols: Record<string, any>[] = [];
  let i = 0;
  while (i < visible.length) {
    const cur = visible[i]!;
    const groupMembers = cur.group ? visible.filter((v) => v.group === cur.group) : [];
    if (cur.group && groupMembers.length >= 2) {
      const groupName = cur.group;
      const children: Record<string, any>[] = [];
      while (i < visible.length && visible[i]!.group === groupName) {
        children.push(leafActivityColumn(visible[i]!.name));
        i++;
      }
      cols.push({
        title: groupName,
        align: 'center',
        showOverflow: 'tooltip',
        children,
      });
    } else {
      cols.push(leafActivityColumn(cur.name));
      i++;
    }
  }
  return cols as VxeTableGridColumns;
});
/** 是否显示该活动列 */
function activityDone(row: SafetyCultureApi.Record, name: string | undefined): boolean {
  if (!name) return false;
  return (row.activities || []).some((a) => a.name === name && a.done);
}
const allColumns = computed<VxeTableGridColumns>(() =>
  [...baseColumns, ...(activityColumns.value as any[]), ...tailColumns] as VxeTableGridColumns,
);

// ===================== 详情抽屉 =====================
const detailDrawerVisible = ref(false);
const currentRecord = ref<SafetyCultureApi.Record | null>(null);
function openView(row: SafetyCultureApi.Record) {
  currentRecord.value = row;
  detailDrawerVisible.value = true;
}

// ===================== 导入（选「年 / 月」，从服务器目录扫描各岗位「专项活动台帐」） =====================
const importVisible = ref(false);
const importYear = ref<number>(new Date().getFullYear());
const importMonth = ref<number>(new Date().getMonth() + 1);
const importing = ref(false);
const allSheetsProcessed = ref<{ file: string; sheet: string }[]>([]);
const allSkippedFiles = ref<{ file: string; reason: string }[]>([]);

const yearOptions = ref<{ label: string; value: number }[]>([]);
const monthOptionsAll = ref<{ label: string; value: number }[]>([]);

function initRangeOptions() {
  const now = new Date();
  const start = 2020;
  const end = now.getFullYear() + 1;
  yearOptions.value = [];
  for (let y = end; y >= start; y--) yearOptions.value.push({ label: `${y}年`, value: y });
  monthOptionsAll.value = [];
  for (let m = 1; m <= 12; m++) monthOptionsAll.value.push({ label: `${m}月`, value: m });
}

function openImport() {
  const now = new Date();
  importYear.value = now.getFullYear();
  importMonth.value = now.getMonth() + 1;
  allSheetsProcessed.value = [];
  allSkippedFiles.value = [];
  importVisible.value = true;
}

async function onImportConfirm() {
  if (importYear.value == null || !/^\d{4}$/.test(String(importYear.value))) {
    message.warning('请选择年份');
    return;
  }
  if (importMonth.value == null || importMonth.value < 1 || importMonth.value > 12) {
    message.warning('请选择月份');
    return;
  }
  importing.value = true;
  try {
    const res: SafetyCultureApi.ImportResult = await importSafetyCulture({
      year: Number(importYear.value),
      month: Number(importMonth.value),
    });
    allSheetsProcessed.value = res.sheetsProcessed ?? [];
    allSkippedFiles.value = res.skippedFiles ?? [];
    if (res.fullMarks) {
      message.success(res.fullMarksNote || `该月无「专项活动台帐」，视为满分（0扣分）`, { duration: 4000 });
    } else {
      message.success(
        `导入完成：${res.imported} 行，未匹配考核对象 ${res.unmatched} 人`,
        { duration: 4000 },
      );
    }
    selectedMonth.value = res.month;
    await onRefresh();
  } catch {
    /* 拦截器已提示（如目录不存在等） */
  } finally {
    importing.value = false;
  }
}

initRangeOptions();

// ===================== 手动录入台账（新增/编辑/删除） =====================
const ledgerVisible = ref(false);
const editingId = ref<number | null>(null);
const saving = ref(false);
const ledgerForm = reactive({
  month: '',
  level: '乡镇主管',
  dept: '',
  name: '',
  manualDeduct: 0,
  hasManualCol: false,
});
const editActivities = ref<{ name: string; done: boolean; group: string | null }[]>([]);

function resetLedgerForm() {
  editingId.value = null;
  ledgerForm.month = selectedMonth.value || currentMonth.value;
  ledgerForm.level = '乡镇主管';
  ledgerForm.dept = '';
  ledgerForm.name = '';
  ledgerForm.manualDeduct = 0;
  ledgerForm.hasManualCol = false;
  editActivities.value = [];
}

function openCreate() {
  resetLedgerForm();
  ledgerVisible.value = true;
}

function openEdit(row: SafetyCultureApi.Record) {
  editingId.value = row.id;
  ledgerForm.month = row.month;
  ledgerForm.level = row.level;
  ledgerForm.dept = row.dept;
  ledgerForm.name = row.name;
  ledgerForm.manualDeduct = row.manualDeduct ?? 0;
  ledgerForm.hasManualCol = !!row.hasManualCol;
  editActivities.value = (row.activities || []).map((a) => ({
    name: a.name,
    done: a.done,
    group: a.group ?? null,
  }));
  ledgerVisible.value = true;
}

function addActivityRow() {
  editActivities.value.push({ name: '', done: false, group: null });
}
function removeActivityRow(i: number) {
  editActivities.value.splice(i, 1);
}

async function onLedgerSave() {
  if (!/^\d{4}-\d{2}$/.test(ledgerForm.month)) {
    message.warning('请选择考核月份');
    return;
  }
  if (!['乡镇主管', '管理员'].includes(ledgerForm.level)) {
    message.warning('请选择岗位');
    return;
  }
  if (!ledgerForm.name.trim()) {
    message.warning('请填写姓名');
    return;
  }
  const activities = editActivities.value
    .map((a) => ({ name: a.name.trim(), done: a.done, group: a.group ? a.group.trim() : null }))
    .filter((a) => a.name);
  saving.value = true;
  try {
    await saveLedger({
      id: editingId.value ?? undefined,
      month: ledgerForm.month,
      level: ledgerForm.level,
      dept: ledgerForm.dept.trim(),
      name: ledgerForm.name.trim(),
      activities,
      manualDeduct: ledgerForm.manualDeduct ?? 0,
      hasManualCol: ledgerForm.hasManualCol,
    });
    message.success('台账已保存');
    ledgerVisible.value = false;
    selectedMonth.value = ledgerForm.month;
    await onRefresh();
  } catch {
    /* 拦截器已提示 */
  } finally {
    saving.value = false;
  }
}

function onDeleteLedger(row: SafetyCultureApi.Record) {
  dialog.warning({
    title: '删除台账',
    content: `确认删除 ${row.month} ${row.level} ${row.name} 的安全文化建设台账记录？`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await deleteLedger(row.id);
        message.success('台账已删除');
        await onRefresh();
      } catch {
        /* 拦截器已提示 */
      }
    },
  });
}

const actionState = computed<Partial<Record<HseActionKey, { hidden?: boolean }>>>(() => ({}));

onMounted(() => {
  loadData();
});

// Tabbar keep-alive：页面被缓存后 onMounted 不再触发。再次从自动评分页下钻进入
// （query.month/level/emp 变化）时，重载并重新定位高亮到目标行。
watch(
  () => [route.query.month, route.query.level, route.query.emp],
  () => {
    loadData();
  },
);
</script>

<template>
  <HsePageLayout
    title="安全文化建设"
    description="目标职责 · 每个月乡镇作业中心经理/管理员的安全文化扣分情况"
  >
    <template #extra>
      <NSpace>
        <NButton type="primary" @click="openCreate">
          <template #icon><IconifyIcon icon="lucide:plus" /></template>
          新增台账
        </NButton>
        <HseActionBar :actions="actionState" @refresh="onRefresh" @import="openImport" />
      </NSpace>
    </template>

    <!-- 月份下拉 + 「增加列/删除列」（动态活动列，对齐自动评分页） -->
    <div class="mb-4 flex items-center justify-between">
      <NSelect
        v-model:value="selectedMonth"
        placeholder="请选择考核月份"
        :options="monthOptions"
        style="max-width: 320px"
        @update:value="onMonthChange"
      />
      <NSpace>
        <NDropdown :options="addableActivityOptions" trigger="click" @select="handleAddColumn">
          <NButton :disabled="!addableActivityOptions.length">
            <template #icon><IconifyIcon icon="lucide:columns" /></template>
            增加列
          </NButton>
        </NDropdown>
        <NDropdown :options="removableActivityOptions" trigger="click" @select="handleRemoveColumn">
          <NButton :disabled="!removableActivityOptions.length">
            <template #icon><IconifyIcon icon="lucide:delete" /></template>
            删除列
          </NButton>
        </NDropdown>
      </NSpace>
    </div>

    <!-- 筛选：岗位 / 所属乡镇 / 姓名 -->
    <HseSearchPanel @query="onSearch" @reset="onReset">
      <NGi>
        <NSelect
          v-model:value="searchForm.level"
          :options="levelOptions"
          placeholder="岗位"
          clearable
        />
      </NGi>
      <NGi>
        <NInput
          v-model:value="searchForm.dept"
          placeholder="所属乡镇/作业中心"
          clearable
          @keyup.enter="onSearch"
        />
      </NGi>
      <NGi>
        <NInput
          v-model:value="searchForm.keyword"
          placeholder="姓名"
          clearable
          @keyup.enter="onSearch"
        />
      </NGi>
    </HseSearchPanel>

    <!-- 该月无「专项活动台帐」→ 满分提示 -->
    <NAlert v-if="isEmptyMonth" type="success" :show-icon="true" class="mb-4">
      所选考核月份没有「专项活动台帐」，按满分（0扣分）处理，乡镇作业中心经理安全文化项不扣分。
    </NAlert>

    <!-- 台账列表 -->
    <HseDataGrid :columns="allColumns" :data="data" :loading="loading" :pager="false" row-key="id" :row-class-name="safetyRowClassName">
      <template #activityCol="{ row, column }">
        <span :class="activityDone(row, column?.field) ? 'text-success' : 'text-error'">
          {{ activityDone(row, column?.field) ? '✅' : '❌' }}
        </span>
      </template>
      <template #manualDeduct="{ row }">
        <span>{{ formatScore(row.manualDeduct) }}</span>
      </template>
      <template #rawScore="{ row }">
        <span>{{ formatScore(row.rawScore) }}</span>
      </template>
      <template #cappedScore="{ row }">
        <span v-if="(row.cappedScore ?? 0) > 0" class="font-semibold text-error">{{ formatScore(row.cappedScore) }}</span>
        <span v-else class="text-muted-foreground">0</span>
      </template>
      <template #scoreSummary="{ row }">
        <NTag
          :bordered="false"
          size="small"
          :type="(row.cappedScore ?? 0) > 0 ? 'warning' : 'success'"
        >
          {{ formatScore(row.cappedScore) }}
        </NTag>
      </template>
      <template #action="{ row }">
        <NSpace justify="center" :size="4">
          <NButton size="tiny" type="primary" quaternary @click="openView(row)">查看</NButton>
          <NButton size="tiny" type="primary" @click="openEdit(row)">编辑</NButton>
          <NButton size="tiny" type="error" quaternary @click="onDeleteLedger(row)">删除</NButton>
        </NSpace>
      </template>
    </HseDataGrid>

    <!-- 详情抽屉 -->
    <NDrawer v-model:show="detailDrawerVisible" :width="560">
      <NDrawerContent v-if="currentRecord" :title="`安全文化建设台账 #${currentRecord.id}`">
        <NDescriptions :column="1" bordered label-placement="left">
          <NDescriptionsItem label="月份">{{ currentRecord.month || '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="岗位">{{ currentRecord.level || '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="所属乡镇/作业中心">{{ currentRecord.dept || '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="姓名">{{ currentRecord.name || '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="考核对象">
            <NTag :bordered="false" size="small" :type="currentRecord.matched ? 'success' : 'warning'">
              {{ currentRecord.matched ? '已匹配' : '未匹配' }}
            </NTag>
          </NDescriptionsItem>
          <NDescriptionsItem label="专项活动开展情况">
            <div class="flex flex-col gap-1">
              <span v-for="(a, i) in (currentRecord.activities || [])" :key="i">{{ a.name }}：{{ a.done ? '√' : '×' }}</span>
              <span v-if="!(currentRecord.activities || []).length">-</span>
            </div>
          </NDescriptionsItem>
          <NDescriptionsItem label="未开展项">{{ missingText(currentRecord) }}</NDescriptionsItem>
          <NDescriptionsItem label="表格扣分">{{ formatScore(currentRecord.manualDeduct) }}</NDescriptionsItem>
          <NDescriptionsItem label="计算扣分">{{ formatScore(currentRecord.rawScore) }}</NDescriptionsItem>
          <NDescriptionsItem label="生效扣分">{{ formatScore(currentRecord.cappedScore) }}</NDescriptionsItem>
        </NDescriptions>
      </NDrawerContent>
    </NDrawer>

    <!-- 导入（悬浮弹窗，选「年/月」后从服务器目录扫描各岗位专项活动台帐，对齐月度考核 HseImportDialog 的模态样式） -->
    <NModal
      v-model:show="importVisible"
      title="导入安全文化建设专项活动台帐"
      preset="card"
      style="width: 700px; max-width: 92vw"
      :mask-closable="false"
    >
      <NDescriptions :column="1" size="small" bordered class="mb-4">
        <NDescriptionsItem label="说明">
          从服务器目录「宁津北控/27、HSE月度考核 / {{ importYear }}年 / {{ importMonth }}月」中，扫描**乡镇作业中心经理月度考核** Excel（覆盖 2025 年、2026 年各月），读取其中的「专项活动台帐」工作表并全量覆盖该月台账。
        </NDescriptionsItem>
      </NDescriptions>
      <div class="mb-3 flex items-center gap-3">
        <NSelect
          v-model:value="importYear"
          :options="yearOptions"
          placeholder="年份"
          style="max-width: 180px"
        />
        <NSelect
          v-model:value="importMonth"
          :options="monthOptionsAll"
          placeholder="月份"
          style="max-width: 140px"
        />
      </div>

      <!-- 导入结果反馈 -->
      <NAlert
        v-if="allSheetsProcessed.length || allSkippedFiles.length"
        :type="allSheetsProcessed.length ? 'success' : 'warning'"
        class="mb-3"
      >
        <template #default>
          <div class="mb-1">已导入 {{ allSheetsProcessed.length }} 个文件，{{ allSkippedFiles.length }} 个文件跳过。</div>
          <div v-for="s in allSheetsProcessed" :key="s.file" class="text-sm">
            · 导入：{{ s.file }}
          </div>
          <div v-for="s in allSkippedFiles" :key="s.file" class="text-sm">
            · 跳过：{{ s.file }}{{ s.reason ? '（' + s.reason + '）' : '' }}
          </div>
        </template>
      </NAlert>

      <template #footer>
        <div class="flex justify-end gap-2">
          <NButton @click="importVisible = false">关闭</NButton>
          <NButton type="primary" :loading="importing" @click="onImportConfirm">
            开始导入
          </NButton>
        </div>
      </template>
    </NModal>

    <!-- 手动录入/编辑安全文化建设台账弹窗 -->
    <NModal
      v-model:show="ledgerVisible"
      title="安全文化建设台账录入"
      preset="card"
      style="width: 880px; max-width: 94vw"
      :mask-closable="false"
    >
      <div class="space-y-4 pb-2">
        <div class="grid grid-cols-3 gap-4">
          <NSelect
            v-model:value="ledgerForm.month"
            :options="monthOptions"
            placeholder="考核月份"
            disabled
          />
          <NSelect v-model:value="ledgerForm.level" :options="levelOptions" placeholder="岗位" />
          <NInput v-model:value="ledgerForm.dept" placeholder="所属乡镇/作业中心" />
        </div>
        <NInput v-model:value="ledgerForm.name" placeholder="姓名（考核对象）" />
        <div>
          <div class="mb-2 flex items-center justify-between">
            <div class="text-sm font-medium">专项活动开展情况</div>
            <NButton size="small" @click="addActivityRow">
              <template #icon><IconifyIcon icon="lucide:plus" /></template>
              增加活动项
            </NButton>
          </div>
          <div v-if="!editActivities.length" class="text-sm text-muted-foreground">
            尚未添加专项活动，可点击「增加活动项」录入该月开展的各类专项行动。
          </div>
          <div
            v-for="(act, i) in editActivities"
            :key="i"
            class="mb-2 flex items-center gap-2 rounded border p-2"
          >
            <NInput v-model:value="act.name" placeholder="活动名称" style="flex: 2" />
            <NCheckbox v-model:checked="act.done">已开展</NCheckbox>
            <NInput v-model:value="act.group" placeholder="分组（可选）" style="flex: 1" />
            <NButton size="tiny" type="error" quaternary @click="removeActivityRow(i)">删除</NButton>
          </div>
        </div>
        <div class="flex items-center gap-3">
          <div class="text-sm font-medium">表格扣分：</div>
          <NInputNumber
            v-model:value="ledgerForm.manualDeduct"
            placeholder="0"
            :min="0"
            :step="0.01"
            style="width: 140px"
          />
          <NCheckbox v-model:checked="ledgerForm.hasManualCol">该月表格有扣分列</NCheckbox>
        </div>
      </div>
      <template #footer>
        <div class="flex justify-end gap-2">
          <NButton @click="ledgerVisible = false">取消</NButton>
          <NButton type="primary" :loading="saving" @click="onLedgerSave">保存</NButton>
        </div>
      </template>
    </NModal>
  </HsePageLayout>
</template>

<style>
/* 外部下钻定位到目标人所在行：高亮该行（自动评分页安全文化明细点击跳转），停留后自动淡出 */
.vxe-body--row.safety-locate-row {
  background: rgba(37, 99, 235, 0.14) !important;
  transition: background-color 0.8s ease;
}
.vxe-body--row.safety-locate-row .vxe-cell {
  color: #1d4ed8;
  font-weight: 600;
}
</style>