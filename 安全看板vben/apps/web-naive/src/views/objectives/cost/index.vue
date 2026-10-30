<script setup lang="ts">
/**
 * 安全生产费用业务域（P2）—— 预算概览（计算财务状态）+ 费用申请（含成本归因）+ 预算 Excel 导入
 * 复用既有 Naive UI 组件；不引入 Ant Design Vue。
 */
import { computed, h, onMounted, reactive, ref } from 'vue';
import {
  NAlert,
  NButton,
  NCard,
  NDataTable,
  NForm,
  NFormItem,
  NH2,
  NInput,
  NInputNumber,
  NModal,
  NSelect,
  NSpace,
  NStatistic,
  NTag,
  NUpload,
  useMessage,
} from 'naive-ui';
import type { DataTableColumns, UploadFileInfo } from 'naive-ui';
import {
  getBudgetOverview,
  getCostStats,
  getCostRequests,
  createCostRequest,
  deleteCostRequest,
  previewBudgetImport,
  confirmBudgetImport,
  getBizDomains,
  getOpTypes,
  getInvestCategories,
  getAllocations,
  createAllocation,
  updateAllocation,
  deleteAllocation,
  getCostActuals,
} from '#/api/hse/cost';
import type { CostApi } from '#/api/hse/cost';
// 删除确认用离散 dialog：应用根无 NDialogProvider（项目既有解法，见 hse/employee-import-v2）
import { dialog } from '#/adapter/naive';
import { useAccess } from '@vben/access';

const message = useMessage();

// 写操作权限（仅 UX 置灰；安全边界在后端 requireRole，见 routes/cost/main.js:18）
const { hasAccessByRoles } = useAccess();
const canWriteCost = computed(() =>
  hasAccessByRoles(['system_admin', 'admin', 'safety_manager', 'hse_manager']),
);

const budgets = ref<CostApi.BudgetOverviewItem[]>([]);
const budgetsTotal = ref(0);
const requests = ref<CostApi.CostRequestItem[]>([]);
const requestsTotal = ref(0);
const stats = ref<CostApi.CostStats>({ totalActual: 0, allocatedTotal: 0, unattributedActual: 0, byDomain: [], byCategory: [] });

// ===================== 成本分摊（GAP-03）状态 =====================
const allocations = ref<CostApi.AllocationItem[]>([]);
const allocationsTotal = ref(0);
const actuals = ref<CostApi.CostActualItem[]>([]);
const allOpTypes = ref<{ label: string; value: number }[]>([]);

const bizDomains = ref<{ label: string; value: number }[]>([]);
const opTypes = ref<{ label: string; value: number }[]>([]);
const investCategories = ref<{ label: string; value: number }[]>([]);
const budgetOptions = ref<{ label: string; value: number }[]>([]);

const sourceTypeOptions = [
  { label: '隐患', value: 'hazard' },
  { label: '事故', value: 'accident' },
  { label: '检查', value: 'inspection' },
  { label: '风险控制', value: 'risk_control' },
  { label: '培训需求', value: 'training_need' },
  { label: '应急需求', value: 'emergency' },
  { label: '年度安全计划', value: 'annual_plan' },
  { label: '日常安全投入', value: 'routine' },
  { label: '其他', value: 'other' },
];

const objectTypeOptions = [
  { label: '公司', value: 'company' },
  { label: '作业中心', value: 'center' },
  { label: '乡镇', value: 'township' },
  { label: '作业单位', value: 'unit' },
  { label: '车辆', value: 'vehicle' },
  { label: '设备', value: 'equipment' },
  { label: '地点', value: 'location' },
  { label: '业务事件', value: 'event' },
];

const loading = ref(false);
const showModal = ref(false);
const submitting = ref(false);

const form = reactive<CostApi.CostRequestCreate & { bizDomainId?: number | null; opTypeId?: number | null; investCategoryId?: number | null; objectType?: string | null; objectName?: string | null; eventType?: string | null; eventId?: number | null; amount?: number | null }>({
  budgetId: null,
  title: '',
  sourceType: 'hazard',
  sourceId: null,
  applicantName: '',
  applyAmount: 0,
  purpose: '',
  bizDomainId: null,
  opTypeId: null,
  investCategoryId: null,
  objectType: 'transfer_station',
  objectName: '',
  eventType: 'hazard',
  eventId: null,
  amount: 0,
});

