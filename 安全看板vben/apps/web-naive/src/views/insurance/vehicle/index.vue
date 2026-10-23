<script lang="ts" setup>
/**
 * 车辆保险管理（web-naive）
 * 统一使用 HSE 公共组件栈：HsePageLayout + HseSearchPanel + HseActionBar + HseDataGrid + HseImportDialog + HseStatusTag
 */
import { reactive, ref, onMounted } from 'vue';

import {
  NButton,
  NCard,
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
  INSURANCE_VEHICLE_STATUS_TAG as STATUS_TAG,
  EXPIRY_TAG,
  EXPIRY_LABEL,
} from '#/components/hse';
import type { VxeTableGridColumns } from '#/adapter/vxe-table';
import {
  createVehicle,
  deleteVehicle,
  exportVehicleInsurance,
  getVehicleList,
  getVehicleStats,
  updateVehicle,
  type InsuranceApi,
} from '#/api/hse/insurance';
import { useGenericImport } from '#/views/hse/_shared/useGenericImport';
import { message } from '#/adapter/naive';

defineOptions({ name: 'InsuranceVehicle' });

// ===================== 映射 =====================
const VEHICLE_STATUS_OPTIONS = [
  { label: '在用', value: '在用' },
  { label: '停用', value: '停用' },
  { label: '报废', value: '报废' },
];

// ===================== 列表数据 =====================
const loading = ref(false);
const data = ref<any[]>([]);
const total = ref(0);
const currentPage = ref(1);
// 单页展示：一次拉取全部记录（当前车队约 55 辆），关闭分页器后表格在一页内显示完整
const pageSize = ref(9999);
const sortBy = ref<string | undefined>(undefined);
const sortOrder = ref<'asc' | 'desc' | undefined>(undefined);

const searchForm = reactive({
  keyword: '',
  insuranceStatus: '' as string | null,
});

async function loadData() {
  loading.value = true;
  try {
    const res = await getVehicleList({
      page: currentPage.value,
      pageSize: pageSize.value,
      keyword: searchForm.keyword || undefined,
      insuranceStatus: searchForm.insuranceStatus || undefined,
      sortField: sortBy.value,
      sortOrder: sortOrder.value,
    });
    data.value = res.list ?? [];
    total.value = res.total ?? 0;
  } catch {
    data.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
}

// ===================== 统计 =====================
const statTotal = ref(0);
const statActive = ref(0);
const statExpiring = ref(0);
const statExpired = ref(0);

async function loadStats() {
  try {
    const res = await getVehicleStats();
    const s = res.stats ?? res;
    statTotal.value = s?.total ?? 0;
    statActive.value = s?.active ?? 0;
    statExpiring.value = s?.expiring ?? 0;
    statExpired.value = s?.expired ?? 0;
  } catch {
    /* ignore */
  }
}

function onSearch() {
  currentPage.value = 1;
  loadData();
  loadStats();
}

function onReset() {
  searchForm.keyword = '';
  searchForm.insuranceStatus = null;
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

// ===================== 操作栏 =====================
const actionState = ref<Partial<Record<HseActionKey, { hidden?: boolean }>>>(
  {},
);

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
  // 模块标识必须与后端 server/routes/import.js 的 NATIVE_IMPORT_MODULES key 完全一致。
  // 后端 key 为 'vehicle'（targetTable: vehicles）；若写成 'insurance-vehicle' 会匹配不到原生配置，
  // 降级到 Python 引擎并被误识别为 'insurance'（人员保险），导致车辆数据一条都写不进 vehicles 表。
} = useGenericImport('vehicle');
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
    const blob = await exportVehicleInsurance();
    triggerDownload(blob, `车辆保险台账_${new Date().toISOString().slice(0, 10)}.csv`);
    message.success('导出成功');
  } catch {
    message.error('导出失败');
  }
}

// ===================== 新增 / 编辑 / 查看 =====================
const formOpen = ref(false);
const formMode = ref<'create' | 'edit' | 'view'>('create');
const formLoading = ref(false);
const editingId = ref<number | null>(null);

const formModel = reactive<{
  plate: string;
  model: string;
  vehicle_type: string;
  policy_holder: string;
  registered_owner: string;
  vin: string;
  engine_no: string;
  compulsory_start: string;
  compulsory_end: string;
  commercial_start: string;
  commercial_end: string;
  third_party_amount: string;
  third_party_premium: number | null;
  vehicle_damage_amount: number | null;
  vehicle_damage_premium: number | null;
  total_premium: number | null;
  status: string;
  remark: string;
}>({
  plate: '',
  model: '',
  vehicle_type: '',
  policy_holder: '',
  registered_owner: '',
  vin: '',
  engine_no: '',
  compulsory_start: '',
  compulsory_end: '',
  commercial_start: '',
  commercial_end: '',
  third_party_amount: '',
  third_party_premium: null,
  vehicle_damage_amount: null,
  vehicle_damage_premium: null,
  total_premium: null,
  status: '在用',
  remark: '',
});

