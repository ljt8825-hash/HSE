<script lang="ts" setup>
/**
 * 驾驶员扣分记录列表（web-naive · 驾驶员管理）
 * 同时作为「驾驶证扣分记录」与「三违扣分记录」两个 tab 的共用内容（两者一致）。
 *
 * 展示样式参照「扣分规则库 › 类别扣分上限」：
 * - 主表用 NDataTable（行 = 驾驶员，按姓名分组）
 * - 每行 cellRenderer 渲染行子表：
 *   列: # / 违章日期 / 违章事由 / 罚款 / 计分 / 操作（「处理状态」不再展示，仍保留在数据中用于「待处理」统计）
 *   底部虚线「＋ 添加违章」
 * - 行子表 NInput/NInputNumber 行内编辑
 * - 顶部按钮（按截图样式，共 5 个）：刷新 / 下载模板 / 导入 / 导出 / 新增（高亮 primary）
 *   - 「新增」= 弹模态选花名册姓名建大行（替代旧「＋ 增加行」）
 *   - 「导出」= 当前内存中全部违章明细 → xlsx（前端 exportExcel 工具，无后端）
 * - 底部操作栏：保存 / 人员匹配
 *   - 「保存」批量 upsert/delete（POST/PUT/DELETE），落库当前所有改动
 *   - 「人员匹配」= 按姓名查花名册，弹出不匹配清单
 * - 「只增不删」：已存在姓名不会被自动删除，用户主动 × / 删除整组 才落库
 *
 * 数据契约：server/routes/site-mgmt.js `/site-mgmt/driver-violations`
 * （单条 CRUD；每条违章=一条 DriverViolation record）
 */
import { computed, h, onMounted, reactive, ref } from 'vue';

import {
  NButton,
  NCheckbox,
  NDataTable,
  NDescriptions,
  NDescriptionsItem,
  NDrawer,
  NDrawerContent,
  NInput,
  NInputNumber,
  NModal,
  NPopconfirm,
  NSelect,
  NSpace,
  NSpin,
  NAlert,
} from 'naive-ui';
import { IconifyIcon } from '@vben/icons';

import {
  HseImportDialog,
  HseSearchPanel,
} from '#/components/hse';
import {
  createDriverViolation,
  deleteDriverViolation,
  getDriverViolationList,
  updateDriverViolation,
  createDriverThreeViolation,
  deleteDriverThreeViolation,
  getDriverThreeViolationList,
  updateDriverThreeViolation,
  type SiteApi,
} from '#/api/hse/site';
import { getProfileList, getRosterVersion } from '#/api/hse/employee-profile';
import { useGenericImport } from '#/views/hse/_shared/useGenericImport';
import { exportExcel } from '#/views/objectives/_shared/excel';
import { message } from '#/adapter/naive';

defineOptions({ name: 'SiteDriverViolationList' });

// nameOnly=true（三违扣分记录 tab）：数据源为独立表 driver_three_violation，
// 与"驾驶证扣分记录"（driver_violation）完全隔离；两者字段结构一致。
const props = withDefaults(defineProps<{ nameOnly?: boolean }>(), { nameOnly: false });

// ===================== 数据结构 =====================
type VItem = {
  _id: number | null;             // 已存在 record id；_new=true 时为 null
  _new: boolean;                  // 本次新增（未保存）
  _deleted?: boolean;             // 行子表 × 删除的临时标记（保存时真删）
  _dirty?: boolean;               // 字段被改动
  seq: number;                    // 行内序号（按违章时间升序）
  violationTime: string;
  violationDesc: string;
  fineAmount: number | null;
  demeritPoints: number | null;
  handleStatus: string;
  /** 已存在 record 的完整副本，保存时合并未在行子表暴露的字段 */
  _raw?: SiteApi.DriverViolation;
};

type VGroup = {
  name: string;
  personId: number | null;        // 匹配到的花名册 personId（仅用于标识）
  dept: string;                  // 所属部门（花名册带出，供姓名下方展示）
  departed: boolean;             // 是否离职驾驶员（离职不显示）
  total: number;                  // 该驾驶员下未删除条数
  pending: number;               // 未处理条数
  items: VItem[];
};

// ===================== 原始数据 =====================
const loading = ref(false);
const allRows = ref<SiteApi.DriverViolation[]>([]);
const groups = ref<VGroup[]>([]);

// 违章明细模块级内存缓存：驾驶证/三违扣分记录 tab 各自实例数据固定，进入页面/切换 tab
// 命中缓存时不重复请求对应接口；仅在保存/删除整组/导入及手动「刷新」时失效重拉。
let cachedViolationRows: SiteApi.DriverViolation[] | null = null;
function invalidateViolationCache() {
  cachedViolationRows = null;
}

