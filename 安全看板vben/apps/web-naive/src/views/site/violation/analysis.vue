<script lang="ts" setup>
/**
 * 三违分析（web-naive · 阶段06）
 * route：/site/violation/analysis（三级菜单，父级 /site/violation — 三违管理）
 *
 * 本页为「三违照片信息统计台账」月度考核分数台账（乡镇作业中心经理版），完全复刻「安全文化建设」：
 *  - 「每月考核」按月份的「每月下拉选择」筛选：月份下拉只列出有台账数据的月份、倒序、默认最近一个有数据的月份，
 *    无数据时回退当前月（对齐二级菜单「安全文化建设」中的月份下拉交互）。
 *  - 数据按月从源目录 <根>/<年>年/<月>月 的「乡镇作业中心经理月度考核」Excel「三违照片信息统计台账」工作表导入落库。
 *
 * 契约来源：apps/web-naive/src/api/hse/sanwei-analysis.ts（对应 server/routes/hse-sanwei-analysis.js）
 */
import { computed, onMounted, reactive, ref } from 'vue';

import { NAlert, NButton, NDescriptions, NDescriptionsItem, NDrawer, NDrawerContent, NGi, NInput, NModal, NSelect, NSpace, NTabPane, NTabs, NTag } from 'naive-ui';

import {
  HseActionBar,
  HseDataGrid,
  HsePageLayout,
  HseSearchPanel,
  type HseActionKey,
} from '#/components/hse';
import type { VxeTableGridColumns } from '#/adapter/vxe-table';
import {
  getSanweiAnalysisList,
  getSanweiAdminRoster,
  getSanweiAdminMonths,
  importSanweiAnalysis,
  continueSanweiMonthly,
  type SanweiAnalysisApi,
} from '#/api/hse/sanwei-analysis';
import { getAssessmentCycleList, getAssessmentTargetList, type AssessmentMonthlyApi } from '#/api/hse/assessment-monthly';
import { message } from '#/adapter/naive';

defineOptions({ name: 'SiteViolationAnalysis' });

// ===================== 岗位 tab =====================
// manager=乡镇作业中心经理（三违台账）/ admin=管理员（花名册名单，岗位/乡镇自动匹配后固定）
const activeRole = ref<'manager' | 'admin'>('manager');
const cycleList = ref<AssessmentMonthlyApi.AssessmentCycle[]>([]);
let cyclePromise: Promise<void> | null = null;
async function ensureCycleList() {
  if (cycleList.value.length || cyclePromise) {
    if (cyclePromise) await cyclePromise;
    return;
  }
  cyclePromise = (async () => {
    try {
      const res = await getAssessmentCycleList({ page: 1, page_size: 200, sort_by: 'created_at', sort_order: 'desc' });
      cycleList.value = res.list || [];
    } catch {
      cycleList.value = [];
    }
  })();
  await cyclePromise;
}

// ===================== 数据 =====================
const loading = ref(false);
const allRows = ref<SanweiAnalysisApi.Record[]>([]);
const data = ref<SanweiAnalysisApi.Record[]>([]);
const total = ref(0);

// ===================== 月份下拉（对齐「安全文化建设」） =====================
const selectedMonth = ref('');
const monthOptions = ref<{ label: string; value: string }[]>([]);

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
 * 月份下拉占位补全：把「最大台账月的下一个月 → 当前月」的连续缺失月份初始化到下拉里，
 * 保证尚未有台账的未来月份可选（切到这些空月份再由后端 /continue 延续生成）。
 */
function fillPlaceholderMonths() {
  const max = monthOptions.value[0]?.value ?? ''; // 已倒序 → 首元素即最大台账月
  if (!max) {
    if (currentMonth.value && !monthOptions.value.some((o) => o.value === currentMonth.value)) {
      monthOptions.value.push({ label: currentMonth.value, value: currentMonth.value });
    }
    return;
  }
  let cursor = monthStep(max, 1);
  while (cursor <= (currentMonth.value || max)) {
    if (!monthOptions.value.some((o) => o.value === cursor)) {
      monthOptions.value.push({ label: cursor, value: cursor });
    }
    cursor = monthStep(cursor, 1);
  }
}

