<!--
  文件上传弹窗组件 - HSE V2.0 Sprint 1
  说明: 页面内组件（非公共组件），仅文件库页面使用
  复用: Ant Design Vue 的 a-modal / a-upload-dragger / a-tree-select / a-range-picker
-->
<template>
  <a-modal
    :open="open"
    title="上传安全资料"
    :width="560"
    :confirm-loading="uploading"
    :mask-closable="false"
    ok-text="上传"
    cancel-text="取消"
    @ok="handleUpload"
    @cancel="handleCancel"
  >
    <a-form layout="vertical" :model="form">
      <!-- 文件拖拽上传区 -->
      <a-form-item label="选择文件" required>
        <a-upload-dragger
          :file-list="fileList"
          :before-upload="handleBeforeUpload"
          :max-count="1"
          :multiple="false"
          accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.webp"
          @remove="handleRemove"
        >
          <p class="ant-upload-drag-icon">
            <IconifyIcon icon="lucide:upload-cloud" class="text-4xl text-blue-500" />
          </p>
          <p class="ant-upload-text">点击或拖拽文件到此处上传</p>
          <p class="ant-upload-hint text-gray-400">
            支持 PDF / Word / Excel / 图片，单文件最大 50MB
          </p>
        </a-upload-dragger>
      </a-form-item>

      <!-- 分类选择 -->
      <a-form-item label="文件分类">
        <a-tree-select
          v-model:value="form.categoryId"
          :tree-data="categoryTreeData"
          placeholder="请选择文件分类（可选）"
          allow-clear
          tree-default-expand-all
          :field-names="{ label: 'name', value: 'id', children: 'children' }"
        />
      </a-form-item>

      <!-- 标签输入 -->
      <a-form-item label="标签">
        <a-select
          v-model:value="form.tagIds"
          mode="multiple"
          placeholder="选择或输入标签（可选）"
          :options="tagOptions"
          :field-names="{ label: 'name', value: 'id' }"
          allow-clear
        />
      </a-form-item>

      <!-- 有效期 -->
      <a-form-item label="有效期">
        <a-range-picker
          v-model:value="dateRange"
          format="YYYY-MM-DD"
          style="width: 100%"
          :placeholder="['开始日期', '结束日期']"
        />
      </a-form-item>

      <!-- 提醒天数 -->
      <a-form-item label="到期提醒天数">
        <a-input-number
          v-model:value="form.remindDays"
          :min="1"
          :max="365"
          :default-value="30"
          addon-after="天"
          style="width: 100%"
        />
        <span class="text-xs text-gray-400">到期前 N 天开始提醒</span>
      </a-form-item>

      <!-- 备注 -->
      <a-form-item label="备注">
        <a-textarea
          v-model:value="form.summary"
          :rows="2"
          placeholder="文件说明（可选）"
          :maxlength="200"
          show-count
        />
      </a-form-item>
    </a-form>
  </a-modal>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { message } from 'ant-design-vue';
import { IconifyIcon } from '@vben/icons';
import { type Dayjs } from 'dayjs';
import {
  uploadDocument,
  getCategoryTree,
  getTagList,
  type DocumentsApi,
} from '#/api/hse/documents';

// Props
const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{
  (e: 'update:open', val: boolean): void;
  (e: 'success'): void;
}>();

// 上传状态
const uploading = ref(false);
const fileList = ref<any[]>([]);
const selectedFile = ref<File | null>(null);

// 表单数据
const form = ref<{
  categoryId?: number;
  tagIds?: number[];
  remindDays: number;
  summary?: string;
}>({
  categoryId: undefined,
  tagIds: [],
  remindDays: 30,
  summary: '',
});

// 有效期日期范围
const dateRange = ref<[Dayjs, Dayjs] | null>(null);

// 分类树和标签数据
const categoryTree = ref<DocumentsApi.CategoryNode[]>([]);
const tagList = ref<DocumentsApi.Tag[]>([]);

// 分类树数据（适配 a-tree-select）
const categoryTreeData = computed(() => categoryTree.value);

// 标签选项
const tagOptions = computed(() =>
  tagList.value.map((t) => ({ id: t.id, name: t.name })),
);

// 弹窗打开时加载分类和标签
watch(
  () => props.open,
  async (val) => {
    if (val) {
      try {
        const [cats, tags] = await Promise.all([getCategoryTree(), getTagList()]);
        categoryTree.value = cats;
        tagList.value = tags;
      } catch {
        // 忽略加载失败
      }
    }
  },
);

// 文件选择前校验
function handleBeforeUpload(file: File) {
  selectedFile.value = file;
  fileList.value = [
    {
      uid: (file as any).uid || String(Date.now()),
      name: file.name,
      status: 'done',
      size: file.size,
    },
  ];
  return false; // 阻止自动上传，手动控制
}

// 移除文件
function handleRemove() {
  selectedFile.value = null;
  fileList.value = [];
  return true;
}

// 执行上传
async function handleUpload() {
  if (!selectedFile.value) {
    message.warning('请先选择要上传的文件');
    return;
  }

  uploading.value = true;
  try {
    const extra: DocumentsApi.UploadExtra = {
      categoryId: form.value.categoryId,
      summary: form.value.summary,
      remindDays: form.value.remindDays,
    };
    if (dateRange.value && dateRange.value.length === 2) {
      extra.validStartDate = dateRange.value[0]!.format('YYYY-MM-DD');
      extra.validEndDate = dateRange.value[1]!.format('YYYY-MM-DD');
    }

    await uploadDocument(selectedFile.value, extra);
    message.success('文件上传成功');
    resetForm();
    emit('update:open', false);
    emit('success');
  } catch (err: any) {
    message.error(err?.message || '文件上传失败');
  } finally {
    uploading.value = false;
  }
}

// 取消
function handleCancel() {
  resetForm();
  emit('update:open', false);
}

// 重置表单
function resetForm() {
  selectedFile.value = null;
  fileList.value = [];
  form.value = {
    categoryId: undefined,
    tagIds: [],
    remindDays: 30,
    summary: '',
  };
  dateRange.value = null;
}
</script>
