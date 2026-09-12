<script lang="ts" setup>
/**
 * 规章制度管理（web-naive）
 * 统一使用 HseDataGrid + HseSearchPanel + HseActionBar
 * 接入真实 API，支持导入/导出/增删改查
 */
import { computed, h, onMounted, reactive, ref } from 'vue';

import {
  NButton,
  NCard,
  NDataTable,
  NDescriptions,
  NDescriptionsItem,
  NDivider,
  NDrawer,
  NDrawerContent,
  NForm,
  NFormItem,
  NGi,
  NInput,
  NModal,
  NPopconfirm,
  NSpace,
  NSelect,
  NStatistic,
  NTag,
  NTabPane,
  NTabs,
  NText,
  NUpload,
  type DataTableColumns,
  type UploadFileInfo,
} from 'naive-ui';
import { $t } from '#/locales';
import { IconifyIcon } from '@vben/icons';

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
  createRegulation,
  deleteRegulation,
  deleteRegulationAttachment,
  exportRegulations,
  getRegulationAttachments,
  getRegulationList,
  getRegulationStats,
  getRegulationVersions,
  updateRegulation,
  uploadRegulationAttachment,
  type RegulationsApi,
} from '#/api/hse/regulations';
import { useGenericImport } from '#/views/hse/_shared/useGenericImport';
import { message } from '#/adapter/naive';

defineOptions({ name: 'HseRegulations' });

// ===================== 映射 =====================
const CATEGORY_LABEL: Record<string, string> = {
  national: '国家',
  provincial: '省级',
  municipal: '市级',
  internal: '内部',
  industry: '行业',
};

const TYPE_LABEL: Record<string, string> = {
  law: '法律',
  regulation: '法规',
  standard: '标准',
  procedure: '规程',
  guideline: '指南',
};

const STATUS_TAG: Record<string, 'success' | 'info' | 'warning' | 'danger' | 'neutral'> = {
  active: 'success',
  published: 'success',
  draft: 'neutral',
  revising: 'warning',
  obsolete: 'danger',
};

const STATUS_LABEL: Record<string, string> = {
  active: '有效',
  published: '已发布',
  draft: '草案',
  revising: '修订中',
  obsolete: '已废止',
};

const EXPIRY_TAG: Record<string, 'success' | 'info' | 'warning' | 'danger' | 'neutral'> = {
  normal: 'success',
  expiring: 'warning',
  expired: 'danger',
  permanent: 'neutral',
  unknown: 'neutral',
};

const EXPIRY_LABEL: Record<string, string> = {
  normal: '正常',
  expiring: '临期',
  expired: '已过期',
  permanent: '长期有效',
  unknown: '未知',
};

const CATEGORY_OPTIONS = [
  { label: '国家', value: 'national' },
  { label: '省级', value: 'provincial' },
  { label: '市级', value: 'municipal' },
  { label: '内部', value: 'internal' },
  { label: '行业', value: 'industry' },
];

const TYPE_OPTIONS = [
  { label: '法律', value: 'law' },
  { label: '法规', value: 'regulation' },
  { label: '标准', value: 'standard' },
  { label: '规程', value: 'procedure' },
  { label: '指南', value: 'guideline' },
];

const STATUS_OPTIONS = [
  { label: '有效', value: 'active' },
  { label: '已发布', value: 'published' },
  { label: '草案', value: 'draft' },
  { label: '修订中', value: 'revising' },
  { label: '已废止', value: 'obsolete' },
];

// ===================== 列表数据 =====================
const loading = ref(false);
const data = ref<RegulationsApi.Regulation[]>([]);
const total = ref(0);
const currentPage = ref(1);
const pageSize = ref(20);
const sortBy = ref<string | undefined>(undefined);
const sortOrder = ref<'asc' | 'desc' | undefined>(undefined);

const searchForm = reactive({
  keyword: '',
  category: '' as string,
  type: '' as string,
  status: '' as string,
});

const statsData = reactive({
  total: 0,
  active: 0,
  revising: 0,
  draft: 0,
});

