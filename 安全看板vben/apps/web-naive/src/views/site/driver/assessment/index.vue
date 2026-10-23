<script lang="ts" setup>
/**
 * 交通安全档案（web-naive · 驾驶员管理 · 评估档案）
 * 后端：/site-mgmt/driver-assessments（共享内存模式后端，复用 web-antd 契约）
 * 能力：4 统计卡片（按派生状态点击筛选）/ 导入(driver-assessment) / 新增·编辑 / 详情 / 删除(二次确认) / 人员匹配校验 / 空态
 *       + 风险等级自动判定（依据《附件1 表1 驾驶员安全驾驶风险等级划分标准及管控措施》）
 * 字段严格绑定共享后端 camelCase 字段。
 *
 * 自动判定两条通道（2026-09-03 新增）：
 *   1. 「按违章记录判定」：读库内 /site-mgmt/driver-violations，按姓名聚合后判定
 *   2. 「导入违章Excel判定」：前端解析「驾驶员五年违章记录汇总.xlsx」后判定（不落违章明细）
 *   两条通道共用 riskRules 引擎 + 同一个预览/写入弹窗，判完可人工在列表下拉复核覆盖。
 */
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import {
  NButton,
  NCard,
  NCheckbox,
  NDescriptions,
  NDescriptionsItem,
  NDrawer,
  NDrawerContent,
  NForm,
  NFormItem,
  NGi,
  NInput,
  NModal,
  NPopconfirm,
  NSelect,
  NSpace,
  NSpin,
  NStatistic,
  NTabPane,
  NTabs,
  NTag,
  NText,
  NAlert,
} from 'naive-ui';
import { $t } from '#/locales';

import {
  HseActionBar,
  HseDataGrid,
  HseImportDialog,
  HsePageLayout,
  HseSearchPanel,
  HseStatusTag,
} from '#/components/hse';
import type { VxeTableGridColumns } from '#/adapter/vxe-table';
import {
  createDriverAssessment,
  deleteDriverAssessment,
  getDriverAssessmentList,
  getDriverViolationList,
  getDriverThreeViolationList,
  renumberDriverAssessments,
  updateDriverAssessment,
  type SiteApi,
} from '#/api/hse/site';
import { getEmployeeList } from '#/api/hse/employee';
import { getProfileList, withRosterCache, type EmployeeProfileApi } from '#/api/hse/employee-profile';
import { useGenericImport } from '#/views/hse/_shared/useGenericImport';
import { message } from '#/adapter/naive';
import { IconifyIcon } from '@vben/icons';
import type { ECOption, EchartsUIType } from '@vben/plugins/echarts';
import { EchartsUI, useEcharts } from '@vben/plugins/echarts';
import {
  calcDriverRisk,
  calcDriverRiskByScore,
  riskContent,
  riskMeasures,
  RISK_LEVEL_NTAG,
  RISK_LEVEL_OPTIONS,
  RISK_LEVEL_TAG,
  type RiskLevel,
  type ViolationInput,
} from '#/views/site/driver/_shared/riskRules';
import { readViolationExcel } from '#/views/site/driver/_shared/readViolationExcel';

defineOptions({ name: 'SiteDriverAssessment' });

// ===================== 字典与自动填充映射 =====================
// 评估类别
const ASSESSMENT_TYPES = ['驾驶证评估', '三违评估'];

// 状态：完成 / 未完成
const STATUS_OPTIONS = [
  { label: '完成', value: '完成' },
  { label: '未完成', value: '未完成' },
];

// 风险等级四级字典与表1「违规内容/管控措施」原文来自共享引擎 _shared/riskRules.ts（单一数据源）

/** 风险等级 → 标签配色；非法/空值回落 neutral，避免用 any 索引 Record 报错 */
function riskTagType(level?: string): 'success' | 'info' | 'warning' | 'danger' | 'neutral' {
  return (level && RISK_LEVEL_TAG[level as RiskLevel]) || 'neutral';
}

// 风险等级变更：自动带出评估结果 + 管控措施
// P0 前写死 `assessmentType !== '驾驶证评估' 直接 return`，导致三违评估下拉选等级时
// 不会带出表1的违规内容与管控措施；现放开类别限制，两类评估共用同一套表1文案。
function onRiskLevelChange(val: string | null) {
  formModel.assessmentResult = val ? riskContent(val as RiskLevel) : '';
  formModel.controlMeasures = val ? riskMeasures(val as RiskLevel) : '';
}

// ===================== 列表数据 =====================
const loading = ref(false);
const allRows = ref<SiteApi.DriverAssessment[]>([]);
const data = ref<SiteApi.DriverAssessment[]>([]);
const total = ref(0);
const currentPage = ref(1);
const activeStatKey = ref<string | null>(null);

/** 当前 Tab：驾驶证评估 / 三违评估 */
const activeTab = ref<'驾驶证评估' | '三违评估'>('驾驶证评估');

/** 三违评估图表数据源（原始违章记录） */
const violationLoading = ref(false);
const violationList = ref<SiteApi.DriverViolation[]>([]);

/**
 * 驾驶员花名册下拉（姓名 / 部门自动带出）。
 * 必须于 setup 早期声明：其后 swCalcMerged / 等级分布图 watch 都引用它，
 * 若声明靠后，watch 创建时会立即求值 getter 触发 TDZ。
 */
const driverOptions = ref<{ label: string; value: number; employee: EmployeeProfileApi.ProfileListItem }[]>([]);

// ECharts 实例引用
const licenseLevelChartRef = ref<EchartsUIType>();
const swLevelChartRef = ref<EchartsUIType>();
const swTypeChartRef = ref<EchartsUIType>();
const swAvgChartRef = ref<EchartsUIType>();
const { renderEcharts: renderLicenseLevel } = useEcharts(licenseLevelChartRef);
const { renderEcharts: renderSwLevel } = useEcharts(swLevelChartRef);
const { renderEcharts: renderSwType } = useEcharts(swTypeChartRef);
const { renderEcharts: renderSwAvg } = useEcharts(swAvgChartRef);

// Canvas 无法解析 CSS 变量，图表配色使用固定色值（对齐 RISK_LEVEL_TAG 语义）
const CHART_COLORS = {
  重大: '#f5222d',
  较大: '#faad14',
  一般: '#1890ff',
  较低: '#52c41a',
  text: '#1f1f1f',
  bg: '#ffffff',
  border: '#f0f0f0',
  grid: '#f0f0f0',
};

const searchForm = reactive({
  keyword: '',
  department: '',
  archiveYear: '',
});

// 派生状态：有效 / 已过期 / 待复检
function deriveStatus(row: SiteApi.DriverAssessment): '有效' | '已过期' | '待复检' {
  if (!row.expiryDate) return '待复检';
  const diff = diffDays(row.expiryDate);
  if (Number.isNaN(diff)) return '待复检';
  return diff < 0 ? '已过期' : '有效';
}

/** 当前 Tab 下的档案行 */
const tabRows = computed(() =>
  allRows.value.filter((r) => (r.assessmentType || '驾驶证评估') === activeTab.value),
);

const statItems = computed(() => {
  // 前 4 张卡基于当前 Tab 的数据；第 5 张「三违评估数」始终显示三违评估档案总数
  const rows = tabRows.value;
  const valid = rows.filter((r) => deriveStatus(r) === '有效').length;
  const expired = rows.filter((r) => deriveStatus(r) === '已过期').length;
  const revisit = rows.filter((r) => deriveStatus(r) === '待复检').length;
  const swCount = allRows.value.filter((r) => (r.assessmentType || '驾驶证评估') === '三违评估').length;
  return [
    { key: 'total', label: '档案总数', value: rows.length, type: 'default' as const, icon: 'lucide:file-text' as const },
    { key: '有效', label: '有效', value: valid, type: 'success' as const, icon: 'lucide:check-circle' as const },
    { key: '已过期', label: '已过期', value: expired, type: 'error' as const, icon: 'lucide:x-circle' as const },
    { key: '待复检', label: '待复检', value: revisit, type: 'warning' as const, icon: 'lucide:alert-circle' as const },
    { key: '三违评估数', label: '三违评估数', value: swCount, type: 'info' as const, icon: 'lucide:shield-alert' as const },
  ];
});

// ===================== 三违评估判定口径 =====================
/**
 * 三违评估等级阈值（按「自然年度」累计扣分定级）。
 *
 * 较低 ≤15 分；一般 16~30 分；较大 31~50 分；重大 >50 分。
 * 口径如需调整只改这里。
 */
const SW_LEVEL_THRESHOLDS = { 一般: 16, 较大: 31, 重大: 50 } as const;

/** 取时间串里的年份：'2025-05-09 07:42:00' → 2025 */
function yearOf(v?: string | null): number | null {
  if (!v) return null;
  const m = String(v).match(/(\d{4})/);
  return m ? Number(m[1]) : null;
}

/** 三违评估：按自然年度累计扣分（当前年度）定级 */
function swLevelByPoints(points: number): RiskLevel {
  if (points > SW_LEVEL_THRESHOLDS.重大) return '重大';
  if (points >= SW_LEVEL_THRESHOLDS.较大) return '较大';
  if (points >= SW_LEVEL_THRESHOLDS.一般) return '一般';
  return '较低';
}

/** 违章明细 → 三违判定所需的最小结构（图表与判定共用，保证口径一致） */
const violationRows = computed(() =>
  violationList.value.map((v) => ({
    name: v.name || '',
    time: v.violationTime,
    points: Number(v.demeritPoints) || 0,
    type: v.violationType || '',
    desc: v.violationDesc || '',
  })),
);

type SwCalcItem = {
  name: string;
  level: RiskLevel;
  yearPoints: number; // 当前自然年度累计扣分（定级依据）
  totalCount: number; // 总违章条数
  topType: string; // 主要三违类型（频率最高的违章事由）
};

/** 违章明细 → 按姓名聚合 → 三违评估判定结果（按等级由重到轻、扣分由高到低排序） */
function swCalcByName(items: { name?: string; time?: string | null; points?: number; desc?: string }[]): SwCalcItem[] {
  const currentYear = new Date().getFullYear();
  const byName = new Map<
    string,
    {
      yearPoints: number; // 本年度累计扣分
      totalCount: number; // 总条数
      descs: Record<string, number>; // 违章事由计数
    }
  >();
  for (const it of items) {
    const nm = (it.name || '').trim();
    if (!nm) continue;
    if (!byName.has(nm)) byName.set(nm, { yearPoints: 0, totalCount: 0, descs: {} });
    const cur = byName.get(nm)!;
    cur.totalCount += 1;
    const y = yearOf(it.time);
    if (y === currentYear) {
      cur.yearPoints += Number(it.points) || 0;
    }
    const d = ((it.desc || '').trim()) || '未分类';
    if (d) cur.descs[d] = (cur.descs[d] || 0) + 1;
  }
  const out: SwCalcItem[] = [];
  for (const [name, cur] of byName) {
    const topType = Object.entries(cur.descs).sort((a, b) => b[1] - a[1])[0]?.[0] || '-';
    out.push({
      name,
      level: swLevelByPoints(cur.yearPoints),
      yearPoints: cur.yearPoints,
      totalCount: cur.totalCount,
      topType,
    });
  }
  const order: Record<RiskLevel, number> = { 重大: 0, 较大: 1, 一般: 2, 较低: 3 };
  out.sort((a, b) => order[a.level] - order[b.level] || b.yearPoints - a.yearPoints);
  return out;
}

