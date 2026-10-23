<script lang="ts" setup>
/**
 * 自动评分（web-naive · 阶段06B-3）
 * 能力：顶部周期下拉 / [增加列]（悬浮二级菜单按「类别扣分上限」动态加维度列）/[导出] [刷新进度] [执行评分] /
 *      评分结果列表(sort_by score_total asc)。无统计卡、无进度条（进度仅用于评分后轮询判停）。
 * 选中考核周期 与 「总分」升/降序 均持久化到 localStorage，刷新后保留至再次更改。
 * 列表仅保留二级/三级网格长（grid_level 筛选）。
 * 动态维度列 = 「类别扣分上限」的类别，表头「类别（最大扣分 分）」，单元格取该对象该类别的有效扣分合计；
 *      默认加载 安全文化建设/HSE教育培训/现场管理-驾驶员/转运站 + 消防/三违（按名称匹配）。可经「增加列」追加。
 * 操作列「查看」→ 悬浮居中卡片弹窗展示该对象扣分明细（细化到规则名称）。
 * 导出：xlsx，含 序号/姓名/岗位/乡镇/网格级别/扣分类型/扣分规则名称。
 */
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import type { VxeTableGridColumns } from '#/adapter/vxe-table';

import {
  NButton,
  NCard,
  NDropdown,
  NModal,
  NSelect,
  NSpace,
  NSpin,
  NTabPane,
  NTabs,
  NTag,
  NTooltip,
} from 'naive-ui';
import { IconifyIcon } from '@vben/icons';

import { HseActionBar, HseDataGrid, HsePageLayout, type HseActionKey } from '#/components/hse';
import {
  executeScoring,
  exportScoringDeductions,
  getAssessmentCycleList,
  getAssessmentTargetList,
  getScoringProgress,
  getTargetDeductionList,
  type AssessmentMonthlyApi,
} from '#/api/hse/assessment-monthly';
import { getCategoryLimits, type CategoryLimitApi } from '#/api/hse/assessment-rule';
import {
  getViolationAssessmentConfig,
  getViolationAssessmentList,
} from '#/api/hse/violation-assessment';
import { message } from '#/adapter/naive';

defineOptions({ name: 'AssessmentMonthlyScoring' });

const loading = ref(false);
const cycleLoading = ref(false);
const executing = ref(false);
const exporting = ref(false);
const dataSource = ref<AssessmentMonthlyApi.AssessmentTarget[]>([]);
const total = ref(0);

// 岗位 tab：manager=乡镇作业中心经理 / admin=管理员（默认经理）
const activeRole = ref<'manager' | 'admin'>('manager');
// 岗位 → 考核对象 position（hse_assessment_target.position 存中文岗位名）
const ROLE_POSITION: Record<string, string> = { manager: '乡镇作业中心经理', admin: '管理员' };

const cycleList = ref<AssessmentMonthlyApi.AssessmentCycle[]>([]);
const selectedCycleId = ref<number | string | undefined>();

const progress = ref<AssessmentMonthlyApi.ScoringProgress>({
  cycleId: 0,
  totalTargets: 0,
  scoredCount: 0,
  reviewedCount: 0,
  frozenCount: 0,
  progressPercent: 0,
  cycleStatus: '',
});

let progressTimer: ReturnType<typeof setInterval> | null = null;

// 评分完成度（用于执行评分后的轮询判停，页面不再展示进度条）
const progressPercent = computed(() => progress.value.progressPercent || 0);

// ============ 动态维度列（来源：类别扣分上限） ============
const DEFAULT_CATEGORIES = [
  '安全文化建设',
  'HSE教育培训',
  '现场管理-驾驶员管理',
  '现场管理-转运站管理',
  '现场管理-消防管理',
  '现场管理-三违管理',
];

function isNumericName(s?: string | null) {
  return /^\s*[0-9]+\s*$/.test(s || '');
}

// 默认类别名与「类别扣分上限」名称匹配：先精确，其次去掉「现场管理-」前缀后匹配（消防/三违）
function matchDefaultCategory(def: string, list: CategoryLimitApi.CategoryLimit[]) {
  const exact = list.find((l) => l.category === def);
  if (exact) return exact;
  const prefix = '现场管理-';
  if (def.startsWith(prefix)) {
    return list.find((l) => l.category === def.slice(prefix.length)) || null;
  }
  return null;
}

const categoryLimit = ref<CategoryLimitApi.CategoryLimit[]>([]);
const selectedCategories = ref<string[]>([]);

// 已选维度列持久化（localStorage 按页面+岗位隔离）：「增加列」/「删除列」刷新后保留。
// 经理/管理员两套 tab 各自独立 key，避免互相覆盖（2026-09-06 修复：旧版单一 key 双 tab 互踩）。
const COL_STORAGE_KEY_MANAGER = 'hse:monthly-scoring:columns:manager';
const COL_STORAGE_KEY_ADMIN = 'hse:monthly-scoring:columns:admin';
// 兼容旧版单一 key（经理 tab 曾共用，迁移兜底读取）
const COL_STORAGE_KEY_LEGACY = 'hse:monthly-scoring:columns';

function colStorageKey(): string {
  return activeRole.value === 'admin' ? COL_STORAGE_KEY_ADMIN : COL_STORAGE_KEY_MANAGER;
}