/** 后端 list 的 page_size 上限为 500；跨月累积后按分页拉全，前端再做「月份 + 乡镇 + 姓名」过滤 */
async function fetchAll(): Promise<SanweiAnalysisApi.Record[]> {
  const size = 500;
  const all: SanweiAnalysisApi.Record[] = [];
  let page = 1;
  let total0 = Number.POSITIVE_INFINITY;
  while (all.length < total0 && page <= 30) {
    const res = await getSanweiAnalysisList({ page, page_size: size } as any);
    const list = res?.list ?? [];
    for (const r of list) all.push(r);
    total0 = res?.total ?? all.length;
    if (list.length < size) break;
    page++;
  }
  return all;
}

// 口径边界：管理员名单 2026-07(含) 前按月取自《管理员月度考核结果》主表，之后沿用系统管理员花名册
const ADMIN_LEDGER_MAX_MONTH = '2026-07';

/** 管理员名单匹配汇总（新增/去掉提示） */
const adminRosterMeta = ref<{
  file?: string;
  note?: string;
  addedCount: number;
  removedNames: string[];
}>({ addedCount: 0, removedNames: [] });

/** 管理员 tab 当月「三违」考核动态列（取自《管理员月度考核结果》Excel，各月可不一致，放在「所属乡镇/作业中心」之后渲染） */
const adminColumns = ref<SanweiAnalysisApi.AdminRosterColumn[]>([]);

/**
 * 管理员名单：
 *  - 选中月份 ≤ 2026-07：从《管理员月度考核结果》主表按月解析管理员名单 + 三违扣分，并按姓名匹配系统管理员
 *    （表中有但系统无 → 展示并标「新增」；系统有但当月表无 → removedNames，该月不展示）
 *  - 选中月份 > 2026-07：取 选中月份对应考核周期 内 position='管理员' 的对象（姓名来自花名册，岗位/乡镇自动匹配）
 */
async function loadAdminRows(): Promise<SanweiAnalysisApi.Record[]> {
  if (!selectedMonth.value) return [];
  adminRosterMeta.value = { addedCount: 0, removedNames: [] };
  adminColumns.value = [];

  // 历史补录范围（≤2026-07）：按表名单
  if (selectedMonth.value <= ADMIN_LEDGER_MAX_MONTH) {
    try {
      const res = await getSanweiAdminRoster(selectedMonth.value);
      const d = res ?? ({} as SanweiAnalysisApi.AdminRosterResult);
      adminRosterMeta.value = {
        file: d.file,
        note: d.note,
        addedCount: d.addedCount ?? 0,
        removedNames: d.removedNames ?? [],
      };
      adminColumns.value = d.columns ?? [];
      const list = (d.list ?? []).map(
        (r) =>
          ({
            id: null,
            month: selectedMonth.value,
            town: r.town || '',
            managerName: r.name,
            employeeId: r.employeeId,
            matched: !!r.matched,
            defectCount: 0,
            photoDefect: 0,
            infoDefect: 0,
            score: 0,
            notAssessed: false,
            admin: true,
            // 把当月考核列的值展开成行级字段，供动态列 field 读取
            ...(r.values || {}),
          }) as unknown as SanweiAnalysisApi.Record,
      ) as SanweiAnalysisApi.Record[];
      return list;
    } catch {
      adminColumns.value = [];
      return [];
    }
  }

  // 2026-08 起：系统管理员花名册
  await ensureCycleList();
  const [y, m] = selectedMonth.value.split('-');
  const pad = (n: number) => String(n).padStart(2, '0');
  const cycle =
    cycleList.value.find((c) => String(c.assessmentYear) === y && pad(c.assessmentMonth) === m) ||
    cycleList.value.find((c) => `${c.assessmentYear}-${pad(c.assessmentMonth)}` === selectedMonth.value) ||
    cycleList.value[0];
  if (!cycle) return [];
  try {
    const res = await getAssessmentTargetList(cycle.id, { page: 1, page_size: 500, position: '管理员' });
    const list = res?.list ?? [];
    return list.map((t) => ({
      id: null,
      month: selectedMonth.value,
      town: t.township || '',
      managerName: t.employeeName,
      employeeId: t.employeeId,
      matched: true,
      defectCount: 0,
      photoDefect: 0,
      infoDefect: 0,
      score: 0,
      notAssessed: false,
      admin: true,
    })) as unknown as SanweiAnalysisApi.Record[];
  } catch {
    return [];
  }
}