// ===================== 驾驶员花名册（姓名下拉源） =====================
type DriverOption = { label: string; value: number; name: string; dept: string; departed: boolean };
const driverOptions = ref<DriverOption[]>([]);
/** 所属部门显示映射：xx镇 / xx镇片区 → xx镇乡镇作业中心；部门名为「车队」等保持不变 */
function mapRosterDept(raw?: string): string {
  if (!raw) return raw || '';
  const d = raw.trim();
  if (!d) return '';
  if (d.includes('车队')) return d;
  if (d.endsWith('片区')) return `${d.slice(0, -2)}乡镇作业中心`;
  if (/镇$/.test(d)) return `${d}乡镇作业中心`;
  return d;
}
/* 花名册名单本地缓存（页面刷新结构固定，仅花名册导入后版本变化才重拉） */
const ROSTER_CACHE_KEY = 'dv_roster_cache_v1';
type RosterCache = { version: string; list: DriverOption[] };
function readRosterCache(): RosterCache | null {
  try {
    const raw = localStorage.getItem(ROSTER_CACHE_KEY);
    if (!raw) return null;
    const val = JSON.parse(raw) as RosterCache;
    return val && Array.isArray(val.list) ? val : null;
  } catch {
    return null;
  }
}
function writeRosterCache(c: RosterCache) {
  try {
    localStorage.setItem(ROSTER_CACHE_KEY, JSON.stringify(c));
  } catch {
    /* 隐私模式/容量不足时静默忽略，退化为每次拉取 */
  }
}
async function loadDriverOptions() {
  try {
    // 花名册名单版本号：仅花名册导入导致司机名单/用工/离岗状态变化后版本才变。
    // 版本未变 → 直接用本地缓存名单（页面刷新不重新请求 getProfileList，结构固定在页面）。
    const ver = await getRosterVersion();
    const cached = readRosterCache();
    if (cached && cached.version === ver.version && cached.list.length) {
      driverOptions.value = cached.list;
      return;
    }
    const res = await getProfileList({ is_driver: true, pageSize: 9999 } as any);
    const list = ((res.list || []) as any[]).map((e) => ({
      label: e.dept_name ? `${e.name}（${mapRosterDept(e.dept_name)}）` : e.name,
      value: e.id,
      name: e.name,
      dept: mapRosterDept(e.dept_name),
      departed: e.status === '离职' || Boolean(e.leave_date) || (e as any).person_type === '已离职',
    }));
    driverOptions.value = list;
    writeRosterCache({ version: ver.version, list });
  } catch {
    // 版本接口失败时回退本地缓存，避免刷新后名单清空
    driverOptions.value = readRosterCache()?.list ?? [];
  }
}
/** 在册（在职）驾驶员选项：新增行下拉仅提供在职人员 */
const activeDriverOptions = computed(() => driverOptions.value.filter((d) => !d.departed));

// ===================== 加载 + 分组 =====================

async function loadData(force = false) {
  loading.value = true;
  try {
    // 驾驶证/三违扣分记录数据固定：命中缓存直接复用，避免每次进入页面/切换 tab 重复请求。
    // force=true（手动「刷新」或保存后）时才从库重拉并刷新缓存。
    let raw: SiteApi.DriverViolation[];
    if (force || cachedViolationRows === null) {
      // 数据源按 tab 隔离：三违扣分记录走独立接口（driver_three_violation 表），
      // 驾驶证扣分记录走原接口（driver_violation 表）——两者数据互不干扰。
      const res = props.nameOnly
        ? await getDriverThreeViolationList({ pageSize: 9999 } as any)
        : await getDriverViolationList({ pageSize: 9999 } as any);
      raw = (res.list || []) as SiteApi.DriverViolation[];
      cachedViolationRows = raw;
    } else {
      raw = cachedViolationRows;
    }
    allRows.value = raw;
    regroup();
  } catch {
    allRows.value = [];
    groups.value = [];
  } finally {
    loading.value = false;
  }
}

function recountGroup(g: VGroup) {
  const live = g.items.filter((it) => !it._deleted);
  live.forEach((it, i) => (it.seq = i + 1));
  g.total = live.length;
  g.pending = live.filter((it) => it.handleStatus === '待处理').length;
}