function readSavedColumns(): string[] | null {
  const key = colStorageKey();
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as string[];
  } catch {
    /* 解析失败走兜底 */
  }
  // 迁移：旧版单一 key 仅在「乡镇作业中心经理」岗位 key 无数据时兜底读取一次
  if (key === COL_STORAGE_KEY_MANAGER) {
    try {
      const legacy = localStorage.getItem(COL_STORAGE_KEY_LEGACY);
      if (legacy) return JSON.parse(legacy) as string[];
    } catch {
      /* 忽略旧数据解析失败 */
    }
  }
  return null;
}

function persistColumns(list: string[]) {
  try {
    localStorage.setItem(colStorageKey(), JSON.stringify(list));
  } catch {
    /* 忽略存储失败 */
  }
}

// 分数展示：去掉无意义的小数（20.00 → 20；0.50 → 0.5）
function formatScore(v: number | string | null | undefined): string {
  if (v == null || v === '') return '';
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

const selectedCategoryMap = computed(() => {
  const m = new Map<string, CategoryLimitApi.CategoryLimit>();
  for (const c of categoryLimit.value) m.set(c.category, c);
  return m;
});

async function loadCategories() {
  try {
    const list = await getCategoryLimits(activeRole.value);
    categoryLimit.value = list || [];
    const real = (categoryLimit.value || []).filter((l) => l.category && !isNumericName(l.category));
    // 已有用户保存的列 → 按保存恢复（保留「删除列」结果）；从未保存 → 以默认类别为基线并落盘
    const saved = readSavedColumns();
    if (saved !== null) {
      selectedCategories.value = saved.filter((n) => real.some((l) => l.category === n));
    } else {
      const base: string[] = [];
      for (const def of DEFAULT_CATEGORIES) {
        const hit = matchDefaultCategory(def, real);
        if (hit && !base.includes(hit.category)) base.push(hit.category);
      }
      selectedCategories.value = base;
      persistColumns(base);
    }
  } catch {
    /* 类别加载失败不阻断列展示 */
  }
}

// 维度列：表头「类别（最大扣分 分）」双行展示，单元格取值 row.categoryDeductions[category]
const dimColumns = computed<VxeTableGridColumns>(() => {
  const m = selectedCategoryMap.value;
  return selectedCategories.value.map((name) => {
    const meta = m.get(name);
    const max = meta && meta.maxDeduct != null ? meta.maxDeduct : '';
    return {
      title: `${name}（${formatScore(max)}分）`,
      field: name,
      key: name,
      // 用 minWidth 而非固定 width，配合 auto-width 按容器宽度平铺右侧不留白；
      // 列数多仍超过容器时按需横向滚动（VXE auto 模式自动伸缩）
      minWidth: 150,
      align: 'center' as const,
      className: 'is-dim-col',
      slots: { header: 'dimHeader', default: 'dimCell' },
    } as any;
  });
});

// 双行表头拆分：第一行类别名，第二行「（分数 分）」
function dimHeaderName(col: any): string {
  const t = String(col?.title ?? '');
  const i = t.lastIndexOf('（');
  return i >= 0 ? t.slice(0, i) : t;
}

function dimHeaderLimit(col: any): string {
  const t = String(col?.title ?? '');
  const i = t.lastIndexOf('（');
  return i >= 0 ? t.slice(i) : '';
}

/** 维度列帮助文案（表头问号悬浮展示） */
function dimHelpText(col: any): string {
  const name = dimHeaderName(col) || '该类别';
  const base = normalizeCategoryName(name);
  if (base === '三违管理') {
    return `「三违管理」列分数获取路径：现场管理 → 三违管理 → 三违管理考核（同一考核周期、同一岗位 Tab）的「考核分数」列 = 该页当前展示列之和（网格长巡查考核 + 三违巡查 + 三违信息填报 + 各人工列 + 公司查处扣分）。仅覆盖本列展示值，不影响本页「总分」。`;
  }
  const PATH_TEXT: Record<string, string> = {
    安全文化建设: '目标职责 → 安全文化建设（同一考核月份、同一岗位 Tab）的「生效扣分」列',
    HSE教育培训: '培训 → 培训记录（同一考核月份）的「培训考核分数」列',
    驾驶员管理: '现场管理 → 驾驶员管理 → 月度考核（同一考核月份）的「考核分数」列',
    转运站管理: '现场管理 → 转运站管理（同一检查月份）的「考核分数」列',
    消防管理: '现场管理 → 消防设施管理（按同一考核月份筛选）的异常设施扣分',
  };
  const path = PATH_TEXT[base];
  const source = path
    ? `分数获取路径：${path}。`
    : '';
  return `维度列「${name}」：展示该对象在本考核周期该类别下的有效扣分合计（按扣分规则明细汇总，不超过该类别扣分上限）。${source}可经「增加列 / 删除列」增删本列。`;
}

// 固定列表头帮助文案（悬浮问号图标展示）
const colHelp: Record<string, string> = {
  employeeName: '考核人姓名',
  position: '考核人岗位',
  township: '考核人所属乡镇',
  gridLevel: '考核对象所属网格级别（列表仅保留二/三级网格长）',
  scoreTotal: '该对象最终得分 = 自动评分 + 人工扣分调整合计；点击表头可切换升/降序。',
};

// 「增加列」下拉选项：未选中的真实类别（剔除纯数字占位）
const addableCategoryOptions = computed(() =>
  categoryLimit.value
    .filter((l) => l.category && !isNumericName(l.category))
    .filter((l) => !selectedCategories.value.includes(l.category))
    .map((l) => ({ label: `${l.category}（${formatScore(l.maxDeduct ?? 0)}分）`, key: l.category })),
);

// 「删除列」下拉选项：当前已选中的列
const removableCategoryOptions = computed(() =>
  selectedCategories.value.map((name) => {
    const max = selectedCategoryMap.value.get(name)?.maxDeduct;
    return { label: `${name}（${formatScore(max ?? 0)}分）`, key: name };
  }),
);

function handleAddColumn(key: string | number) {
  const name = String(key);
  if (name && !selectedCategories.value.includes(name)) {
    selectedCategories.value = [...selectedCategories.value, name];
    persistColumns(selectedCategories.value);
    message.success(`已增加「${name}」列`);
  }
}

function handleRemoveColumn(key: string | number) {
  const name = String(key);
  if (selectedCategories.value.includes(name)) {
    selectedCategories.value = selectedCategories.value.filter((n) => n !== name);
    persistColumns(selectedCategories.value);
    message.success(`已删除「${name}」列`);
  }
}

const columns = computed<VxeTableGridColumns>(() => [
  { type: 'seq', title: '序号', width: 70, align: 'center' as const },
  { title: '姓名', field: 'employeeName', minWidth: 100, align: 'center', fixed: 'left', titleHelp: { content: colHelp.employeeName } },
  { title: '岗位', field: 'position', minWidth: 120, align: 'center', titleHelp: { content: colHelp.position } },
  { title: '乡镇', field: 'township', minWidth: 120, align: 'center', titleHelp: { content: colHelp.township } },
  {
    title: '网格级别',
    field: 'gridLevel',
    minWidth: 120,
    align: 'center',
    showOverflow: 'tooltip',
    slots: { default: 'gridLevelCell' },
    titleHelp: { content: colHelp.gridLevel },
  },
  ...(dimColumns.value as any[]),
  {
    title: '总分',
    field: 'scoreTotal',
    minWidth: 100,
    align: 'center',
    sortable: true,
    slots: { default: 'scoreTotalCell' },
    titleHelp: { content: colHelp.scoreTotal },
  },
  {
    key: 'operation',
    title: '操作',
    width: 90,
    align: 'center',
    fixed: 'right',
    slots: { default: 'actionCell' },
  },
]);

// 列表平铺：列均用 minWidth，配合 HseDataGrid auto-width 按容器宽度填充、右侧不留白；
// 列多超过容器时由 VXE auto 模式按需横向滚动。
function formatDim(row: AssessmentMonthlyApi.AssessmentTarget, key?: string) {
  if (key == null) return '0';
  const v = row.categoryDeductions?.[key];
  return v == null || Number.isNaN(Number(v)) ? '0' : String(Number(v));
}

// ============ 安全文化建设「只显示不计入考核」（仅 2025-11 乡镇作业中心经理周期）============
// 需求：自动评分-2025-11-乡镇作业中心经理 的「安全文化建设」列扣分仅用于展示，不计入考核总分。
// 实现：仅在该周期+岗位下，展示总分 = 原 score_total + 安全文化建设扣分（把该维度加回=不计入）。
// 其余周期/岗位走原总分，不受影响。列内数值（formatDim）仍如实展示。
const CULTURE_EXCLUDED_CYCLE_DESC = '2025年11月';
const cultureExcluded = computed(() => {
  if (activeRole.value !== 'manager') return false;
  const cyc = cycleList.value.find((c) => String(c.id) === String(selectedCycleId.value));
  return !!cyc && String(cyc.cycleName || '').includes(CULTURE_EXCLUDED_CYCLE_DESC);
});

function displayScoreTotal(row: AssessmentMonthlyApi.AssessmentTarget): string {
  const base = Number(row.scoreTotal ?? 0);
  if (!cultureExcluded.value) return formatScore(base);
  const culture = Number(row.categoryDeductions?.['安全文化建设']);
  const addBack = Number.isFinite(culture) ? culture : 0;
  return formatScore(base + addBack);
}

// ============ 扣分明细抽屉 ============
const DEDUCTION_TYPE_TEXT: Record<string, string> = {
  auto: '自动',
  auto_deduction: '自动扣分',
  manual: '人工',
  import: '导入',
  chain_transmission: '传导',
};
const REVIEW_STATUS_TEXT: Record<string, string> = {
  pending: '待审',
  approved: '已确认（锁定）',
  rejected: '已驳回',
  adjusted: '已调整（锁定）',
};

const detailVisible = ref(false);
const detailLoading = ref(false);
const detailTitle = ref('');
const detailList = ref<AssessmentMonthlyApi.TargetDeduction[]>([]);

const detailColumns: VxeTableGridColumns = [
  { title: '扣分类型', field: 'deductionType', width: 110, align: 'center', slots: { default: 'dtCell' } },
  { title: '扣分明细', field: 'deductionItem', width: 200, align: 'center', showOverflow: 'tooltip' },
  { title: '规则名称', field: 'ruleName', width: 170, align: 'center', showOverflow: 'tooltip' },
  { title: '说明', field: 'summary', width: 240, align: 'center', showOverflow: 'tooltip', slots: { default: 'summaryCell' } },
  { title: '扣分', field: 'suggestedScore', width: 80, align: 'center' },
  { title: '状态', field: 'reviewStatus', width: 90, align: 'center', slots: { default: 'rsCell' } },
];

async function openDetail(row: AssessmentMonthlyApi.AssessmentTarget) {
  if (!selectedCycleId.value) return;
  detailVisible.value = true;
  detailLoading.value = true;
  detailTitle.value = `${row.employeeName || ''} 扣分明细`;
  detailList.value = [];
  try {
    const res = await getTargetDeductionList(selectedCycleId.value, row.id);
    detailList.value = res.list || [];
  } catch {
    detailList.value = [];
  } finally {
    detailLoading.value = false;
  }
}

// ============ 数据加载 ============
// 排序状态：默认按总分降序；表头点击「总分」可切换 降序/升序（服务端重查）。
// 排序选择持久化（localStorage）按页面+岗位隔离（2026-09-06 修复：旧版单一 key 双 tab 互踩）。
const SORT_FIELD_MAP: Record<string, string> = { scoreTotal: 'score_total' };
const SORT_STORAGE_KEY_MANAGER = 'hse:monthly-scoring:sort:manager';
const SORT_STORAGE_KEY_ADMIN = 'hse:monthly-scoring:sort:admin';
// 兼容旧版单一 key（经理 tab 曾共用，迁移兜底读取）
const SORT_STORAGE_KEY_LEGACY = 'hse:monthly-scoring:sort';

function sortStorageKey(): string {
  return activeRole.value === 'admin' ? SORT_STORAGE_KEY_ADMIN : SORT_STORAGE_KEY_MANAGER;
}
function readSavedSort(): { sortBy: string; sortOrder: 'asc' | 'desc' } | null {
  const key = sortStorageKey();
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as { sortBy: string; sortOrder: 'asc' | 'desc' };
  } catch {
    /* 解析失败走兜底 */
  }
  if (key === SORT_STORAGE_KEY_MANAGER) {
    try {
      const legacy = localStorage.getItem(SORT_STORAGE_KEY_LEGACY);
      if (legacy) return JSON.parse(legacy) as { sortBy: string; sortOrder: 'asc' | 'desc' };
    } catch {
      /* 忽略旧数据解析失败 */
    }
  }
  return null;
}
function persistSort() {
  try {
    localStorage.setItem(
      sortStorageKey(),
      JSON.stringify({ sortBy: sortBy.value, sortOrder: sortOrder.value }),
    );
  } catch {
    /* 忽略存储失败 */
  }
}
const savedSort = readSavedSort();
const sortBy = ref<string>(savedSort?.sortBy || 'score_total');
const sortOrder = ref<'asc' | 'desc'>(savedSort?.sortOrder || 'asc');

