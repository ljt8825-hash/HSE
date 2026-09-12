<script lang="ts" setup>
/**
 * 其他保险管理（web-naive）
 * 管理公众责任险、财产一切险等其他保险类型
 * 统一使用 HSE 公共组件栈：HsePageLayout + HseSearchPanel + HseActionBar + HseDataGrid + HseImportDialog + HseStatusTag
 */
import { reactive, ref, onMounted } from 'vue';
import type { UploadFileInfo } from 'naive-ui';

import {
  NAlert,
  NButton,
  NCard,
  NDescriptions,
  NDescriptionsItem,
  NEmpty,
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
  NTag,
  NUpload,
} from 'naive-ui';
import { FileUp, Upload } from '@vben/icons';

import {
  HseActionBar,
  HseDataGrid,
  HseImportDialog,
  HsePageLayout,
  HseSearchPanel,
  HseStatusTag,
  type HseActionKey,
} from '#/components/hse';
import type { VxeTableGridColumns } from '#/adapter/vxe-table';
import {
  createOtherInsurance,
  deleteOtherInsurance,
  exportOtherInsurance,
  getOtherInsuranceList,
  getOtherInsuranceStats,
  getPolicyFile,
  importOtherInsurancePdf,
  updateOtherInsurance,
  type InsuranceApi,
  type OtherPdfOcrResult,
} from '#/api/hse/insurance';
import { useGenericImport } from '#/views/hse/_shared/useGenericImport';
import { message } from '#/adapter/naive';

defineOptions({ name: 'InsuranceOther' });

// ===================== 映射 =====================
const EXPIRY_TAG: Record<
  string,
  'success' | 'info' | 'warning' | 'danger' | 'neutral'
> = {
  normal: 'success',
  expiring: 'warning',
  expired: 'danger',
  unknown: 'neutral',
};
const EXPIRY_LABEL: Record<string, string> = {
  normal: '正常',
  expiring: '临期',
  expired: '过期',
  unknown: '未知',
};

const STATUS_TAG: Record<string, 'success' | 'danger' | 'neutral'> = {
  有效: 'success',
  失效: 'danger',
};

const INSURANCE_TYPE_OPTIONS = [
  { label: '公众责任险', value: '公众责任险' },
  { label: '财产一切险', value: '财产一切险' },
];

const STATUS_OPTIONS = [
  { label: '有效', value: '有效' },
  { label: '失效', value: '失效' },
];

const INSURANCE_TYPE_TAG_COLOR: Record<string, 'info' | 'warning' | 'neutral'> = {
  公众责任险: 'info',
  财产一切险: 'warning',
};

// ===================== 列表数据 =====================
const loading = ref(false);
const data = ref<InsuranceApi.OtherInsuranceItem[]>([]);
const total = ref(0);
const currentPage = ref(1);
const pageSize = ref(20);
const sortBy = ref<string | undefined>(undefined);
const sortOrder = ref<'asc' | 'desc' | undefined>(undefined);

const searchForm = reactive({
  keyword: '',
  insuranceType: '' as string | null,
  expiryStatus: '' as string | null,
});