// ===================== 预算 Excel 导入状态 =====================
const showImportModal = ref(false);
const importFile = ref<File | null>(null);
const importPreview = ref<CostApi.BudgetImportPreviewResult | null>(null);
const importResult = ref<CostApi.BudgetImportConfirmResult | null>(null);
const importBatchNo = ref(''); // 预览返回的批次号：确认时必须带回（服务端核对文件指纹）
const previewing = ref(false);
const confirming = ref(false);
const importError = ref('');

// ===================== 分摊模态框状态（GAP-03） =====================
const showAllocModal = ref(false);
const allocSubmitting = ref(false);
const allocEditingId = ref<number | null>(null);
const allocForm = reactive<{
  costActualId: number | null;
  amount: number | null;
  bizDomainId: number | null;
  opTypeId: number | null;
  investCategoryId: number | null;
  objectName: string;
  remark: string;
}>({
  costActualId: null,
  amount: null,
  bizDomainId: null,
  opTypeId: null,
  investCategoryId: null,
  objectName: '',
  remark: '',
});

async function loadAll() {
  loading.value = true;
  try {
    const [b, r, s, al, ac] = await Promise.all([
      getBudgetOverview({ pageSize: 100 }),
      getCostRequests({ pageSize: 100 }),
      getCostStats({}),
      getAllocations({ pageSize: 200 }),
      getCostActuals({ pageSize: 200 }),
    ]);
    budgets.value = b.list;
    budgetsTotal.value = b.total;
    requests.value = r.list;
    requestsTotal.value = r.total;
    stats.value = s;
    allocations.value = al.list;
    allocationsTotal.value = al.total;
    actuals.value = ac.list;
    budgetOptions.value = b.list.map((x) => ({ label: `${x.projectName}-${x.itemName}`, value: x.budgetId }));
  } catch (e) {
    message.error('数据加载失败');
  } finally {
    loading.value = false;
  }
}

async function loadRefs() {
  try {
    const [d, c, o] = await Promise.all([getBizDomains(), getInvestCategories(), getOpTypes()]);
    bizDomains.value = d.map((x) => ({ label: x.name, value: x.id }));
    investCategories.value = c.map((x) => ({ label: x.name, value: x.id }));
    allOpTypes.value = o.map((x) => ({ label: x.name, value: x.id }));
  } catch (e) { /* ignore */ }
}

async function onBizDomainChange(v: number | null) {
  form.opTypeId = null;
  opTypes.value = [];
  if (!v) return;
  const r = await getOpTypes(v);
  opTypes.value = r.map((x) => ({ label: x.name, value: x.id }));
}

function openCreate() {
  form.budgetId = null;
  form.title = '';
  form.sourceType = 'hazard';
  form.sourceId = null;
  form.applicantName = '';
  form.applyAmount = 0;
  form.purpose = '';
  form.bizDomainId = null;
  form.opTypeId = null;
  form.investCategoryId = null;
  form.objectType = 'transfer_station';
  form.objectName = '';
  form.eventType = 'hazard';
  form.eventId = null;
  form.amount = 0;
  opTypes.value = [];
  showModal.value = true;
}

async function submitCreate() {
  if (!form.title) { message.warning('请填写申请标题'); return; }
  if (!form.applyAmount || form.applyAmount <= 0) { message.warning('请填写申请金额'); return; }
  submitting.value = true;
  try {
    const payload: CostApi.CostRequestCreate = {
      budgetId: form.budgetId,
      title: form.title,
      sourceType: form.sourceType,
      sourceId: form.sourceId,
      applicantName: form.applicantName,
      applyAmount: form.applyAmount,
      purpose: form.purpose,
      allocations: [
        {
          bizDomainId: form.bizDomainId,
          opTypeId: form.opTypeId,
          investCategoryId: form.investCategoryId,
          objectType: form.objectType,
          objectName: form.objectName,
          eventType: form.eventType,
          eventId: form.eventId,
          amount: form.amount || form.applyAmount,
        },
      ],
    };
    await createCostRequest(payload);
    message.success('费用申请已创建');
    showModal.value = false;
    await loadAll();
  } catch (e) {
    // 拦截器已弹提示，这里不重复 toast
  } finally {
    submitting.value = false;
  }
}

