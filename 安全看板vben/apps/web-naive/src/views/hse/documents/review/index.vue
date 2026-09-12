<script lang="ts" setup>
/**
 * 文件审核（web-naive）
 * 列表展示待审核/已通过/已驳回文件，支持通过/驳回操作
 */
import { computed, onMounted, reactive, ref } from 'vue';

import {
  NButton,
  NCard,
  NForm,
  NFormItem,
  NGi,
  NInput,
  NModal,
  NSpace,
  NSelect,
  NStatistic,
  NText,
} from 'naive-ui';
import { $t } from '#/locales';

import {
  HseActionBar,
  HseDataGrid,
  HsePageLayout,
  HseSearchPanel,
  HseStatusTag,
  type HseActionKey,
} from '#/components/hse';
import type { VxeTableGridColumns } from '#/adapter/vxe-table';
import {
  getDocumentDetail,
  getDocumentList,
  getDocumentStats,
  reviewDocument,
  type DocumentsApi,
} from '#/api/hse/documents';
import { message } from '#/adapter/naive';

defineOptions({ name: 'HseDocumentReview' });

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

const REVIEW_OPTIONS = [
  { label: '待审核', value: 'pending' },
  { label: '已通过', value: 'approved' },
  { label: '已驳回', value: 'rejected' },
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

// ===================== 文件列表 =====================
const loading = ref(false);
const fileList = ref<DocumentsApi.DocumentFile[]>([]);
const total = ref(0);
const currentPage = ref(1);
const pageSize = ref(20);

const searchForm = reactive({
  keyword: '',
  reviewStatus: 'pending' as string,
});

async function loadList() {
  loading.value = true;
  try {
    const res = await getDocumentList({
      page: currentPage.value,
      pageSize: pageSize.value,
      keyword: searchForm.keyword || undefined,
      reviewStatus: (searchForm.reviewStatus || undefined) as DocumentsApi.ReviewStatus | undefined,
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
  searchForm.reviewStatus = 'pending';
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

// ===================== 操作栏 =====================
const actionState = ref<Partial<Record<HseActionKey, { hidden?: boolean }>>>({
  downloadTemplate: { hidden: true },
  import: { hidden: true },
  export: { hidden: true },
  create: { hidden: true },
});

// ===================== 审核弹窗 =====================
const reviewModalOpen = ref(false);
const reviewing = ref(false);
const reviewTarget = ref<DocumentsApi.DocumentFile | null>(null);
const reviewAction = ref<'approved' | 'rejected'>('approved');
const reviewComment = ref('');

function openReviewModal(row: DocumentsApi.DocumentFile, action: 'approved' | 'rejected') {
  reviewTarget.value = row;
  reviewAction.value = action;
  reviewComment.value = '';
  reviewModalOpen.value = true;
}

async function confirmReview() {
  if (!reviewTarget.value) return;
  if (reviewAction.value === 'rejected' && !reviewComment.value.trim()) {
    message.warning('驳回请填写原因');
    return;
  }
  reviewing.value = true;
  try {
    await reviewDocument(reviewTarget.value.id, {
      reviewStatus: reviewAction.value,
      reviewComment: reviewComment.value,
    });
    message.success(reviewAction.value === 'approved' ? '审核通过' : '已驳回');
    reviewModalOpen.value = false;
    onRefresh();
  } catch {
    // 拦截器已提示
  } finally {
    reviewing.value = false;
  }
}

// ===================== 详情抽屉 =====================
const detailOpen = ref(false);
const detailData = ref<DocumentsApi.DocumentFile | null>(null);
const detailLoading = ref(false);

async function handleDetail(row: DocumentsApi.DocumentFile) {
  detailOpen.value = true;
  detailLoading.value = true;
  try {
    detailData.value = await getDocumentDetail(row.id);
  } catch {
    detailData.value = row;
  } finally {
    detailLoading.value = false;
  }
}

// ===================== 表格列 =====================
const columns = computed<VxeTableGridColumns>(() => [
  { title: '文件名', field: 'originalName', minWidth: 240, align: 'left', showOverflow: 'tooltip' },
  { title: '类型', field: 'fileType', width: 90, align: 'center', slots: { default: 'fileType' } },
  { title: '分类', field: 'categoryName', width: 120, align: 'center' },
  { title: '上传人', field: 'uploadedBy', width: 100, align: 'center' },
  { title: '上传时间', field: 'uploadedAt', width: 170, align: 'center' },
  { title: '有效期状态', field: 'validStatus', width: 110, align: 'center', slots: { default: 'validStatus' } },
  { title: '审核状态', field: 'reviewStatus', width: 100, align: 'center', slots: { default: 'reviewStatus' } },
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
  loadList();
});
</script>

<template>
  <HsePageLayout
    :description="$t('page.hse.documentReviewDesc')"
    :title="$t('page.hse.documentReview')"
  >
    <template #extra>
      <HseActionBar
        :actions="actionState"
        @refresh="onRefresh"
      />
    </template>

    <!-- 统计卡 -->
    <div class="mb-4 grid grid-cols-4 gap-3">
      <NCard :bordered="false">
        <NStatistic label="待审核" :value="stats.byReviewStatus?.pending || 0" suffix="份" />
      </NCard>
      <NCard :bordered="false">
        <NStatistic label="已通过" :value="stats.byReviewStatus?.approved || 0" suffix="份" />
      </NCard>
      <NCard :bordered="false">
        <NStatistic label="已驳回" :value="stats.byReviewStatus?.rejected || 0" suffix="份" />
      </NCard>
      <NCard :bordered="false">
        <NStatistic label="即将过期" :value="stats.byValidStatus?.expiring || 0" suffix="份" />
      </NCard>
    </div>

    <!-- 搜索 -->
    <HseSearchPanel @query="onSearch" @reset="onReset">
      <NGi>
        <NInput
          v-model:value="searchForm.keyword"
          placeholder="搜索文件名"
          clearable
          @keyup.enter="onSearch"
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
      <template #action="{ row }">
        <NSpace justify="center">
          <NButton
            v-if="row.reviewStatus === 'pending'"
            size="small"
            type="success"
            quaternary
            @click="openReviewModal(row, 'approved')"
          >
            通过
          </NButton>
          <NButton
            v-if="row.reviewStatus === 'pending'"
            size="small"
            type="error"
            quaternary
            @click="openReviewModal(row, 'rejected')"
          >
            驳回
          </NButton>
          <NButton size="small" type="primary" quaternary @click="handleDetail(row)">详情</NButton>
        </NSpace>
      </template>
    </HseDataGrid>

    <!-- 审核弹窗 -->
    <NModal
      v-model:show="reviewModalOpen"
      :title="reviewAction === 'approved' ? '审核通过' : '审核驳回'"
      preset="card"
      style="width: 480px; max-width: 92vw"
      :mask-closable="false"
    >
      <NForm label-placement="top">
        <NFormItem label="文件名">
          <NInput :value="reviewTarget?.originalName" disabled />
        </NFormItem>
        <NFormItem :label="reviewAction === 'approved' ? '审核意见（可选）' : '驳回原因'">
          <NInput
            v-model:value="reviewComment"
            type="textarea"
            :rows="3"
            :placeholder="reviewAction === 'approved' ? '请输入审核意见（可选）' : '请输入驳回原因'"
            :maxlength="500"
            show-count
          />
        </NFormItem>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="reviewModalOpen = false">取消</NButton>
          <NButton type="primary" :loading="reviewing" @click="confirmReview">
            确认{{ reviewAction === 'approved' ? '通过' : '驳回' }}
          </NButton>
        </NSpace>
      </template>
    </NModal>

    <!-- 详情弹窗 -->
    <NModal
      v-model:show="detailOpen"
      title="文件详情"
      preset="card"
      style="width: 560px; max-width: 92vw"
    >
      <div v-if="detailLoading" class="py-8 text-center text-gray-400">加载中...</div>
      <div v-else-if="detailData" class="space-y-3">
        <div class="detail-row">
          <span class="detail-label">文件名：</span>
          <span class="detail-value">{{ detailData.originalName }}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">文件类型：</span>
          <span class="detail-value">{{ FILE_TYPE_LABEL[detailData.fileType || ''] || detailData.fileType || '-' }}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">文件大小：</span>
          <span class="detail-value">{{ detailData.fileSizeText || '-' }}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">分类：</span>
          <span class="detail-value">{{ detailData.categoryName || '未分类' }}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">审核状态：</span>
          <HseStatusTag :type="REVIEW_TAG[detailData.reviewStatus || ''] || 'neutral'">
            {{ REVIEW_LABEL[detailData.reviewStatus || ''] || '-' }}
          </HseStatusTag>
        </div>
        <div class="detail-row">
          <span class="detail-label">有效期：</span>
          <span class="detail-value">{{ detailData.validStartDate || '-' }} 至 {{ detailData.validEndDate || '长期' }}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">上传人：</span>
          <span class="detail-value">{{ detailData.uploadedBy || '-' }}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">上传时间：</span>
          <span class="detail-value">{{ detailData.uploadedAt || '-' }}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">审核人：</span>
          <span class="detail-value">{{ detailData.reviewUser || '-' }}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">审核时间：</span>
          <span class="detail-value">{{ detailData.reviewTime || '-' }}</span>
        </div>
        <div v-if="detailData.summary" class="detail-row">
          <span class="detail-label">备注：</span>
          <span class="detail-value">{{ detailData.summary }}</span>
        </div>
      </div>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="detailOpen = false">关闭</NButton>
        </NSpace>
      </template>
    </NModal>
  </HsePageLayout>
</template>

<style scoped>
.detail-row {
  display: flex;
  padding: 8px 0;
  border-bottom: 1px solid hsl(var(--border));
}

.detail-label {
  width: 100px;
  flex-shrink: 0;
  color: hsl(var(--muted-foreground));
}

.detail-value {
  flex: 1;
  color: hsl(var(--foreground));
}
</style>