async function loadData() {
  loading.value = true;
  try {
    const res = await getRegulationList({
      page: currentPage.value,
      pageSize: pageSize.value,
      keyword: searchForm.keyword || undefined,
      category: searchForm.category || undefined,
      type: searchForm.type || undefined,
      status: searchForm.status || undefined,
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

async function loadStats() {
  try {
    const res = await getRegulationStats();
    statsData.total = res.total ?? 0;
    statsData.active = res.active ?? 0;
    statsData.revising = res.revising ?? 0;
    statsData.draft = res.draft ?? 0;
  } catch {
    // ignore
  }
}

function onSearch() {
  currentPage.value = 1;
  loadData();
}

function onReset() {
  searchForm.keyword = '';
  searchForm.category = '';
  searchForm.type = '';
  searchForm.status = '';
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
} = useGenericImport('regulations');
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
    const blob = await exportRegulations();
    triggerDownload(blob, `regulations_${new Date().toISOString().slice(0, 10)}.csv`);
    message.success('导出成功');
  } catch {
    message.error('导出失败');
  }
}

// ===================== 新增/编辑弹窗 =====================
const formOpen = ref(false);
const formMode = ref<'create' | 'edit' | 'view'>('create');
const formLoading = ref(false);
const editingId = ref<number | null>(null);

const formModel = reactive<RegulationsApi.RegulationFormData>({
  title: '',
  category: 'national',
  type: 'law',
  documentNo: '',
  version: '',
  status: 'active',
  issueDate: '',
  effectiveDate: '',
  issuer: '',
  department: '',
  summary: '',
  content: '',
});

function resetForm() {
  formModel.title = '';
  formModel.category = 'national';
  formModel.type = 'law';
  formModel.documentNo = '';
  formModel.version = '';
  formModel.status = 'active';
  formModel.issueDate = '';
  formModel.effectiveDate = '';
  formModel.issuer = '';
  formModel.department = '';
  formModel.summary = '';
  formModel.content = '';
}

function openCreate() {
  resetForm();
  formMode.value = 'create';
  editingId.value = null;
  formOpen.value = true;
}

function openEdit(row: RegulationsApi.Regulation) {
  resetForm();
  formMode.value = 'edit';
  editingId.value = row.id;
  Object.assign(formModel, {
    title: row.title,
    category: row.category,
    type: row.type,
    documentNo: row.documentNo,
    version: row.version,
    status: row.status,
    issueDate: row.issueDate ?? '',
    effectiveDate: row.effectiveDate ?? '',
    issuer: row.issuer ?? '',
    department: row.department ?? '',
    summary: row.summary ?? '',
    content: row.content ?? '',
  });
  formOpen.value = true;
}

// ===================== 详情抽屉（附件 / 版本履历） =====================
const detailOpen = ref(false);
const currentRegulation = ref<RegulationsApi.Regulation | null>(null);
const attachmentList = ref<RegulationsApi.Attachment[]>([]);
const attachmentLoading = ref(false);
const attachmentUploading = ref(false);
const uploadVersion = ref('');
const versionList = ref<RegulationsApi.VersionRecord[]>([]);
const versionLoading = ref(false);

const CHANGE_TYPE_LABEL: Record<string, string> = {
  create: '创建',
  revise: '修订',
  publish: '发布',
  revoke: '废止',
  other: '其他',
};

const CHANGE_TYPE_TAG: Record<string, 'success' | 'info' | 'warning' | 'error' | 'default'> = {
  create: 'info',
  revise: 'warning',
  publish: 'success',
  revoke: 'error',
  other: 'default',
};

function formatFileSize(size?: number): string {
  if (!size) return '-';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(2)} MB`;
}

function formatDateTime(value?: string): string {
  return value ? value.replace('T', ' ').slice(0, 19) : '-';
}

function formatDate(value: string | number | null | undefined): string {
  const s = value == null ? '' : String(value);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

function openView(row: RegulationsApi.Regulation) {
  currentRegulation.value = row;
  detailOpen.value = true;
  uploadVersion.value = '';
  fetchAttachments(row.id);
  fetchVersions(row.id);
}

async function fetchAttachments(id: number) {
  attachmentLoading.value = true;
  try {
    attachmentList.value = await getRegulationAttachments(id);
  } catch {
    attachmentList.value = [];
  } finally {
    attachmentLoading.value = false;
  }
}

async function handleUploadAttachment(file?: File | null) {
  if (!file || !currentRegulation.value) return;
  attachmentUploading.value = true;
  try {
    await uploadRegulationAttachment(currentRegulation.value.id, file, {
      version: uploadVersion.value || undefined,
    });
    message.success('附件上传成功');
    uploadVersion.value = '';
    await fetchAttachments(currentRegulation.value.id);
  } catch {
    // 拦截器已提示
  } finally {
    attachmentUploading.value = false;
  }
}

function onAttachmentChange(options: { file: UploadFileInfo }) {
  handleUploadAttachment(options.file?.file);
}

async function handleDeleteAttachment(record: RegulationsApi.Attachment) {
  if (!currentRegulation.value) return;
  try {
    await deleteRegulationAttachment(currentRegulation.value.id, record.id);
    message.success('附件已删除');
    await fetchAttachments(currentRegulation.value.id);
  } catch {
    // 拦截器已提示
  }
}

async function fetchVersions(id: number) {
  versionLoading.value = true;
  try {
    versionList.value = await getRegulationVersions(id);
  } catch {
    versionList.value = [];
  } finally {
    versionLoading.value = false;
  }
}

const attachmentColumns: DataTableColumns<RegulationsApi.Attachment> = [
  {
    title: '文件名',
    key: 'originalName',
    ellipsis: { tooltip: true },
    render: (row) =>
      h('div', { class: 'flex items-center gap-1' }, [
        h(
          'a',
          { href: row.fileUrl, target: '_blank', rel: 'noopener', class: 'text-primary' },
          row.originalName,
        ),
        row.isLatest
          ? h(NTag, { size: 'small', type: 'success', bordered: false }, { default: () => '最新' })
          : null,
      ]),
  },
  { title: '大小', key: 'fileSize', width: 90, render: (row) => formatFileSize(row.fileSize) },
  { title: '上传时间', key: 'createdAt', width: 160, render: (row) => formatDateTime(row.createdAt) },
  {
    title: '操作',
    key: 'action',
    width: 140,
    render: (row) =>
      h('div', { class: 'flex items-center gap-2' }, [
        h(
          'a',
          { href: row.fileUrl, target: '_blank', rel: 'noopener', class: 'text-primary' },
          '下载',
        ),
        h(
          NButton,
          { size: 'small', type: 'error', quaternary: true, onClick: () => handleDeleteAttachment(row) },
          { default: () => '删除' },
        ),
      ]),
  },
];

const versionColumns: DataTableColumns<RegulationsApi.VersionRecord> = [
  { title: '版本', key: 'version', width: 90 },
  {
    title: '变更类型',
    key: 'changeType',
    width: 100,
    render: (row) =>
      h(NTag, { size: 'small', bordered: false, type: CHANGE_TYPE_TAG[row.changeType] ?? 'default' }, {
        default: () => CHANGE_TYPE_LABEL[row.changeType] || row.changeType || '-',
      }),
  },
  { title: '变更摘要', key: 'changeSummary', ellipsis: { tooltip: true } },
  { title: '变更人', key: 'changedBy', width: 110 },
  { title: '时间', key: 'createdAt', width: 160, render: (row) => formatDateTime(row.createdAt) },
];

async function onSubmit() {
  if (!formModel.title) {
    message.warning('制度标题不能为空');
    return;
  }
  formLoading.value = true;
  try {
    const payload: Partial<RegulationsApi.RegulationFormData> = { ...formModel };
    if (formMode.value === 'edit' && editingId.value != null) {
      await updateRegulation(editingId.value, payload);
      message.success('编辑成功');
    } else {
      await createRegulation(payload);
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

async function onDelete(row: RegulationsApi.Regulation) {
  try {
    await deleteRegulation(row.id);
    message.success('删除成功');
    onRefresh();
  } catch {
    // 拦截器已提示
  }
}

// ===================== 行编辑（快速修改；弹窗编辑保留） =====================
const gridRef = ref<InstanceType<typeof HseDataGrid>>();
/** 行内编辑中的行 id（区别于弹窗 editingId） */
const rowEditingId = ref<string | null>(null);

const editRules: Record<string, any[]> = {};

function startEdit(row: RegulationsApi.Regulation) {
  rowEditingId.value = String(row.id);
  gridRef.value?.beginEdit(row);
}

async function onEditSave(payload: { row: RegulationsApi.Regulation }) {
  rowEditingId.value = null;
  const row = payload?.row;
  if (!row?.id) return;
  try {
    await updateRegulation(row.id, {
      version: row.version,
      effectiveDate: row.effectiveDate || '',
      status: row.status,
    });
    message.success('保存成功');
    onRefresh();
  } catch {
    // 拦截器已提示
  }
}

function onEditCancel() {
  rowEditingId.value = null;
  // VXE 已自动回滚原始数据（keepSource），无需额外处理
}

// ===================== 表格列 =====================
const columns = computed<VxeTableGridColumns>(() => [
  { title: '制度标题', field: 'title', minWidth: 220, align: 'center', showOverflow: 'tooltip' },
  { title: '文号', field: 'documentNo', minWidth: 150, align: 'center' },
  { title: '版本', field: 'version', minWidth: 90, align: 'center', sortable: true, editRender: { name: 'input' } },
  { title: '分类', field: 'category', minWidth: 90, align: 'center', slots: { default: 'category' } },
  { title: '类型', field: 'type', minWidth: 90, align: 'center', slots: { default: 'type' } },
  { title: '状态', field: 'status', minWidth: 100, align: 'center', sortable: true, slots: { default: 'status' }, editRender: { name: 'select', options: STATUS_OPTIONS } },
  {
    title: '时效状态',
    field: 'expiryStatus',
    minWidth: 110,
    align: 'center',
    slots: { default: 'expiry' },
  },
  { title: '生效日期', field: 'effectiveDate', minWidth: 120, align: 'center', formatter: ({ cellValue }) => (cellValue ? formatDate(cellValue) : '-'), editRender: { name: 'input', props: { placeholder: 'YYYY-MM-DD' } } },
  {
    title: '操作',
    field: 'action',
    minWidth: 200,
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
  <HsePageLayout
    :description="$t('page.hse.regulationsDesc')"
    :title="$t('page.hse.regulations')"
  >
    <template #extra>
      <HseActionBar
        :actions="actionState"
        @refresh="onRefresh"
        @download-template="onImportTemplate"
        @import="importOpen = true"
        @export="onExport"
        @create="openCreate"
      />
    </template>

    <!-- 统计卡 -->
    <div class="mb-4 grid grid-cols-4 gap-3">
      <NCard :bordered="false">
        <NStatistic label="制度总数" :value="statsData.total" />
      </NCard>
      <NCard :bordered="false">
        <NStatistic label="有效" :value="statsData.active" />
      </NCard>
      <NCard :bordered="false">
        <NStatistic label="修订中" :value="statsData.revising" />
      </NCard>
      <NCard :bordered="false">
        <NStatistic label="草案" :value="statsData.draft" />
      </NCard>
    </div>

    <!-- 搜索 -->
    <HseSearchPanel @query="onSearch" @reset="onReset">
      <NGi>
        <NInput
          v-model:value="searchForm.keyword"
          placeholder="搜索标题/文号/摘要"
          clearable
          @keyup.enter="onSearch"
        />
      </NGi>
      <NGi>
        <NSelect v-model:value="searchForm.category" placeholder="分类" clearable :options="CATEGORY_OPTIONS" />
      </NGi>
      <NGi>
        <NSelect v-model:value="searchForm.type" placeholder="类型" clearable :options="TYPE_OPTIONS" />
      </NGi>
      <NGi>
        <NSelect v-model:value="searchForm.status" placeholder="状态" clearable :options="STATUS_OPTIONS" />
      </NGi>
    </HseSearchPanel>

    <!-- 表格 -->
    <HseDataGrid
      ref="gridRef"
      :columns="columns"
      :data="data"
      :loading="loading"
      :pager="true"
      :total="total"
      :editable="true"
      :edit-rules="editRules"
      @page-change="onPageChange"
      @sort-change="onSortChange"
      @edit-save="onEditSave"
      @edit-cancel="onEditCancel"
    >
      <template #category="{ row }">
        <NText>{{ CATEGORY_LABEL[row.category] || row.category || '-' }}</NText>
      </template>
      <template #type="{ row }">
        <NText>{{ TYPE_LABEL[row.type] || row.type || '-' }}</NText>
      </template>
      <template #status="{ row }">
        <HseStatusTag :type="STATUS_TAG[row.status] || 'neutral'">
          {{ STATUS_LABEL[row.status] || row.status || '-' }}
        </HseStatusTag>
      </template>
      <template #expiry="{ row }">
        <HseStatusTag :type="EXPIRY_TAG[row.expiryStatus] || 'neutral'">
          {{ EXPIRY_LABEL[row.expiryStatus] || '未知' }}
        </HseStatusTag>
      </template>
      <template #action="{ row }">
        <NSpace v-if="String(row.id) !== rowEditingId" justify="center">
          <NButton size="small" type="primary" quaternary @click="openView(row)">查看</NButton>
          <NButton size="small" type="primary" quaternary @click="startEdit(row)">编辑</NButton>
          <NPopconfirm @positive-click="onDelete(row)">
            <template #trigger>
              <NButton size="small" type="error" quaternary>删除</NButton>
            </template>
            确定删除该制度吗？
          </NPopconfirm>
        </NSpace>
        <NSpace v-else justify="center">
          <NButton size="small" type="primary" @click="gridRef?.saveEdit(row)">保存</NButton>
          <NButton size="small" @click="gridRef?.cancelEdit(row)">取消</NButton>
        </NSpace>
      </template>
    </HseDataGrid>

    <!-- 新增/编辑弹窗 -->
    <NModal
      v-model:show="formOpen"
      :title="formMode === 'create' ? '新增制度' : formMode === 'edit' ? '编辑制度' : '制度详情'"
      preset="card"
      style="width: 760px; max-width: 92vw"
      :mask-closable="false"
    >
      <NForm :disabled="formMode === 'view'" label-placement="top">
        <div class="grid grid-cols-2 gap-x-4">
          <NFormItem label="制度标题" required>
            <NInput v-model:value="formModel.title" placeholder="请输入制度标题" />
          </NFormItem>
          <NFormItem label="分类" required>
            <NSelect v-model:value="formModel.category" :options="CATEGORY_OPTIONS" />
          </NFormItem>
          <NFormItem label="类型" required>
            <NSelect v-model:value="formModel.type" :options="TYPE_OPTIONS" />
          </NFormItem>
          <NFormItem label="状态">
            <NSelect v-model:value="formModel.status" :options="STATUS_OPTIONS" />
          </NFormItem>
          <NFormItem label="文号">
            <NInput v-model:value="formModel.documentNo" placeholder="如 GB/T 28001-2011" />
          </NFormItem>
          <NFormItem label="版本">
            <NInput v-model:value="formModel.version" placeholder="如 V2.0" />
          </NFormItem>
          <NFormItem label="发布日期">
            <NInput v-model:value="formModel.issueDate" placeholder="YYYY-MM-DD" />
          </NFormItem>
          <NFormItem label="生效日期">
            <NInput v-model:value="formModel.effectiveDate" placeholder="YYYY-MM-DD" />
          </NFormItem>
          <NFormItem label="发布机构">
            <NInput v-model:value="formModel.issuer" placeholder="请输入发布机构" />
          </NFormItem>
          <NFormItem label="归口部门">
            <NInput v-model:value="formModel.department" placeholder="请输入归口部门" />
          </NFormItem>
        </div>
        <NFormItem label="摘要">
          <NInput v-model:value="formModel.summary" type="textarea" :rows="2" placeholder="请输入制度摘要" />
        </NFormItem>
        <NFormItem label="制度内容">
          <NInput v-model:value="formModel.content" type="textarea" :rows="4" placeholder="请输入制度正文内容" />
        </NFormItem>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="formOpen = false">{{ formMode === 'view' ? '关闭' : '取消' }}</NButton>
          <NButton v-if="formMode !== 'view'" type="primary" :loading="formLoading" @click="onSubmit">
            保存
          </NButton>
        </NSpace>
      </template>
    </NModal>

    <!-- 制度详情抽屉（附件 / 版本履历） -->
    <NDrawer v-model:show="detailOpen" :width="680" placement="right">
      <NDrawerContent closable :native-scrollbar="false">
        <template #header>
          <div class="flex items-center gap-2">
            <NText strong style="font-size: 16px">
              {{ currentRegulation?.title || '制度详情' }}
            </NText>
            <NTag v-if="currentRegulation" size="small" :bordered="false" type="info">
              {{ CATEGORY_LABEL[currentRegulation.category] || currentRegulation.category }}
            </NTag>
            <NTag v-if="currentRegulation" size="small" :bordered="false" type="success">
              {{ TYPE_LABEL[currentRegulation.type] || currentRegulation.type }}
            </NTag>
            <HseStatusTag
              v-if="currentRegulation"
              :type="STATUS_TAG[currentRegulation.status] || 'neutral'"
            >
              {{ STATUS_LABEL[currentRegulation.status] || currentRegulation.status }}
            </HseStatusTag>
          </div>
        </template>

        <div v-if="currentRegulation" class="px-1">
          <NDescriptions :column="2" label-placement="left" size="small" bordered>
            <NDescriptionsItem label="文号">{{ currentRegulation.documentNo || '-' }}</NDescriptionsItem>
            <NDescriptionsItem label="版本">{{ currentRegulation.version || '-' }}</NDescriptionsItem>
            <NDescriptionsItem label="发布机构">{{ currentRegulation.issuer || '-' }}</NDescriptionsItem>
            <NDescriptionsItem label="归口部门">{{ currentRegulation.department || '-' }}</NDescriptionsItem>
            <NDescriptionsItem label="发布日期">{{ currentRegulation.issueDate || '-' }}</NDescriptionsItem>
            <NDescriptionsItem label="生效日期">{{ currentRegulation.effectiveDate || '-' }}</NDescriptionsItem>
            <NDescriptionsItem label="时效状态" :span="2">
              <HseStatusTag :type="EXPIRY_TAG[currentRegulation.expiryStatus || ''] || 'neutral'">
                {{ EXPIRY_LABEL[currentRegulation.expiryStatus || ''] || '未知' }}
              </HseStatusTag>
            </NDescriptionsItem>
          </NDescriptions>

          <NDivider />
          <NText depth="2">摘要</NText>
          <p class="mt-1 whitespace-pre-wrap text-sm">{{ currentRegulation.summary || '暂无摘要' }}</p>
          <NDivider />
          <NText depth="2">制度内容</NText>
          <p class="mt-1 whitespace-pre-wrap text-sm">{{ currentRegulation.content || '暂无内容' }}</p>
          <p v-if="currentRegulation.remark" class="mt-2 text-sm">
            <NText depth="3">备注：</NText>{{ currentRegulation.remark }}
          </p>

          <NDivider />
          <NTabs type="line" animated>
            <NTabPane name="attachments" :tab="`附件列表 (${attachmentList.length})`">
              <div class="mb-3 flex items-center gap-3">
                <NInput
                  v-model:value="uploadVersion"
                  placeholder="附件版本（选填，如 V2.0）"
                  style="width: 180px"
                  clearable
                />
                <NUpload
                  accept=".pdf,.doc,.docx"
                  :default-upload="false"
                  :show-file-list="false"
                  @change="onAttachmentChange"
                >
                  <NButton type="primary" :loading="attachmentUploading">
                    <template #icon><IconifyIcon icon="lucide:upload" /></template>
                    上传附件
                  </NButton>
                </NUpload>
              </div>
              <NDataTable
                v-if="attachmentList.length"
                :columns="attachmentColumns"
                :data="attachmentList"
                :loading="attachmentLoading"
                size="small"
                :bordered="false"
                :pagination="false"
              />
              <NText v-else depth="3">暂无附件</NText>
            </NTabPane>
            <NTabPane name="versions" :tab="`历史版本 (${versionList.length})`">
              <NDataTable
                v-if="versionList.length"
                :columns="versionColumns"
                :data="versionList"
                :loading="versionLoading"
                size="small"
                :bordered="false"
                :pagination="false"
              />
              <NText v-else depth="3">暂无版本记录</NText>
            </NTabPane>
          </NTabs>
        </div>
      </NDrawerContent>
      <template #footer>
        <NSpace justify="end">
          <NButton v-if="currentRegulation" type="primary" size="small" @click="openEdit(currentRegulation)">
            弹窗编辑
          </NButton>
        </NSpace>
      </template>
    </NDrawer>

    <!-- 通用导入 -->
    <HseImportDialog
      v-model:open="importOpen"
      title="导入规章制度"
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
