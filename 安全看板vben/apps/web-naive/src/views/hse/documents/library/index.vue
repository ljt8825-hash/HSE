<script lang="ts" setup>
/**
 * 文件库（web-naive）
 * 左侧分类树 + 右侧文件列表（HseDataGrid）
 * 支持搜索、筛选、上传、下载、删除
 */
import { computed, onMounted, reactive, ref } from 'vue';

import {
  NButton,
  NCard,
  NEmpty,
  NForm,
  NFormItem,
  NGi,
  NInput,
  NInputNumber,
  NModal,
  NPopconfirm,
  NSelect,
  NSpace,
  NSpin,
  NStatistic,
  NTag,
  NText,
  NTree,
  NUpload,
  type TreeOption,
  type UploadFileInfo,
} from 'naive-ui';
import { $t } from '#/locales';

import {
  HseActionBar,
  HseDataGrid,
  HsePageLayout,
  HseSearchPanel,
  HseSplitPane,
  HseStatusTag,
  type HseActionKey,
} from '#/components/hse';
import type { VxeTableGridColumns } from '#/adapter/vxe-table';
import {
  deleteDocument,
  downloadDocument,
  getCategoryTree,
  getDocumentList,
  getDocumentStats,
  getTagList,
  uploadDocument,
  type DocumentsApi,
} from '#/api/hse/documents';
import { message } from '#/adapter/naive';

defineOptions({ name: 'HseDocumentLibrary' });

// ===================== 映射 =====================
const FILE_TYPE_LABEL: Record<string, string> = {
  pdf: 'PDF',
  word: 'Word',
  excel: 'Excel',
  image: '图片',
  video: '视频',
  other: '其他',
};

const REVIEW_TAG: Record<string, 'success' | 'info' | 'warning' | 'danger' | 'neutral'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
};

const REVIEW_LABEL: Record<string, string> = {
  pending: '待审核',
  approved: '已通过',
  rejected: '已驳回',
};

const VALID_TAG: Record<string, 'success' | 'info' | 'warning' | 'danger' | 'neutral'> = {
  valid: 'success',
  expiring: 'warning',
  expired: 'danger',
  none: 'neutral',
};

const VALID_LABEL: Record<string, string> = {
  valid: '有效',
  expiring: '即将过期',
  expired: '已过期',
  none: '无有效期',
};

const RISK_COLOR_MAP: Record<string, 'success' | 'info' | 'warning' | 'danger' | 'neutral'> = {
  low: 'success',
  medium: 'warning',
  high: 'danger',
  critical: 'danger',
};

const RISK_TEXT_MAP: Record<string, string> = {
  low: '低风险',
  medium: '中风险',
  high: '高风险',
  critical: '严重',
};

const FILE_TYPE_OPTIONS = [
  { label: 'PDF', value: 'pdf' },
  { label: 'Word', value: 'word' },
  { label: 'Excel', value: 'excel' },
  { label: '图片', value: 'image' },
  { label: '视频', value: 'video' },
  { label: '其他', value: 'other' },
];

const REVIEW_OPTIONS = [
  { label: '待审核', value: 'pending' },
  { label: '已通过', value: 'approved' },
  { label: '已驳回', value: 'rejected' },
];

const VALID_OPTIONS = [
  { label: '有效', value: 'valid' },
  { label: '即将过期', value: 'expiring' },
  { label: '已过期', value: 'expired' },
  { label: '无有效期', value: 'none' },
];

// ===================== 统计 =====================
const stats = ref<DocumentsApi.DocumentStats>({
  total: 0,
  byReviewStatus: {},
  byFileType: {},
  byValidStatus: { valid: 0, expiring: 0, expired: 0, none: 0 },
});

async function loadStats() {
  try {
    stats.value = await getDocumentStats();
  } catch {
    // ignore
  }
}

// ===================== 分类树 =====================
const treeLoading = ref(false);
const categoryTree = ref<DocumentsApi.CategoryNode[]>([]);
const selectedCategoryId = ref<number | null>(null);

function toTreeOptions(nodes: DocumentsApi.CategoryNode[]): TreeOption[] {
  return nodes.map((n) => ({
    key: n.id,
    label: n.name,
    children: n.children?.length ? toTreeOptions(n.children) : undefined,
  }));
}

const treeOptions = computed(() => {
  const allOption: TreeOption = { key: 0, label: '全部分类' };
  return [allOption, ...toTreeOptions(categoryTree.value)];
});

