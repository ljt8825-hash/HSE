<script lang="ts">
/**
 * 模块级并发锁。
 * <script setup> 里的变量是「组件实例级」的，重复挂载会各自持有一份、锁不住；
 * 而 onMounted 里的 syncFromRoster 若被并发触发（HMR 重载 / 重复进入路由 / 多标签页快速切换），
 * 两次执行会各自拿着过期的 allRows 快照，给同一个人各建一条 —— 2026-09 的 74 行/44 人即由此产生。
 * 放模块级才能真正跨实例互斥。
 */
let rosterSyncing = false;
</script>

<script lang="ts" setup>
/**
 * 月度考核（web-naive · 驾驶员管理 · 月度考核）
 * 后端：/site-mgmt/driver-monthly（2026-09-04 已由内存模式迁 PostgreSQL 表 driver_monthly）
 * 2026-09 调整：
 *  - 移除 安全驾驶得分/遵章守纪得分/培训学习得分/得分/考核等级/评定人/主要问题
 *  - 新增考核列（数值计数）：三检表管理/灯牌污损/灯具失效/安全监控/消防管理
 *  - 驾驶员姓名从花名册自动获取：按「人员」生成固定考核记录，
 *    再次导入花名册后按 personnelId 匹配自动更新姓名
 * 2026-09-04 调整：
 *  - 列表移除「考核月份」列，改为页面顶部月份下拉（结构对齐 hse/assessment-monthly/targets.vue：
 *    内容区第一个子元素 div.mb-4 + NSelect max-width:320px），选中月份后列表只显示该月数据。
 *  - 后端 GET /driver-monthly 的 pageSize 上限为 200，历史数据 400+ 条时会静默截断，
 *    故改为分页拉全（pageSize=200 循环）后在前端按月份过滤。
 * 能力：导入(driver-monthly) / 同步花名册 / 新增·编辑 / 详情 / 删除(二次确认) / 人员匹配校验
 */
