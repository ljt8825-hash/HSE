<script setup lang="ts">
/**
 * 条款批量导入弹窗 - HSE V2 Sprint4 Phase 3
 *
 * 支持 JSON 文件导入：
 *   1. 用户选择 .json 文件
 *   2. 解析并预览前几条
 *   3. 调用 POST /api/hse/standard/import
 */
import { ref, watch } from 'vue';
import { message } from 'ant-design-vue';
import { IconifyIcon } from '@vben/icons';
import { importClauses, type StandardApi } from '../api';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{
  (e: 'update:open', val: boolean): void;
  (e: 'success'): void;
}>();

const submitting = ref(false);
const fileList = ref<any[]>([]);
const previewData = ref<StandardApi.ClauseFormData[]>([]);
const parseError = ref('');

watch(
  () => props.open,
  (val) => {
    if (!val) {
      resetForm();
    }
  },
);

function handleBeforeUpload(file: File) {
  parseError.value = '';
  previewData.value = [];
  fileList.value = [
    {
      uid: String(Date.now()),
      name: file.name,
      status: 'done',
      size: file.size,
    },
  ];
  // 读取并解析 JSON
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const content = e.target?.result as string;
      const parsed = JSON.parse(content);
      if (!Array.isArray(parsed)) {
        parseError.value = '文件内容必须是 JSON 数组';
        return;
      }
      previewData.value = parsed;
      message.success(`解析成功，共 ${parsed.length} 条条款`);
    } catch {
      parseError.value = 'JSON 格式错误，无法解析';
    }
  };
  reader.onerror = () => {
    parseError.value = '文件读取失败';
  };
  reader.readAsText(file);
  return false; // 阻止自动上传
}

function handleRemove() {
  fileList.value = [];
  previewData.value = [];
  parseError.value = '';
}

async function handleImport() {
  if (previewData.value.length === 0) {
    message.warning('请先选择有效的 JSON 文件');
    return;
  }

  submitting.value = true;
  try {
    const result = await importClauses(previewData.value);
    let msg = `导入完成：成功 ${result.success} 条`;
    if (result.failed > 0) {
      msg += `，失败 ${result.failed} 条`;
    }
    if (result.failed > 0) {
      message.warning(msg);
    } else {
      message.success(msg);
    }
    emit('update:open', false);
    emit('success');
  } catch {
    // 错误提示已由拦截器处理
  } finally {
    submitting.value = false;
  }
}

function handleCancel() {
  emit('update:open', false);
}

function handleDownloadTemplate() {
  const template = [
    {
      code: 'EXAMPLE-001',
      level: 1,
      elementName: '示例要素',
      clauseTitle: '',
      clauseContent: '条款要求内容示例',
      checkMethod: '检查方法示例',
      scoreWeight: 10,
      keywords: ['关键词1', '关键词2'],
      sortOrder: 1,
    },
  ];
  const blob = new Blob([JSON.stringify(template, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'standard_clauses_template.json';
  link.click();
  URL.revokeObjectURL(url);
}

function resetForm() {
  fileList.value = [];
  previewData.value = [];
  parseError.value = '';
}
</script>

<template>
  <a-modal
    :open="open"
    title="批量导入条款"
    :width="560"
    :confirm-loading="submitting"
    :mask-closable="false"
    ok-text="开始导入"
    cancel-text="取消"
    @ok="handleImport"
    @cancel="handleCancel"
  >
    <a-form layout="vertical">
      <a-form-item label="导入说明">
        <div class="text-sm text-gray-500">
          请上传 JSON 数组格式文件，每条条款需包含
          <span class="font-mono text-blue-500">code</span> 和
          <span class="font-mono text-blue-500">level</span> 字段。
          <a-button type="link" size="small" @click="handleDownloadTemplate">
            下载模板
          </a-button>
        </div>
      </a-form-item>

      <a-form-item label="选择文件" required>
        <a-upload-dragger
          :file-list="fileList"
          :before-upload="handleBeforeUpload"
          :max-count="1"
          :multiple="false"
          accept=".json"
          @remove="handleRemove"
        >
          <p class="ant-upload-drag-icon">
            <IconifyIcon
              icon="lucide:upload-cloud"
              class="text-4xl text-blue-500"
            />
          </p>
          <p class="ant-upload-text">点击或拖拽 JSON 文件到此处</p>
          <p class="ant-upload-hint text-gray-400">
            仅支持 .json 格式，编码重复的条款将自动跳过
          </p>
        </a-upload-dragger>
      </a-form-item>

      <a-form-item v-if="parseError" label="">
        <div class="text-sm text-red-500">
          <IconifyIcon icon="lucide:alert-circle" class="mr-1" />
          {{ parseError }}
        </div>
      </a-form-item>

      <a-form-item v-if="previewData.length > 0" label="预览">
        <div class="rounded border border-gray-200 p-3 text-sm">
          <div class="mb-2 text-gray-500">
            共 {{ previewData.length }} 条条款，前 5 条预览：
          </div>
          <div
            v-for="(item, idx) in previewData.slice(0, 5)"
            :key="idx"
            class="border-b border-gray-100 py-1 last:border-0"
          >
            <span class="font-mono text-blue-500">{{ item.code }}</span>
            <span class="ml-2 text-gray-600">
              {{ item.elementName || item.clauseTitle || '(无标题)' }}
            </span>
            <span class="ml-2 text-gray-400">L{{ item.level }}</span>
          </div>
        </div>
      </a-form-item>
    </a-form>
  </a-modal>
</template>
