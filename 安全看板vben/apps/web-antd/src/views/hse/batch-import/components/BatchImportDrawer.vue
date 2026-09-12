<script setup lang="tsx">
/**
 * 批量导入抽屉组件
 *
 * 功能: 拖拽上传文件、选择导入类型、选择分类、预检查、确认执行
 * 流程: 上传 → 创建任务 → 预检查 → 确认执行
 */
import { computed, ref, watch } from 'vue';
import {
  Upload,
  Button,
  Alert,
  Space,
  Progress,
  Table,
  Tag,
  Card,
  message,
  Tooltip,
  Descriptions,
  DescriptionsItem,
} from 'ant-design-vue';
import { IconifyIcon } from '@vben/icons';

import {
  createBatchTask,
  precheckTask,
  confirmTask,
  getTaskProgress,
  downloadTemplate,
  getConcurrentInfo,
  type BatchImportApi,
} from '#/api/hse/batch-import';

const props = defineProps<{
  importType: BatchImportApi.ImportType;
  module?: string;
}>();

const emit = defineEmits<{
  success: [taskId: number];
  cancel: [];
}>();

// ============================================================
// 状态
// ============================================================
const step = ref<'upload' | 'prechecking' | 'prechecked' | 'processing' | 'completed'>('upload');
const uploading = ref(false);
const currentTaskId = ref<number | null>(null);
const progress = ref(0);
const taskStatus = ref('');
const precheckResult = ref<BatchImportApi.PrecheckResult | null>(null);
const resultSummary = ref<any>(null);
const errorMessage = ref('');
const fileList = ref<any[]>([]);

let progressTimer: ReturnType<typeof setInterval> | null = null;

const importTypeTextMap: Record<string, string> = {
  document: '安全资料',
  standard_clause: '标准条款',
  safety_record: '安全记录',
};

const moduleTextMap: Record<string, string> = {
  objectives: '目标职责', standards: '制度标准', risk: '风险管控',
  hazards: '隐患治理', site: '现场管理', personnel: '人员管理',
  training: '培训考核', emergency: '应急管理', insurance: '保险管理',
  overview: '安全总览', system: '系统管理',
};

const moduleText = computed(() => {
  return props.module ? moduleTextMap[props.module] || props.module : '未选择';
});

const allowedExtMap: Record<string, string[]> = {
  document: ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'],
  standard_clause: ['.xlsx', '.xls'],
  safety_record: ['.xlsx', '.xls'],
};

const acceptStr = computed(() => {
  const exts = allowedExtMap[props.importType] || [];
  return exts.join(',');
});

// ============================================================
// 文件上传
// ============================================================
const uploadProps = {
  multiple: true,
  accept: acceptStr.value,
  maxCount: 500,
  beforeUpload: (file: File) => {
    const exts = allowedExtMap[props.importType] || [];
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (exts.length > 0 && !exts.includes(ext)) {
      message.error(`不支持的文件类型: ${file.name}`);
      return Upload.LIST_IGNORE;
    }
    if (file.size > 100 * 1024 * 1024) {
      message.error(`文件过大（超过 100MB）: ${file.name}`);
      return Upload.LIST_IGNORE;
    }
    return true;
  },
  fileList: fileList.value,
  'onUpdate:fileList': (list: any[]) => {
    fileList.value = list;
  },
  showUploadList: {
    showRemoveIcon: true,
  },
  customRequest: () => {},
};

// ============================================================
// 创建任务并上传
// ============================================================
async function handleCreateTask() {
  if (fileList.value.length === 0) {
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
    fileList.value.forEach((file) => {
      formData.append('files', file.originFileObj || file);
    });
    formData.append('importType', props.importType);
    formData.append('importVersion', 'v1.0');
    formData.append('module', props.module || '');
    formData.append('businessScope', JSON.stringify({}));

    const res = await createBatchTask(formData);
    currentTaskId.value = res.id;
    message.success('任务创建成功，开始预检查...');

    await precheckTask(res.id);
    step.value = 'prechecking';
    startProgressPolling();
  } catch (e: any) {
    message.error(e.message || '创建任务失败');
  } finally {
    uploading.value = false;
  }
}

// ============================================================
// 进度轮询
// ============================================================
function startProgressPolling() {
  stopProgressPolling();
  if (!currentTaskId.value) return;

  progressTimer = setInterval(async () => {
    if (!currentTaskId.value) return;
    try {
      const res = await getTaskProgress(currentTaskId.value);
      progress.value = res.progress;
      taskStatus.value = res.status;
      errorMessage.value = res.errorMessage || '';

      if (res.status === 'prechecked') {
        precheckResult.value = res.precheckResult || null;
        step.value = 'prechecked';
        stopProgressPolling();
      } else if (res.status === 'completed') {
        resultSummary.value = res.resultSummary || null;
        step.value = 'completed';
        stopProgressPolling();
      } else if (res.status === 'failed') {
        stopProgressPolling();
      }
    } catch (e) {
      // 静默失败
    }
  }, 2000);
}