async function removeRequest(id: number) {
  try {
    await deleteCostRequest(id);
    message.success('已删除');
    await loadAll();
  } catch (e) { /* 拦截器已提示 */ }
}

// ===================== 分摊展示辅助（GAP-03） =====================
// 注意：pg 驱动把 bigint/numeric 序列化为字符串（如 id:"61"、amount:"1600.00"），
// 金额入 NInputNumber / 数值比较前一律 Number() 转换，避免「输入框显示为空」等类型错位。
const requestTitle = (id: number | null) => {
  if (id == null) return '计划归因';
  const r = requests.value.find((x) => String(x.id) === String(id));
  return r ? r.title : `申请#${id}`;
};
const actualLabel = (a: CostApi.CostActualItem) =>
  `#${a.id} · ${requestTitle(a.requestId)} · ${yen(Number(a.actualAmount))}${a.actualDate ? ` · ${String(a.actualDate).slice(0, 10)}` : ''}`;
const actualOptions = computed(() => actuals.value.map((a) => ({ label: actualLabel(a), value: a.id })));
const dimName = (list: { label: string; value: number }[], id: number | null) =>
  id == null ? '未归集' : (list.find((x) => x.value === id)?.label ?? `#${id}`);

function resetAllocForm() {
  allocForm.costActualId = null;
  allocForm.amount = null;
  allocForm.bizDomainId = null;
  allocForm.opTypeId = null;
  allocForm.investCategoryId = null;
  allocForm.objectName = '';
  allocForm.remark = '';
}

function openAllocCreate() {
  resetAllocForm();
  allocEditingId.value = null;
  opTypes.value = [];
  showAllocModal.value = true;
}

async function openAllocEdit(row: CostApi.AllocationItem) {
  resetAllocForm();
  allocEditingId.value = row.id;
  allocForm.costActualId = row.costActualId ?? null;
  allocForm.amount = row.amount != null ? Number(row.amount) : null;
  allocForm.bizDomainId = row.bizDomainId ?? null;
  allocForm.investCategoryId = row.investCategoryId ?? null;
  allocForm.objectName = row.objectName ?? '';
  allocForm.remark = row.remark ?? '';
  opTypes.value = [];
  if (row.bizDomainId) {
    try {
      const r = await getOpTypes(row.bizDomainId);
      opTypes.value = r.map((x) => ({ label: x.name, value: x.id }));
    } catch (e) { /* 忽略：下拉为空不影响编辑其它字段 */ }
  }
  allocForm.opTypeId = row.opTypeId ?? null;
  showAllocModal.value = true;
}

async function onAllocDomainChange(v: number | null) {
  allocForm.opTypeId = null;
  opTypes.value = [];
  if (!v) return;
  const r = await getOpTypes(v);
  opTypes.value = r.map((x) => ({ label: x.name, value: x.id }));
}

function onAllocActualChange(v: number | null) {
  const a = actuals.value.find((x) => String(x.id) === String(v));
  // 刚性总额规则：首笔必须一次补齐 → 默认带出实际支出全额（Number 转换：pg 数值为字符串）；后端仍是最终裁判
  allocForm.amount = a ? Number(a.actualAmount) : null;
  if (a && allocations.value.some((x) => String(x.costActualId) === String(a.id))) {
    message.warning(`实际支出 #${a.id} 已有分摊记录：后端要求「追加后净额恰好相等」，继续提交将被拒绝`);
  }
}