// 选中周期持久化（localStorage）：刷新后仍停留在上次选中的考核周期
const CYCLE_STORAGE_KEY = 'hse:monthly-scoring:cycle';
function readSavedCycle(): number | string | undefined {
  try {
    const raw = localStorage.getItem(CYCLE_STORAGE_KEY);
    if (raw == null || raw === '') return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : raw;
  } catch {
    return undefined;
  }
}
function persistCycle(id?: number | string | undefined) {
  try {
    if (id == null) {
      localStorage.removeItem(CYCLE_STORAGE_KEY);
    } else {
      localStorage.setItem(CYCLE_STORAGE_KEY, String(id));
    }
  } catch {
    /* 忽略存储失败 */
  }
}

async function loadCycleList() {
  cycleLoading.value = true;
  try {
    const res = await getAssessmentCycleList({
      page: 1,
      page_size: 100,
      sort_by: 'created_at',
      sort_order: 'desc',
    });
    cycleList.value = res.list || [];
    // 已保存周期若仍存在则恢复，否则取最新周期；仅在页面首次加载（未选中）时生效
    if (cycleList.value.length > 0 && !selectedCycleId.value) {
      const saved = readSavedCycle();
      const hit = cycleList.value.find((c) => String(c.id) === String(saved));
      selectedCycleId.value = hit ? hit.id : cycleList.value[0]!.id;
      loadProgress();
      loadData();
      startProgressPolling();
    }
  } catch {
    message.error('加载周期列表失败');
  } finally {
    cycleLoading.value = false;
  }
}