import { computed, onActivated, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import {
  NAlert,
  NButton,
  NDescriptions,
  NDescriptionsItem,
  NDrawer,
  NDrawerContent,
  NForm,
  NFormItem,
  NGi,
  NInput,
  NInputNumber,
  NModal,
  NPopconfirm,
  NSelect,
  NSpace,
  NSpin,
  NTag,
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
  createDriverMonthly,
  deleteDriverMonthly,
  getDriverMonthlyList,
  getDriverThreeViolationList,
  updateDriverMonthly,
  type SiteApi,
} from '#/api/hse/site';
import { getProfileList, withRosterCache } from '#/api/hse/employee-profile';
import { useGenericImport } from '#/views/hse/_shared/useGenericImport';
import { message } from '#/adapter/naive';

defineOptions({ name: 'SiteDriverMonthly' });

// ===================== 列表数据 =====================
const loading = ref(false);
const allRows = ref<SiteApi.DriverMonthly[]>([]);
const data = ref<SiteApi.DriverMonthly[]>([]);
const total = ref(0);

const searchForm = reactive({
  keyword: '',
  department: '',
});

/** 当前选中的考核月份（列表按此过滤，替代原「考核月份」列与搜索框） */
const selectedMonth = ref('');
const monthOptions = ref<{ label: string; value: string }[]>([]);

// 支持外部下钻：query 携带 month（YYYY-MM）时，加载后自动定位该月
// （自动评分页「现场管理-驾驶员管理」列扣分明细点击下钻使用；无 query 时行为与默认一致）
const route = useRoute();
const router = useRouter();
const drillMonth = computed(() =>
  typeof route.query.month === 'string' ? route.query.month : '',
);
/** 支持外部下钻：query 携带 driver（驾驶员姓名）时，定位并高亮该驾驶员行 */
const drillDriver = computed(() => (typeof route.query.driver === 'string' ? route.query.driver.trim() : ''));
/** 当前高亮定位的驾驶员姓名（空 = 未定位） */
const locateName = ref('');
/** 定位的驾驶员行（data 中按姓名精确匹配，供定位横幅展示） */
const locatedDriver = computed(() =>
  locateName.value ? data.value.find((r) => String(r.name || '').trim() === locateName.value) : null,
);
function driverRowClassName({ row }: { row: any }): string {
  return locateName.value && String(row?.name || '').trim() === locateName.value ? 'driver-locate-row' : '';
}
function applyDriverLocate() {
  if (!drillDriver.value) return;
  locateName.value = drillDriver.value;
  searchForm.keyword = drillDriver.value;
  if (!monthOptions.value.some((o) => o.value === selectedMonth.value)) {
    const fd = data.value.find((r) => String(r.name || '').trim() === drillDriver.value);
    if (fd && fd.month) selectedMonth.value = String(fd.month);
  }
  applyFilter();
}
function exitLocateDriver() {
  locateName.value = '';
  searchForm.keyword = '';
  void router.replace({ query: { ...(selectedMonth.value ? { month: selectedMonth.value } : {}) } });
  applyFilter();
}

/** 当前月（YYYY-MM）：花名册同步 / 新增记录的默认考核月份 */
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
 * 月份下拉空洞补全：月在倒序选项中，若相邻两月不连续（中间缺了整月，如 2026-09 → 2026-07 缺 2026-08），
 * 把缺失的中间月份插补进去，保证「无台账月份」也可选（选中后再由 syncFromRoster 延续生成）。
 */
function fillDropdownGaps() {
  const opts = monthOptions.value;
  if (opts.length < 2) return;
  const result: { label: string; value: string }[] = [];
  for (let i = 0; i < opts.length; i++) {
    const curOpt = opts[i];
    if (!curOpt) continue;
    result.push(curOpt);
    const next = opts[i + 1];
    const cur = curOpt.value;
    if (!next || !cur || cur <= next.value) continue;
    let cursor = monthStep(next.value, 1);
    while (cursor !== cur) {
      if (!opts.some((o) => o.value === cursor)) {
        result.push({ label: cursor, value: cursor });
      }
      cursor = monthStep(cursor, 1);
    }
  }
  monthOptions.value = result;
}

/**
 * 后端 GET /driver-monthly 把 pageSize 钳制在 200 以内，历史月份堆积后
 * 一次性 pageSize=9999 只会拿到前 200 条，故这里分页拉全。
 */
async function fetchAll(): Promise<SiteApi.DriverMonthly[]> {
  const size = 200;
  const all: SiteApi.DriverMonthly[] = [];
  let page = 1;
  let total = Number.POSITIVE_INFINITY;
  while (all.length < total && page <= 30) {
    const res = await getDriverMonthlyList({ page, pageSize: size } as any);
    const list = res.list ?? [];
    all.push(...list);
    total = res.total ?? all.length;
    if (list.length < size) break;
    page++;
  }
  return all;
}

async function loadData() {
  loading.value = true;
  try {
    allRows.value = await fetchAll();
    // 保证花名册已加载（用于「姓名」列剔除离职驾驶员）
    await loadDriverRoster();
    // 月份下拉：数据中出现的月份 + 当前月（保证当月可新建），倒序
    const set = new Set<string>();
    for (const r of allRows.value) if (r.month) set.add(r.month);
    set.add(currentMonth.value);
    monthOptions.value = [...set]
      .sort((a, b) => b.localeCompare(a))
      .map((m) => ({ label: m, value: m }));
    // 空洞补全：把相邻已存在月份间缺的月份（如 2026-08）补进下拉，使无台账月份也可选
    fillDropdownGaps();
    // 外部下钻（自动评分页点击下钻）：优先定位 query.month；不在下拉时补入
    const dm = drillMonth.value;
    if (dm) {
      if (!monthOptions.value.some((o) => o.value === dm)) {
        monthOptions.value.push({ label: dm, value: dm });
        monthOptions.value.sort((a, b) => b.value.localeCompare(a.value));
      }
      selectedMonth.value = dm;
    } else if (!monthOptions.value.some((o) => o.value === selectedMonth.value)) {
      selectedMonth.value = monthOptions.value[0]?.value ?? currentMonth.value;
    }
    // 三违列数据：当月三违扣分记录（每条计 1 分）；须在选中月份确定后拉取
    await loadThreeViolations();
    applyFilter();
  } catch {
    allRows.value = [];
    data.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
}

/** 当前月份 + 关键字 + 部门 过滤后的集合（列表分页与人员校验共用）；
 *  修正「人员未去重」：同月同名仅保留一行（优先保留带 personnelId 的行，其次取 id 较大的新行），
 *  只做展示层去重，不落库、不动重复行的子项数值。 */
function filteredRows(): SiteApi.DriverMonthly[] {
  const kw = searchForm.keyword.trim();
  const dept = searchForm.department.trim();
  const rows = allRows.value.filter(
    (r) =>
      (!selectedMonth.value || (r.month || '') === selectedMonth.value) &&
      // 剔除离职驾驶员：后端 is_driver=true 已排除离职者，凡不在「在职驾驶员」名单中的姓名视为离职/非驾驶员，
      // 从「姓名」列隐藏（对齐「驾驶员违章记录」数据采集）；花名册未就绪时不过滤，避免列表被清空
      (!rosterReady.value || !(r.name && !activeDriverNames.value.has(r.name))) &&
      (!kw || (r.name || '').includes(kw)) &&
      (!dept || (r.department || '').includes(dept)),
  );
  // 同人同月去重：优先保留有 personnelId 者，其次 id 较大者
  const bestByName = new Map<string, SiteApi.DriverMonthly>();
  for (const r of rows) {
    const name = (r.name || '').trim();
    if (!name) continue;
    const prev = bestByName.get(name);
    if (!prev) {
      bestByName.set(name, r);
      continue;
    }
    const rHas = r.personnelId != null;
    const pHas = prev.personnelId != null;
    if (rHas !== pHas) {
      if (rHas) bestByName.set(name, r);
    } else if (Number(r.id || 0) > Number(prev.id || 0)) {
      bestByName.set(name, r);
    }
  }
  return rows.filter((r) => {
    const name = (r.name || '').trim();
    return !name || bestByName.get(name) === r;
  });
}

/** 列表不分页：按当前月份 + 关键字 + 部门过滤后全部展示 */
function applyFilter() {
  const rows = filteredRows();
  total.value = rows.length;
  data.value = rows;
}

function onSearch() {
  applyFilter();
}
function onReset() {
  Object.assign(searchForm, { keyword: '', department: '' });
  onSearch();
}
/** 切换考核月份：先对空洞月份延续生成，再过滤（数据同步后直接在本地按月份过滤） */
async function onMonthChange() {
  const m = selectedMonth.value;
  // 空月份延续生成空页面：切到尚无台账的月份时，按花名册自动生成该月固定考核人员（幂等），
  // 数值列默认 0，供人工在系统里填，不依赖 Excel 导入。
  if (m && !allRows.value.some((r) => (r.month || '') === m)) {
    await syncFromRoster(m); // 幂等：已有该人员只更新姓名，缺的自动新建
  }
  // 三违列随选中月份变化：重算当月三违扣分记录条数
  rebuildThreeViolationCountMap();
  applyFilter();
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
} = useGenericImport('driver-monthly');

async function onImportSuccess() {
  await loadData();
  await checkPersonnelMatch();
}
bindRefresh(onImportSuccess);

async function onRefresh() {
  await loadData();
}

// ===================== 花名册同步（生成固定人员 / 自动更新姓名） =====================
const syncing = ref(false);

/**
 * 驾驶员花名册条目（数据采集对齐「驾驶员违章记录 › ViolationList」：
 * 用 getProfileList({ is_driver:true })，按 status=='离职' / leave_date / person_type=='已离职' 标记离职）
 */
type RosterDriver = { id: number; name: string; dept: string; departed: boolean };
const driverRoster = ref<RosterDriver[]>([]);
/** 花名册是否已成功就绪（未就绪时不按离职过滤列表，避免取数失败导致列表被清空） */
const rosterReady = ref(false);

/** 在职（未离职）驾驶员姓名：按月考核「姓名」列过滤、生成考核人员（对齐「驾驶员违章记录」） */
const activeDriverNames = computed(() =>
  new Set(driverRoster.value.filter((d) => !d.departed).map((d) => d.name).filter(Boolean)),
);

/**
 * 加载驾驶员花名册（对齐「驾驶员违章记录」数据采集）。
 * 数据源：/hse/employee/employees/profile/list?is_driver=true；
 * 名单按花名册版本缓存（withRosterCache，仅花名册导入导致司机名单/离岗状态变化后才重拉）。
 */
async function loadDriverRoster(): Promise<RosterDriver[]> {
  const fetchRoster = async (): Promise<RosterDriver[]> => {
    const res = await getProfileList({ is_driver: true, pageSize: 9999 } as any);
    const seen = new Set<number>();
    const out: RosterDriver[] = [];
    for (const e of (res?.list ?? []) as any[]) {
      if (!e?.name) continue;
      const id = Number(e.id);
      if (seen.has(id)) continue; // 分页/接口去重
      seen.add(id);
      // 所属部门：用花名册乡镇作业中心组织名归因（org_name=「柴胡店镇作业中心」）。
      // town_center 级组织在「作业中心」前插入「乡镇」→「柴胡店镇乡镇作业中心」；
      // 车队等非乡镇组织（org_type≠town_center）保留原部门名（如「车队」）。
      const orgName = String(e.org_name || '').trim();
      const dept =
        (e.org_type === 'town_center' && orgName)
          ? orgName.replace(/作业中心$/, '乡镇作业中心')
          : (String(e.dept_name || '').trim() || orgName);
      out.push({
        id,
        name: e.name,
        dept,
        departed: e.status === '离职' || Boolean(e.leave_date) || e.person_type === '已离职',
      });
    }
    return out;
  };
  try {
    driverRoster.value = await withRosterCache<RosterDriver[]>(
      'dw_monthly_driver_roster_dept_v2', // 部门归因改为 org_name（xx镇乡镇作业中心）后换 key 强制重拉，避免旧缓存写回旧部门
      'driver',
      fetchRoster,
    );
    rosterReady.value = true;
  } catch {
    // 取数失败：保留已有名单，且不标记就绪，避免列表被离职过滤清空
    rosterReady.value = false;
  }
  return driverRoster.value;
}

// ===================== 三违扣分记录（当月条数，每条计1分） =====================
const threeViolationCountMap = ref<Record<string, number>>({});
let threeViolationRows: SiteApi.DriverViolation[] = [];

/** 分页拉全三违扣分记录（driver_three_violation 表；后端单页上限 200，避免静默截断） */
async function fetchAllThreeViolations(): Promise<SiteApi.DriverViolation[]> {
  const size = 200;
  const all: SiteApi.DriverViolation[] = [];
  let page = 1;
  let total = Number.POSITIVE_INFINITY;
  while (all.length < total && page <= 30) {
    const res = await getDriverThreeViolationList({ page, pageSize: size } as any);
    const list = res?.list ?? [];
    all.push(...list);
    total = res?.total ?? all.length;
    if (list.length < size) break;
    page++;
  }
  return all;
}

async function loadThreeViolations() {
  try {
    threeViolationRows = await fetchAllThreeViolations();
  } catch {
    threeViolationRows = [];
  }
  rebuildThreeViolationCountMap();
}

/** 记录所属月份（violationTime 形如 'YYYY-MM-DD HH:mm'，取前 7 位） */
function monthOf(ts?: string | null): string {
  return String(ts || '').slice(0, 7);
}

/** 重算选中考核月份下各驾驶员的三违条数（每条记录计 1 分） */
function rebuildThreeViolationCountMap() {
  const map: Record<string, number> = {};
  const m = selectedMonth.value;
  if (m) {
    for (const r of threeViolationRows) {
      const name = (r.name || '').trim();
      if (!name || monthOf(r.violationTime) !== m) continue;
      map[name] = (map[name] ?? 0) + 1; // 每条三违扣分记录按 1 分取值，非按「记分」
    }
  }
  threeViolationCountMap.value = map;
}

/** 三违列取值：该驾驶员在当前选中考核月份的三违记录条数 */
function threeViolationCount(row: SiteApi.DriverMonthly): number {
  const name = (row.name || '').trim();
  if (!name) return 0;
  return threeViolationCountMap.value[name] ?? 0;
}

/** 三违扣分明细：选中考核月份下该驾驶员的三违记录（按时间升序，供悬浮菜单展示哪天/什么原因） */
function violationDetailsOf(row: SiteApi.DriverMonthly): SiteApi.DriverViolation[] {
  const name = (row.name || '').trim();
  const m = selectedMonth.value;
  if (!name || !m) return [];
  return threeViolationRows
    .filter((r) => (r.name || '').trim() === name && monthOf(r.violationTime) === m)
    .sort((a, b) => String(a.violationTime || '').localeCompare(String(b.violationTime || '')));
}

/**
 * 按花名册生成/更新固定考核人员。
 * - 该月份已存在该人员（按 personnelId 匹配，缺失时按姓名兜底）→ 姓名有变则更新
 * - 不存在 → 新建一条考核记录（数值列默认 0）
 */
async function syncFromRoster(month: string) {
  if (!month) {
    message.warning('请先确定考核月份');
    return;
  }
  // 并发锁：同一页面内的重复调用直接忽略（模块级 rosterSyncing）
  if (rosterSyncing) {
    message.info('花名册同步进行中，请稍候');
    return;
  }
  rosterSyncing = true;
  syncing.value = true;
  try {
    // 保证花名册已加载（onMounted / 「同步花名册人员」入口已加载，此处兜底）
    await loadDriverRoster();
    // 仅对在职（未离职）驾驶员生成/更新固定考核人员：离职人员不进入「姓名」列（对齐「驾驶员违章记录」）
    const drivers = driverRoster.value.filter((d) => !d.departed);
    if (drivers.length === 0) {
      message.warning('花名册中未找到在职驾驶员');
      return;
    }

    const byPersonnelId = new Map<number, SiteApi.DriverMonthly>();
    const byName = new Map<string, SiteApi.DriverMonthly>();
    const indexRow = (r: SiteApi.DriverMonthly) => {
      // 姓名始终兜底建索引：历史导入行可能 personnel_id 为空/不一致，
      // 只按 personnel_id 匹配会导致后续同步重复建行（见下方 existing 兜底逻辑）
      if (r.name) {
        const k = r.name.trim();
        if (!byName.has(k)) byName.set(k, r);
      }
      if (r.personnelId != null) byPersonnelId.set(Number(r.personnelId), r);
    };
    allRows.value.filter((r) => (r.month || '').trim() === month).forEach(indexRow);

    // 本轮已新建的 personnelId：不依赖 create 接口的返回结构，靠它兜住「同一轮内重复建行」
    const createdIds = new Set<number>();

    let created = 0;
    let updated = 0;
    for (const d of drivers) {
      const pid = Number(d.id);
      // 优先按 personnelId 精确匹配；缺失/不一致时按姓名兜底，命中则复用该行并补齐 personnelId，避免重复建行
      const existing =
        (pid ? byPersonnelId.get(pid) : undefined) || byName.get(d.name.trim());
      const alreadyCreated = pid ? createdIds.has(pid) : false;
      if (existing && !alreadyCreated) {
        const patch: Partial<SiteApi.DriverMonthly> = {};
        if (existing.name !== d.name) patch.name = d.name;
        // 部门改从花名册归因（xx镇乡镇作业中心）后，同步归档旧行部门，避免历史「xx镇片区」残留
        if (String(existing.department || '') !== d.dept) patch.department = d.dept;
        if (existing.personnelId == null || Number(existing.personnelId) !== pid) {
          patch.personnelId = d.id;
        }
        if (Object.keys(patch).length > 0) {
          await updateDriverMonthly(existing.id, patch);
          updated++;
        }
      } else if (!alreadyCreated) {
        await createDriverMonthly({
          month,
          name: d.name,
          department: d.dept || '',
          personnelId: d.id,
          threeCheckManagement: 0,
          lampDirty: 0,
          lampFailure: 0,
          safetyMonitor: 0,
          fireManagement: 0,
          remark: '',
        } as Partial<SiteApi.DriverMonthly>);
        if (pid) createdIds.add(pid);
        created++;
      }
    }
    message.success(`已同步花名册：新增 ${created} 人，更新 ${updated} 人`);
    await loadData();
  } catch {
    message.error('同步花名册失败');
  } finally {
    rosterSyncing = false;
    syncing.value = false;
  }
}

function onSyncRoster() {
  syncFromRoster(selectedMonth.value || currentMonth.value);
}

// ===================== 人员匹配校验（姓名 → 花名册） =====================
const rosterNames = ref<Set<string>>(new Set());
async function loadRosterNames() {
  // 复用（可能来自本地缓存）的驾驶员花名册；以「在职驾驶员」为比对基准（离职不计入，判定为不匹配）
  await loadDriverRoster();
  rosterNames.value = activeDriverNames.value;
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
    const rows = filteredRows();
    for (const r of rows) {
      if (!r.name) continue;
      if (rosterNames.value.has(r.name)) matched++;
      else mismatches.push({ id: r.id, name: r.name, month: r.month || '-' });
    }
    matchResult.value = {
      total: rows.filter((r) => r.name).length,
      matched,
      mismatches,
    };
  } finally {
    matchLoading.value = false;
  }
}

function handleDownloadMatchErrors() {
  if (!matchResult.value?.mismatches.length) return;
  const headers = '姓名,考核月份,状态\n';
  const rows = matchResult.value.mismatches
    .map((r) => `"${r.name}","${r.month}","不匹配"`)
    .join('\n');
  const blob = new Blob(['\uFEFF' + headers + rows], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'driver_monthly_personnel_mismatch.csv';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

// ===================== 新增 / 编辑 / 查看 =====================
const formOpen = ref(false);
const formMode = ref<'create' | 'edit'>('create');
const formLoading = ref(false);
const editingId = ref<number | null>(null);
const formModel = reactive<Partial<SiteApi.DriverMonthly>>({
  month: '',
  name: '',
  department: '',
  personnelId: null,
  threeCheckManagement: 0,
  lampDirty: 0,
  lampFailure: 0,
  safetyMonitor: 0,
  fireManagement: 0,
  remark: '',
});

function resetForm() {
  Object.assign(formModel, {
    month: '',
    name: '',
    department: '',
    personnelId: null,
    threeCheckManagement: 0,
    lampDirty: 0,
    lampFailure: 0,
    safetyMonitor: 0,
    fireManagement: 0,
    remark: '',
  });
}
function openCreate() {
  resetForm();
  formModel.month = selectedMonth.value || currentMonth.value;
  formMode.value = 'create';
  editingId.value = null;
  formOpen.value = true;
}
function openEdit(row: SiteApi.DriverMonthly) {
  resetForm();
  formMode.value = 'edit';
  editingId.value = row.id;
  Object.assign(formModel, {
    month: row.month ?? '',
    name: row.name ?? '',
    department: row.department ?? '',
    personnelId: row.personnelId ?? null,
    threeCheckManagement: row.threeCheckManagement ?? 0,
    lampDirty: row.lampDirty ?? 0,
    lampFailure: row.lampFailure ?? 0,
    safetyMonitor: row.safetyMonitor ?? 0,
    fireManagement: row.fireManagement ?? 0,
    remark: row.remark ?? '',
  });
  formOpen.value = true;
}
function openView(row: SiteApi.DriverMonthly) {
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
    const payload: Partial<SiteApi.DriverMonthly> = { ...formModel };
    if (formMode.value === 'edit' && editingId.value != null) {
      await updateDriverMonthly(editingId.value, payload);
      message.success('更新成功');
    } else {
      await createDriverMonthly(payload);
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
async function onDelete(row: SiteApi.DriverMonthly) {
  try {
    await deleteDriverMonthly(row.id);
    message.success('删除成功');
    onRefresh();
  } catch {
    /* 拦截器已提示 */
  }
}

// ===================== 详情抽屉 =====================
const detailDrawerVisible = ref(false);
const currentRecord = ref<SiteApi.DriverMonthly | null>(null);

/** 驾驶员月度考核分 = 前几列之和：五项考核子项数值 + 三违列 */
function monthlyScore(row: any): number {
  const cols = ['threeCheckManagement', 'lampDirty', 'lampFailure', 'safetyMonitor', 'fireManagement'];
  const sub = cols.reduce((acc, key) => acc + (Number(row?.[key]) || 0), 0);
  return sub + threeViolationCount(row);
}

/**
 * 扣分明细居中 Modal（对齐「三违管理考核」数字明细样式）：
 * - 三违：逐条记录（日期/类型/原因/地点/车牌），每条计 1 分
 * - 手工列（三检/灯牌/灯具/监控/消防）：月度累计计数，暂无逐笔明细，附备注
 * 数字 >0 时点击弹出；考核分数列不点击（同三违管理考核）。
 */
const detailModalShow = ref(false);
const detailCol = ref<'threeViolation' | 'manual'>('threeViolation');
const detailRow = ref<SiteApi.DriverMonthly | null>(null);
const detailManualTitle = ref('');
const detailManualValue = ref(0);

function openThreeViolationDetail(row: SiteApi.DriverMonthly) {
  detailCol.value = 'threeViolation';
  detailRow.value = row;
  detailModalShow.value = true;
}
function openManualDetail(row: SiteApi.DriverMonthly, title: string, value: number) {
  detailCol.value = 'manual';
  detailRow.value = row;
  detailManualTitle.value = title;
  detailManualValue.value = value;
  detailModalShow.value = true;
}
function detailModalTitle(): string {
  return detailCol.value === 'threeViolation' ? '三违 · 扣分明细' : `${detailManualTitle.value} · 扣分明细`;
}

/** 三违明细项下钻：跳转「驾驶员违章记录」页，预选三违 Tab 并预填该驾驶员姓名（对齐交通安全档案累计扣分下钻） */
function jumpToViolationRecords() {
  const name = String(detailRow.value?.name || '').trim();
  if (!name) return;
  void router.push({ path: '/site/driver/violation', query: { tab: 'threeViolation', name } });
}

// ===================== 表格列 =====================
const columns = ref<VxeTableGridColumns>([
  { type: 'checkbox', width: 50, align: 'center', fixed: 'left' },
  { type: 'seq', title: '序号', width: 70, align: 'center' },
  { title: '姓名', field: 'name', minWidth: 110, align: 'center' },
  { title: '所属部门', field: 'department', minWidth: 140, align: 'center', showOverflow: 'tooltip' },
  { title: '三检表管理', field: 'threeCheckManagement', minWidth: 110, align: 'center', slots: { default: 'manual' } },
  { title: '灯牌污损', field: 'lampDirty', minWidth: 100, align: 'center', slots: { default: 'manual' } },
  { title: '灯具失效', field: 'lampFailure', minWidth: 100, align: 'center', slots: { default: 'manual' } },
  { title: '安全监控', field: 'safetyMonitor', minWidth: 100, align: 'center', slots: { default: 'manual' } },
  { title: '消防管理', field: 'fireManagement', minWidth: 100, align: 'center', slots: { default: 'manual' } },
  {
    title: '三违',
    field: 'threeViolationCount',
    minWidth: 90,
    align: 'center',
    slots: { default: 'threeViolationCount' },
    titleHelp: {
      content: '三违 = 选中考核月份下«驾驶员违章记录 › 三违扣分记录»的记录条数，每条记录计 1 分（非按「记分」取值）。',
    },
  },
  {
    title: '考核分数',
    field: 'monthlyScore',
    minWidth: 120,
    align: 'center',
    slots: { default: 'monthlyScore' },
    titleHelp: {
      content: '考核分数 = 三检表管理/灯牌污损/灯具失效/安全监控/消防管理五项数值 + 三违之和，>0 标橙警示。',
    },
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

onMounted(async () => {
  await onRefresh();
  // 首次进入：按花名册自动生成固定考核人员（后续导入花名册后再次进入会同步更新姓名）
  await syncFromRoster(selectedMonth.value || currentMonth.value);
  // 外部下钻定位：query.driver 设置关键字并高亮该驾驶员行（须在数据与月份确定后执行）
  applyDriverLocate();
});

// Tabbar keep-alive：页面被缓存后 onMounted 不再触发。再次从自动评分页下钻进入
// （query.month/driver 变化）时，重新定位并高亮目标驾驶员行。
watch(
  () => [route.query.month, route.query.driver],
  () => {
    applyDriverLocate();
  },
);
// keep-alive：每次标签页被重新激活（再次下钻进入）时，无论 query 是否变化都重新定位高亮
onActivated(() => {
  applyDriverLocate();
});
</script>

<template>
  <HsePageLayout
    :description="$t('page.hse.siteDriverMonthlyDesc')"
    :title="$t('page.hse.siteDriverMonthly')"
  >
    <template #extra>
      <NSpace>
        <NButton :loading="syncing" secondary @click="onSyncRoster">
          同步花名册人员
        </NButton>
        <HseActionBar
          :actions="{}"
          @refresh="onRefresh"
          @download-template="onImportTemplate"
          @import="() => (importOpen = true)"
          @create="openCreate"
        />
      </NSpace>
    </template>

    <!-- 考核月份下拉：选中月份决定列表数据（结构对齐 考核对象管理，为内容区第一个子元素） -->
    <div class="mb-4">
      <NSelect
        v-model:value="selectedMonth"
        placeholder="请选择考核月份"
        :options="monthOptions"
        style="max-width: 320px"
        @update:value="onMonthChange"
      />
    </div>

    <!-- 搜索 -->
    <HseSearchPanel @query="onSearch" @reset="onReset">
      <NGi>
        <NInput
          v-model:value="searchForm.keyword"
          placeholder="姓名"
          clearable
          @keyup.enter="onSearch"
        />
      </NGi>
      <NGi>
        <NInput v-model:value="searchForm.department" placeholder="所属部门" clearable @keyup.enter="onSearch" />
      </NGi>
    </HseSearchPanel>

    <!-- 定位模式提示条 -->
    <NAlert v-if="locateName" class="mb-4" :bordered="false" type="info" closable @close="exitLocateDriver">
      <template #header>
        <div class="flex items-center gap-2">
          <span>已定位驾驶员</span>
          <span v-if="locatedDriver">{{ locatedDriver?.name }}（{{ locatedDriver?.department || '-' }}）· {{ selectedMonth }} · 考核分 {{ monthlyScore(locatedDriver) }}</span>
          <span v-else>「{{ locateName }}」月内无记录</span>
        </div>
      </template>
    </NAlert>

    <!-- 表格 -->
    <HseDataGrid
      :columns="columns"
      :data="data"
      :loading="loading"
      :pager="false"
      :editable="false"
      :row-class-name="driverRowClassName"
    >
      <template #action="{ row }">
        <NSpace justify="center" :size="4">
          <NButton size="tiny" type="primary" quaternary @click="openView(row)">查看</NButton>
          <NButton size="tiny" type="primary" quaternary @click="openEdit(row)">编辑</NButton>
          <NPopconfirm @positive-click="onDelete(row)">
            <template #trigger>
              <NButton size="tiny" type="error" quaternary>删除</NButton>
            </template>
            确定删除该月度考核吗？
          </NPopconfirm>
        </NSpace>
      </template>
      <template #manual="{ row, column }">
        <NTag
          v-if="Number(row?.[column.field]) > 0"
          :bordered="false"
          size="small"
          type="warning"
          class="deduc-click"
          @click="openManualDetail(row as any, String(column?.title || ''), Number(row?.[column.field]) || 0)"
        >
          {{ row?.[column.field] ?? 0 }}
        </NTag>
        <NTag v-else :bordered="false" size="small" type="success">
          {{ row?.[column.field] ?? 0 }}
        </NTag>
      </template>
      <template #monthlyScore="{ row }">
        <NTag v-if="monthlyScore(row) > 0" :bordered="false" size="small" type="error">
          {{ monthlyScore(row) }}
        </NTag>
        <NTag v-else :bordered="false" size="small" type="success">{{ monthlyScore(row) }}</NTag>
      </template>
      <template #threeViolationCount="{ row }">
        <NTag
          v-if="threeViolationCount(row) > 0"
          :bordered="false"
          size="small"
          type="warning"
          class="deduc-click"
          @click="openThreeViolationDetail(row as any)"
        >
          {{ threeViolationCount(row) }}
        </NTag>
        <NTag v-else :bordered="false" size="small" type="success">{{ threeViolationCount(row) }}</NTag>
      </template>
    </HseDataGrid>

    <!-- 详情抽屉 -->
    <NDrawer v-model:show="detailDrawerVisible" :width="560">
      <NDrawerContent v-if="currentRecord" :title="`月度考核详情 #${currentRecord.id}`">
        <NDescriptions :column="1" bordered label-placement="left">
          <NDescriptionsItem label="考核月份">{{ currentRecord.month || '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="姓名">{{ currentRecord.name || '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="所属部门">{{ currentRecord.department || '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="三检表管理">{{ currentRecord.threeCheckManagement ?? 0 }}</NDescriptionsItem>
          <NDescriptionsItem label="灯牌污损">{{ currentRecord.lampDirty ?? 0 }}</NDescriptionsItem>
          <NDescriptionsItem label="灯具失效">{{ currentRecord.lampFailure ?? 0 }}</NDescriptionsItem>
          <NDescriptionsItem label="安全监控">{{ currentRecord.safetyMonitor ?? 0 }}</NDescriptionsItem>
          <NDescriptionsItem label="消防管理">{{ currentRecord.fireManagement ?? 0 }}</NDescriptionsItem>
          <NDescriptionsItem label="三违">{{ threeViolationCount(currentRecord) }}</NDescriptionsItem>
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

    <!-- 扣分明细居中 Modal（对齐「三违管理考核」明细：分项 + 合计） -->
    <NModal
      v-model:show="detailModalShow"
      preset="card"
      :title="detailModalTitle()"
      style="width: 460px; max-width: 92vw"
      :mask-closable="true"
    >
      <div v-if="detailRow" class="driver-monthly-breakdown">
        <div v-if="detailCol === 'threeViolation'">
          <div class="breakdown-preamble">
            {{ detailRow.name }} · {{ selectedMonth || '当月' }} · 共 {{ threeViolationCount(detailRow) }} 起（每条计 1 分）
          </div>
          <div v-if="violationDetailsOf(detailRow).length === 0" class="breakdown-empty">
            暂无明细记录
          </div>
          <div
            v-for="(v, i) in violationDetailsOf(detailRow)"
            :key="v.id"
            class="breakdown-item breakdown-item-clickable"
            title="点击查看该人三违记录"
            @click="jumpToViolationRecords()"
          >
            <div class="breakdown-main">
              <span class="breakdown-label">{{ i + 1 }}. {{ v.violationType || '未填违章类型' }}</span>
              <span class="breakdown-sub">{{ v.violationTime || '-' }}{{ v.violationLocation ? ` · 地点：${v.violationLocation}` : '' }}{{ v.plateNo ? ` · 车牌：${v.plateNo}` : '' }}</span>
              <span v-if="v.violationDesc" class="breakdown-sub">原因：{{ v.violationDesc }}</span>
            </div>
            <span class="breakdown-val">1 分</span>
          </div>
          <div class="breakdown-tip">点击明细项可查看该驾驶员的三违记录</div>
          <div class="breakdown-total">
            <span>合计</span>
            <span>{{ threeViolationCount(detailRow) }} 分</span>
          </div>
        </div>
        <div v-else>
          <div class="breakdown-item">
            <div class="breakdown-main">
              <span class="breakdown-label">{{ detailManualTitle }} · 月度累计计数</span>
              <span class="breakdown-sub">该项为月度累计计数，暂无逐笔扣分明细（日期/原因）。</span>
              <span v-if="detailRow.remark" class="breakdown-sub">备注：{{ detailRow.remark }}</span>
            </div>
            <span class="breakdown-val">{{ detailManualValue }} 分</span>
          </div>
          <div class="breakdown-total">
            <span>合计</span>
            <span>{{ detailManualValue }} 分</span>
          </div>
        </div>
      </div>
    </NModal>

    <!-- 新增 / 编辑 弹窗 -->
    <NModal
      v-model:show="formOpen"
      :title="formMode === 'create' ? '新增月度考核' : '编辑月度考核'"
      preset="card"
      style="width: 680px; max-width: 92vw"
      :mask-closable="false"
    >
      <NForm label-placement="top">
        <div class="grid grid-cols-2 gap-x-4">
          <NFormItem label="考核月份" required>
            <NInput v-model:value="formModel.month" placeholder="如 2026-08" />
          </NFormItem>
          <NFormItem label="姓名" required>
            <NInput v-model:value="formModel.name" placeholder="请输入姓名" />
          </NFormItem>
          <NFormItem label="所属部门">
            <NInput v-model:value="formModel.department" placeholder="请输入所属部门" />
          </NFormItem>
          <NFormItem label="三检表管理">
            <NInputNumber v-model:value="formModel.threeCheckManagement" :min="0" style="width: 100%" />
          </NFormItem>
          <NFormItem label="灯牌污损">
            <NInputNumber v-model:value="formModel.lampDirty" :min="0" style="width: 100%" />
          </NFormItem>
          <NFormItem label="灯具失效">
            <NInputNumber v-model:value="formModel.lampFailure" :min="0" style="width: 100%" />
          </NFormItem>
          <NFormItem label="安全监控">
            <NInputNumber v-model:value="formModel.safetyMonitor" :min="0" style="width: 100%" />
          </NFormItem>
          <NFormItem label="消防管理">
            <NInputNumber v-model:value="formModel.fireManagement" :min="0" style="width: 100%" />
          </NFormItem>
        </div>
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
              { title: '姓名', field: 'name', width: 120, align: 'center' },
              { title: '考核月份', field: 'month', width: 120, align: 'center' },
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
            所有已填姓名的月度考核均能在花名册中找到。
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

    <!-- 通用导入（driver-monthly 模块） -->
    <HseImportDialog
      v-model:open="importOpen"
      title="导入月度考核"
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
/* 外部下钻定位：高亮目标驾驶员行（来自三违考核页「驾驶员三违」列明细点击跳转） */
:deep(.vxe-body--row.driver-locate-row) {
  background: rgba(37, 99, 235, 0.14) !important;
}
:deep(.vxe-body--row.driver-locate-row .vxe-cell) {
  color: #1d4ed8;
  font-weight: 600;
}

/* 可点击数字标签（对齐「三违管理考核」deduc-click） */
.deduc-click {
  cursor: pointer;
  transition: filter 0.15s;
  &:hover {
    filter: brightness(1.15);
  }
}

/* 扣分明细弹窗 · 对齐「三违管理考核」分项+合计样式 */
.driver-monthly-breakdown {
  min-width: 260px;
}
.breakdown-preamble {
  margin-bottom: 8px;
  font-size: 13px;
  color: #4b5563;
}
.breakdown-item {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  padding: 5px 6px;
  border-radius: 4px;
}
.breakdown-main {
  min-width: 0;
  flex: 1;
}
.breakdown-label {
  display: block;
  font-size: 13px;
  line-height: 1.5;
  word-break: break-word;
}
.breakdown-sub {
  display: block;
  margin-top: 2px;
  font-size: 12px;
  color: var(--v-ben-muted-foreground, #6b7280);
  line-height: 1.4;
}
.breakdown-val {
  flex-shrink: 0;
  font-weight: 600;
  color: #d97706;
  font-variant-numeric: tabular-nums;
}
.breakdown-total {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  border-top: 1px dashed #d0d5dd;
  margin-top: 6px;
  padding: 6px 6px 0;
  font-weight: 600;
}
.breakdown-empty {
  padding: 12px 6px;
  text-align: center;
  color: #8a919f;
  font-size: 13px;
}
/* 违章明细项可点击下钻 */
.breakdown-item-clickable {
  cursor: pointer;
  transition: background-color 0.15s;
}
.breakdown-item-clickable:hover {
  background: rgba(37, 99, 235, 0.12);
  box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.35);
}
.breakdown-item-clickable:hover .breakdown-label {
  color: #1d4ed8;
}
.breakdown-tip {
  margin: 6px 6px 0;
  font-size: 12px;
  color: #8a919f;
}
</style>