async function submitAlloc() {
  if (allocSubmitting.value) return; // 防重复提交（双击/连点）
  // 局部常量窄化：属性窄化会被后续函数调用重置，局部 const 在 strictNullChecks 下稳定
  const costActualId = allocForm.costActualId;
  const amount = allocForm.amount;
  if (!costActualId) { message.warning('请选择关联的实际支出'); return; }
  if (!amount || amount <= 0) { message.warning('请填写分摊金额（大于 0）'); return; }
  allocSubmitting.value = true;
  try {
    if (allocEditingId.value) {
      // 显式 UPDATE（不用 DELETE+POST 替代）；request_id / costActualId 不随修改提交
      const payload: CostApi.AllocationUpdate = {
        amount,
        bizDomainId: allocForm.bizDomainId,
        opTypeId: allocForm.opTypeId,
        investCategoryId: allocForm.investCategoryId,
        objectName: allocForm.objectName || undefined,
        remark: allocForm.remark || undefined,
      };
      await updateAllocation(allocEditingId.value, payload);
      message.success('分摊已修改');
    } else {
      const payload: CostApi.AllocationCreate = {
        costActualId,
        amount,
        bizDomainId: allocForm.bizDomainId,
        opTypeId: allocForm.opTypeId,
        investCategoryId: allocForm.investCategoryId,
        objectName: allocForm.objectName || undefined,
        remark: allocForm.remark || undefined,
      };
      await createAllocation(payload);
      message.success('分摊已创建');
    }
    showAllocModal.value = false;
    await loadAll();
  } catch (e) {
    // 业务拒绝（HTTP 200 + code<0）：全局拦截器已用服务端 message 弹提示，此处不重复 toast
  } finally {
    allocSubmitting.value = false;
  }
}

function removeAllocation(row: CostApi.AllocationItem) {
  dialog.warning({
    title: '删除确认',
    content: row.costActualId
      ? `该分摊已关联实际支出 #${row.costActualId}（${yen(Number(row.amount))}）。后端规定「已参与归因的分摊不可删除」（软删除受总额约束保护），删除将被拒绝；计划归因方可删除。确定继续？`
      : `将删除计划归因（${requestTitle(row.requestId)}，${yen(Number(row.amount))}）。确定继续？`,
    positiveText: '确定删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await deleteAllocation(row.id);
        message.success('已删除');
        await loadAll();
      } catch (e) { /* 拦截器已提示（如归因完整性保护） */ }
    },
  });
}

// ===================== 预算导入交互 =====================
function openImport() {
  showImportModal.value = true;
  resetImport();
}

function resetImport() {
  importFile.value = null;
  importPreview.value = null;
  importResult.value = null;
  importBatchNo.value = '';
  importError.value = '';
  previewing.value = false;
  confirming.value = false;
}

function extractErr(e: any, fallback: string): string {
  const status = e?.response?.status;
  const serverMsg = e?.response?.data?.message ?? e?.response?.data?.error ?? e?.message;
  if (status === 403) return '权限不足：仅管理员/安全主管可导入预算';
  if (status === 401) return '登录已失效，请重新登录';
  if (serverMsg) return String(serverMsg);
  return fallback;
}

async function handleImportFileChange(data: { file: UploadFileInfo }) {
  const raw = data?.file?.file;
  if (!raw) return;
  importFile.value = raw;
  importResult.value = null;
  importError.value = '';
  await runPreview();
}

async function runPreview() {
  if (!importFile.value) { message.warning('请先选择 Excel 文件'); return; }
  previewing.value = true;
  importError.value = '';
  try {
    const r = await previewBudgetImport(importFile.value);
    importPreview.value = r;
    importBatchNo.value = r.batchNo || '';
    importResult.value = null;
    const parts = [`共 ${r.total} 行`];
    if (r.duplicateCount) parts.push(`重复 ${r.duplicateCount} 行（将跳过）`);
    if (r.errorCount) parts.push(`错误 ${r.errorCount} 行（将跳过）`);
    if (r.alreadyImported) parts.push(`该文件此前已导入过（批次 ${r.previousBatchNo}），重复行将被跳过`);
    message.success(`预览完成：${parts.join('，')}`);
  } catch (e) {
    importPreview.value = null;
    importBatchNo.value = '';
    importError.value = extractErr(e, '预览失败：文件可能不是有效的 Excel，或网络异常');
  } finally {
    previewing.value = false;
  }
}

async function runConfirm() {
  if (!importFile.value) { message.warning('请先选择 Excel 文件'); return; }
  if (!importBatchNo.value) { message.warning('请先执行预览，再确认导入'); return; }
  confirming.value = true;
  importError.value = '';
  try {
    const r = await confirmBudgetImport(importFile.value, importBatchNo.value);
    importResult.value = r;
    if (r.duplicateConfirm) {
      message.info(`该批次已确认过（批次 ${r.batchNo}），不会重复插入：新增 ${r.inserted}，跳过 ${r.skipped}，失败 ${r.failed}`);
    } else {
      message.success(`导入完成：新增 ${r.inserted}，跳过 ${r.skipped}，失败 ${r.failed}`);
    }
    await loadAll();
  } catch (e) {
    importError.value = extractErr(e, '导入失败：网络异常或服务端错误，未写入任何数据');
  } finally {
    confirming.value = false;
  }
}