function regroup() {
  const map = new Map<string, VGroup>();
  // 1) 先按姓名聚合已有违章记录。
  //    姓名若匹配到当前驾驶员花名册则沿用其离职标记；
  //    若不在花名册（已从在职驾驶员名单移除，视为离职/非驾驶员）则标记为离职 → 姓名列不显示。
  for (const r of allRows.value) {
    const nm = (r.name || '').trim();
    if (!nm) continue;
    if (!map.has(nm)) {
      const matched = driverOptions.value.find((d) => d.name === nm);
      const isOut = !matched || Boolean(matched.departed);
      map.set(nm, { name: nm, personId: matched?.value ?? null, dept: matched?.dept ?? '', departed: isOut, total: 0, pending: 0, items: [] });
    }
    const g = map.get(nm)!;
    g.items.push({
      _id: r.id,
      _new: false,
      seq: 0,
      violationTime: r.violationTime || '',
      violationDesc: r.violationDesc || '',
      fineAmount: r.fineAmount ?? null,
      demeritPoints: r.demeritPoints ?? null,
      handleStatus: r.handleStatus || '待处理',
      _raw: r,
    });
  }
  // 2) 自动获取花名册驾驶员姓名（与「交通安全档案」一致）：名册中全部驾驶员都建立行，
  //    无违章则为空组（不落库，待用户点行内「＋ 添加违章」才创建记录）。
  for (const d of driverOptions.value) {
    const nm = (d.name || '').trim();
    if (!nm) continue;
    const existing = map.get(nm);
    if (!existing) {
      // 离职驾驶员不建立行（姓名列只显示在职人员）
      if (d.departed) continue;
      map.set(nm, { name: nm, personId: d.value ?? null, dept: d.dept ?? '', departed: false, total: 0, pending: 0, items: [] });
    } else {
      existing.personId = d.value ?? null;
      existing.dept = d.dept ?? '';
      existing.departed = d.departed ?? false;
    }
  }
  // 3) 排序：花名册姓名在前（按花名册顺序），花名册外的历史姓名在后
  const rosterNameSet = new Set(
    driverOptions.value.map((d) => (d.name || '').trim()).filter(Boolean),
  );
  const ordered: VGroup[] = [];
  for (const d of driverOptions.value) {
    const nm = (d.name || '').trim();
    if (!nm) continue;
    const g = map.get(nm);
    if (g) ordered.push(g);
  }
  for (const g of map.values()) {
    if (!rosterNameSet.has(g.name) && !g.departed) ordered.push(g);
  }
  // 3.1) 按「违章日期/违章明细是否有内容」排序：有违章明细的大行排前，无内容（空行）排后。
  //      判断依据为是否存在未删除且违章日期非空的违章项（用户口径：违章日期有内容在前）。
  //      Array.prototype.sort 稳定，故有内容/无内容两桶内仍保持花名册/原顺序。
  const hasViolation = (g: VGroup) =>
    g.items.some((it) => !it._deleted && !!String(it.violationTime || '').trim());
  ordered.sort((x, y) => Number(hasViolation(y)) - Number(hasViolation(x)));
  // 4) 各组分按违章时间升序，并重算统计（含空组）
  for (const g of ordered) {
    g.items.sort((a, b) => String(a.violationTime || '').localeCompare(String(b.violationTime || '')));
    recountGroup(g);
  }
  groups.value = ordered;
}

// ===================== 搜索 =====================
const searchForm = reactive({ keyword: '' });
function onReset() {
  searchForm.keyword = '';
}

const kwFilteredGroups = computed(() => {
  const kw = searchForm.keyword.trim().toLowerCase();
  if (!kw) return groups.value;
  return groups.value.filter((g) => g.name.toLowerCase().includes(kw));
});

// ===================== 「＋ 增加行」选择姓名 =====================
const addRowOpen = ref(false);
const addRowName = ref<string | null>(null);
function openAddRow() {
  addRowName.value = null;
  addRowOpen.value = true;
}
function confirmAddRow() {
  const nm = (addRowName.value || '').trim();
  if (!nm) {
    message.warning('请选择驾驶员');
    return;
  }
  if (groups.value.some((g) => g.name === nm)) {
    message.warning(`「${nm}」的违章记录已存在，请到对应行内「＋ 添加违章」补充`);
    addRowOpen.value = false;
    return;
  }
  const matched = driverOptions.value.find((d) => d.name === nm);
  const newGroup: VGroup = {
    name: nm,
    personId: matched?.value ?? null,
    dept: matched?.dept ?? '',
    departed: false,
    total: 1,
    pending: 1,
    items: [
      {
        _id: null,
        _new: true,
        _dirty: true,
        seq: 1,
        violationTime: '',
        violationDesc: '',
        fineAmount: null,
        demeritPoints: null,
        handleStatus: '待处理',
      },
    ],
  };
  // 新行插到顶部
  groups.value = [newGroup, ...groups.value];
  addRowOpen.value = false;
  message.success('已新增驾驶员行，请填写违章明细后保存');
}

// ===================== 行子表渲染器 =====================
function markDirty(item: VItem) {
  item._dirty = true;
}