async function loadProgress() {
  if (!selectedCycleId.value) return;
  try {
    progress.value = await getScoringProgress(selectedCycleId.value);
  } catch {
    /* 静默失败 */
  }
}

// 「三违管理」（现场管理-三违管理）维度：展示三级菜单「三违管理考核」同为当前岗位 tab 的「考核分数」列。
// 该考核分数 = 三违管理考核页当前展示列（自动列扣分 + 人工列 cells + 公司查处扣分）之和，不同周期/岗位各自独立存储。
// 此处仅覆盖展示列值，不影响本页「总分」（score_total 由后端评分引擎得出）。
// 三违管理维度明细：与「三违管理考核」页当前展示列逐一对应（自动列 + 各人工列 + 公司查处扣分）
interface ViolationBreakdownItem {
  label: string;
  value: number;
}
interface ViolationBreakdown {
  total: number;
  items: ViolationBreakdownItem[];
}

// 匹配键：两侧行均源于 hse_assessment_target，按 employeeId 一一对应。
// 口径与 views/hse/violation-assessment/index.vue 的 totalScore 保持一致（2026-09-26 冻结：考核分数含公司查处扣分）。
const violationScoreMap = ref<Map<number, ViolationBreakdown>>(new Map());

// 自动列 key → ListRow 扣分字段（与三违管理考核页 autoValue 同源）
const SANWEI_AUTO_FIELDS: Record<string, string> = {
  grid: 'gridDeduct',
  violation: 'violationDeduct',
  unrectified: 'unrectifiedDeduct',
  driver: 'driverDeduct',
};

