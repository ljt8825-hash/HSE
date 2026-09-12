<script lang="ts" setup>
/**
 * 安全费用支出（web-naive）
 * 安全费用预算及支出 → 三级菜单「安全费用支出」
 * 服务端分页 / 关键词·年份·状态筛选 / 查看抽屉 / 创建·编辑·删除；字段全保留。
 * 契约来源：apps/web-antd + apps/web-antd/src/api/hse/goals.ts
 * 边界：不改服务端契约；金额/数量按旧版精度与单位提交；不伪造写入成功。
 */
import { computed, onMounted, reactive, ref } from 'vue';

import {
  NButton,
  NCard,
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
} from 'naive-ui';

import {
  HseActionBar,
  HseDataGrid,
  HseImportDialog,
  HsePageLayout,
  HseSearchPanel,
  HseStatusTag,
  type HseActionKey,
} from '#/components/hse';
import {
  createBudget,
  deleteBudget,
  getBudgetList,
  getBudgetStats,
  updateBudget,
  type BudgetApi,
} from '#/api/hse/goals';
import { useGenericImport } from '#/views/hse/_shared/useGenericImport';
import { message } from '#/adapter/naive';

defineOptions({ name: 'ObjectivesBudgetExpenditure' });

// ===================== 数据 =====================
const loading = ref(false);
const statsLoading = ref(false);
const budgetList = ref<BudgetApi.BudgetItem[]>([]);
const total = ref(0);
const budgetStats = ref<BudgetApi.BudgetStats | null>(null);

const searchForm = reactive({
  keyword: '',
  year: undefined as number | undefined,
  status: undefined as string | undefined,
});
const pagination = reactive({ page: 1, pageSize: 10 });
const sortBy = ref<string | undefined>(undefined);
const sortOrder = ref<'asc' | 'desc' | undefined>(undefined);

const yearOptions = computed(() => {
  const years: number[] = [];
  const currentYear = new Date().getFullYear();
  for (let y = 2024; y <= currentYear + 1; y += 1) years.push(y);
  return years;
});

const statItems = computed(() => {
  const stats = budgetStats.value;
  const planTotal = stats?.planTotal ?? 0;
  const spentTotal = stats?.spentTotal ?? 0;
  const executionRate = stats?.executionRate ?? 0;
  const count = stats?.total ?? budgetList.value.length;
  return [
    { key: 'total_plan', label: '计划总额(万元)', value: `${planTotal.toFixed(2)}万`, color: 'blue', icon: 'lucide:wallet' },
    { key: 'total_actual', label: '已支出(万元)', value: `${spentTotal.toFixed(2)}万`, color: 'orange', icon: 'lucide:trending-up' },
    { key: 'execution_rate', label: '执行率', value: `${executionRate}%`, color: 'cyan', icon: 'lucide:bar-chart-3' },
    { key: 'count', label: '项目数', value: count, color: 'green', icon: 'lucide:clipboard-list' },
  ];
});

const showActualExpenditure = computed(() => {
  const y = searchForm.year;
  return y === undefined || y === null || y >= 2026;
});