function statusTag(status: string) {
  const map: Record<string, 'default' | 'warning' | 'success' | 'error' | 'info'> = {
    draft: 'default',
    submitted: 'info',
    approved: 'success',
    rejected: 'error',
    closed: 'warning',
  };
  return map[status] ?? 'default';
}

const budgetRowKey = (r: CostApi.BudgetOverviewItem) => r.budgetId;
const requestRowKey = (r: CostApi.CostRequestItem) => r.id;

const yen = (v: number | null | undefined) => `¥${(v ?? 0).toLocaleString()}`;

const budgetColumns: DataTableColumns<CostApi.BudgetOverviewItem> = [
  { title: '年度', key: 'budgetYear', width: 70 },
  { title: '项目', key: 'projectName' },
  { title: '事项', key: 'itemName' },
  { title: '预算金额', key: 'budgetAmount', width: 110, render: (r) => yen(r.budgetAmount) },
  { title: '已承诺', key: 'committed', width: 110, render: (r) => yen(r.committed) },
  { title: '待执行承诺', key: 'pendingCommitted', width: 120, render: (r) => yen(r.pendingCommitted) },
  { title: '实际净支出', key: 'actual', width: 120, render: (r) => yen(r.actual) },
  { title: '未支出余额', key: 'balance', width: 120, render: (r) => yen(r.balance) },
  { title: '未承诺可用', key: 'availableUncommitted', width: 120, render: (r) => yen(r.availableUncommitted) },
  { title: '承诺率', key: 'commitmentRate', width: 90, render: (r) => `${r.commitmentRate}%` },
  { title: '执行率', key: 'executionRate', width: 90, render: (r) => `${r.executionRate}%` },
  { title: '状态', key: 'status', width: 80, render: (r) => h(NTag, null, { default: () => r.status }) },
];

const requestColumns: DataTableColumns<CostApi.CostRequestItem> = [
  { title: '单号', key: 'requestNo', width: 160 },
  { title: '标题', key: 'title' },
  { title: '来源', key: 'sourceType' },
  { title: '申请人', key: 'applicantName' },
  { title: '申请金额', key: 'applyAmount', render: (r) => yen(r.applyAmount) },
  {
    title: '状态',
    key: 'status',
    render: (r) => h(NTag, { type: statusTag(r.status) }, { default: () => r.status }),
  },
  {
    title: '操作',
    key: 'actions',
    render: (r) =>
      h(
        NButton,
        { size: 'small', type: 'error', quaternary: true, disabled: !canWriteCost.value, onClick: () => removeRequest(r.id) },
        { default: () => '删除' },
      ),
  },
];

const allocRowKey = (r: CostApi.AllocationItem) => r.id;

const allocationColumns: DataTableColumns<CostApi.AllocationItem> = [
  { title: 'ID', key: 'id', width: 60 },
  { title: '关联申请', key: 'requestId', width: 150, render: (r) => requestTitle(r.requestId) },
  {
    title: '关联实际支出',
    key: 'costActualId',
    width: 110,
    render: (r) =>
      r.costActualId == null
        ? h(NTag, { type: 'info', size: 'small' }, { default: () => '计划归因' })
        : `#${r.costActualId}`,
  },
  { title: '金额', key: 'amount', width: 110, render: (r) => yen(Number(r.amount)) },
  {
    title: '记录类型',
    key: 'recordType',
    width: 90,
    render: (r) =>
      h(
        NTag,
        { type: r.recordType === 'reversal' ? 'warning' : 'success', size: 'small' },
        { default: () => (r.recordType === 'reversal' ? '冲销' : '正向') },
      ),
  },
  { title: '业务领域', key: 'bizDomainId', width: 130, render: (r) => dimName(bizDomains.value, r.bizDomainId) },
  { title: '作业类型', key: 'opTypeId', width: 120, render: (r) => dimName(allOpTypes.value, r.opTypeId) },
  { title: '投入类别', key: 'investCategoryId', width: 120, render: (r) => dimName(investCategories.value, r.investCategoryId) },
  { title: '对象', key: 'objectName', render: (r) => r.objectName || '-' },
  { title: '备注', key: 'remark', render: (r) => r.remark || '-' },
  {
    title: '操作',
    key: 'actions',
    width: 130,
    render: (r) =>
      h(NSpace, null, {
        default: () => [
          h(
            NButton,
            { size: 'small', quaternary: true, disabled: !canWriteCost.value, onClick: () => openAllocEdit(r) },
            { default: () => '编辑' },
          ),
          h(
            NButton,
            { size: 'small', type: 'error', quaternary: true, disabled: !canWriteCost.value, onClick: () => removeAllocation(r) },
            { default: () => '删除' },
          ),
        ],
      }),
  },
];