function resetForm() {
  Object.assign(formModel, {
    plate: '',
    model: '',
    vehicle_type: '',
    policy_holder: '',
    registered_owner: '',
    vin: '',
    engine_no: '',
    compulsory_start: '',
    compulsory_end: '',
    commercial_start: '',
    commercial_end: '',
    third_party_amount: '',
    third_party_premium: null,
    vehicle_damage_amount: null,
    vehicle_damage_premium: null,
    total_premium: null,
    status: '在用',
    remark: '',
  });
}

function openCreate() {
  resetForm();
  formMode.value = 'create';
  editingId.value = null;
  formOpen.value = true;
}

function openEdit(row: any) {
  resetForm();
  formMode.value = 'edit';
  editingId.value = row.id;
  Object.assign(formModel, {
    plate: row.plate || '',
    model: row.model || '',
    vehicle_type: row.vehicle_type || '',
    policy_holder: row.policy_holder || '',
    registered_owner: row.registered_owner || '',
    vin: row.vin || '',
    engine_no: row.engine_no || '',
    compulsory_start: row.compulsory_start ? String(row.compulsory_start).slice(0, 10) : '',
    compulsory_end: row.compulsory_end ? String(row.compulsory_end).slice(0, 10) : '',
    commercial_start: row.commercial_start ? String(row.commercial_start).slice(0, 10) : '',
    commercial_end: row.commercial_end ? String(row.commercial_end).slice(0, 10) : '',
    third_party_amount: row.third_party_amount || '',
    third_party_premium: row.third_party_premium ?? null,
    vehicle_damage_amount: row.vehicle_damage_amount ?? null,
    vehicle_damage_premium: row.vehicle_damage_premium ?? null,
    total_premium: row.total_premium ?? null,
    status: row.status || '在用',
    remark: row.remark || '',
  });
  formOpen.value = true;
}

function openView(row: any) {
  openEdit(row);
  formMode.value = 'view';
}

async function onSubmit() {
  if (!formModel.plate) {
    message.warning('车牌号不能为空');
    return;
  }
  formLoading.value = true;
  try {
    const payload: InsuranceApi.VehicleFormData = {
      plate: formModel.plate,
      model: formModel.model || undefined,
      vehicle_type: formModel.vehicle_type || undefined,
      policy_holder: formModel.policy_holder || undefined,
      registered_owner: formModel.registered_owner || undefined,
      vin: formModel.vin || undefined,
      engine_no: formModel.engine_no || undefined,
      compulsory_start: formModel.compulsory_start || null,
      compulsory_end: formModel.compulsory_end || null,
      commercial_start: formModel.commercial_start || null,
      commercial_end: formModel.commercial_end || null,
      third_party_amount: formModel.third_party_amount || undefined,
      third_party_premium: formModel.third_party_premium ?? undefined,
      vehicle_damage_amount: formModel.vehicle_damage_amount ?? undefined,
      vehicle_damage_premium: formModel.vehicle_damage_premium ?? undefined,
      total_premium: formModel.total_premium ?? undefined,
      status: formModel.status,
      remark: formModel.remark || undefined,
    };
    if (formMode.value === 'edit' && editingId.value != null) {
      await updateVehicle(editingId.value, payload);
      message.success('编辑成功');
    } else {
      await createVehicle(payload);
      message.success('新增成功');
    }
    formOpen.value = false;
    onRefresh();
  } catch {
    /* 拦截器已提示 */
  } finally {
    formLoading.value = false;
  }
}

async function onDelete(row: any) {
  try {
    await deleteVehicle(row.id);
    message.success('删除成功');
    onRefresh();
  } catch {
    /* 拦截器已提示 */
  }
}

function formatDate(d: string | null | undefined): string {
  if (!d) return '-';
  return String(d).slice(0, 10);
}

function formatMoney(v: number | undefined | null): string {
  if (v == null || v === 0) return '-';
  return `${v} 元`;
}

