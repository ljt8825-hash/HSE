<script lang="ts" setup>
/**
 * 培训记录（web-naive）——按培训人员月度汇总
 *
 * □ 对话框交互
 *  - 培训日期：只选「月份」(YYYY-MM)，入库统一落到该月 1 日
 *  - 培训类型：固定「安全培训」，不再让用户选择
 *  - 培训内容：可「引用培训计划」下拉带入（计划表待完善，单选即带入该计划内容）
 *  - 无需时长 / 结果 / 成绩字段
 *  - 「新增」→ 自行多选培训人员；行「编辑」→ 锁该人员；「批量编辑」→ 锁已选人员
 *  - 具名/批量删除：删除所选培训人员当月在训记录（软删）
 *
 * □ 操作栏（对齐其它页面）：刷新 / 下载模板 / 导入 / 导出 / 新增
 *  - 导入：复用通用导入网关（Excel + OCR，training-ledger 模块）
 *  - 导出：导出当前月度汇总 CSV
 */
import { computed, h, onMounted, reactive, ref } from 'vue';
import type { DataTableColumns } from 'naive-ui';
import {
  NButton,
  NDataTable,
  NDrawer,
  NDrawerContent,
  NForm,
  NFormItem,
  NInput,
  NModal,
  NPopconfirm,
  NPopover,
  NScrollbar,
  NSelect,
  NSpace,
  NSpin,
  NTag,
  NText,
} from 'naive-ui';
import { $t } from '#/locales';