async function loadData() {
  loading.value = true;
  try {
    // 月份下拉 = 经理三违台账已有台账月份 ∪ 目录下有《管理员月度考核结果》Excel 的月份（保证管理员月可选）
    const ledger = await fetchAll();
    const set = new Set<string>();
    for (const r of ledger) if (r.month) set.add(r.month);
    try {
      const adm = await getSanweiAdminMonths();
      for (const m of adm?.months ?? []) if (m) set.add(m);
    } catch { /* 管理员月拉取失败不影响台账月 */ }
    monthOptions.value = [...set]
      .sort((a, b) => b.localeCompare(a))
      .map((m) => ({ label: m, value: m }));
    // 占位补全：把「最大台账月的下一个月 → 当前月」的连续缺失月份追加到下拉尾部，
    // 保证未来月份（如 2026-08 / 2026-09）在无台账时也可选；切到这些空月份再由后端延续生成。
    fillPlaceholderMonths();
    if (!monthOptions.value.some((o) => o.value === selectedMonth.value)) {
      selectedMonth.value = monthOptions.value[0]?.value ?? currentMonth.value;
    }
    // 按岗位取展示行：经理=三违台账；管理员=周期内 position='管理员' 的花名册名单
    if (activeRole.value === 'manager') {
      allRows.value = ledger;
    } else {
      allRows.value = await loadAdminRows();
    }
    applyFilter();
  } catch {
    allRows.value = [];
    data.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
}

// ===================== 筛选 =====================
const searchForm = reactive({
  town: '',
  keyword: '',
});

/** 当前月份 + 乡镇 + 姓名 过滤后的集合 */
function filteredRows(): SanweiAnalysisApi.Record[] {
  const town = searchForm.town.trim();
  const kw = searchForm.keyword.trim();
  return allRows.value.filter(
    (r) =>
      (!selectedMonth.value || (r.month || '') === selectedMonth.value) &&
      (!town || (r.town || '').includes(town)) &&
      (!kw || (r.managerName || r.town || '').includes(kw)),
  );
}

function applyFilter() {
  const rows = filteredRows();
  total.value = rows.length;
  data.value = rows;
}

/** 当前选中月份查不到台账 → 视为满分（0扣分，仅经理台账适用；管理员为花名册名单） */
const isEmptyMonth = computed(
  () =>
    activeRole.value === 'manager' &&
    !!selectedMonth.value &&
    !allRows.value.some((r) => r.month === selectedMonth.value),
);

/** 当前选中月份三违考核未实施（分数列标题标「不考核」，保留成绩数据） */
const selectedMonthNotAssessed = computed(() => {
  if (!selectedMonth.value) return false;
  return allRows.value.some((r) => r.month === selectedMonth.value && r.notAssessed);
});

function onRefresh() {
  return loadData();
}
function onSearch() {
  applyFilter();
}
function onReset() {
  Object.assign(searchForm, { town: '', keyword: '' });
  onSearch();
}
async function onMonthChange() {
  // 管理员名单按月份对应的考核周期取，需整表重载；经理台账仅前端过滤
  if (activeRole.value === 'admin') {
    loadData();
    return;
  }
  // 三违分析的当前月；自动延续：经理 tab + ≥2026-08 + 尚无台账的空月份，
  // 由后端从「三违台账」(grid_inspection_records) 聚合 / 延续上月补齐本月页面（幂等），供人工在系统里编辑。
  const m = selectedMonth.value;
  if (m && m >= '2026-08' && !allRows.value.some((r) => r.month === m)) {
    try {
      const r = await continueSanweiMonthly({ month: m });
      if (r.inserted > 0) {
        message.success(`已按三违台账自动生成 ${m} 月 ${r.inserted} 行数据，可在下方查看编辑`);
        await onRefresh();
        return;
      }
    } catch {
      /* 拦截器已提示 */
    }
  }
  applyFilter();
}

// 切换岗位 tab：按新岗位重载对应数据源
function handleRoleChange() {
  loadData();
}

// ===================== 分数展示 =====================
function formatScore(v: number | null | undefined): string {
  if (v == null || Number.isNaN(Number(v))) return '0';
  const n = Number(v);
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

function displayName(row: SanweiAnalysisApi.Record): string {
  return row.managerName || row.town || '-';
}

// ===================== 列 =====================
/**
 * 按月份区分表头（口径分界：2026-07）：
 *  - ≤ 2026-07：「照片」「违章信息」两列（当月未完成 × 次数），三违考核分数=照片/违章扣分之和
 *  - ≥ 2026-08：「未完成项数」单列，保持现状
 */
const LEGACY_SPLIT_MONTH = '2026-07';

const columns = computed<VxeTableGridColumns>(() => {
  const isLegacy = !selectedMonth.value || selectedMonth.value <= LEGACY_SPLIT_MONTH;
  const detailCols: VxeTableGridColumns = [
    {
      title: '序号',
      field: 'index',
      width: 70,
      align: 'center',
      formatter: (params: any) => (params?.rowIndex ?? 0) + 1,
    },
    {
      title: activeRole.value === 'admin' ? '姓名（管理员）' : '姓名',
      field: 'managerName',
      minWidth: 130,
      align: 'center',
      showOverflow: 'tooltip',
      slots: { default: 'name' },
    },
    {
      // 经理 tab 所属部门列名「所属部门」，值取花名册部门名（department = xx镇作业中心）；管理员 tab 保留原名
      title: activeRole.value === 'admin' ? '所属乡镇/作业中心' : '所属部门',
      field: activeRole.value === 'admin' ? 'town' : 'department',
      minWidth: 160,
      align: 'center',
      showOverflow: 'tooltip',
    },
  ];

  // 管理员 tab：固定列之后，把当月《管理员月度考核结果》Excel 的三违考核列（用表头原文、可能为分组双层表头）动态拼出
  if (activeRole.value === 'admin') {
    for (const col of adminColumns.value) {
      const leafs: VxeTableGridColumns = (col.children && col.children.length ? col.children : []).map((ch) => ({
        field: ch.key,
        title: ch.title,
        minWidth: 80,
        align: 'center',
        showOverflow: 'tooltip',
      }));
      if (leafs.length) {
        detailCols.push({ title: col.title, align: 'center', children: leafs });
      } else {
        detailCols.push({ field: col.key, title: col.title, minWidth: 80, align: 'center', showOverflow: 'tooltip' });
      }
    }
    detailCols.push({
      title: '操作',
      field: 'action',
      width: 90,
      align: 'center',
      fixed: 'right',
      slots: { default: 'action' },
    });
    return detailCols;
  }

  // 经理 tab：在「所属部门」列后展示「检查数量」（该乡镇该月「三违台账」检查记录条数）
  detailCols.push({ title: '检查数量', field: 'inspectionCount', minWidth: 90, align: 'center' });

  // 2026-07 之前：照片 / 违章信息 两列
  if (isLegacy) {
    detailCols.push(
      {
        title: '照片',
        field: 'photoDefect',
        minWidth: 90,
        align: 'center',
        showOverflow: 'tooltip',
      },
      {
        title: '违章信息',
        field: 'infoDefect',
        minWidth: 110,
        align: 'center',
        showOverflow: 'tooltip',
      },
    );
  } else {
    // 2026-08 及之后：未完成项数单列
    detailCols.push({
      title: '未完成项数',
      field: 'defectCount',
      minWidth: 100,
      align: 'center',
    });
  }
  detailCols.push(
    {
      // 该月三违考核未实施时标注「（不考核）」，分数仍展示为 0
      title: selectedMonthNotAssessed.value ? '三违考核分数（不考核）' : '三违考核分数',
      field: 'score',
      minWidth: 120,
      align: 'center',
      slots: { default: 'score' },
    },
    {
      title: '操作',
      field: 'action',
      width: 90,
      align: 'center',
      fixed: 'right',
      slots: { default: 'action' },
    },
  );
  return detailCols;
});

// ===================== 详情抽屉 =====================
const detailDrawerVisible = ref(false);
const currentRecord = ref<SanweiAnalysisApi.Record | null>(null);
function openView(row: SanweiAnalysisApi.Record) {
  currentRecord.value = row;
  detailDrawerVisible.value = true;
}

// ===================== 导入（选「年 / 月」，从服务器目录扫描「三违照片信息统计台账」） =====================
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
    const res: SanweiAnalysisApi.ImportResult = await importSanweiAnalysis({
      year: Number(importYear.value),
      month: Number(importMonth.value),
    });
    allSheetsProcessed.value = res.sheetsProcessed ?? [];
    allSkippedFiles.value = res.skippedFiles ?? [];
    if (res.fullMarks) {
      message.success(res.fullMarksNote || `该月无「三违照片信息统计台账」，视为满分（0扣分）`, { duration: 4000 });
    } else {
      message.success(`导入完成：${res.imported} 行，未匹配考核对象 ${res.unmatched} 人`, { duration: 4000 });
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

const actionState = computed<Partial<Record<HseActionKey, { hidden?: boolean }>>>(() => ({
  downloadTemplate: { hidden: true },
  export: { hidden: true },
  create: { hidden: true },
}));

onMounted(() => {
  loadData();
});
</script>

<template>
  <HsePageLayout title="三违分析" description="现场管理 · 每个月乡镇作业中心经理「三违照片信息统计台账」的月度考核分数">
    <template #extra>
      <NSpace>
        <HseActionBar :actions="actionState" @refresh="onRefresh" @import="openImport" />
      </NSpace>
    </template>

    <!-- 月份下拉（对齐「自动评分」：下拉框在上，岗位 tab 在下） -->
    <div class="mb-4 flex items-center justify-between">
      <NSelect
        v-model:value="selectedMonth"
        placeholder="请选择考核月份"
        :options="monthOptions"
        style="max-width: 320px"
        @update:value="onMonthChange"
      />
    </div>

    <!-- 岗位 tab：乡镇作业中心经理 / 管理员 -->
    <NTabs v-model:value="activeRole" type="line" class="mb-3" @update:value="handleRoleChange">
      <NTabPane name="manager" tab="乡镇作业中心经理">
        <div class="text-gray-400" style="font-size: 12px">展示「三违照片信息统计台账」中各乡镇作业中心经理的月度三违考核分数。</div>
      </NTabPane>
      <NTabPane name="admin" tab="管理员">
        <div class="text-gray-400" style="font-size: 12px">
          2026-07（含）前：按月读取《管理员月度考核结果》中当月被考核管理员名单与三违扣分，并按姓名匹配系统管理员（表中有而系统无 → 标「新增」；系统中有而当月表无 → 该月不展示）；2026-08 起展示系统管理员花名册。
        </div>
      </NTabPane>
    </NTabs>

    <!-- 筛选：所属乡镇 / 姓名 -->
    <HseSearchPanel @query="onSearch" @reset="onReset">
      <NGi>
        <NInput
          v-model:value="searchForm.town"
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

    <!-- 该月无「三违照片信息统计台账」→ 满分提示 -->
    <NAlert v-if="isEmptyMonth" type="success" :show-icon="true" class="mb-4">
      所选考核月份没有「三违照片信息统计台账」，按满分（0扣分）处理。
    </NAlert>

    <!-- 管理员：按月匹配汇总提示（新增 / 去掉） -->
    <NAlert
      v-if="activeRole === 'admin' && selectedMonth && selectedMonth <= ADMIN_LEDGER_MAX_MONTH"
      :type="allRows.length ? 'info' : 'warning'"
      :show-icon="true"
      class="mb-4"
    >
      <template v-if="adminRosterMeta.note">
        {{ adminRosterMeta.note }}
      </template>
      <template v-else>
        该月管理员名单按《管理员月度考核结果》主表获取：共 {{ adminRosterMeta.addedCount }} 人「新增」（表中存在但系统管理员名单中无）；
        系统中有但当月表无（该月不展示）共 {{ adminRosterMeta.removedNames.length }} 人：{{
          adminRosterMeta.removedNames.join('、') || '无'
        }}。
      </template>
    </NAlert>

    <!-- 月度三违分数台账 -->
    <HseDataGrid :columns="columns" :data="data" :loading="loading" :pager="false">
      <template #name="{ row }">
        <span v-if="row.matched">{{ row.managerName || '-' }}</span>
        <template v-else>
          <span class="text-muted-foreground">{{ row.managerName || row.town || '未匹配' }}</span>
          <NTag v-if="activeRole === 'admin'" :bordered="false" size="small" type="warning" class="ml-2">新增</NTag>
        </template>
      </template>
      <template #score="{ row }">
        <NTag :bordered="false" size="small" :type="(row.score ?? 0) > 0 ? 'warning' : 'success'">
          {{ formatScore(row.score) }}
        </NTag>
      </template>
      <template #action="{ row }">
        <NSpace justify="center" :size="4">
          <NButton size="tiny" type="primary" quaternary @click="openView(row)">查看</NButton>
        </NSpace>
      </template>
    </HseDataGrid>

    <!-- 详情抽屉 -->
    <NDrawer v-model:show="detailDrawerVisible" :width="560">
      <NDrawerContent v-if="currentRecord" :title="`三违月度考核台账 #${currentRecord.id}`">
        <NDescriptions :column="1" bordered label-placement="left">
          <NDescriptionsItem label="月份">{{ currentRecord.month || '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="所属乡镇/作业中心">{{ currentRecord.town || '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="经理姓名">
            {{ displayName(currentRecord) }}
          </NDescriptionsItem>
          <NDescriptionsItem label="考核对象">
            <NTag :bordered="false" size="small" :type="currentRecord.matched ? 'success' : 'warning'">
              {{ currentRecord.matched ? '已匹配' : '未匹配' }}
            </NTag>
          </NDescriptionsItem>
          <NDescriptionsItem label="未完成项数">{{ currentRecord.defectCount }}</NDescriptionsItem>
          <template v-if="(currentRecord.month || '') <= LEGACY_SPLIT_MONTH">
            <NDescriptionsItem label="照片未完成次数">{{ currentRecord.photoDefect }}</NDescriptionsItem>
            <NDescriptionsItem label="违章信息未完成次数">{{ currentRecord.infoDefect }}</NDescriptionsItem>
          </template>
          <NDescriptionsItem :label="currentRecord.notAssessed ? '三违考核分数（不考核）' : '三违考核分数'">
            <span :class="(currentRecord.score ?? 0) > 0 ? 'font-semibold text-error' : ''">
              {{ formatScore(currentRecord.score) }}
            </span>
            <NTag v-if="currentRecord.notAssessed" :bordered="false" size="small" type="info" class="ml-2">该月未考核</NTag>
          </NDescriptionsItem>
        </NDescriptions>
      </NDrawerContent>
    </NDrawer>

    <!-- 导入（悬浮弹窗，选「年/月」后从服务器目录扫描乡镇作业中心经理「三违照片信息统计台账」） -->
    <NModal
      v-model:show="importVisible"
      title="导入三违照片信息统计台账"
      preset="card"
      style="width: 700px; max-width: 92vw"
      :mask-closable="false"
    >
      <NDescriptions :column="1" size="small" bordered class="mb-4">
        <NDescriptionsItem label="说明">
          从服务器目录「G:\safety_vault\04_现场管理\27、HSE月度考核 / {{ importYear }}年 / {{ importMonth }}月」中，扫描**乡镇作业中心经理月度考核** Excel（覆盖 2025 年、2026 年各月），读取其中的「三违照片信息统计台账」工作表并全量覆盖该月的三违考核分数。
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
  </HsePageLayout>
</template>