// 上传弹窗分类下拉（扁平化分类树，缩进表达层级）
function flattenCategoryOptions(
  nodes: DocumentsApi.CategoryNode[],
  depth = 0,
): { label: string; value: number }[] {
  const out: { label: string; value: number }[] = [];
  nodes.forEach((n) => {
    out.push({ label: `${'　'.repeat(depth)}${n.name}`, value: n.id });
    if (n.children?.length) {
      out.push(...flattenCategoryOptions(n.children, depth + 1));
    }
  });
  return out;
}

const categoryOptions = computed(() => flattenCategoryOptions(categoryTree.value));

async function loadCategoryTree() {
  treeLoading.value = true;
  try {
    categoryTree.value = await getCategoryTree();
  } catch {
    categoryTree.value = [];
  } finally {
    treeLoading.value = false;
  }
}

function onCategorySelect(keys: (number | string)[]) {
  if (keys.length === 0 || keys[0] === 0) {
    selectedCategoryId.value = null;
  } else {
    selectedCategoryId.value = keys[0] as number;
  }
  currentPage.value = 1;
  loadList();
}

// ===================== 文件列表 =====================
const loading = ref(false);
const fileList = ref<DocumentsApi.DocumentFile[]>([]);
const total = ref(0);
const currentPage = ref(1);
const pageSize = ref(20);

const searchForm = reactive({
  keyword: '',
  fileType: '' as string,
  reviewStatus: '' as string,
  validStatus: '' as string,
});