async function loadData() {
  loading.value = true;
  try {
    const res = await getOtherInsuranceList({
      page: currentPage.value,
      pageSize: pageSize.value,
      keyword: searchForm.keyword || undefined,
      insuranceType: searchForm.insuranceType || undefined,
      expiryStatus: searchForm.expiryStatus || undefined,
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
const statNormal = ref(0);
const statExpiring = ref(0);
const statExpired = ref(0);

async function loadStats() {
  try {
    const res = await getOtherInsuranceStats();
    const s = res.stats ?? res;
    statTotal.value = s?.total ?? 0;
    statNormal.value = s?.normal ?? 0;
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
  searchForm.insuranceType = null;
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
  // 后端 key 为 'other'（targetTable: other_insurance）；写成 'insurance-other' 会匹配不到
  // 原生配置，降级 Python 引擎导致数据写不进库（同车辆保险踩过的坑）。
} = useGenericImport('other');
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
    const blob = await exportOtherInsurance();
    triggerDownload(blob, `其他保险清单_${new Date().toISOString().slice(0, 10)}.csv`);
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
  insuranceType: string;
  policyNo: string;
  coverageAmount: number | null;
  premium: number | null;
  startDate: string;
  expireDate: string;
  insuranceCompany: string;
  contactPerson: string;
  contactPhone: string;
  status: string;
  remark: string;
}>({
  insuranceType: '公众责任险',
  policyNo: '',
  coverageAmount: null,
  premium: null,
  startDate: '',
  expireDate: '',
  insuranceCompany: '',
  contactPerson: '',
  contactPhone: '',
  status: '有效',
  remark: '',
});

function resetForm() {
  Object.assign(formModel, {
    insuranceType: '公众责任险',
    policyNo: '',
    coverageAmount: null,
    premium: null,
    startDate: '',
    expireDate: '',
    insuranceCompany: '',
    contactPerson: '',
    contactPhone: '',
    status: '有效',
    remark: '',
  });
}

function openCreate() {
  resetForm();
  formMode.value = 'create';
  editingId.value = null;
  formOpen.value = true;
}

function openEdit(row: InsuranceApi.OtherInsuranceItem) {
  resetForm();
  formMode.value = 'edit';
  editingId.value = row.id;
  Object.assign(formModel, {
    insuranceType: row.insuranceType || '公众责任险',
    policyNo: row.policyNo || '',
    coverageAmount: row.coverageAmount ?? null,
    premium: row.premium ?? null,
    startDate: row.startDate ? String(row.startDate).slice(0, 10) : '',
    expireDate: row.expireDate ? String(row.expireDate).slice(0, 10) : '',
    insuranceCompany: row.insuranceCompany || '',
    contactPerson: row.contactPerson || '',
    contactPhone: row.contactPhone || '',
    status: row.status || '有效',
    remark: row.remark || '',
  });
  formOpen.value = true;
}

function openView(row: InsuranceApi.OtherInsuranceItem) {
  openEdit(row);
  formMode.value = 'view';
}

async function onSubmit() {
  if (!formModel.insuranceType) {
    message.warning('请选择保险类型');
    return;
  }
  formLoading.value = true;
  try {
    const payload: Partial<InsuranceApi.OtherFormData> = {
      insuranceType: formModel.insuranceType,
      policyNo: formModel.policyNo || undefined,
      coverageAmount: formModel.coverageAmount ?? undefined,
      premium: formModel.premium ?? undefined,
      startDate: formModel.startDate || null,
      expireDate: formModel.expireDate || null,
      insuranceCompany: formModel.insuranceCompany || undefined,
      contactPerson: formModel.contactPerson || undefined,
      contactPhone: formModel.contactPhone || undefined,
      status: formModel.status,
      remark: formModel.remark || undefined,
    };
    if (formMode.value === 'edit' && editingId.value != null) {
      await updateOtherInsurance(editingId.value, payload);
      message.success('编辑成功');
    } else {
      if (pendingPdfFile.value) payload.pdfFile = pendingPdfFile.value;
      await createOtherInsurance(payload as InsuranceApi.OtherFormData);
      message.success('新增成功');
    }
    pendingPdfFile.value = null;
    formOpen.value = false;
    onRefresh();
  } catch {
    /* 拦截器已提示 */
  } finally {
    formLoading.value = false;
  }
}

async function onDelete(row: InsuranceApi.OtherInsuranceItem) {
  try {
    await deleteOtherInsurance(row.id);
    message.success('删除成功');
    onRefresh();
  } catch {
    /* 拦截器已提示 */
  }
}

// ===================== 其他保险 PDF（OCR 导入 + 查看） =====================
const pdfImportVisible = ref(false);
const pdfOcrLoading = ref(false);
const pdfOcrResult = ref<OtherPdfOcrResult | null>(null);
const pdfOcrError = ref('');
/** 导入后待写入记录的保单文件（storedName） */
const pendingPdfFile = ref<string | null>(null);

function openPdfImport() {
  pdfImportVisible.value = true;
  pdfOcrResult.value = null;
  pdfOcrError.value = '';
}

function handlePdfFileUpload({
  file,
  onFinish,
  onError,
}: {
  file: UploadFileInfo;
  onFinish?: () => void;
  onError?: () => void;
}) {
  const raw = file.file;
  if (!raw) {
    onError?.();
    return;
  }
  const isPdf =
    raw.type === 'application/pdf' || /\.pdf$/i.test(raw.name || '');
  if (!isPdf) {
    message.error('仅支持 PDF 文件');
    onError?.();
    return;
  }
  if (raw.size / 1024 / 1024 > 10) {
    message.error('文件大小不能超过 10MB');
    onError?.();
    return;
  }
  pdfOcrLoading.value = true;
  pdfOcrError.value = '';
  importOtherInsurancePdf(raw)
    .then((res) => {
      pdfOcrResult.value = res;
      onFinish?.();
    })
    .catch((err: any) => {
      pdfOcrError.value = err?.message || '识别失败';
      message.error('PDF 识别失败');
      onError?.();
    })
    .finally(() => {
      pdfOcrLoading.value = false;
    });
}

function applyPdfToCreate() {
  const r = pdfOcrResult.value;
  if (!r) return;
  pdfImportVisible.value = false;
  resetForm();
  formMode.value = 'create';
  editingId.value = null;
  if (r.extracted?.policyNo) formModel.policyNo = r.extracted.policyNo;
  if (r.extracted?.insuranceCompany)
    formModel.insuranceCompany = r.extracted.insuranceCompany;
  if (r.extracted?.startDate)
    formModel.startDate = String(r.extracted.startDate).slice(0, 10);
  if (r.extracted?.expireDate)
    formModel.expireDate = String(r.extracted.expireDate).slice(0, 10);
  pendingPdfFile.value = r.storedName || null;
  formOpen.value = true;
}

async function openOtherFile(row: InsuranceApi.OtherInsuranceItem) {
  if (!row.pdfFile) return;
  try {
    const blob = await getPolicyFile('other', row.id);
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch {
    message.error('保单打开失败');
  }
}

function formatDate(d: string | null | undefined): string {
  if (!d) return '-';
  return String(d).slice(0, 10);
}

function formatMoney(v: number | undefined | null): string {
  if (v == null || v === 0) return '-';
  return `${v.toLocaleString()} 元`;
}

// ===================== 表格列 =====================
const columns = ref<VxeTableGridColumns>([
  { title: '保险类型', field: 'insuranceType', minWidth: 100, align: 'center', slots: { default: 'insuranceType' } },
  { title: '保单号', field: 'policyNo', minWidth: 180, align: 'center', showOverflow: 'tooltip' },
  { title: '保额(元)', field: 'coverageAmount', minWidth: 120, align: 'center', sortable: true, slots: { default: 'coverageAmount' } },
  { title: '保费(元)', field: 'premium', minWidth: 110, align: 'center', slots: { default: 'premium' } },
  { title: '保险起期', field: 'startDate', minWidth: 110, align: 'center', sortable: true, slots: { default: 'startDate' } },
  { title: '保险止期', field: 'expireDate', minWidth: 110, align: 'center', sortable: true, slots: { default: 'expireDate' } },
  { title: '时效状态', field: 'expiryStatus', minWidth: 90, align: 'center', slots: { default: 'expiry' } },
  { title: '保险公司', field: 'insuranceCompany', minWidth: 180, align: 'center', showOverflow: 'tooltip' },
  { title: '联系人', field: 'contactPerson', minWidth: 90, align: 'center' },
  { title: '状态', field: 'status', minWidth: 80, align: 'center', sortable: true, slots: { default: 'status' } },
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
  <HsePageLayout title="其他保险" description="管理公众责任险、财产一切险等其他保险类型">
    <template #extra>
      <NSpace>
        <HseActionBar
          :actions="actionState"
          @refresh="onRefresh"
          @download-template="onImportTemplate"
          @import="() => (importOpen = true)"
          @export="onExport"
          @create="openCreate"
        />
        <NButton @click="openPdfImport">
          <template #icon><FileUp class="size-4" /></template>
          导入保单
        </NButton>
      </NSpace>
    </template>

    <!-- 统计卡 -->
    <div class="mb-4 grid grid-cols-4 gap-3">
      <NCard :bordered="false">
        <NStatistic label="保险总数" :value="statTotal" />
      </NCard>
      <NCard :bordered="false">
        <NStatistic label="正常" :value="statNormal" />
      </NCard>
      <NCard :bordered="false">
        <NStatistic label="临期(30天内)" :value="statExpiring" />
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
          placeholder="保单号 / 保险公司"
          clearable
          @keyup.enter="onSearch"
        />
      </NGi>
      <NGi>
        <NSelect
          v-model:value="searchForm.insuranceType"
          placeholder="保险类型"
          clearable
          :options="INSURANCE_TYPE_OPTIONS"
          @update:value="(_v: string | null, _opt: any) => {}"
        />
      </NGi>
      <NGi>
        <NSelect
          v-model:value="searchForm.expiryStatus"
          placeholder="时效状态"
          clearable
          :options="[
            { label: '正常', value: 'normal' },
            { label: '临期', value: 'expiring' },
            { label: '过期', value: 'expired' },
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
      :pager="true"
      :total="total"
      auto-width
      @page-change="onPageChange"
      @sort-change="onSortChange"
    >
      <template #insuranceType="{ row }">
        <HseStatusTag :type="INSURANCE_TYPE_TAG_COLOR[row.insuranceType] || 'neutral'">
          {{ row.insuranceType || '-' }}
        </HseStatusTag>
      </template>
      <template #coverageAmount="{ row }">
        {{ formatMoney(row.coverageAmount) }}
      </template>
      <template #premium="{ row }">
        {{ formatMoney(row.premium) }}
      </template>
      <template #startDate="{ row }">
        {{ formatDate(row.startDate) }}
      </template>
      <template #expireDate="{ row }">
        <span :class="{ 'text-orange-500 font-medium': row.expiryStatus === 'expiring', 'text-red-500 font-medium': row.expiryStatus === 'expired' }">
          {{ formatDate(row.expireDate) }}
        </span>
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
          <NButton
            v-if="row.pdfFile"
            size="small"
            type="info"
            quaternary
            @click="openOtherFile(row)"
          >
            查看文档
          </NButton>
          <NPopconfirm @positive-click="onDelete(row)">
            <template #trigger>
              <NButton size="small" type="error" quaternary>删除</NButton>
            </template>
            确定删除该保险记录吗？
          </NPopconfirm>
        </NSpace>
      </template>
    </HseDataGrid>

    <!-- 新增 / 编辑 / 查看 弹窗 -->
    <NModal
      v-model:show="formOpen"
      :title="
        formMode === 'create'
          ? '新增其他保险'
          : formMode === 'edit'
            ? '编辑其他保险'
            : '其他保险详情'
      "
      preset="card"
      style="width: 700px; max-width: 92vw"
      :mask-closable="false"
    >
      <NForm :disabled="formMode === 'view'" label-placement="top">
        <div class="grid grid-cols-2 gap-x-4">
          <NFormItem label="保险类型" required>
            <NSelect
              v-model:value="formModel.insuranceType"
              :options="INSURANCE_TYPE_OPTIONS"
            />
          </NFormItem>
          <NFormItem label="保单号">
            <NInput v-model:value="formModel.policyNo" placeholder="请输入保单号" />
          </NFormItem>
          <NFormItem label="保额（元）">
            <NInputNumber
              v-model:value="formModel.coverageAmount"
              placeholder="选填"
              :min="0"
              style="width: 100%"
            />
          </NFormItem>
          <NFormItem label="保费（元）">
            <NInputNumber
              v-model:value="formModel.premium"
              placeholder="选填"
              :min="0"
              style="width: 100%"
            />
          </NFormItem>
          <NFormItem label="保险起期">
            <NInput v-model:value="formModel.startDate" placeholder="YYYY-MM-DD" />
          </NFormItem>
          <NFormItem label="保险止期">
            <NInput v-model:value="formModel.expireDate" placeholder="YYYY-MM-DD" />
          </NFormItem>
          <NFormItem label="保险公司">
            <NInput v-model:value="formModel.insuranceCompany" placeholder="选填" />
          </NFormItem>
          <NFormItem label="联系人">
            <NInput v-model:value="formModel.contactPerson" placeholder="选填" />
          </NFormItem>
          <NFormItem label="联系电话">
            <NInput v-model:value="formModel.contactPhone" placeholder="选填" />
          </NFormItem>
          <NFormItem label="状态">
            <NSelect v-model:value="formModel.status" :options="STATUS_OPTIONS" />
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
      title="导入其他保险"
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

    <!-- 其他保险 PDF 导入（OCR 识别） -->
    <NModal
      v-model:show="pdfImportVisible"
      title="导入保单（PDF 识别）"
      preset="card"
      style="width: 560px; max-width: 92vw"
      :mask-closable="false"
    >
      <NAlert type="info" :show-icon="false" class="mb-3">
        上传 PDF 保单文件，系统自动识别保单号 / 保险公司 / 起止日期，识别后一键生成保险记录。
      </NAlert>
      <NUpload
        :custom-request="handlePdfFileUpload"
        accept=".pdf"
        :show-file-list="true"
        :max="1"
        :disabled="pdfOcrLoading"
      >
        <NButton :loading="pdfOcrLoading">
          <template #icon><Upload class="size-4" /></template>
          选择 PDF 文件
        </NButton>
      </NUpload>
      <NEmpty v-if="!pdfOcrLoading && !pdfOcrResult && !pdfOcrError" description="请选择 PDF 文件开始识别" class="py-6" />
      <NAlert v-if="pdfOcrError" type="error" :show-icon="false" class="mt-3">
        {{ pdfOcrError }}
      </NAlert>
      <div v-if="pdfOcrResult" class="mt-3 rounded border border-solid border-[var(--border)] p-3">
        <div class="mb-2 flex items-center justify-between">
          <span class="font-medium">识别结果</span>
          <NTag :type="pdfOcrResult.confidence >= 50 ? 'success' : 'warning'">
            可信度 {{ pdfOcrResult.confidence }}%
          </NTag>
        </div>
        <NDescriptions label-placement="left" :column="1" size="small" bordered>
          <NDescriptionsItem label="保单号">{{ pdfOcrResult.extracted?.policyNo || '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="保险公司">{{ pdfOcrResult.extracted?.insuranceCompany || '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="保险起期">{{ pdfOcrResult.extracted?.startDate || '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="保险止期">{{ pdfOcrResult.extracted?.expireDate || '-' }}</NDescriptionsItem>
        </NDescriptions>
        <NSpace justify="end" class="mt-3">
          <NButton @click="pdfImportVisible = false">取消</NButton>
          <NButton type="primary" @click="applyPdfToCreate">应用到新建</NButton>
        </NSpace>
      </div>
    </NModal>
  </HsePageLayout>
</template>
