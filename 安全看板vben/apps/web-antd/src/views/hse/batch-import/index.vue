<script setup lang="tsx">
/**
 * 批量导入中心 - 任务列表页
 *
 * 功能: 任务列表展示、筛选、新建导入、查看详情、失败重试、模板下载
 * 组件: BatchImportDrawer（新建导入抽屉）、TaskDetailDrawer（任务详情抽屉）
 */
import { computed, onMounted, reactive, ref } from 'vue';
import {
  Button,
  Card,
  Input,
  Select,
  Space,
  Table,
  Tag,
  message,
  Drawer,
  Tooltip,
  Progress,
  Descriptions,
  DescriptionsItem,
  Row,
  Col,
  Statistic,
} from 'ant-design-vue';
import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';
import { useAccess } from '@vben/access';

import {
  getTaskList,
  getTaskDetail,
  getTaskProgress,
  getItemList,
  retryItem,
  retryTaskFailed,
  precheckTask,
  confirmTask,
  type BatchImportApi,
} from '#/api/hse/batch-import';

const { hasAccessByRoles } = useAccess();

const canCreate = computed(() =>
  hasAccessByRoles(['admin', 'safety_manager', 'safety_officer']),
);
const canRetry = computed(() =>
  hasAccessByRoles(['admin', 'safety_manager']),
);

// ============================================================
// 数据
// ============================================================
const loading = ref(false);
const taskList = ref<BatchImportApi.BatchTask[]>([]);
const total = ref(0);
const pagination = reactive({
  page: 1,
  pageSize: 20,
});

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

const statusColorMap: Record<string, string> = {
  pending: 'default',
  prechecking: 'processing',
  prechecked: 'cyan',
  confirmed: 'blue',
  processing: 'processing',
  completed: 'success',
  failed: 'error',
  cancelled: 'default',
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

// ============================================================
// 新建导入抽屉
// ============================================================
const importDrawerVisible = ref(false);
const currentImportType = ref<BatchImportApi.ImportType>('document');
const currentModule = ref<string>('personnel');

function openImportDrawer(type: BatchImportApi.ImportType = 'document', module?: string) {
  currentImportType.value = type;
  if (module) currentModule.value = module;
  importDrawerVisible.value = true;
}

function handleImportSuccess(_taskId: number) {
  importDrawerVisible.value = false;
  message.success('任务创建成功');
  loadTaskList();
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
const itemPagination = reactive({
  page: 1,
  pageSize: 50,
});
const itemFilterStatus = ref<string | undefined>(undefined);

let progressTimer: ReturnType<typeof setInterval> | null = null;

async function openDetailDrawer(task: BatchImportApi.BatchTask) {
  currentTask.value = task;
  detailDrawerVisible.value = true;
  itemPagination.page = 1;
  itemFilterStatus.value = undefined;
  await loadTaskDetail();
  await loadItemList();
  startProgressPolling();
}

function closeDetailDrawer() {
  stopProgressPolling();
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
    message.error(e.message || '加载失败');
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
    itemList.value = res.list;
    itemTotal.value = res.total;
  } catch (e: any) {
    message.error(e.message || '加载失败');
  } finally {
    itemLoading.value = false;
  }
}

function startProgressPolling() {
  stopProgressPolling();
  if (!currentTask.value) return;
  const taskId = currentTask.value.id;
  progressTimer = setInterval(async () => {
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
        stopProgressPolling();
        loadItemList();
      }
    } catch (e) {
      // 静默失败
    }
  }, 3000);
}

function stopProgressPolling() {
  if (progressTimer) {
    clearInterval(progressTimer);
    progressTimer = null;
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
    startProgressPolling();
  } catch (e: any) {
    message.error(e.message || '操作失败');
  }
}

async function handleConfirm() {
  if (!currentTask.value) return;
  try {
    await confirmTask(currentTask.value.id, {
      skipInvalid: true,
      skipDuplicate: true,
    });
    message.success('已确认执行');
    loadTaskDetail();
    startProgressPolling();
  } catch (e: any) {
    message.error(e.message || '操作失败');
  }
}

