<script lang="ts" setup>
/**
 * 事故管理（web-naive）
 * 统一使用 HSE 公共组件栈（HseDataGrid / HseSearchPanel / HseActionBar / HseStatusTag）。
 * 接入真实 API（/api/accidents）。
 */
import { computed, onMounted, reactive, ref, watch } from 'vue';

import {
  NButton,
  NCard,
  NDatePicker,
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
  NStatistic,
  NSwitch,
  NTabPane,
  NTabs,
  NTag,
  NText,
  NUpload,
  type UploadFileInfo,
} from 'naive-ui';

import {
  HseActionBar,
  HseDataGrid,
  HseImportDialog,
  HsePageLayout,
  HseSearchPanel,
  HseStatusTag,
  type HseActionKey,
  ACCIDENT_CHANGE_TYPE_TAG as CHANGE_TYPE_TAG,
  ACCIDENT_LEVEL_TAG as LEVEL_TAG,
  ACCIDENT_ROLE_TAG as ROLE_TAG,
  ACCIDENT_STATUS_LABEL as STATUS_LABEL,
  ACCIDENT_STATUS_TAG as STATUS_TAG,
  EXPIRY_TAG,
} from '#/components/hse';
import type { VxeTableGridColumns } from '#/adapter/vxe-table';
import {
  createAccident,
  deleteAccident,
  exportAccidents,
  getAccidentAttachments,
  getAccidentList,
  getAccidentStats,
  getAccidentTeams,
  getCategoryNature,
  getPersonnelSearch,
  getAccidentVersions,
  suggestParty,
  suggestTeam,
  updateAccident,
  uploadAccidentAttachment,
  deleteAccidentAttachment,
  type AccidentApi,
} from '#/api/hse/accident';
import { useGenericImport } from '#/views/hse/_shared/useGenericImport';
import { message } from '#/adapter/naive';

defineOptions({ name: 'Accidents' });

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function formatDateTimeMinute(value?: string | null): string {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

// 仅日期 xxxx-xx-xx
function formatDateOnly(value?: string | number | null): string {
  if (!value) return '-';
  const d = typeof value === 'number' ? new Date(value) : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function nowStamp(): string {
  const d = new Date();
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}_${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
}

// ===================== 枚举映射 =====================
// 事故等级：后端 schema/server 存取均为中文（两套国标体系）
// - 生产安全事故等级：一般 / 较大 / 重大 / 特别重大
// - 道路交通事故等级：一级 / 二级 / 三级 / 四级
const LEVEL_OPTIONS = [
  { label: '特别重大', value: '特别重大' },
  { label: '重大', value: '重大' },
  { label: '较大', value: '较大' },
  { label: '一般', value: '一般' },
  { label: '一级', value: '一级' },
  { label: '二级', value: '二级' },
  { label: '三级', value: '三级' },
  { label: '四级', value: '四级' },
];

const STATUS_OPTIONS = [
  { label: '已报告', value: 'reported' },
  { label: '调查中', value: 'investigating' },
  { label: '处理中', value: 'processing' },
  { label: '已结案', value: 'closed' },
];

// ===================== 事故类别 ↔ 性质 级联（报表口径） =====================
// 数据源：宁津项目-北控城市资源集团事故统计报表（2026版）"一二级"sheet
// 通过 GET /accidents/category-nature 拉取（前后端单一来源），fallback 用前端常量以防接口挂
const FALLBACK_CATEGORY_NATURE: AccidentApi.CategoryNatureMeta = {
  categories: ['交通', '生产安全', '意外', '公众', '突发疾病', '职业病', '其它'],
  naturesByCategory: {
    交通:     ['全部责任', '主要责任', '同等责任', '次要责任', '无责任', '待认定'],
    生产安全: ['责任', '非责任'],
    意外:     ['意外'],
    公众:     ['责任', '非责任'],
    突发疾病: ['岗位发病', '非岗位发病'],
    职业病:   ['中暑', '热射病', '其它', '尘肺病', '职业性传染病', '职业性化学中毒', '职业性眼病', '职业性皮肤病', '其他呼吸系统疾病', '职业性肿瘤'],
    其它:     ['刑事', '治安'],
  },
  // 三级性质（报表三级细化）；键为 `${类别}${性质}` 复合串；接口不可用时作为离线兜底
  level3ByCategoryNature: {
    生产安全责任: ['物体打击', '机械伤害', '车辆伤害', '高处坠落', '触电', '火灾', '灼烫', '坍塌', '淹溺', '起重伤害', '中毒', '窒息', '爆炸-容器', '爆炸-锅炉', '爆炸-其它', '其它'],
    生产安全非责任: ['物体打击', '机械伤害', '车辆伤害', '高处坠落', '触电', '火灾', '灼烫', '坍塌', '淹溺', '起重伤害', '中毒', '窒息', '爆炸-容器', '爆炸-锅炉', '爆炸-其它', '其它'],
    突发疾病岗位发病: ['工时损失', '死亡'],
    突发疾病非岗位发病: ['工时损失', '死亡'],
    职业病中暑: ['工时损失', '死亡'],
    职业病热射病: ['工时损失', '死亡'],
    职业病其它: ['工时损失', '死亡'],
  },
};
const categoryNatureMeta = ref<AccidentApi.CategoryNatureMeta>(FALLBACK_CATEGORY_NATURE);
async function loadCategoryNature() {
  try {
    const m = await getCategoryNature();
    if (m && Array.isArray(m.categories) && m.categories.length) {
      categoryNatureMeta.value = m;
    }
  } catch {
    /* fallback 保留 */
  }
}
const CATEGORY_OPTIONS = computed(() =>
  categoryNatureMeta.value.categories.map((c) => ({ label: c, value: c })),
);
// 性质下拉随当前选中的事故类别级联；类别为空时给空列表
const NATURE_OPTIONS = computed(() => {
  const cat = formModel.accidentCategory;
  if (!cat) return [];
  return (categoryNatureMeta.value.naturesByCategory[cat] || []).map((n) => ({
    label: n,
    value: n,
  }));
});
// 类别切换时清空性质 + 三级（级联语义）
function onAccidentCategoryChange(val: string) {
  formModel.accidentCategory = val;
  formModel.accidentNature = '';
  formModel.accidentNatureLevel3 = '';
}
// 性质切换时清空三级（级联语义）
function onAccidentNatureChange(val: string) {
  formModel.accidentNature = val;
  formModel.accidentNatureLevel3 = '';
}
// 三级性质下拉随「事故类别 + 事故性质」级联；键为 `${类别}${性质}` 复合串，缺失时按类别兜底
const NATURE_LEVEL3_OPTIONS = computed(() => {
  const cat = formModel.accidentCategory;
  const nat = formModel.accidentNature;
  if (!cat || !nat) return [];
  const meta = categoryNatureMeta.value;
  const l3 = meta.level3ByCategoryNature || {};
  const direct = l3[`${cat}${nat}`];
  if (direct && direct.length) {
    return direct.map((v) => ({ label: v, value: v }));
  }
  // 类别兜底：部分类别（如 意外）三级直接挂在类别下，而非 `${类别}${性质}`
  const byCat = l3[cat];
  if (byCat && byCat.length) {
    return byCat.map((v) => ({ label: v, value: v }));
  }
  return [];
});

const EXPIRY_OPTIONS = [
  { label: '正常', value: 'normal' },
  { label: '临期', value: 'expiring' },
  { label: '过期', value: 'expired' },
  { label: '已结案', value: 'closed' },
  { label: '长期有效', value: 'permanent' },
];

const LEVEL_LABEL: Record<string, string> = {
  '特别重大': '特别重大',
  '重大': '重大',
  '较大': '较大',
  '一般': '一般',
  '一级': '一级',
  '二级': '二级',
  '三级': '三级',
  '四级': '四级',
};

const EXPIRY_LABEL: Record<string, string> = {
  normal: '正常',
  expiring: '临期',
  expired: '过期',
  closed: '已结案',
  permanent: '长期有效',
  unknown: '未知',
};

// 当事人角色：同一列在不同事故类型下的业务叫法（交通→肇事者，生产安全→伤者）
const PERSON_ROLE_OPTIONS = [
  { label: '肇事者', value: '肇事者' },
  { label: '伤者', value: '伤者' },
  { label: '患者', value: '患者' },
  { label: '当事人', value: '当事人' },
  { label: '其他', value: '其他' },
];
// 注：ROLE_TAG 已迁移至 statusColors.ts（ACCIDENT_ROLE_TAG，NTag 原生类型）

// ===================== 年份选项 =====================
const currentYear = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 11 }, (_, i) => ({
  label: `${currentYear - 5 + i} 年`,
  value: currentYear - 5 + i,
}));

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => ({
  label: `${i + 1} 月`,
  value: i + 1,
}));