function makeRuleItemsEditor(g: VGroup) {
  const refresh = () => {
    groups.value = groups.value.slice();
  };
  const header = h('div', { class: 'dv-rule-grid dv-rule-header' }, [
    h('span', { class: 'dv-rule-col-idx' }, '#'),
    h('span', { class: 'dv-rule-col-time' }, '违章日期'),
    h('span', { class: 'dv-rule-col-desc' }, '违章事由'),
    h('span', { class: 'dv-rule-col-fine' }, '罚款（元）'),
    h('span', { class: 'dv-rule-col-score' }, '计分'),
    h('span', { class: 'dv-rule-col-op' }, '操作'),
  ]);
  const rows = g.items.map((it, i) => {
    const deleted = !!it._deleted;
    // 已标记删除的行：灰显 + 输入禁用，直观反馈「待删除」；点右上角「保存」后才真正落库删除，可再点按钮撤销
    return h(
      'div',
      {
        class: ['dv-rule-grid', 'dv-rule-row', deleted ? 'dv-rule-row--deleted' : ''].filter(Boolean).join(' '),
        key: `ri-${g.name}-${i}-${it._id ?? 'n'}`,
      },
      [
        h('span', { class: 'dv-rule-col-idx' }, String(it.seq)),
        h(NInput, {
          class: 'dv-rule-col-time',
          value: it.violationTime,
          size: 'small',
          placeholder: 'YYYY-MM-DD HH:mm',
          disabled: deleted,
          'onUpdate:value': (v: string) => {
            it.violationTime = v;
            markDirty(it);
          },
        }),
        h(NInput, {
          class: 'dv-rule-col-desc',
          value: it.violationDesc,
          type: 'textarea',
          autosize: { minRows: 1, maxRows: 4 },
          size: 'small',
          placeholder: '如 超速、闯红灯',
          disabled: deleted,
          'onUpdate:value': (v: string) => {
            it.violationDesc = v;
            markDirty(it);
          },
        }),
        h(NInputNumber, {
          class: 'dv-rule-col-fine',
          value: it.fineAmount,
          min: 0,
          size: 'small',
          placeholder: '罚款',
          disabled: deleted,
          'onUpdate:value': (v: number | null) => {
            it.fineAmount = v == null ? null : v;
            markDirty(it);
          },
        }),
        h(NInputNumber, {
          class: 'dv-rule-col-score',
          value: it.demeritPoints,
          min: 0,
          size: 'small',
          placeholder: '记分',
          disabled: deleted,
          'onUpdate:value': (v: number | null) => {
            it.demeritPoints = v == null ? null : v;
            markDirty(it);
          },
        }),
        h(
          NButton,
          {
            class: 'dv-rule-col-op',
            size: 'tiny',
            quaternary: true,
            type: deleted ? 'default' : 'error',
            title: deleted ? '撤销删除' : '删除该条违章',
            onClick: () => {
              if (deleted) {
                // 撤销删除：恢复该条，保存时不再删除
                it._deleted = false;
                it._dirty = true;
              } else if (it._new && !it._id) {
                // 尚未保存的全新行：直接从 items 中移除
                g.items.splice(i, 1);
              } else {
                it._deleted = true;
                it._dirty = true;
              }
              recountGroup(g);
              refresh();
            },
          },
          { default: () => (deleted ? '↺' : '×') },
        ),
      ],
    );
  });
  const addBtn = h(
    NButton,
    {
      size: 'small',
      secondary: true,
      block: true,
      class: 'dv-rule-add-btn',
      onClick: () => {
        g.items.push({
          _id: null,
          _new: true,
          _dirty: true,
          seq: g.items.filter((x) => !x._deleted).length + 1,
          violationTime: '',
          violationDesc: '',
          fineAmount: null,
          demeritPoints: null,
          handleStatus: '待处理',
        });
        recountGroup(g);
        refresh();
      },
    },
    { default: () => '＋ 添加违章' },
  );
  const add = h('div', { class: 'dv-rule-add' }, addBtn);
  return h('div', { class: 'dv-rule-editor' }, [header, ...rows, add]);
}

// ===================== 整组删除 =====================
async function removeGroupRow(g: VGroup | undefined) {
  if (!g) return;
  const idsToDelete = g.items.filter((it) => !it._deleted && it._id).map((it) => it._id as number);
  // 本地先移除；若后端失败再 loadData 恢复
  groups.value = groups.value.filter((x) => x !== g);
  // 数据已变化：失效缓存，确保下次加载/刷新不会复用到被删记录
  invalidateViolationCache();
  if (!idsToDelete.length) {
    message.success(`已移除「${g.name}」的空组`);
    return;
  }
  let failed = 0;
  for (const id of idsToDelete) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await (props.nameOnly ? deleteDriverThreeViolation(id) : deleteDriverViolation(id));
    } catch {
      failed++;
    }
  }
  if (failed) {
    message.warning(`已本地移除，但服务端 ${failed} 条删除失败，请刷新后核对`);
    await loadData();
  } else {
    message.success(`已删除「${g.name}」的全部 ${idsToDelete.length} 条违章记录`);
  }
}

// ===================== 「保存」批量 upsert/delete =====================
const saving = ref(false);
function buildPayload(it: VItem, g: VGroup) {
  return {
    seq: it.seq,
    name: g.name,
    violationTime: it.violationTime,
    violationDesc: it.violationDesc,
    fineAmount: it.fineAmount ?? 0,
    demeritPoints: it.demeritPoints ?? 0,
    handleStatus: it.handleStatus,
    plateNo: it._raw?.plateNo ?? '',
    violationLocation: it._raw?.violationLocation ?? '',
    violationType: it._raw?.violationType ?? '',
    handleMethod: it._raw?.handleMethod ?? '',
    handleResult: it._raw?.handleResult ?? '',
    remark: it._raw?.remark ?? '',
  } as Partial<SiteApi.DriverViolation>;
}