const previewRowKey = (r: CostApi.BudgetImportPreviewRow) => r.rowIndex;
const previewStatusTag = (s: string) => (s === 'error' ? 'error' : s === 'duplicate' ? 'warning' : 'success');
const previewColumns: DataTableColumns<CostApi.BudgetImportPreviewRow> = [
  { title: '行号', key: 'rowIndex', width: 60 },
  { title: '年度', key: 'budget_year', width: 70, render: (r) => String(r.data?.budget_year ?? '') },
  { title: '项目', key: 'project_name', render: (r) => String(r.data?.project_name ?? '') },
  { title: '事项', key: 'item_name', render: (r) => String(r.data?.item_name ?? '') },
  { title: '金额', key: 'budget_amount', width: 110, render: (r) => yen(Number(r.data?.budget_amount ?? 0)) },
  {
    title: '状态',
    key: 'status',
    width: 90,
    render: (r) => h(NTag, { type: previewStatusTag(r.status) }, { default: () => (r.status === 'error' ? '错误' : r.status === 'duplicate' ? '重复' : '可导入') }),
  },
  { title: '错误/原因', key: 'errors', render: (r) => (r.errors?.length ? r.errors.join('；') : (r.duplicate ? (r.duplicateReason || '预算编码已存在或文件内重复') : '')) },
];

onMounted(() => {
  loadAll();
  loadRefs();
});
</script>