import {
  HseActionBar,
  HseImportDialog,
  HsePageLayout,
  HseStatusTag,
  type HseActionKey,
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
  type SigninUntrained,
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

// ===================== 汇总列表 =====================
const loading = ref(false);
const summaryRows = ref<TrainingPersonnelApi.SummaryItem[]>([]);
const summaryTotal = ref(0);
const checkedIds = ref<number[]>([]);

async function loadSummary() {
  loading.value = true;
  try {
    const res = await getTrainingPersonnelSummary(selectedMonth.value);
    summaryRows.value = res.list ?? [];
    summaryTotal.value = res.total ?? 0;
    checkedIds.value = [];
  } catch {
    summaryRows.value = [];
    summaryTotal.value = 0;
    checkedIds.value = [];
  } finally {
    loading.value = false;
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

function onDetailPageChange(page: number) {
  detailPage.value = page;
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

// “新增”时的培训人员多选（取自当月汇总所有行）
const personnelOptions = computed(() =>
  summaryRows.value.map((r) => ({ label: `${r.name}（${r.department || '-'}）`, value: r.employeeId })),
);

// 培训计划内容下拉（年度培训按月内容见后端接口，随计划表完善）
const planOptions = ref<PlanContentOption[]>([]);
async function loadPlanOptions(month?: string) {
  try {
    const res = await getTrainingPlanContentOptions(month);
    planOptions.value = res.list ?? [];
  } catch {
    planOptions.value = [];
  }
}

// 培训类型动态选项（开放式：来源于台账已出现的类型，可自由输入新类型）
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

// 新增：自主多选培训人员
function openCreate() {
  resetFormBase();
  formMode.value = 'create';
  loadPlanOptions(formModel.monthPick);
  formOpen.value = true;
}

// 单行「编辑」：锁定该培训人员，补录当月培训记录
function openEdit(row: TrainingPersonnelApi.SummaryItem) {
  resetFormBase();
  formMode.value = 'single';
  formModel.trainerIds = [row.employeeId];
  formModel.trainerLabel = `${row.name}（${row.department || '-'}）`;
  loadPlanOptions(formModel.monthPick);
  formOpen.value = true;
}

// 批量「编辑」：锁定已选培训人员，一次性补录相同培训
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

// ===================== 操作栏：刷新/下载模板/导入/导出/新增 =====================
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
    aiEnabled,
    aiLoading,
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

// ----- 未培训名单悬浮菜单（点击缺少数） -----
const untrainedLoading = ref(false);
const untrainedList = ref<SigninUntrained[]>([]);

function showUntrained(row: TrainingPersonnelApi.SummaryItem) {
  untrainedList.value = [];
  untrainedLoading.value = true;
  getTrainingUntrained(row.employeeId, selectedMonth.value)
    .then((r) => {
      untrainedList.value = r.list ?? [];
    })
    .catch(() => {
      untrainedList.value = [];
    })
    .finally(() => {
      untrainedLoading.value = false;
    });
}

// 悬浮菜单内容：在岗未培训 / 已离职未培训 分组展示（规则5）
function renderUntrainedPopover() {
  const inpost = untrainedList.value.filter((u) => u.status === 'inpost');
  const departed = untrainedList.value.filter((u) => u.status === 'departed');
  const group = (title: string, list: SigninUntrained[], tagType: 'warning' | 'default') =>
    list.length
      ? h('div', { class: 'mb-2' }, [
          h('div', { class: 'mb-1 text-xs font-medium text-muted-foreground' }, title),
          h(
            'div',
            { class: 'flex flex-wrap gap-1' },
            list.map((u) =>
              h(NTag, { size: 'small', type: tagType, bordered: false }, () =>
                `${u.name}${u.deptName ? `（${u.deptName}）` : ''}`,
              ),
            ),
          ),
        ])
      : null;
  return h(NSpin, { size: 'small', show: untrainedLoading.value }, () => [
    h('div', { class: 'max-h-56 overflow-auto text-xs' }, [
      group('在岗未培训', inpost, 'warning'),
      group('已离职未培训', departed, 'default'),
      untrainedList.value.length === 0 && !untrainedLoading.value
        ? h('div', { class: 'text-muted-foreground' }, '暂无未培训登记')
        : null,
    ]),
  ]);
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

// ===================== AI 识图（独立入口：本地视觉模型识别培训台账照片） =====================
const aiImportInput = ref<HTMLInputElement | null>(null);

function handleAiImage(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  onImportAiRecognize(file);
}

function onExportSummary() {
  if (!summaryRows.value.length) {
    message.warning('当前月份无数据可导出');
    return;
  }
  // 规则6：导出增列 —— 未培训人员(在岗)/(已离职)
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
const columns: DataTableColumns<TrainingPersonnelApi.SummaryItem> = [
  { type: 'selection', fixed: 'left', width: 40 },
  { title: '姓名', key: 'name', align: 'center', width: 90, fixed: 'left' },
  { title: '部门', key: 'department', align: 'center', width: 140 },
  { title: '培训日期', key: 'month', align: 'center', width: 100 },
  { title: '应培训', key: 'expectedCount', align: 'center', width: 70 },
  { title: '实际', key: 'actualCount', align: 'center', width: 60 },
  {
    title: '缺少',
    key: 'missingCount',
    align: 'center',
    width: 70,
    render: (row) => {
      const n = row.missingCount || 0;
      const tagType = n > 0 ? 'error' : ('success' as const);
      const tag = h(
        NTag,
        { type: tagType, bordered: false, size: 'small' },
        () => String(n),
      );
      // 规则5：缺少数 >0 时可点击弹出未培训名单（在岗/已离职）
      if (!(n > 0)) return tag;
      return h(
        NPopover,
        { trigger: 'click', placement: 'bottom-start', width: 320 },
        {
          trigger: () =>
            h(
              'button',
              {
                type: 'button',
                onClick: () => showUntrained(row),
                class: 'cursor-pointer rounded px-1 transition-colors hover:bg-muted',
              },
              tag,
            ),
          default: () => renderUntrainedPopover(),
        },
      );
    },
  },
  {
    title: '资料不完整',
    key: 'incompleteCount',
    align: 'center',
    width: 90,
    render: (row) => {
      const n = row.incompleteCount || 0;
      const tagType = n > 0 ? 'warning' : ('success' as const);
      return h(NTag, { type: tagType, bordered: false, size: 'small' }, () => String(n));
    },
  },
  {
    title: '培训考核分数',
    key: 'assessmentScore',
    align: 'center',
    width: 100,
    render: (row) => {
      const n = (row.missingCount || 0) + (row.incompleteCount || 0);
      const tagType = n > 0 ? 'warning' : ('success' as const);
      return h(NTag, { type: tagType, bordered: false, size: 'small' }, () => String(n));
    },
  },
  {
    title: '操作',
    key: 'action',
    align: 'center',
    width: 220,
    fixed: 'right',
    render: (row) =>
      h(NSpace, { justify: 'center', size: 4 }, () => [
        h(
          NButton,
          { size: 'small', type: 'primary', quaternary: true, onClick: () => openPersonDetail(row) },
          { default: () => '查看' },
        ),
        h(
          NButton,
          { size: 'small', type: 'primary', quaternary: true, onClick: () => openEdit(row) },
          { default: () => '编辑' },
        ),
        h(
          NPopconfirm,
          { onPositiveClick: () => onDelete(row) },
          {
            trigger: () =>
              h(NButton, { size: 'small', type: 'error', quaternary: true }, { default: () => '删除' }),
            default: () => `确定删除「${row.name}」本月的培训记录吗？`,
          },
        ),
      ]),
  },
];

const detailColumns: DataTableColumns<TrainingPersonnelApi.PersonnelRecordItem> = [
  { title: '培训日期', key: 'trainingDate', align: 'center', width: 110, render: (r) => (r.trainingDate ? String(r.trainingDate).slice(0, 10) : '-') },
  { title: '受训人员', key: 'name', align: 'center', minWidth: 110 },
  { title: '部门', key: 'department', align: 'center', minWidth: 140 },
  { title: '岗位', key: 'position', align: 'center', minWidth: 120 },
  { title: '培训类型', key: 'trainingType', align: 'center', minWidth: 120 },
  {
    title: '结果',
    key: 'result',
    align: 'center',
    width: 100,
    render: (r) => h(HseStatusTag, { type: 'neutral' }, { default: () => r.result || '-' }),
  },
];

onMounted(async () => {
  await Promise.all([loadPlanOptions(), loadTrainingTypes()]);
  await loadLedgerMonths();
  await loadSummary();
});

// 合并「有台账数据的月份」到月份下拉，使早于最近12个月的月份（如 2025-08/09）可选
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
    // 保持倒序（最近月份在前）
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
    <NDataTable
      :columns="columns"
      :data="summaryRows"
      :loading="loading"
      :row-key="(row: TrainingPersonnelApi.SummaryItem) => row.employeeId"
      :checked-row-keys="checkedIds"
      @update:checked-row-keys="(keys: Array<number | string>) => (checkedIds = keys.map(Number))"
      :pagination="{
        pageSize: 20,
        itemCount: summaryTotal,
        showSizePicker: true,
        pageSizes: [10, 20, 50],
      }"
      striped
    />

    <!-- 明细抽屉 -->
    <NDrawer v-model:show="detailOpen" :width="720">
      <NDrawerContent :title="`${detailPerson.name} · ${detailMonth} 培训明细`" closable>
        <NDataTable
          :columns="detailColumns"
          :data="detailRows"
          :loading="detailLoading"
          :row-key="(r: TrainingPersonnelApi.PersonnelRecordItem) => r.id"
          :pagination="{
            page: detailPage,
            pageSize: detailPageSize,
            itemCount: detailTotal,
            onChange: (p: number) => onDetailPageChange(p),
          }"
          striped
        />
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
      <!-- AI 识图：独立入口（上传培训台账照片 → 本地视觉模型识别），结果复用下方预览/入库流 -->
      <template #header-extra>
        <div
          v-if="aiEnabled"
          class="mb-3 flex items-center justify-between gap-3 rounded border border-primary/20 bg-primary/5 px-3 py-2"
        >
          <NText depth="2" class="text-xs">
            AI 识图：上传培训台账照片或 PDF，由本地视觉大模型自动识别填写，无需手动逐行录入。
          </NText>
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
  </HsePageLayout>
</template>