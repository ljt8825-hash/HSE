<template>
  <Card :bordered="false" class="report-generator-card">
    <template #title>
      <div class="card-title">
        <IconifyIcon icon="lucide:file-spreadsheet" class="title-icon" />
        <span>{{ title }}</span>
      </div>
    </template>

    <a-form layout="inline" :model="form">
      <a-form-item label="报告周期">
        <a-date-picker
          v-model:value="form.period"
          :picker="pickerType"
          :placeholder="placeholder"
          format="YYYY-MM"
          style="width: 180px"
        />
      </a-form-item>

      <a-form-item label="AI 辅助">
        <a-switch v-model:checked="form.aiEnabled" checked-children="开" un-checked-children="关" />
      </a-form-item>

      <a-form-item>
        <a-button type="primary" :loading="generating" @click="handleGenerate">
          <IconifyIcon icon="lucide:sparkles" class="mr-1" />
          {{ generating ? '生成中...' : generateText }}
        </a-button>
      </a-form-item>
    </a-form>

    <a-progress
      v-if="generating"
      :percent="progress"
      :show-info="false"
      size="small"
      class="mt-3"
    />
    <div v-if="generating" class="progress-text text-xs text-gray-500 mt-1">
      {{ currentStep }}
    </div>
  </Card>
</template>

<script setup lang="ts">
import { ref, reactive, watch } from 'vue';
import { Card } from 'ant-design-vue';
import { IconifyIcon } from '@vben/icons';
import { message } from 'ant-design-vue';
import { generateReport, getReportStatus } from '#/api/hse/reports';
import type { ReportsApi } from '#/api/hse/reports';

const props = defineProps<{
  title: string;
  category: ReportsApi.TemplateCategory;
  pickerType?: 'month' | 'year';
  placeholder?: string;
  generateText?: string;
}>();

const emit = defineEmits<{
  (e: 'generated', reportId: number): void;
  (e: 'refresh'): void;
}>();

const form = reactive({
  period: null as any,
  aiEnabled: true,
});

const generating = ref(false);
const progress = ref(0);
const currentStep = ref('');
let pollTimer: any = null;

const pickerType = props.pickerType || 'month';
const placeholder = props.placeholder || '请选择月份';
const generateText = props.generateText || '生成报告';

async function handleGenerate() {
  if (!form.period) {
    message.warning('请选择报告周期');
    return;
  }

  const periodStr = form.period.format('YYYY-MM');
  generating.value = true;
  progress.value = 5;
  currentStep.value = '准备生成...';

  try {
    const result = await generateReport({
      templateCategory: props.category,
      reportPeriod: periodStr,
      aiEnabled: form.aiEnabled,
    });

    emit('generated', result.reportId);
    startPolling(result.reportId);
  } catch (err: any) {
    message.error(err.message || '生成失败');
    generating.value = false;
  }
}

function startPolling(reportId: number) {
  if (pollTimer) clearInterval(pollTimer);

  pollTimer = setInterval(async () => {
    try {
      const status = await getReportStatus(reportId);
      progress.value = status.progress;
      currentStep.value = status.currentStep;

      if (status.generationStatus === 'completed' || status.generationStatus === 'failed') {
        clearInterval(pollTimer);
        pollTimer = null;
        generating.value = false;

        if (status.generationStatus === 'completed') {
          message.success('报告生成完成');
        } else {
          message.error(status.errorMessage || '生成失败');
        }
        emit('refresh');
      }
    } catch {
      // ignore poll errors
    }
  }, 2000);
}

watch(() => form.period, () => {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
    generating.value = false;
    progress.value = 0;
  }
});
</script>

<style scoped>
.report-generator-card {
  margin-bottom: 16px;
}
.card-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}
.title-icon {
  color: #1890ff;
  font-size: 18px;
}
.progress-text {
  text-align: center;
}
.mr-1 {
  margin-right: 4px;
}
.text-xs {
  font-size: 12px;
}
.text-gray-500 {
  color: #8c8c8c;
}
.mt-1 {
  margin-top: 4px;
}
.mt-3 {
  margin-top: 12px;
}
</style>