async function saveAll() {
  saving.value = true;
  try {
    let created = 0, updated = 0, deleted = 0, failed = 0;
    for (const g of groups.value) {
      // 1) 标记 _deleted && _id → DELETE
      const toDelete = g.items.filter((x) => x._deleted && x._id);
      for (const it of toDelete) {
        try {
          // eslint-disable-next-line no-await-in-loop
          await (props.nameOnly ? deleteDriverThreeViolation(it._id as number) : deleteDriverViolation(it._id as number));
          deleted++;
        } catch {
          failed++;
        }
      }
      // 2) 新行（_new && !_deleted）→ POST
      const toCreate = g.items.filter((x) => x._new && !x._deleted);
      for (const it of toCreate) {
        try {
          // eslint-disable-next-line no-await-in-loop
          await (props.nameOnly ? createDriverThreeViolation(buildPayload(it, g)) : createDriverViolation(buildPayload(it, g)));
          created++;
        } catch {
          failed++;
        }
      }
      // 3) 已有 && 未删除 && 字段已变更 → PUT
      const toUpdate = g.items.filter((x) => x._id && !x._deleted && x._dirty);
      for (const it of toUpdate) {
        try {
          // eslint-disable-next-line no-await-in-loop
          await (props.nameOnly ? updateDriverThreeViolation(it._id as number, buildPayload(it, g)) : updateDriverViolation(it._id as number, buildPayload(it, g)));
          updated++;
        } catch {
          failed++;
        }
      }
    }
    if (failed) {
      message.warning(`保存完成：新建 ${created}、更新 ${updated}、删除 ${deleted}；失败 ${failed}`);
    } else {
      message.success(`保存完成：新建 ${created}、更新 ${updated}、删除 ${deleted}`);
    }
    // 数据已落库：失效缓存并强制重拉，保证驾驶证扣分记录与三违扣分记录的 tab 显示最新数据
    invalidateViolationCache();
    await loadData(true);
  } catch {
    /* 拦截器已提示 */
  } finally {
    saving.value = false;
  }
}

// ===================== 详情抽屉（行子表未暴露字段） =====================
const detailDrawerVisible = ref(false);
const currentRecords = ref<SiteApi.DriverViolation[]>([]);
const currentGroupName = ref('');
function openViewGroup(g: VGroup | undefined) {
  if (!g) return;
  currentGroupName.value = g.name;
  currentRecords.value = g.items
    .filter((it) => !it._deleted && it._raw)
    .map((it) => it._raw as SiteApi.DriverViolation);
  detailDrawerVisible.value = true;
}

// ===================== 拖拽排序 =====================
let dragFrom: number | null = null;
function rowProps(row: any) {
  return {
    class: 'dv-drag-row',
    ondragover: (e: DragEvent) => {
      e.preventDefault();
    },
    ondrop: (e: DragEvent) => {
      e.preventDefault();
      if (dragFrom == null) return;
      const to = groups.value.indexOf(row as VGroup);
      if (to < 0 || to === dragFrom) {
        dragFrom = null;
        return;
      }
      const arr = groups.value.slice();
      const [moved] = arr.splice(dragFrom, 1);
      if (!moved) {
        dragFrom = null;
        return;
      }
      arr.splice(to, 0, moved);
      groups.value = arr;
      dragFrom = null;
    },
  };
}

// ===================== 主表列 =====================
// 注：NDataTable 的 TableColumn 泛型擦除会让各 render 回调实参被推导为 VGroup | undefined，
// 在此采用 any[] 标注彻底避免列相关的类型污染（运行时 row 必为 VGroup）。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const columns: any = [
  {
    key: 'checked',
    width: 46,
    title: ' ',
    align: 'center',
    renderHeader: () => h(NCheckbox, { checked: false, disabled: true }),
    render: () => h(NCheckbox, { checked: false, disabled: true }),
  },
  {
    title: '序号',
    key: 'index',
    width: 60,
    align: 'center',
    render: (_r: any, i: number) => String(i + 1),
  },
  {
    title: '姓名',
    key: 'name',
    width: 170,
    align: 'center',
    render: (g: any) => {
      const grp = g as VGroup;
      return h('div', { class: 'dv-name-cell' }, [
        h('span', { class: 'dv-name-text' }, grp.name),
        grp.dept ? h('span', { class: 'dv-name-dept' }, grp.dept) : null,
      ]);
    },
  },
  {
    title: '违章明细',
    key: 'items',
    minWidth: 780,
    align: 'left',
    // 仅表头文字居中；单元格内为行子表编辑器，保持左对齐以便输入
    titleAlign: 'center',
    render: (g: any) => makeRuleItemsEditor(g as VGroup),
  },
  {
    key: 'drag',
    width: 50,
    title: '排序',
    align: 'center',
    render: (g: any) =>
      h('span', {
        class: 'dv-drag-handle',
        title: '拖动调整顺序',
        draggable: 'true',
        onDragstart: () => {
          dragFrom = groups.value.indexOf(g as VGroup);
        },
      }, '⠿'),
  },
  {
    title: '操作',
    key: 'op',
    width: 140,
    align: 'center',
    render: (g: any) => {
      const grp = g as VGroup;
      return h(NSpace, { justify: 'center', size: 4, wrap: false }, {
        default: () => [
          h(
            NButton,
            { size: 'small', type: 'primary', quaternary: true, onClick: () => openViewGroup(grp) },
            { default: () => '查看' },
          ),
          h(
            NPopconfirm,
            { onPositiveClick: () => removeGroupRow(grp) },
            {
              trigger: () =>
                h(
                  NButton,
                  { size: 'small', type: 'error', quaternary: true },
                  { default: () => '删除整组' },
                ),
              default: () => `确认删除「${grp.name}」的全部 ${grp.total} 条违章记录？此操作不可恢复。`,
            },
          ),
        ],
      });
    },
  },
];

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
} = useGenericImport(props.nameOnly ? 'driver-three-violation' : 'driver-violation');

