<template>
  <a-drawer
    :open="visible"
    :title="$t('hse.documents.aiAnalysis.title')"
    width="640"
    @close="handleClose"
  >
    <template v-if="loading">
      <a-spin size="large" class="w-full flex justify-center py-20">
        <template #description>
          {{ $t('hse.documents.aiAnalysis.analyzing') }}
        </template>
      </a-spin>
    </template>

    <template v-else-if="analysis && analysis.status === 'failed'">
      <a-result status="error" :title="$t('hse.documents.aiAnalysis.failed')" :sub-title="analysis.errorMessage || ''">
        <template #extra>
          <a-space>
            <a-button type="primary" @click="handleRetry">
              <template #icon><IconifyIcon icon="lucide:refresh-cw" /></template>
              {{ $t('hse.documents.aiAnalysis.retry') }}
            </a-button>
            <a-button @click="handleClose">关闭</a-button>
          </a-space>
        </template>
      </a-result>
    </template>

    <template v-else-if="analysis && analysis.status === 'completed'">
      <div class="ai-analysis-content">
        <a-alert
          :type="basisAlertType"
          show-icon
          class="mb-4"
          :message="basisTitle"
          :description="basisDesc"
        />

        <a-row :gutter="16" class="mb-4">
          <a-col :span="12">
            <div class="score-card text-center p-4 rounded-lg border border-gray-200 dark:border-gray-700">
              <a-progress
                type="circle"
                :percent="analysis.aiScore || 0"
                :stroke-color="scoreColor"
                :width="100"
              />
              <div class="mt-2 text-sm text-gray-500">
                {{ $t('hse.documents.aiAnalysis.completenessScore') }}
              </div>
            </div>
          </a-col>
          <a-col :span="12">
            <div class="risk-card text-center p-4 rounded-lg border border-gray-200 dark:border-gray-700">
              <a-tag :color="riskColor" class="text-base px-4 py-1 mb-2">
                {{ riskText }}
              </a-tag>
              <div class="text-sm text-gray-500">
                {{ $t('hse.documents.aiAnalysis.riskLevel') }}
              </div>
              <div class="mt-3 text-xs text-gray-400">
                {{ $t('hse.documents.aiAnalysis.triggeredBy') }}：{{ analysis.triggeredBy || '-' }}
              </div>
              <div class="text-xs text-gray-400" v-if="analysis.completedAt">
                {{ formatDuration(analysis.triggeredAt, analysis.completedAt) }}
              </div>
            </div>
          </a-col>
        </a-row>

        <div v-if="analysis.aiSummary" class="mb-4">
          <h4 class="text-base font-medium mb-2 flex items-center gap-2">
            <IconifyIcon icon="lucide:file-text" class="w-4 h-4" />
            {{ $t('hse.documents.aiAnalysis.summary') }}
          </h4>
          <div class="summary-content p-3 bg-gray-50 dark:bg-gray-800 rounded text-sm whitespace-pre-wrap">
            {{ analysis.aiSummary }}
          </div>
        </div>

        <div v-if="analysis.aiMissingItems && analysis.aiMissingItems.length > 0" class="mb-4">
          <h4 class="text-base font-medium mb-2 flex items-center gap-2">
            <IconifyIcon icon="lucide:alert-triangle" class="w-4 h-4 text-amber-500" />
            {{ $t('hse.documents.aiAnalysis.missingItems') }}
            <a-tag color="orange" class="ml-1">{{ analysis.aiMissingItems.length }}</a-tag>
          </h4>
          <a-list size="small" :bordered="true" :data-source="analysis.aiMissingItems">
            <template #renderItem="{ item }">
              <a-list-item>
                <a-space class="w-full">
                  <a-tag :color="priorityColor(item.priority)">
                    {{ priorityText(item.priority) }}
                  </a-tag>
                  <span class="font-medium">{{ item.item }}</span>
                  <span class="text-gray-500 text-sm">{{ item.reason }}</span>
                </a-space>
              </a-list-item>
            </template>
          </a-list>
        </div>

        <div v-if="analysis.aiSuggestions && analysis.aiSuggestions.length > 0" class="mb-4">
          <h4 class="text-base font-medium mb-2 flex items-center gap-2">
            <IconifyIcon icon="lucide:lightbulb" class="w-4 h-4 text-yellow-500" />
            {{ $t('hse.documents.aiAnalysis.suggestions') }}
            <a-tag color="blue" class="ml-1">{{ analysis.aiSuggestions.length }}</a-tag>
          </h4>
          <a-list size="small" :bordered="true" :data-source="analysis.aiSuggestions">
            <template #renderItem="{ item, index }">
              <a-list-item>
                <div class="w-full">
                  <div class="flex items-center gap-2 mb-1">
                    <span class="text-gray-400 text-sm">{{ index + 1 }}.</span>
                    <span class="font-medium text-sm">{{ item.standard }}</span>
                    <a-tag :color="priorityColor(item.level)" class="ml-auto">
                      {{ priorityText(item.level) }}
                    </a-tag>
                  </div>
                  <div class="text-sm text-gray-600 dark:text-gray-300 pl-5">
                    {{ item.suggestion }}
                  </div>
                </div>
              </a-list-item>
            </template>
          </a-list>
        </div>

        <div v-if="analysis.aiKeywords && analysis.aiKeywords.length > 0" class="mb-4">
          <h4 class="text-base font-medium mb-2 flex items-center gap-2">
            <IconifyIcon icon="lucide:tag" class="w-4 h-4" />
            {{ $t('hse.documents.aiAnalysis.keywords') }}
          </h4>
          <div class="flex flex-wrap gap-2">
            <a-tag v-for="kw in analysis.aiKeywords" :key="kw" color="default">
              {{ kw }}
            </a-tag>
          </div>
        </div>

        <a-divider class="my-4" />

        <div class="disclaimer text-xs text-gray-400 text-center">
          {{ $t('hse.documents.aiAnalysis.disclaimer') }}
        </div>
      </div>
    </template>

    <template v-else>
      <a-empty :description="$t('hse.documents.aiAnalysis.noData')" />
    </template>

    <template #footer>
      <a-space>
        <a-button @click="handleRetry">
          <template #icon><IconifyIcon icon="lucide:refresh-cw" /></template>
          {{ $t('hse.documents.aiAnalysis.retry') }}
        </a-button>
        <a-button type="primary" @click="handleClose">
          关闭
        </a-button>
      </a-space>
    </template>
  </a-drawer>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { message } from 'ant-design-vue';
