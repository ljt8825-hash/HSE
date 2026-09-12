<template>
  <a-drawer
    :open="visible"
    :title="report?.reportName || '报告详情'"
    width="900px"
    :mask-closable="false"
    @close="$emit('close')"
  >
    <div v-if="loading" class="text-center py-20">
      <a-spin tip="加载中..." />
    </div>

    <div v-else-if="report" class="report-viewer">
      <div class="status-bar mb-4">
        <a-space>
          <a-tag :color="genStatusColor">{{ genStatusText }}</a-tag>
          <a-tag v-if="report.aiStatus !== 'none'" :color="aiStatusColor">
            AI: {{ aiStatusText }}
          </a-tag>
          <a-tag :color="confirmStatusColor">{{ confirmStatusText }}</a-tag>
          <span class="text-sm text-gray-500">生成时间：{{ formatDate(report.createdAt) }}</span>
        </a-space>
      </div>

      <div v-if="report.aiSummary" class="ai-notice mb-4">
        <a-alert type="warning" show-icon>
          <template #message>AI 辅助生成提示</template>
          <template #description>
            本报告部分内容由 AI 辅助生成，仅供参考，请以实际数据为准。
            <a-button type="link" size="small" @click="showSource = !showSource">
              {{ showSource ? '隐藏' : '查看' }}数据来源
            </a-button>
          </template>
        </a-alert>

        <div v-if="showSource" class="source-panel mt-3">
          <a-descriptions size="small" bordered :column="2">
            <a-descriptions-item label="事件总数">
              {{ report.sourceDataRef?.eventCount ?? 0 }}
            </a-descriptions-item>
            <a-descriptions-item label="隐患数">
              {{ report.sourceDataRef?.hazardCount ?? 0 }}
            </a-descriptions-item>
            <a-descriptions-item label="事故数">
              {{ report.sourceDataRef?.accidentCount ?? 0 }}
            </a-descriptions-item>
            <a-descriptions-item label="任务完成率">
              {{ report.sourceDataRef?.taskCompletionRate ?? 0 }}%
            </a-descriptions-item>
          </a-descriptions>
          <div v-if="report.sourceDataRef?.referencedDocuments?.length" class="mt-3">
            <div class="text-sm font-medium mb-2">引用制度文件：</div>
            <ul>
              <li v-for="doc in report.sourceDataRef.referencedDocuments" :key="doc.fileId">
                {{ doc.fileName }}
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div class="report-html-container">
        <iframe
          :srcdoc="report.reportHtml"
          class="report-iframe"
          frameborder="0"
        ></iframe>
      </div>
    </div>

    <template #footer>
      <a-space>
        <a-button @click="$emit('close')">关闭</a-button>
        <a-dropdown>
          <a-button>
            <IconifyIcon icon="lucide:download" class="mr-1" />
            导出
            <IconifyIcon icon="lucide:chevron-down" class="inline" />
          </a-button>
          <template #overlay>
            <a-menu>
              <a-menu-item key="html" @click="handleExportHtml">
                <IconifyIcon icon="lucide:file-text" class="mr-1" /> HTML 打印
              </a-menu-item>
              <a-menu-item key="word" @click="handleExportWord">
                <IconifyIcon icon="lucide:file-type-docx" class="mr-1" /> Word 文档
              </a-menu-item>
            </a-menu>
          </template>
        </a-dropdown>
        <a-button v-if="report?.confirmStatus !== 'confirmed'" type="primary" @click="handleConfirm">
          确认发布
        </a-button>
      </a-space>
    </template>
  </a-drawer>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { message, Modal } from 'ant-design-vue';
import { IconifyIcon } from '@vben/icons';
import { getReportDetail, confirmReport, exportReportHtml, exportReportWord } from '#/api/hse/reports';
import type { ReportsApi } from '#/api/hse/reports';
import dayjs from 'dayjs';

const props = defineProps<{
  visible: boolean;
  reportId: number | null;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'refresh'): void;
}>();