async function loadList() {
  loading.value = true;
  try {
    const res = await getDocumentList({
      page: currentPage.value,
      pageSize: pageSize.value,
      keyword: searchForm.keyword || undefined,
      fileType: (searchForm.fileType || undefined) as DocumentsApi.FileType | undefined,
      reviewStatus: (searchForm.reviewStatus || undefined) as DocumentsApi.ReviewStatus | undefined,
      validStatus: (searchForm.validStatus || undefined) as DocumentsApi.ValidStatus | undefined,
      categoryId: selectedCategoryId.value ?? undefined,
    });
    fileList.value = res.list ?? [];
    total.value = res.total ?? 0;
  } catch {
    fileList.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
}

function onSearch() {
  currentPage.value = 1;
  loadList();
}

function onReset() {
  searchForm.keyword = '';
  searchForm.fileType = '';
  searchForm.reviewStatus = '';
  searchForm.validStatus = '';
  selectedCategoryId.value = null;
  onSearch();
}

function onPageChange(payload: { currentPage: number; pageSize: number }) {
  currentPage.value = payload.currentPage;
  pageSize.value = payload.pageSize;
  loadList();
}

async function onRefresh() {
  await Promise.all([loadList(), loadStats()]);
}

// ===================== 操作 =====================
const actionState = ref<Partial<Record<HseActionKey, { hidden?: boolean }>>>({
  downloadTemplate: { hidden: true },
  import: { hidden: true },
  export: { hidden: true },
});

async function handleDownload(row: DocumentsApi.DocumentFile) {
  try {
    const blob = await downloadDocument(row.id);
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = row.originalName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  } catch {
    message.error('下载失败');
  }
}

async function handleDelete(row: DocumentsApi.DocumentFile) {
  try {
    await deleteDocument(row.id);
    message.success('删除成功');
    onRefresh();
  } catch {
    // 拦截器已提示
  }
}

function handleAiAnalysis(row: DocumentsApi.DocumentFile) {
  message.info(`AI 分析功能：${row.originalName}（功能开发中）`);
}

// ===================== 上传弹窗 =====================
const uploadOpen = ref(false);
const uploading = ref(false);
const uploadForm = reactive({
  file: null as File | null,
  categoryId: null as number | null,
  tagIds: [] as number[],
  remindDays: 30,
  summary: '',
  validStartDate: '',
  validEndDate: '',
});

const tagOptions = ref<{ label: string; value: number }[]>([]);

async function loadTagOptions() {
  try {
    const tags = await getTagList();
    tagOptions.value = (tags || []).map((t) => ({ label: t.name, value: t.id }));
  } catch {
    tagOptions.value = [];
  }
}

function openUpload() {
  uploadForm.file = null;
  uploadForm.categoryId = null;
  uploadForm.tagIds = [];
  uploadForm.remindDays = 30;
  uploadForm.summary = '';
  uploadForm.validStartDate = '';
  uploadForm.validEndDate = '';
  loadTagOptions();
  uploadOpen.value = true;
}

function handleFileSelect(options: { fileList: UploadFileInfo[] }) {
  const fileInfo = options.fileList[0];
  if (fileInfo?.file) {
    uploadForm.file = fileInfo.file;
  }
}

async function handleUploadSubmit() {
  if (!uploadForm.file) {
    message.warning('请选择要上传的文件');
    return;
  }
  uploading.value = true;
  try {
    await uploadDocument(uploadForm.file, {
      categoryId: uploadForm.categoryId ?? undefined,
      summary: uploadForm.summary || undefined,
      remindDays: uploadForm.remindDays,
      validStartDate: uploadForm.validStartDate || undefined,
      validEndDate: uploadForm.validEndDate || undefined,
    });
    message.success('上传成功');
    uploadOpen.value = false;
    onRefresh();
  } catch {
    // 拦截器已提示
  } finally {
    uploading.value = false;
  }
}

// ===================== 表格列 =====================
const columns = computed<VxeTableGridColumns>(() => [
  { title: '文件名', field: 'originalName', minWidth: 240, align: 'left', showOverflow: 'tooltip' },
  { title: '类型', field: 'fileType', width: 90, align: 'center', slots: { default: 'fileType' } },
  { title: '审核状态', field: 'reviewStatus', width: 100, align: 'center', slots: { default: 'reviewStatus' } },
  { title: '有效期状态', field: 'validStatus', width: 110, align: 'center', slots: { default: 'validStatus' } },
  {
    title: 'AI评分',
    field: 'aiScore',
    width: 110,
    align: 'center',
    slots: { default: 'aiScore' },
  },
  {
    title: '风险等级',
    field: 'riskLevel',
    width: 100,
    align: 'center',
    slots: { default: 'riskLevel' },
  },
  { title: '上传时间', field: 'uploadedAt', width: 170, align: 'center' },
  {
    title: '操作',
    field: 'action',
    width: 200,
    align: 'center',
    fixed: 'right',
    slots: { default: 'action' },
  },
]);

onMounted(() => {
  loadStats();
  loadCategoryTree();
  loadList();
});
</script>

<template>
  <HsePageLayout
    :description="$t('page.hse.documentLibraryDesc')"
    :title="$t('page.hse.documentLibrary')"
  >
    <template #extra>
      <HseActionBar
        :actions="actionState"
        @refresh="onRefresh"
        @create="openUpload"
      />
    </template>

    <!-- 统计卡 -->
    <div class="mb-4 grid grid-cols-4 gap-3">
      <NCard :bordered="false">
        <NStatistic label="文件总数" :value="stats.total" suffix="份" />
      </NCard>
      <NCard :bordered="false">
        <NStatistic label="待审核" :value="stats.byReviewStatus?.pending || 0" suffix="份" />
      </NCard>
      <NCard :bordered="false">
        <NStatistic label="已通过" :value="stats.byReviewStatus?.approved || 0" suffix="份" />
      </NCard>
      <NCard :bordered="false">
        <NStatistic label="即将过期" :value="stats.byValidStatus?.expiring || 0" suffix="份" />
      </NCard>
    </div>

    <HseSplitPane
      title="文件分类"
      storage-key="hse-documents-split-width"
      :default-width="240"
      class="doc-split"
    >
      <template #left>
        <div class="category-panel">
          <NSpin :show="treeLoading">
            <NEmpty v-if="categoryTree.length === 0 && !treeLoading" description="暂无分类" class="py-6" />
            <NTree
              v-else
              :data="treeOptions"
              :selected-keys="selectedCategoryId !== null ? [selectedCategoryId] : [0]"
              :default-expand-all="true"
              selectable
              block-line
              @update:selected-keys="onCategorySelect"
            />
          </NSpin>
        </div>
      </template>

      <template #right>
        <!-- 搜索 -->
        <HseSearchPanel @query="onSearch" @reset="onReset">
          <NGi>
            <NInput
              v-model:value="searchForm.keyword"
              placeholder="搜索文件名或摘要"
              clearable
              @keyup.enter="onSearch"
            />
          </NGi>
          <NGi>
            <NSelect
              v-model:value="searchForm.fileType"
              placeholder="文件类型"
              clearable
              :options="FILE_TYPE_OPTIONS"
            />
          </NGi>
          <NGi>
            <NSelect
              v-model:value="searchForm.reviewStatus"
              placeholder="审核状态"
              clearable
              :options="REVIEW_OPTIONS"
            />
          </NGi>
          <NGi>
            <NSelect
              v-model:value="searchForm.validStatus"
              placeholder="有效期状态"
              clearable
              :options="VALID_OPTIONS"
            />
          </NGi>
        </HseSearchPanel>

        <!-- 表格 -->
        <HseDataGrid
          :columns="columns"
          :data="fileList"
          :loading="loading"
          :pager="true"
          :total="total"
          @page-change="onPageChange"
        >
          <template #fileType="{ row }">
            <NText>{{ FILE_TYPE_LABEL[row.fileType] || row.fileType || '-' }}</NText>
          </template>
          <template #reviewStatus="{ row }">
            <HseStatusTag :type="REVIEW_TAG[row.reviewStatus] || 'neutral'">
              {{ REVIEW_LABEL[row.reviewStatus] || row.reviewStatus || '-' }}
            </HseStatusTag>
          </template>
          <template #validStatus="{ row }">
            <HseStatusTag :type="VALID_TAG[row.validStatus] || 'neutral'">
              {{ VALID_LABEL[row.validStatus] || '-' }}
            </HseStatusTag>
          </template>
          <template #aiScore="{ row }">
            <template v-if="row.analysisStatus === 'completed' && row.aiScore != null">
              <NTag :type="row.aiScore >= 60 ? 'success' : 'warning'" :bordered="false" size="small">
                {{ row.aiScore }}分
              </NTag>
            </template>
            <template v-else-if="row.analysisStatus === 'processing'">
              <NTag type="info" :bordered="false" size="small">分析中</NTag>
            </template>
            <template v-else>
              <NText depth="3" class="text-sm">-</NText>
            </template>
          </template>
          <template #riskLevel="{ row }">
            <HseStatusTag v-if="row.riskLevel" :type="RISK_COLOR_MAP[row.riskLevel] || 'neutral'">
              {{ RISK_TEXT_MAP[row.riskLevel] || row.riskLevel }}
            </HseStatusTag>
            <NText v-else depth="3" class="text-sm">-</NText>
          </template>
          <template #action="{ row }">
            <NSpace justify="center">
              <NButton size="small" type="primary" quaternary @click="handleDownload(row)">下载</NButton>
              <NButton size="small" type="primary" quaternary @click="handleAiAnalysis(row)">AI分析</NButton>
              <NPopconfirm @positive-click="handleDelete(row)">
                <template #trigger>
                  <NButton size="small" type="error" quaternary>删除</NButton>
                </template>
                确定删除该文件吗？
              </NPopconfirm>
            </NSpace>
          </template>
        </HseDataGrid>
      </template>
    </HseSplitPane>

    <!-- 上传弹窗 -->
    <NModal
      v-model:show="uploadOpen"
      title="上传文件"
      preset="card"
      style="width: 520px; max-width: 92vw"
      :mask-closable="false"
    >
      <NForm label-placement="top">
        <NFormItem label="选择文件" required>
          <NUpload
            :max="1"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.mp4,.avi"
            :custom-request="() => {}"
            @change="handleFileSelect"
          >
            <NButton>选择文件</NButton>
            <div v-if="uploadForm.file" class="mt-2 text-sm">
              已选择: {{ uploadForm.file.name }} ({{ (uploadForm.file.size / 1024).toFixed(1) }} KB)
            </div>
          </NUpload>
        </NFormItem>
        <NFormItem label="文件分类">
          <NSelect
            v-model:value="uploadForm.categoryId"
            :options="categoryOptions"
            placeholder="请选择分类（选填）"
            clearable
          />
        </NFormItem>
        <NFormItem label="标签">
          <NSelect
            v-model:value="uploadForm.tagIds"
            multiple
            :options="tagOptions"
            placeholder="选择标签（选填）"
            clearable
          />
        </NFormItem>
        <div class="grid grid-cols-2 gap-x-4">
          <NFormItem label="到期提醒天数">
            <NInputNumber v-model:value="uploadForm.remindDays" :min="0" :max="365" class="w-full" />
          </NFormItem>
          <NFormItem label="有效期开始">
            <NInput v-model:value="uploadForm.validStartDate" placeholder="YYYY-MM-DD" />
          </NFormItem>
          <NFormItem label="有效期结束">
            <NInput v-model:value="uploadForm.validEndDate" placeholder="YYYY-MM-DD" />
          </NFormItem>
        </div>
        <NFormItem label="摘要">
          <NInput v-model:value="uploadForm.summary" type="textarea" :rows="2" placeholder="文件摘要（选填）" />
        </NFormItem>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="uploadOpen = false">取消</NButton>
          <NButton type="primary" :loading="uploading" @click="handleUploadSubmit">上传</NButton>
        </NSpace>
      </template>
    </NModal>
  </HsePageLayout>
</template>

<style scoped>
.doc-split {
  height: calc(100vh - 280px);
  min-height: 400px;
}

.category-panel {
  padding: 4px 8px;
  height: 100%;
  overflow: auto;
}
</style>