function stopProgressPolling() {
  if (progressTimer) {
    clearInterval(progressTimer);
    progressTimer = null;
  }
}

// ============================================================
// 确认执行
// ============================================================
async function handleConfirm() {
  if (!currentTaskId.value) return;
  try {
    await confirmTask(currentTaskId.value, {
      skipInvalid: true,
      skipDuplicate: true,
    });
    step.value = 'processing';
    progress.value = 0;
    startProgressPolling();
    message.success('已开始执行导入');
  } catch (e: any) {
    message.error(e.message || '操作失败');
  }
}

// ============================================================
// 模板下载
// ============================================================
function handleDownloadTemplate() {
  downloadTemplate(props.importType)
    .then(() => {
      message.success('模板下载成功');
    })
    .catch((e) => {
      message.error(e.message || '下载失败');
    });
}

// ============================================================
// 完成
// ============================================================
function handleDone() {
  if (currentTaskId.value) {
    emit('success', currentTaskId.value);
  } else {
    emit('cancel');
  }
}

function formatFileSize(bytes: number): string {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const precheckColumns = [
  {
    title: '序号',
    dataIndex: 'seqNo',
    width: 60,
  },
  {
    title: '文件名',
    dataIndex: 'originalName',
    ellipsis: true,
  },
  {
    title: '大小',
    dataIndex: 'fileSize',
    width: 90,
    customRender: ({ record }: any) => formatFileSize(record.fileSize),
  },
  {
    title: '结果',
    dataIndex: 'precheckStatus',
    width: 100,
    customRender: ({ record }: any) => {
      const colorMap: Record<string, string> = {
        passed: 'success',
        failed: 'error',
        duplicate: 'warning',
      };
      const textMap: Record<string, string> = {
        passed: '通过',
        failed: '失败',
        duplicate: '重复',
      };
      return (
        <Tag color={colorMap[record.precheckStatus] || 'default'}>
          {textMap[record.precheckStatus] || record.precheckStatus}
        </Tag>
      );
    },
  },
  {
    title: '说明',
    dataIndex: 'precheckMessage',
    ellipsis: true,
    customRender: ({ record }: any) => (
      <Tooltip title={record.precheckMessage}>
        <span>{record.precheckMessage || '-'}</span>
      </Tooltip>
    ),
  },
];

watch(
  () => props.importType,
  () => {
    fileList.value = [];
    step.value = 'upload';
    currentTaskId.value = null;
    progress.value = 0;
    precheckResult.value = null;
  },
);
</script>

<template>
  <div class="batch-import-drawer">
    <!-- 步骤 1: 上传文件 -->
    <div v-if="step === 'upload'">
      <Descriptions :column="2" size="small" bordered style="margin-bottom: 16px">
        <DescriptionsItem label="目标模块">
          {{ moduleText }}
        </DescriptionsItem>
        <DescriptionsItem label="导入类型">
          {{ importTypeTextMap[importType] }}
        </DescriptionsItem>
      </Descriptions>

      <Alert
        message="批量导入说明"
        type="info"
        show-icon
        :banner="false"
        style="margin-bottom: 16px"
      >
        <template #description>
          <ul style="margin: 0; padding-left: 20px">
            <li>支持一次性上传最多 500 个文件</li>
            <li>单文件大小不超过 100MB</li>
            <li>系统将自动进行预检查，检测重复文件和无效文件</li>
            <li>预检查通过后需人工确认方可正式执行</li>
          </ul>
        </template>
      </Alert>

      <Card size="small" title="上传文件" :bordered="false">
        <Upload.Dragger
          v-model:file-list="fileList"
          :accept="acceptStr"
          :multiple="true"
          :max-count="500"
          :before-upload="uploadProps.beforeUpload"
          :show-upload-list="true"
          :custom-request="() => {}"
        >
          <p class="ant-upload-drag-icon">
            <IconifyIcon icon="lucide:upload-cloud" :size="48" style="color: #1890ff" />
          </p>
          <p class="ant-upload-text">点击或拖拽文件到此区域上传</p>
          <p class="ant-upload-hint">
            支持 {{ importTypeTextMap[importType] }} 文件，最多 500 个，单文件最大 100MB
          </p>
        </Upload.Dragger>

        <div style="margin-top: 16px; text-align: right">
          <Space>
            <Button @click="handleDownloadTemplate">
              <IconifyIcon icon="lucide:download" :size="16" style="margin-right: 4px" />
              下载模板
            </Button>
            <Button
              type="primary"
              :loading="uploading"
              :disabled="fileList.length === 0"
              @click="handleCreateTask"
            >
              <IconifyIcon icon="lucide:check" :size="16" style="margin-right: 4px" />
              开始预检查
            </Button>
          </Space>
        </div>
      </Card>
    </div>

    <!-- 步骤 2: 预检查中 -->
    <div v-if="step === 'prechecking'">
      <Card size="small" :bordered="false">
        <div style="text-align: center; padding: 40px 0">
          <IconifyIcon icon="lucide:loader" :size="64" class="spin-icon" style="color: #1890ff" />
          <p style="font-size: 18px; margin-top: 16px">正在预检查文件...</p>
          <p style="color: #999">正在检测文件类型、大小、重复文件</p>
          <Progress :percent="progress" style="margin-top: 20px" />
        </div>
      </Card>
    </div>

    <!-- 步骤 3: 预检查完成 -->
    <div v-if="step === 'prechecked' && precheckResult">
      <Alert
        :type="precheckResult.invalidCount > 0 ? 'warning' : 'success'"
        show-icon
        style="margin-bottom: 16px"
      >
        <template #message>
          预检查完成：通过 {{ precheckResult.validCount }} 个，
          失败 {{ precheckResult.invalidCount }} 个，
          重复 {{ precheckResult.dupCount }} 个
        </template>
        <template #description>
          默认将跳过无效文件和重复文件，仅导入预检查通过的文件
        </template>
      </Alert>

      <Card size="small" title="预检查明细" :bordered="false">
        <Table
          :columns="precheckColumns"
          :data-source="precheckResult.items"
          size="small"
          :pagination="{
            pageSize: 10,
            showSizeChanger: false,
            showTotal: (t) => `共 ${t} 条`,
          }"
          :scroll="{ y: 320 }"
        />

        <div style="margin-top: 16px; text-align: right">
          <Space>
            <Button @click="emit('cancel')">取消</Button>
            <Button type="primary" @click="handleConfirm">
              <IconifyIcon icon="lucide:play" :size="16" style="margin-right: 4px" />
              确认执行
            </Button>
          </Space>
        </div>
      </Card>
    </div>

    <!-- 步骤 4: 处理中 -->
    <div v-if="step === 'processing'">
      <Card size="small" :bordered="false">
        <div style="text-align: center; padding: 40px 0">
          <IconifyIcon icon="lucide:loader" :size="64" class="spin-icon" style="color: #52c41a" />
          <p style="font-size: 18px; margin-top: 16px">正在导入...</p>
          <p style="color: #999">请耐心等待，完成后将自动刷新</p>
          <Progress :percent="progress" status="active" style="margin-top: 20px" />
        </div>
      </Card>
    </div>

    <!-- 步骤 5: 完成 -->
    <div v-if="step === 'completed'">
      <Alert
        type="success"
        show-icon
        style="margin-bottom: 16px"
      >
        <template #message>
          导入完成
        </template>
        <template #description>
          任务已完成，您可以在任务列表中查看详细结果
        </template>
      </Alert>

      <Card size="small" :bordered="false">
        <Row :gutter="16">
          <Col :span="8">
            <Statistic
              title="总计"
              :value="precheckResult?.totalCount || 0"
            />
          </Col>
          <Col :span="8">
            <Statistic
              title="成功"
              :value="resultSummary?.successCount || 0"
              :value-style="{ color: '#52c41a' }"
            />
          </Col>
          <Col :span="8">
            <Statistic
              title="失败"
              :value="resultSummary?.failCount || 0"
              :value-style="{ color: '#ff4d4f' }"
            />
          </Col>
        </Row>

        <div style="margin-top: 20px; text-align: right">
          <Button type="primary" @click="handleDone">
            完成
          </Button>
        </div>
      </Card>
    </div>

    <div v-if="errorMessage && step !== 'completed' && step !== 'prechecked'">
      <Alert
        message="任务失败"
        :description="errorMessage"
        type="error"
        show-icon
        style="margin-top: 16px"
      />
    </div>
  </div>
</template>

<style scoped>
.batch-import-drawer {
  min-height: 400px;
}

.spin-icon {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>

<script lang="tsx">
import { Row, Col, Statistic } from 'ant-design-vue';

export default {
  components: { Row, Col, Statistic },
};
</script>