// ===================== 列表数据 =====================
const loading = ref(false);
const data = ref<AccidentApi.AccidentItem[]>([]);
const total = ref(0);
const currentPage = ref(1);
const pageSize = ref(20);
const sortBy = ref<string | undefined>(undefined);
const sortOrder = ref<'asc' | 'desc' | undefined>(undefined);

const searchForm = reactive({
  keyword: '',
  year: null as number | null,
  month: null as number | null,
  level: null as string | null,
  status: null as string | null,
  expiryStatus: null as string | null,
});

// ===================== 统计数据 =====================
const statsLoading = ref(false);
const statsData = ref<AccidentApi.AccidentStats>({
  total: 0,
  major: 0,
  serious: 0,
  general: 0,
  minor: 0,
  openCount: 0,
  closedCount: 0,
  totalCasualties: 0,
  totalInjuries: 0,
  totalEconomicLoss: 0,
  expiring: 0,
  expired: 0,
});

async function loadData() {
  loading.value = true;
  try {
    const res = await getAccidentList({
      page: currentPage.value,
      pageSize: pageSize.value,
      keyword: searchForm.keyword || undefined,
      level: searchForm.level || undefined,
      status: searchForm.status || undefined,
      year: searchForm.year ?? undefined,
      month: searchForm.month ?? undefined,
      expiryStatus: (searchForm.expiryStatus || undefined) as AccidentApi.ExpiryStatus | undefined,
      sortField: sortBy.value,
      sortOrder: sortOrder.value,
    });
    // 浅拷贝为可写对象，避免 vxe-table 内部 row-key 写入 readonly Proxy 触发 [Vue warn] target is readonly
    data.value = (res.list ?? []).map((r) => ({ ...r }));
    total.value = res.total ?? 0;
    rebuildSnapshots();
  } catch {
    data.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
}

async function loadStats() {
  statsLoading.value = true;
  try {
    const stats = await getAccidentStats();
    statsData.value = stats;
  } catch {
    // keep defaults
  } finally {
    statsLoading.value = false;
  }
}

function onSearch() {
  currentPage.value = 1;
  loadData();
  loadStats();
}

function onReset() {
  searchForm.keyword = '';
  searchForm.year = null;
  searchForm.month = null;
  searchForm.level = null;
  searchForm.status = null;
  searchForm.expiryStatus = null;
  onSearch();
}

function onPageChange(payload: { currentPage: number; pageSize: number }) {
  currentPage.value = payload.currentPage;
  pageSize.value = payload.pageSize;
  loadData();
}

function onSortChange(payload: { sortBy?: string; sortOrder?: 'asc' | 'desc' }) {
  sortBy.value = payload.sortBy;
  sortOrder.value = payload.sortOrder;
  currentPage.value = 1;
  loadData();
}

// 统计卡点击联动过滤
function onStatCardClick(key: string) {
  searchForm.keyword = '';
  searchForm.year = null;
  searchForm.month = null;
  searchForm.expiryStatus = null;
  switch (key) {
    case 'major':
      searchForm.level = '重大';
      searchForm.status = null;
      break;
    case 'openCount':
      searchForm.level = null;
      searchForm.status = 'processing';
      break;
    default:
      searchForm.level = null;
      searchForm.status = null;
  }
  onSearch();
}

// ===================== 操作栏 =====================
const actionState = ref<Partial<Record<HseActionKey, { hidden?: boolean }>>>({});

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
  bindRefresh: bindImportRefresh,
} = useGenericImport('accidents');
bindImportRefresh(onRefresh);