async function onImportSuccess() {
  // 导入已落库：失效缓存并重拉，避免复用旧数据
  invalidateViolationCache();
  await loadData(true);
  await checkPersonnelMatch();
}
bindRefresh(onImportSuccess);
async function onRefresh() {
  // 手动「刷新」：违章明细强制从库重拉（刷新缓存）；
  // 花名册名单按版本比对：版本未变用本地缓存（不重拉 getProfileList），变了才更新。
  await loadDriverOptions();
  await loadData(true);
}

// ===================== 导出 =====================
function formatToday(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}
/**
 * 导出当前所有违章记录为 .xlsx。
 * 范围：内存中加载到的全部违章明细（不过滤当前筛选条件），按姓名 + 违章时间升序。
 * 纯前端调用 exportExcel（复用 objectives/_shared/excel 的 xlsx 工具），无需后端。
 *
 * 三违扣分记录（nameOnly）：导出表头对齐「司机交通安全专项行动档案表」档案表格式
 * （序号/日期/驾驶员姓名/违章类别/违章照片/违章行为描述/违规类型/违规等级/扣分值）。
 * 违规类型/违规等级/违章照片 暂不落库，导出时该三列留空。
 */
function onExport() {
  // 按组（姓名）→ 组内按违章时间升序 排好后逐行展开
  const sorted = [...groups.value].sort((a, b) => {
    // 花名册姓名在前（按 driverOptions 顺序），花名册外姓名排后
    const aIn = rosterNames.value.has(a.name) ? 0 : 1;
    const bIn = rosterNames.value.has(b.name) ? 0 : 1;
    if (aIn !== bIn) return aIn - bIn;
    return a.name.localeCompare(b.name, 'zh-Hans-CN');
  });

  let headers: string[];
  let rows: (string | number)[][] = [];
  if (props.nameOnly) {
    // 三违扣分记录 —— 档案表格式
    headers = [
      '序号',
      '日期',
      '驾驶员姓名',
      '违章类别',
      '违章照片',
      '违章行为描述',
      '违规类型',
      '违规等级',
      '扣分值',
    ];
    for (const g of sorted) {
      const items = g.items
        .filter((it) => !it._deleted)
        .slice()
        .sort((a, b) => String(a.violationTime || '').localeCompare(String(b.violationTime || '')));
      for (const it of items) {
        const raw = it._raw as SiteApi.DriverViolation | undefined;
        rows.push([
          rows.length + 1,
          it.violationTime || '',
          g.name,
          raw?.violationType || '',
          '',
          it.violationDesc || '',
          '',
          '',
          it.demeritPoints ?? '',
        ]);
      }
    }
  } else {
    // 驾驶证扣分记录 —— 原有明细格式
    headers = [
      '序号',
      '姓名',
      '违章日期',
      '违章事由',
      '罚款(元)',
      '计分',
      '处理状态',
      '车牌号',
      '违章地点',
      '违章类别',
      '处理方式',
      '处理结果',
      '备注',
    ];
    for (const g of sorted) {
      const items = g.items
        .filter((it) => !it._deleted)
        .slice()
        .sort((a, b) => String(a.violationTime || '').localeCompare(String(b.violationTime || '')));
      for (const it of items) {
        const raw = it._raw as SiteApi.DriverViolation | undefined;
        rows.push([
          rows.length + 1,
          g.name,
          it.violationTime || '',
          it.violationDesc || '',
          it.fineAmount ?? '',
          it.demeritPoints ?? '',
          it.handleStatus || '待处理',
          raw?.plateNo || '',
          raw?.violationLocation || '',
          raw?.violationType || '',
          raw?.handleMethod || '',
          raw?.handleResult || '',
          raw?.remark || '',
        ]);
      }
    }
  }
  exportExcel(`${props.nameOnly ? '三违扣分记录' : '驾驶员违章记录'}_${formatToday()}.xlsx`, [
    { name: '违章记录', data: [headers, ...rows] },
  ]);
  message.success(`已导出 ${rows.length} 条违章记录`);
}