/**
 * 三违评估名单（融合花名册）：在按三违扣分记录聚合的结果之上，
 * 补入花名册中尚无扣分记录的驾驶员（0 分 / 「较低」档），保证「生成三违评估」预览
 * 与等级分布图表覆盖全部当前在册驾驶员，而非仅有扣分记录者。
 */
function swCalcMerged(): SwCalcItem[] {
  const calc = swCalcByName(violationRows.value);
  const seen = new Set(calc.map((c) => c.name));
  const merged = [...calc];
  for (const o of driverOptions.value) {
    const nm = (o.employee.name || '').trim();
    if (!nm || seen.has(nm)) continue;
    seen.add(nm);
    merged.push({ name: nm, level: '较低', yearPoints: 0, totalCount: 0, topType: '-' });
  }
  const order: Record<RiskLevel, number> = { 重大: 0, 较大: 1, 一般: 2, 较低: 3 };
  merged.sort((a, b) => order[a.level] - order[b.level] || b.yearPoints - a.yearPoints);
  return merged;
}

/** 驾驶证评估 Tab：风险等级分布（基于当前 Tab 全部档案） */
const licenseLevelChartOption = computed<ECOption>(() => {
  const dist: Record<RiskLevel, number> = { 重大: 0, 较大: 0, 一般: 0, 较低: 0 };
  for (const r of tabRows.value) {
    const lv = (r.assessmentLevel || '较低') as RiskLevel;
    if (dist[lv] !== undefined) dist[lv] += 1;
  }
  const data = (['重大', '较大', '一般', '较低'] as RiskLevel[])
    .map((lv) => ({ name: lv, value: dist[lv], itemStyle: { color: CHART_COLORS[lv] } }))
    .filter((d) => d.value > 0);
  if (data.length === 0) {
    return { title: { text: '暂无数据', left: 'center', top: 'center', textStyle: { color: CHART_COLORS.text, fontSize: 14, fontWeight: 'normal' } }, series: [] };
  }
  return {
    tooltip: { trigger: 'item', backgroundColor: CHART_COLORS.bg, textStyle: { color: CHART_COLORS.text }, formatter: '{b}: {c} ({d}%)' },
    legend: { bottom: 0, textStyle: { color: CHART_COLORS.text, fontSize: 12 } },
    series: [{ type: 'pie', radius: ['55%', '75%'], center: ['50%', '45%'], avoidLabelOverlap: false, label: { show: false }, data }],
  };
});

/** 三违评估 Tab：风险等级分布（按姓名取「自然年度累计扣分」最高年定级） */
const swLevelChartOption = computed<ECOption>(() => {
  const dist: Record<RiskLevel, number> = { 重大: 0, 较大: 0, 一般: 0, 较低: 0 };
  // 与「生成三违评估」共用名单（融合花名册全部驾驶员），避免图表口径与档案里的等级对不上
  for (const it of swCalcMerged()) {
    dist[it.level] += 1;
  }
  const data = (['重大', '较大', '一般', '较低'] as RiskLevel[])
    .map((lv) => ({ name: lv, value: dist[lv], itemStyle: { color: CHART_COLORS[lv] } }))
    .filter((d) => d.value > 0);
  if (data.length === 0) {
    return { title: { text: '暂无数据', left: 'center', top: 'center', textStyle: { color: CHART_COLORS.text, fontSize: 14, fontWeight: 'normal' } }, series: [] };
  }
  return {
    tooltip: { trigger: 'item', backgroundColor: CHART_COLORS.bg, textStyle: { color: CHART_COLORS.text }, formatter: '{b}: {c} ({d}%)' },
    legend: { bottom: 0, textStyle: { color: CHART_COLORS.text, fontSize: 12 } },
    series: [{ type: 'pie', radius: ['55%', '75%'], center: ['50%', '45%'], avoidLabelOverlap: false, label: { show: false }, data }],
  };
});

/** 三违评估 Tab：三违类型 TopN（柱状图） */
const swTypeChartOption = computed<ECOption>(() => {
  const count: Record<string, number> = {};
  for (const v of violationList.value) {
    const t = (v.violationType || v.violationDesc || '未分类').trim();
    if (!t) continue;
    count[t] = (count[t] || 0) + 1;
  }
  const sorted = Object.entries(count)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  if (sorted.length === 0) {
    return { title: { text: '暂无数据', left: 'center', top: 'center', textStyle: { color: CHART_COLORS.text, fontSize: 14, fontWeight: 'normal' } }, series: [] };
  }
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, backgroundColor: CHART_COLORS.bg, textStyle: { color: CHART_COLORS.text } },
    grid: { left: '3%', right: '4%', bottom: '3%', top: '10%', containLabel: true },
    xAxis: { type: 'category', data: sorted.map((i) => i[0]), axisLabel: { color: CHART_COLORS.text, rotate: 30, fontSize: 11 }, axisLine: { lineStyle: { color: CHART_COLORS.border } } },
    yAxis: { type: 'value', axisLabel: { color: CHART_COLORS.text }, splitLine: { lineStyle: { color: CHART_COLORS.grid } } },
    series: [{ type: 'bar', data: sorted.map((i) => i[1]), itemStyle: { color: CHART_COLORS['一般'], borderRadius: [4, 4, 0, 0] }, barWidth: '50%' }],
  };
});

/** 三违评估 Tab：扣分合计排行 Top10（横向条形图，按累计扣分） */
const swAvgChartOption = computed<ECOption>(() => {
  const byName = new Map<string, { points: number; count: number }>();
  for (const v of violationList.value) {
    if (!v.name) continue;
    const cur = byName.get(v.name) || { points: 0, count: 0 };
    cur.points += Number(v.demeritPoints) || 0;
    cur.count += 1;
    byName.set(v.name, cur);
  }
  const sorted = [...byName.entries()]
    .map(([name, { points, count }]) => ({ name, points, avg: count ? +(points / count).toFixed(1) : 0 }))
    .sort((a, b) => b.points - a.points)
    .slice(0, 10);
  if (sorted.length === 0) {
    return { title: { text: '暂无数据', left: 'center', top: 'center', textStyle: { color: CHART_COLORS.text, fontSize: 14, fontWeight: 'normal' } }, series: [] };
  }
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, backgroundColor: CHART_COLORS.bg, textStyle: { color: CHART_COLORS.text }, formatter: '{b}: 累计 {c} 分' },
    grid: { left: '3%', right: '8%', bottom: '3%', top: '3%', containLabel: true },
    xAxis: { type: 'value', axisLabel: { color: CHART_COLORS.text }, splitLine: { lineStyle: { color: CHART_COLORS.grid } } },
    yAxis: { type: 'category', data: sorted.map((i) => i.name).reverse(), axisLabel: { color: CHART_COLORS.text, fontSize: 12 }, axisLine: { lineStyle: { color: CHART_COLORS.border } } },
    series: [{ type: 'bar', data: sorted.map((i) => i.points).reverse(), itemStyle: { color: CHART_COLORS['较大'], borderRadius: [0, 4, 4, 0] }, barWidth: '55%' }],
  };
});

// 数据变化时重绘图表（仅在对应 Tab 可见时渲染，避免隐藏容器 0 尺寸导致 ECharts 报错）
watch(() => tabRows.value, () => {
  if (activeTab.value === '驾驶证评估') renderLicenseLevel(licenseLevelChartOption.value);
}, { deep: true });
watch(() => violationList.value, () => {
  if (activeTab.value === '三违评估') {
    renderSwLevel(swLevelChartOption.value);
    renderSwType(swTypeChartOption.value);
    renderSwAvg(swAvgChartOption.value);
  }
}, { deep: true });
// 三违等级分布图名单融合花名册驾驶员，花名册更新（如「同步花名册」）后须重绘
watch(() => driverOptions.value, () => {
  if (activeTab.value === '三违评估' && swLevelChartRef.value) {
    renderSwLevel(swLevelChartOption.value);
  }
}, { deep: true });