const columns = computed<any[]>(() => {
  const base = [
    {
      title: '序号',
      field: 'index',
      width: 70,
      align: 'center',
      formatter: (params: any) => (pagination.page - 1) * pagination.pageSize + (params?.rowIndex ?? 0) + 1,
    },
    { title: '措施项目', field: 'measureItem', minWidth: 160, align: 'center', showOverflow: 'tooltip' },
    { title: '名称', field: 'itemName', minWidth: 160, align: 'center', showOverflow: 'tooltip' },
    { title: '用途及依据', field: 'purpose', minWidth: 160, align: 'center', showOverflow: 'tooltip' },
    { title: '计划使用时间', field: 'planTime', width: 120, align: 'center', formatter: (params: any) => (params?.cellValue ? formatDate(params.cellValue) : '-') },
    { title: '使用部门/地点', field: 'location', width: 160, align: 'center', showOverflow: 'tooltip' },
    { title: '规格/品牌', field: 'spec', width: 120, align: 'center', showOverflow: 'tooltip' },
    { title: '计划-数量', field: 'planQuantity', width: 100, align: 'center' },
    { title: '计划-单价(万)', field: 'planUnitPrice', width: 120, align: 'center' },
    { title: '计划-总价(万)', field: 'planTotal', width: 120, align: 'center', sortable: true },
  ];
  const expend = showActualExpenditure.value
    ? [
        { title: 'OA计划支出-数量', field: 'actualQuantity', width: 120, align: 'center' },
        { title: 'OA计划支出-单价(万)', field: 'actualUnitPrice', width: 140, align: 'center' },
        {
          title: 'OA计划支出-总价(万)',
          field: 'actualTotal',
          width: 140,
          align: 'center',
          formatter: (params: any) => fmtMoney(params?.row?.actualQuantity, params?.row?.actualUnitPrice),
        },
        { title: '实际支出-数量', field: 'actualExpenditureQuantity', width: 120, align: 'center' },
        { title: '实际支出-单价(万)', field: 'actualExpenditureUnitPrice', width: 140, align: 'center' },
        {
          title: '实际支出-总价(万)',
          field: 'actualExpenditureTotal',
          width: 140,
          align: 'center',
          formatter: (params: any) => (params?.row?.actualExpenditureTotal ?? '-'),
        },
      ]
    : [
        { title: '支出-数量', field: 'actualQuantity', width: 100, align: 'center' },
        { title: '支出-单价(万)', field: 'actualUnitPrice', width: 120, align: 'center' },
        {
          title: '支出-总价(万)',
          field: 'actualTotal',
          width: 120,
          align: 'center',
          formatter: (params: any) => fmtMoney(params?.row?.actualQuantity, params?.row?.actualUnitPrice),
        },
      ];
  const tail = [
    { title: '使用状态', field: 'useStatus', width: 100, align: 'center', sortable: true, slots: { default: 'useStatusCell' } },
    { title: '备注', field: 'remark', width: 150, align: 'center', showOverflow: 'tooltip' },
    { title: '操作', field: 'action', width: 180, align: 'center', fixed: 'right', slots: { default: 'action' } },
  ];
  return [{ type: 'checkbox', width: 50, align: 'center', fixed: 'left' }, ...base, ...expend, ...tail];
});