import { IconifyIcon } from '@vben/icons';
import { useI18n } from 'vue-i18n';
import {
  analyzeDocument,
  getDocumentAnalysis,
  retryDocumentAnalysis,
  type DocumentsApi,
} from '#/api/hse/documents';

const { t } = useI18n();

const props = defineProps<{
  visible: boolean;
  fileId: number;
}>();

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'refresh'): void;
}>();

const loading = ref(false);
const analyzing = ref(false);
const analysis = ref<DocumentsApi.DocumentAiAnalysis | null>(null);
let pollTimer: ReturnType<typeof setTimeout> | null = null;

async function loadAnalysis() {
  if (!props.fileId) return;
  loading.value = true;
  try {
    const data = await getDocumentAnalysis(props.fileId);
    analysis.value = data;
    if (data && (data.status === 'pending' || data.status === 'processing')) {
      startPolling();
    }
  } catch (err: any) {
    message.error(err.message || t('hse.common.loadFailed'));
  } finally {
    loading.value = false;
  }
}

async function handleAnalyze(customPrompt?: string) {
  if (!props.fileId) return;
  analyzing.value = true;
  try {
    await analyzeDocument(props.fileId, { customPrompt });
    message.success(t('hse.documents.aiAnalysis.taskCreated'));
    analyzing.value = false;
    startPolling();
  } catch (err: any) {
    analyzing.value = false;
    message.error(err.message || t('hse.documents.aiAnalysis.analyzeFailed'));
  }
}