// ===================== 表格列 =====================
const columns = ref<VxeTableGridColumns>([
  { title: '车牌号', field: 'plate', minWidth: 110, align: 'center' },
  { title: '厂牌车型', field: 'model', minWidth: 150, align: 'center', showOverflow: 'tooltip' },
  {
    title: '交强险保险起期',
    field: 'compulsory_start',
    minWidth: 130,
    align: 'center',
    slots: { default: 'compulsory_start' },
  },
  {
    title: '交强险保险止期',
    field: 'compulsory_end',
    minWidth: 130,
    align: 'center',
    slots: { default: 'compulsory_end' },
  },
  {
    title: '商业险保险起期',
    field: 'commercial_start',
    minWidth: 130,
    align: 'center',
    slots: { default: 'commercial_start' },
  },
  {
    title: '商业险保险止期',
    field: 'commercial_end',
    minWidth: 130,
    align: 'center',
    slots: { default: 'commercial_end' },
  },
  { title: '三者险保额', field: 'third_party_amount', minWidth: 110, align: 'center' },
  {
    title: '保费合计',
    field: 'total_premium',
    minWidth: 110,
    align: 'center',
    sortable: true,
    slots: { default: 'total_premium' },
  },
  {
    title: '时效状态',
    field: 'expiryStatus',
    minWidth: 100,
    align: 'center',
    slots: { default: 'expiry' },
  },
  {
    title: '状态',
    field: 'status',
    minWidth: 80,
    align: 'center',
    sortable: true,
    slots: { default: 'status' },
  },
  {
    title: '操作',
    field: 'action',
    minWidth: 260,
    align: 'center',
    fixed: 'right',
    slots: { default: 'action' },
  },
]);

onMounted(() => {
  loadData();
  loadStats();
});
</script>