// 按「姓名 + 评估类别」去重：同名同类的只保留第一条（保留一个），不同类别（如驾驶证评估 / 三违评估）各自保留
function dedupeByName(rows: SiteApi.DriverAssessment[]): SiteApi.DriverAssessment[] {
  const seen = new Set<string>();
  const out: SiteApi.DriverAssessment[] = [];
  for (const r of rows) {
    const key = `${(r.name ?? '').trim()}|${r.assessmentType || '驾驶证评估'}`;
    if (!key) {
      out.push(r);
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

// 「累计扣分」列按评估类别分流数据源：
//  - 驾驶证评估  → 「驾驶员违章记录 · 驾驶证扣分记录」近12个月累计
//  - 三违评估    → 「驾驶员违章记录 · 三违扣分记录」当前自然年度累计（与三违定级口径一致）
const licenseCumulativePointsMap = ref<Record<string, number>>({});
const threeViolationCumulativePointsMap = ref<Record<string, number>>({});
/** 累计扣分明细弹窗原始数据：驾驶证/三违扣分记录全量（按当前 Tab 取源，时间窗与「累计扣分」列一致） */
const licenseViolationRows = ref<SiteApi.DriverViolation[]>([]);
const threeViolationRows = ref<SiteApi.DriverViolation[]>([]);

/** 驾驶证扣分记录加载：拉取「驾驶证扣分记录」表，仅累加「近12个月」内各条违章明细「计分」 */
async function loadLicenseCumulativePoints() {
  try {
    const res = await getDriverViolationList({ pageSize: 9999 } as any);
    licenseViolationRows.value = (res.list || []) as SiteApi.DriverViolation[];
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 11, now.getDate()); // 近12个月起始
    const map: Record<string, number> = {};
    for (const r of res.list || []) {
      const name = ((r as any).name || '').trim();
      if (!name) continue;
      const t = (r as any).violationTime as string | null | undefined;
      if (!t) continue;
      const d = new Date(String(t).replace(/-/g, '/'));
      if (Number.isNaN(d.getTime()) || d < start || d > now) continue; // 仅统计近12个月内的扣分
      map[name] = (map[name] || 0) + (Number((r as any).demeritPoints) || 0);
    }
    licenseCumulativePointsMap.value = map;
  } catch {
    licenseCumulativePointsMap.value = {};
  }
}

/** 三违扣分记录加载：拉取「三违扣分记录」独立表，仅累加「当前自然年度」内各条「计分」，供三违评估「累计扣分」列展示 */
async function loadThreeViolationCumulativePoints() {
  const currentYear = new Date().getFullYear();
  try {
    const res = await getDriverThreeViolationList({ pageSize: 9999 } as any);
    threeViolationRows.value = (res.list || []) as SiteApi.DriverViolation[];
    const map: Record<string, number> = {};
    for (const r of res.list || []) {
      const name = ((r as any).name || '').trim();
      if (!name) continue;
      const t = (r as any).violationTime as string | null | undefined;
      if (!t) continue;
      if (yearOf(t) !== currentYear) continue; // 仅统计当前自然年度内的扣分
      map[name] = (map[name] || 0) + (Number((r as any).demeritPoints) || 0);
    }
    threeViolationCumulativePointsMap.value = map;
  } catch {
    threeViolationCumulativePointsMap.value = {};
  }
}

async function loadCumulativePoints() {
  await Promise.all([loadLicenseCumulativePoints(), loadThreeViolationCumulativePoints()]);
}

/** 「累计扣分」列取值：按当前激活 Tab 取源，互不串源——
 *   驾驶证评估 tab →「驾驶证扣分记录」近12月累计；
 *   三违评估 tab   →「三违扣分记录」当前自然年度累计。
 * 以 activeTab 为准（而非单行 assessmentType），保证与用户当前所看 Tab 的数据源完全一致。
 */
function cumulativePoints(_row: any): number | null {
  return (activeTab.value === '三违评估'
    ? threeViolationCumulativePointsMap.value
    : licenseCumulativePointsMap.value)[(_row.name || '').trim()] ?? 0;
}

/** 累计扣分数值（null 视为 0）：单元格标色与排序共用 */
function pointsOf(row: any): number {
  const v = cumulativePoints(row);
  return typeof v === 'number' ? v : 0;
}

/** 数字格式化（整数原样、小数保留2位） */
function fmtPoints(v: number | null | undefined): string {
  if (v == null || Number.isNaN(Number(v))) return '0';
  const n = Number(v);
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

// ===================== 累计扣分明细弹窗（对齐「三违管理考核」：点击数字弹逐条明细 + 合计，明细可下钻） =====================
const deductModalShow = ref(false);
const deductRowName = ref('');
const router = useRouter();

/** 弹窗明细源：按当前 Tab 取对应违章表，时间窗与「累计扣分」列完全一致（驾驶证近12月 / 三违当前自然年度） */
const deductViolationRows = computed<SiteApi.DriverViolation[]>(() => {
  const nm = deductRowName.value.trim();
  if (!nm) return [];
  const list = activeTab.value === '三违评估' ? threeViolationRows.value : licenseViolationRows.value;
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 11, now.getDate()); // 近12个月起始
  const currentYear = now.getFullYear();
  return list.filter((r) => {
    if ((r.name || '').trim() !== nm) return false;
    const t = r.violationTime;
    if (!t) return false;
    if (activeTab.value === '三违评估') return yearOf(t) === currentYear;
    const d = new Date(String(t).replace(/-/g, '/'));
    return !Number.isNaN(d.getTime()) && d >= start && d <= now;
  });
});

function openDeductModal(row: SiteApi.DriverAssessment) {
  if (pointsOf(row) <= 0) return;
  deductRowName.value = row.name || '';
  deductModalShow.value = true;
}

/** 明细行：日期+事由 / 地点·车牌·罚款 / 计分 */
const deductRows = computed(() =>
  deductViolationRows.value.map((d) => ({
    label: `${d.violationTime || '—'}${d.violationDesc || d.violationType ? ` ${d.violationDesc || d.violationType}` : ''}`,
    sub: [
      d.violationLocation && `地点：${d.violationLocation}`,
      d.plateNo && `车牌：${d.plateNo}`,
      d.fineAmount ? `罚款：${fmtPoints(d.fineAmount)} 元` : '',
    ]
      .filter(Boolean)
      .join('；'),
    value: `-${fmtPoints(d.demeritPoints)} 分`,
    driver: d.name || '',
  })),
);
const deductTotal = computed(() =>
  deductViolationRows.value.reduce((a, d) => a + (Number(d.demeritPoints) || 0), 0),
);

/** 明细点击下钻「驾驶员违章记录」对应 Tab（驾驶证扣分记录 / 三违扣分记录），并按姓名过滤 */
function locateDeduct(r?: { driver?: string }) {
  if (!r) return;
  deductModalShow.value = false;
  void router.push({
    path: '/site/driver/violation',
    query: {
      tab: activeTab.value === '三违评估' ? 'threeViolation' : 'license',
      name: r.driver || '',
    },
  });
}

// —— 表头排序（本地排序：数据一次性全量加载，服务端三态事件在此驱动重排） ——
/** 风险等级 × 序号（由轻到重：较低<一般<较大<重大，对齐 RISK_LEVELS） */
const RISK_ORDER: Record<string, number> = { 较低: 0, 一般: 1, 较大: 2, 重大: 3 };
const sortState = ref<{ by?: string; order?: 'asc' | 'desc' }>({});

function onSortChange(payload: { sortBy?: string; sortOrder?: 'asc' | 'desc' }) {
  // 取消排序（sortOrder 为空）→ 清空，恢复默认档案编号顺序；否则按所选列与方向重排
  sortState.value = payload.sortOrder ? { by: payload.sortBy, order: payload.sortOrder } : {};
  applyFilterAndPaginate();
}

/** 依据 sortState 对行排序；无显式排序时按档案编号末尾序号升序，无编号（花名册空档案行）排最后 */
function sortRows(rows: any[]): any[] {
  const { by, order } = sortState.value;
  if (!by) {
    return [...rows].sort((a, b) => {
      const sa = archiveSeq(a.archiveNo);
      const sb = archiveSeq(b.archiveNo);
      if (sa === null) return sb === null ? 0 : 1;
      if (sb === null) return -1;
      return sa - sb;
    });
  }
  const factor = order === 'desc' ? -1 : 1;
  // 数值列：档案编号（尾号）、累计扣分、风险等级
  if (by === 'archiveNo' || by === 'cumulativeThreeViolationPoints' || by === 'assessmentLevel') {
    const mk = (r: any): number => {
      if (by === 'archiveNo') return archiveSeq(r.archiveNo) ?? Number.POSITIVE_INFINITY;
      if (by === 'cumulativeThreeViolationPoints') return pointsOf(r);
      return RISK_ORDER[(r.assessmentLevel || '') as string] ?? 99;
    };
    return [...rows].sort((a, b) => {
      const va = mk(a);
      const vb = mk(b);
      if (va === Number.POSITIVE_INFINITY) return vb === Number.POSITIVE_INFINITY ? 0 : 1;
      if (vb === Number.POSITIVE_INFINITY) return -1;
      return (va - vb) * factor;
    });
  }
  // 字符串列：姓名 / 所属部门 / 状态
  const sv = (r: any) =>
    String(
      by === 'name'
        ? r.name || ''
        : by === 'department'
          ? displayDept(r) || ''
          : r.status || '',
    );
  return [...rows].sort((a, b) => sv(a).localeCompare(sv(b), 'zh-Hans-CN') * factor);
}

async function loadData() {
  loading.value = true;
  try {
    await loadCumulativePoints();
    const res = await getDriverAssessmentList({
      pageSize: 9999,
      keyword: searchForm.keyword || undefined,
      department: searchForm.department || undefined,
      archiveYear: searchForm.archiveYear || undefined,
    } as any);
    allRows.value = dedupeByName(res.list ?? []);
    applyFilterAndPaginate();
  } catch {
    allRows.value = [];
    data.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
}

function applyFilterAndPaginate() {
  let rows = tabRows.value;
  // 姓名按最新花名册职位（司机/驾驶员）动态显示：默认仅显示当前在册驾驶员档案；
  // 进行姓名/档案编号搜索时放行全部（含离职），实现「离职不显示但可查询」。
  if (!searchForm.keyword && rosterLoaded.value) {
    rows = rows.filter((r) => isCurrentDriver(r.name));
    // 三违评估 tab：补入花名册中尚无三违档案的当前在册驾驶员空行，
    // 使「三违评估」驾驶员数量始终等于花名册全部在册驾驶员（默认视图、无统计筛选时）。
    if (activeTab.value === '三违评估' && !activeStatKey.value) {
      rows = mergeRosterIntoThreeViolation(rows);
    }
  }
  if (activeStatKey.value && activeStatKey.value !== 'total') {
    rows = rows.filter((r) => deriveStatus(r) === activeStatKey.value);
  }
  total.value = rows.length;
  // 表头排序：按 sortState 排序；无显式排序时按档案编号末尾序号升序，无编号（花名册空档案行）排最后
  rows = sortRows(rows);
  // 全部显示：不去分页，直接展示去重后的完整列表
  data.value = rows;
}

/** 提取档案编号末尾序号（DA-2026-0012 → 12）；无编号或格式不符返回 null */
function archiveSeq(archiveNo: string | null | undefined): number | null {
  if (!archiveNo) return null;
  const m = String(archiveNo).match(/-(\d+)$/);
  if (!m) return null;
  const n = Number.parseInt(m[1] ?? '', 10);
  return Number.isNaN(n) ? null : n;
}

function onStatClick(key: string) {
  if (key === '三违评估数') {
    onTabChange('三违评估');
    return;
  }
  activeStatKey.value = key === 'total' ? null : key;
  currentPage.value = 1;
  applyFilterAndPaginate();
}

/** Tab 切换：三违评估 Tab 首次进入时加载原始违章数据供图表使用 */
async function onTabChange(tab: '驾驶证评估' | '三违评估') {
  activeTab.value = tab;
  activeStatKey.value = null;
  currentPage.value = 1;
  applyFilterAndPaginate();
  await nextTick();
  if (tab === '三违评估') {
    if (violationList.value.length === 0) {
      await loadViolations();
    } else {
      renderSwLevel(swLevelChartOption.value);
      renderSwType(swTypeChartOption.value);
      renderSwAvg(swAvgChartOption.value);
    }
  } else {
    renderLicenseLevel(licenseLevelChartOption.value);
  }
}

async function loadViolations() {
  violationLoading.value = true;
  try {
    // 三违评估数据源：读取「驾驶员违章记录 · 三违扣分记录」独立表（driver_three_violation），
    // 而非驾驶证扣分记录（driver_violation）。二者为不同范畴的三违/扣分统计。
    const res = await getDriverThreeViolationList({ pageSize: 9999 } as any);
    violationList.value = (res.list || []) as SiteApi.DriverViolation[];
  } catch {
    violationList.value = [];
  } finally {
    violationLoading.value = false;
  }
}

function onSearch() {
  currentPage.value = 1;
  loadData();
}
function onReset() {
  Object.assign(searchForm, { keyword: '', department: '', archiveYear: '' });
  activeStatKey.value = null;
  onSearch();
}
// ===================== 导入 =====================
const {
  importOpen,
  importPreviewColumns,
  importPreviewData,
  importPreviewError,
  importConfirming,
  importResult,
  onDownloadTemplate: onImportTemplate,
  onUpload: onImportUpload,
  onConfirmImport: onImportConfirm,
  onImportClose: onImportDialogClose,
  bindRefresh,
} = useGenericImport('driver-assessment');

async function onImportSuccess() {
  await loadData();
  await checkPersonnelMatch();
}
bindRefresh(onImportSuccess);

async function onRefresh() {
  await loadData();
}

// ===================== 人员匹配校验（姓名 → 花名册） =====================
const rosterNames = ref<Set<string>>(new Set());
async function loadRosterNames() {
  try {
    // 全量花名册名单按 scope=all 版本比对缓存（以花名册导入为刷新节点），仅缓存姓名数组
    const names = await withRosterCache<string[]>(
      'dw_assessment_roster',
      'all',
      async () =>
        ((await getEmployeeList({ pageSize: 9999 } as any))?.list || [])
          .map((e: any) => e.name)
          .filter(Boolean),
    );
    rosterNames.value = new Set(names);
  } catch {
    rosterNames.value = new Set();
  }
}

const matchVisible = ref(false);
const matchLoading = ref(false);
const matchResult = ref<{ total: number; matched: number; mismatches: any[] } | null>(null);

async function checkPersonnelMatch() {
  matchLoading.value = true;
  matchVisible.value = true;
  try {
    await loadRosterNames();
    const mismatches: any[] = [];
    let matched = 0;
    for (const r of allRows.value) {
      if (!r.name) continue;
      if (rosterNames.value.has(r.name)) matched++;
      else mismatches.push({ id: r.id, name: r.name, archiveNo: r.archiveNo || '-' });
    }
    matchResult.value = {
      total: allRows.value.filter((r) => r.name).length,
      matched,
      mismatches,
    };
  } finally {
    matchLoading.value = false;
  }
}

function handleDownloadMatchErrors() {
  if (!matchResult.value?.mismatches.length) return;
  const headers = '档案编号,姓名,状态\n';
  const rows = matchResult.value.mismatches
    .map((r) => `"${r.archiveNo}","${r.name}","不匹配"`)
    .join('\n');
  const blob = new Blob(['\uFEFF' + headers + rows], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'driver_assessment_personnel_mismatch.csv';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

// ===================== 驾驶员花名册下拉（姓名 / 部门自动带出） =====================
const driverSelectValue = ref<number | null>(null);

/**
 * 花名册姓名 → { 职位, 所属部门, 是否离职 } 索引。
 * 「姓名」列按最新花名册「职位」为 司机/驾驶员 为依据动态显示；
 * 「所属部门」列按最新花名册所属部门映射为「xx镇乡镇作业中心」。
 */
const rosterMap = ref<Map<string, { position: string; department: string; departed: boolean }>>(new Map());
const rosterLoaded = ref(false);

async function loadDriverOptions() {
  try {
    // 驾驶员工种名单按 scope=driver 版本比对缓存（以花名册导入为刷新节点）
    const res = await withRosterCache<{ list: unknown[] }>('dw_assessment_drivers', 'driver', () =>
      getProfileList({ is_driver: true, pageSize: 9999 } as any),
    );
    const drivers = ((res && res.list) || []) as EmployeeProfileApi.ProfileListItem[];
    driverOptions.value = drivers.map((e) => ({
      label: `${e.name}${e.dept_name ? `（${e.dept_name}）` : ''}`,
      value: e.id,
      employee: e,
    }));
    // 同步构建姓名索引（职位用花名册职位，兜底组织岗位；离职 = 状态离职或存在离职日期）
    const m = new Map<string, { position: string; department: string; departed: boolean }>();
    for (const e of drivers) {
      const nm = (e.name || '').trim();
      if (!nm) continue;
      m.set(nm, {
        position: e.roster_position || e.position_name || '',
        department: e.roster_department || e.dept_name || '',
        departed: e.status === '离职' || Boolean(e.leave_date),
      });
    }
    rosterMap.value = m;
    rosterLoaded.value = true;
  } catch {
    driverOptions.value = [];
  }
}

/** 按姓名取花名册信息 */
function rosterOf(name?: string) {
  if (!name) return undefined;
  return rosterMap.value.get(name.trim());
}

/** 是否离职驾驶员（用于搜索命中时标记「已离职」） */
function isDeparted(name?: string): boolean {
  return Boolean(rosterOf(name)?.departed);
}

/** 是否为当前在册且职位为「司机/驾驶员」的驾驶员（作为默认显示依据） */
function isCurrentDriver(name?: string): boolean {
  const e = rosterOf(name);
  if (!e) return false;
  const pos = e.position.trim();
  return (pos === '司机' || pos === '驾驶员') && !e.departed;
}

/** 所属部门显示映射：xx镇 / xx镇片区 → xx镇乡镇作业中心；部门名为「车队」等保持不变 */
function mapDept(raw?: string): string {
  if (!raw) return raw || '';
  const d = raw.trim();
  if (!d) return '';
  if (d.includes('车队')) return d;
  if (d.endsWith('片区')) return `${d.slice(0, -2)}乡镇作业中心`;
  if (/镇$/.test(d)) return `${d}乡镇作业中心`;
  return d;
}

/** 行内所属部门展示值：优先取花名册所属部门，其次取档案内部门 */
function displayDept(row: SiteApi.DriverAssessment): string {
  const e = rosterOf(row.name);
  return mapDept((e && e.department) || row.department);
}

function findDriverByName(name?: string) {
  if (!name) return undefined;
  return driverOptions.value.find((o) => o.employee.name === name);
}

/**
 * 三违评估名单补齐花名册空行：把花名册中尚无三违档案的当前在册驾驶员补为「空档案」行，
 * 使「三违评估」tab 的驾驶员数量始终等于花名册全部在册驾驶员（与驾驶证评估同样以花名册为底）。
 * 仅用于默认视图（无搜索、无统计筛选）；空档行排最后且可点「生成三违评估」建档。
 */
function mergeRosterIntoThreeViolation(rows: SiteApi.DriverAssessment[]): SiteApi.DriverAssessment[] {
  const existing = new Set(rows.map((r) => (r.name || '').trim()).filter(Boolean));
  const merged = [...rows];
  for (const o of driverOptions.value) {
    const nm = (o.employee.name || '').trim();
    if (!nm) continue;
    const pos = o.employee.roster_position || o.employee.position_name || '';
    const isDriver = /驾驶员|司机/.test(pos);
    if (!isDriver) continue; // 仅补当前职位为司机/驾驶员的花名册人员
    if (existing.has(nm)) continue; // 已有三违档案（含推算）则不重复
    existing.add(nm);
    merged.push({
      id: 0,
      archiveNo: '',
      name: nm,
      idCard: o.employee.id_card || '',
      licenseType: '',
      department: o.employee.dept_name || o.employee.roster_department || '',
      vehicleNo: '',
      assessmentDate: null,
      assessmentResult: '',
      assessmentLevel: '',
      assessmentType: '三违评估',
      controlMeasures: '',
      status: '',
      expiryDate: null,
      phone: '',
      remark: '',
      createdAt: '',
      updatedAt: '',
    } as SiteApi.DriverAssessment);
  }
  return merged;
}

function onDriverChange(val: number | null) {
  const opt = driverOptions.value.find((o) => o.value === val);
  if (opt) {
    formModel.name = opt.employee.name;
    formModel.department = opt.employee.dept_name || '';
  } else {
    formModel.name = '';
    formModel.department = '';
  }
}

// 档案编号自动生成：DA-{年份}-{4 位序号}，序号取当年最大值 + 1
function genArchiveNo(): string {
  const year = new Date().getFullYear();
  let max = 0;
  const re = new RegExp(`^DA-${year}-(\\d+)$`);
  for (const r of allRows.value) {
    if (!r.archiveNo) continue;
    const m = r.archiveNo.match(re);
    if (m && m[1]) max = Math.max(max, parseInt(m[1], 10));
  }
  return `DA-${year}-${String(max + 1).padStart(4, '0')}`;
}

// ===================== 自动同步花名册驾驶员到列表 =====================
// 把花名册中「驾驶员岗位」人员按姓名去重批量加入列表（自动生成档案编号、带出部门）。
const syncing = ref(false);
/**
 * 自动同步花名册驾驶员到列表（P0-4：一次补齐两类档案）
 * 去重键 = 姓名 + 评估类别，确保每名驾驶员同时具备「驾驶证评估」与「三违评估」档案。
 * P0 前只建 assessmentType 缺省（驾驶证评估）一类，三违评估永远为 0 条。
 */
async function syncDrivers(silent = false) {
  syncing.value = true;
  try {
    await loadDriverOptions();
    if (driverOptions.value.length === 0) {
      if (!silent) message.warning('花名册中未找到驾驶员岗位人员');
      return;
    }
    // 以无过滤的全量列表为去重基准（避免受当前搜索条件影响漏判导致重复建）
    const res = await getDriverAssessmentList({ pageSize: 9999 } as any);
    const existing = (res.list ?? []) as SiteApi.DriverAssessment[];
    const existKeys = new Set(
      existing.map((r) => `${(r.name || '').trim()}|${r.assessmentType || '驾驶证评估'}`),
    );
    // 待补建的（驾驶员 × 缺失类别）组合
    const toAdd: { name: string; dept: string; type: '驾驶证评估' | '三违评估' }[] = [];
    for (const o of driverOptions.value) {
      const nm = (o.employee.name || '').trim();
      if (!nm) continue;
      for (const type of ['驾驶证评估', '三违评估'] as const) {
        if (!existKeys.has(`${nm}|${type}`)) {
          toAdd.push({ name: nm, dept: o.employee.dept_name || '', type });
        }
      }
    }
    if (toAdd.length === 0) {
      // 已齐全 → 仅统一重新编号（确保 DA/SW 前缀与同人同号）
      await renumberDriverAssessments();
      if (!silent) message.success('花名册驾驶员的两类评估档案均已齐全，已按规则重新编号');
      await onRefresh();
      return;
    }
    for (const it of toAdd) {
      await createDriverAssessment({
        archiveNo: '',
        name: it.name,
        department: it.dept,
        assessmentType: it.type,
        assessmentResult: '',
        assessmentLevel: '',
        remark: '',
      } as any);
    }
    // 补齐后统一按在册驾驶员姓名排序重新编号（驾驶证 DA / 三违 SW 同人同号）
    await renumberDriverAssessments();
    message.success(`已补齐 ${toAdd.length} 条评估档案，并统一重新编号（驾驶证评估 / 三违评估）`);
    await onRefresh();
  } catch {
    /* 拦截器已提示 */
  } finally {
    syncing.value = false;
  }
}

// ===================== 新增 / 编辑 / 查看 =====================
const formOpen = ref(false);
const formMode = ref<'create' | 'edit' | 'view'>('create');
const formLoading = ref(false);
const editingId = ref<number | null>(null);
const formModel = reactive<Partial<SiteApi.DriverAssessment>>({
  archiveNo: '',
  name: '',
  idCard: '',
  licenseType: '',
  department: '',
  vehicleNo: '',
  assessmentDate: '',
  assessmentResult: '',
  assessmentLevel: '',
  assessmentType: '驾驶证评估',
  controlMeasures: '',
  status: '未完成',
  expiryDate: '',
  phone: '',
  remark: '',
});

function resetForm() {
  Object.assign(formModel, {
    archiveNo: '',
    name: '',
    idCard: '',
    licenseType: '',
    department: '',
    vehicleNo: '',
    assessmentDate: '',
    assessmentResult: '',
    assessmentLevel: '',
    assessmentType: '驾驶证评估',
    controlMeasures: '',
    status: '未完成',
    expiryDate: '',
    phone: '',
    remark: '',
  });
}
function openCreate() {
  resetForm();
  formMode.value = 'create';
  editingId.value = null;
  formModel.archiveNo = genArchiveNo();
  driverSelectValue.value = null;
  formOpen.value = true;
}
function openEdit(row: SiteApi.DriverAssessment) {
  resetForm();
  formMode.value = 'edit';
  editingId.value = row.id;
  Object.assign(formModel, {
    archiveNo: row.archiveNo ?? '',
    name: row.name ?? '',
    idCard: row.idCard ?? '',
    licenseType: row.licenseType ?? '',
    department: row.department ?? '',
    vehicleNo: row.vehicleNo ?? '',
    assessmentDate: row.assessmentDate ?? '',
    assessmentResult: row.assessmentResult ?? '',
    assessmentLevel: row.assessmentLevel ?? '',
    assessmentType: row.assessmentType ?? '驾驶证评估',
    controlMeasures: row.controlMeasures ?? '',
    status: row.status ?? '未完成',
    expiryDate: row.expiryDate ?? '',
    phone: row.phone ?? '',
    remark: row.remark ?? '',
  });
  driverSelectValue.value = findDriverByName(row.name)?.value ?? null;
  formOpen.value = true;
}
function openView(row: SiteApi.DriverAssessment) {
  currentRecord.value = row;
  detailDrawerVisible.value = true;
}

async function onSubmit() {
  if (!formModel.name) {
    message.warning('请输入姓名');
    return;
  }
  formLoading.value = true;
  try {
    const payload: Partial<SiteApi.DriverAssessment> = { ...formModel };
    if (formMode.value === 'edit' && editingId.value != null) {
      await updateDriverAssessment(editingId.value, payload);
      message.success('更新成功');
    } else {
      await createDriverAssessment(payload);
      message.success('创建成功');
    }
    formOpen.value = false;
    onRefresh();
  } catch {
    /* 拦截器已提示 */
  } finally {
    formLoading.value = false;
  }
}

// ===================== 删除 =====================
async function onDelete(row: SiteApi.DriverAssessment) {
  try {
    await deleteDriverAssessment(row.id);
    message.success('删除成功');
    onRefresh();
  } catch {
    /* 拦截器已提示 */
  }
}

// ===================== 详情抽屉 =====================
const detailDrawerVisible = ref(false);
const currentRecord = ref<SiteApi.DriverAssessment | null>(null);

// ===================== 日期辅助 =====================
function diffDays(value: string): number {
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return NaN;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

// ===================== 风险等级自动判定（依据《附件1 表1》） =====================
type CalcRow = {
  key: string;
  name: string;
  archiveId: number | null;
  hasArchive: boolean;
  prevLevel: string;
  level: RiskLevel;
  changed: boolean;
  windowScore: number;
  maxSingle: number;
  windowCount: number;
  totalCount: number;
  hits: string[];
  basis: string;
  content: string;
  measures: string;
};

const calcVisible = ref(false);
const calcLoading = ref(false);
const calcSaving = ref(false);
const calcSource = ref('');
/** 是否为「仅按驾驶记分」判定（「按违章记录判定」按钮 → true；「导入违章Excel判定」→ false） */
const calcScoreOnly = ref(false);
const calcRows = ref<CalcRow[]>([]);
const calcCheckedKeys = ref<string[]>([]);
const calcUnmatched = ref<string[]>([]);

function todayStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * 档案匹配：按「姓名 + 评估类别」定位档案。
 * P0 前这里写死只认「驾驶证评估」，三违评估因此收不到任何判定结果；
 * 现放开为类别参数化，驾驶证评估与三违评估各查各的档案，互不串档。
 */
function findArchiveByName(
  name: string,
  type: '驾驶证评估' | '三违评估' = '驾驶证评估',
): SiteApi.DriverAssessment | undefined {
  return allRows.value.find(
    (r) => (r.name || '').trim() === name && (r.assessmentType || '驾驶证评估') === type,
  );
}

/** 违章明细 → 按姓名聚合 → 判定预览行
 *  scoreOnly=true（「按违章记录判定」）：仅按驾驶记分定级，不带命中行为；
 *  scoreOnly=false（「导入违章Excel判定」）：按表1完整口径（记分 + 行为命中）定级。 */
function buildCalcRows(
  items: (ViolationInput & { name: string })[],
  scoreOnly = false,
): CalcRow[] {
  const byName = new Map<string, ViolationInput[]>();
  for (const it of items) {
    const nm = (it.name || '').trim();
    if (!nm) continue;
    if (!byName.has(nm)) byName.set(nm, []);
    byName.get(nm)!.push(it);
  }
  const rows: CalcRow[] = [];
  const unmatched: string[] = [];
  for (const [name, list] of byName) {
    const v = scoreOnly ? calcDriverRiskByScore(list) : calcDriverRisk(list);
    const arc = findArchiveByName(name);
    if (!arc) unmatched.push(name);
    rows.push({
      key: name,
      name,
      archiveId: arc?.id ?? null,
      hasArchive: !!arc,
      prevLevel: arc?.assessmentLevel || '',
      level: v.level,
      changed: (arc?.assessmentLevel || '') !== v.level,
      windowScore: v.windowScore,
      maxSingle: v.maxSingle,
      windowCount: v.windowCount,
      totalCount: v.effectiveCount,
      // 命中行为仅表1完整口径展示；仅按记分判定时置空（界面不展示「命中行为」列）
      hits: scoreOnly ? [] : [...new Set([...v.severeHits, ...v.majorHits, ...v.lowExcludeHits])],
      basis: v.basis,
      content: riskContent(v.level),
      measures: riskMeasures(v.level),
    });
  }
  const order: Record<RiskLevel, number> = { 重大: 0, 较大: 1, 一般: 2, 较低: 3 };
  rows.sort((a, b) => order[a.level] - order[b.level] || b.windowScore - a.windowScore);
  calcUnmatched.value = unmatched;
  return rows;
}

/** 打开预览（默认只勾选「已建档且等级有变化」的行，避免误覆盖人工判定） */
function openCalcPreview(rows: CalcRow[], source: string, scoreOnly = false) {
  calcRows.value = rows;
  calcSource.value = source;
  calcScoreOnly.value = scoreOnly;
  calcCheckedKeys.value = rows.filter((r) => r.hasArchive && r.changed).map((r) => r.key);
  calcVisible.value = true;
}

/** 通道一：按库内违章记录判定（按当前 Tab 取对应数据源：驾驶证评估 → 驾驶证扣分记录；三违评估 → 三违扣分记录） */
async function onJudgeFromDb() {
  calcLoading.value = true;
  try {
    const isThree = activeTab.value === '三违评估';
    // 三违评估不涉及「驾驶证扣分记录」，仅以「三违扣分记录」为数据源
    const res = isThree
      ? await getDriverThreeViolationList({ pageSize: 9999 } as any)
      : await getDriverViolationList({ pageSize: 9999 } as any);
    const items = ((res.list || []) as SiteApi.DriverViolation[]).map((r) => ({
      name: r.name || '',
      date: r.violationTime,
      desc: r.violationDesc,
      points: r.demeritPoints,
      fine: r.fineAmount,
      note: r.remark,
    }));
    if (!items.length) {
      message.warning(
        isThree
          ? '库内暂无三违扣分记录。请先在「驾驶员违章记录 · 三违扣分记录」页导入。'
          : '库内暂无驾驶员违章记录。请先在「驾驶员违章记录」页导入，或改用「导入违章Excel判定」直接上传汇总表。',
      );
      return;
    }
    openCalcPreview(buildCalcRows(items, true), `库内${isThree ? '三违扣分' : '违章'}记录（${items.length} 条）`, true);
  } catch {
    /* 拦截器已提示 */
  } finally {
    calcLoading.value = false;
  }
}

/** 通道二：上传「驾驶员五年违章记录汇总.xlsx」前端解析后判定 */
const excelInputRef = ref<HTMLInputElement | null>(null);
function onPickExcel() {
  excelInputRef.value?.click();
}
async function onExcelPicked(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  calcLoading.value = true;
  try {
    const { rows } = await readViolationExcel(file);
    if (!rows.length) {
      message.warning(
        '未解析到有效违章记录。请确认表头含「司机姓名 / 违章日期 / 违章事由 / 计分」。',
      );
      return;
    }
    openCalcPreview(buildCalcRows(rows), `${file.name}（${rows.length} 条）`);
  } catch (err: any) {
    message.error(`Excel 解析失败：${err?.message || err}`);
  } finally {
    calcLoading.value = false;
  }
}

/** 把勾选的判定结果写入档案（等级 + 表1违规内容 + 管控措施） */
async function applyJudgeResult() {
  const targets = calcRows.value.filter(
    (r) => calcCheckedKeys.value.includes(r.key) && r.hasArchive && r.archiveId != null,
  );
  if (!targets.length) {
    message.warning(
      '勾选的记录中没有可写入的档案。请先点「同步花名册驾驶员」为这些驾驶员建档，再执行判定。',
    );
    return;
  }
  calcSaving.value = true;
  let ok = 0;
  let failed = 0;
  for (const r of targets) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await updateDriverAssessment(r.archiveId as number, {
        assessmentLevel: r.level,
        assessmentResult: `${r.content}\n${r.basis}`,
        controlMeasures: r.measures,
        assessmentType: '驾驶证评估',
        assessmentDate: todayStr(),
        status: '完成',
      } as any);
      ok += 1;
    } catch {
      failed += 1;
    }
  }
  calcSaving.value = false;
  calcVisible.value = false;
  if (failed) message.warning(`判定完成：写入 ${ok} 条，失败 ${failed} 条`);
  else if (calcScoreOnly.value) message.success(`已按驾驶记分判定并写入 ${ok} 条档案`);
  else message.success(`已按表1判定并写入 ${ok} 条档案`);
  await onRefresh();
}

// ===================== 三违评估：生成与写入（P0-3） =====================
type SwRow = SwCalcItem & {
  key: string;
  archiveId: number | null;
  hasArchive: boolean;
  prevLevel: string;
  changed: boolean;
};

const swVisible = ref(false);
const swLoading = ref(false);
const swSaving = ref(false);
const swSource = ref('');
const swRows = ref<SwRow[]>([]);
const swCheckedKeys = ref<string[]>([]);

/** 违章明细 → 三违评估预览行（以花名册全部驾驶员的融合名单为准，关联已有三违档案，标出等级变化） */
function buildSwRows(): SwRow[] {
  return swCalcMerged().map((it) => {
    const arc = findArchiveByName(it.name, '三违评估');
    const prev = arc?.assessmentLevel || '';
    return {
      ...it,
      key: it.name,
      archiveId: arc?.id ?? null,
      hasArchive: !!arc,
      prevLevel: prev,
      changed: prev !== it.level,
    };
  });
}

/** 打开三违评估预览：默认勾选「等级有变化」的行，避免无谓覆盖人工判定 */
function openSwPreview(rows: SwRow[], source: string) {
  swRows.value = rows;
  swSource.value = source;
  swCheckedKeys.value = rows.filter((r) => r.changed).map((r) => r.key);
  swVisible.value = true;
}

/** 「生成三违评估」按钮：读「三违扣分记录」独立表 → 按自然年度累计扣分定级 → 预览 */
async function onGenSwAssessment() {
  swLoading.value = true;
  try {
    // 三违评估名单以花名册全部驾驶员为准（融合）：
    // 先确保花名册驾驶员已装载，再读取三违扣分记录（driver_three_violation）作为扣分来源。
    if (driverOptions.value.length === 0) await loadDriverOptions();
    const res = await getDriverThreeViolationList({ pageSize: 9999 } as any);
    violationList.value = (res.list || []) as SiteApi.DriverViolation[];
    const rows = buildSwRows();
    if (!rows.length) {
      message.warning('花名册中未找到驾驶员，无法生成三违评估');
      return;
    }
    const withRecord = violationList.value.length;
    openSwPreview(
      rows,
      `按花名册 ${rows.length} 名驾驶员生成（其中 ${withRecord} 条三违扣分记录），无扣分记录者按 0 分 /「较低」档`,
    );
  } catch {
    /* 拦截器已提示 */
  } finally {
    swLoading.value = false;
  }
}

/** 写入三违评估：已有档案则更新等级，无档案则自动建档（部门从驾驶员花名册带出） */
async function applySwResult() {
  const targets = swRows.value.filter((r) => swCheckedKeys.value.includes(r.key));
  if (!targets.length) {
    message.warning('请至少勾选一条记录');
    return;
  }
  swSaving.value = true;
  let created = 0;
  let updated = 0;
  let failed = 0;
  try {
    // 需要新建档案时先确保花名册已加载，才能带出部门
    if (targets.some((r) => !r.hasArchive) && driverOptions.value.length === 0) {
      await loadDriverOptions();
    }
    const year = new Date().getFullYear();
    const re = new RegExp(`^SW-${year}-(\\d+)$`);
    let max = 0;
    for (const r of allRows.value) {
      const m = r.archiveNo?.match(re);
      if (m?.[1]) max = Math.max(max, Number.parseInt(m[1], 10));
    }
    for (const r of targets) {
      const threshold = `(较低≤${SW_LEVEL_THRESHOLDS.一般 - 1} / 一般${SW_LEVEL_THRESHOLDS.一般}~${
        SW_LEVEL_THRESHOLDS.较大 - 1
      } / 较大${SW_LEVEL_THRESHOLDS.较大}~${SW_LEVEL_THRESHOLDS.重大} / 重大>${SW_LEVEL_THRESHOLDS.重大})`;
      const payload: Record<string, unknown> = {
        assessmentLevel: r.level,
        assessmentResult:
          `${riskContent(r.level)}\n【判定依据】按 ${year} 年度累计扣分 ${r.yearPoints} 分，` +
          `按三违评估阈值${threshold}定为「${r.level}」。\n` +
          `【数据】违章共 ${r.totalCount} 条，主要三违类型：${r.topType}。`,
        controlMeasures: riskMeasures(r.level),
        assessmentType: '三违评估',
        assessmentDate: todayStr(),
        status: '完成',
      };
      try {
        if (r.hasArchive && r.archiveId != null) {
          // eslint-disable-next-line no-await-in-loop
          await updateDriverAssessment(r.archiveId, payload as any);
          updated += 1;
        } else {
          max += 1;
          // eslint-disable-next-line no-await-in-loop
          await createDriverAssessment({
            ...payload,
            archiveNo: `SW-${year}-${String(max).padStart(4, '0')}`,
            name: r.name,
            department: findDriverByName(r.name)?.employee.dept_name || '',
          } as any);
          created += 1;
        }
      } catch {
        failed += 1;
      }
    }
  } finally {
    swSaving.value = false;
  }
  swVisible.value = false;
  if (failed) {
    message.warning(`三违评估完成：新建 ${created} 条、更新 ${updated} 条、失败 ${failed} 条`);
  } else {
    message.success(`三违评估完成：新建 ${created} 条、更新 ${updated} 条`);
  }
  await onRefresh();
  if (activeTab.value === '三违评估') {
    await nextTick();
    renderSwLevel(swLevelChartOption.value);
    renderSwType(swTypeChartOption.value);
    renderSwAvg(swAvgChartOption.value);
  }
}

/** 三违评估预览：等级分布概览 */
const swDist = computed(() => {
  const d: Record<string, number> = {};
  for (const r of swRows.value) d[r.level] = (d[r.level] || 0) + 1;
  return (['重大', '较大', '一般', '较低'] as RiskLevel[])
    .filter((k) => d[k])
    .map((k) => ({ level: k, count: d[k] }));
});

const swColumns: VxeTableGridColumns = [
  { title: '勾选', field: '__checkbox', width: 46, align: 'center', slots: { default: 'swCheck', header: 'swCheckHeader' } },
  { title: '姓名', field: 'name', width: 100, align: 'center' },
  {
    title: `${new Date().getFullYear()}年累计`,
    field: 'yearPoints',
    width: 100,
    align: 'center',
    slots: { default: 'swYearPoints' },
  },
  {
    title: '违章条数',
    field: 'totalCount',
    width: 90,
    align: 'center',
    slots: { default: 'swTotalCount' },
  },
  {
    title: '主要三违类型',
    field: 'topType',
    minWidth: 150,
    align: 'left',
    slots: { default: 'swTopType' },
  },
  {
    title: '判定等级',
    field: 'level',
    width: 100,
    align: 'center',
    slots: { default: 'swLevel' },
  },
  {
    title: '原等级',
    field: 'prevLevel',
    width: 90,
    align: 'center',
    slots: { default: 'swPrevLevel' },
  },
  {
    title: '状态',
    field: 'status',
    width: 110,
    align: 'center',
    slots: { default: 'swStatus' },
  },
];

/** 判定结果等级分布（预览弹窗顶部概览） */
const calcDist = computed(() => {
  const d: Record<string, number> = {};
  for (const r of calcRows.value) d[r.level] = (d[r.level] || 0) + 1;
  return ['重大', '较大', '一般', '较低']
    .filter((k) => d[k])
    .map((k) => ({ level: k as RiskLevel, count: d[k] }));
});

/** 预览表列定义：仅按记分判定时去掉「命中行为」列 */
const calcColumns = computed<VxeTableGridColumns>(() => {
  const cols: VxeTableGridColumns = [
    { title: '勾选', field: '__checkbox', width: 46, align: 'center', slots: { default: 'calcCheck', header: 'calcCheckHeader' } },
    { title: '姓名', field: 'name', width: 100, align: 'center' },
    {
      title: '近12月记分',
      field: 'windowScore',
      width: 100,
      align: 'center',
      slots: { default: 'calcWindowScore' },
    },
    {
      title: '单次最高',
      field: 'maxSingle',
      width: 90,
      align: 'center',
      slots: { default: 'calcMaxSingle' },
    },
    {
      title: '近12月/总条数',
      field: 'count',
      width: 120,
      align: 'center',
      slots: { default: 'calcCount' },
    },
  ];
  if (!calcScoreOnly.value) {
    cols.push({
      title: '命中行为',
      field: 'hits',
      minWidth: 160,
      align: 'left',
      slots: { default: 'calcHits' },
    });
  }
  cols.push(
    {
      title: '判定等级',
      field: 'level',
      width: 100,
      align: 'center',
      slots: { default: 'calcLevel' },
    },
    {
      title: '原等级',
      field: 'prevLevel',
      width: 90,
      align: 'center',
      slots: { default: 'calcPrevLevel' },
    },
    {
      title: '状态',
      field: 'status',
      width: 100,
      align: 'center',
      slots: { default: 'calcStatus' },
    },
    {
      title: '判定依据',
      field: 'basis',
      width: 70,
      align: 'center',
      slots: { default: 'calcBasis' },
    },
  );
  return cols;
});

// —— 预览表勾选（模板 NCheckbox 手动维护 calcCheckedKeys / swCheckedKeys） ——
function toggleSwChecked(key: string, checked: boolean) {
  if (checked) {
    if (!swCheckedKeys.value.includes(key)) swCheckedKeys.value = [...swCheckedKeys.value, key];
  } else {
    swCheckedKeys.value = swCheckedKeys.value.filter((k) => k !== key);
  }
}
function swAllChecked() {
  return swRows.value.length > 0 && swRows.value.every((r) => swCheckedKeys.value.includes(r.key));
}
function swSomeChecked() {
  return swRows.value.some((r) => swCheckedKeys.value.includes(r.key));
}
function toggleSwAll(checked: boolean) {
  swCheckedKeys.value = checked ? swRows.value.map((r) => r.key) : [];
}
function toggleCalcChecked(key: string, checked: boolean) {
  if (checked) {
    if (!calcCheckedKeys.value.includes(key)) calcCheckedKeys.value = [...calcCheckedKeys.value, key];
  } else {
    calcCheckedKeys.value = calcCheckedKeys.value.filter((k) => k !== key);
  }
}
function calcAllChecked() {
  const selectable = calcRows.value.filter((r) => r.hasArchive);
  return selectable.length > 0 && selectable.every((r) => calcCheckedKeys.value.includes(r.key));
}
function calcSomeChecked() {
  const selectable = calcRows.value.filter((r) => r.hasArchive);
  return selectable.some((r) => calcCheckedKeys.value.includes(r.key));
}
function toggleCalcAll(checked: boolean) {
  calcCheckedKeys.value = checked
    ? calcRows.value.filter((r) => r.hasArchive).map((r) => r.key)
    : [];
}

// ===================== 判定依据详情 =====================
const basisVisible = ref(false);
const basisRow = ref<CalcRow | null>(null);
function openBasis(row: CalcRow) {
  basisRow.value = row;
  basisVisible.value = true;
}

// ===================== 表格列 =====================
const columns = ref<VxeTableGridColumns>([
  { type: 'checkbox', width: 50, align: 'center', fixed: 'left' },
  { type: 'seq', title: '序号', width: 70, align: 'center' },
  { title: '档案编号', field: 'archiveNo', minWidth: 140, align: 'center', showOverflow: 'tooltip', sortable: true },
  { title: '姓名', field: 'name', minWidth: 110, align: 'center', slots: { default: 'name' }, sortable: true },
  { title: '所属部门', field: 'department', minWidth: 140, align: 'center', showOverflow: 'tooltip', slots: { default: 'department' }, sortable: true },
  { title: '评估类别', field: 'assessmentType', minWidth: 110, align: 'center' },
  {
    title: '累计扣分',
    field: 'cumulativeThreeViolationPoints',
    minWidth: 90,
    align: 'center',
    slots: { default: 'cumulativeThreeViolationPoints' },
    sortable: true,
  },
  {
    // 风险等级：单元格下拉（表1四级），选完自动带出「评估结果」(违规内容) + 「管控措施」并落库
    title: '风险等级',
    field: 'assessmentLevel',
    minWidth: 110,
    align: 'center',
    editRender: {},
    slots: { default: 'riskLevel', edit: 'riskLevel-edit' },
    sortable: true,
  },
  { title: '评估结果', field: 'assessmentResult', minWidth: 200, align: 'left', showOverflow: 'tooltip' },
  { title: '管控措施', field: 'controlMeasures', minWidth: 240, align: 'left', showOverflow: 'tooltip' },
  {
    title: '状态',
    field: 'status',
    width: 100,
    align: 'center',
    slots: { default: 'status' },
    sortable: true,
  },
  {
    title: '操作',
    field: 'action',
    width: 180,
    align: 'center',
    fixed: 'right',
    slots: { default: 'action' },
  },
]);

/**
 * 列表单元格编辑关闭（仅处理「风险等级」下拉）：
 * 选完按表1自动带出「评估结果」(违规内容) 与「管控措施」，并立即落库。
 */
async function onCellEditClosed(payload: { row: any; column?: any }) {
  const row = payload?.row;
  const field = payload?.column?.field || payload?.column?.property;
  if (!row || row.id == null) return;
  if (field !== 'assessmentLevel') return;
  const level = (row.assessmentLevel || '') as RiskLevel | '';
  if (!level) {
    // 清空下拉：不写入，刷新还原
    await onRefresh();
    return;
  }
  const result = riskContent(level);
  const measures = riskMeasures(level);
  row.assessmentResult = result;
  row.controlMeasures = measures;
  try {
    await updateDriverAssessment(row.id, {
      assessmentLevel: level,
      assessmentResult: result,
      controlMeasures: measures,
      status: '完成',
    } as any);
    message.success(`「${row.name || '本条'}」风险等级已设为 ${level}，管控措施已按表1自动带出`);
    await onRefresh();
  } catch {
    /* 拦截器已提示 */
  }
}

onMounted(async () => {
  // 先装载花名册（含姓名索引），再刷新列表，保证默认按当前在册驾驶员显示
  await loadDriverOptions();
  await onRefresh();
  await nextTick();
  renderLicenseLevel(licenseLevelChartOption.value);
  // 不再在进入页面时自动同步花名册；同步操作由用户手动点击「同步花名册驾驶员」触发，
  // 避免每次进入页面重复拉接口 + 重复插入同名记录。
});
</script>

<template>
  <HsePageLayout
    :description="$t('page.hse.siteDriverAssessmentDesc')"
    :title="$t('page.hse.siteDriverAssessment')"
  >
    <template #extra>
      <NSpace>
        <HseActionBar
          :actions="{}"
          @refresh="onRefresh"
          @download-template="onImportTemplate"
          @import="() => (importOpen = true)"
          @create="openCreate"
        />
        <NButton :loading="syncing" @click="() => syncDrivers()">同步花名册驾驶员</NButton>
        <NButton :loading="swLoading" type="primary" @click="onGenSwAssessment">
          生成三违评估
        </NButton>
        <NButton :loading="calcLoading" secondary type="primary" @click="onJudgeFromDb">
          按违章记录判定
        </NButton>
        <NButton :loading="calcLoading" secondary @click="onPickExcel">导入违章Excel判定</NButton>
        <input
          ref="excelInputRef"
          type="file"
          accept=".xlsx,.xls"
          style="display: none"
          @change="onExcelPicked"
        />
      </NSpace>
    </template>

    <!-- 统计卡 -->
    <div class="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
      <NCard
        v-for="s in statItems"
        :key="s.key"
        :bordered="false"
        :class="[
          activeStatKey === s.key || (s.key === '三违评估数' && activeTab === '三违评估')
            ? 'ring-2 ring-blue-400'
            : '',
        ]"
        class="cursor-pointer"
        @click="onStatClick(s.key)"
      >
        <NStatistic :label="s.label">
          <template #prefix>
            <IconifyIcon :icon="s.icon" class="mr-1 inline-block align-text-bottom" />
          </template>
          <NText :type="s.type" strong>{{ s.value }}</NText>
        </NStatistic>
      </NCard>
    </div>

    <!-- 搜索 -->
    <HseSearchPanel @query="onSearch" @reset="onReset">
      <NGi>
        <NInput
          v-model:value="searchForm.keyword"
          placeholder="姓名 / 档案编号"
          clearable
          @keyup.enter="onSearch"
        />
      </NGi>
      <NGi>
        <NInput v-model:value="searchForm.department" placeholder="所属部门" clearable @keyup.enter="onSearch" />
      </NGi>
      <NGi>
        <NInput v-model:value="searchForm.archiveYear" placeholder="评估年份（如 2026）" clearable @keyup.enter="onSearch" />
      </NGi>
    </HseSearchPanel>

    <!-- 分类 Tab：图表 + 表格 -->
    <NTabs v-model:value="activeTab" type="line" animated display-directive="show" @update:value="onTabChange">
      <NTabPane name="驾驶证评估" tab="驾驶证评估">
        <!-- 驾驶证评估图表区 -->
        <NSpin :show="loading">
          <div class="mb-4 grid grid-cols-1 gap-4">
            <NCard title="风险等级分布" :bordered="false">
              <EchartsUI ref="licenseLevelChartRef" height="240px" width="100%" />
            </NCard>
          </div>
        </NSpin>
      </NTabPane>
      <NTabPane name="三违评估" tab="三违评估">
        <!-- 三违评估图表区 -->
        <NSpin :show="violationLoading">
          <div class="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <NCard title="风险等级分布" :bordered="false">
              <EchartsUI ref="swLevelChartRef" height="240px" width="100%" />
            </NCard>
            <NCard title="三违类型 TopN" :bordered="false">
              <EchartsUI ref="swTypeChartRef" height="240px" width="100%" />
            </NCard>
            <NCard title="扣分合计排行" :bordered="false">
              <EchartsUI ref="swAvgChartRef" height="240px" width="100%" />
            </NCard>
          </div>
        </NSpin>
      </NTabPane>
    </NTabs>

    <!-- 表格 -->
    <HseDataGrid
      :columns="columns"
      :data="data"
      :loading="loading"
      :pager="false"
      :total="total"
      :editable="true"
      edit-mode="cell"
      @edit-closed="onCellEditClosed"
      @sort-change="onSortChange"
    >
      <template #riskLevel="{ row }">
        <HseStatusTag v-if="row.assessmentLevel" :type="riskTagType(row.assessmentLevel)" size="small">
          {{ row.assessmentLevel }}
        </HseStatusTag>
        <span v-else>-</span>
      </template>
      <template #name="{ row }">
        <span>{{ row.name || '-' }}</span>
        <NTag v-if="isDeparted(row.name)" size="small" type="warning" round class="ml-1">已离职</NTag>
      </template>
      <template #department="{ row }">{{ displayDept(row) }}</template>
      <template #cumulativeThreeViolationPoints="{ row }">
        <!-- 累计扣分：对齐「三违管理考核」数字配色（0=绿色标签；>0=橙色可点击弹明细），点击弹逐条扣分明细 -->
        <NTag
          v-if="pointsOf(row) > 0"
          size="small"
          type="warning"
          :bordered="false"
          class="deduc-click"
          @click="openDeductModal(row as any)"
        >
          {{ pointsOf(row) }} 分
        </NTag>
        <NTag v-else size="small" type="success" :bordered="false">{{ pointsOf(row) }} 分</NTag>
      </template>
      <template #riskLevel-edit="{ row }">
        <NSelect
          v-model:value="row.assessmentLevel"
          :options="RISK_LEVEL_OPTIONS"
          size="small"
          placeholder="选择风险等级"
        />
      </template>
      <template #action="{ row }">
        <NSpace justify="center" :size="4">
          <NButton size="tiny" type="primary" quaternary @click="openView(row)">查看</NButton>
          <NButton size="tiny" type="primary" quaternary @click="openEdit(row)">编辑</NButton>
          <NPopconfirm @positive-click="onDelete(row)">
            <template #trigger>
              <NButton size="tiny" type="error" quaternary>删除</NButton>
            </template>
            确定删除该评估档案吗？
          </NPopconfirm>
        </NSpace>
      </template>
      <template #status="{ row }">
        <HseStatusTag :type="row.status === '完成' ? 'success' : 'warning'" size="small">
          {{ row.status || '未完成' }}
        </HseStatusTag>
      </template>
    </HseDataGrid>

    <!-- 详情抽屉 -->
    <NDrawer v-model:show="detailDrawerVisible" :width="560">
      <NDrawerContent v-if="currentRecord" :title="`交通安全档案详情 #${currentRecord.id}`">
        <NDescriptions :column="1" bordered label-placement="left">
          <NDescriptionsItem label="档案编号">{{ currentRecord.archiveNo || '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="姓名">{{ currentRecord.name || '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="所属部门">{{ currentRecord.department || '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="评估类别">{{ currentRecord.assessmentType || '驾驶证评估' }}</NDescriptionsItem>
          <NDescriptionsItem label="风险等级">{{ currentRecord.assessmentLevel || '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="评估结果">{{ currentRecord.assessmentResult || '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="管控措施">{{ currentRecord.controlMeasures || '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="状态">
            <HseStatusTag :type="currentRecord.status === '完成' ? 'success' : 'warning'" size="small">
              {{ currentRecord.status || '未完成' }}
            </HseStatusTag>
          </NDescriptionsItem>
          <NDescriptionsItem label="备注">{{ currentRecord.remark || '-' }}</NDescriptionsItem>
        </NDescriptions>
      </NDrawerContent>
      <template #footer>
        <NSpace justify="end">
          <NButton v-if="currentRecord" type="primary" size="small" @click="openEdit(currentRecord)">
            弹窗编辑
          </NButton>
        </NSpace>
      </template>
    </NDrawer>

    <!-- 新增 / 编辑 弹窗 -->
    <NModal
      v-model:show="formOpen"
      :title="formMode === 'create' ? '新增评估档案' : '编辑评估档案'"
      preset="card"
      style="width: 680px; max-width: 92vw"
      :mask-closable="false"
    >
      <NForm label-placement="top">
        <div class="grid grid-cols-2 gap-x-4">
          <NFormItem label="档案编号">
            <NInput v-model:value="formModel.archiveNo" placeholder="自动生成" readonly disabled />
          </NFormItem>
          <NFormItem label="姓名" required>
            <NSelect
              v-model:value="driverSelectValue"
              :options="driverOptions"
              filterable
              clearable
              placeholder="从驾驶员花名册选择"
              @update:value="onDriverChange"
            />
          </NFormItem>
          <NFormItem label="所属部门">
            <NInput v-model:value="formModel.department" placeholder="随花名册自动生成" readonly disabled />
          </NFormItem>
          <NFormItem label="评估类别">
            <NSelect
              v-model:value="formModel.assessmentType"
              :options="ASSESSMENT_TYPES.map((v) => ({ label: v, value: v }))"
              placeholder="选择评估类别"
            />
          </NFormItem>
          <NFormItem label="风险等级">
            <NSelect
              v-model:value="formModel.assessmentLevel"
              clearable
              :options="RISK_LEVEL_OPTIONS"
              placeholder="选择风险等级（自动带出结果/措施）"
              @update:value="onRiskLevelChange"
            />
          </NFormItem>
          <NFormItem label="状态">
            <NSelect
              v-model:value="formModel.status"
              :options="STATUS_OPTIONS"
              placeholder="选择状态"
            />
          </NFormItem>
        </div>
        <NFormItem label="评估结果">
          <NInput
            v-model:value="formModel.assessmentResult"
            type="textarea"
            :rows="3"
            placeholder="选择风险等级后自动带出，可修改"
          />
        </NFormItem>
        <NFormItem label="管控措施">
          <NInput
            v-model:value="formModel.controlMeasures"
            type="textarea"
            :rows="4"
            placeholder="选择风险等级后自动带出，可修改"
          />
        </NFormItem>
        <NFormItem label="备注">
          <NInput v-model:value="formModel.remark" type="textarea" :rows="2" placeholder="选填" />
        </NFormItem>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="formOpen = false">关闭</NButton>
          <NButton type="primary" :loading="formLoading" @click="onSubmit">保存</NButton>
        </NSpace>
      </template>
    </NModal>

    <!-- 导入后人员匹配校验弹窗 -->
    <NModal
      v-model:show="matchVisible"
      title="导入人员匹配校验"
      preset="card"
      style="width: 760px; max-width: 94vw"
      :mask-closable="false"
    >
      <NSpin :show="matchLoading">
        <template v-if="matchResult">
          <NAlert
            :type="matchResult.mismatches.length === 0 ? 'success' : 'warning'"
            class="mb-3"
          >
            匹配 {{ matchResult.matched }} 条，不匹配 {{ matchResult.mismatches.length }} 条（共 {{ matchResult.total }} 条已填姓名）。
          </NAlert>
          <HseDataGrid
            v-if="matchResult.mismatches.length > 0"
            :columns="[
              { title: '档案编号', field: 'archiveNo', minWidth: 140, align: 'left', showOverflow: 'tooltip' },
              { title: '姓名', field: 'name', width: 120, align: 'center' },
              { title: '状态', field: 'status', width: 100, align: 'center', slots: { default: 'matchStatus' } },
            ]"
            :data="matchResult.mismatches"
            :pager="false"
          >
            <template #matchStatus>
              <HseStatusTag type="warning" size="small">不匹配</HseStatusTag>
            </template>
          </HseDataGrid>
          <NAlert v-else type="success" title="全部匹配">
            所有已填姓名的评估档案均能在花名册中找到。
          </NAlert>
        </template>
      </NSpin>
      <template #footer>
        <NSpace justify="end">
          <NButton
            v-if="matchResult?.mismatches.length"
            secondary
            @click="handleDownloadMatchErrors"
          >
            下载不匹配记录
          </NButton>
          <NButton type="primary" @click="matchVisible = false">关闭</NButton>
        </NSpace>
      </template>
    </NModal>

    <!-- 风险等级自动判定 · 结果预览 -->
    <NModal
      v-model:show="calcVisible"
      preset="card"
      title="风险等级自动判定（依据附表1 表1）"
      style="width: 1180px; max-width: 96vw"
      :mask-closable="false"
    >
      <NSpin :show="calcLoading">
        <NAlert type="info" :bordered="false" class="mb-3">
          数据来源：{{ calcSource }}。已按姓名聚合判定 {{ calcRows.length }} 名驾驶员；默认仅勾选「已建档且等级有变化」的记录，可自行调整。
        </NAlert>
        <NSpace v-if="calcDist.length" class="mb-3" :size="8">
          <NTag
            v-for="d in calcDist"
            :key="d.level"
            :type="RISK_LEVEL_NTAG[d.level]"
            size="small"
            round
          >
            {{ d.level }} · {{ d.count }} 人
          </NTag>
        </NSpace>
        <NAlert v-if="calcUnmatched.length" type="warning" :bordered="false" class="mb-3">
          {{ calcUnmatched.length }} 名驾驶员无对应「驾驶证评估」档案（{{ calcUnmatched.slice(0, 10).join('、')
          }}{{ calcUnmatched.length > 10 ? ' 等' : '' }}），已置灰不可勾选。请先点「同步花名册驾驶员」建档后重新判定。
        </NAlert>
        <HseDataGrid
          :columns="calcColumns"
          :data="calcRows"
          :pager="false"
          row-key="key"
          :height="460"
        >
          <template #calcCheckHeader>
            <NCheckbox
              :checked="calcAllChecked()"
              :indeterminate="calcSomeChecked() && !calcAllChecked()"
              @update:checked="toggleCalcAll"
            />
          </template>
          <template #calcCheck="{ row }">
            <NCheckbox
              :checked="calcCheckedKeys.includes(row.key)"
              :disabled="!row.hasArchive"
              @update:checked="(v: boolean) => toggleCalcChecked(row.key, v)"
            />
          </template>
          <template #calcWindowScore="{ row }">{{ row.windowScore }} 分</template>
          <template #calcMaxSingle="{ row }">{{ row.maxSingle ? `${row.maxSingle} 分` : '-' }}</template>
          <template #calcCount="{ row }">{{ row.windowCount }} / {{ row.totalCount }}</template>
          <template #calcHits="{ row }">
            <NSpace v-if="row.hits.length" :size="4" wrap>
              <NTag
                v-for="(x, i) in row.hits"
                :key="i"
                size="small"
                type="warning"
                :bordered="false"
              >{{ x }}</NTag>
            </NSpace>
            <span v-else>-</span>
          </template>
          <template #calcLevel="{ row }">
            <HseStatusTag :type="riskTagType(row.level)" size="small">{{ row.level }}</HseStatusTag>
          </template>
          <template #calcPrevLevel="{ row }">{{ row.prevLevel || '-' }}</template>
          <template #calcStatus="{ row }">
            <NTag v-if="!row.hasArchive" size="small" type="error" :bordered="false">无档案</NTag>
            <NTag v-else-if="row.changed" size="small" type="warning" :bordered="false">等级变更</NTag>
            <NTag v-else size="small" type="default" :bordered="false">无变化</NTag>
          </template>
          <template #calcBasis="{ row }">
            <NButton size="tiny" quaternary type="primary" @click="openBasis(row)">查看</NButton>
          </template>
        </HseDataGrid>
      </NSpin>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="calcVisible = false">取消</NButton>
          <NButton
            type="primary"
            :loading="calcSaving"
            :disabled="!calcCheckedKeys.length"
            @click="applyJudgeResult"
          >
            写入勾选的 {{ calcCheckedKeys.length }} 条
          </NButton>
        </NSpace>
      </template>
    </NModal>

    <!-- 三违评估 · 生成预览 -->
    <NModal
      v-model:show="swVisible"
      preset="card"
      title="生成三违评估（按自然年度累计扣分）"
      style="width: 1180px; max-width: 96vw"
      :mask-closable="false"
    >
      <NSpin :show="swLoading">
        <NAlert type="info" :bordered="false" class="mb-3">
          数据来源：{{ swSource }}。按每人「{{ new Date().getFullYear() }}年度累计扣分」定级（阈值：较低≤{{
            SW_LEVEL_THRESHOLDS.一般 - 1
          }} / 一般{{ SW_LEVEL_THRESHOLDS.一般 }}~{{ SW_LEVEL_THRESHOLDS.较大 - 1 }} / 较大{{
            SW_LEVEL_THRESHOLDS.较大
          }}~{{ SW_LEVEL_THRESHOLDS.重大 }} / 重大>{{ SW_LEVEL_THRESHOLDS.重大 }}）。默认勾选「等级有变化」的记录，尚无三违评估档案的将自动建档。
        </NAlert>
        <NSpace v-if="swDist.length" class="mb-3" :size="8">
          <NTag
            v-for="d in swDist"
            :key="d.level"
            :type="RISK_LEVEL_NTAG[d.level]"
            size="small"
            round
          >
            {{ d.level }} · {{ d.count }} 人
          </NTag>
        </NSpace>
        <HseDataGrid
          :columns="swColumns"
          :data="swRows"
          :pager="false"
          row-key="key"
          :height="460"
        >
          <template #swCheckHeader>
            <NCheckbox
              :checked="swAllChecked()"
              :indeterminate="swSomeChecked() && !swAllChecked()"
              @update:checked="toggleSwAll"
            />
          </template>
          <template #swCheck="{ row }">
            <NCheckbox
              :checked="swCheckedKeys.includes(row.key)"
              @update:checked="(v: boolean) => toggleSwChecked(row.key, v)"
            />
          </template>
          <template #swYearPoints="{ row }">{{ row.yearPoints }} 分</template>
          <template #swTotalCount="{ row }">{{ row.totalCount }} 条</template>
          <template #swTopType="{ row }">
            <NTag size="small" type="default" :bordered="false">{{ row.topType }}</NTag>
          </template>
          <template #swLevel="{ row }">
            <HseStatusTag :type="riskTagType(row.level)" size="small">{{ row.level }}</HseStatusTag>
          </template>
          <template #swPrevLevel="{ row }">{{ row.prevLevel || '-' }}</template>
          <template #swStatus="{ row }">
            <NTag v-if="!row.hasArchive" size="small" type="warning" :bordered="false">将新建档案</NTag>
            <NTag v-else-if="row.changed" size="small" type="error" :bordered="false">等级变更</NTag>
            <NTag v-else size="small" type="default" :bordered="false">无变化</NTag>
          </template>
        </HseDataGrid>
      </NSpin>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="swVisible = false">取消</NButton>
          <NButton
            type="primary"
            :loading="swSaving"
            :disabled="!swCheckedKeys.length"
            @click="applySwResult"
          >
            写入勾选的 {{ swCheckedKeys.length }} 条
          </NButton>
        </NSpace>
      </template>
    </NModal>

    <!-- 判定依据详情 -->
    <NModal
      v-model:show="basisVisible"
      preset="card"
      :title="`${basisRow?.name || ''} · 判定依据`"
      style="width: 760px; max-width: 94vw"
    >
      <NDescriptions v-if="basisRow" :column="1" bordered label-placement="left" size="small">
        <NDescriptionsItem label="判定等级">
          <HseStatusTag :type="RISK_LEVEL_TAG[basisRow.level]" size="small">
            {{ basisRow.level }}
          </HseStatusTag>
        </NDescriptionsItem>
        <NDescriptionsItem label="近12月记分">
          {{ basisRow.windowScore }} 分（单次最高 {{ basisRow.maxSingle }} 分）
        </NDescriptionsItem>
        <NDescriptionsItem label="违章条数">
          近12个月 {{ basisRow.windowCount }} 条 / 参与判定 {{ basisRow.totalCount }} 条
        </NDescriptionsItem>
        <NDescriptionsItem label="命中行为">
          {{ basisRow.hits.length ? basisRow.hits.join('、') : '无' }}
        </NDescriptionsItem>
        <NDescriptionsItem label="表1违规内容">{{ basisRow.content }}</NDescriptionsItem>
        <NDescriptionsItem label="管控措施">
          <pre class="basis-pre">{{ basisRow.measures }}</pre>
        </NDescriptionsItem>
        <NDescriptionsItem label="判定依据">
          <pre class="basis-pre">{{ basisRow.basis }}</pre>
        </NDescriptionsItem>
      </NDescriptions>
      <template #footer>
        <NSpace justify="end">
          <NButton type="primary" size="small" @click="basisVisible = false">关闭</NButton>
        </NSpace>
      </template>
    </NModal>

    <!-- 累计扣分明细（对齐「三违管理考核」：分项 + 合计，明细点击下钻「驾驶员违章记录」对应 Tab） -->
    <NModal
      v-model:show="deductModalShow"
      preset="card"
      title="累计扣分 · 扣分明细"
      style="width: 560px; max-width: 92vw"
      :mask-closable="true"
    >
      <div class="assess-breakdown">
        <div
          v-for="(r, ri) in deductRows"
          :key="ri"
          class="assess-breakdown-item assess-locate-link"
          @click="locateDeduct(r)"
        >
          <div class="assess-breakdown-main">
            <span class="assess-breakdown-label">{{ r.label }}</span>
            <span v-if="r.sub" class="assess-breakdown-sub">{{ r.sub }}</span>
          </div>
          <span class="assess-breakdown-val">{{ r.value }}</span>
        </div>
        <div v-if="deductRows.length === 0" class="assess-breakdown-empty">暂无扣分明细</div>
        <div class="assess-breakdown-total">
          <span>合计</span>
          <span>{{ fmtPoints(deductTotal) }} 分</span>
        </div>
      </div>
    </NModal>

    <!-- 通用导入（driver-assessment 模块） -->
    <HseImportDialog
      v-model:open="importOpen"
      title="导入交通安全档案"
      :preview-columns="importPreviewColumns"
      :preview-data="importPreviewData"
      :preview-error="importPreviewError"
      :confirming="importConfirming"
      :result="importResult"
      @download-template="onImportTemplate"
      @upload="onImportUpload"
      @confirm="onImportConfirm"
      @close="onImportDialogClose"
    />
  </HsePageLayout>
</template>

<style scoped>
/* 判定依据 / 管控措施：保留表1原文的换行与缩进 */
.basis-pre {
  margin: 0;
  font-family: inherit;
  font-size: 13px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-all;
}

/* 统计卡图标与数值对齐 */
:deep(.n-statistic-value__prefix) {
  display: inline-flex;
  align-items: center;
}

/* 累计扣分数字：可点击（对齐「三违管理考核」数字交互） */
.deduc-click {
  cursor: pointer;
  transition: filter 0.15s;
}
.deduc-click:hover {
  filter: brightness(1.15);
}

/* 累计扣分明细弹窗 · 对齐「三违管理考核」分项 + 合计样式 */
.assess-breakdown {
  min-width: 320px;
}
.assess-breakdown-item {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  padding: 5px 6px;
  border-radius: 4px;
}
.assess-breakdown-item:hover {
  background: rgba(245, 158, 11, 0.14);
}
.assess-breakdown-item.assess-locate-link {
  cursor: pointer;
}
.assess-breakdown-item.assess-locate-link:hover {
  background: rgba(37, 99, 235, 0.12);
  box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.35);
}
.assess-breakdown-main {
  min-width: 0;
  flex: 1;
}
.assess-breakdown-label {
  display: block;
  font-size: 13px;
  line-height: 1.5;
  word-break: break-word;
}
.assess-breakdown-sub {
  display: block;
  margin-top: 2px;
  font-size: 12px;
  color: var(--v-ben-muted-foreground, #6b7280);
  line-height: 1.4;
}
.assess-breakdown-val {
  flex-shrink: 0;
  font-weight: 600;
  color: #d97706;
  font-variant-numeric: tabular-nums;
}
.assess-breakdown-total {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  border-top: 1px dashed #d0d5dd;
  margin-top: 6px;
  padding: 6px 6px 0;
  font-weight: 600;
}
.assess-breakdown-empty {
  padding: 12px 6px;
  text-align: center;
  color: #8a919f;
  font-size: 13px;
}

/* 图表卡片：标题字号统一 */
:deep(.n-card-header__main) {
  font-size: 14px;
  font-weight: 500;
}
</style>