async function loadViolationScores() {
  violationScoreMap.value = new Map();
  if (!selectedCycleId.value) return;
  try {
    const position = ROLE_POSITION[activeRole.value];
    const [listRes, cfgRes] = await Promise.all([
      getViolationAssessmentList({ cycleId: selectedCycleId.value, position }),
      getViolationAssessmentConfig({ cycleId: selectedCycleId.value, position }),
    ]);
    const shown = (cfgRes?.columns ?? []).filter((c) => c.shown);
    const cells = cfgRes?.cells ?? {};
    const rows = listRes?.rows ?? [];
    const byEmp = new Map<number, ViolationBreakdown>();
    for (const row of rows) {
      const items: ViolationBreakdownItem[] = [];
      for (const c of shown) {
        const label = String(c.title ?? '');
        if (c.kind === 'auto') {
          const field = SANWEI_AUTO_FIELDS[c.key as string];
          const v = field ? Number((row as any)[field] ?? 0) : 0;
          items.push({ label, value: v });
        } else {
          items.push({ label, value: (cells[String(row.employeeId)]?.[c.key] ?? 0) || 0 });
        }
      }
      // 公司查处扣分为三违管理考核固定列（不入列池增删），与源页「考核分数」同口径计入
      items.push({ label: '公司查处扣分', value: row.companyDeduct?.score ?? 0 });
      const total = Math.round(items.reduce((s, it) => s + it.value, 0) * 100) / 100;
      byEmp.set(row.employeeId, { total, items });
    }
    violationScoreMap.value = byEmp;
  } catch {
    /* 拉取失败不阻断主列表 */
  }
}

/** 取某对象的三违管理维度明细（无则 undefined，回退后端 categoryDeductions 展示） */
function violationBreakdownOf(row: AssessmentMonthlyApi.AssessmentTarget): ViolationBreakdown | undefined {
  return violationScoreMap.value.get(row.employeeId);
}

/** 判断某个维度列是否为「三违管理」（兼容「现场管理-三违管理」等带前缀命名） */
function isSanweiCategory(name?: string | null): boolean {
  return normalizeCategoryName(name) === '三违管理';
}

// 维度单元格取值：「三违管理」列改用「三违管理考核」同岗位 tab 的考核分数；其余走 categoryDeductions
function dimValue(row: AssessmentMonthlyApi.AssessmentTarget, key?: string | null): string {
  if (key && isSanweiCategory(key)) {
    const v = violationScoreMap.value.get(row.employeeId)?.total;
    if (v != null && Number.isFinite(v)) return String(Number(v));
  }
  return formatDim(row, key ?? undefined);
}

const router = useRouter();

/** 选中考核周期 → 所属月份（YYYY-MM，供下钻目标页自动定位） */
function selectedCycleMonth(): string {
  const cyc = cycleList.value.find((c) => String(c.id) === String(selectedCycleId.value));
  if (!cyc) return '';
  const y = cyc.assessmentYear;
  const m = cyc.assessmentMonth;
  if (!y || !m) return '';
  return `${y}-${String(m).padStart(2, '0')}`;
}

/** 类别名规范化：去掉「现场管理-」前缀后比较（消防/三违等） */
function normalizeCategoryName(name?: string | null): string {
  return String(name ?? '')
    .trim()
    .replace(/^现场管理-/, '');
}

/**
 * 维度列 → 下钻目标路由（点击明细项跳转，并携带当月/岗位参数自动定位）。
 * 三违列走既有 /site/violation/assessment（violCycle+violPos+violTarget，见 drillToViolationAssessment）；
 * 其余维度列挂 month=YYYY-MM；对以「人」为行的目标页（安全文化建设/培训台账/驾驶员月度考核）
 * 额外携带被点击对象的匹配参数，目标页高亮到该人所在行；转运站/消防台账以站点/设施为行、
 * 无人员主键，仅自动筛选到对应月份（不强高亮）。
 */
const CATEGORY_DRILLS: Record<
  string,
  {
    path: string;
    query: (ctx: {
      month: string;
      role: 'manager' | 'admin';
      row?: AssessmentMonthlyApi.AssessmentTarget | null;
    }) => Record<string, string>;
  }
> = {
  安全文化建设: {
    path: '/objectives/safety-culture',
    query: ({ month, role, row }) => {
      const q: Record<string, string> = { month, level: role === 'admin' ? '管理员' : '乡镇主管' };
      if (row && row.employeeId != null) q.emp = String(row.employeeId);
      return q;
    },
  },
  HSE教育培训: {
    path: '/training/records',
    query: ({ month, row }) => {
      const q: Record<string, string> = { month };
      if (row && row.employeeId != null) q.emp = String(row.employeeId);
      return q;
    },
  },
  驾驶员管理: {
    path: '/site/driver/monthly',
    query: ({ month, row }) => {
      const q: Record<string, string> = { month };
      if (row && row.employeeName) q.driver = String(row.employeeName).trim();
      return q;
    },
  },
  转运站管理: {
    path: '/site/transfer-stations',
    query: ({ month }) => ({ month }),
  },
  消防管理: {
    path: '/site/fire-facility',
    query: ({ month }) => ({ month }),
  },
};

/** 下钻：跳转「现场管理 → 三违管理 → 三违管理考核」，按当月/当前岗位自动定位；
 *  传入 row 时附带 violTarget，目标页高亮定位到该人的那一行 */
function drillToViolationAssessment(row?: AssessmentMonthlyApi.AssessmentTarget | null) {
  const query: Record<string, string> = {
    violCycle: String(selectedCycleId.value ?? ''),
    violPos: ROLE_POSITION[activeRole.value] ?? '',
  };
  if (row && row.id != null) query.violTarget = String(row.id);
  router.push({ path: '/site/violation/assessment', query });
}

/** 下钻：跳转其他维度列对应模块页，按当月/当前岗位自动定位；
 *  传入被点击对象 row 时，目标页（按人列）额外高亮定位到该人所在行 */