// ===================== 人员匹配校验（按姓名查花名册） =====================
const rosterNames = ref<Set<string>>(new Set());
async function loadRosterNames() {
  // 复用已加载(可能来自本地缓存)的花名册名单：人员匹配仅以「在职驾驶员」为比对基准，
  // 离职驾驶员因此判为不匹配，两个 tab 复用同一组件自动一致。
  rosterNames.value = new Set(
    driverOptions.value
      .filter((d) => !d.departed)
      .map((d) => d.name)
      .filter(Boolean),
  );
}
const matchVisible = ref(false);
const matchLoading = ref(false);
const matchResult = ref<{ total: number; matched: number; mismatches: { name: string; items: number }[] } | null>(null);
async function checkPersonnelMatch() {
  matchLoading.value = true;
  matchVisible.value = true;
  try {
    await loadRosterNames();
    const mismatches: { name: string; items: number }[] = [];
    let matched = 0;
    let totalNames = 0;
    for (const g of groups.value) {
      totalNames++;
      if (rosterNames.value.has(g.name)) matched++;
      else mismatches.push({ name: g.name, items: g.total });
    }
    matchResult.value = { total: totalNames, matched, mismatches };
  } finally {
    matchLoading.value = false;
  }
}
function handleDownloadMatchErrors() {
  if (!matchResult.value?.mismatches.length) return;
  const headers = '姓名,违章条数,状态\n';
  const rows = matchResult.value.mismatches.map((r) => `"${r.name}",${r.items},"不匹配"`).join('\n');
  const blob = new Blob(['\uFEFF' + headers + rows], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'driver_violation_personnel_mismatch.csv';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

onMounted(async () => {
  // 进入页面：命中缓存则复用驾驶证违规明细（数据固定、不重复加载）；
  // 手动「刷新」按钮才会强制从库重拉。花名册按版本决定用缓存或重拉。
  await loadDriverOptions();
  await loadData();
});
</script>

<template>
  <div class="dv-page">
    <div class="dv-toolbar dv-toolbar-row">
      <NSpace class="dv-toolbar-left">
        <NButton size="small" quaternary @click="onRefresh">
          <template #icon><IconifyIcon icon="lucide:refresh-cw" /></template>
          刷新
        </NButton>
        <NButton size="small" quaternary @click="onImportTemplate">
          <template #icon><IconifyIcon icon="lucide:file-down" /></template>
          下载模板
        </NButton>
        <NButton size="small" quaternary @click="() => (importOpen = true)">
          <template #icon><IconifyIcon icon="lucide:upload" /></template>
          导入
        </NButton>
        <NButton size="small" quaternary @click="onExport">
          <template #icon><IconifyIcon icon="lucide:download" /></template>
          导出
        </NButton>
        <NButton type="success" size="small" @click="openAddRow">
          <template #icon><IconifyIcon icon="lucide:plus" /></template>
          新增
        </NButton>
      </NSpace>
      <NSpace justify="end">
        <NButton size="small" quaternary :loading="matchLoading" @click="checkPersonnelMatch">
          <template #icon><IconifyIcon icon="lucide:user-check" /></template>
          人员匹配
        </NButton>
        <NButton size="small" type="primary" :loading="saving" @click="saveAll">
          <template #icon><IconifyIcon icon="lucide:save" /></template>
          保存
        </NButton>
      </NSpace>
    </div>

    <NAlert v-if="nameOnly" type="info" class="mb-3">
      三违扣分记录：驾驶证违章明细数据已清空（列仍保留），可在各行「＋ 添加违章」补录三违扣分。
    </NAlert>

    <HseSearchPanel @query="() => {}" @reset="onReset">
      <NInput
        v-model:value="searchForm.keyword"
        placeholder="按姓名过滤（仅展示该驾驶员的所有违章）"
        clearable
        @keyup.enter="() => {}"
      />
    </HseSearchPanel>

    <NDataTable
      class="dv-table"
      :remote="false"
      :data="kwFilteredGroups"
      :columns="columns"
      :loading="loading"
      :pagination="false"
      :max-height="640"
      :bordered="false"
      :single-line="false"
      :row-key="(row: VGroup) => row.name"
      :row-props="rowProps"
    />
    <div class="dv-tip">
      行=驾驶员（进入页面自动按花名册带出全部驾驶员姓名，无违章者显示空行，点「＋ 添加违章」补录）；行内字段编辑后点右上角「保存」批量落库（POST 新建 / PUT 修改 / DELETE 删除）。拖动「⠿」手柄调整大行顺序。删除整组会删该驾驶员下所有违章（不可恢复，属「人工删除」）。花名册外已存在的姓名不会被自动删除。导入仍按单条 7 列入库后自动按姓名聚合。
    </div>

    <!-- 详情：行子表未暴露字段（车牌/地点/类别/方式/结果/备注） -->
    <NDrawer v-model:show="detailDrawerVisible" :width="560">
      <NDrawerContent :title="`${currentGroupName} · 违章记录详情（行子表未展示字段）`">
        <NSpace vertical :size="16">
          <div v-for="(r, ri) in currentRecords" :key="r.id">
            <h4 class="dv-detail-title">第 {{ ri + 1 }} 条 · {{ r.violationTime || '-' }}</h4>
            <NDescriptions :column="1" bordered size="small" label-placement="left">
              <NDescriptionsItem label="车牌号">{{ r.plateNo || '-' }}</NDescriptionsItem>
              <NDescriptionsItem label="违章地点">{{ r.violationLocation || '-' }}</NDescriptionsItem>
              <NDescriptionsItem label="违章类别">{{ r.violationType || '-' }}</NDescriptionsItem>
              <NDescriptionsItem label="处理方式">{{ r.handleMethod || '-' }}</NDescriptionsItem>
              <NDescriptionsItem label="处理结果">{{ r.handleResult || '-' }}</NDescriptionsItem>
              <NDescriptionsItem label="备注">{{ r.remark || '-' }}</NDescriptionsItem>
            </NDescriptions>
          </div>
        </NSpace>
      </NDrawerContent>
    </NDrawer>

    <!-- 选择姓名新增整组 -->
    <NModal
      v-model:show="addRowOpen"
      preset="card"
      title="新增驾驶员违章记录"
      style="width: 460px"
    >
      <NSpace vertical>
        <span class="dv-tip">从驾驶员花名册中选择姓名，新行将插入到顶部（拖动可调整顺序）。如该姓名已存在，请直接点对应行「＋ 添加违章」。</span>
        <NSelect
          v-model:value="addRowName"
          :options="activeDriverOptions"
          label-field="label"
          value-field="name"
          filterable
          clearable
          placeholder="选择驾驶员姓名"
        />
      </NSpace>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="addRowOpen = false">取消</NButton>
          <NButton type="primary" @click="confirmAddRow">确定</NButton>
        </NSpace>
      </template>
    </NModal>

    <!-- 人员匹配校验弹窗 -->
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
            匹配 {{ matchResult.matched }} 个驾驶员姓名，不匹配 {{ matchResult.mismatches.length }} 个（共 {{ matchResult.total }} 个大行）。
          </NAlert>
          <NDataTable
            v-if="matchResult.mismatches.length > 0"
            class="dv-table"
            :remote="false"
            :columns="[
              { title: '姓名', key: 'name', width: 180, align: 'center' },
              { title: '违章条数', key: 'items', width: 120, align: 'center' },
              { title: '状态', key: 'status', width: 100, align: 'center' },
            ]"
            :data="matchResult.mismatches"
            :pagination="false"
          />
          <NAlert v-else type="success" title="全部匹配">所有驾驶员均在花名册中。</NAlert>
        </template>
      </NSpin>
      <template #footer>
        <NSpace justify="end">
          <NButton v-if="matchResult?.mismatches.length" secondary @click="handleDownloadMatchErrors">
            下载不匹配记录
          </NButton>
          <NButton type="primary" @click="matchVisible = false">关闭</NButton>
        </NSpace>
      </template>
    </NModal>

    <!-- 通用导入（driver-violation 模块） -->
    <HseImportDialog
      v-model:open="importOpen"
      title="导入驾驶员违章记录"
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
  </div>
</template>

<style>
/* 行子表（与「扣分规则库 › 类别扣分上限」的 cat-rule-* 同形，局部化类名前缀 dv- 避免冲突） */
.dv-page {
  display: block;
}
.dv-toolbar {
  margin-bottom: 12px;
}
/* 左上工具区 与 右下「人员匹配 / 保存」分居两端，使两按钮位于右上角 */
.dv-toolbar-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.dv-rule-editor {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 680px;
}
.dv-rule-grid {
  display: grid;
  grid-template-columns: 36px minmax(140px, 1fr) minmax(280px, 2.4fr) 110px 110px 36px;
  align-items: start;
  gap: 6px;
}
.dv-rule-header {
  padding: 2px 2px 4px;
  font-size: 12px;
  font-weight: 600;
  color: #909399;
}
/* 行子表列名（表头）居中显示 */
.dv-rule-header > span {
  text-align: center;
}
.dv-rule-row {
  padding: 2px;
}
/* 已标记删除（待保存落库）的违章行：灰显 + 输入删除线，直观反馈删除动作；操作列保持可点击以支持撤销 */
.dv-rule-row--deleted {
  opacity: 0.45;
  background: #fde8e8;
  border-radius: 4px;
}
.dv-rule-row--deleted .dv-rule-col-op {
  opacity: 1;
}
.dv-rule-row--deleted .n-input,
.dv-rule-row--deleted .n-input-number {
  text-decoration: line-through;
}
.dv-rule-col-idx {
  color: #909399;
  font-size: 12px;
  text-align: center;
}
.dv-rule-add-btn {
  border-style: dashed;
  border-width: 1px;
}
.dv-name-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}
.dv-name-text {
  font-weight: 600;
}
.dv-name-dept {
  font-size: 12px;
  color: #909399;
}
.dv-tip {
  font-size: 12px;
  color: #909399;
  margin-top: 6px;
  line-height: 1.6;
}
.dv-detail-title {
  margin: 0 0 6px 0;
  color: #18a058;
  font-size: 13px;
}
/* 整表内容居中（行子表区不强制居中以保留左对齐输入态） */
.dv-table .n-data-table-td,
.dv-table .n-data-table-th {
  text-align: center;
}
.dv-table .n-data-table-td .dv-rule-grid {
  text-align: left;
}
.dv-table .n-data-table-td .n-input__input-el,
.dv-table .n-data-table-td .n-input-number .n-input__input-el {
  text-align: center;
}
/* 拖动行 */
.dv-drag-row:hover {
  background: rgba(24, 160, 88, 0.04);
}
.dv-drag-handle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  color: #909399;
  font-size: 16px;
  line-height: 1;
  user-select: none;
  cursor: grab;
}
.dv-drag-handle:active {
  cursor: grabbing;
}
.dv-drag-row:hover .dv-drag-handle {
  color: #18a058;
  background: rgba(24, 160, 88, 0.08);
}
</style>