<template>
  <div class="cost-page">
    <n-h2>安全生产费用业务域</n-h2>

    <n-card title="费用统计（按实际支出归集）" :bordered="false" class="mb">
      <n-space>
        <n-statistic label="实际净支出合计" :value="stats.totalActual" />
        <n-statistic label="已归集分摊" :value="stats.allocatedTotal" />
        <n-statistic label="待归因（无分摊）" :value="stats.unattributedActual" />
        <n-statistic
          v-for="d in stats.byDomain"
          :key="d.bizDomain"
          :label="`领域：${d.bizDomain}`"
          :value="d.amount"
        />
        <n-statistic
          v-for="c in stats.byCategory"
          :key="c.investCategory"
          :label="`类别：${c.investCategory}`"
          :value="c.amount"
        />
      </n-space>
    </n-card>

    <n-card title="预算概览（余额/可用/执行率由交易表计算）" :bordered="false" class="mb">
      <template #header-extra>
        <n-button type="primary" :disabled="!canWriteCost" @click="openImport">导入预算</n-button>
      </template>
      <n-data-table
        :columns="budgetColumns"
        :data="budgets"
        :loading="loading"
        :row-key="budgetRowKey"
        :pagination="{ pageSize: 10 }"
      />
    </n-card>

    <n-card title="费用申请（关联隐患/事故/检查等来源）" :bordered="false">
      <template #header-extra>
        <n-button type="primary" :disabled="!canWriteCost" @click="openCreate">新建申请</n-button>
      </template>
      <n-data-table
        :columns="requestColumns"
        :data="requests"
        :loading="loading"
        :row-key="requestRowKey"
        :pagination="{ pageSize: 10 }"
      />
    </n-card>

    <n-card title="成本分摊（归因）" :bordered="false" class="mb">
      <template #header-extra>
        <n-button type="primary" :disabled="!canWriteCost" @click="openAllocCreate">新增分摊</n-button>
      </template>
      <n-alert type="info" :bordered="false" class="mb">
        分摊必须关联实际支出。后端规则：一次提交后「有效分摊净额」须恰好等于该实际支出金额（不足/超额均拒绝，仅可一次补齐）；调整归因请用编辑（被拒时原值保持不变）；已参与归因的分摊不可删除（软删除受总额约束保护），计划归因可删除。维度缺省时统计中单列「未归集」。
      </n-alert>
      <n-data-table
        :columns="allocationColumns"
        :data="allocations"
        :loading="loading"
        :row-key="allocRowKey"
        :pagination="{ pageSize: 10 }"
      />
    </n-card>

    <n-modal v-model:show="showModal" title="新建费用申请" preset="card" style="width: 640px">
      <n-form label-placement="left" :label-width="110">
        <n-form-item label="关联预算">
          <n-select v-model:value="form.budgetId" :options="budgetOptions" clearable placeholder="可选" />
        </n-form-item>
        <n-form-item label="标题" required>
          <n-input v-model:value="form.title" placeholder="如：转运站警示标识整改费用" />
        </n-form-item>
        <n-form-item label="来源类型">
          <n-select v-model:value="form.sourceType" :options="sourceTypeOptions" />
        </n-form-item>
        <n-form-item label="来源ID">
          <n-input-number v-model:value="form.sourceId" :min="0" clearable />
        </n-form-item>
        <n-form-item label="申请人">
          <n-input v-model:value="form.applicantName" />
        </n-form-item>
        <n-form-item label="申请金额" required>
          <n-input-number v-model:value="form.applyAmount" :min="0" />
        </n-form-item>
        <n-form-item label="成本归因-领域">
          <n-select v-model:value="form.bizDomainId" :options="bizDomains" clearable placeholder="环卫/市政园林/公司层面" @update:value="onBizDomainChange" />
        </n-form-item>
        <n-form-item label="成本归因-作业类型">
          <n-select v-model:value="form.opTypeId" :options="opTypes" clearable placeholder="随领域联动" />
        </n-form-item>
        <n-form-item label="成本归因-投入类别">
          <n-select v-model:value="form.investCategoryId" :options="investCategories" clearable placeholder="隐患整改/劳保用品/..." />
        </n-form-item>
        <n-form-item label="具体对象类型">
          <n-select v-model:value="form.objectType" :options="objectTypeOptions" />
        </n-form-item>
        <n-form-item label="具体对象名称">
          <n-input v-model:value="form.objectName" placeholder="如：某转运站" />
        </n-form-item>
        <n-form-item label="关联事件类型">
          <n-input v-model:value="form.eventType" placeholder="如：hazard/accident" />
        </n-form-item>
        <n-form-item label="关联事件ID">
          <n-input-number v-model:value="form.eventId" :min="0" clearable />
        </n-form-item>
        <n-form-item label="归因金额">
          <n-input-number v-model:value="form.amount" :min="0" />
        </n-form-item>
        <n-form-item label="用途/说明">
          <n-input v-model:value="form.purpose" type="textarea" />
        </n-form-item>
      </n-form>
      <template #footer>
        <n-space justify="end">
          <n-button @click="showModal = false">取消</n-button>
          <n-button type="primary" :loading="submitting" @click="submitCreate">提交</n-button>
        </n-space>
      </template>
    </n-modal>

    <n-modal v-model:show="showAllocModal" :title="allocEditingId ? `编辑分摊 #${allocEditingId}` : '新增分摊'" preset="card" style="width: 640px">
      <n-form label-placement="left" :label-width="110">
        <n-form-item label="关联实际支出" required>
          <n-select
            v-model:value="allocForm.costActualId"
            :options="actualOptions"
            :disabled="!!allocEditingId"
            placeholder="选择实际支出（必填）"
            @update:value="onAllocActualChange"
          />
        </n-form-item>
        <n-form-item label="分摊金额" required>
          <n-input-number v-model:value="allocForm.amount" :min="0" :precision="2" style="width: 100%" />
        </n-form-item>
        <n-form-item label="业务领域">
          <n-select v-model:value="allocForm.bizDomainId" :options="bizDomains" clearable placeholder="环卫/市政园林/公司层面" @update:value="onAllocDomainChange" />
        </n-form-item>
        <n-form-item label="作业类型">
          <n-select v-model:value="allocForm.opTypeId" :options="opTypes" clearable placeholder="随领域联动" />
        </n-form-item>
        <n-form-item label="投入类别">
          <n-select v-model:value="allocForm.investCategoryId" :options="investCategories" clearable placeholder="隐患整改/劳保用品/..." />
        </n-form-item>
        <n-form-item label="对象名称">
          <n-input v-model:value="allocForm.objectName" placeholder="如：某转运站（可选）" />
        </n-form-item>
        <n-form-item label="备注">
          <n-input v-model:value="allocForm.remark" type="textarea" placeholder="可选" />
        </n-form-item>
      </n-form>
      <template #footer>
        <n-space justify="end">
          <n-button @click="showAllocModal = false">取消</n-button>
          <n-button type="primary" :loading="allocSubmitting" @click="submitAlloc">提交</n-button>
        </n-space>
      </template>
    </n-modal>

    <n-modal v-model:show="showImportModal" title="导入预算（Excel）" preset="card" style="width: 760px">
      <n-space vertical :size="12">
        <n-alert type="info" :bordered="false">
          选择 .xlsx/.xls/.csv 预算文件 → 自动预览（识别字段、总数、错误与重复）→ 确认后正式写入。预览与确认绑定同一批次与文件指纹（换文件需重新预览）；有编码按编码判重、无编码按「年度+项目+事项+金额」判重，重复自动跳过，不覆盖既有预算。
        </n-alert>

        <n-upload
          :max="1"
          accept=".xlsx,.xls,.xlsm,.csv"
          :default-upload="false"
          :show-file-list="true"
          @change="handleImportFileChange"
        >
          <n-button>选择 Excel 文件</n-button>
        </n-upload>

        <div v-if="previewing" class="muted">正在解析与预览…</div>

        <n-alert v-if="importError" type="error" :bordered="false">{{ importError }}</n-alert>

        <n-alert v-if="importPreview && importPreview.alreadyImported" type="warning" :bordered="false">
          该文件与此前已成功导入的批次（{{ importPreview.previousBatchNo }}）内容一致，重复预算将被跳过，不会覆盖既有数据。
        </n-alert>

        <template v-if="importPreview">
          <n-space>
            <n-tag>共 {{ importPreview.total }} 行</n-tag>
            <n-tag type="success">可导入 {{ importPreview.total - importPreview.errorCount - importPreview.duplicateCount }}</n-tag>
            <n-tag v-if="importPreview.duplicateCount" type="warning">重复 {{ importPreview.duplicateCount }} 行</n-tag>
            <n-tag v-if="importPreview.errorCount" type="error">错误 {{ importPreview.errorCount }} 行</n-tag>
            <n-tag v-if="importBatchNo" type="info">批次 {{ importBatchNo }}</n-tag>
          </n-space>
          <n-data-table
            :columns="previewColumns"
            :data="importPreview.rows"
            :row-key="previewRowKey"
            :max-height="260"
            size="small"
            :pagination="{ pageSize: 8 }"
          />
        </template>

        <n-alert v-if="importResult" :type="importResult.duplicateConfirm ? 'info' : 'success'" :bordered="false">
          <span v-if="importResult.duplicateConfirm">该批次已确认过，不会重复插入。</span>
          导入结果（批次 {{ importResult.batchNo }}）：新增 {{ importResult.inserted }}，跳过 {{ importResult.skipped }}，失败 {{ importResult.failed }}，共 {{ importResult.total }} 行。
          <div v-if="importResult.errors && importResult.errors.length" style="margin-top: 4px">
            失败原因（前 {{ importResult.errors.length }} 条）：{{ importResult.errors.join('；') }}
          </div>
        </n-alert>
      </n-space>

      <template #footer>
        <n-space justify="end">
          <n-button :disabled="previewing || confirming" @click="resetImport">重置</n-button>
          <n-button :disabled="!importFile || previewing" :loading="previewing" @click="runPreview">重新预览</n-button>
          <n-button
            type="primary"
            :disabled="!importPreview || importPreview.total - importPreview.errorCount - importPreview.duplicateCount <= 0"
            :loading="confirming"
            @click="runConfirm"
          >
            确认导入
          </n-button>
        </n-space>
      </template>
    </n-modal>
  </div>
</template>

<style scoped>
.cost-page { padding: 16px; }
.mb { margin-bottom: 16px; }
.muted { color: #999; }
</style>