function fmtMoney(qty: number | undefined, price: number | undefined): string {
  if (qty == null || price == null) return '-';
  return String(Number((qty * price).toFixed(4)));
}
function formatDate(value: string | number | null | undefined): string {
  const s = value == null ? '' : String(value);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

const STATUS_TAG: Record<string, 'info' | 'warning' | 'success'> = {
  planning: 'info',
  executing: 'warning',
  completed: 'success',
};
const STATUS_TEXT: Record<string, string> = {
  planning: '计划中',
  executing: '执行中',
  completed: '已完成',
};
const USE_STATUS_TAG: Record<string, 'success' | 'warning' | 'info' | 'neutral'> = {
  已支出: 'success',
  申请中: 'warning',
  未支出: 'info',
};

async function fetchData() {
  loading.value = true;
  statsLoading.value = true;
  try {
    const params: BudgetApi.BudgetListParams = {
      page: pagination.page,
      pageSize: pagination.pageSize,
      keyword: searchForm.keyword || undefined,
      year: searchForm.year,
      status: searchForm.status || undefined,
      sortField: sortBy.value,
      sortOrder: sortOrder.value,
    };
    const statsParams: BudgetApi.BudgetListParams = {
      keyword: searchForm.keyword || undefined,
      year: searchForm.year ?? new Date().getFullYear(),
    };
    const [res, statsRes] = await Promise.all([getBudgetList(params), getBudgetStats(statsParams)]);
    budgetList.value = res.list || [];
    total.value = res.total || 0;
    budgetStats.value = statsRes;
  } catch {
    budgetList.value = [];
    total.value = 0;
    budgetStats.value = null;
  } finally {
    loading.value = false;
    statsLoading.value = false;
  }
}
function onSearch() {
  pagination.page = 1;
  fetchData();
}
function onReset() {
  Object.assign(searchForm, { keyword: '', year: undefined, status: undefined });
  onSearch();
}
function onPageChange(payload: { currentPage: number; pageSize: number }) {
  pagination.page = payload.currentPage;
  pagination.pageSize = payload.pageSize;
  fetchData();
}
function onSortChange(payload: { sortBy?: string; sortOrder?: 'asc' | 'desc' }) {
  sortBy.value = payload.sortBy;
  sortOrder.value = payload.sortOrder;
  pagination.page = 1;
  fetchData();
}

// ===================== 新增/编辑 =====================
const modalVisible = ref(false);
const modalLoading = ref(false);
const editingBudget = ref<BudgetApi.BudgetItem | null>(null);
const budgetForm = reactive({
  budgetYear: new Date().getFullYear(),
  year: new Date().getFullYear(),
  item: '',
  itemName: '',
  category: '',
  measureItem: '',
  budgetSubject: '',
  purpose: '',
  planTime: '',
  location: '',
  spec: '',
  planQuantity: undefined as number | undefined,
  planUnitPrice: undefined as number | undefined,
  planTotal: undefined as number | undefined,
  actualQuantity: undefined as number | undefined,
  actualUnitPrice: undefined as number | undefined,
  actualExpenditureQuantity: undefined as number | undefined,
  actualExpenditureUnitPrice: undefined as number | undefined,
  actualExpenditureTotal: undefined as number | undefined,
  useStatus: '',
  budgetAmount: 0 as number | undefined,
  usedAmount: 0 as number | undefined,
  status: 'planning',
  remark: '',
});

function resetBudgetForm() {
  Object.assign(budgetForm, {
    budgetYear: new Date().getFullYear(),
    year: new Date().getFullYear(),
    item: '',
    itemName: '',
    category: '',
    measureItem: '',
    budgetSubject: '',
    purpose: '',
    planTime: '',
    location: '',
    spec: '',
    planQuantity: undefined,
    planUnitPrice: undefined,
    planTotal: undefined,
    actualQuantity: undefined,
    actualUnitPrice: undefined,
    actualExpenditureQuantity: undefined,
    actualExpenditureUnitPrice: undefined,
    actualExpenditureTotal: undefined,
    useStatus: '',
    budgetAmount: 0,
    usedAmount: 0,
    status: 'planning',
    remark: '',
  });
}
function handleCreate() {
  editingBudget.value = null;
  resetBudgetForm();
  modalVisible.value = true;
}
function handleEdit(record: BudgetApi.BudgetItem) {
  editingBudget.value = record;
  Object.assign(budgetForm, {
    budgetYear: record.budgetYear || record.year,
    year: record.budgetYear || record.year,
    item: record.item || record.itemName || record.projectName,
    itemName: record.itemName || record.item || record.projectName,
    category: record.category,
    measureItem: record.measureItem,
    budgetSubject: record.budgetSubject,
    purpose: record.purpose,
    planTime: record.planTime,
    location: record.location,
    spec: record.spec,
    planQuantity: record.planQuantity,
    planUnitPrice: record.planUnitPrice,
    planTotal: record.planTotal,
    actualQuantity: record.actualQuantity,
    actualUnitPrice: record.actualUnitPrice,
    actualExpenditureQuantity: record.actualExpenditureQuantity,
    actualExpenditureUnitPrice: record.actualExpenditureUnitPrice,
    actualExpenditureTotal: record.actualExpenditureTotal,
    useStatus: record.useStatus,
    budgetAmount: record.budgetAmount,
    usedAmount: record.usedAmount || record.spentAmount,
    status: record.status || 'planning',
    remark: record.remark || '',
  });
  modalVisible.value = true;
}
function handleView(record: BudgetApi.BudgetItem) {
  currentBudget.value = record;
  detailDrawerVisible.value = true;
}
async function handleSave() {
  if (!budgetForm.itemName) {
    message.warning('请填写名称');
    return;
  }
  modalLoading.value = true;
  try {
    const spentAmount =
      budgetForm.actualQuantity && budgetForm.actualUnitPrice
        ? budgetForm.actualQuantity * budgetForm.actualUnitPrice * 10000
        : budgetForm.usedAmount || 0;
    const data: Partial<BudgetApi.BudgetItem> = {
      budgetYear: budgetForm.budgetYear,
      year: budgetForm.budgetYear,
      item: budgetForm.itemName,
      itemName: budgetForm.itemName,
      projectName: budgetForm.itemName,
      category: budgetForm.category,
      measureItem: budgetForm.measureItem,
      budgetSubject: budgetForm.budgetSubject,
      purpose: budgetForm.purpose,
      planTime: budgetForm.planTime,
      location: budgetForm.location,
      spec: budgetForm.spec,
      planQuantity: budgetForm.planQuantity,
      planUnitPrice: budgetForm.planUnitPrice,
      planTotal: budgetForm.planTotal,
      actualQuantity: budgetForm.actualQuantity,
      actualUnitPrice: budgetForm.actualUnitPrice,
      actualExpenditureQuantity: budgetForm.actualExpenditureQuantity,
      actualExpenditureUnitPrice: budgetForm.actualExpenditureUnitPrice,
      actualExpenditureTotal: budgetForm.actualExpenditureTotal,
      useStatus: budgetForm.useStatus,
      budgetAmount: budgetForm.planTotal ? budgetForm.planTotal * 10000 : budgetForm.budgetAmount || 0,
      usedAmount: spentAmount,
      spentAmount,
      status: budgetForm.status,
      remark: budgetForm.remark,
    };
    if (editingBudget.value) {
      await updateBudget(editingBudget.value.id, data);
      message.success('更新成功');
    } else {
      await createBudget(data);
      message.success('创建成功');
    }
    modalVisible.value = false;
    fetchData();
  } catch {
    /* 拦截器已提示（不伪造成功） */
  } finally {
    modalLoading.value = false;
  }
}
async function handleDelete(record: BudgetApi.BudgetItem) {
  try {
    await deleteBudget(record.id);
    message.success('删除成功');
    fetchData();
  } catch {
    /* 拦截器已提示 */
  }
}

// ===================== 详情 =====================
const detailDrawerVisible = ref(false);
const currentBudget = ref<BudgetApi.BudgetItem | null>(null);

// ===================== 工具栏 / 导入 =====================
const actionState = ref<Partial<Record<HseActionKey, { hidden?: boolean }>>>({
  export: {},
});
const gridRef = ref<any>(null);
function handleExport() {
  gridRef.value?.gridApi?.grid?.exportData({ type: 'csv' });
}
function getSelectedRows(): any[] {
  try {
    return gridRef.value?.gridApi?.grid?.getCheckboxRecords?.() ?? [];
  } catch {
    return [];
  }
}
async function onBatchDelete() {
  const rows = getSelectedRows();
  if (!rows.length) {
    message.warning('请先勾选要删除的记录');
    return;
  }
  try {
    await Promise.all(rows.map((r) => deleteBudget(r.id)));
    message.success('批量删除成功');
    await onRefresh();
  } catch {
    message.error('批量删除失败');
  }
}
const {
  importOpen,
  importPreviewColumns,
  importPreviewData,
  importPreviewError,
  importConfirming,
  importResult,
  bindRefresh: bindImportRefresh,
  onDownloadTemplate: onImportTemplate,
  onUpload: onImportUpload,
  onConfirmImport: onImportConfirm,
  onImportClose: onImportDialogClose,
} = useGenericImport('budget');
bindImportRefresh(onRefresh);

async function onRefresh() {
  fetchData();
}

onMounted(() => {
  fetchData();
});
</script>

<template>
  <HsePageLayout title="安全费用支出">
    <template #extra>
      <div class="flex flex-wrap items-center gap-2">
        <NButton type="error" @click="onBatchDelete">批量删除</NButton>
        <HseActionBar
          :actions="actionState"
          @refresh="onRefresh"
          @export="handleExport"
          @download-template="onImportTemplate"
          @import="() => (importOpen = true)"
          @create="handleCreate"
        />
      </div>
    </template>

    <div class="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
      <NCard v-for="s in statItems" :key="s.key" :bordered="false" :loading="statsLoading">
        <NStatistic :label="s.label" :value="s.value" />
      </NCard>
    </div>

    <HseSearchPanel @query="onSearch" @reset="onReset">
      <NGi>
        <NInput v-model:value="searchForm.keyword" placeholder="名称 / 措施项目 / 用途" clearable @keyup.enter="onSearch" />
      </NGi>
      <NGi>
        <NSelect
          v-model:value="searchForm.year"
          placeholder="年份"
          clearable
          :options="yearOptions.map((y) => ({ label: `${y} 年`, value: y }))"
        />
      </NGi>
      <NGi>
        <NSelect
          v-model:value="searchForm.status"
          placeholder="状态"
          clearable
          :options="[
            { label: '计划中', value: 'planning' },
            { label: '执行中', value: 'executing' },
            { label: '已完成', value: 'completed' },
          ]"
        />
      </NGi>
    </HseSearchPanel>

    <HseDataGrid
      ref="gridRef"
      :columns="columns"
      :data="budgetList"
      :loading="loading"
      :pager="true"
      :total="total"
      scroll-x="1800"
      @page-change="onPageChange"
      @sort-change="onSortChange"
    >
      <template #useStatusCell="{ row }">
        <HseStatusTag v-if="row.useStatus" :type="USE_STATUS_TAG[row.useStatus] || 'neutral'">
          {{ row.useStatus }}
        </HseStatusTag>
        <span v-else>-</span>
      </template>
      <template #action="{ row }">
        <NSpace :size="8">
          <NButton size="small" quaternary type="primary" @click="handleView(row)">查看</NButton>
          <NButton size="small" quaternary type="primary" @click="handleEdit(row)">编辑</NButton>
          <NPopconfirm @positive-click="handleDelete(row)">
            <template #trigger>
              <NButton size="small" quaternary type="error">删除</NButton>
            </template>
            确认删除该支出记录？
          </NPopconfirm>
        </NSpace>
      </template>
    </HseDataGrid>

    <!-- 新增/编辑 -->
    <NModal
      v-model:show="modalVisible"
      :title="editingBudget ? '编辑支出记录' : '新增支出记录'"
      preset="card"
      style="width: 860px; max-width: 96vw"
    >
      <NForm label-placement="top">
        <div class="grid grid-cols-3 gap-x-4">
          <NFormItem label="预算年度" required>
            <NSelect
              v-model:value="budgetForm.budgetYear"
              placeholder="请选择年份"
              :options="yearOptions.map((y) => ({ label: `${y} 年`, value: y }))"
            />
          </NFormItem>
          <NFormItem label="预算科目">
            <NSelect
              v-model:value="budgetForm.budgetSubject"
              placeholder="请选择预算科目"
              clearable
              :options="[
                { label: '费用化', value: '费用化' },
                { label: '资本化', value: '资本化' },
              ]"
            />
          </NFormItem>
          <NFormItem label="类别">
            <NSelect
              v-model:value="budgetForm.category"
              placeholder="请选择类别"
              clearable
              :options="[
                { label: '培训教育', value: '培训教育' },
                { label: '防护装备', value: '防护装备' },
                { label: '设备改造', value: '设备改造' },
                { label: '应急保障', value: '应急保障' },
                { label: '检测检验', value: '检测检验' },
                { label: '职业健康', value: '职业健康' },
              ]"
            />
          </NFormItem>
          <NFormItem label="措施项目">
            <NInput v-model:value="budgetForm.measureItem" type="textarea" :rows="2" placeholder="请输入措施项目" />
          </NFormItem>
          <NFormItem label="名称" required>
            <NInput v-model:value="budgetForm.itemName" placeholder="请输入名称" />
          </NFormItem>
          <NFormItem label="规格/品牌">
            <NInput v-model:value="budgetForm.spec" placeholder="请输入规格/品牌" />
          </NFormItem>
          <NFormItem label="用途及依据">
            <NInput v-model:value="budgetForm.purpose" placeholder="请输入用途及依据" />
          </NFormItem>
          <NFormItem label="使用部门/地点">
            <NInput v-model:value="budgetForm.location" placeholder="请输入使用部门/地点" />
          </NFormItem>
          <NFormItem label="计划使用时间">
            <NInput v-model:value="budgetForm.planTime" placeholder="如：2026-03" />
          </NFormItem>
          <NFormItem label="计划-数量">
            <NInputNumber v-model:value="budgetForm.planQuantity" :min="0" :precision="0" style="width: 100%" placeholder="计划数量" />
          </NFormItem>
          <NFormItem label="计划-单价(万)">
            <NInputNumber v-model:value="budgetForm.planUnitPrice" :min="0" :precision="4" :step="0.0001" style="width: 100%" placeholder="计划单价" />
          </NFormItem>
          <NFormItem label="计划-总价(万)">
            <NInputNumber v-model:value="budgetForm.planTotal" :min="0" :precision="4" :step="0.0001" style="width: 100%" placeholder="计划总价" />
          </NFormItem>
          <NFormItem label="OA计划支出-数量">
            <NInputNumber v-model:value="budgetForm.actualQuantity" :min="0" :precision="0" style="width: 100%" placeholder="OA计划支出数量" />
          </NFormItem>
          <NFormItem label="OA计划支出-单价(万)">
            <NInputNumber v-model:value="budgetForm.actualUnitPrice" :min="0" :precision="4" :step="0.0001" style="width: 100%" placeholder="OA计划支出单价" />
          </NFormItem>
          <NFormItem label="实际支出-数量">
            <NInputNumber v-model:value="budgetForm.actualExpenditureQuantity" :min="0" :precision="0" style="width: 100%" placeholder="实际支出数量" />
          </NFormItem>
          <NFormItem label="实际支出-单价(万)">
            <NInputNumber v-model:value="budgetForm.actualExpenditureUnitPrice" :min="0" :precision="4" :step="0.0001" style="width: 100%" placeholder="实际支出单价" />
          </NFormItem>
          <NFormItem label="实际支出-总价(万)">
            <NInputNumber v-model:value="budgetForm.actualExpenditureTotal" :min="0" :precision="4" :step="0.0001" style="width: 100%" placeholder="实际支出总价" />
          </NFormItem>
          <NFormItem label="使用状态">
            <NSelect
              v-model:value="budgetForm.useStatus"
              placeholder="请选择使用状态"
              clearable
              :options="[
                { label: '已支出', value: '已支出' },
                { label: '申请中', value: '申请中' },
                { label: '未支出', value: '未支出' },
              ]"
            />
          </NFormItem>
          <NFormItem label="状态">
            <NSelect
              v-model:value="budgetForm.status"
              placeholder="请选择状态"
              :options="[
                { label: '计划中', value: 'planning' },
                { label: '执行中', value: 'executing' },
                { label: '已完成', value: 'completed' },
              ]"
            />
          </NFormItem>
        </div>
        <NFormItem label="备注">
          <NInput v-model:value="budgetForm.remark" type="textarea" :rows="2" placeholder="请输入备注" />
        </NFormItem>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="modalVisible = false">取消</NButton>
          <NButton type="primary" :loading="modalLoading" @click="handleSave">保存</NButton>
        </NSpace>
      </template>
    </NModal>

    <!-- 详情抽屉 -->
    <NDrawer v-model:show="detailDrawerVisible" title="支出详情" :width="640">
      <NDrawerContent>
        <NDescriptions v-if="currentBudget" :column="2" bordered label-placement="left" size="small">
          <NDescriptionsItem label="预算年度">{{ currentBudget.budgetYear ?? '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="预算科目">{{ currentBudget.budgetSubject || '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="措施项目" :span="2">{{ currentBudget.measureItem || '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="名称" :span="2">{{ currentBudget.itemName || '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="规格/品牌">{{ currentBudget.spec || '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="类别">{{ currentBudget.category || '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="用途及依据" :span="2">{{ currentBudget.purpose || '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="使用部门/地点" :span="2">{{ currentBudget.location || '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="计划使用时间">{{ currentBudget.planTime || '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="使用状态">{{ currentBudget.useStatus || '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="计划-数量">{{ currentBudget.planQuantity ?? '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="计划-单价(万)">{{ currentBudget.planUnitPrice ?? '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="计划-总价(万)">{{ currentBudget.planTotal ?? '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="OA计划支出-数量">{{ currentBudget.actualQuantity ?? '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="OA计划支出-单价(万)">{{ currentBudget.actualUnitPrice ?? '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="实际支出-数量">{{ currentBudget.actualExpenditureQuantity ?? '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="实际支出-单价(万)">{{ currentBudget.actualExpenditureUnitPrice ?? '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="实际支出-总价(万)">{{ currentBudget.actualExpenditureTotal ?? '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="状态">
            <HseStatusTag :type="STATUS_TAG[currentBudget.status] || 'neutral'">
              {{ STATUS_TEXT[currentBudget.status] || currentBudget.status || '-' }}
            </HseStatusTag>
          </NDescriptionsItem>
          <NDescriptionsItem label="备注" :span="2">{{ currentBudget.remark || '-' }}</NDescriptionsItem>
        </NDescriptions>
      </NDrawerContent>
    </NDrawer>

    <!-- 通用导入（budget 模块，后端端点已核实 /import/template/budget=200） -->
    <HseImportDialog
      v-model:open="importOpen"
      title="导入安全费用支出"
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