function drillDimDetail(category: string, row?: AssessmentMonthlyApi.AssessmentTarget | null) {
  const base = normalizeCategoryName(category);
  if (base === '三违管理') {
    drillToViolationAssessment(row);
    return;
  }
  const target = CATEGORY_DRILLS[base];
  if (!target) return;
  router.push({
    path: target.path,
    query: target.query({
      month: selectedCycleMonth(),
      role: activeRole.value,
      row,
    }),
  });
}

// ============ 维度列扣分明细：居中模态框（点击非零数字打开，明细项可点击下钻） ============
// 明细数据源：三违列取「三违管理考核」同岗位 tab 的列构成（violationScoreMap，与源页口径一致）；
// 其余维度列统一取扣分规则明细（getTargetDeductionList 按类别过滤 + 按规则名分组汇总）。
interface DimDetailItem {
  label: string;
  value: number;
}
const dimDetailRow = ref<AssessmentMonthlyApi.AssessmentTarget | null>(null);
const dimDetailCategory = ref('');
const dimDetailVisible = computed({
  get: () => !!dimDetailRow.value,
  set: (v: boolean) => {
    if (!v) dimDetailRow.value = null;
  },
});
const dimDetailItems = ref<DimDetailItem[]>([]);
const dimDetailLoading = ref(false);

function dimDetailTotal(): number {
  return Math.round(dimDetailItems.value.reduce((s, it) => s + it.value, 0) * 100) / 100;
}

async function openDimDetail(row: AssessmentMonthlyApi.AssessmentTarget, column: any) {
  const category = column ? String(column.field ?? (column as any).key ?? '') : '';
  if (!category) return;
  dimDetailRow.value = row;
  dimDetailCategory.value = category;
  dimDetailItems.value = [];
  if (isSanweiCategory(category)) {
    // 三违列：与「三违管理考核」页当前展示列构成一致（violationScoreMap 随主列表已加载）
    const bd = violationBreakdownOf(row);
    dimDetailItems.value = bd ? bd.items.map((it) => ({ label: it.label, value: it.value })) : [];
    return;
  }
  if (!selectedCycleId.value) return;
  dimDetailLoading.value = true;
  try {
    const res = await getTargetDeductionList(selectedCycleId.value, row.id);
    const norm = normalizeCategoryName(category);
    const rows0 = res.list || [];

    // HSE教育培训「培训台账」通路：若按规则名合并，两条都来自同一条「培训台账缺训」规则，
    // 无法体现「缺少人员 / 资料不完整」两个独立指标。源指标（missing/incomplete）已由后端透出，
    // 这里据此拆成两条独立明细；非培训台账通路的同类别明细仍按规则名合并。
    if (norm === 'HSE教育培训') {
      let missingTotal = 0;
      let incompleteTotal = 0;
      let hasSource = false;
      const others: typeof rows0 = [];
      for (const d of rows0) {
        if (normalizeCategoryName(d.category) !== norm) continue;
        const sd = d.sourceDetail;
        if (sd && (sd.missing != null || sd.incomplete != null)) {
          hasSource = true;
          const unit = Number(sd.unit) > 0 ? Number(sd.unit) : 1;
          missingTotal += Number(sd.missing ?? 0) * unit;
          incompleteTotal += Number(sd.incomplete ?? 0) * unit;
        } else {
          others.push(d);
        }
      }
      const items: DimDetailItem[] = [];
      if (hasSource) {
        if (missingTotal > 0) items.push({ label: '缺少人员', value: Math.round(missingTotal * 100) / 100 });
        if (incompleteTotal > 0) items.push({ label: '资料不完整', value: Math.round(incompleteTotal * 100) / 100 });
      }
      // 其余同类别（非培训台账通路）明细仍按规则名合并
      const groupedOthers = new Map<string, number>();
      for (const d of others) {
        const label = d.ruleName || d.deductionItem || '未命名扣分项';
        groupedOthers.set(label, (groupedOthers.get(label) ?? 0) + Number(d.suggestedScore ?? 0));
      }
      for (const [label, val] of groupedOthers) {
        items.push({ label, value: Math.round(val * 100) / 100 });
      }
      dimDetailItems.value = items;
      dimDetailLoading.value = false;
      return;
    }

    const grouped = new Map<string, number>();
    for (const d of rows0) {
      if (normalizeCategoryName(d.category) !== norm) continue;
      const label = d.ruleName || d.deductionItem || '未命名扣分项';
      grouped.set(label, (grouped.get(label) ?? 0) + Number(d.suggestedScore ?? 0));
    }
    dimDetailItems.value = [...grouped].map(([label, value]) => ({
      label,
      value: Math.round(value * 100) / 100,
    }));
  } catch {
    dimDetailItems.value = [];
  } finally {
    dimDetailLoading.value = false;
  }
}