async function handleRetry() {
  if (!analysis.value) return;
  analyzing.value = true;
  try {
    await retryDocumentAnalysis(props.fileId, analysis.value.id);
    message.success(t('hse.documents.aiAnalysis.taskCreated'));
    analyzing.value = false;
    startPolling();
  } catch (err: any) {
    analyzing.value = false;
    message.error(err.message || t('hse.documents.aiAnalysis.analyzeFailed'));
  }
}

function startPolling() {
  stopPolling();
  const poll = async () => {
    try {
      const data = await getDocumentAnalysis(props.fileId);
      analysis.value = data;
      if (data && (data.status === 'pending' || data.status === 'processing')) {
        pollTimer = setTimeout(poll, 2000);
      } else if (data && data.status === 'completed') {
        emit('refresh');
        message.success(t('hse.documents.aiAnalysis.completed'));
      }
    } catch {
      pollTimer = setTimeout(poll, 3000);
    }
  };
  poll();
}

function stopPolling() {
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
}

function handleClose() {
  stopPolling();
  emit('update:visible', false);
}

watch(
  () => props.visible,
  (val) => {
    if (val && props.fileId) {
      loadAnalysis();
    } else {
      stopPolling();
    }
  },
  { immediate: true },
);

const basisAlertType = computed(() => {
  const basis = analysis.value?.analysisBasis;
  if (basis === 'full_text') return 'success';
  if (basis === 'metadata_only') return 'warning';
  return 'error';
});

const basisTitle = computed(() => {
  const basis = analysis.value?.analysisBasis;
  if (basis === 'full_text') return t('hse.documents.aiAnalysis.basisFullText');
  if (basis === 'metadata_only') return t('hse.documents.aiAnalysis.basisMetadata');
  return t('hse.documents.aiAnalysis.basisFilename');
});

const basisDesc = computed(() => {
  const basis = analysis.value?.analysisBasis;
  const len = analysis.value?.extractTextLength || 0;
  if (basis === 'full_text') {
    return t('hse.documents.aiAnalysis.basisFullTextDesc', { len });
  }
  if (basis === 'metadata_only') {
    return t('hse.documents.aiAnalysis.basisMetadataDesc');
  }
  return t('hse.documents.aiAnalysis.basisFilenameDesc');
});

const scoreColor = computed(() => {
  const score = analysis.value?.aiScore || 0;
  if (score >= 80) return '#52c41a';
  if (score >= 60) return '#faad14';
  if (score >= 40) return '#fa8c16';
  return '#f5222d';
});

const riskColor = computed(() => {
  const level = analysis.value?.aiRiskLevel;
  if (level === 'critical') return 'red';
  if (level === 'high') return 'orange';
  if (level === 'medium') return 'gold';
  return 'green';
});

const riskText = computed(() => {
  const level = analysis.value?.aiRiskLevel;
  if (level === 'critical') return t('hse.documents.aiAnalysis.riskCritical');
  if (level === 'high') return t('hse.documents.aiAnalysis.riskHigh');
  if (level === 'medium') return t('hse.documents.aiAnalysis.riskMedium');
  return t('hse.documents.aiAnalysis.riskLow');
});

function priorityColor(priority: string) {
  if (priority === 'high') return 'red';
  if (priority === 'medium') return 'orange';
  return 'default';
}

function priorityText(priority: string) {
  if (priority === 'high') return '高';
  if (priority === 'medium') return '中';
  return '低';
}

function formatDuration(start: string, end: string) {
  const diff = new Date(end).getTime() - new Date(start).getTime();
  const seconds = Math.round(diff / 1000);
  return t('hse.documents.aiAnalysis.duration', { seconds });
}

defineExpose({
  handleAnalyze,
});
</script>

<style scoped>
.ai-analysis-content {
  padding-bottom: 20px;
}

.score-card,
.risk-card {
  min-height: 140px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
}

.summary-content {
  line-height: 1.6;
}
</style>