async function handleRetryItem(item: BatchImportApi.BatchItem) {
  try {
    await retryItem(item.id);
    message.success('重试已启动');
    loadItemList();
  } catch (e: any) {
    message.error(e.message || '重试失败');
  }
}

async function handleRetryAll() {
  if (!currentTask.value) return;
  try {
    const res = await retryTaskFailed(currentTask.value.id);
    message.success(`已启动 ${res.retryCount} 个失败项重试`);
    loadItemList();
    startProgressPolling();
  } catch (e: any) {
    message.error(e.message || '重试失败');
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
    taskList.value = res.list;
    total.value = res.total;
  } catch (e: any) {
    message.error(e.message || '加载失败');
  } finally {
    loading.value = false;
  }
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

function handleTableChange(pag: any) {
  pagination.page = pag.current;
  pagination.pageSize = pag.pageSize;
  loadTaskList();
}

function handleItemPageChange(pag: any) {
  itemPagination.page = pag.current;
  itemPagination.pageSize = pag.pageSize;
  loadItemList();
}

function formatFileSize(bytes: number): string {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

const itemStatusColorMap: Record<string, string> = {
  pending: 'default',
  prechecking: 'processing',
  prechecked: 'cyan',
  invalid: 'error',
  duplicate: 'warning',
  processing: 'processing',
  success: 'success',
  failed: 'error',
  skipped: 'default',
  retrying: 'processing',
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

const columns = [
  {
    title: '任务编号',
    dataIndex: 'taskNo',
    width: 160,
    customRender: ({ record }: any) => (
      <a>
        {record.taskNo}
      </a>
    ),
  },
  {
    title: '导入类型',
    dataIndex: 'importType',
    width: 100,
    customRender: ({ record }: any) => (
      <Tag>{importTypeTextMap[record.importType] || record.importType}</Tag>
    ),
  },
  {
    title: '所属模块',
    dataIndex: 'module',
    width: 120,
    customRender: ({ text }: any) => {
      const map: Record<string, string> = {
        objectives: '目标职责', standards: '制度标准', risk: '风险管控',
        hazards: '隐患治理', site: '现场管理', personnel: '人员管理',
        training: '培训考核', emergency: '应急管理', insurance: '保险管理',
        overview: '安全总览', system: '系统管理',
      };
      return text ? map[text as keyof typeof map] || text : '-';
    },
  },
  {
    title: '进度',
    dataIndex: 'progress',
    width: 200,
    customRender: ({ record }: any) => (
      <Progress percent={record.progress} size="small" />
    ),
  },
  {
    title: '总数',
    dataIndex: 'totalCount',
    width: 70,
    align: 'right' as const,
  },
  {
    title: '成功',
    dataIndex: 'successCount',
    width: 70,
    align: 'right' as const,
    customRender: ({ record }: any) => (
      <span style="color: #52c41a">{record.successCount}</span>
    ),
  },
  {
    title: '失败',
    dataIndex: 'failCount',
    width: 70,
    align: 'right' as const,
    customRender: ({ record }: any) => (
      <span style="color: #ff4d4f">{record.failCount}</span>
    ),
  },
  {
    title: '状态',
    dataIndex: 'status',
    width: 110,
    customRender: ({ record }: any) => (
      <Tag color={statusColorMap[record.status] || 'default'}>
        {statusTextMap[record.status] || record.status}
      </Tag>
    ),
  },
  {
    title: '创建人',
    dataIndex: 'createdBy',
    width: 100,
  },
  {
    title: '创建时间',
    dataIndex: 'createdAt',
    width: 170,
    customRender: ({ record }: any) =>
      new Date(record.createdAt).toLocaleString('zh-CN'),
  },
  {
    title: '操作',
    key: 'action',
    width: 120,
    fixed: 'right' as const,
    customRender: ({ record }: any) => (
      <Space size="small">
        <a onClick={() => openDetailDrawer(record)}>详情</a>
      </Space>
    ),
  },
];

const itemColumns = [
  {
    title: '序号',
    dataIndex: 'seqNo',
    width: 70,
  },
  {
    title: '文件名',
    dataIndex: 'originalName',
    ellipsis: true,
  },
  {
    title: '文件大小',
    dataIndex: 'fileSize',
    width: 100,
    customRender: ({ record }: any) => formatFileSize(record.fileSize),
  },
  {
    title: '状态',
    dataIndex: 'status',
    width: 110,
    customRender: ({ record }: any) => (
      <Tag color={itemStatusColorMap[record.status] || 'default'}>
        {itemStatusTextMap[record.status] || record.status}
      </Tag>
    ),
  },
  {
    title: '错误信息',
    dataIndex: 'errorMessage',
    ellipsis: true,
    customRender: ({ record }: any) => (
      <Tooltip title={record.errorMessage}>
        <span style="color: #ff4d4f">{record.errorMessage || '-'}</span>
      </Tooltip>
    ),
  },
  {
    title: '重试次数',
    dataIndex: 'retryCount',
    width: 80,
    align: 'center' as const,
    customRender: ({ record }: any) =>
      `${record.retryCount}/${record.maxRetry}`,
  },
  {
    title: '操作',
    key: 'action',
    width: 80,
    fixed: 'right' as const,
    customRender: ({ record }: any) => {
      if (record.status === 'failed' && canRetry.value && record.retryCount < record.maxRetry) {
        return <a onClick={() => handleRetryItem(record)}>重试</a>;
      }
      return <span style="color: #bbb">-</span>;
    },
  },
];

onMounted(() => {
  loadTaskList();
});
</script>

<template>
  <Page>
    <Card>
      <Row :gutter="16" style="margin-bottom: 16px">
        <Col :span="24">
          <Space wrap>
            <Select
              v-model:value="searchForm.module"
              placeholder="模块分类"
              style="width: 140px"
              allowClear
              :options="moduleOptions"
              @change="handleSearch"
            />
            <Select
              v-model:value="searchForm.importType"
              placeholder="导入类型"
              style="width: 140px"
              allowClear
              :options="importTypeOptions"
              @change="handleSearch"
            />
            <Select
              v-model:value="searchForm.status"
              placeholder="任务状态"
              style="width: 140px"
              allowClear
              :options="statusOptions"
              @change="handleSearch"
            />
            <Input
              v-model:value="searchForm.keyword"
              placeholder="搜索任务编号/创建人"
              style="width: 240px"
              allow-clear
              @pressEnter="handleSearch"
            />
            <Button type="primary" @click="handleSearch">
              <IconifyIcon icon="lucide:search" :size="16" style="margin-right: 4px" />
              搜索
            </Button>
            <Button @click="handleReset">重置</Button>
          </Space>
          <div style="float: right">
            <Space>
              <Select
                v-model:value="currentModule"
                placeholder="模块分类"
                style="width: 140px"
                :options="moduleOptions"
              />
              <Select
                v-model:value="currentImportType"
                style="width: 140px"
                :options="importTypeOptions"
              >
                <template #suffixIcon>
                  <IconifyIcon icon="lucide:chevron-down" :size="14" />
                </template>
              </Select>
              <Button
                type="primary"
                :disabled="!canCreate"
                @click="openImportDrawer(currentImportType, currentModule)"
              >
                <IconifyIcon icon="lucide:plus" :size="16" style="margin-right: 4px" />
                新建导入
              </Button>
            </Space>
          </div>
        </Col>
      </Row>

      <Table
        :columns="columns"
        :data-source="taskList"
        :loading="loading"
        :pagination="{
          current: pagination.page,
          pageSize: pagination.pageSize,
          total,
          showSizeChanger: true,
          showTotal: (t) => `共 ${t} 条`,
        }"
        :scroll="{ x: 1100 }"
        @change="handleTableChange"
      />
    </Card>

    <!-- 新建导入抽屉 -->
    <Drawer
      v-model:open="importDrawerVisible"
      title="新建批量导入"
      width="560"
      :mask-closable="false"
    >
      <BatchImportDrawer
        :import-type="currentImportType"
        :module="currentModule"
        @success="handleImportSuccess"
        @cancel="importDrawerVisible = false"
      />
    </Drawer>

    <!-- 任务详情抽屉 -->
    <Drawer
      v-model:open="detailDrawerVisible"
      title="任务详情"
      width="720"
      @close="closeDetailDrawer"
    >
      <template v-if="currentTask">
        <Card size="small" :bordered="false" style="margin-bottom: 16px">
          <Descriptions :column="2" size="small">
            <DescriptionsItem label="任务编号">
              {{ currentTask.taskNo }}
            </DescriptionsItem>
            <DescriptionsItem label="导入类型">
              {{ importTypeTextMap[currentTask.importType] }}
            </DescriptionsItem>
            <DescriptionsItem label="状态">
              <Tag :color="statusColorMap[currentTask.status]">
                {{ statusTextMap[currentTask.status] }}
              </Tag>
            </DescriptionsItem>
            <DescriptionsItem label="模板版本">
              {{ currentTask.importVersion }}
            </DescriptionsItem>
            <DescriptionsItem label="创建人">
              {{ currentTask.createdBy }}
            </DescriptionsItem>
            <DescriptionsItem label="创建时间">
              {{ new Date(currentTask.createdAt).toLocaleString('zh-CN') }}
            </DescriptionsItem>
          </Descriptions>

          <Row :gutter="16" style="margin-top: 16px">
            <Col :span="6">
              <Statistic title="总数" :value="currentTask.totalCount" />
            </Col>
            <Col :span="6">
              <Statistic
                title="成功"
                :value="currentTask.successCount"
                :value-style="{ color: '#52c41a' }"
              />
            </Col>
            <Col :span="6">
              <Statistic
                title="失败"
                :value="currentTask.failCount"
                :value-style="{ color: '#ff4d4f' }"
              />
            </Col>
            <Col :span="6">
              <Statistic title="待处理" :value="currentTask.pendingCount" />
            </Col>
          </Row>

          <div style="margin-top: 12px">
            <Progress :percent="currentTask.progress" />
          </div>

          <Space style="margin-top: 16px">
            <Button
              v-if="currentTask.status === 'pending' || currentTask.status === 'prechecked'"
              type="primary"
              @click="handlePrecheck"
            >
              <IconifyIcon icon="lucide:check-circle" :size="16" style="margin-right: 4px" />
              {{ currentTask.status === 'prechecked' ? '重新预检查' : '开始预检查' }}
            </Button>
            <Button
              v-if="currentTask.status === 'prechecked'"
              type="primary"
              @click="handleConfirm"
            >
              <IconifyIcon icon="lucide:play" :size="16" style="margin-right: 4px" />
              确认执行
            </Button>
            <Button
              v-if="currentTask.status === 'completed' && currentTask.failCount > 0 && canRetry"
              @click="handleRetryAll"
            >
              <IconifyIcon icon="lucide:refresh-cw" :size="16" style="margin-right: 4px" />
              批量重试失败
            </Button>
          </Space>
        </Card>

        <Card size="small" title="文件明细" :bordered="false">
          <Space style="margin-bottom: 12px">
            <Select
              v-model:value="itemFilterStatus"
              placeholder="筛选状态"
              style="width: 140px"
              allowClear
              :options="[
                { label: '成功', value: 'success' },
                { label: '失败', value: 'failed' },
                { label: '处理中', value: 'processing' },
                { label: '已跳过', value: 'skipped' },
                { label: '重复文件', value: 'duplicate' },
                { label: '无效文件', value: 'invalid' },
              ]"
              @change="() => { itemPagination.page = 1; loadItemList() }"
            />
          </Space>

          <Table
            :columns="itemColumns"
            :data-source="itemList"
            :loading="itemLoading"
            size="small"
            :pagination="{
              current: itemPagination.page,
              pageSize: itemPagination.pageSize,
              total: itemTotal,
              showSizeChanger: true,
              showTotal: (t) => `共 ${t} 条`,
            }"
            :scroll="{ x: 700, y: 400 }"
            @change="handleItemPageChange"
          />
        </Card>
      </template>
    </Drawer>
  </Page>
</template>

<script lang="tsx">
import BatchImportDrawer from './components/BatchImportDrawer.vue';

export default {
  components: { BatchImportDrawer },
};
</script>
