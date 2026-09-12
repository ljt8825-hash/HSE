<script lang="ts" setup>
/**
 * 考核扣分规则库管理（web-naive · 一期规则引擎配置端）
 * 能力：统计卡（总数/已启用/四类扣分方式/自动手动/子项行数）+ 服务端分页列表
 *     （类别·触发方式·扣分方式·状态·关键词筛选）+ 新建/编辑（主表单 + 明细子项 + 条件）
 *     + 启停 + 查看 + 删除。
 * 契约：server/routes/hse-assessment-rule.js + api/hse/assessment-rule.ts。
 */
import { computed, h, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { $t } from '#/locales';
import type { VxeTableGridColumns } from '#/adapter/vxe-table';

import {
  NButton,
  NCascader,
  NCheckbox,
  NDrawer,
  NDrawerContent,
  NDescriptions,
  NDescriptionsItem,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NModal,
  NPopconfirm,
  NRadioButton,
  NRadioGroup,
  NSelect,
  NSpace,
  NSwitch,
  NSpin,
  NTabPane,
  NTabs,
  NTag,
  NTooltip,
  NDataTable,
  NTreeSelect,
} from 'naive-ui';

import { HseActionBar, HseDataGrid, HsePageLayout, HseSearchPanel, HseStatCard, HseStatusTag } from '#/components/hse';
import {
  createAssessmentRule,
  deleteAssessmentRule,
  getAssessmentRuleCategories,
  getAssessmentRuleDetail,
  getAssessmentRuleList,
  getAssessmentRuleStats,
  importRuleDetails,
  updateAssessmentRule,
  updateAssessmentRuleStatus,
  getCategoryLimits,
  updateCategoryLimits,
  type CategoryLimitApi,
  type AssessmentRuleApi,
} from '#/api/hse/assessment-rule';
import { message } from '#/adapter/naive';

defineOptions({ name: 'AssessmentRuleManagement' });

const loading = ref(false);

// ---- 类别扣分上限（Tab2）----
const activeTab = ref('rules');
const catLimits = ref<CategoryLimitApi.CategoryLimit[]>([]);
const catLoading = ref(false);
const catSaving = ref(false);

const catChecked = ref<Set<any>>(new Set());
const allCatChecked = computed(() => catLimits.value.length > 0 && catChecked.value.size >= catLimits.value.length);
const partCatChecked = computed(() => catChecked.value.size > 0 && catChecked.value.size < catLimits.value.length);

function toggleAllCat(checked: boolean) {
  catChecked.value = checked ? new Set(catLimits.value.map((r) => r)) : new Set();
}

// ---- 类别扣分上限：行编辑模式 ----
const editingKey = ref(-1);
let editBackup: any = null;
const isEditing = (index: number) => index === editingKey.value;

function startEdit(index: number) {
  if (index < 0 || index >= catLimits.value.length) return;
  editBackup = JSON.parse(JSON.stringify(catLimits.value[index]));
  editingKey.value = index;
  ensureRuleItems(catLimits.value[index]);
  catLimits.value = catLimits.value.slice(); // 触发 NDataTable 重渲染
}
function cancelEdit() {
  if (editingKey.value >= 0 && editBackup) {
    catLimits.value[editingKey.value] = editBackup;
  }
  editingKey.value = -1;
  editBackup = null;
  catLimits.value = catLimits.value.slice();
}
async function saveRowEdit() {
  editingKey.value = -1;
  editBackup = null;
  catLimits.value = catLimits.value.slice();
  // 行内「保存」即时持久化整表（后端为全量替换 + 改名/规则名同步）
  await saveCatLimits();
}

// ---- 「规则名称」表单数组编辑器：镜像「表单数组 Demo」（图片式联系人列表）----
// 每个类别下的规则以行子表呈现：#/考核内容/扣分/状态/操作，底部虚线「＋ 添加」。
// 每行数据为 _ruleItems（考核内容 name / 扣分 deductScore / 状态 status），保存时整表持久化。
const RULE_NAME_SEP = /[、,，]/;
function splitRuleNames(str: any): string[] {
  return String(str ?? '')
    .split(RULE_NAME_SEP)
    .map((s) => s.trim())
    .filter(Boolean);
}
function ensureRuleItems(row: any): CategoryLimitApi.CategoryRuleItem[] {
  if (Array.isArray(row._ruleItems)) return row._ruleItems;
  const normalize = (x: any) => ({
    name: String(x?.name ?? '').trim(),
    deductScore: x?.deductScore == null ? null : Number(x.deductScore),
    status: x?.status === 'disabled' ? ('disabled' as const) : ('enabled' as const),
  });
  const stored = Array.isArray(row.ruleItems) ? row.ruleItems : null;
  if (stored && stored.length) {
    row._ruleItems = stored.map(normalize);
  } else {
    const storedNames = splitRuleNames(row.ruleNames);
    const derivedNames = Array.isArray(row.ruleNamesDerived) ? row.ruleNamesDerived : [];
    const scores = Array.isArray(row.ruleScoresDerived) ? row.ruleScoresDerived : [];
    const statuses = Array.isArray(row.ruleStatusesDerived) ? row.ruleStatusesDerived : [];
    const src = storedNames.length ? storedNames : derivedNames;
    row._ruleItems = (src.length ? src.map((name, i) => ({
      name: String(name || '').trim(),
      deductScore: scores[i] == null ? null : Number(scores[i]),
      status: statuses[i] === 'disabled' ? ('disabled' as const) : ('enabled' as const),
    })) : [{ name: '', deductScore: null, status: 'enabled' as const }])
      .map(normalize);
  }
  // 始终保留至少一行便于直接填写
  if (!row._ruleItems.length) row._ruleItems.push({ name: '', deductScore: null, status: 'enabled' });
  return row._ruleItems;
}

function makeRuleItemsEditor(row: any) {
  const items = ensureRuleItems(row);
  const header = h('div', { class: 'cat-rule-grid cat-rule-header' }, [
    h('span', { class: 'cat-rule-col-idx' }, '#'),
    h('span', { class: 'cat-rule-col-name' }, '考核内容'),
    h('span', { class: 'cat-rule-col-score' }, '扣分'),
    h('span', { class: 'cat-rule-col-status' }, '状态'),
    h('span', { class: 'cat-rule-col-op' }, '操作'),
  ]);
  const refresh = () => {
    catLimits.value = catLimits.value.slice(); // 触发 NDataTable 重渲染
  };
  const rows = items.map((it, i) =>
    h('div', { class: 'cat-rule-grid cat-rule-row', key: `ri-${i}` }, [
      h('span', { class: 'cat-rule-col-idx' }, String(i + 1)),
      h(NInput, {
        class: 'cat-rule-col-name',
        value: it.name,
        size: 'small',
        placeholder: `第 ${i + 1} 行考核内容`,
        'onUpdate:value': (v: string) => {
          it.name = v;
        },
      }),
      h(NInputNumber, {
        class: 'cat-rule-col-score',
        value: it.deductScore,
        min: 0,
        step: 0.5,
        size: 'small',
        placeholder: '扣分',
        'onUpdate:value': (v: number | null) => {
          it.deductScore = v == null ? null : v;
        },
      }),
      h(
        NSwitch,
        {
          class: 'cat-rule-col-status',
          value: it.status === 'enabled',
          checkedValue: true,
          uncheckedValue: false,
          'onUpdate:value': (v: boolean) => {
            it.status = v ? 'enabled' : 'disabled';
          },
        },
        { checked: () => '启用', unchecked: () => '停用' },
      ),
      h(
        NButton,
        {
          class: 'cat-rule-col-op',
          size: 'tiny',
          quaternary: true,
          type: 'error',
          title: '删除该行',
          onClick: () => {
            items.splice(i, 1);
            refresh();
          },
        },
        { default: () => '×' },
      ),
    ]),
  );
  const add = h(
    'div',
    { class: 'cat-rule-add' },
    h(
      NButton,
      {
        size: 'small',
        secondary: true,
        block: true,
        class: 'cat-rule-add-btn',
        onClick: () => {
          items.push({ name: '', deductScore: null, status: 'enabled' });
          refresh();
        },
      },
      { default: () => '＋ 添加' },
    ),
  );
  return h('div', { class: 'cat-rule-editor' }, [header, ...rows, add]);
}

// 规则名称下拉数据源：取「类别扣分上限」中该类别下每行规则的「考核内容」
const ruleNameOptions = computed(() => {
  const row = catLimits.value.find((c: any) => c.category === form.category);
  if (!row) return [];
  const seen = new Set<string>();
  return ensureRuleItems(row)
    .map((it) => String(it.name || '').trim())
    .filter((n) => n && !seen.has(n) && (seen.add(n), true))
    .map((n) => ({ label: n, value: n }));
});

const catColumns = [
  {
    key: 'checked',
    width: 46,
    title: ' ',
    align: 'center',
    renderHeader: () =>
      h(NCheckbox, {
        checked: allCatChecked.value,
        indeterminate: partCatChecked.value,
        onUpdateChecked: (v: boolean) => toggleAllCat(v),
      }),
    render: (row: any) =>
      h(NCheckbox, {
        checked: catChecked.value.has(row),
        onUpdateChecked: (v: boolean) => {
          if (v) catChecked.value.add(row);
          else catChecked.value.delete(row);
        },
      }),
  },
  {
    title: '序号',
    key: 'index',
    width: 60,
    align: 'center',
    render: (_row: any, index: number) => String(index + 1),
  },
  {
    title: '类别',
    key: 'category',
    width: 190,
    align: 'center',
    render: (row: any, index: number) =>
      isEditing(index)
        ? h(NInput, {
            value: row.category,
            placeholder: '请输入类别（可新增）',
            'onUpdate:value': (v: string) => {
              row.category = v;
            },
          })
        : h('span', { class: 'cat-cell-text' }, row.category || ''),
  },
  {
    title: '扣分上限（分）',
    key: 'maxDeduct',
    width: 190,
    align: 'center',
    render: (row: any, index: number) =>
      isEditing(index)
        ? h(NInputNumber, {
            value: row.maxDeduct,
            min: 0,
            step: 0.5,
            placeholder: '不设上限',
            style: 'width: 76px',
            'onUpdate:value': (v: number | null) => {
              row.maxDeduct = v == null ? null : v;
            },
          })
        : h('span', { class: 'cat-cell-text' }, row.maxDeduct ?? '不设上限'),
  },
  {
    title: '规则名称',
    key: 'ruleNames',
    minWidth: 500,
    align: 'center',
    render: (row: any) => makeRuleItemsEditor(row),
  },
  {
    key: 'drag',
    width: 60,
    title: '排序',
    align: 'center',
    render: (row: any) =>
      h('span', {
        class: 'cat-drag-handle',
        title: '拖动调整顺序',
        draggable: 'true',
        onDragstart: () => {
          catDragFrom = catLimits.value.indexOf(row);
        },
      }, '⠿'),
  },
  {
    title: '操作',
    key: 'op',
    width: 150,
    render: (row: any, index: number) => {
      if (isEditing(index)) {
        return h(NSpace, { justify: 'center', size: 4, wrap: false }, {
          default: () => [
            h(NButton, { size: 'small', type: 'primary', quaternary: true, onClick: () => saveRowEdit() }, { default: () => '保存' }),
            h(NButton, { size: 'small', quaternary: true, onClick: () => cancelEdit() }, { default: () => '取消' }),
          ],
        });
      }
      return h(NSpace, { justify: 'center', size: 4, wrap: false }, {
        default: () => [
          h(NButton, { size: 'small', type: 'primary', quaternary: true, onClick: () => startEdit(index) }, { default: () => '编辑' }),
          h(
            NPopconfirm,
            { onPositiveClick: () => removeCategoryRow(row) },
            {
              trigger: () =>
                h(NButton, { size: 'small', type: 'error', quaternary: true }, { default: () => '删除' }),
              default: () => `确认删除「${row.category || '未命名类别'}」的类别扣分上限？删除后不可恢复。`,
            },
          ),
        ],
      });
    },
  },
];

function addCategoryRow() {
  catLimits.value.push({
    id: null,
    category: '',
    maxDeduct: null,
    remark: null,
    ruleCount: null,
    ruleTotal: 0,
    ruleEnabled: 0,
    ruleNames: null,
    originalCategory: null,
    ruleItems: [],
    _ruleItems: [{ name: '', deductScore: null, status: 'enabled' }],
  });
  editingKey.value = catLimits.value.length - 1;
  editBackup = JSON.parse(JSON.stringify(catLimits.value[editingKey.value]));
  catLimits.value = catLimits.value.slice();
}

async function removeCategoryRow(row: any) {
  catChecked.value.delete(row);
  catLimits.value = catLimits.value.filter((x) => x !== row);
  editingKey.value = -1;
  editBackup = null;
  // 删除为破坏性操作：移除后立即整表保存，避免刷新后删除行又恢复
  await saveCatLimits();
}

let catDragFrom: number | null = null;
function catRowProps(_row: any) {
  return {
    class: 'cat-drag-row',
    ondragover: (e: DragEvent) => {
      e.preventDefault();
    },
    ondrop: (e: DragEvent) => {
      e.preventDefault();
      if (catDragFrom == null) return;
      const to = catLimits.value.indexOf(_row);
      if (to < 0 || to === catDragFrom) {
        catDragFrom = null;
        return;
      }
      const arr = catLimits.value.slice();
      const [moved] = arr.splice(catDragFrom, 1);
      arr.splice(to, 0, moved);
      catLimits.value = arr;
      catDragFrom = null;
    },
  };
}

async function batchDeleteCategoryRows() {
  if (!catChecked.value.size) return;
  const del = new Set(catChecked.value);
  catLimits.value = catLimits.value.filter((r) => !del.has(r));
  catChecked.value.clear();
  editingKey.value = -1;
  editBackup = null;
  // 与单行删除一致：删除后立即整表保存，刷新后不再恢复
  await saveCatLimits();
}

async function loadCategoryLimits() {
  catLoading.value = true;
  try {
    const res = await getCategoryLimits();
    catLimits.value = (Array.isArray(res) ? res : []).map((r) => ({
      ...r,
      ruleCount: r.ruleCount ?? (r.ruleTotal > 0 ? r.ruleTotal : null),
      ruleNames: r.ruleNames ?? (r.ruleNamesDerived && r.ruleNamesDerived.length ? r.ruleNamesDerived.join('、') : null),
      originalCategory: r.category,
      _ruleItems: undefined, // 惰性构建；优先取 ruleItems，其次由 ruleNames/派生数组回填
    }));
  } catch (e: any) {
    message.error(e.message || '加载类别上限失败');
  } finally {
    catLoading.value = false;
  }
}

async function saveCatLimits() {
  catSaving.value = true;
  try {
    const payload = catLimits.value
      .filter((c) => String(c.category || '').trim())
      .map((c) => {
        const items = ensureRuleItems(c)
          .map((it) => ({
            name: String(it.name || '').trim(),
            deductScore: it.deductScore == null ? null : Number(it.deductScore),
            status: it.status === 'disabled' ? ('disabled' as const) : ('enabled' as const),
          }))
          .filter((it) => it.name);
        return {
          category: c.category,
          maxDeduct: c.maxDeduct,
          ruleCount: c.ruleCount,
          ruleNames: items.length ? items.map((it) => it.name).join('、') : null,
          ruleItems: items.length ? items : undefined,
          remark: c.remark,
          originalCategory: c.originalCategory,
        };
      });
    await updateCategoryLimits(payload);
    message.success('类别扣分上限已保存');
    await loadCategoryLimits();
    // 需求：类别/规则名称改动后自动同步到「扣分规则」列表，保存后刷新规则数据与统计
    await Promise.all([loadData(), loadStats(), loadCategories()]);
  } catch (e: any) {
    message.error(e.message || '保存失败');
  } finally {
    catSaving.value = false;
  }
}
const saving = ref(false);
const dataSource = ref<AssessmentRuleApi.AssessmentRule[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);

const searchForm = reactive({
  keyword: '',
  category: undefined as string | undefined,
  trigger_type: undefined as string | undefined,
  deduct_type: undefined as string | undefined,
  status: undefined as string | undefined,
});

const categoryOptions = ref<{ label: string; value: string }[]>([]);

const triggerOptions = [
  { label: '自动', value: 'auto' },
  { label: '人工', value: 'manual' },
];
const deductTypeOptions = [
  { label: '固定', value: 'fixed' },
  { label: '累计', value: 'cumulative' },
  { label: '明细', value: 'detail' },
  { label: '阶梯', value: 'tiered' },
];
const statusOptions = [
  { label: '启用', value: 'enabled' },
  { label: '停用', value: 'disabled' },
];
const operatorOptions = [
  { label: '等于', value: 'eq' },
  { label: '不等于', value: 'ne' },
  { label: '大于', value: 'gt' },
  { label: '大于等于', value: 'gte' },
  { label: '小于', value: 'lt' },
  { label: '小于等于', value: 'lte' },
  { label: '包含', value: 'contains' },
  { label: '为空', value: 'is_null' },
];

const DEDUCT_TEXT: Record<string, string> = { fixed: '固定', cumulative: '累计', detail: '明细', tiered: '阶梯' };
const DEDUCT_TAG: Record<string, 'info' | 'primary' | 'warning' | 'success'> = {
  fixed: 'info',
  cumulative: 'primary',
  detail: 'warning',
  tiered: 'success',
};
const STATUS_TEXT: Record<string, string> = { enabled: '启用', disabled: '停用' };
const TRIGGER_TEXT: Record<string, string> = { auto: '自动', manual: '人工' };

const OPERATOR_TEXT: Record<string, string> = {
  eq: '等于', ne: '不等于', gt: '大于', gte: '大于等于', lt: '小于', lte: '小于等于', contains: '包含', is_null: '为空',
};
function operatorLabel(op: string) {
  return OPERATOR_TEXT[op] || op;
}

// 数据来源表 / 条件字段 → 中文（英文）映射：展示用，落库仍存英文原始值
const SOURCE_MAP: Record<string, string> = {
  fire_equipment_check: '消防设备点检',
  hse_morning_meeting: '每日晨会',
  hse_training_record: '培训记录',
  transfer_station_check: '转运站巡查',
  vehicle_check_record: '车辆三检',
  violation_records: '三违记录',
};
const FIELD_MAP: Record<string, string> = {
  check_status: '检查状态',
  feedback_status: '反馈状态',
  inspection_type: '检查类型',
  record_quality: '记录质量',
  status: '状态',
};
const FIELD_OPTIONS = Object.entries(FIELD_MAP).map(([value, label]) => ({
  label: `${label}（${value}）`,
  value,
}));
function sourceLabel(s?: string | null) {
  if (!s) return '-';
  return SOURCE_MAP[s] ? `${SOURCE_MAP[s]}（${s}）` : s;
}
function fieldLabel(s: string) {
  return FIELD_MAP[s] ? `${FIELD_MAP[s]}（${s}）` : s;
}

// 数据来源表 → 下拉选项（搭积木式选择，中文（英文））
const SOURCE_OPTIONS = Object.entries(SOURCE_MAP).map(([value, label]) => ({
  label: `${label}（${value}）`,
  value,
}));
// 数据来源表 → 对应模块管理页路由（仅已存在独立页面，点击可跳转）
const SOURCE_ROUTE: Record<string, string> = {
  violation_records: '/site/violation',
  fire_equipment_check: '/site/fire-facility',
  hse_training_record: '/training/records',
};

const router = useRouter();

// ---- 手动链接：从已注册路由重建「一级/二级/三级」菜单树用于级联选择 ----
interface MenuNode {
  path: string;
  label: string;
  children?: MenuNode[];
  leaf: boolean;
}
const routeIndex = ref<Map<string, string>>(new Map());
const menuCascaderOptions = ref<{ label: string; value: string; children?: any[] }[]>([]);
/** 手动链接：树形选择（默认全部展开）选项；父节点禁用仅供展开查看，叶子 key=路由 path */
const treeMenuOptions = ref<{ label: string; key: string; disabled?: boolean; children?: any[] }[]>([]);

function buildMenuTree(): MenuNode[] {
  // 以任意类型读取路由 meta，避免 RouteMeta 类型未覆盖导致的类型报错
  const recs: any[] = (router.getRoutes() as any[]).filter((r: any) => {
    const t = r.meta && r.meta.title;
    if (!r.path || !t) return false;
    if (r.path === '*' || r.path === '/' || /^\/:/.test(r.path)) return false;
    if (r.meta.hidden || r.meta.ignoreAccess) return false;
    return true;
  });
  const nodes = new Map<string, MenuNode>();
  for (const r of recs) {
    const segs = r.path.split('/').filter(Boolean);
    if (segs.length < 1 || segs.length > 3) continue;
    const isContainer = !!r.children && r.children.length > 0 && !r.component;
    nodes.set(r.path, {
      path: r.path,
      // 统一过一遍 $t：部分模块 meta.title 存的是 i18n key 串（如 page.hse.emergency），须翻译成中文；已是中文则原样返回
      label: $t(String(r.meta.title || '')),
      leaf: !isContainer,
    });
  }
  for (const node of nodes.values()) {
    const segs = node.path.split('/').filter(Boolean);
    if (segs.length < 2) continue;
    const parentPath = '/' + segs.slice(0, -1).join('/');
    const parent = nodes.get(parentPath);
    if (parent) {
      parent.children = parent.children || [];
      parent.children.push(node);
    }
  }
  const prune = (n: MenuNode): boolean => {
    if (n.children && n.children.length) {
      n.children = n.children.filter((c) => prune(c));
      return n.children.length > 0;
    }
    return n.leaf;
  };
  const sortTree = (ns: MenuNode[]) => {
    const rec = (p: string) => recs.find((r: any) => r.path === p);
    ns.sort(
      (a, b) =>
        (rec(a.path)?.meta?.order ?? 9999) - (rec(b.path)?.meta?.order ?? 9999) ||
        a.label.localeCompare(b.label, 'zh'),
    );
    ns.forEach((n) => n.children && sortTree(n.children));
  };
  const tree = [...nodes.values()].filter((n) => n.path.split('/').filter(Boolean).length === 1);
  tree.forEach((n) => prune(n));
  sortTree(tree);
  const map = new Map<string, string>();
  const flat = (n: MenuNode) => {
    map.set(n.path, n.label);
    n.children && n.children.forEach(flat);
  };
  tree.forEach(flat);
  routeIndex.value = map;
  return tree;
}

function refreshMenuTree() {
  const toOpt = (n: MenuNode): any => ({
    label: n.label,
    value: n.path,
    children: n.children ? n.children.map(toOpt) : undefined,
  });
  // 树形选项：父节点（含子级）禁用仅供展开查看，叶子可选中且 key 即路由 path
  const toTree = (n: MenuNode): any => {
    const hasCh = !!(n.children && n.children.length);
    return {
      label: n.label,
      key: hasCh ? 'p:' + n.path : n.path,
      disabled: hasCh,
      children: hasCh ? n.children.map(toTree) : undefined,
    };
  };
  const tree = buildMenuTree();
  menuCascaderOptions.value = tree.map(toOpt);
  treeMenuOptions.value = tree.map(toTree);
}

/** 手动链接选中路由的中文名（用于列表/表单展示） */
function sourceRouteLabel(route?: string | null) {
  if (!route) return '';
  return routeIndex.value.get(route) || route;
}

function goSource(row: any) {
  const route = row && row.sourceRoute && row.sourceRoute.trim() ? row.sourceRoute.trim() : '';
  const path = route || (row && row.sourceTable && SOURCE_ROUTE[row.sourceTable] ? SOURCE_ROUTE[row.sourceTable] : '');
  if (!path) return;
  window.open(router.resolve(path).href, '_blank', 'noopener');
}

const stats = reactive<AssessmentRuleApi.Stats>({
  total: 0, enabled: 0, fixedCnt: 0, cumulativeCnt: 0,
  detailCnt: 0, tieredCnt: 0, autoCnt: 0, manualCnt: 0, detailRows: 0,
});

const columns = computed<VxeTableGridColumns>(() => [
  { title: '规则编码', field: 'ruleCode', minWidth: 110, align: 'center' },
  { title: '类别', field: 'category', minWidth: 130, align: 'center', showOverflow: 'tooltip' },
  { title: '考核内容', field: 'ruleName', minWidth: 150, align: 'center', showOverflow: 'tooltip' },
  { title: '数据来源', field: 'sourceTable', minWidth: 190, align: 'center', slots: { default: 'sourceCell' } },
  {
    title: '扣分',
    field: 'deductScore',
    minWidth: 110,
    align: 'center',
    formatter: ({ row }: any) => {
      if (row.deductType === 'detail') return `${row.detailCount ?? 0} 项子项`;
      if (row.deductType === 'tiered') return `${(row.deductConfig?.tiers || []).length || 0} 档`;
      return `${row.deductScore} 分/次`;
    },
  },
  { title: '方式', field: 'deductType', minWidth: 80, align: 'center', slots: { default: 'deductTypeCell' } },
  { title: '触发', field: 'triggerType', minWidth: 70, align: 'center', slots: { default: 'triggerCell' } },
  { title: '状态', field: 'status', minWidth: 70, align: 'center', slots: { default: 'statusCell' } },
  { title: '操作', field: 'action', minWidth: 210, align: 'center', fixed: 'right', slots: { default: 'action' } },
]);

async function loadCategories() {
  try {
    const list = await getAssessmentRuleCategories();
    categoryOptions.value = (list || []).map((c: string) => ({ label: c, value: c }));
  } catch {
    categoryOptions.value = [];
  }
}

function loadStats() {
  getAssessmentRuleStats()
    .then((s) => {
      Object.assign(stats, s || {});
    })
    .catch(() => {
      /* 拦截器已提示 */
    });
}

async function loadData() {
  loading.value = true;
  try {
    const res = await getAssessmentRuleList({
      page: page.value,
      size: pageSize.value,
      keyword: searchForm.keyword || undefined,
      category: searchForm.category,
      trigger_type: searchForm.trigger_type,
      deduct_type: searchForm.deduct_type,
      status: searchForm.status,
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

function onSearch() {
  page.value = 1;
  loadData();
  loadStats();
}
function onReset() {
  searchForm.keyword = '';
  searchForm.category = undefined;
  searchForm.trigger_type = undefined;
  searchForm.deduct_type = undefined;
  searchForm.status = undefined;
  onSearch();
}
function onPageChange(payload: { currentPage: number; pageSize: number }) {
  page.value = payload.currentPage;
  pageSize.value = payload.pageSize;
  loadData();
}

// ===================== 新建 / 编辑 模态 =====================
const editOpen = ref(false);
const editId = ref<number | null>(null);
const editTitle = ref('新建扣分规则');
/** 数据来源链接方式：auto=自动链接来源表；manual=手动按菜单选择页面 */
const linkMode = ref<'auto' | 'manual'>('auto');

const form = reactive<AssessmentRuleApi.RulePayload & { maxDeduct: number | null; sourceRoute: string | null }>({
  ruleCode: '',
  ruleName: '',
  category: '',
  sourceTable: '',
  sourceRoute: null,
  triggerType: 'auto',
  deductType: 'fixed',
  deductScore: 1,
  maxDeduct: null,
  priority: 10,
  status: 'enabled',
  remark: '',
  details: [],
  conditions: [],
});

const details = ref<AssessmentRuleApi.RuleDetailItem[]>([]);
const conditions = ref<AssessmentRuleApi.RuleConditionPayload[]>([]);

// 阶梯档位（tiered）：阈值 → 扣分
const tiers = ref<{ threshold: number; deductScore: number; _t: string }[]>([]);
function addTier() {
  tiers.value.push({ threshold: tiers.value.length + 1, deductScore: 1, _t: `t${Date.now()}${tiers.value.length}` });
}
function removeTier(idx: number) {
  tiers.value.splice(idx, 1);
}
function tierData(all: { threshold: number; deductScore: number }[]) {
  return all
    .filter((t) => t.threshold !== null && t.threshold !== undefined)
    .sort((a, b) => (a.threshold ?? 0) - (b.threshold ?? 0))
    .map((t) => ({ threshold: t.threshold ?? 0, deductScore: t.deductScore ?? 0 }));
}

// 扣分逻辑预览：随表单实时生成人类可读的执行路径
const deductPreview = computed<string[]>(() => {
  const lines: string[] = [];
  // 触发
  if (form.triggerType === 'auto') {
    lines.push(
      form.sourceTable
        ? `自动触发：系统定时扫描「${sourceLabel(form.sourceTable)}」数据，命中即扣分`
        : '自动触发：系统定时扫描对应数据表，命中即扣分',
    );
  } else {
    lines.push('人工触发：由负责人在评分页面手动填写扣分');
  }
  // 条件
  if (conditions.value.length) {
    const cText = conditions.value
      .map((c, i) => {
        const opText = c.operator && OPERATOR_TEXT[c.operator]
          ? (c.operator === 'is_null' ? '为空' : `${OPERATOR_TEXT[c.operator]} ${c.value ?? ''}`)
          : `${c.operator ?? ''} ${c.value ?? ''}`;
        const seg = `${fieldLabel(c.field || '')} ${opText}`;
        return i === 0 ? seg : `${c.logic === 'or' ? '或者' : '并且'} ${seg}`;
      })
      .join(' ');
    lines.push(`命中条件：仅当满足「${cText}」的记录才触发扣分`);
  } else {
    lines.push('命中条件：无附加条件，命中数据来源即触发');
  }
  // 扣分
  let deduct = '';
  switch (form.deductType) {
    case 'fixed':
      deduct = `固定扣分：每次命中扣 ${form.deductScore ?? 0} 分`;
      break;
    case 'cumulative':
      deduct = `累计扣分：每次命中扣 ${form.deductScore ?? 0} 分，按发生次数累加`;
      break;
    case 'detail':
      if (details.value.length) {
        const sub = details.value.map((d) => `${d.detailName || '未命名子项'} ${d.deductScore} 分/${d.unit || '次'}`).join('；');
        deduct = `明细扣分：按子项逐项扣分（${sub}）`;
      } else {
        deduct = '明细扣分：尚未配置子项';
      }
      break;
    case 'tiered': {
      const t = tierData(tiers.value);
      deduct = t.length
        ? `阶梯扣分：按档位梯度扣分（${t.map((x) => `达到 ${x.threshold} 次扣 ${x.deductScore} 分`).join('；')}）`
        : '阶梯扣分：尚未配置档位';
      break;
    }
    default:
      deduct = `每次命中扣 ${form.deductScore ?? 0} 分`;
  }
  lines.push(deduct);
  // 上限（类别级 + 本条规则级）
  const catMax = catLimits.value.find((c) => c.category === form.category)?.maxDeduct ?? null;
  lines.push(
    catMax != null
      ? `类别上限：类别「${form.category}」累计最多扣 ${catMax} 分`
      : `类别上限：类别「${form.category}」不设上限（请到「类别扣分上限」页签配置）`,
  );
  lines.push(
    form.maxDeduct != null && form.maxDeduct > 0
      ? `本条规则再封顶：最多扣 ${form.maxDeduct} 分（可选）`
      : '本条规则不再单独封顶（可选）',
  );
  // 生效状态 + 优先级
  lines.push(form.status === 'enabled' ? '生效状态：启用，参与扣分' : '生效状态：停用，当前不扣分');
  lines.push(`执行优先级：${form.priority ?? 10}（值越大越先执行）`);
  return lines;
});

function resetForm() {
  form.ruleCode = '';
  form.ruleName = '';
  form.category = '';
  form.sourceTable = '';
  form.sourceRoute = null;
  linkMode.value = 'auto';
  form.triggerType = 'auto';
  form.deductType = 'fixed';
  form.deductScore = 1;
  form.maxDeduct = null;
  form.priority = 10;
  form.status = 'enabled';
  form.remark = '';
  details.value = [];
  conditions.value = [];
  tiers.value = [];
}

function showCreate() {
  editId.value = null;
  editTitle.value = '新建扣分规则';
  resetForm();
  if (!form.category && categoryOptions.value.length) form.category = categoryOptions.value[0].value;
  editOpen.value = true;
}

async function showEdit(index: number) {
  const row = dataSource.value[index];
  editId.value = row.id;
  editTitle.value = '编辑扣分规则';
  resetForm();
  form.ruleCode = row.ruleCode || '';
  form.ruleName = row.ruleName;
  form.category = row.category;
  form.sourceTable = row.sourceTable || '';
  form.sourceRoute = row.sourceRoute || null;
  linkMode.value = row.sourceRoute ? 'manual' : 'auto';
  form.triggerType = row.triggerType;
  form.deductType = row.deductType;
  form.deductScore = row.deductScore != null ? Number(row.deductScore) : 0;
  form.maxDeduct = row.maxDeduct != null ? Number(row.maxDeduct) : null;
  form.priority = row.priority ?? 10;
  form.status = row.status;
  form.remark = row.remark || '';
  details.value = [];
  conditions.value = [];
  editOpen.value = true;
  try {
    const res = await getAssessmentRuleDetail(row.id);
    if (res.rule) {
      form.ruleCode = res.rule.ruleCode || '';
      form.ruleName = res.rule.ruleName;
      form.category = res.rule.category;
      form.sourceTable = res.rule.sourceTable || '';
      form.triggerType = res.rule.triggerType;
      form.deductType = res.rule.deductType;
      form.deductScore = res.rule.deductScore != null ? Number(res.rule.deductScore) : 0;
      form.maxDeduct = res.rule.maxDeduct != null ? Number(res.rule.maxDeduct) : null;
      form.priority = res.rule.priority ?? 10;
      form.status = res.rule.status;
      form.remark = res.rule.remark || '';
    }
    details.value = (res.details || []).map((d: any) => ({
      ...d,
      // pg 驱动把 NUMERIC 返回为字符串（如 "1.00"），统一转数字避免 InputNumber 类型警告
      deductScore: d.deductScore != null ? Number(d.deductScore) : d.deductScore,
    }));
    conditions.value = (res.conditions || []).map((c: any) => ({ logic: c.logic, field: c.field, operator: c.operator, value: c.value }));
    const cfg = res.rule?.deductConfig || null;
    tiers.value = Array.isArray(cfg?.tiers)
      ? cfg.tiers.map((t: any, ti: number) => ({ threshold: Number(t.threshold ?? 0), deductScore: Number(t.deductScore ?? 0), _t: `t${Date.now()}${ti}` }))
      : [];
  } catch {
    /* 拦截器已提示 */
  }
}

function addDetail() {
  details.value.push({
    detailCode: null,
    detailName: '',
    deductScore: 1,
    unit: '次',
    sortOrder: details.value.length + 1,
    _t: `n${Date.now()}${details.value.length}`,
  });
}

const detailImportInput = ref<HTMLInputElement | null>(null);
const importDetailsFlag = ref(false);
function triggerDetailImport() {
  const el = detailImportInput.value;
  if (el) {
    el.value = '';
    el.click();
  }
}
async function onImportDetails(e: Event) {
  const target = e.target as HTMLInputElement;
  const file = target.files && target.files[0];
  if (!file) return;
  importDetailsFlag.value = true;
  try {
    const rows = await importRuleDetails(file);
    const base = details.value.length;
    Array.isArray(rows)
      && rows.forEach((r) => {
        details.value.push({
          id: 0,
          detailCode: r.detailCode || null,
          detailName: r.detailName,
          deductScore: r.deductScore ?? 1,
          unit: r.unit || '次',
          sortOrder: base + details.value.length + 1,
          _t: `imp${Date.now()}${details.value.length}`,
        });
      });
    message.success(`已导入 ${rows ? rows.length : 0} 条扣分明细`);
  } catch {
    /* 请求拦截器已统一提示错误，避免重复弹窗 */
  } finally {
    importDetailsFlag.value = false;
  }
}

// ---- 明细子项：独立管理与抽屉（搜索 + 分页表格 + 导入）----
const detailDrawerOpen = ref(false);
const detailSearch = ref('');
const detailPage = ref(1);
const detailPageSize = ref(10);

const detailPreview = computed(() => details.value.slice(0, 4));

const filteredDetails = computed(() => {
  const kw = detailSearch.value.trim().toLowerCase();
  if (!kw) return details.value;
  return details.value.filter((d: any) =>
    String(d.detailName || '').toLowerCase().includes(kw) ||
    String(d.detailCode || '').toLowerCase().includes(kw));
});
const detailPageData = computed(() => {
  const start = (detailPage.value - 1) * detailPageSize.value;
  return filteredDetails.value.slice(start, start + detailPageSize.value);
});
const detailPagination = computed(() => ({
  page: detailPage.value,
  pageSize: detailPageSize.value,
  itemCount: filteredDetails.value.length,
  showSizePicker: true,
  pageSizes: [10, 20, 50, 100],
  onUpdatePage: (p: number) => {
    detailPage.value = p;
  },
  onUpdatePageSize: (s: number) => {
    detailPageSize.value = s;
    detailPage.value = 1;
  },
}));

function openDetailEditor() {
  detailSearch.value = '';
  detailPage.value = 1;
  detailDrawerOpen.value = true;
}
function removeDetailRow(row: any) {
  const idx = details.value.indexOf(row);
  if (idx < 0) return;
  details.value.splice(idx, 1);
  const maxPage = Math.max(1, Math.ceil(filteredDetails.value.length / detailPageSize.value));
  if (detailPage.value > maxPage) detailPage.value = maxPage;
}

const detailColumns = computed(() => [
  {
    title: '序号',
    key: 'index',
    width: 60,
    align: 'center',
    render: (_r: any, index: number) => String((detailPage.value - 1) * detailPageSize.value + index + 1),
  },
  {
    title: '子项名称',
    key: 'detailName',
    minWidth: 220,
    align: 'center',
    render: (row: any) =>
      h(NInput, {
        value: row.detailName,
        size: 'small',
        placeholder: '子项名称',
        'onUpdate:value': (v: string) => {
          row.detailName = v;
        },
      }),
  },
  {
    title: '编码',
    key: 'detailCode',
    width: 130,
    align: 'center',
    render: (row: any) =>
      h(NInput, {
        value: row.detailCode,
        size: 'small',
        placeholder: '可空',
        'onUpdate:value': (v: string) => {
          row.detailCode = v;
        },
      }),
  },
  {
    title: '扣分',
    key: 'deductScore',
    width: 110,
    align: 'center',
    render: (row: any) =>
      h(NInputNumber, {
        value: row.deductScore,
        min: 0,
        step: 0.5,
        size: 'small',
        placeholder: '扣分',
        style: 'width: 86px',
        'onUpdate:value': (v: number | null) => {
          row.deductScore = v ?? 0;
        },
      }),
  },
  {
    title: '单位',
    key: 'unit',
    width: 90,
    align: 'center',
    render: (row: any) =>
      h(NInput, {
        value: row.unit,
        size: 'small',
        placeholder: '单位',
        'onUpdate:value': (v: string) => {
          row.unit = v;
        },
      }),
  },
  {
    title: '操作',
    key: 'op',
    width: 70,
    align: 'center',
    render: (row: any) =>
      h(
        NButton,
        { size: 'small', type: 'error', quaternary: true, onClick: () => removeDetailRow(row) },
        { default: () => '删' },
      ),
  },
]);

function addCondition() {
  conditions.value.push({ logic: 'and', field: '', operator: 'eq', value: '' });
}
function removeCondition(idx: number) {
  conditions.value.splice(idx, 1);
}

function buildPayload() {
  if (!form.ruleName.trim() || !form.category.trim()) {
    message.warning('请填写规则名称与类别');
    return null;
  }
  if (form.deductType === 'detail' && details.value.length === 0) {
    message.warning('明细扣分规则至少配置一个子项');
    return null;
  }
  const cleanDetails = details.value
    .filter((d) => d.detailName && d.detailName.trim())
    .map((d) => ({
      detailCode: d.detailCode || null,
      detailName: d.detailName.trim(),
      deductScore: d.deductScore ?? 0,
      unit: d.unit || '次',
    }));
  const cleanConditions = conditions.value
    .filter((c) => c.field && c.field.trim())
    .map((c) => ({
      logic: c.logic || 'and',
      field: c.field.trim(),
      operator: c.operator || 'eq',
      value: c.value || '',
    }));
  const tierList = form.deductType === 'tiered' ? tierData(tiers.value) : [];
  return {
    ruleCode: form.ruleCode || null,
    ruleName: form.ruleName.trim(),
    category: form.category.trim(),
    sourceTable: form.sourceTable || null,
    sourceRoute: form.sourceRoute || null,
    triggerType: form.triggerType,
    deductType: form.deductType,
    deductScore: form.deductScore ?? 0,
    maxDeduct: form.maxDeduct ?? null,
    deductConfig: form.deductType === 'tiered' ? { tiers: tierList } : null,
    priority: form.priority ?? 10,
    status: form.status,
    remark: form.remark || null,
    details: cleanDetails,
    conditions: cleanConditions,
  };
}

async function handleSave() {
  const payload = buildPayload();
  if (!payload) return;
  saving.value = true;
  try {
    if (editId.value) {
      await updateAssessmentRule(editId.value, payload);
      message.success('更新成功');
    } else {
      await createAssessmentRule(payload);
      message.success('创建成功');
    }
    editOpen.value = false;
    loadData();
    loadStats();
  } catch {
    /* 拦截器已提示 */
  } finally {
    saving.value = false;
  }
}

// ===================== 启停 / 查看 / 删除 =====================
async function handleToggle(record: AssessmentRuleApi.AssessmentRule) {
  const next = record.status === 'enabled' ? 'disabled' : 'enabled';
  try {
    await updateAssessmentRuleStatus(record.id, next);
    message.success(next === 'enabled' ? '已启用' : '已停用');
    loadData();
  } catch {
    /* 拦截器已提示 */
  }
}

async function handleDelete(record: AssessmentRuleApi.AssessmentRule) {
  try {
    await deleteAssessmentRule(record.id);
    message.success('删除成功');
    loadData();
    loadStats();
  } catch {
    /* 拦截器已提示 */
  }
}

// 查看抽屉
const viewOpen = ref(false);
const viewData = ref<AssessmentRuleApi.RuleDetailResult | null>(null);
async function handleView(record: AssessmentRuleApi.AssessmentRule) {
  viewOpen.value = true;
  viewData.value = null;
  try {
    viewData.value = await getAssessmentRuleDetail(record.id);
  } catch {
    /* 拦截器已提示 */
  }
}

const actionState = ref<Record<string, { hidden?: boolean }>>({
  downloadTemplate: { hidden: true },
  import: { hidden: true },
  export: { hidden: true },
});

const helpOpen = ref(false);

onMounted(() => {
  loadData();
  loadStats();
  loadCategories();
  loadCategoryLimits();
  refreshMenuTree();
});
</script>

<template>
  <HsePageLayout title="扣分规则库">
    <template #extra>
      <div style="display: flex; align-items: center; gap: 8px">
        <NButton type="primary" secondary size="small" @click="helpOpen = true">使用说明</NButton>
        <HseActionBar :actions="actionState" @refresh="onSearch" @create="showCreate" />
      </div>
    </template>

    <NTabs v-model:value="activeTab" type="line" animated>
      <NTabPane name="rules" tab="扣分规则">
    <div style="display: flex; flex-direction: column; gap: 16px">
      <div style="display: flex; flex-wrap: wrap; gap: 16px">
        <HseStatCard title="规则总数" :value="String(stats.total)" icon="lucide:file-text" color="primary" />
        <HseStatCard title="已启用" :value="String(stats.enabled)" icon="lucide:check" color="success" />
        <HseStatCard title="固定" :value="String(stats.fixedCnt)" icon="lucide:circle-dollar-sign" color="info" />
        <HseStatCard title="累计" :value="String(stats.cumulativeCnt)" icon="lucide:repeat" color="info" />
        <HseStatCard title="明细(子项行)" :value="`${stats.detailCnt}/${stats.detailRows}`" icon="lucide:list" color="warning" />
        <HseStatCard title="自动触发" :value="String(stats.autoCnt)" icon="lucide:zap" color="info" />
        <HseStatCard title="人工触发" :value="String(stats.manualCnt)" icon="lucide:user-check" color="default" />
      </div>

      <HseSearchPanel @query="onSearch" @reset="onReset">
        <NSelect
          v-model:value="searchForm.category"
          placeholder="类别"
          clearable
          filterable
          :options="categoryOptions"
          style="min-width: 150px"
        />
        <NSelect v-model:value="searchForm.deduct_type" placeholder="扣分方式" clearable :options="deductTypeOptions" style="min-width: 110px" />
        <NSelect v-model:value="searchForm.trigger_type" placeholder="触发方式" clearable :options="triggerOptions" style="min-width: 110px" />
        <NSelect v-model:value="searchForm.status" placeholder="状态" clearable :options="statusOptions" style="min-width: 100px" />
        <NInput v-model:value="searchForm.keyword" placeholder="搜索名称/编码/来源" clearable style="min-width: 200px" @keyup.enter="onSearch" />
      </HseSearchPanel>

      <HseDataGrid
        :columns="columns"
        :data="dataSource"
        :loading="loading"
        :pager="true"
        :total="total"
        auto-width
        @page-change="onPageChange"
      >
        <template #sourceCell="{ row }">
          <span v-if="row.sourceRoute || SOURCE_ROUTE[row.sourceTable]">
            <a
              role="button"
              style="color: #1677ff; cursor: pointer"
              @click="goSource(row)"
            >{{ sourceRouteLabel(row.sourceRoute) || sourceLabel(row.sourceTable) }}</a>
          </span>
          <span v-else>{{ sourceLabel(row.sourceTable) }}</span>
        </template>
        <template #deductTypeCell="{ row }">
          <HseStatusTag :type="DEDUCT_TAG[row.deductType] || 'info'">
            {{ DEDUCT_TEXT[row.deductType] || row.deductType }}
          </HseStatusTag>
        </template>
        <template #triggerCell="{ row }">
          <span>{{ TRIGGER_TEXT[row.triggerType] || row.triggerType }}</span>
        </template>
        <template #statusCell="{ row }">
          <HseStatusTag :type="row.status === 'enabled' ? 'success' : 'default'">
            {{ STATUS_TEXT[row.status] || row.status }}
          </HseStatusTag>
        </template>
        <template #action="{ row, rowIndex }">
          <NSpace justify="center">
            <NButton size="small" type="primary" quaternary @click="showEdit(rowIndex)">编辑</NButton>
            <NButton size="small" type="primary" quaternary @click="handleView(row)">查看</NButton>
            <NButton
              size="small"
              quaternary
              :type="row.status === 'enabled' ? 'warning' : 'success'"
              @click="handleToggle(row)"
            >
              {{ row.status === 'enabled' ? '停用' : '启用' }}
            </NButton>
            <NPopconfirm @positive-click="handleDelete(row)">
              <template #trigger>
                <NButton size="small" type="error" quaternary>删除</NButton>
              </template>
              确认删除规则「{{ row.ruleName }}」？
            </NPopconfirm>
          </NSpace>
        </template>
      </HseDataGrid>
    </div>
      </NTabPane>
      <NTabPane name="categories" tab="类别扣分上限">
        <div class="flex w-full flex-col gap-3">
          <div style="display: flex; flex-wrap: wrap; gap: 8px; align-items: center">
            <NButton type="primary" secondary size="small" :loading="catSaving" @click="saveCatLimits">保存类别上限</NButton>
            <NButton size="small" @click="addCategoryRow">＋ 增加行</NButton>
            <NPopconfirm @positive-click="batchDeleteCategoryRows">
              <template #trigger>
                <NButton type="error" size="small" :disabled="catChecked.size === 0">批量删除</NButton>
              </template>
              确认删除选中的 {{ catChecked.size }} 个类别扣分上限？删除后不可恢复。
            </NPopconfirm>
            <NButton size="small" quaternary :loading="catLoading" @click="loadCategoryLimits">刷新</NButton>
            <span class="text-gray-400" style="font-size: 12px">点某行「编辑」进入行编辑（改完点「保存」；「取消」还原），或「＋ 增加行」新增；勾选行后点「批量删除」。留空上限 = 不设上限；「类别 / 规则名称」保存后自动同步到「扣分规则」。</span>
          </div>

          <NDataTable
            class="cat-table"
            :remote="false"
            :data="catLimits"
            :columns="catColumns"
            :loading="catLoading"
            :pagination="false"
            :max-height="520"
            :bordered="false"
            :single-line="false"
            :row-key="(row: any, index: number) => index"
            :row-props="catRowProps"
          />
          <div class="text-gray-400" style="font-size: 12px; margin-top: 4px">拖动行首的「⠿」手柄可在行与行之间调整顺序，保存后按此顺序持久化。</div>
        </div>
      </NTabPane>
    </NTabs>

    <!-- ============ 新建 / 编辑 ============ -->
    <NModal
      v-model:show="editOpen"
      :title="editTitle"
      preset="card"
      style="width: 760px; max-width: 96vw"
    >
      <NForm label-placement="top" label-width="auto" size="small">
        <div style="display: grid; grid-template-columns: 0.75fr 1.25fr; gap: 0 20px">
          <NFormItem label="类别" required>
            <NSelect v-model:value="form.category" :options="categoryOptions" clearable filterable tag allow-create placeholder="选择或输入类别" />
          </NFormItem>
          <NFormItem>
            <template #label>
              <span style="display:inline-flex;align-items:center">
                <span>数据来源</span>
                <NTooltip trigger="click" placement="right">
                  <template #trigger>
                    <span class="src-help">?</span>
                  </template>
                  <div class="help-tip">
                    自动链接：按已知来源表，表格中点击跳转到对应模块；<br />
                    手动链接：按菜单层级手动指定要跳转的页面。
                  </div>
                </NTooltip>
              </span>
            </template>
            <div style="display: flex; gap: 8px; align-items: flex-start; width: 100%">
              <NRadioGroup v-model:value="linkMode" size="small" style="flex: none">
                <NRadioButton value="auto" label="自动链接" style="padding: 0 12px" />
                <NRadioButton value="manual" label="手动链接" style="padding: 0 12px" />
              </NRadioGroup>
              <NSelect
                v-if="linkMode === 'auto'"
                v-model:value="form.sourceTable"
                :options="SOURCE_OPTIONS"
                clearable
                filterable
                placeholder="选择数据来源表（可空，点击可跳转到对应模块）"
                style="flex: 1"
              />
              <NTreeSelect
                v-else
                v-model:value="form.sourceRoute"
                :options="treeMenuOptions"
                class="manual-tree"
                placeholder="选择要跳转的页面（全部菜单已展开）"
                filterable
                default-expand-all
                style="flex: 1"
              />
            </div>
          </NFormItem>
          <NFormItem>
            <template #label>
              <span style="display:inline-flex;align-items:center">
                <span>规则编码</span>
                <NTooltip trigger="click" placement="right">
                  <template #trigger><span class="src-help">?</span></template>
                  <div class="help-tip">
                  留空时系统自动生成，如 R000012；<br />
                  也可手动输入指定编码。
                </div>
                </NTooltip>
              </span>
            </template>
            <NInput v-model:value="form.ruleCode" placeholder="留空自动生成（R+六位序号）" clearable />
          </NFormItem>
          <NFormItem label="规则名称" required>
            <NSelect v-model:value="form.ruleName" :options="ruleNameOptions" clearable filterable tag allow-create placeholder="选择该类别的考核内容，或直接输入" />
          </NFormItem>
          <NFormItem label="触发方式">
            <NSelect v-model:value="form.triggerType" :options="triggerOptions" />
          </NFormItem>
          <NFormItem label="扣分方式" required>
            <NSelect v-model:value="form.deductType" :options="deductTypeOptions" />
          </NFormItem>
          <NFormItem v-if="form.deductType !== 'detail' && form.deductType !== 'tiered'" label="单次扣分">
            <NInputNumber v-model:value="form.deductScore" :min="0" :step="0.5" style="width: 100%" />
          </NFormItem>
          <NFormItem>
            <template #label>
              <span style="display:inline-flex;align-items:center">
                <span>本条规则再封顶（可选）</span>
                <NTooltip trigger="click" placement="right">
                  <template #trigger><span class="src-help">?</span></template>
                  <div class="help-tip">
                  类别扣分上限（如「{{ form.category || '未选类别' }}」）在「类别扣分上限」页签统一配置；<br />
                  本项仅作本条规则自身的额外封顶，一般留空。
                </div>
                </NTooltip>
              </span>
            </template>
            <NInputNumber v-model:value="form.maxDeduct" :min="0" :step="1" clearable style="width: 100%" />
          </NFormItem>
          <NFormItem label="优先级">
            <NInputNumber v-model:value="form.priority" :min="0" style="width: 100%" />
          </NFormItem>
          <NFormItem label="状态">
            <NSelect v-model:value="form.status" :options="statusOptions" />
          </NFormItem>
        </div>
        <NFormItem label="备注">
          <NInput v-model:value="form.remark" type="textarea" :rows="2" placeholder="扣分规则说明" />
        </NFormItem>

        <!-- 明细子项（多子项时点击「管理明细」在独立面板中搜索/分页/导入编辑） -->
        <div v-if="form.deductType === 'detail'">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px">
            <strong>明细子项</strong>
            <NButton size="small" type="primary" quaternary @click="openDetailEditor">管理明细（{{ details.length }} 项）</NButton>
          </div>
          <div v-if="details.length === 0" style="color: #999; padding: 8px 0">未配置子项，点右上角「管理明细」添加或导入。</div>
          <div v-else style="display: flex; flex-wrap: wrap; gap: 6px">
            <NTag v-for="d in detailPreview" :key="d._t || d.id" size="small" :bordered="false" type="info">
              {{ d.detailName || '未命名' }} · {{ d.deductScore }}分/{{ d.unit }}
            </NTag>
            <span v-if="details.length > detailPreview.length" style="color: #999; font-size: 12px; line-height: 22px">
              …还有 {{ details.length - detailPreview.length }} 项
            </span>
          </div>
        </div>

        <!-- 阶梯档位（tiered 时显示） -->
        <div v-if="form.deductType === 'tiered'" style="margin-top: 8px">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px">
            <strong>阶梯档位</strong>
            <NButton size="small" type="primary" quaternary @click="addTier">+ 添加档位</NButton>
          </div>
          <div v-if="tiers.length === 0" style="color: #999; padding: 8px 0">未配置档位（累计达到阈值对应次数时，按该档位扣分）</div>
          <div v-for="(t, idx) in tiers" :key="t._t" style="display: grid; grid-template-columns: 180px 130px 60px; gap: 8px; align-items: center; margin-bottom: 8px">
            <NInputNumber v-model:value="t.threshold" :min="1" :step="1" size="small" placeholder="达到次数（阈值）">
              <template #prefix>≥</template>
            </NInputNumber>
            <NInputNumber v-model:value="t.deductScore" :min="0" :step="0.5" size="small" placeholder="扣分">
              <template #suffix>分</template>
            </NInputNumber>
            <NButton size="small" type="error" quaternary @click="removeTier(idx)">删</NButton>
          </div>
          <div style="color: #999; font-size: 12px">说明：记录累计达到各档位「≥阈值」即按该档扣分，档位按阈值从小到大依次生效。</div>
        </div>

        <!-- 条件（simple 模式） -->
        <div style="margin-top: 8px">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px">
            <strong>触发条件（可选）</strong>
            <NButton size="small" type="primary" quaternary @click="addCondition">+ 添加条件</NButton>
          </div>
          <div v-for="(c, idx) in conditions" :key="idx" style="display: grid; grid-template-columns: 1fr 110px 110px 1fr 60px; gap: 8px; align-items: center; margin-bottom: 8px">
            <NSelect v-model:value="c.field" :options="FIELD_OPTIONS" clearable filterable placeholder="选择字段" size="small" />
            <NSelect v-model:value="c.operator" :options="operatorOptions" size="small" />
            <NInput v-model:value="c.value" placeholder="值" size="small" />
            <NSelect v-model:value="c.logic" :options="[{ label: '并且', value: 'and' }, { label: '或者', value: 'or' }]" size="small" />
            <NButton size="small" type="error" quaternary @click="removeCondition(idx)">删</NButton>
          </div>
        </div>

        <!-- 扣分逻辑预览：实时生成的执行路径收进问号图标，悬停展示 -->
        <div style="display:flex;align-items:center;font-weight:600;color:#18a058;margin-top:12px">
          <span>扣分逻辑预览</span>
          <NTooltip trigger="click" placement="right">
            <template #trigger><span class="src-help">?</span></template>
            <div style="text-align:left;line-height:1.8;max-width:520px">
              <div v-if="deductPreview.length" v-for="(l, li) in deductPreview" :key="li">· {{ l }}</div>
              <span v-else>暂无扣分逻辑配置。</span>
            </div>
          </NTooltip>
        </div>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="editOpen = false">取消</NButton>
          <NButton type="primary" :loading="saving" @click="handleSave">保存</NButton>
        </NSpace>
      </template>
    </NModal>

    <!-- ============ 明细子项管理（搜索 + 分页表格 + 导入） ============ -->
    <NDrawer v-model:show="detailDrawerOpen" :width="760" placement="right" :show-mask="false">
      <NDrawerContent closable title="明细子项管理">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px; flex-wrap: wrap">
          <NInput v-model:value="detailSearch" placeholder="搜索子项名称／编码" clearable size="small" style="width: 220px" />
          <NButton size="small" type="primary" quaternary @click="triggerDetailImport" :loading="importDetailsFlag">导入</NButton>
          <NButton size="small" type="primary" quaternary @click="addDetail">+ 添加子项</NButton>
          <span style="color: #909399; font-size: 12px">共 {{ filteredDetails.length }} 项</span>
        </div>
        <input
          ref="detailImportInput"
          type="file"
          style="display: none"
          accept=".xlsx,.xls,.csv,.txt"
          @change="onImportDetails"
        />
        <div style="color: #909399; font-size: 12px; margin-bottom: 8px">
          支持导入 Excel(.xlsx/.xls/.csv) 或文本(.txt)。首行列名须含「名称/子项/考核内容」「扣分/分值」「单位」「编码」中的任一关键词以自动识别列；扣分值缺省时按 1 分计。
        </div>
        <NDataTable
          :columns="detailColumns"
          :data="detailPageData"
          :pagination="detailPagination"
          :row-key="(row: any) => String(row._t || row.id)"
          :max-height="440"
          :bordered="false"
          :single-line="false"
        />
      </NDrawerContent>
    </NDrawer>

    <!-- ============ 查看抽屉 ============ -->
    <NDrawer v-model:show="viewOpen" :width="640" placement="right" :show-mask="false">
      <NDrawerContent closable title="规则详情">
        <NSpin v-if="viewData" :show="false">
          <NDescriptions label-placement="left" :column="1" bordered>
            <NDescriptionsItem label="规则编码">{{ viewData.rule.ruleCode || '-' }}</NDescriptionsItem>
            <NDescriptionsItem label="规则名称">{{ viewData.rule.ruleName }}</NDescriptionsItem>
            <NDescriptionsItem label="类别">{{ viewData.rule.category }}</NDescriptionsItem>
            <NDescriptionsItem label="数据来源">{{ sourceLabel(viewData.rule.sourceTable) }}</NDescriptionsItem>
            <NDescriptionsItem label="触发方式">
              <HseStatusTag :type="viewData.rule.triggerType === 'auto' ? 'info' : 'default'">
                {{ TRIGGER_TEXT[viewData.rule.triggerType] }}
              </HseStatusTag>
            </NDescriptionsItem>
            <NDescriptionsItem label="扣分方式">
              <HseStatusTag :type="DEDUCT_TAG[viewData.rule.deductType] || 'info'">
                {{ DEDUCT_TEXT[viewData.rule.deductType] }}
              </HseStatusTag>
            </NDescriptionsItem>
            <NDescriptionsItem label="扣分/子项">
              <template v-if="viewData.rule.deductType === 'detail'">
                <div v-for="d in viewData.details" :key="d.id">
                  - {{ d.detailName }}：{{ d.deductScore }} 分/{{ d.unit }}（{{ d.detailCode || '' }}）
                </div>
              </template>
              <template v-else-if="viewData.rule.deductType === 'tiered'">
                <div v-if="(viewData.rule.deductConfig?.tiers || []).length">
                  <div v-for="(t, ti) in viewData.rule.deductConfig.tiers" :key="ti">- 达到 {{ t.threshold }} 次扣 {{ t.deductScore }} 分</div>
                </div>
                <div v-else>分级扣除（未配置档位）</div>
              </template>
              <template v-else>
                {{ viewData.rule.deductScore }} 分/次
              </template>
            </NDescriptionsItem>
            <NDescriptionsItem label="类别上限">
              {{ (catLimits.find((c: any) => c.category === viewData.rule.category)?.maxDeduct) ?? '不设上限' }} 分
            </NDescriptionsItem>
            <NDescriptionsItem v-if="viewData.rule.maxDeduct" label="本条规则封顶">{{ viewData.rule.maxDeduct }} 分</NDescriptionsItem>
            <NDescriptionsItem label="状态">
              <HseStatusTag :type="viewData.rule.status === 'enabled' ? 'success' : 'default'">
                {{ STATUS_TEXT[viewData.rule.status] }}
              </HseStatusTag>
            </NDescriptionsItem>
            <NDescriptionsItem label="优先级"> {{ viewData.rule.priority }} </NDescriptionsItem>
            <NDescriptionsItem label="版本"> v{{ viewData.rule.version }} </NDescriptionsItem>
            <NDescriptionsItem label="有效期">
              {{ String(viewData.rule.validFrom).slice(0, 10) }}
              <template v-if="viewData.rule.validTo"> ~ {{ String(viewData.rule.validTo).slice(0, 10) }} </template>
            </NDescriptionsItem>
            <NDescriptionsItem label="条件">
              <template v-if="viewData.conditions.length">
                <div v-for="c in viewData.conditions" :key="c.id">
                  - {{ fieldLabel(c.field) }} {{ operatorLabel(c.operator) }} {{ c.value }}
                </div>
              </template>
              <template v-else>-</template>
            </NDescriptionsItem>
            <NDescriptionsItem label="备注">{{ viewData.rule.remark || '-' }}</NDescriptionsItem>
          </NDescriptions>
        </NSpin>
      </NDrawerContent>
    </NDrawer>

    <!-- ============ 使用说明 ============ -->
    <NModal v-model:show="helpOpen" preset="card" title="使用说明" style="width: 700px; max-width: 96vw">
      <NSpace vertical size="large" style="max-height: 70vh; overflow: auto">
        <div>
          <div style="font-weight: 600; color: #18a058; margin-bottom: 6px">一、数据来源对应哪个模块？</div>
          <ul style="line-height: 1.9; padding-left: 18px; margin: 0">
            <li>三违记录（violation_records）→ 现场管理 / 三违管理（列表里点它可直接跳转）</li>
            <li>消防设备点检（fire_equipment_check）→ 现场管理 / 消防设施管理（列表里点它可直接跳转）</li>
            <li>培训记录（hse_training_record）→ 培训考核 / 培训记录（列表里点它可直接跳转）</li>
            <li>每日晨会（hse_morning_meeting）→ 培训考核（晨会登记，暂无独立列表页）</li>
            <li>车辆三检（vehicle_check_record）→ 现场管理（车辆三检，暂无独立页面）</li>
            <li>转运站巡查（transfer_station_check）→ 现场管理（转运站巡查，暂无独立页面）</li>
          </ul>
        </div>
        <div>
          <div style="font-weight: 600; color: #18a058; margin-bottom: 6px">二、如何新建 / 编辑一条扣分规则？</div>
          <ol style="line-height: 1.9; padding-left: 18px; margin: 0">
            <li>在列表点某一行的「编辑」（或右上角「新建」）打开表单。</li>
            <li>填写「规则编码」（可空自动生成）、「规则名称」、「类别」。</li>
            <li>「数据来源」：自动链接 = 选已知来源表（表格中点击跳转到对应模块）；手动链接 = 按一级/二级/三级菜单选择要跳转的页面。</li>
            <li>「触发方式」：自动 = 系统定时扫描该数据表批量扣分；人工 = 由人工在评分页面填写。</li>
            <li>「扣分方式」：固定 = 每次固定扣 X 分；累计 = 次数 × 单次；明细 = 下设多个子项各扣分；阶梯 = 达到档位阈值即按档扣分。</li>
            <li>「阶梯」档位的配法：点「+ 添加档位」，每行填「≥阈值（达到次数）」和「扣分」；如 ≤2 次扣 1 分、≥3 次扣 2 分，阈值从小到大依次生效（在下方「阶梯档位」区配置）。</li>
            <li>「触发条件」：点「+ 添加条件」，依次选 字段 → 操作符 → 值，多条件用「并且 / 或者」搭积木式自由组合。</li>
            <li>若「扣分方式」为「明细」，在「明细子项」区点「管理明细」打开独立面板，可搜索、导入（Excel/文本）或逐行配置各子项的扣分值/单位。</li>
            <li>「本条规则再封顶」：可选，仅作本条规则的额外封顶，一般留空。</li>
            <li>「类别扣分上限」：在「类别扣分上限」页签统一配置（如「三违管理 = 40 分」），是该类别所有规则扣分合计的上限，无需在每条规则上重复设置。</li>
            <li>点「保存」生效。</li>
          </ol>
        </div>
        <div>
          <div style="font-weight: 600; color: #18a058; margin-bottom: 6px">三、触发条件字段的含义与用法</div>
          <ul style="line-height: 1.9; padding-left: 18px; margin: 0">
            <li>检查状态（check_status）：该条记录当前被检查/核验的状态，如 已检查 / 未检查。用于「检查未通过 / 未检查」类扣分。</li>
            <li>反馈状态（feedback_status）：检查情况是否已反馈说明，如 未反馈 / 已反馈。示例：三违检查「未反馈」即扣 2 分。</li>
            <li>检查类型（inspection_type）：检查的种类，如 日常检查 / 专项检查，可限定仅对特定类型扣分。</li>
            <li>记录质量（record_quality）：记录是否规范、完整，如 规范 / 不规范 / 信息不全。</li>
            <li>状态（status）：业务记录的总状态，常用于通用条件。</li>
            <li>用法：选字段 → 选操作符（等于 / 不等于 / 包含…）→ 填值；用「并且 / 或者」叠加多个条件。</li>
          </ul>
        </div>
      </NSpace>
    </NModal>

    </HsePageLayout>
</template>

<style>
.cat-drag-row:hover {
  background: rgba(24, 160, 88, 0.04);
}
.cat-drag-handle {
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
.cat-drag-handle:active {
  cursor: grabbing;
}
.cat-drag-row:hover .cat-drag-handle {
  color: #18a058;
  background: rgba(24, 160, 88, 0.08);
}
.cat-cell-text {
  display: inline-block;
  padding: 4px 4px;
  color: #374151;
  line-height: 1.5;
  word-break: break-all;
  white-space: pre-wrap;
}
/* 数据来源等标签右侧的帮助问号（醒目绿 + 悬停放大） */
.src-help {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  margin-left: 6px;
  border-radius: 50%;
  background: #18a058;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
  user-select: none;
  box-shadow: 0 1px 4px rgba(24, 160, 88, 0.45);
  transition: transform 0.15s ease, background-color 0.15s ease, box-shadow 0.15s ease;
}
.src-help:hover {
  background: #0f7f45;
  box-shadow: 0 2px 8px rgba(24, 160, 88, 0.55);
  transform: scale(1.15);
}
/* 问号提示内容：左对齐 + 预留换行宽度 */
.help-tip {
  text-align: left;
  line-height: 1.7;
  max-width: 340px;
}
/* 手动链接：树形下拉默认全部展开；解除树节点区高度限制，一/二/三级全部呈现，无需逐级点击展开 */
.manual-tree :deep(.n-tree) {
  max-height: 85vh;
  overflow-y: auto;
  min-width: 320px;
  padding: 8px 4px;
}
/* 树面板整体高度自适应，尽可能把全部层级撑满 */
.manual-tree :deep(.n-tree-select) {
  max-height: 85vh;
}
/* 树节点加大点击区域与行距，下拉界面更疏朗易读 */
.manual-tree :deep(.n-tree-node-content) {
  padding: 7px 12px;
  min-height: 38px;
}
/* 图片式「规则名称」行子表（#/考核内容/扣分/状态/操作 + 虚线「＋ 添加」） */
.cat-rule-editor {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 380px;
}
.cat-rule-grid {
  display: grid;
  grid-template-columns: 22px minmax(200px, 1fr) 84px 98px 30px;
  align-items: center;
  gap: 6px;
}
.cat-rule-header {
  padding: 2px 2px 4px;
  font-size: 12px;
  font-weight: 600;
  color: #909399;
}
.cat-rule-row {
  padding: 2px;
}
.cat-rule-col-idx {
  color: #909399;
  font-size: 12px;
  text-align: center;
}
.cat-rule-col-status .n-switch {
  width: auto;
}
.cat-rule-add {
  margin-top: 2px;
}
.cat-rule-add-btn {
  border-style: dashed;
  border-width: 1px;
}
/* 类别扣分上限：表格/表单各项内容居中 */
.cat-table .n-data-table-td,
.cat-table .n-data-table-th {
  text-align: center;
}
.cat-table .n-data-table-td .n-input__input-el,
.cat-table .n-data-table-td .n-input-number .n-input__input-el,
.cat-rule-grid .n-input__input-el,
.cat-rule-grid .n-input-number .n-input__input-el {
  text-align: center;
}
.cat-table .n-data-table-td .cat-rule-grid {
  text-align: center;
}
</style>
