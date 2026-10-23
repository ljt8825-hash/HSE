<script lang="ts" setup>
/**
 * 培训记录台账（web-naive）——按培训人员月度汇总
 *
 * 迁移自 views/training/ledger/index.vue
 * 路由路径：/ledger/training
 */
import { computed, nextTick, onActivated, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import type { VxeTableGridColumns } from '@vben/plugins/vxe-table';
import {
  NButton,
  NCheckbox,
  NDrawer,
  NDrawerContent,
  NForm,
  NFormItem,
  NInput,
  NModal,
  NPopconfirm,
  NSelect,
  NSpace,
  NSpin,
  NSwitch,
  NTag,
  NText,
  NTooltip,
} from 'naive-ui';
import { $t } from '#/locales';

import {
  HseActionBar,
  HseDataGrid,
  HseImportDialog,
  HsePageLayout,
  HseStatusTag,
  type HseActionKey,
  useLedgerCrud,
} from '#/components/hse';
import {
  batchCreateTrainingPersonnelRecords,
  batchDeleteTrainingPersonnelRecords,
  getTrainingPersonnelRecords,
  getTrainingPersonnelSummary,
  getTrainingLedgerMonths,
  getTrainingPlanContentOptions,
  getTrainingTypeOptions,
  importTrainingLedgerMonthly,
  type PlanContentOption,
  type TrainingPersonnelApi,
} from '#/api/hse/training';
import {
  getTrainingUntrained,
} from '#/api/trainingOcr';
import { useGenericImport } from '#/views/hse/_shared/useGenericImport';
import { message } from '#/adapter/naive';

defineOptions({ name: 'HseTrainingLedger' });

// ===================== 月份 =====================
const pad = (n: number) => String(n).padStart(2, '0');
function monthOptions(count = 12): { label: string; value: string }[] {
  const now = new Date();
  const list: { label: string; value: string }[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    list.push({ label: value, value });
  }
  return list;
}
const months = ref<{ label: string; value: string }[]>(monthOptions());
const currentMonth = months.value[0]?.value ?? '';
const selectedMonth = ref(currentMonth);

const route = useRoute();
const drillMonth = computed(() =>
  typeof route.query.month === 'string' ? route.query.month : '',
);

const hlEmpId = ref<number | null>(null);
let hlTimer: ReturnType<typeof setTimeout> | null = null;
function ledgerRowClassName(params: { row: any }): string {
  return hlEmpId.value != null && Number(params?.row?.employeeId) === hlEmpId.value
    ? 'training-locate-row'
    : '';
}
function scrollToHlRow() {
  if (hlEmpId.value == null) return;
  nextTick(() => {
    setTimeout(() => {
      document.querySelector<HTMLElement>('.vxe-body--row.training-locate-row')?.scrollIntoView({
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

function applyExternalLocate() {
  const qEmp = typeof route.query.emp === 'string' ? Number(route.query.emp) : NaN;
  if (!Number.isFinite(qEmp) || qEmp <= 0) return;
  hlEmpId.value = qEmp;
  scrollToHlRow();
  scheduleHlFadeOut();
}
onActivated(() => {
  applyExternalLocate();
});

// ===================== 使用通用 CRUD composable =====================
const crud = useLedgerCrud<TrainingPersonnelApi.SummaryItem>({
  api: {
    list: async (params: any) => {
      const res = await getTrainingPersonnelSummary(params.month ?? selectedMonth.value);
      return { list: res.list ?? [], total: res.total ?? 0 };
    },
    batchDelete: async (ids: number[], month?: string) => {
      return await batchDeleteTrainingPersonnelRecords(ids, month ?? selectedMonth.value);
    },
  },
  defaultPageSize: 20,
  keyField: 'employeeId',
});

const { loading, rows: summaryRows, total: summaryTotal, checkedIds, loadList: loadSummaryBase } = crud;

// 包装 loadSummary 以支持月份参数和外部定位
async function loadSummary() {
  await loadSummaryBase({ month: selectedMonth.value });
  // 外部定位
  const qEmp = typeof route.query.emp === 'string' ? Number(route.query.emp) : NaN;
  if (Number.isFinite(qEmp) && qEmp > 0) {
    hlEmpId.value = qEmp;
    scrollToHlRow();
    scheduleHlFadeOut();
  }
}

// ===================== 明细抽屉 =====================
const detailOpen = ref(false);
const detailLoading = ref(false);
const detailRows = ref<TrainingPersonnelApi.PersonnelRecordItem[]>([]);
const detailTotal = ref(0);
const detailMonth = ref(currentMonth);
const detailPerson = ref<{ employeeId: number; name: string }>({ employeeId: 0, name: '' });
const detailPage = ref(1);
const detailPageSize = 10;

async function openPersonDetail(row: TrainingPersonnelApi.SummaryItem) {
  detailPerson.value = { employeeId: row.employeeId, name: row.name };
  detailMonth.value = selectedMonth.value;
  detailOpen.value = true;
  detailPage.value = 1;
  await loadDetail();
}

async function loadDetail() {
  detailLoading.value = true;
  try {
    const res = await getTrainingPersonnelRecords(
      detailPerson.value.employeeId,
      detailMonth.value,
      detailPage.value,
      detailPageSize,
    );
    detailRows.value = res.list ?? [];
    detailTotal.value = res.total ?? 0;
  } catch {
    detailRows.value = [];
    detailTotal.value = 0;
  } finally {
    detailLoading.value = false;
  }
}

function onDetailPageChange(payload: { currentPage: number; pageSize: number }) {
  detailPage.value = payload.currentPage;
  loadDetail();
}

// ===================== 新增 / 编辑 / 批量编辑 弹窗 =====================
const formOpen = ref(false);
const formSubmitting = ref(false);
const formMode = ref<'create' | 'single' | 'batch'>('create');
const formModel = reactive<{
  trainerIds: number[];
  trainerLabel: string;
  planId: number | null;
  monthPick: string;
  trainingType: string;
  content: string;
}>({
  trainerIds: [],
  trainerLabel: '',
  planId: null,
  monthPick: currentMonth,
  trainingType: '',
  content: '',
});

const personnelOptions = computed(() =>
  summaryRows.value.map((r) => ({ label: `${r.name}（${r.department || '-'}）`, value: r.employeeId })),
);

const planOptions = ref<PlanContentOption[]>([]);
async function loadPlanOptions(month?: string) {
  try {
    const res = await getTrainingPlanContentOptions(month);
    planOptions.value = res.list ?? [];
  } catch {
    planOptions.value = [];
  }
}

const trainingTypeOptions = ref<string[]>([]);
const typeSelectOptions = computed(() =>
  trainingTypeOptions.value.map((v) => ({ label: v, value: v })),
);
async function loadTrainingTypes() {
  try {
    trainingTypeOptions.value = (await getTrainingTypeOptions()).list ?? [];
  } catch {
    trainingTypeOptions.value = [];
  }
}

function onPlanChange(planId: number | null) {
  const hit = planOptions.value.find((o) => o.id === planId);
  if (!hit) return;
  formModel.content = hit.content;
}

function resetFormBase() {
  formModel.trainerIds = [];
  formModel.trainerLabel = '';
  formModel.planId = null;
  formModel.monthPick = selectedMonth.value;
  formModel.trainingType = '';
  formModel.content = '';
}

function openCreate() {
  resetFormBase();
  formMode.value = 'create';
  loadPlanOptions(formModel.monthPick);
  formOpen.value = true;
}

function openEdit(row: TrainingPersonnelApi.SummaryItem) {
  resetFormBase();
  formMode.value = 'single';
  formModel.trainerIds = [row.employeeId];
  formModel.trainerLabel = `${row.name}（${row.department || '-'}）`;
  loadPlanOptions(formModel.monthPick);
  formOpen.value = true;
}

function openBatchEdit() {
  if (!checkedIds.value.length) return;
  resetFormBase();
  formMode.value = 'batch';
  formModel.trainerIds = [...checkedIds.value];
  formModel.trainerLabel = `批量：已选 ${checkedIds.value.length} 名培训人员`;
  loadPlanOptions(formModel.monthPick);
  formOpen.value = true;
}

async function onSubmitForm() {
  if (!formModel.trainerIds.length) {
    message.warning('请选择培训人员');
    return;
  }
  if (!formModel.monthPick) {
    message.warning('请选择培训月份');
    return;
  }
  if (!formModel.trainingType) {
    message.warning('请选择或填写培训类型');
    return;
  }
  formSubmitting.value = true;
  try {
    const res = await batchCreateTrainingPersonnelRecords({
      trainerIds: formModel.trainerIds,
      trainingType: formModel.trainingType,
      trainingDate: `${formModel.monthPick}-01`,
      content: formModel.content,
      trainingPlanId: formModel.planId,
    });
    message.success(`已补录 ${res.created} 条培训记录`);
    formOpen.value = false;
    checkedIds.value = [];
    await loadSummary();
  } catch {
    /* 拦截器已提示 */
  } finally {
    formSubmitting.value = false;
  }
}

// ===================== 删除（单行） =====================
async function onDelete(row: TrainingPersonnelApi.SummaryItem) {
  try {
    const res = await batchDeleteTrainingPersonnelRecords([row.employeeId], selectedMonth.value);
    message.success(`已删除 ${res.deleted} 条培训记录`);
    await loadSummary();
  } catch {
    /* 拦截器已提示 */
  }
}

async function onBatchDelete() {
  if (!checkedIds.value.length) return;
  try {
    const res = await batchDeleteTrainingPersonnelRecords(checkedIds.value, selectedMonth.value);
    message.success(`已删除 ${res.deleted} 条培训记录`);
    checkedIds.value = [];
    await loadSummary();
  } catch {
    /* 拦截器已提示 */
  }
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
  ocrEnabled,
  ocrActive,
  ocrLoading,
  ocrAdvice,
  ocrProgress,
  aiEnabled,
  aiLoading,
  aiProvider,
  aiProviderStatus,
  aiProviderChecking,
  setAiProvider,
  refreshAiProviderStatus,
  aiModel,
  setAiModel,
  aiPrompt,
  onAiRecognize: onImportAiRecognize,
  signinActive,
  signinPreview,
  onDownloadTemplate: onImportTemplate,
  onUpload: onImportUpload,
  onConfirmImport: onImportConfirm,
  onExportOcr: onImportExportOcr,
  onImportClose: onImportDialogClose,
  bindRefresh: bindImportRefresh,
} = useGenericImport('training-ledger', { ocr: true, ai: true });
bindImportRefresh(loadSummary);

watch(importOpen, async (open) => {
  if (!open) return;
  await refreshAiProviderStatus();
  if (aiProvider.value === 'dsh') ensureAiModelSelected();
});

// ===================== 数字明细弹窗 =====================
const breakdownOpen = ref(false);
const breakdownLoading = ref(false);
const breakdownTitle = ref('');
const breakdownRows = ref<{ label: string; sub?: string; value: string }[]>([]);
const breakdownTotal = ref(0);

function openMissingBreakdown(row: TrainingPersonnelApi.SummaryItem) {
  breakdownTitle.value = `${row.name || ''} · ${selectedMonth.value} 缺少人员明细`;
  breakdownRows.value = [];
  breakdownTotal.value = row.missingCount || 0;
  breakdownOpen.value = true;
  breakdownLoading.value = true;
  getTrainingUntrained(row.employeeId, selectedMonth.value)
    .then((r) => {
      const list = r.list ?? [];
      breakdownRows.value = [
        ...list
          .filter((u) => u.status === 'inpost')
          .map((u) => ({ label: u.name ?? '-', sub: '在岗未培训', value: '未培训' })),
        ...list
          .filter((u) => u.status === 'departed')
          .map((u) => ({ label: u.name ?? '-', sub: '已离职未培训', value: '未培训' })),
      ];
    })
    .catch(() => {
      breakdownRows.value = [];
    })
    .finally(() => {
      breakdownLoading.value = false;
    });
}

function openScoreBreakdown(row: TrainingPersonnelApi.SummaryItem) {
  const missing = row.missingCount || 0;
  const incomplete = row.incompleteCount || 0;
  breakdownTitle.value = `${row.name || ''} · ${selectedMonth.value} 培训考核分数明细`;
  breakdownRows.value = [
    { label: '缺少人员', value: `${missing} 人` },
    { label: '资料不完整', value: `${incomplete} 人` },
  ];
  breakdownTotal.value = missing + incomplete;
  breakdownLoading.value = false;
  breakdownOpen.value = true;
}

function openIncompleteBreakdown(row: TrainingPersonnelApi.SummaryItem) {
  const incomplete = row.incompleteCount || 0;
  breakdownTitle.value = `${row.name || ''} · ${selectedMonth.value} 资料不完整明细`;
  breakdownRows.value = [
    {
      label: '资料不完整计数',
      value: `${incomplete} 人`,
      sub: '该计数来自《月度考核结果》台账导入，当前无逐人明细',
    },
  ];
  breakdownTotal.value = incomplete;
  breakdownLoading.value = false;
  breakdownOpen.value = true;
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

function escapeCsv(v: string) {
  return `"${String(v ?? '').replace(/"/g, '""')}"`;
}

// ===================== 月度培训台账导入（覆盖式） =====================
const monthlyImportLoading = ref(false);
const monthlyImportInput = ref<HTMLInputElement | null>(null);

function triggerMonthlyImport() {
  monthlyImportInput.value?.click();
}

async function handleMonthlyImport(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  monthlyImportLoading.value = true;
  try {
    const res = await importTrainingLedgerMonthly(file, selectedMonth.value);
    message.success(`月度培训台账导入成功（${res.trainers} 名培训人）`);
    await loadSummary();
  } catch (err: any) {
    message.error(err?.message || '导入失败');
  } finally {
    monthlyImportLoading.value = false;
    input.value = '';
  }
}

// ===================== AI 识图 =====================
const aiImportInput = ref<HTMLInputElement | null>(null);

function handleAiImage(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  onImportAiRecognize(file);
}

const aiProviderStatusItem = computed(() => aiProviderStatus.value?.[aiProvider.value] ?? null);
const aiProviderName = computed(() => (aiProvider.value === 'dsh' ? 'DSH 网关' : '本地 Ollama'));
const aiProviderDotClass = computed(() => {
  const st = aiProviderStatusItem.value;
  if (!st) return 'is-unknown';
  return st.ok ? 'is-ok' : 'is-bad';
});
const aiProviderHint = computed(() => {
  const st = aiProviderStatusItem.value;
  if (!st) return `${aiProviderName.value}：状态未知，可再点一次开关刷新`;
  if (!st.ok) return `${aiProviderName.value} 不可用：${st.detail || '连接失败'}`;
  return `${aiProviderName.value} 可用：${st.model}${st.hasModel ? '' : '（模型不在可用清单中）'}`;
});

const dshModelOptions = computed(() => {
  const list = aiProviderStatus.value?.dsh?.models ?? [];
  return list
    .filter((m) => m.present !== false)
    .map((m) => ({
      label: m.available === false ? `${m.label}（当前不可用）` : m.label,
      value: m.id,
      disabled: m.available === false,
    }));
});

function ensureAiModelSelected() {
  const usable = dshModelOptions.value.filter((o) => !o.disabled);
  if (!usable.length) return;
  if (!aiModel.value || !usable.some((o) => o.value === aiModel.value)) {
    setAiModel(usable[0]!.value as string);
  }
}

async function onAiProviderToggle(v: boolean) {
  setAiProvider(v ? 'dsh' : 'local');
  await refreshAiProviderStatus();
  if (v) ensureAiModelSelected();
  const st = aiProviderStatusItem.value;
  if (!st) return;
  if (!st.ok) {
    message.warning(`${aiProviderName.value} 当前不可用：${st.detail || '连接失败'}`);
  } else if (!st.hasModel) {
    message.warning(`${aiProviderName.value} 已连通，但模型 ${st.model} 不在可用清单中`);
  }
}

function onExportSummary() {
  if (!summaryRows.value.length) {
    message.warning('当前月份无数据可导出');
    return;
  }
  const heads = [
    '姓名', '部门', '培训日期', '应培训人数', '实际培训人数', '缺少人数', '资料不完整',
    '未培训人员(在岗)', '未培训人员(已离职)',
  ];
  const lines = summaryRows.value.map((r) =>
    [
      r.name, r.department, r.month, r.expectedCount, r.actualCount, r.missingCount,
      r.incompleteCount || 0,
      r.inpostNames || '', r.departedNames || '',
    ]
      .map((v) => escapeCsv(String(v ?? '')))
      .join(','),
  );
  const blob = new Blob([`\ufeff${heads.map(escapeCsv).join(',')}\n${lines.join('\n')}`], {
    type: 'text/csv;charset=utf-8;',
  });
  triggerDownload(blob, `培训记录汇总_${selectedMonth.value}.csv`);
}

function onRefresh() {
  Promise.all([loadSummary(), loadPlanOptions(selectedMonth.value), loadTrainingTypes()]);
}

// ===================== 表头 =====================
const columns: VxeTableGridColumns = [
  { field: '__checkbox', title: '', width: 40, align: 'center', fixed: 'left', slots: { default: 'rowCheck', header: 'headerCheck' } },
  { title: '姓名', field: 'name', align: 'center', width: 110, fixed: 'left' },
  { title: '部门', field: 'department', align: 'center', minWidth: 160 },
  { title: '培训日期', field: 'month', align: 'center', minWidth: 110 },
  { title: '应培训', field: 'expectedCount', align: 'center', minWidth: 90 },
  { title: '实际', field: 'actualCount', align: 'center', minWidth: 80 },
  {
    title: '缺少人员',
    field: 'missingCount',
    align: 'center',
    minWidth: 90,
    slots: { default: 'missingCount' },
  },
  {
    title: '资料不完整',
    field: 'incompleteCount',
    align: 'center',
    minWidth: 96,
    slots: { default: 'incompleteCount' },
  },
  {
    title: '培训考核分数',
    field: 'assessmentScore',
    align: 'center',
    minWidth: 110,
    slots: { default: 'assessmentScore' },
  },
  {
    title: '操作',
    field: 'action',
    align: 'center',
    width: 220,
    fixed: 'right',
    slots: { default: 'action' },
  },
];

const detailColumns: VxeTableGridColumns = [
  { title: '培训日期', field: 'trainingDate', align: 'center', width: 110, slots: { default: 'detailDate' } },
  { title: '受训人员', field: 'name', align: 'center', minWidth: 110 },
  { title: '部门', field: 'department', align: 'center', minWidth: 140 },
  { title: '岗位', field: 'position', align: 'center', minWidth: 120 },
  { title: '培训类型', field: 'trainingType', align: 'center', minWidth: 120 },
  {
    title: '结果',
    field: 'result',
    align: 'center',
    width: 100,
    slots: { default: 'result' },
  },
];

// —— 汇总表勾选 ——
function toggleRowChecked(employeeId: number, checked: boolean) {
  crud.toggleChecked(employeeId, checked);
}
function allChecked() {
  return crud.allChecked.value;
}
function someChecked() {
  return crud.someChecked.value;
}
function toggleAll(checked: boolean) {
  crud.toggleAll(checked);
}

onMounted(async () => {
  await Promise.all([loadPlanOptions(), loadTrainingTypes()]);
  await loadLedgerMonths();
  const dm = drillMonth.value;
  if (dm) {
    if (!months.value.some((o) => o.value === dm)) {
      months.value.push({ label: dm, value: dm });
      months.value.sort((a, b) => (a.value < b.value ? 1 : -1));
    }
    selectedMonth.value = dm;
  }
  await loadSummary();
});

watch(
  () => [route.query.month, route.query.emp],
  () => {
    const dm = drillMonth.value;
    if (dm) {
      if (!months.value.some((o) => o.value === dm)) {
        months.value.push({ label: dm, value: dm });
        months.value.sort((a, b) => (a.value < b.value ? 1 : -1));
      }
      selectedMonth.value = dm;
    }
    loadSummary();
  },
);

async function loadLedgerMonths() {
  try {
    const res = await getTrainingLedgerMonths();
    const dataMonths = res.months ?? [];
    const existing = new Set(months.value.map((m) => m.value));
    for (const m of dataMonths) {
      if (!existing.has(m)) {
        months.value.push({ label: m, value: m });
        existing.add(m);
      }
    }
    months.value.sort((a, b) => (a.value < b.value ? 1 : -1));
  } catch {
    /* 月份补充失败不阻断页面 */
  }
}
</script>

<template>
  <HsePageLayout :title="$t('page.hse.trainingLedger')" :description="'按培训人员月度汇总 · ' + selectedMonth">
    <template #extra>
      <NSpace align="center" wrap>
        <HseActionBar
          :actions="actionState"
          @refresh="onRefresh"
          @download-template="onImportTemplate"
          @import="() => (importOpen = true)"
          @export="onExportSummary"
          @create="openCreate"
        />
        <NSelect
          v-model:value="selectedMonth"
          :options="months"
          style="width: 150px"
          @update:value="loadSummary"
        />
        <NButton :loading="loading" @click="loadSummary">查询</NButton>
        <NButton :loading="monthlyImportLoading" @click="triggerMonthlyImport">
          导入月度台账
        </NButton>
        <input
          ref="monthlyImportInput"
          type="file"
          accept=".xlsx,.xls"
          style="display: none"
          @change="handleMonthlyImport"
        />
        <NTag v-if="checkedIds.length" type="info" bordered>
          已选 {{ checkedIds.length }} 人
        </NTag>
        <NButton :disabled="!checkedIds.length" type="primary" @click="openBatchEdit">
          批量编辑
        </NButton>
        <NPopconfirm :disabled="!checkedIds.length" @positive-click="onBatchDelete">
          <template #trigger>
            <NButton type="error" :disabled="!checkedIds.length">批量删除</NButton>
          </template>
          确定删除所选培训人员本月的全部培训记录吗？
        </NPopconfirm>
      </NSpace>
    </template>

    <!-- 汇总表 -->
    <HseDataGrid
      :columns="columns"
      :data="summaryRows"
      :loading="loading"
      row-key="employeeId"
      :row-class-name="ledgerRowClassName"
      :pager="{ pageSize: 20, pageSizes: [10, 20, 50] }"
      :total="summaryTotal"
    >
      <template #headerCheck>
        <NCheckbox
          :checked="allChecked()"
          :indeterminate="someChecked() && !allChecked()"
          @update:checked="toggleAll"
        />
      </template>
      <template #rowCheck="{ row }">
        <NCheckbox
          :checked="checkedIds.includes(row.employeeId)"
          @update:checked="(v: boolean) => toggleRowChecked(row.employeeId, v)"
        />
      </template>
      <template #missingCount="{ row }">
        <NTag
          v-if="row.missingCount > 0"
          type="warning"
          :bordered="false"
          size="small"
          class="deduc-click"
          @click="openMissingBreakdown(row)"
        >{{ row.missingCount }}</NTag>
        <NTag v-else type="success" :bordered="false" size="small">{{ row.missingCount || 0 }}</NTag>
      </template>
      <template #incompleteCount="{ row }">
        <NTag
          v-if="row.incompleteCount > 0"
          type="warning"
          :bordered="false"
          size="small"
          class="deduc-click"
          @click="openIncompleteBreakdown(row)"
        >{{ row.incompleteCount }}</NTag>
        <NTag v-else type="success" :bordered="false" size="small">{{ row.incompleteCount || 0 }}</NTag>
      </template>
      <template #assessmentScore="{ row }">
        <NTag
          v-if="(row.missingCount || 0) + (row.incompleteCount || 0) > 0"
          type="error"
          :bordered="false"
          size="small"
          class="deduc-click"
          @click="openScoreBreakdown(row)"
        >{{ (row.missingCount || 0) + (row.incompleteCount || 0) }}</NTag>
        <NTag v-else type="success" :bordered="false" size="small">0</NTag>
      </template>
      <template #action="{ row }">
        <NSpace justify="center" :size="4">
          <NButton size="small" type="primary" quaternary @click="openPersonDetail(row)">
            查看
          </NButton>
          <NButton size="small" type="primary" quaternary @click="openEdit(row)">
            编辑
          </NButton>
          <NPopconfirm @positive-click="onDelete(row)">
            <template #trigger>
              <NButton size="small" type="error" quaternary>删除</NButton>
            </template>
            确定删除「{{ row.name }}」本月的培训记录吗？
          </NPopconfirm>
        </NSpace>
      </template>
    </HseDataGrid>

    <!-- 明细抽屉 -->
    <NDrawer v-model:show="detailOpen" :width="720">
      <NDrawerContent :title="`${detailPerson.name} · ${detailMonth} 培训明细`" closable>
        <HseDataGrid
          :columns="detailColumns"
          :data="detailRows"
          :loading="detailLoading"
          row-key="id"
          :pager="{ pageSize: detailPageSize }"
          :total="detailTotal"
          :current-page="detailPage"
          :height="560"
          @page-change="onDetailPageChange"
        >
          <template #detailDate="{ row }">{{ row.trainingDate ? String(row.trainingDate).slice(0, 10) : '-' }}</template>
          <template #result="{ row }">
            <HseStatusTag type="neutral">{{ row.result || '-' }}</HseStatusTag>
          </template>
        </HseDataGrid>
      </NDrawerContent>
    </NDrawer>

    <!-- 新增 / 编辑 / 批量编辑 弹窗 -->
    <NModal
      v-model:show="formOpen"
      :title="
        formMode === 'batch' ? '批量编辑培训记录' : formMode === 'create' ? '新增培训记录' : '编辑培训记录'
      "
      preset="card"
      style="width: 640px; max-width: 94vw"
      :mask-closable="false"
    >
      <NForm label-placement="top">
        <NFormItem label="培训人员">
          <NSelect
            v-if="formMode === 'create'"
            v-model:value="formModel.trainerIds"
            :options="personnelOptions"
            multiple
            filterable
            placeholder="搜索并选择培训人员（可多选，来自本月汇总）"
          />
          <NInput v-else :value="formModel.trainerLabel" disabled placeholder="由所选行带入" />
        </NFormItem>
        <NFormItem label="培训月份">
          <NSelect
            v-model:value="formModel.monthPick"
            :options="months"
            placeholder="选择培训月份，入库按该月 1 日登记"
          />
        </NFormItem>
        <NFormItem label="培训类型（开放式，可在下方直接输入新类型）">
          <NSelect
            v-model:value="formModel.trainingType"
            :options="typeSelectOptions"
            filterable
            tag
            placeholder="下拉选择或输入新培训类型"
          />
        </NFormItem>
        <NFormItem label="引用培训计划（培训内容自动带入）">
          <NSelect
            v-model:value="formModel.planId"
            placeholder="选择培训计划（年度培训按当前月份取内容）"
            clearable
            filterable
            :options="planOptions.map((p) => ({ label: p.label, value: p.id }))"
            @update:value="onPlanChange"
          />
        </NFormItem>
        <NFormItem label="培训内容">
          <NInput v-model:value="formModel.content" type="textarea" :rows="3" placeholder="可从上方培训计划自动带入，也可手动填写" />
        </NFormItem>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="formOpen = false">关闭</NButton>
          <NButton type="primary" :loading="formSubmitting" @click="onSubmitForm">保存</NButton>
        </NSpace>
      </template>
    </NModal>

    <!-- 通用导入（Excel + OCR） -->
    <HseImportDialog
      v-model:open="importOpen"
      title="导入培训台账"
      :ocr-enabled="ocrEnabled"
      :ocr-active="ocrActive"
      :ocr-loading="ocrLoading"
      :ocr-progress="ocrProgress"
      :ocr-advice="ocrAdvice"
      :signin-active="signinActive"
      :signin-preview="signinPreview"
      :preview-columns="importPreviewColumns"
      :preview-data="importPreviewData"
      :preview-error="importPreviewError"
      :confirming="importConfirming"
      :result="importResult"
      @download-template="onImportTemplate"
      @upload="onImportUpload"
      @confirm="onImportConfirm"
      @export-ocr="onImportExportOcr"
      @close="onImportDialogClose"
    >
      <template #header-extra>
        <div
          v-if="aiEnabled"
          class="mb-3 rounded border border-primary/20 bg-primary/5 px-3 py-2"
        >
          <div class="flex flex-wrap items-center justify-between gap-3">
            <NText depth="2" class="text-xs">
              AI 识图：上传培训台账照片或 PDF，由视觉大模型自动识别填写，无需手动逐行录入。
            </NText>
            <div class="flex items-center gap-3">
              <NTooltip trigger="hover">
                <template #trigger>
                  <div class="flex items-center gap-2">
                    <NText depth="3" class="text-xs">
                      DSH 识别
                    </NText>
                    <NSwitch
                      :value="aiProvider === 'dsh'"
                      size="small"
                      :loading="aiProviderChecking"
                      @update:value="onAiProviderToggle"
                    />
                    <span class="ai-provider-dot" :class="aiProviderDotClass" />
                  </div>
                </template>
                {{ aiProviderHint }}
              </NTooltip>
              <NButton
                secondary
                type="primary"
                size="small"
                :loading="aiLoading"
                :disabled="importConfirming"
                @click="aiImportInput?.click()"
              >
                AI 识图
              </NButton>
            </div>
          </div>

          <div class="mt-2 flex flex-wrap items-center gap-2">
            <NSelect
              v-if="aiProvider === 'dsh'"
              :value="aiModel || null"
              :options="dshModelOptions"
              size="small"
              class="ai-model-select"
              placeholder="选择免费视觉模型"
              :loading="aiProviderChecking"
              :consistent-menu-width="false"
              @update:value="setAiModel"
            />
            <NInput
              v-model:value="aiPrompt"
              type="textarea"
              size="small"
              class="ai-prompt-input"
              :autosize="{ minRows: 1, maxRows: 3 }"
              maxlength="300"
              show-count
              clearable
              placeholder="可选：补充识别要求，例如「只识别 2026 年 8 月的记录」「姓名取第二列」"
            />
          </div>

          <input
            ref="aiImportInput"
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.bmp,.webp"
            style="display: none"
            @change="handleAiImage"
          />
        </div>
      </template>
    </HseImportDialog>

    <!-- 数字明细弹窗 -->
    <NModal
      v-model:show="breakdownOpen"
      preset="card"
      :title="breakdownTitle"
      style="width: 420px; max-width: 92vw"
      :mask-closable="true"
    >
      <div class="training-breakdown">
        <NSpin :show="breakdownLoading">
          <div
            v-for="(r, ri) in breakdownRows"
            :key="ri"
            class="training-breakdown-item"
          >
            <div class="training-breakdown-main">
              <span class="training-breakdown-label">{{ r.label }}</span>
              <span v-if="r.sub" class="training-breakdown-sub">{{ r.sub }}</span>
            </div>
            <span class="training-breakdown-val">{{ r.value }}</span>
          </div>
          <div v-if="!breakdownLoading && breakdownRows.length === 0" class="training-breakdown-empty">
            暂无扣分明细
          </div>
          <div class="training-breakdown-total">
            <span>合计</span>
            <span>{{ breakdownTotal }} 人</span>
          </div>
        </NSpin>
      </div>
    </NModal>
  </HsePageLayout>
</template>

<style scoped>
/* 可点击的数字 */
.deduc-click {
  cursor: pointer;
  transition: filter 0.15s;
  &:hover {
    filter: brightness(1.15);
  }
}

/* AI 识图通道状态灯 */
.ai-provider-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: #c2c2c2;
  transition: background 0.15s;

  &.is-ok {
    background: #18a058;
  }

  &.is-bad {
    background: #d03050;
  }
}

/* DSH 模型下拉 + 附加提示词 */
.ai-model-select {
  width: 280px;
  max-width: 100%;
}

.ai-prompt-input {
  flex: 1 1 320px;
  min-width: 220px;
}

/* 数字明细弹窗 */
.training-breakdown {
  min-width: 240px;
}
.training-breakdown-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 4px 6px;
  border-radius: 4px;
}
.training-breakdown-item:hover {
  background: rgba(245, 158, 11, 0.14);
  color: #d97706;
}
.training-breakdown-main {
  min-width: 0;
  flex: 1;
}
.training-breakdown-label {
  display: block;
  font-size: 13px;
  line-height: 1.5;
  word-break: break-word;
}
.training-breakdown-sub {
  display: block;
  margin-top: 2px;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  line-height: 1.4;
}
.training-breakdown-val {
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}
.training-breakdown-total {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  border-top: 1px dashed #d0d5dd;
  margin-top: 6px;
  padding: 6px 6px 0;
  font-weight: 600;
}
.training-breakdown-empty {
  padding: 12px 6px;
  text-align: center;
  color: #8a919f;
}

/* 外部下钻定位到目标人汇总行 */
:deep(.vxe-body--row.training-locate-row) {
  background: rgba(37, 99, 235, 0.14) !important;
  transition: background-color 0.8s ease;
}
:deep(.vxe-body--row.training-locate-row .vxe-cell) {
  color: #1d4ed8;
  font-weight: 600;
}
</style>