async function onRefresh() {
  await Promise.all([loadData(), loadStats()]);
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

async function onExport() {
  try {
    const blob = await exportAccidents();
    triggerDownload(blob, `accidents_${nowStamp()}.csv`);
    message.success('导出成功');
  } catch {
    message.error('导出失败');
  }
}

// ===================== 新增 / 编辑 =====================
const formOpen = ref(false);
const formMode = ref<'create' | 'edit'>('create');
const formLoading = ref(false);
const editingId = ref<number | null>(null);
// 编辑模式下的原值快照：用于 onSubmit 只发送用户实际修改的字段，
// 避免 openEdit 加载 row.involvedVehicle=null 等场景下保存时把 DB 已有值覆盖为 ''。
const origInvolvedVehicle = ref<string>('');
const origStatus = ref<string>('');

interface AccidentFormModel {
  title: string;
  description: string;
  level: AccidentApi.AccidentLevel;
  status: AccidentApi.AccidentStatus;
  location: string;
  occurredAt: number | null;
  accidentNo: string;
  involvedPerson: string;
  involvedPersonRole: AccidentApi.PersonRole;
  personnelId: number | null;
  involvedVehicle: string;
  // 事故类别 + 事故性质 + 性质三级（报表口径，区别于 type；三级联动）
  accidentCategory: string;
  accidentNature: string;
  accidentNatureLevel3: string;
  // 当事人所属部门 + 上级（花名册自动关联 req6）
  partyDept: string;
  partyDeptId: number | null;
  partySupervisor: string;
  partySupervisorId: number | null;
  responsibilityTeamId: number | null;
  responsibilityTeam: string;
  casualties: number;
  injuries: number;
  economicLoss: number;
  rectificationDeadlineDays: number;
  relatedHazardId: number | null;
  relatedEmergencyId: number | null;
  remark: string;
}

const formModel = reactive<AccidentFormModel>({
  title: '',
  description: '',
  level: '一般',
  status: 'reported',
  location: '',
  occurredAt: Date.now(),
  accidentNo: '',
  involvedPerson: '',
  involvedPersonRole: '当事人',
  personnelId: null,
  involvedVehicle: '',
  // 事故类别 + 事故性质 + 性质三级（报表口径，区别于 type；三级联动）
  accidentCategory: '',
  accidentNature: '',
  accidentNatureLevel3: '',
  // 当事人所属部门 + 上级（花名册自动关联 req6）
  partyDept: '',
  partyDeptId: null,
  partySupervisor: '',
  partySupervisorId: null,
  responsibilityTeamId: null,
  responsibilityTeam: '',
  casualties: 0,
  injuries: 0,
  economicLoss: 0,
  rectificationDeadlineDays: 30,
  relatedHazardId: null,
  relatedEmergencyId: null,
  remark: '',
});

// ===================== 责任班组下拉 =====================
const teamOptions = ref<Array<{ label: string; value: number }>>([]);

async function loadTeams() {
  try {
    const res = await getAccidentTeams();
    teamOptions.value = (res?.list ?? []).map((t) => ({
      label: t.unitTypeLabel ? `${t.unitName}（${t.unitTypeLabel}）` : t.unitName,
      value: t.id,
    }));
  } catch {
    teamOptions.value = [];
  }
}

// 选择班组时同步名称快照（后端也会回填，此处保证前端即时展示）
function onTeamChange(id: number | null) {
  formModel.responsibilityTeamId = id;
  if (!id) {
    formModel.responsibilityTeam = '';
    return;
  }
  const hit = teamOptions.value.find((o) => o.value === id);
  if (hit) {
    formModel.responsibilityTeam = hit.label.replace(/（[^（）]*）$/, '');
  }
}

// ===================== 当事人选择 → 自动带出责任班组 =====================
interface PersonnelOption {
  label: string;
  value: string;
  employeeId: number;
  unitName: string;
  operationUnitId: number | null;
  isDriver: boolean;
  town: string | null;
}
const personOptions = ref<PersonnelOption[]>([]);
// 当事人建议下拉显隐（req1：用 NInput 直接受控，下拉仅做花名册建议，不拦截自由输入）
const personPickOpen = ref(false);
const personLoading = ref(false);
let personSearchTimer: ReturnType<typeof setTimeout> | null = null;

// 从花名册按姓名搜索，填充当事人下拉建议
async function fetchPersonnel(keyword: string) {
  const kw = (keyword || '').trim();
  if (kw.length < 1) {
    personOptions.value = [];
    return;
  }
  personLoading.value = true;
  try {
    const res = await getPersonnelSearch(kw);
    personOptions.value = (res?.list ?? []).map((p) => ({
      label: p.unitName ? `${p.name}（${p.unitName}）` : p.name,
      value: p.name,
      employeeId: p.employeeId,
      unitName: p.unitName,
      operationUnitId: p.operationUnitId,
      isDriver: p.isDriver,
      town: p.town || '',
    }));
  } catch {
    personOptions.value = [];
  } finally {
    personLoading.value = false;
  }
}

// 调后端建议端点，按当事人+地点推断责任班组并回填
async function applyTeamSuggestion() {
  if (!formModel.involvedPerson && !formModel.personnelId) {
    formModel.responsibilityTeamId = null;
    formModel.responsibilityTeam = '';
    return;
  }
  try {
    const res = await suggestTeam({
      personnelId: formModel.personnelId ?? undefined,
      name: formModel.involvedPerson || undefined,
      location: formModel.location || undefined,
    });
    if (res) {
      formModel.responsibilityTeamId = res.responsibilityTeamId ?? null;
      formModel.responsibilityTeam = res.responsibilityTeam || '';
    }
  } catch {
    /* 建议失败不阻断表单 */
  }
}

// 调后端建议端点，按当事人（花名册）自动关联所属部门 + 上级（req6）
async function applyPartySuggestion() {
  if (!formModel.involvedPerson && !formModel.personnelId) {
    formModel.partyDept = '';
    formModel.partyDeptId = null;
    formModel.partySupervisor = '';
    formModel.partySupervisorId = null;
    return;
  }
  try {
    const res = await suggestParty({
      personnelId: formModel.personnelId ?? undefined,
      name: formModel.involvedPerson || undefined,
      location: formModel.location || undefined,
    });
    if (res) {
      formModel.partyDept = res.partyDept || '';
      formModel.partyDeptId = res.partyDeptId ?? null;
      formModel.partySupervisor = res.partySupervisor || '';
      formModel.partySupervisorId = res.partySupervisorId ?? null;
    }
  } catch {
    /* 建议失败不阻断表单 */
  }
}

// 当事人 NInput 受控输入（req1 修复核心）：
// NSelect filterable remote tag 模式在失焦时会丢弃未提交的键入文本 → 花名册没有的名字无法填写。
// 改用 NInput 直接受控（键入即写回 formModel.involvedPerson），下拉仅做花名册建议，不拦截自由输入。
function onPersonInput(val: string) {
  formModel.involvedPerson = val || '';
  formModel.personnelId = null; // 未从下拉确认命中前不绑定工号
  if (val && val.trim()) {
    personPickOpen.value = true;
    onPersonSearch(val);
  } else {
    personPickOpen.value = false;
    personOptions.value = [];
  }
}

// 选中花名册建议项：回填姓名 + 工号，闭合下拉，触发责任班组 + 部门/上级推断
function onPersonPick(opt: PersonnelOption) {
  formModel.involvedPerson = opt.value;
  formModel.personnelId = opt.employeeId;
  personPickOpen.value = false;
  personOptions.value = [];
  applyTeamSuggestion();
  applyPartySuggestion();
}

// 失焦：延迟闭合下拉（避免点击建议项时 blur 先于 click），并按当前值触发推断。
// 花名册没有的名字（自由文本）也允许保存，同时仍尝试按姓名/地点自动匹配责任班组。
function onPersonBlur() {
  setTimeout(() => {
    personPickOpen.value = false;
  }, 120);
  if (!formModel.involvedPerson) return;
  const hit = personOptions.value.find((o) => o.value === formModel.involvedPerson);
  formModel.personnelId = hit ? hit.employeeId : null;
  applyTeamSuggestion();
  applyPartySuggestion();
}

// 当事人远程搜索（防抖拉花名册候选）
function onPersonSearch(keyword: string) {
  const kw = (keyword || '').trim();
  if (personSearchTimer) clearTimeout(personSearchTimer);
  if (!kw) {
    personOptions.value = [];
    return;
  }
  personSearchTimer = setTimeout(() => {
    fetchPersonnel(kw);
  }, 300);
}

function resetForm() {
  formModel.title = '';
  formModel.description = '';
  formModel.level = '一般';
  formModel.status = 'reported';
  formModel.location = '';
  formModel.occurredAt = Date.now();
  formModel.accidentNo = '';
  formModel.involvedPerson = '';
  formModel.involvedPersonRole = '当事人';
  formModel.personnelId = null;
  formModel.involvedVehicle = '';
  formModel.responsibilityTeamId = null;
  formModel.responsibilityTeam = '';
  formModel.accidentCategory = '';
  formModel.accidentNature = '';
  formModel.accidentNatureLevel3 = '';
  formModel.partyDept = '';
  formModel.partyDeptId = null;
  formModel.partySupervisor = '';
  formModel.partySupervisorId = null;
  formModel.casualties = 0;
  formModel.injuries = 0;
  formModel.economicLoss = 0;
  formModel.rectificationDeadlineDays = 30;
  formModel.relatedHazardId = null;
  formModel.relatedEmergencyId = null;
  formModel.remark = '';
}

function openCreate() {
  resetForm();
  formMode.value = 'create';
  editingId.value = null;
  formOpen.value = true;
}

function openEdit(row: AccidentApi.AccidentItem) {
  resetForm();
  formMode.value = 'edit';
  editingId.value = row.id;
  Object.assign(formModel, {
    title: row.title,
    description: row.description || '',
    level: row.level,
    status: row.status,
    location: row.location,
    occurredAt: row.occurredAt ? new Date(row.occurredAt).getTime() : Date.now(),
    accidentNo: row.accidentNo || '',
    involvedPerson: row.involvedPerson || '',
    involvedPersonRole: row.involvedPersonRole || '当事人',
    personnelId: row.personnelId ?? null,
    involvedVehicle: row.involvedVehicle || '',
    responsibilityTeamId: row.responsibilityTeamId ?? null,
    responsibilityTeam: row.responsibilityTeam || '',
    accidentCategory: row.accidentCategory || '',
    accidentNature: row.accidentNature || '',
    accidentNatureLevel3: row.accidentNatureLevel3 || '',
    partyDept: row.partyDept || '',
    partyDeptId: row.partyDeptId ?? null,
    partySupervisor: row.partySupervisor || '',
    partySupervisorId: row.partySupervisorId ?? null,
    casualties: row.casualties,
    injuries: row.injuries,
    economicLoss: row.economicLoss,
    rectificationDeadlineDays: row.rectificationDeadlineDays || 30,
    relatedHazardId: row.relatedHazardId ?? null,
    relatedEmergencyId: row.relatedEmergencyId ?? null,
    remark: row.remark || '',
  });
  // 记录编辑原值（onSubmit 用 diff 决定是否发送，避免 row.involvedVehicle=null 等场景下保存覆盖）
  origInvolvedVehicle.value = row.involvedVehicle || '';
  origStatus.value = row.status || '';
  formOpen.value = true;
}

async function onSubmit() {
  if (!formModel.title) {
    message.warning('事故标题不能为空');
    return;
  }
  formLoading.value = true;
  try {
    // 后端 zod schema (server/schemas/accidents.js) 期望 accident_date 为 YYYY-MM-DD 字符串；
    // 前端 formModel.occurredAt 可能是带时分秒的 ISO datetime，需截取日期部分。
    const occurredAtIso = formModel.occurredAt
      ? new Date(formModel.occurredAt).toISOString()
      : new Date().toISOString();
    const accidentDateStr = occurredAtIso.slice(0, 10);
    const payload: Partial<AccidentApi.AccidentItem> = {
      title: formModel.title,
      description: formModel.description,
      level: formModel.level,
      // status/involved_vehicle 仅在用户实际改动时发送（避免 openEdit 时 row 字段为 null/空、用户编辑其他字段保存后被覆盖）
      ...(formModel.status !== origStatus.value ? { status: formModel.status } : {}),
      location: formModel.location,
      occurredAt: occurredAtIso,
      accident_date: accidentDateStr,
      accident_no: formModel.accidentNo || undefined,
      involved_person: formModel.involvedPerson,
      involved_person_role: formModel.involvedPersonRole,
      personnel_id: formModel.personnelId ?? null,
      ...(formModel.involvedVehicle !== origInvolvedVehicle.value ? { involved_vehicle: formModel.involvedVehicle || '' } : {}),
      responsibility_team_id: formModel.responsibilityTeamId ?? null,
      responsibility_team: formModel.responsibilityTeam || undefined,
      // 事故类别 / 性质 / 性质三级（报表口径，三级联动）
      accident_category: formModel.accidentCategory || '',
      accident_nature: formModel.accidentNature || '',
      accident_nature_level3: formModel.accidentNatureLevel3 || '',
      // 当事人所属部门 + 上级（花名册自动关联）
      party_dept: formModel.partyDept || '',
      party_dept_id: formModel.partyDeptId ?? null,
      party_supervisor: formModel.partySupervisor || '',
      party_supervisor_id: formModel.partySupervisorId ?? null,
      casualties: formModel.casualties,
      injuries: formModel.injuries,
      // 以下键名必须与后端 zod schema 一致（snake_case）；camelCase 会被 zod strip() 静默删除 → 保存 200 但 DB 不变
      loss_amount: formModel.economicLoss,
      rectification_deadline_days: formModel.rectificationDeadlineDays,
      related_hazard_id: formModel.relatedHazardId,
      related_emergency_id: formModel.relatedEmergencyId,
      remark: formModel.remark,
    };
    // payload 用 snake_case 提交后端，列表/抽屉展示用 camelCase，
    // 故另备一份 camelCase 补丁用于本地即时同步，避免刷新前显示旧值
    const localPatch: Partial<AccidentApi.AccidentItem> = {
      accidentNo: formModel.accidentNo || undefined,
      involvedPerson: formModel.involvedPerson,
      involvedPersonRole: formModel.involvedPersonRole,
      personnelId: formModel.personnelId ?? null,
      involvedVehicle: formModel.involvedVehicle || '',
      responsibilityTeamId: formModel.responsibilityTeamId,
      responsibilityTeam: formModel.responsibilityTeam,
      accidentCategory: formModel.accidentCategory || '',
      accidentNature: formModel.accidentNature || '',
      accidentNatureLevel3: formModel.accidentNatureLevel3 || '',
      partyDept: formModel.partyDept || '',
      partyDeptId: formModel.partyDeptId ?? null,
      partySupervisor: formModel.partySupervisor || '',
      partySupervisorId: formModel.partySupervisorId ?? null,
    };

    if (formMode.value === 'edit' && editingId.value != null) {
      await updateAccident(editingId.value, payload);
      message.success('编辑成功');
      // 编辑后同步详情抽屉与列表中的记录，避免“伤亡情况”等字段仍显示编辑前的旧值
      if (currentAccident.value && currentAccident.value.id === editingId.value) {
        currentAccident.value = { ...currentAccident.value, ...payload, ...localPatch };
      }
      const idx = data.value.findIndex((a) => a.id === editingId.value);
      if (idx !== -1) {
        data.value[idx] = {
          ...data.value[idx],
          ...payload,
          ...localPatch,
        } as AccidentApi.AccidentItem;
      }
    } else {
      await createAccident(payload);
      message.success('新增成功');
    }
    formOpen.value = false;
    onRefresh();
  } catch {
    // 拦截器已提示
  } finally {
    formLoading.value = false;
  }
}

async function onDelete(row: AccidentApi.AccidentItem) {
  try {
    await deleteAccident(row.id);
    message.success('删除成功');
    onRefresh();
  } catch {
    // 拦截器已提示
  }
}

// ===================== 详情抽屉 =====================
const detailDrawerVisible = ref(false);
const currentAccident = ref<AccidentApi.AccidentItem | null>(null);
const detailTab = ref<'attachments' | 'versions'>('attachments');

// 附件
const attachmentList = ref<AccidentApi.Attachment[]>([]);
const attachmentLoading = ref(false);
const attachmentUploading = ref(false);
const uploadVersion = ref('');

// 版本
const versionList = ref<AccidentApi.VersionRecord[]>([]);
const versionLoading = ref(false);

// 注：CHANGE_TYPE_TAG 已迁移至 statusColors.ts（ACCIDENT_CHANGE_TYPE_TAG）
const CHANGE_TYPE_LABEL: Record<string, string> = {
  create: '创建',
  update: '更新',
  import: '导入',
  revise: '修订',
};

function openView(row: AccidentApi.AccidentItem) {
  currentAccident.value = row;
  detailDrawerVisible.value = true;
  detailTab.value = 'attachments';
  attachmentList.value = [];
  versionList.value = [];
  uploadVersion.value = '';
  fetchAttachments(row.id);
  fetchVersions(row.id);
}

async function fetchAttachments(id: number) {
  attachmentLoading.value = true;
  try {
    const res = await getAccidentAttachments(id);
    attachmentList.value = res || [];
  } catch {
    attachmentList.value = [];
  } finally {
    attachmentLoading.value = false;
  }
}

async function fetchVersions(id: number) {
  versionLoading.value = true;
  try {
    const res = await getAccidentVersions(id);
    versionList.value = res || [];
  } catch {
    versionList.value = [];
  } finally {
    versionLoading.value = false;
  }
}

async function handleStatusChange(newStatus: AccidentApi.AccidentStatus) {
  if (!currentAccident.value) return;
  try {
    const updateData: Partial<AccidentApi.AccidentItem> = { status: newStatus };
    if (newStatus === 'closed') {
      updateData.closedAt = new Date().toISOString();
    }
    await updateAccident(currentAccident.value.id, updateData);
    message.success('状态更新成功');
    // 更新当前详情和列表中的数据
    currentAccident.value = { ...currentAccident.value, ...updateData };
    // 更新列表中对应记录
    const idx = data.value.findIndex((a) => a.id === currentAccident.value!.id);
    if (idx !== -1) {
      data.value[idx] = { ...data.value[idx], ...updateData } as AccidentApi.AccidentItem;
    }
    loadStats();
  } catch {
    // 拦截器已提示
  }
}

// 报送集团开关（列表单元格切换即保存；乐观更新，失败回滚）
async function handleReportGroupChange(row: AccidentApi.AccidentItem, checked: boolean) {
  const prev = !!row.reportGroup;
  row.reportGroup = checked;
  try {
    await updateAccident(row.id, { report_group: checked });
    message.success(checked ? '已报送集团' : '已取消报送集团');
  } catch (e) {
    row.reportGroup = prev;
    console.warn('报送集团状态更新失败:', e);
    message.error('报送集团状态更新失败');
  }
}

// 附件上传（Naive NUpload 自定义上传）
async function handleAttachmentUpload({
  file,
  onFinish,
  onError,
}: {
  file: UploadFileInfo;
  onFinish?: () => void;
  onError?: () => void;
}) {
  const rawFile = file.file;
  if (!currentAccident.value || !rawFile) return;
  attachmentUploading.value = true;
  try {
    await uploadAccidentAttachment(currentAccident.value.id, rawFile, {
      version: uploadVersion.value || undefined,
      uploadedBy: 'admin',
    });
    message.success('附件上传成功');
    uploadVersion.value = '';
    await fetchAttachments(currentAccident.value.id);
    onFinish?.();
  } catch {
    message.error('附件上传失败');
    onError?.();
  } finally {
    attachmentUploading.value = false;
  }
}

function openAttachment(url: string) {
  window.open(url, '_blank');
}

async function handleDeleteAttachment(record: AccidentApi.Attachment) {
  if (!currentAccident.value) return;
  try {
    await deleteAccidentAttachment(currentAccident.value.id, record.id);
    message.success('附件删除成功');
    await fetchAttachments(currentAccident.value.id);
  } catch {
    // 拦截器已提示
  }
}

function formatFileSize(bytes: number): string {
  if (!bytes) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatMoney(value: number): string {
  return (value || 0).toLocaleString('zh-CN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

// ===================== 单元格内联编辑（cell 模式：单元格失焦/回车即保存） =====================
// 思路：HseDataGrid 在 cell 模式下，每次关闭编辑 emit edit-closed { row, column }，
//       row 即为含最新值的行副本。在此回调里：
//       - 用 `originalRow` 对比本次改了哪些字段，构建最小更新 payload
//       - 当事人字段被改动时，并发调 suggest-team + suggest-party，merged 归并
//       - 责任班组 ID 改了 → 同步回填名称快照
//       - 调 PUT 接口持久化，失败提示但不刷数据（避免覆盖前端乐观显示）
// 单元格编辑保存通过 HseDataGrid 的 @edit-closed 回调完成，cell 模式下不需要 ref 操作 grid
const rowSaving = ref<Set<number>>(new Set());
// 每行最近一次保存前的快照，用于在 edit-closed 里对比出本次变更字段
const rowSnapshots = ref<Map<number, string>>(new Map());

function snapshotKey(row: any): string {
  return JSON.stringify({
    title: row.title ?? null,
    involvedPerson: row.involvedPerson ?? null,
    involvedVehicle: row.involvedVehicle ?? null,
    responsibilityTeamId: row.responsibilityTeamId ?? null,
    responsibilityTeam: row.responsibilityTeam ?? null,
    accidentCategory: row.accidentCategory ?? null,
    accidentNature: row.accidentNature ?? null,
    accidentNatureLevel3: row.accidentNatureLevel3 ?? null,
    casualties: row.casualties ?? null,
    injuries: row.injuries ?? null,
    economicLoss: row.economicLoss ?? null,
    partyDept: row.partyDept ?? null,
    partySupervisor: row.partySupervisor ?? null,
  });
}

function takeRowSnapshot(row: any) {
  if (!row || row.id == null) return;
  rowSnapshots.value.set(row.id, snapshotKey(row));
}

// 进入页面/分页/排序/搜索/刷新：建立行快照（cell 模式下首屏没有快照就拿不到"原值"）
function rebuildSnapshots() {
  data.value.forEach((r) => takeRowSnapshot(r));
}

watch(data, () => rebuildSnapshots(), { deep: false });
onMounted(() => rebuildSnapshots());

// 行内编辑时，性质 / 性质三级 的下拉选项随该行的「类别 / 性质」计算（不依赖弹窗表单的 formModel）
function rowNatureOptions(row: any): { label: string; value: string }[] {
  const nat = categoryNatureMeta.value.naturesByCategory[row?.accidentCategory];
  return (nat || []).map((n: string) => ({ label: n, value: n }));
}
function rowLevel3Options(row: any): { label: string; value: string }[] {
  const l3 = categoryNatureMeta.value.level3ByCategoryNature || {};
  const direct = row?.accidentCategory && row?.accidentNature ? l3[`${row.accidentCategory}${row.accidentNature}`] : undefined;
  const arr = direct || (row?.accidentCategory ? l3[row.accidentCategory] : undefined) || [];
  return arr.map((v: string) => ({ label: v, value: v }));
}

// cell 模式不再有"行进入编辑态"，但保留旧的 onRowSave/onRowCancel 用于兼容 HseDataGrid @edit-save/@edit-cancel 事件（不再触发）
async function onRowSave(payload: { row: any }) {
  const row = payload?.row;
  if (!row || row.id == null) return;
  await persistRowDiff(row, /*changedKeys*/ undefined);
}
function onRowCancel(_payload: { row: any }) {
  // cell 模式不会走这里，留作兼容占位
}

// cell 关闭事件：自动保存本次变更字段
async function onCellEditClosed(payload: { row: any; column?: any }) {
  const row = payload?.row;
  const column = payload?.column;
  if (!row || row.id == null) return;
  // 仅跟踪本次关闭的列字段；如 payload 没携带 column，回退到全字段 diff
  const changedKey = column?.field || column?.property || null;
  await persistRowDiff(row, changedKey);
}

// 持久化：对比快照与当前 row，得出改动字段；若 changedKey 指定，仅在该字段实际改动时才发
async function persistRowDiff(row: any, changedKey?: string | null) {
  if (row.id == null) return;
  if (rowSaving.value.has(row.id)) return;

  const prevRaw = rowSnapshots.value.get(row.id);
  let changedFields: string[] = [];
  let prev: any = null;
  if (prevRaw) {
    try {
      prev = JSON.parse(prevRaw);
    } catch {
      prev = null;
    }
    if (prev) {
      for (const key of Object.keys(prev)) {
        if ((row[key] ?? null) !== (prev[key] ?? null)) {
          changedFields.push(key);
        }
      }
    }
  }

  // 受信任字段白名单（避免误把 internal 字段写出去）
  const TRUSTED_FIELDS = new Set([
    'title', 'involvedPerson', 'involvedVehicle',
    'responsibilityTeamId', 'responsibilityTeam',
    'accidentCategory', 'accidentNature', 'accidentNatureLevel3',
    'casualties', 'injuries', 'economicLoss',
    'partyDept', 'partySupervisor',
  ]);
  let toPersist = changedFields.filter((f) => TRUSTED_FIELDS.has(f));
  if (changedKey) {
    // 当仅指定 changedKey 时，只在该字段真的变动了才发请求
    if (!toPersist.includes(changedKey)) return;
    toPersist = [changedKey];
  }
  if (!toPersist.length) {
    // 没有任何变动（说明用户在 cell 上按了键又撤销），更新快照后跳过
    takeRowSnapshot(row);
    return;
  }

  rowSaving.value.add(row.id);
  try {
    // 当事人字段变化 → 推断责任班组 / 部门 / 上级（仅当这些字段当前为空时才覆盖）
    if (toPersist.includes('involvedPerson') || toPersist.includes('personnelId')) {
      // 同步回填责任班组
      try {
        const teamRes = await suggestTeam({
          personnelId: row.personnelId ?? undefined,
          name: row.involvedPerson || undefined,
          location: row.location || undefined,
        });
        if (teamRes) {
          row.responsibilityTeamId = teamRes.responsibilityTeamId ?? row.responsibilityTeamId ?? null;
          row.responsibilityTeam = teamRes.responsibilityTeam || row.responsibilityTeam || '';
          if (!toPersist.includes('responsibilityTeamId')) toPersist.push('responsibilityTeamId');
          if (!toPersist.includes('responsibilityTeam')) toPersist.push('responsibilityTeam');
        }
      } catch { /* 推断失败不阻断保存 */ }
      // 同步回填所属部门 / 上级
      try {
        const partyRes = await suggestParty({
          personnelId: row.personnelId ?? undefined,
          name: row.involvedPerson || undefined,
          location: row.location || undefined,
        });
        if (partyRes) {
          row.partyDept = partyRes.partyDept || row.partyDept || '';
          row.partyDeptId = partyRes.partyDeptId ?? row.partyDeptId ?? null;
          row.partySupervisor = partyRes.partySupervisor || row.partySupervisor || '';
          row.partySupervisorId = partyRes.partySupervisorId ?? row.partySupervisorId ?? null;
          if (!toPersist.includes('partyDept')) toPersist.push('partyDept');
          if (!toPersist.includes('partySupervisor')) toPersist.push('partySupervisor');
        }
      } catch { /* 同上 */ }
    }

    // 责任班组 ID 改时同步名称快照
    if (toPersist.includes('responsibilityTeamId') && row.responsibilityTeamId != null) {
      const t = teamOptions.value.find((o: any) => o.value === row.responsibilityTeamId);
      if (t) row.responsibilityTeam = t.label.replace(/（[^（）]*）$/, '');
      if (!toPersist.includes('responsibilityTeam')) toPersist.push('responsibilityTeam');
    }

    // 类别 / 性质级联时清空下级
    if (toPersist.includes('accidentCategory') && !toPersist.includes('accidentNature')) {
      row.accidentNature = '';
      toPersist.push('accidentNature');
    }
    if (toPersist.includes('accidentNature') && !toPersist.includes('accidentNatureLevel3')) {
      row.accidentNatureLevel3 = '';
      toPersist.push('accidentNatureLevel3');
    }

    // 构造 payload：camelCase 透传 row；snake_case 仅对"toPersist 中实际涉及的字段"显式写一次 snake_key。
    // 关键：不要给未涉及的字段塞 null，否则后端 zod schema (.optional() + .or('')) 拒绝 null → 400。
    const camel: Record<string, any> = {};
    for (const f of toPersist) {
      camel[f] = row[f];
    }
    // camelCase → snake_case 映射（仅本模块使用的 9 个字段；其它字段按路由兼容处理）
    const SNAKE_KEYS: Record<string, string> = {
      title: 'description', // 关键：后端 schema 只有 description，camelCase title 会被 zod strip() 静默删除导致保存"成功"但 DB 不变
      involvedPerson: 'involved_person',
      involvedVehicle: 'involved_vehicle',
      responsibilityTeamId: 'responsibility_team_id',
      responsibilityTeam: 'responsibility_team',
      accidentCategory: 'accident_category',
      accidentNature: 'accident_nature',
      accidentNatureLevel3: 'accident_nature_level3',
      economicLoss: 'loss_amount', // 经济损失：DB 列为 loss_amount，缺此映射会以 camelCase economicLoss 发送而被 zod 剥除 → 200 但 DB 不变
      partyDept: 'party_dept',
      partySupervisor: 'party_supervisor',
    };
    const snake: Record<string, any> = { ...camel };
    for (const f of toPersist) {
      const sk = SNAKE_KEYS[f];
      if (sk) snake[sk] = camel[f] ?? null;
    }

    await updateAccident(row.id, snake);
    message.success(`保存成功（${toPersist.join('/')}）`);
    // 同步更新快照，本次提交后的 row 为最新基线
    takeRowSnapshot(row);
    // 触发 UI 数值刷新（response 还没回填当前 row 时，乐观更新已赋值）
  } catch (e: any) {
    message.error('保存失败：' + (e?.message || '未知错误'));
    // 失败时回滚：本单元格前的快照值
    if (prev && changedKey) {
      row[changedKey] = prev[changedKey];
    }
  } finally {
    rowSaving.value.delete(row.id);
  }
}

// ===================== 表格列 =====================
// 当事人列标题：事故类型已从界面移除，固定为「当事人」
function personColumnTitle(): string {
  return '当事人';
}

const columns = computed((): VxeTableGridColumns => [
  {
    title: '序号',
    field: 'seq',
    width: 60,
    align: 'center',
    formatter: ({ rowIndex }: any) =>
      String((currentPage.value - 1) * pageSize.value + rowIndex + 1),
  },
  {
    title: '事故描述',
    field: 'title',
    minWidth: 220,
    align: 'center',
    showOverflow: 'tooltip',
    editRender: {},
    slots: { edit: 'title-edit' },
    formatter: ({ row }: any) => row?.title || row?.description || '-',
  },
  {
    title: '发生时间',
    field: 'occurredAt',
    minWidth: 130,
    align: 'center',
    sortable: true,
    slots: { default: 'occurredAt' },
  },
  {
    title: personColumnTitle(),
    field: 'involvedPerson',
    minWidth: 150,
    align: 'center',
    editRender: {},
    slots: { default: 'involvedPerson', edit: 'involvedPerson-edit' },
  },
  {
    title: '车牌号',
    field: 'involvedVehicle',
    minWidth: 110,
    align: 'center',
    showOverflow: 'tooltip',
    editRender: {},
    formatter: ({ row }: any) => row?.involvedVehicle || '-',
    slots: { edit: 'involvedVehicle-edit' },
  },
  {
    title: '责任班组',
    field: 'responsibilityTeam',
    minWidth: 120,
    align: 'center',
    showOverflow: 'tooltip',
    editRender: {},
    formatter: ({ row }: any) => row?.responsibilityTeam || '-',
    slots: { edit: 'responsibilityTeam-edit' },
  },
  {
    title: '事故类别',
    field: 'accidentCategory',
    minWidth: 110,
    align: 'center',
    showOverflow: 'tooltip',
    editRender: {},
    formatter: ({ row }: any) => row?.accidentCategory || '-',
    slots: { edit: 'accidentCategory-edit' },
  },
  {
    title: '事故性质',
    field: 'accidentNature',
    minWidth: 130,
    align: 'center',
    showOverflow: 'tooltip',
    editRender: {},
    formatter: ({ row }: any) => row?.accidentNature || '-',
    slots: { edit: 'accidentNature-edit' },
  },
  {
    title: '事故性质三级',
    field: 'accidentNatureLevel3',
    minWidth: 130,
    align: 'center',
    showOverflow: 'tooltip',
    editRender: {},
    formatter: ({ row }: any) => row?.accidentNatureLevel3 || '-',
    slots: { edit: 'accidentNatureLevel3-edit' },
  },
  {
    title: '死亡人数',
    field: 'casualties',
    minWidth: 90,
    align: 'center',
    sortable: true,
    editRender: {},
    formatter: ({ row }: any) => (row?.casualties != null && row?.casualties !== '' ? row.casualties : '-'),
    slots: { edit: 'casualties-edit' },
  },
  {
    title: '受伤人数',
    field: 'injuries',
    minWidth: 90,
    align: 'center',
    sortable: true,
    editRender: {},
    formatter: ({ row }: any) => (row?.injuries != null && row?.injuries !== '' ? row.injuries : '-'),
    slots: { edit: 'injuries-edit' },
  },
  {
    title: '经济损失(元)',
    field: 'economicLoss',
    minWidth: 120,
    align: 'center',
    sortable: true,
    editRender: {},
    formatter: ({ row }: any) =>
      row?.economicLoss != null && row?.economicLoss !== '' ? `¥${formatMoney(row.economicLoss)}` : '-',
    slots: { edit: 'economicLoss-edit' },
  },
  {
    title: '当事人所属部门',
    field: 'partyDept',
    minWidth: 130,
    align: 'center',
    showOverflow: 'tooltip',
    editRender: {},
    formatter: ({ row }: any) => row?.partyDept || '-',
    slots: { edit: 'partyDept-edit' },
  },
  {
    title: '当事人上级',
    field: 'partySupervisor',
    minWidth: 180,
    align: 'center',
    showOverflow: 'tooltip',
    editRender: {},
    formatter: ({ row }: any) => row?.partySupervisor || '-',
    slots: { edit: 'partySupervisor-edit' },
  },
  { title: '处理状态', field: 'status', minWidth: 90, align: 'center', slots: { default: 'status' } },
  {
    title: '报送集团',
    field: 'reportGroup',
    width: 100,
    align: 'center',
    slots: { default: 'reportGroup' },
  },
  {
    title: '操作',
    field: 'action',
    width: 300,
    align: 'center',
    fixed: 'right',
    slots: { default: 'action' },
  },
]);

// ===================== 自定义列（原生 vxe-toolbar-custom） =====================
// 直接使用 VXE 原生「自定义列」按钮（toolbarConfig.custom），
// 支持勾选显隐、在「显示/隐藏」两栏间移动、拖动调整列顺序，无需自造轮子。

onMounted(() => {
  loadData();
  loadStats();
  loadTeams();
  loadCategoryNature();
});
</script>

<template>
  <HsePageLayout title="事故管理" description="记录、跟踪和处理安全事故，支持事故调查与处理流程">
    <template #extra>
      <HseActionBar
        :actions="actionState"
        @refresh="onRefresh"
        @download-template="onImportTemplate"
        @import="() => (importOpen = true)"
        @export="onExport"
        @create="openCreate"
      />
    </template>

    <!-- 统计卡 -->
    <div class="mb-4 grid grid-cols-5 gap-3">
      <NCard :bordered="false" class="cursor-pointer" @click="onStatCardClick('total')">
        <NStatistic label="事故总数" :value="statsData.total" />
      </NCard>
      <NCard :bordered="false" class="cursor-pointer" @click="onStatCardClick('major')">
        <NStatistic label="重大事故" :value="statsData.major" />
      </NCard>
      <NCard :bordered="false" class="cursor-pointer" @click="onStatCardClick('openCount')">
        <NStatistic label="未结案" :value="statsData.openCount" />
      </NCard>
      <NCard :bordered="false">
        <NStatistic label="死亡人数" :value="statsData.totalCasualties" />
      </NCard>
      <NCard :bordered="false">
        <NStatistic label="经济损失(万元)" :value="(statsData.totalEconomicLoss / 10000).toFixed(2)" />
      </NCard>
    </div>

    <!-- 搜索 -->
    <HseSearchPanel @query="onSearch" @reset="onReset">
      <NGi>
        <NInput
          v-model:value="searchForm.keyword"
          placeholder="搜索事故标题/描述"
          clearable
          @keyup.enter="onSearch"
        />
      </NGi>
      <NGi>
        <NSelect
          v-model:value="searchForm.year"
          placeholder="年份"
          clearable
          :options="YEAR_OPTIONS"
        />
      </NGi>
      <NGi>
        <NSelect
          v-model:value="searchForm.month"
          placeholder="月份"
          clearable
          :options="MONTH_OPTIONS"
        />
      </NGi>
      <NGi>
        <NSelect
          v-model:value="searchForm.level"
          placeholder="事故级别"
          clearable
          :options="LEVEL_OPTIONS"
        />
      </NGi>
      <NGi>
        <NSelect
          v-model:value="searchForm.status"
          placeholder="处理状态"
          clearable
          :options="STATUS_OPTIONS"
        />
      </NGi>
      <NGi>
        <NSelect
          v-model:value="searchForm.expiryStatus"
          placeholder="时效状态"
          clearable
          :options="EXPIRY_OPTIONS"
        />
      </NGi>
    </HseSearchPanel>

    <!-- 表格：单元格内联编辑（点单元格即进入编辑，关闭时自动保存） -->
    <HseDataGrid
      :columns="columns"
      :data="data"
      :loading="loading"
      :pager="true"
      :total="total"
      :toolbar-custom="{ storageKey: 'hse_accidents_columns' }"
      editable
      edit-mode="cell"
      @page-change="onPageChange"
      @sort-change="onSortChange"
      @edit-save="onRowSave"
      @edit-cancel="onRowCancel"
      @edit-closed="onCellEditClosed"
    >
      <template #level="{ row }">
        <HseStatusTag :type="LEVEL_TAG[row.level] || 'neutral'">
          {{ LEVEL_LABEL[row.level] || row.level || '-' }}
        </HseStatusTag>
      </template>
      <template #status="{ row }">
        <HseStatusTag :type="STATUS_TAG[row.status] || 'neutral'">
          {{ STATUS_LABEL[row.status] || row.status || '-' }}
        </HseStatusTag>
      </template>
      <template #reportGroup="{ row }">
        <NSwitch
          :value="!!row.reportGroup"
          :checked-value="true"
          :unchecked-value="false"
          checked-children="报送"
          unchecked-children="未报"
          size="small"
          @update:value="(v) => handleReportGroupChange(row, v)"
        />
      </template>
      <template #expiry="{ row }">
        <HseStatusTag :type="EXPIRY_TAG[row.expiryStatus] || 'neutral'">
          {{ EXPIRY_LABEL[row.expiryStatus] || row.expiryStatus || '未知' }}
        </HseStatusTag>
      </template>
      <template #occurredAt="{ row }">
        {{ formatDateOnly(row.occurredAt) }}
      </template>
      <template #involvedPerson="{ row }">
        <NSpace v-if="row.involvedPerson" :size="4" justify="center" align="center" wrap-item>
          <NText>{{ row.involvedPerson }}</NText>
          <NTag :bordered="false" size="small" :type="ROLE_TAG[row.involvedPersonRole] || 'default'">
            {{ row.involvedPersonRole || '当事人' }}
          </NTag>
        </NSpace>
        <NText v-else depth="3">-</NText>
      </template>

      <!-- ===== 行内编辑插槽（edit-mode=cell 时由 VXE 渲染） ===== -->
      <template #title-edit="{ row }">
        <NInput v-model:value="row.title" placeholder="事故描述" />
      </template>
      <template #involvedPerson-edit="{ row }">
        <NInput v-model:value="row.involvedPerson" placeholder="当事人" />
      </template>
      <template #involvedVehicle-edit="{ row }">
        <NInput v-model:value="row.involvedVehicle" placeholder="车牌号" />
      </template>
      <template #responsibilityTeam-edit="{ row }">
        <NSelect
          v-model:value="row.responsibilityTeamId"
          :options="teamOptions"
          filterable
          clearable
          placeholder="责任班组"
        />
      </template>
      <template #accidentCategory-edit="{ row }">
        <NSelect
          :value="row.accidentCategory"
          :options="CATEGORY_OPTIONS"
          clearable
          placeholder="事故类别"
          @update:value="(v: string) => {
            if (v !== row.accidentCategory) {
              row.accidentNature = '';
              row.accidentNatureLevel3 = '';
            }
            row.accidentCategory = v;
          }"
        />
      </template>
      <template #accidentNature-edit="{ row }">
        <NSelect
          :value="row.accidentNature"
          :options="rowNatureOptions(row)"
          :disabled="!row.accidentCategory"
          clearable
          placeholder="事故性质"
          @update:value="(v: string) => {
            if (v !== row.accidentNature) {
              row.accidentNatureLevel3 = '';
            }
            row.accidentNature = v;
          }"
        />
      </template>
      <template #accidentNatureLevel3-edit="{ row }">
        <NSelect
          v-model:value="row.accidentNatureLevel3"
          :options="rowLevel3Options(row)"
          :disabled="!row.accidentNature"
          clearable
          placeholder="性质三级"
        />
      </template>
      <template #casualties-edit="{ row }">
        <NInputNumber v-model:value="row.casualties" :min="0" style="width: 100%" />
      </template>
      <template #injuries-edit="{ row }">
        <NInputNumber v-model:value="row.injuries" :min="0" style="width: 100%" />
      </template>
      <template #economicLoss-edit="{ row }">
        <NInputNumber v-model:value="row.economicLoss" :min="0" style="width: 100%" />
      </template>
      <template #partyDept-edit="{ row }">
        <NInput v-model:value="row.partyDept" placeholder="所属部门" />
      </template>
      <template #partySupervisor-edit="{ row }">
        <NInput v-model:value="row.partySupervisor" placeholder="当事人上级" />
      </template>
      <template #action="{ row }">
        <NSpace justify="center" :wrap="false">
          <NButton size="small" type="primary" quaternary @click="openView(row)">
            查看
          </NButton>
          <NButton size="small" type="primary" quaternary @click="openEdit(row)">
            编辑
          </NButton>
          <NPopconfirm @positive-click="onDelete(row)">
            <template #trigger>
              <NButton size="small" type="error" quaternary>删除</NButton>
            </template>
            确定删除该事故记录吗？
          </NPopconfirm>
          <NTag v-if="rowSaving.has(row.id)" size="small" :bordered="false" type="info">保存中…</NTag>
        </NSpace>
      </template>
    </HseDataGrid>

    <!-- 新增 / 编辑 弹窗 -->
    <NModal
      v-model:show="formOpen"
      :title="formMode === 'create' ? '新增事故' : '编辑事故'"
      preset="card"
      style="width: 780px; max-width: 92vw"
      :mask-closable="false"
    >
      <NForm :model="formModel" label-placement="top" size="small">
        <div class="grid grid-cols-2 gap-x-4">
          <NFormItem label="事故标题" required>
            <NInput v-model:value="formModel.title" placeholder="请输入事故标题" />
          </NFormItem>
          <NFormItem label="事故级别" required>
            <NSelect v-model:value="formModel.level" :options="LEVEL_OPTIONS" />
          </NFormItem>
          <NFormItem label="处理状态">
            <NSelect v-model:value="formModel.status" :options="STATUS_OPTIONS" />
          </NFormItem>
          <NFormItem label="发生时间" required>
            <NDatePicker
              v-model:value="formModel.occurredAt"
              type="datetime"
              style="width: 100%"
              placeholder="选择发生时间"
            />
          </NFormItem>
          <!-- 当事人：NInput 直接受控（req1 修复核心）：花名册没有的名字也能填写，下拉仅做建议 -->
          <NFormItem label="当事人">
            <div class="relative w-full">
              <NInput
                v-model:value="formModel.involvedPerson"
                placeholder="输入姓名或从花名册选择"
                clearable
                @update:value="onPersonInput"
                @blur="onPersonBlur"
                @focus="() => { if (formModel.involvedPerson) personPickOpen = true }"
              />
              <div v-if="personPickOpen && personOptions.length" class="person-suggest">
                <div
                  v-for="opt in personOptions"
                  :key="opt.employeeId"
                  class="person-suggest__item"
                  @mousedown.prevent="onPersonPick(opt)"
                >
                  {{ opt.label }}
                </div>
              </div>
            </div>
          </NFormItem>
          <NFormItem label="车牌号">
            <NInput
              v-model:value="formModel.involvedVehicle"
              placeholder="当事人车辆号牌，选填"
              clearable
            />
          </NFormItem>
          <NFormItem label="当事人角色">
            <NSelect v-model:value="formModel.involvedPersonRole" :options="PERSON_ROLE_OPTIONS" />
          </NFormItem>
          <!-- 事故类别 / 性质：报表口径，级联（req3/4） -->
          <NFormItem label="事故类别">
            <NSelect
              v-model:value="formModel.accidentCategory"
              :options="CATEGORY_OPTIONS"
              placeholder="选择报表类别"
              clearable
              @update:value="onAccidentCategoryChange"
            />
          </NFormItem>
          <NFormItem label="事故性质">
            <NSelect
              v-model:value="formModel.accidentNature"
              :options="NATURE_OPTIONS"
              placeholder="选择事故性质（随类别联动）"
              clearable
              :disabled="!formModel.accidentCategory"
              @update:value="onAccidentNatureChange"
            />
          </NFormItem>
          <NFormItem label="事故性质三级">
            <NSelect
              v-model:value="formModel.accidentNatureLevel3"
              :options="NATURE_LEVEL3_OPTIONS"
              placeholder="选择性质三级细化（随类别+性质联动）"
              clearable
              :disabled="!formModel.accidentNature"
            />
          </NFormItem>
          <NFormItem label="责任班组">
            <NSelect
              v-model:value="formModel.responsibilityTeamId"
              :options="teamOptions"
              filterable
              clearable
              :placeholder="formModel.responsibilityTeam || '选择责任班组（驾驶员/离职人员自动归乡镇作业中心）'"
              @update:value="onTeamChange"
            />
          </NFormItem>
          <!-- 当事人所属部门 + 上级：花名册自动关联（req6），结果可手改 -->
          <NFormItem label="当事人所属部门">
            <NInput
              v-model:value="formModel.partyDept"
              placeholder="自动关联（保洁员/驾驶员→所属作业中心）"
              clearable
            />
          </NFormItem>
          <NFormItem label="当事人上级">
            <NInput
              v-model:value="formModel.partySupervisor"
              placeholder="自动关联（花名册上级链）"
              clearable
            />
          </NFormItem>
          <NFormItem label="死亡人数">
            <NInputNumber v-model:value="formModel.casualties" :min="0" style="width: 100%" />
          </NFormItem>
          <NFormItem label="受伤人数">
            <NInputNumber v-model:value="formModel.injuries" :min="0" style="width: 100%" />
          </NFormItem>
          <NFormItem label="经济损失(元)">
            <NInputNumber
              v-model:value="formModel.economicLoss"
              :min="0"
              style="width: 100%"
              placeholder="选填"
            />
          </NFormItem>
        </div>
        <NFormItem label="事故描述">
          <NInput
            v-model:value="formModel.description"
            type="textarea"
            :rows="3"
            placeholder="选填"
          />
        </NFormItem>
        <NFormItem label="备注">
          <NInput
            v-model:value="formModel.remark"
            type="textarea"
            :rows="2"
            placeholder="选填"
          />
        </NFormItem>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="formOpen = false">关闭</NButton>
          <NButton type="primary" :loading="formLoading" @click="onSubmit">
            保存
          </NButton>
        </NSpace>
      </template>
    </NModal>

    <!-- 详情抽屉 -->
    <NDrawer
      v-model:show="detailDrawerVisible"
      :width="760"
      placement="right"
    >
      <NDrawerContent title="事故详情" :closable="true">
        <template v-if="currentAccident">
          <!-- 状态操作按钮 -->
          <div class="mb-4">
            <NSpace>
              <NPopconfirm
                v-if="currentAccident.status === 'reported'"
                @positive-click="handleStatusChange('investigating')"
              >
                <template #trigger>
                  <NButton type="primary">开始调查</NButton>
                </template>
                确定开始调查该事故吗？
              </NPopconfirm>
              <NPopconfirm
                v-if="currentAccident.status === 'investigating'"
                @positive-click="handleStatusChange('processing')"
              >
                <template #trigger>
                  <NButton type="primary">开始处理</NButton>
                </template>
                确定开始处理该事故吗？
              </NPopconfirm>
              <NPopconfirm
                v-if="currentAccident.status === 'processing'"
                @positive-click="handleStatusChange('closed')"
              >
                <template #trigger>
                  <NButton type="primary" danger>结案</NButton>
                </template>
                确定结案吗？
              </NPopconfirm>
              <NButton @click="openEdit(currentAccident)">编辑</NButton>
            </NSpace>
          </div>

          <!-- 事故基本信息 -->
          <NDescriptions :column="1" bordered size="small" label-placement="left">
            <NDescriptionsItem label="事故编号">
              {{ currentAccident.accidentNo || '-' }}
            </NDescriptionsItem>
            <NDescriptionsItem label="事故标题">{{ currentAccident.title }}</NDescriptionsItem>
            <NDescriptionsItem label="事故级别">
              <HseStatusTag :type="LEVEL_TAG[currentAccident.level] || 'neutral'">
                {{ LEVEL_LABEL[currentAccident.level] || currentAccident.level }}
              </HseStatusTag>
            </NDescriptionsItem>
            <NDescriptionsItem label="处理状态">
              <HseStatusTag :type="STATUS_TAG[currentAccident.status] || 'neutral'">
                {{ STATUS_LABEL[currentAccident.status] || currentAccident.status }}
              </HseStatusTag>
              <NTag v-if="currentAccident.expiryStatus" :bordered="false" class="ml-2"
                :type="EXPIRY_TAG[currentAccident.expiryStatus] === 'danger' ? 'error' : (EXPIRY_TAG[currentAccident.expiryStatus] === 'warning' ? 'warning' : 'default')">
                {{ EXPIRY_LABEL[currentAccident.expiryStatus] || currentAccident.expiryStatus }}
              </NTag>
            </NDescriptionsItem>
            <NDescriptionsItem label="发生时间">
              {{ formatDateOnly(currentAccident.occurredAt) }}
            </NDescriptionsItem>
            <NDescriptionsItem label="报告时间">
              {{ currentAccident.reportedAt ? formatDateTimeMinute(currentAccident.reportedAt) : '-' }}
            </NDescriptionsItem>
            <NDescriptionsItem label="当事人">
              <NSpace v-if="currentAccident.involvedPerson" :size="6" align="center">
                <NText>{{ currentAccident.involvedPerson }}</NText>
                <NTag
                  :bordered="false"
                  size="small"
                  :type="ROLE_TAG[currentAccident.involvedPersonRole ?? ''] || 'default'"
                >
                  {{ currentAccident.involvedPersonRole || '当事人' }}
                </NTag>
              </NSpace>
              <NText v-else depth="3">-</NText>
            </NDescriptionsItem>
            <NDescriptionsItem label="车牌号">
              {{ currentAccident.involvedVehicle || '-' }}
            </NDescriptionsItem>
            <NDescriptionsItem label="责任班组">
              {{ currentAccident.responsibilityTeam || '-' }}
            </NDescriptionsItem>
            <NDescriptionsItem label="责任认定依据">
              {{ currentAccident.responsibility || '-' }}
            </NDescriptionsItem>
            <NDescriptionsItem label="事故类别">
              {{ currentAccident.accidentCategory || '-' }}
            </NDescriptionsItem>
            <NDescriptionsItem label="事故性质">
              {{ currentAccident.accidentNature || '-' }}
            </NDescriptionsItem>
            <NDescriptionsItem label="事故性质三级">
              {{ currentAccident.accidentNatureLevel3 || '-' }}
            </NDescriptionsItem>
            <NDescriptionsItem label="当事人所属部门">
              {{ currentAccident.partyDept || '-' }}
            </NDescriptionsItem>
            <NDescriptionsItem label="当事人上级">
              {{ currentAccident.partySupervisor || '-' }}
            </NDescriptionsItem>
            <NDescriptionsItem label="伤亡情况">
              {{ currentAccident.casualties }} 死 / {{ currentAccident.injuries }} 伤
            </NDescriptionsItem>
            <NDescriptionsItem label="经济损失">
              ¥{{ formatMoney(currentAccident.economicLoss) }}
            </NDescriptionsItem>
            <NDescriptionsItem label="整改期限">
              {{ currentAccident.rectificationDeadlineDays || 30 }} 天
            </NDescriptionsItem>
            <NDescriptionsItem v-if="currentAccident.closedAt" label="结案时间">
              {{ formatDateTimeMinute(currentAccident.closedAt) }}
            </NDescriptionsItem>
            <NDescriptionsItem v-if="currentAccident.relatedHazardId" label="关联隐患">
              #{{ currentAccident.relatedHazardId }}
            </NDescriptionsItem>
            <NDescriptionsItem v-if="currentAccident.relatedEmergencyId" label="关联预案">
              #{{ currentAccident.relatedEmergencyId }}
            </NDescriptionsItem>
            <NDescriptionsItem v-if="currentAccident.description" label="事故描述">
              {{ currentAccident.description }}
            </NDescriptionsItem>
            <NDescriptionsItem v-if="currentAccident.remark" label="备注">
              {{ currentAccident.remark }}
            </NDescriptionsItem>
          </NDescriptions>

          <!-- Tab：附件 / 版本 -->
          <NTabs v-model:value="detailTab" type="line" class="mt-4">
            <NTabPane name="attachments" tab="附件">
              <div class="mb-3 flex items-center gap-2">
                <NInput
                  v-model:value="uploadVersion"
                  placeholder="版本号（选填）"
                  style="width: 160px"
                  clearable
                  size="small"
                />
                <NUpload
                  :custom-request="handleAttachmentUpload"
                  :show-file-list="false"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                >
                  <NButton size="small" type="primary" :loading="attachmentUploading">
                    上传附件
                  </NButton>
                </NUpload>
              </div>
              <HseDataGrid
                :columns="[
                  { title: '文件名', field: 'originalName', minWidth: 200, align: 'left', showOverflow: 'tooltip' },
                  { title: '版本', field: 'version', width: 80, align: 'center' },
                  { title: '上传人', field: 'uploadedBy', width: 90, align: 'center' },
                  { title: '大小', field: 'fileSize', width: 100, align: 'center', slots: { default: 'fileSize' } },
                  { title: '上传时间', field: 'createdAt', width: 160, align: 'center', slots: { default: 'createdAt' } },
                  { title: '操作', field: 'action', width: 150, align: 'center', fixed: 'right', slots: { default: 'action' } },
                ]"
                :data="attachmentList"
                :loading="attachmentLoading"
                :pager="false"
                :height="300"
              >
                <template #fileSize="{ row }">{{ formatFileSize(row.fileSize) }}</template>
                <template #createdAt="{ row }">
                  {{ row.createdAt ? formatDateTimeMinute(row.createdAt) : '-' }}
                </template>
                <template #action="{ row }">
                  <NSpace justify="center">
                    <NButton
                      size="small"
                      type="primary"
                      quaternary
                      @click="openAttachment(row.fileUrl)"
                    >
                      下载
                    </NButton>
                    <NPopconfirm @positive-click="handleDeleteAttachment(row)">
                      <template #trigger>
                        <NButton size="small" type="error" quaternary>删除</NButton>
                      </template>
                      确定删除该附件吗？
                    </NPopconfirm>
                  </NSpace>
                </template>
              </HseDataGrid>
            </NTabPane>
            <NTabPane name="versions" tab="版本记录">
              <HseDataGrid
                :columns="[
                  { title: '版本号', field: 'version', width: 100, align: 'center' },
                  { title: '变更类型', field: 'changeType', width: 100, align: 'center', slots: { default: 'changeType' } },
                  { title: '变更说明', field: 'changeSummary', minWidth: 200, align: 'left', showOverflow: 'tooltip' },
                  { title: '变更人', field: 'changedBy', width: 100, align: 'center' },
                  { title: '变更时间', field: 'createdAt', width: 170, align: 'center', slots: { default: 'createdAt' } },
                ]"
                :data="versionList"
                :loading="versionLoading"
                :pager="false"
                :height="300"
              >
                <template #changeType="{ row }">
                  <HseStatusTag :type="CHANGE_TYPE_TAG[row.changeType] || 'neutral'" size="small">
                    {{ CHANGE_TYPE_LABEL[row.changeType] || row.changeType }}
                  </HseStatusTag>
                </template>
                <template #createdAt="{ row }">
                  {{ row.createdAt ? formatDateTimeMinute(row.createdAt) : '-' }}
                </template>
              </HseDataGrid>
            </NTabPane>
          </NTabs>
        </template>
      </NDrawerContent>
    </NDrawer>

    <!-- 通用导入 -->
    <HseImportDialog
      v-model:open="importOpen"
      title="导入事故记录"
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
.cursor-pointer {
  cursor: pointer;
}
.ml-2 {
  margin-left: 8px;
}
.mt-4 {
  margin-top: 16px;
}
.mb-3 {
  margin-bottom: 12px;
}
/* 当事人建议下拉（req1：NInput 受控 + 花名册建议） */
.person-suggest {
  position: absolute;
  z-index: 20;
  left: 0;
  right: 0;
  top: calc(100% + 4px);
  max-height: 220px;
  overflow-y: auto;
  background: #fff;
  border: 1px solid var(--n-border-color, #e5e7eb);
  border-radius: 6px;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.12);
  padding: 4px 0;
}
.person-suggest__item {
  padding: 6px 12px;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.person-suggest__item:hover {
  background: #f2f3f5;
}
</style>
