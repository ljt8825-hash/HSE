<template>
  <Modal
    :open="visible"
    :title="`${moduleName} PDF 保单导入`"
    width="720px"
    :footer="null"
    @update:open="(v) => emit('update:visible', v)"
    @cancel="handleCancel"
  >
    <div v-if="currentStep === 'upload'" class="pdf-import-upload">
      <div class="import-tip">
        <p>支持上传 PDF 保单文件，系统自动识别前 5 页内容</p>
        <p>可识别信息：保单号、保险起期、保险止期、保险公司</p>
      </div>
      <Upload
        :file-list="fileList"
        :before-upload="handleUpload"
        :show-upload-list="false"
        accept=".pdf"
        :disabled="loading"
        class="pdf-import-upload-zone"
      >
        <div class="upload-placeholder">
          <IconifyIcon icon="lucide:file-up" class="upload-icon" />
          <p class="upload-text">
            <span v-if="loading">PDF 识别中...</span>
            <span v-else>点击或拖拽 PDF 保单到此处</span>
          </p>
          <p class="upload-hint">仅支持 .pdf 格式，建议文件大小不超过 10MB</p>
        </div>
      </Upload>
    </div>

    <div v-else-if="currentStep === 'result'" class="pdf-import-result">
      <div class="result-summary">
        <div class="summary-header">
          <span class="summary-title">识别结果</span>
          <Tag :color="confidenceColor">可信度 {{ result.confidence || 0 }}%</Tag>
        </div>
        <p class="summary-meta">
          文件：{{ result.fileName }} · 共 {{ result.totalPages }} 页 · 已读前 {{ result.pagesRead }} 页
        </p>
      </div>

      <Form layout="vertical" class="extract-form">
        <Row :gutter="16">
          <Col :span="12">
            <FormItem label="保单号">
              <Input v-model:value="extracted.policyNo" placeholder="未识别到保单号" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="保险公司">
              <Input v-model:value="extracted.insuranceCompany" placeholder="未识别到保险公司" />
            </FormItem>
          </Col>
        </Row>
        <Row :gutter="16">
          <Col :span="12">
            <FormItem label="保险起期">
              <DatePicker v-model:value="extracted.startDate" style="width: 100%" placeholder="未识别到起期" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="保险止期">
              <DatePicker v-model:value="extracted.expireDate" style="width: 100%" placeholder="未识别到止期" />
            </FormItem>
          </Col>
        </Row>

        <div v-if="result.textPreview" class="text-preview">
          <div class="preview-label">识别文本预览</div>
          <div class="preview-content">{{ result.textPreview }}</div>
        </div>
      </Form>

      <div class="result-actions">
        <Button @click="currentStep = 'upload'">重新上传</Button>
        <Button type="primary" @click="handleApply">确认并填入新增表单</Button>
      </div>
    </div>
  </Modal>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue';
import {
  Modal, Button, Upload, Form, FormItem, Input, DatePicker,
  Row, Col, Tag, message,
} from 'ant-design-vue';
import { IconifyIcon } from '@vben/icons';
import dayjs from 'dayjs';
import { importOtherInsurancePdf } from '#/api/hse/insurance';

const props = defineProps<{
  visible: boolean;
  moduleName: string;
}>();

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'apply', value: {
    policyNo: string;
    insuranceCompany: string;
    startDate: string | null;
    expireDate: string | null;
    fileName: string;
  }): void;
}>();

const loading = ref(false);
const currentStep = ref<'upload' | 'result'>('upload');
const fileList = ref<any[]>([]);
const result = ref<any>(null);

const extracted = reactive({
  policyNo: '',
  insuranceCompany: '',
  startDate: null as any,
  expireDate: null as any,
});

const confidenceColor = computed(() => {
  const c = result.value?.confidence || 0;
  if (c >= 75) return 'success';
  if (c >= 40) return 'warning';
  return 'error';
});