const loading = ref(false);
const report = ref<ReportsApi.ReportDetail | null>(null);
const showSource = ref(false);

const genStatusColor = computed(() => {
  const map: Record<string, string> = {
    completed: 'green',
    failed: 'red',
    pending: 'default',
    collecting: 'processing',
    ai_generating: 'processing',
  };
  return map[report.value?.generationStatus || ''] || 'default';
});

const genStatusText = computed(() => {
  const map: Record<string, string> = {
    completed: '已完成',
    failed: '生成失败',
    pending: '等待生成',
    collecting: '数据采集中',
    ai_generating: 'AI 生成中',
  };
  return map[report.value?.generationStatus || ''] || '未知';
});

const aiStatusColor = computed(() => {
  const map: Record<string, string> = {
    completed: 'green',
    failed: 'red',
    processing: 'blue',
    pending: 'default',
    none: 'default',
  };
  return map[report.value?.aiStatus || ''] || 'default';
});

const aiStatusText = computed(() => {
  const map: Record<string, string> = {
    completed: '已完成',
    failed: '失败',
    processing: '处理中',
    pending: '等待中',
    none: '未启用',
  };
  return map[report.value?.aiStatus || ''] || '未知';
});

const confirmStatusColor = computed(() => {
  const map: Record<string, string> = {
    confirmed: 'green',
    rejected: 'red',
    unconfirmed: 'orange',
  };
  return map[report.value?.confirmStatus || ''] || 'default';
});

const confirmStatusText = computed(() => {
  const map: Record<string, string> = {
    confirmed: '已确认',
    rejected: '已驳回',
    unconfirmed: '待确认',
  };
  return map[report.value?.confirmStatus || ''] || '未知';
});

function formatDate(date: string) {
  return dayjs(date).format('YYYY-MM-DD HH:mm');
}

async function loadDetail() {
  if (!props.reportId) return;
  loading.value = true;
  try {
    report.value = await getReportDetail(props.reportId);
  } catch (err: any) {
    message.error(err.message || '加载失败');
  } finally {
    loading.value = false;
  }
}

function handleExportHtml() {
  if (!props.reportId) return;
  const url = exportReportHtml(props.reportId);
  window.open(url, '_blank');
}

function handleExportWord() {
  if (!props.reportId) return;
  const url = exportReportWord(props.reportId);
  window.location.href = url;
}

function handleConfirm() {
  Modal.confirm({
    title: '确认发布',
    content: '确认发布此报告吗？发布后将标记为已确认状态。',
    okText: '确认发布',
    cancelText: '取消',
    onOk: async () => {
      if (!props.reportId) return;
      await confirmReport(props.reportId, 'confirmed');
      message.success('确认发布成功');
      emit('refresh');
      loadDetail();
    },
  });
}

watch(() => props.visible, (val) => {
  if (val && props.reportId) {
    loadDetail();
  }
});
</script>

<style scoped>
.report-viewer {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.status-bar {
  flex-shrink: 0;
}
.report-html-container {
  flex: 1;
  min-height: 400px;
  border: 1px solid #f0f0f0;
  border-radius: 4px;
  overflow: hidden;
}
.report-iframe {
  width: 100%;
  height: 500px;
}
.source-panel {
  padding: 12px;
  background: hsl(var(--muted));
  border-radius: 4px;
}
.mb-4 {
  margin-bottom: 16px;
}
.mt-3 {
  margin-top: 12px;
}
.mt-2 {
  margin-top: 8px;
}
.text-sm {
  font-size: 13px;
}
.text-gray-500 {
  color: #8c8c8c;
}
.text-center {
  text-align: center;
}
.py-20 {
  padding: 80px 0;
}
.inline {
  display: inline-block;
  vertical-align: middle;
}
.mr-1 {
  margin-right: 4px;
}
.font-medium {
  font-weight: 500;
}
.mb-2 {
  margin-bottom: 8px;
}
ul {
  margin: 4px 0;
  padding-left: 20px;
}
</style>