async function loadData() {
  if (!selectedCycleId.value) {
    dataSource.value = [];
    total.value = 0;
    return;
  }
  loading.value = true;
  try {
    await loadViolationScores();
    const res = await getAssessmentTargetList(selectedCycleId.value, {
      // 列表一次性全量展示（不分页）：page_size 传大值，后端 targets 接口上限 10000
      page: 1,
      page_size: 10000,
      position: ROLE_POSITION[activeRole.value],
      sort_by: sortBy.value,
      sort_order: sortOrder.value,
    });
    dataSource.value = res.list || [];
    total.value = res.total || 0;
  } catch {
    dataSource.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
}

// 切换岗位 tab：按该岗位重载排序、类别上限列与评分结果
function handleRoleChange() {
  const saved = readSavedSort();
  sortBy.value = saved?.sortBy || 'score_total';
  sortOrder.value = saved?.sortOrder || 'asc';
  loadCategories();
  loadData();
}

// 用 NSelect 回调传入的新值持久化：v-model 与 @update:value 的先后顺序不确定，
// 若读取 selectedCycleId.value 可能取到切换前的旧周期（导致刷新恢复到旧周期）
function handleCycleChange(value?: number | string | null) {
  selectedCycleId.value = (value ?? undefined) as number | string | undefined;
  persistCycle(selectedCycleId.value);
  loadProgress();
  loadData();
}

// 表头「总分」排序：切换 升序/降序（取消排序时回落默认降序）
function handleSortChange(payload?: { sortBy?: string; sortOrder?: 'asc' | 'desc' }) {
  const field = payload?.sortBy;
  const order = payload?.sortOrder;
  if (order && field) {
    sortBy.value = SORT_FIELD_MAP[field] ?? field;
    sortOrder.value = order;
  } else {
    sortBy.value = 'score_total';
    sortOrder.value = 'asc';
  }
  persistSort();
  loadData();
}

async function handleExecuteScoring() {
  if (!selectedCycleId.value) {
    message.warning('请先选择考核周期');
    return;
  }
  executing.value = true;
  try {
    const res = await executeScoring(selectedCycleId.value);
    message.success(res.message || '评分执行成功');
    loadProgress();
    loadData();
    startProgressPolling();
  } catch {
    /* 拦截器已提示 */
  } finally {
    executing.value = false;
  }
}

function triggerDownload(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

function exportFileName() {
  const cycle = cycleList.value.find((c) => c.id === selectedCycleId.value);
  const suffix = cycle?.cycleName || `cycle_${selectedCycleId.value}` || '';
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `自动评分扣分明细_${suffix}_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(
    now.getDate(),
  )}.xlsx`;
}

async function handleExport() {
  if (!selectedCycleId.value) {
    message.warning('请先选择考核周期');
    return;
  }
  exporting.value = true;
  try {
    // download() 仅返回 Blob，需在调用方落地为浏览器文件下载
    const blob = await exportScoringDeductions(selectedCycleId.value);
    triggerDownload(blob, exportFileName());
    message.success('导出成功');
  } catch {
    /* 拦截器已提示 */
  } finally {
    exporting.value = false;
  }
}

function startProgressPolling() {
  stopProgressPolling();
  progressTimer = setInterval(() => {
    loadProgress();
    if (progressPercent.value >= 100) {
      stopProgressPolling();
      loadData();
    }
  }, 3000);
}
function stopProgressPolling() {
  if (progressTimer) {
    clearInterval(progressTimer);
    progressTimer = null;
  }
}

const actionState = ref<Partial<Record<HseActionKey, { hidden?: boolean }>>>({
  downloadTemplate: { hidden: true },
  import: { hidden: true },
  export: { hidden: true },
  create: { hidden: true },
});

onMounted(() => {
  loadCategories();
  loadCycleList();
});
onUnmounted(() => {
  stopProgressPolling();
});
</script>

<template>
  <HsePageLayout title="自动评分">
    <template #extra>
      <HseActionBar :actions="actionState" @refresh="loadData" />
    </template>

    <div class="mb-4">
      <NSelect
        v-model:value="selectedCycleId"
        placeholder="请选择考核周期"
        :loading="cycleLoading"
        :options="cycleList.map((c) => ({ label: c.cycleName, value: c.id }))"
        style="max-width: 320px"
        @update:value="handleCycleChange"
      />
    </div>

    <div class="mb-4 flex items-center justify-between">
      <NSpace>
        <NDropdown :options="addableCategoryOptions" trigger="click" @select="handleAddColumn">
          <NButton :disabled="!addableCategoryOptions.length">
            <template #icon><IconifyIcon icon="lucide:columns" /></template>
            增加列
          </NButton>
        </NDropdown>
        <NDropdown :options="removableCategoryOptions" trigger="click" @select="handleRemoveColumn">
          <NButton :disabled="!removableCategoryOptions.length">
            <template #icon><IconifyIcon icon="lucide:delete" /></template>
            删除列
          </NButton>
        </NDropdown>
      </NSpace>
      <NSpace>
        <NButton :loading="exporting" :disabled="!selectedCycleId" @click="handleExport">
          <template #icon><IconifyIcon icon="lucide:download" /></template>
          导出
        </NButton>
        <NButton @click="loadProgress">
          <template #icon><IconifyIcon icon="lucide:rotate-cw" /></template>
          刷新进度
        </NButton>
        <NButton type="primary" :loading="executing" :disabled="!selectedCycleId" @click="handleExecuteScoring">
          <template #icon><IconifyIcon icon="lucide:play-circle" /></template>
          执行评分
        </NButton>
      </NSpace>
    </div>

    <NTabs v-model:value="activeRole" type="line" class="mb-2" @update:value="handleRoleChange">
      <NTabPane name="manager" tab="乡镇作业中心经理" />
      <NTabPane name="admin" tab="管理员" />
    </NTabs>

    <NCard title="评分结果列表" :bordered="false">
      <HseDataGrid
        :columns="columns"
        :data="dataSource"
        :loading="loading"
        :pager="false"
        auto-width
        :default-sort="{ field: 'scoreTotal', order: sortOrder }"
        @sort-change="handleSortChange"
      >
        <template #gridLevelCell="{ row }">
          <span>{{ row.gridLevel || '-' }}</span>
        </template>
        <template #dimHeader="{ column }">
          <div class="dim-col-header">
            <div class="dim-col-title-line">
              <span>{{ dimHeaderName(column) }}</span>
              <NTooltip trigger="hover" placement="top" style="max-width: 460px">
                <template #trigger>
                  <IconifyIcon icon="lucide:circle-help" class="dim-col-help" />
                </template>
                {{ dimHelpText(column) }}
              </NTooltip>
            </div>
            <div class="dim-col-limit">{{ dimHeaderLimit(column) }}</div>
          </div>
        </template>
        <template #dimCell="{ row, column }">
          <template v-if="(Number(dimValue(row as AssessmentMonthlyApi.AssessmentTarget, column && (column.field ?? (column as any).key))) || 0) > 0">
            <NTag
              :bordered="false"
              size="small"
              type="warning"
              class="sanwei-score-tag"
              @click="openDimDetail(row as AssessmentMonthlyApi.AssessmentTarget, column)"
            >
              {{ dimValue(row as AssessmentMonthlyApi.AssessmentTarget, column && (column.field ?? (column as any).key)) }}
            </NTag>
          </template>
          <NTag v-else :bordered="false" size="small" type="success">
            {{ dimValue(row as AssessmentMonthlyApi.AssessmentTarget, column && (column.field ?? (column as any).key)) }}
          </NTag>
        </template>
        <template #scoreTotalCell="{ row }">
          <NTag
            v-if="Number(displayScoreTotal(row as AssessmentMonthlyApi.AssessmentTarget)) > 0"
            :bordered="false"
            size="small"
            type="error"
          >
            {{ displayScoreTotal(row as AssessmentMonthlyApi.AssessmentTarget) }}
          </NTag>
          <NTag v-else :bordered="false" size="small" type="success">
            {{ displayScoreTotal(row as AssessmentMonthlyApi.AssessmentTarget) }}
          </NTag>
        </template>
        <template #actionCell="{ row }">
          <NButton text type="primary" @click="openDetail(row as AssessmentMonthlyApi.AssessmentTarget)">
            查看
          </NButton>
        </template>
      </HseDataGrid>
    </NCard>

    <NModal
      v-model:show="detailVisible"
      preset="card"
      :title="detailTitle"
      style="width: 800px; max-width: 92vw"
      :mask-closable="true"
    >
      <div class="detail-modal-body">
        <HseDataGrid
          :columns="detailColumns"
          :data="detailList"
          :loading="detailLoading"
          :pager="false"
          scroll-x="auto"
        >
          <template #dtCell="{ row }">
            <span>{{ DEDUCTION_TYPE_TEXT[(row as any).deductionType] || (row as any).deductionType || '-' }}</span>
          </template>
          <template #summaryCell="{ row }">
            <span>{{ (row as any).summary || '-' }}</span>
          </template>
          <template #rsCell="{ row }">
            <span>{{ REVIEW_STATUS_TEXT[(row as any).reviewStatus] || (row as any).reviewStatus || '-' }}</span>
          </template>
        </HseDataGrid>
      </div>
    </NModal>

    <NModal
      v-model:show="dimDetailVisible"
      preset="card"
      :title="`${dimHeaderName({ title: dimDetailCategory }) || dimDetailCategory} · 扣分明细`"
      style="width: 420px; max-width: 92vw"
      :mask-closable="true"
    >
      <div class="sanwei-breakdown">
        <NSpin :show="dimDetailLoading">
          <div
            v-for="(item, i) in dimDetailItems"
            :key="i"
            class="sanwei-breakdown-item"
            @click="isSanweiCategory(dimDetailCategory) ? drillToViolationAssessment(dimDetailRow) : drillDimDetail(dimDetailCategory, dimDetailRow)"
          >
            <span>{{ item.label }}</span>
            <span class="sanwei-breakdown-val">{{ formatScore(item.value) }} 分</span>
          </div>
          <div v-if="!dimDetailLoading && dimDetailItems.length === 0" class="sanwei-breakdown-empty">
            暂无扣分明细
          </div>
          <div class="sanwei-breakdown-total">
            <span>合计</span>
            <span>{{ formatScore(dimDetailTotal()) }} 分</span>
          </div>
        </NSpin>
      </div>
    </NModal>
  </HsePageLayout>
</template>

<style>
/* 维度列双行表头：类别名 / （分数 分）分行展示，并自动增高表头 */
.vxe-header--column.is-dim-col {
  height: auto !important;
  white-space: normal;
  overflow: visible;
  vertical-align: middle;
}
.vxe-header--column.is-dim-col .vxe-cell {
  white-space: normal;
  overflow: visible;
  line-height: 1.3;
}
.dim-col-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 4px 2px;
}
.dim-col-title-line {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}
.dim-col-help {
  color: #8a919f;
  font-size: 14px;
  cursor: help;
}
.dim-col-limit {
  color: #8a919f;
  font-size: 12px;
}
/* 三违管理维度列：>0 数字可点击查看构成明细 */
.sanwei-score-tag {
  cursor: pointer;
}
.sanwei-breakdown {
  min-width: 240px;
}
.sanwei-breakdown-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 4px 6px;
  border-radius: 4px;
  cursor: pointer;
}
.sanwei-breakdown-item:hover {
  background: rgba(245, 158, 11, 0.14);
  color: #d97706;
}
.sanwei-breakdown-val {
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
}
/* 扣分明细弹窗内容区：多行时内部滚动，避免撑高弹窗 */
.detail-modal-body {
  max-height: 60vh;
  overflow: auto;
}
</style>