async function handleUpload(file: any) {
  const rawFile: File = (file.originFileObj || file) as File;
  if (!rawFile.name.toLowerCase().endsWith('.pdf')) {
    message.warning('请选择 PDF 文件');
    return false;
  }

  loading.value = true;
  try {
    const response = await importOtherInsurancePdf(rawFile);
    result.value = response;
    const data = response?.extracted || {};

    extracted.policyNo = data.policyNo || '';
    extracted.insuranceCompany = data.insuranceCompany || '';
    extracted.startDate = data.startDate ? dayjs(data.startDate) : null;
    extracted.expireDate = data.expireDate ? dayjs(data.expireDate) : null;

    currentStep.value = 'result';
    message.success('PDF 识别完成，请核对识别结果');
  } catch (err: any) {
    const errMsg = err?.message || err?.response?.data?.message || 'PDF 识别失败';
    console.error('PDF 识别失败:', err);
    message.error(errMsg);
  } finally {
    loading.value = false;
  }
  return false;
}

function handleApply() {
  emit('apply', {
    policyNo: extracted.policyNo,
    insuranceCompany: extracted.insuranceCompany,
    startDate: extracted.startDate ? dayjs(extracted.startDate).format('YYYY-MM-DD') : null,
    expireDate: extracted.expireDate ? dayjs(extracted.expireDate).format('YYYY-MM-DD') : null,
    fileName: result.value?.storedName || '',
  });
  handleCancel();
}

function handleCancel() {
  emit('update:visible', false);
  currentStep.value = 'upload';
  fileList.value = [];
  result.value = null;
  extracted.policyNo = '';
  extracted.insuranceCompany = '';
  extracted.startDate = null;
  extracted.expireDate = null;
}
</script>

<style scoped lang="scss">
.import-tip {
  padding: 12px 16px;
  background: hsl(var(--success) / 0.06);
  border: 1px solid hsl(var(--success) / 0.3);
  border-radius: 6px;
  margin-bottom: 16px;

  p {
    margin: 4px 0;
    font-size: 13px;
    color: hsl(var(--success));
  }
}

.pdf-import-upload-zone {
  .upload-placeholder {
    padding: 48px 20px;
    text-align: center;
    border: 2px dashed hsl(var(--border));
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.3s;

    &:hover {
      border-color: hsl(var(--primary));
      background: hsl(var(--primary) / 0.04);
    }
  }

  .upload-icon {
    font-size: 48px;
    color: hsl(var(--muted-foreground));
    margin-bottom: 12px;
  }

  .upload-text {
    font-size: 14px;
    color: hsl(var(--foreground));
    margin-bottom: 4px;
  }

  .upload-hint {
    font-size: 12px;
    color: hsl(var(--muted-foreground));
    margin: 0;
  }
}

.pdf-import-result {
  .result-summary {
    padding: 12px 16px;
    background: hsl(var(--muted));
    border-radius: 6px;
    margin-bottom: 16px;

    .summary-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }

    .summary-title {
      font-weight: 600;
      font-size: 14px;
    }

    .summary-meta {
      margin: 0;
      font-size: 12px;
      color: hsl(var(--foreground) / 0.65);
    }
  }

  .extract-form {
    margin-bottom: 16px;
  }

  .text-preview {
    margin-top: 8px;

    .preview-label {
      font-size: 12px;
      color: hsl(var(--muted-foreground));
      margin-bottom: 8px;
    }

    .preview-content {
      max-height: 120px;
      overflow-y: auto;
      padding: 12px;
      background: hsl(var(--muted) / 0.5);
      border-radius: 6px;
      font-size: 12px;
      line-height: 1.6;
      color: hsl(var(--foreground) / 0.85);
      white-space: pre-wrap;
      word-break: break-all;
    }
  }

  .result-actions {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    padding-top: 16px;
    border-top: 1px solid hsl(var(--border));
  }
}
</style>

<style lang="scss">
.pdf-import-upload-zone .ant-upload {
  display: block;
}
</style>