<template>
  <HsePageLayout title="车辆保险" description="管理车辆的交强险、商业险等保险信息">
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
    <div class="mb-4 grid grid-cols-4 gap-3">
      <NCard :bordered="false">
        <NStatistic label="车辆总数" :value="statTotal" />
      </NCard>
      <NCard :bordered="false">
        <NStatistic label="保险有效" :value="statActive" />
      </NCard>
      <NCard :bordered="false">
        <NStatistic label="即将到期" :value="statExpiring" />
      </NCard>
      <NCard :bordered="false">
        <NStatistic label="已过期" :value="statExpired" />
      </NCard>
    </div>

    <!-- 搜索 -->
    <HseSearchPanel @query="onSearch" @reset="onReset">
      <NGi>
        <NInput
          v-model:value="searchForm.keyword"
          placeholder="车牌号/车主/车型"
          clearable
          @keyup.enter="onSearch"
        />
      </NGi>
      <NGi>
        <NSelect
          v-model:value="searchForm.insuranceStatus"
          placeholder="保险时效状态"
          clearable
          :options="[
            { label: '正常', value: 'normal' },
            { label: '即将到期', value: 'expiring' },
            { label: '已过期', value: 'expired' },
          ]"
          @update:value="(_v: string | null, _opt: any) => {}"
        />
      </NGi>
    </HseSearchPanel>

    <!-- 表格 -->
    <HseDataGrid
      :columns="columns"
      :data="data"
      :loading="loading"
      :total="total"
      auto-width
      @page-change="onPageChange"
      @sort-change="onSortChange"
    >
      <template #compulsory_start="{ row }">
        <span :class="{ 'text-orange-500 font-medium': row.expiryStatus === 'expiring', 'text-red-500 font-medium': row.expiryStatus === 'expired' }">
          {{ formatDate(row.compulsory_start) }}
        </span>
      </template>
      <template #compulsory_end="{ row }">
        <span :class="{ 'text-orange-500 font-medium': row.expiryStatus === 'expiring', 'text-red-500 font-medium': row.expiryStatus === 'expired' }">
          {{ formatDate(row.compulsory_end) }}
        </span>
      </template>
      <template #commercial_start="{ row }">
        <span :class="{ 'text-orange-500 font-medium': row.expiryStatus === 'expiring', 'text-red-500 font-medium': row.expiryStatus === 'expired' }">
          {{ formatDate(row.commercial_start) }}
        </span>
      </template>
      <template #commercial_end="{ row }">
        <span :class="{ 'text-orange-500 font-medium': row.expiryStatus === 'expiring', 'text-red-500 font-medium': row.expiryStatus === 'expired' }">
          {{ formatDate(row.commercial_end) }}
        </span>
      </template>
      <template #total_premium="{ row }">
        <span class="font-medium text-primary">{{ formatMoney(row.total_premium) }}</span>
      </template>
      <template #expiry="{ row }">
        <HseStatusTag :type="EXPIRY_TAG[row.expiryStatus] || 'neutral'">
          {{ EXPIRY_LABEL[row.expiryStatus] || '-' }}
        </HseStatusTag>
      </template>
      <template #status="{ row }">
        <HseStatusTag :type="STATUS_TAG[row.status] || 'neutral'">
          {{ row.status || '-' }}
        </HseStatusTag>
      </template>
      <template #action="{ row }">
        <NSpace justify="center" :wrap="false" :size="4">
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
            确定删除该车辆保险记录吗？
          </NPopconfirm>
        </NSpace>
      </template>
    </HseDataGrid>

    <!-- 新增 / 编辑 / 查看 弹窗 -->
    <NModal
      v-model:show="formOpen"
      :title="
        formMode === 'create'
          ? '新增车辆保险'
          : formMode === 'edit'
            ? '编辑车辆保险'
            : '车辆保险详情'
      "
      preset="card"
      style="width: 760px; max-width: 94vw"
      :mask-closable="false"
    >
      <NForm :disabled="formMode === 'view'" label-placement="top">
        <div class="mb-2 font-medium text-sm text-gray-600">车辆信息</div>
        <div class="grid grid-cols-3 gap-x-4">
          <NFormItem label="车牌号" required>
            <NInput v-model:value="formModel.plate" placeholder="请输入车牌号" />
          </NFormItem>
          <NFormItem label="厂牌车型">
            <NInput v-model:value="formModel.model" placeholder="选填" />
          </NFormItem>
          <NFormItem label="车辆类型">
            <NInput v-model:value="formModel.vehicle_type" placeholder="选填" />
          </NFormItem>
          <NFormItem label="投保人/被保险人">
            <NInput v-model:value="formModel.policy_holder" placeholder="选填" />
          </NFormItem>
          <NFormItem label="行驶证车主">
            <NInput v-model:value="formModel.registered_owner" placeholder="选填" />
          </NFormItem>
          <NFormItem label="状态">
            <NSelect v-model:value="formModel.status" :options="VEHICLE_STATUS_OPTIONS" />
          </NFormItem>
          <NFormItem label="车架号(VIN)">
            <NInput v-model:value="formModel.vin" placeholder="选填" />
          </NFormItem>
          <NFormItem label="发动机号">
            <NInput v-model:value="formModel.engine_no" placeholder="选填" />
          </NFormItem>
        </div>

        <div class="mb-2 mt-3 font-medium text-sm text-gray-600">保险期限</div>
        <div class="grid grid-cols-2 gap-x-4">
          <NFormItem label="交强险起期">
            <NInput v-model:value="formModel.compulsory_start" placeholder="YYYY-MM-DD" />
          </NFormItem>
          <NFormItem label="交强险止期">
            <NInput v-model:value="formModel.compulsory_end" placeholder="YYYY-MM-DD" />
          </NFormItem>
          <NFormItem label="商业险起期">
            <NInput v-model:value="formModel.commercial_start" placeholder="YYYY-MM-DD" />
          </NFormItem>
          <NFormItem label="商业险止期">
            <NInput v-model:value="formModel.commercial_end" placeholder="YYYY-MM-DD" />
          </NFormItem>
        </div>

        <div class="mb-2 mt-3 font-medium text-sm text-gray-600">险种保费</div>
        <div class="grid grid-cols-3 gap-x-4">
          <NFormItem label="三者险保额">
            <NInput v-model:value="formModel.third_party_amount" placeholder="如：200万" />
          </NFormItem>
          <NFormItem label="三者险保费(元)">
            <NInputNumber v-model:value="formModel.third_party_premium" :min="0" placeholder="选填" style="width: 100%" />
          </NFormItem>
          <NFormItem label="车损险保额(元)">
            <NInputNumber v-model:value="formModel.vehicle_damage_amount" :min="0" placeholder="选填" style="width: 100%" />
          </NFormItem>
          <NFormItem label="车损险保费(元)">
            <NInputNumber v-model:value="formModel.vehicle_damage_premium" :min="0" placeholder="选填" style="width: 100%" />
          </NFormItem>
          <NFormItem label="保费合计(元)">
            <NInputNumber v-model:value="formModel.total_premium" :min="0" placeholder="选填" style="width: 100%" />
          </NFormItem>
        </div>

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
          <NButton
            v-if="formMode !== 'view'"
            type="primary"
            :loading="formLoading"
            @click="onSubmit"
          >
            保存
          </NButton>
        </NSpace>
      </template>
    </NModal>

    <!-- 通用导入 -->
    <HseImportDialog
      v-model:open="importOpen"
      title="导入车辆保险"
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
