<script lang="ts" setup>
/**
 * 批量导入中心（web-naive 完整迁移）
 * 行为契约：apps/web-antd/src/views/hse/batch-import/index.vue
 * 新建导入抽屉（BatchImportDrawer）流程内联实现：上传 → 创建 → 预检查 → 确认执行。
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import {
  NAlert,
  NButton,
  NCard,
  NDescriptions,
  NDescriptionsItem,
  NDrawer,
  NDrawerContent,
  NInput,
  NProgress,
  NSelect,
  NSpace,
  NStatistic,
  NTag,
  NUpload,
  NUploadDragger,
} from 'naive-ui';
import { Inbox } from '@vben/icons';
import { useAccess } from '@vben/access';

import {
  HseActionBar,
  HseDataGrid,
  HsePageLayout,
  HseStatusTag,
  type HseActionKey,
} from '#/components/hse';
import type { VxeTableGridColumns } from '#/adapter/vxe-table';
import {
  getTaskList,
  createBatchTask,
  getTaskDetail,
  getTaskProgress,
  getItemList,
  retryItem,
  retryTaskFailed,
  precheckTask,
  confirmTask,
  downloadTemplate,
  getConcurrentInfo,
  type BatchImportApi,
} from '#/api/hse/batch-import';
import { message } from '#/adapter/naive';

defineOptions({ name: 'PersonnelBatchImport' });

const { hasAccessByRoles } = useAccess();

const canCreate = computed(() => hasAccessByRoles(['admin', 'safety_manager', 'safety_officer']));
const canRetry = computed(() => hasAccessByRoles(['admin', 'safety_manager']));

// ============================================================
// 列表数据
// ============================================================
const loading = ref(false);
const taskList = ref<BatchImportApi.BatchTask[]>([]);
const total = ref(0);
const pagination = reactive({ page: 1, pageSize: 20 });

const searchForm = reactive({
  importType: undefined as string | undefined,
  module: undefined as string | undefined,
  status: undefined as string | undefined,
  keyword: '',
});

const importTypeOptions = [
  { label: '安全资料', value: 'document' },
  { label: '标准条款', value: 'standard_clause' },
  // { label: '安全记录', value: 'safety_record' },  // [提示词-129] 后端未实现，暂隐藏
];

const moduleOptions = [
  { label: '目标职责', value: 'objectives' },
  { label: '制度标准', value: 'standards' },
  { label: '风险管控', value: 'risk' },
  { label: '隐患治理', value: 'hazards' },
  { label: '现场管理', value: 'site' },
  { label: '人员管理', value: 'personnel' },
  { label: '培训考核', value: 'training' },
  { label: '应急管理', value: 'emergency' },
  { label: '保险管理', value: 'insurance' },
  { label: '安全总览', value: 'overview' },
  { label: '系统管理', value: 'system' },
];

const statusOptions = [
  { label: '待预检查', value: 'pending' },
  { label: '预检查中', value: 'prechecking' },
  { label: '预检查完成', value: 'prechecked' },
  { label: '待执行', value: 'confirmed' },
  { label: '处理中', value: 'processing' },
  { label: '已完成', value: 'completed' },
  { label: '失败', value: 'failed' },
  { label: '已取消', value: 'cancelled' },
];

const statusTypeMap: Record<string, 'success' | 'info' | 'warning' | 'danger' | 'neutral'> = {
  pending: 'neutral',
  prechecking: 'info',
  prechecked: 'info',
  confirmed: 'info',
  processing: 'info',
  completed: 'success',
  failed: 'danger',
  cancelled: 'neutral',
};
const statusTextMap: Record<string, string> = {
  pending: '待预检查',
  prechecking: '预检查中',
  prechecked: '预检查完成',
  confirmed: '待执行',
  processing: '处理中',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
};
const importTypeTextMap: Record<string, string> = {
  document: '安全资料',
  standard_clause: '标准条款',
  safety_record: '安全记录',
};
const moduleTextMap: Record<string, string> = {
  objectives: '目标职责',
  standards: '制度标准',
  risk: '风险管控',
  hazards: '隐患治理',
  site: '现场管理',
  personnel: '人员管理',
  training: '培训考核',
  emergency: '应急管理',
  insurance: '保险管理',
  overview: '安全总览',
  system: '系统管理',
};

// ============================================================
// 新建导入抽屉
// ============================================================
const importDrawerVisible = ref(false);
const currentImportType = ref<BatchImportApi.ImportType>('document');
const currentModule = ref<string>('personnel');

const createStep = ref<'upload' | 'prechecking' | 'prechecked' | 'processing' | 'completed'>('upload');
const uploading = ref(false);
const selectedFiles = ref<File[]>([]);
const currentTaskId = ref<number | null>(null);
const createProgress = ref(0);
const createStatus = ref('');
const precheckResult = ref<BatchImportApi.PrecheckResult | null>(null);
const resultSummary = ref<any>(null);
const createError = ref('');
let createTimer: ReturnType<typeof setInterval> | null = null;

const allowedExtMap: Record<string, string[]> = {
  document: ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'],
  standard_clause: ['.xlsx', '.xls'],
  safety_record: ['.xlsx', '.xls'],
};
const acceptStr = computed(() => (allowedExtMap[currentImportType.value] || []).join(','));

function openImportDrawer() {
  importDrawerVisible.value = true;
  createStep.value = 'upload';
  selectedFiles.value = [];
  currentTaskId.value = null;
  createProgress.value = 0;
  precheckResult.value = null;
  resultSummary.value = null;
  createError.value = '';
  createStopPolling();
}

function onUploadChange({ fileList }: { fileList?: any[] }) {
  const files = (fileList || [])
    .map((f) => f?.file ?? f)
    .filter((f) => f instanceof File) as File[];
  // 依据当前导入类型过滤非法扩展名
  const exts = allowedExtMap[currentImportType.value] || [];
  selectedFiles.value = files.filter((f) => {
    const ext = '.' + (f.name.split('.').pop() || '').toLowerCase();
    return exts.length === 0 || exts.includes(ext);
  });
}

function formatFileSize(bytes: number): string {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

async function handleCreateTask() {
  if (selectedFiles.value.length === 0) {
    message.warning('请先选择文件');
    return;
  }
  const info = await getConcurrentInfo().catch(() => null);
  if (info && !info.canCreate) {
    message.warning(`当前运行任务数已达上限（${info.currentCount}/${info.maxAllowed}），请稍后再试`);
    return;
  }
  uploading.value = true;
  try {
    const formData = new FormData();
    selectedFiles.value.forEach((file) => {
      formData.append('files', file);
    });
    formData.append('importType', currentImportType.value);
    formData.append('importVersion', 'v1.0');
    formData.append('module', currentModule.value || '');
    formData.append('businessScope', JSON.stringify({}));

    const res: any = await createBatchTask(formData);
    currentTaskId.value = res.id;
    message.success('任务创建成功，开始预检查...');
    await precheckTask(res.id);
    createStep.value = 'prechecking';
    createStartPolling();
  } catch (e: any) {
    message.error(e?.message || '创建任务失败');
  } finally {
    uploading.value = false;
  }
}

function createStartPolling() {
  createStopPolling();
  if (!currentTaskId.value) return;
  createTimer = setInterval(async () => {
    if (!currentTaskId.value) return;
    try {
      const res = await getTaskProgress(currentTaskId.value);
      createProgress.value = res.progress;
      createStatus.value = res.status;
      createError.value = res.errorMessage || '';
      if (res.status === 'prechecked') {
        precheckResult.value = res.precheckResult || null;
        createStep.value = 'prechecked';
        createStopPolling();
      } else if (res.status === 'completed') {
        resultSummary.value = res.resultSummary || null;
        createStep.value = 'completed';
        createStopPolling();
      } else if (res.status === 'failed') {
        createStopPolling();
      }
    } catch {
      // 静默失败
    }
  }, 2000);
}
function createStopPolling() {
  if (createTimer) {
    clearInterval(createTimer);
    createTimer = null;
  }
}

async function handleConfirm() {
  if (!currentTaskId.value) return;
  try {
    await confirmTask(currentTaskId.value, { skipInvalid: true, skipDuplicate: true });
    createStep.value = 'processing';
    createProgress.value = 0;
    createStartPolling();
    message.success('已开始执行导入');
  } catch (e: any) {
    message.error(e?.message || '操作失败');
  }
}

function handleDone() {
  importDrawerVisible.value = false;
  message.success('任务创建成功');
  loadTaskList();
}

function handleDownloadTemplate() {
  downloadTemplate(currentImportType.value)
    .then(() => message.success('模板下载成功'))
    .catch((e) => message.error(e?.message || '下载失败'));
}

// ============================================================
// 任务详情抽屉
// ============================================================
const detailDrawerVisible = ref(false);
const currentTask = ref<BatchImportApi.BatchTask | null>(null);
const detailLoading = ref(false);
const itemLoading = ref(false);
const itemList = ref<BatchImportApi.BatchItem[]>([]);
const itemTotal = ref(0);
const itemPagination = reactive({ page: 1, pageSize: 50 });
const itemFilterStatus = ref<string | undefined>(undefined);
let detailTimer: ReturnType<typeof setInterval> | null = null;

async function openDetailDrawer(task: BatchImportApi.BatchTask) {
  currentTask.value = task;
  detailDrawerVisible.value = true;
  itemPagination.page = 1;
  itemFilterStatus.value = undefined;
  await loadTaskDetail();
  await loadItemList();
  detailStartPolling();
}

function closeDetailDrawer() {
  detailStopPolling();
  detailDrawerVisible.value = false;
  currentTask.value = null;
}

async function loadTaskDetail() {
  if (!currentTask.value) return;
  detailLoading.value = true;
  try {
    const res = await getTaskDetail(currentTask.value.id);
    currentTask.value = res.task;
  } catch (e: any) {
    message.error(e?.message || '加载失败');
  } finally {
    detailLoading.value = false;
  }
}

async function loadItemList() {
  if (!currentTask.value) return;
  itemLoading.value = true;
  try {
    const res = await getItemList(currentTask.value.id, {
      page: itemPagination.page,
      pageSize: itemPagination.pageSize,
      status: itemFilterStatus.value,
    });
    itemList.value = res.list ?? [];
    itemTotal.value = res.total ?? 0;
  } catch (e: any) {
    message.error(e?.message || '加载失败');
  } finally {
    itemLoading.value = false;
  }
}

function detailStartPolling() {
  detailStopPolling();
  if (!currentTask.value) return;
  const taskId = currentTask.value.id;
  detailTimer = setInterval(async () => {
    try {
      const res = await getTaskProgress(taskId);
      if (currentTask.value) {
        currentTask.value.progress = res.progress;
        currentTask.value.status = res.status;
        currentTask.value.successCount = res.successCount;
        currentTask.value.failCount = res.failCount;
        currentTask.value.pendingCount = res.pendingCount;
      }
      if (res.status === 'completed' || res.status === 'failed') {
        detailStopPolling();
        loadItemList();
      }
    } catch {
      // 静默失败
    }
  }, 3000);
}
function detailStopPolling() {
  if (detailTimer) {
    clearInterval(detailTimer);
    detailTimer = null;
  }
}

// ============================================================
// 操作
// ============================================================
async function handlePrecheck() {
  if (!currentTask.value) return;
  try {
    await precheckTask(currentTask.value.id);
    message.success('预检查已启动');
    loadTaskDetail();
    detailStartPolling();
  } catch (e: any) {
    message.error(e?.message || '操作失败');
  }
}

async function handleConfirmTask() {
  if (!currentTask.value) return;
  try {
    await confirmTask(currentTask.value.id, { skipInvalid: true, skipDuplicate: true });
    message.success('已确认执行');
    loadTaskDetail();
    detailStartPolling();
  } catch (e: any) {
    message.error(e?.message || '操作失败');
  }
}

async function handleRetryItem(item: BatchImportApi.BatchItem) {
  try {
    await retryItem(item.id);
    message.success('重试已启动');
    loadItemList();
  } catch (e: any) {
    message.error(e?.message || '重试失败');
  }
}

async function handleRetryAll() {
  if (!currentTask.value) return;
  try {
    const res: any = await retryTaskFailed(currentTask.value.id);
    message.success(`已启动 ${res.retryCount} 个失败项重试`);
    loadItemList();
    detailStartPolling();
  } catch (e: any) {
    message.error(e?.message || '重试失败');
  }
}

// ============================================================
// 列表加载
// ============================================================
async function loadTaskList() {
  loading.value = true;
  try {
    const res = await getTaskList({
      page: pagination.page,
      pageSize: pagination.pageSize,
      importType: searchForm.importType,
      module: searchForm.module,
      status: searchForm.status,
      keyword: searchForm.keyword || undefined,
    });
    taskList.value = res.list ?? [];
    total.value = res.total ?? 0;
  } catch (e: any) {
    message.error(e?.message || '加载失败');
  } finally {
    loading.value = false;
  }
}

function onPageChange(payload: { currentPage: number; pageSize: number }) {
  pagination.page = payload.currentPage;
  pagination.pageSize = payload.pageSize;
  loadTaskList();
}

function handleSearch() {
  pagination.page = 1;
  loadTaskList();
}
function handleReset() {
  searchForm.importType = undefined;
  searchForm.module = undefined;
  searchForm.status = undefined;
  searchForm.keyword = '';
  pagination.page = 1;
  loadTaskList();
}
function handleItemPageChange(payload: { currentPage: number; pageSize: number }) {
  itemPagination.page = payload.currentPage;
  itemPagination.pageSize = payload.pageSize;
  loadItemList();
}

// ============================================================
// 列
// ============================================================
const columns = ref<VxeTableGridColumns>([
  { title: '任务编号', field: 'taskNo', width: 160, align: 'left', showOverflow: 'tooltip' },
  { title: '导入类型', field: 'importType', width: 100, align: 'center', slots: { default: 'importType' } },
  { title: '所属模块', field: 'module', width: 120, align: 'center', slots: { default: 'module' } },
  { title: '进度', field: 'progress', width: 200, align: 'center', slots: { default: 'progress' } },
  { title: '总数', field: 'totalCount', width: 70, align: 'center' },
  { title: '成功', field: 'successCount', width: 70, align: 'center', slots: { default: 'success' } },
  { title: '失败', field: 'failCount', width: 70, align: 'center', slots: { default: 'fail' } },
  { title: '状态', field: 'status', width: 110, align: 'center', slots: { default: 'status' } },
  { title: '创建人', field: 'createdBy', width: 100, align: 'center' },
  { title: '创建时间', field: 'createdAt', width: 170, align: 'center', slots: { default: 'createdAt' } },
  { title: '操作', field: 'action', width: 120, align: 'center', slots: { default: 'action' } },
]);

const itemColumns = ref<VxeTableGridColumns>([
  { title: '序号', field: 'seqNo', width: 70, align: 'center' },
  { title: '文件名', field: 'originalName', minWidth: 160, align: 'left', showOverflow: 'tooltip' },
  { title: '文件大小', field: 'fileSize', width: 100, align: 'center', slots: { default: 'fileSize' } },
  { title: '状态', field: 'status', width: 110, align: 'center', slots: { default: 'status' } },
  { title: '错误信息', field: 'errorMessage', minWidth: 160, align: 'left', showOverflow: 'tooltip', slots: { default: 'error' } },
  { title: '重试次数', field: 'retryCount', width: 90, align: 'center', slots: { default: 'retry' } },
  { title: '操作', field: 'action', width: 80, align: 'center', slots: { default: 'action' } },
]);

const precheckColumns = ref<VxeTableGridColumns>([
  { title: '序号', field: 'seqNo', width: 70, align: 'center' },
  { title: '文件名', field: 'originalName', minWidth: 160, align: 'left', showOverflow: 'tooltip' },
  { title: '大小', field: 'fileSize', width: 100, align: 'center', slots: { default: 'fileSize' } },
  { title: '结果', field: 'precheckStatus', width: 100, align: 'center', slots: { default: 'precheck' } },
  { title: '说明', field: 'precheckMessage', minWidth: 160, align: 'left', showOverflow: 'tooltip', slots: { default: 'precheckMsg' } },
]);

const itemStatusTypeMap: Record<string, 'success' | 'info' | 'warning' | 'danger' | 'neutral'> = {
  pending: 'neutral',
  prechecking: 'info',
  prechecked: 'info',
  invalid: 'danger',
  duplicate: 'warning',
  processing: 'info',
  success: 'success',
  failed: 'danger',
  skipped: 'neutral',
  retrying: 'info',
};
const itemStatusTextMap: Record<string, string> = {
  pending: '待处理',
  prechecking: '预检查中',
  prechecked: '预检查通过',
  invalid: '无效文件',
  duplicate: '重复文件',
  processing: '处理中',
  success: '成功',
  failed: '失败',
  skipped: '已跳过',
  retrying: '重试中',
};
const precheckStatusTypeMap: Record<string, 'success' | 'info' | 'warning' | 'danger' | 'neutral'> = {
  passed: 'success',
  failed: 'danger',
  duplicate: 'warning',
};
const precheckStatusTextMap: Record<string, string> = {
  passed: '通过',
  failed: '失败',
  duplicate: '重复',
};

const actionState = computed<Partial<Record<HseActionKey, { hidden?: boolean; loading?: boolean; disabled?: boolean }>>>(() => ({
  downloadTemplate: { hidden: true },
  import: { hidden: true },
  export: { hidden: true },
  create: canCreate.value ? {} : { disabled: true },
}));

function formatDateTime(date?: string | null): string {
  if (!date) return '-';
  try {
    return new Date(date).toLocaleString('zh-CN');
  } catch {
    return date;
  }
}

onMounted(() => {
  loadTaskList();
});
onBeforeUnmount(() => {
  createStopPolling();
  detailStopPolling();
});
</script>

<template>
  <HsePageLayout :title="$t('page.hse.batchImport')" :description="$t('page.hse.batchImportDesc')">
    <template #extra>
      <HseActionBar
        :actions="actionState"
        @refresh="loadTaskList"
        @create="openImportDrawer"
      />
      <NSelect
        v-model:value="currentModule"
        :options="moduleOptions"
        placeholder="模块分类"
        style="width: 140px"
      />
      <NSelect
        v-model:value="currentImportType"
        :options="importTypeOptions"
        style="width: 140px"
      />
    </template>

    <!-- 筛选 -->
    <div class="mb-3 flex flex-wrap items-center gap-3">
      <NSelect
        v-model:value="searchForm.module"
        :options="moduleOptions"
        placeholder="模块分类"
        clearable
        style="width: 160px"
        @update:value="handleSearch"
      />
      <NSelect
        v-model:value="searchForm.importType"
        :options="importTypeOptions"
        placeholder="导入类型"
        clearable
        style="width: 160px"
        @update:value="handleSearch"
      />
      <NSelect
        v-model:value="searchForm.status"
        :options="statusOptions"
        placeholder="任务状态"
        clearable
        style="width: 160px"
        @update:value="handleSearch"
      />
      <NInput
        v-model:value="searchForm.keyword"
        placeholder="搜索任务编号/创建人"
        clearable
        style="width: 240px"
        @keyup.enter="handleSearch"
      />
      <NButton type="primary" @click="handleSearch">搜索</NButton>
      <NButton @click="handleReset">重置</NButton>
    </div>

    <!-- 任务列表 -->
    <HseDataGrid
      :columns="columns"
      :data="taskList"
      :loading="loading"
      :pager="true"
      :total="total"
      @page-change="onPageChange"
    >
      <template #importType="{ row }">
        <NTag :bordered="false" size="small">{{ importTypeTextMap[row.importType] || row.importType }}</NTag>
      </template>
      <template #module="{ row }">
        {{ row.module ? (moduleTextMap[row.module] || row.module) : '-' }}
      </template>
      <template #progress="{ row }">
        <NProgress type="line" :percentage="row.progress || 0" :height="8" />
      </template>
      <template #success="{ row }">
        <NTag :bordered="false" size="small" type="success">{{ row.successCount }}</NTag>
      </template>
      <template #fail="{ row }">
        <NTag :bordered="false" size="small" type="error">{{ row.failCount }}</NTag>
      </template>
      <template #status="{ row }">
        <HseStatusTag :type="statusTypeMap[row.status] || 'neutral'" :label="statusTextMap[row.status] || row.status" />
      </template>
      <template #createdAt="{ row }">
        {{ formatDateTime(row.createdAt) }}
      </template>
      <template #action="{ row }">
        <NButton size="small" type="primary" text @click="openDetailDrawer(row)">详情</NButton>
      </template>
    </HseDataGrid>

    <!-- 新建导入抽屉 -->
    <NDrawer v-model:show="importDrawerVisible" :width="560" :mask-closable="false" @close="createStopPolling">
      <NDrawerContent title="新建批量导入" :native-scrollbar="false">
        <!-- 步骤 1：上传 -->
        <div v-if="createStep === 'upload'">
          <NDescriptions :column="2" size="small" bordered class="mb-4">
            <NDescriptionsItem label="目标模块">{{ moduleTextMap[currentModule] || currentModule }}</NDescriptionsItem>
            <NDescriptionsItem label="导入类型">{{ importTypeTextMap[currentImportType] }}</NDescriptionsItem>
          </NDescriptions>
          <NAlert type="info" :show-icon="true" class="mb-4">
            <template #header>批量导入说明</template>
            <ul class="list-disc pl-5 text-sm">
              <li>支持一次性上传最多 500 个文件</li>
              <li>单文件大小不超过 100MB</li>
              <li>系统将自动进行预检查，检测重复文件和无效文件</li>
              <li>预检查通过后需人工确认方可正式执行</li>
            </ul>
          </NAlert>
          <NCard :bordered="false" title="上传文件" size="small">
            <NUpload
              :accept="acceptStr"
              multiple
              :max="500"
              :default-upload="false"
              :show-file-list="true"
              @change="onUploadChange"
            >
              <NUploadDragger>
                <div class="flex flex-col items-center gap-2 py-6">
                  <Inbox :size="48" class="text-[var(--vxe-ui-font-primary-color)]" />
                  <div class="text-base font-medium">点击或拖拽文件到此区域上传</div>
                  <div class="text-sm text-muted-foreground">
                    支持 {{ importTypeTextMap[currentImportType] }} 文件，最多 500 个，单文件最大 100MB
                  </div>
                </div>
              </NUploadDragger>
            </NUpload>
            <div class="mt-4 flex justify-end gap-2">
              <NButton @click="handleDownloadTemplate">下载模板</NButton>
              <NButton
                type="primary"
                :loading="uploading"
                :disabled="selectedFiles.length === 0"
                @click="handleCreateTask"
              >
                开始预检查
              </NButton>
            </div>
          </NCard>
        </div>

        <!-- 步骤 2：预检查中 -->
        <div v-else-if="createStep === 'prechecking'">
          <NCard :bordered="false" size="small">
            <div class="py-10 text-center">
              <Inbox :size="64" class="text-[var(--vxe-ui-font-primary-color)]" />
              <p class="mt-4 text-lg">正在预检查文件...</p>
              <p class="text-muted-foreground">正在检测文件类型、大小、重复文件</p>
              <NProgress type="line" :percentage="createProgress || 0" class="mt-5" />
            </div>
          </NCard>
        </div>

        <!-- 步骤 3：预检查完成 -->
        <div v-else-if="createStep === 'prechecked' && precheckResult">
          <NAlert :type="precheckResult.invalidCount > 0 ? 'warning' : 'success'" :show-icon="true" class="mb-4">
            <template #header>预检查完成</template>
            通过 {{ precheckResult.validCount }} 个，失败 {{ precheckResult.invalidCount }} 个，重复 {{ precheckResult.dupCount }} 个
            <div class="mt-1">默认将跳过无效文件和重复文件，仅导入预检查通过的文件</div>
          </NAlert>
          <NCard :bordered="false" title="预检查明细" size="small">
            <HseDataGrid
              :columns="precheckColumns"
              :data="precheckResult.items || []"
              :pager="false"
              :size="'small'"
            >
              <template #fileSize="{ row }">{{ formatFileSize(row.fileSize) }}</template>
              <template #precheck="{ row }">
                <HseStatusTag
                  :type="precheckStatusTypeMap[row.precheckStatus] || 'neutral'"
                  :label="precheckStatusTextMap[row.precheckStatus] || row.precheckStatus"
                />
              </template>
              <template #precheckMsg="{ row }">
                <span class="text-error">{{ row.precheckMessage || '-' }}</span>
              </template>
            </HseDataGrid>
            <div class="mt-4 flex justify-end gap-2">
              <NButton @click="importDrawerVisible = false">取消</NButton>
              <NButton type="primary" @click="handleConfirm">确认执行</NButton>
            </div>
          </NCard>
        </div>

        <!-- 步骤 4：处理中 -->
        <div v-else-if="createStep === 'processing'">
          <NCard :bordered="false" size="small">
            <div class="py-10 text-center">
              <Inbox :size="64" class="text-success" />
              <p class="mt-4 text-lg">正在导入...</p>
              <p class="text-muted-foreground">请耐心等待，完成后将自动刷新</p>
              <NProgress type="line" :percentage="createProgress || 0" class="mt-5" />
            </div>
          </NCard>
        </div>

        <!-- 步骤 5：完成 -->
        <div v-else-if="createStep === 'completed'">
          <NAlert type="success" :show-icon="true" class="mb-4">导入完成，您可以在任务列表中查看详细结果</NAlert>
          <NCard :bordered="false" size="small">
            <div class="grid grid-cols-3 gap-3">
              <NStatistic title="总计" :value="precheckResult?.totalCount || 0" />
              <NStatistic title="成功" :value="resultSummary?.successCount || 0" />
              <NStatistic title="失败" :value="resultSummary?.failCount || 0" />
            </div>
            <div class="mt-5 flex justify-end">
              <NButton type="primary" @click="handleDone">完成</NButton>
            </div>
          </NCard>
        </div>

        <NAlert
          v-if="createError && createStep !== 'completed' && createStep !== 'prechecked'"
          type="error"
          :show-icon="true"
          class="mt-4"
          :title="'任务失败'"
          :description="createError"
        />
      </NDrawerContent>
    </NDrawer>

    <!-- 任务详情抽屉 -->
    <NDrawer v-model:show="detailDrawerVisible" :width="720" :native-scrollbar="false" @close="closeDetailDrawer">
      <NDrawerContent title="任务详情" :native-scrollbar="false">
        <template v-if="currentTask">
          <NCard :bordered="false" size="small" class="mb-4">
            <NDescriptions :column="2" size="small">
              <NDescriptionsItem label="任务编号">{{ currentTask.taskNo }}</NDescriptionsItem>
              <NDescriptionsItem label="导入类型">{{ importTypeTextMap[currentTask.importType] }}</NDescriptionsItem>
              <NDescriptionsItem label="状态">
                <HseStatusTag
                  :type="statusTypeMap[currentTask.status] || 'neutral'"
                  :label="statusTextMap[currentTask.status]"
                />
              </NDescriptionsItem>
              <NDescriptionsItem label="模板版本">{{ currentTask.importVersion }}</NDescriptionsItem>
              <NDescriptionsItem label="创建人">{{ currentTask.createdBy }}</NDescriptionsItem>
              <NDescriptionsItem label="创建时间">{{ formatDateTime(currentTask.createdAt) }}</NDescriptionsItem>
            </NDescriptions>

            <div class="mt-4 grid grid-cols-4 gap-3">
              <NStatistic title="总数" :value="currentTask.totalCount" />
              <NStatistic title="成功" :value="currentTask.successCount" />
              <NStatistic title="失败" :value="currentTask.failCount" />
              <NStatistic title="待处理" :value="currentTask.pendingCount" />
            </div>

            <div class="mt-3">
              <NProgress type="line" :percentage="currentTask.progress || 0" />
            </div>

            <NSpace class="mt-4">
              <NButton
                v-if="currentTask.status === 'pending' || currentTask.status === 'prechecked'"
                type="primary"
                @click="handlePrecheck"
              >
                {{ currentTask.status === 'prechecked' ? '重新预检查' : '开始预检查' }}
              </NButton>
              <NButton
                v-if="currentTask.status === 'prechecked'"
                type="primary"
                @click="handleConfirmTask"
              >
                确认执行
              </NButton>
              <NButton
                v-if="currentTask.status === 'completed' && currentTask.failCount > 0 && canRetry"
                @click="handleRetryAll"
              >
                批量重试失败
              </NButton>
            </NSpace>
          </NCard>

          <NCard :bordered="false" title="文件明细" size="small">
            <NSpace class="mb-3">
              <NSelect
                v-model:value="itemFilterStatus"
                :options="[
                  { label: '成功', value: 'success' },
                  { label: '失败', value: 'failed' },
                  { label: '处理中', value: 'processing' },
                  { label: '已跳过', value: 'skipped' },
                  { label: '重复文件', value: 'duplicate' },
                  { label: '无效文件', value: 'invalid' },
                ]"
                placeholder="筛选状态"
                clearable
                style="width: 160px"
                @update:value="() => { itemPagination.page = 1; loadItemList(); }"
              />
            </NSpace>
            <HseDataGrid
              :columns="itemColumns"
              :data="itemList"
              :loading="itemLoading"
              :pager="true"
              :total="itemTotal"
              :size="'small'"
              @page-change="handleItemPageChange"
            >
              <template #fileSize="{ row }">{{ formatFileSize(row.fileSize) }}</template>
              <template #status="{ row }">
                <HseStatusTag
                  :type="itemStatusTypeMap[row.status] || 'neutral'"
                  :label="itemStatusTextMap[row.status] || row.status"
                />
              </template>
              <template #error="{ row }">
                <span class="text-error">{{ row.errorMessage || '-' }}</span>
              </template>
              <template #retry="{ row }">{{ row.retryCount }}/{{ row.maxRetry }}</template>
              <template #action="{ row }">
                <NButton
                  v-if="row.status === 'failed' && canRetry && row.retryCount < row.maxRetry"
                  size="small"
                  type="primary"
                  text
                  @click="handleRetryItem(row)"
                >
                  重试
                </NButton>
                <span v-else class="text-muted-foreground">-</span>
              </template>
            </HseDataGrid>
          </NCard>
        </template>
      </NDrawerContent>
    </NDrawer>
  </HsePageLayout>
</template>
