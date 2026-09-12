<!--
  文件审核页面 - HSE V2.0 Sprint 1
  功能: 待审核文件列表 + 通过/驳回 + 审核意见
  权限: 后端 requireRole('admin','safety_manager') 为最终防线
  复用: Page/Card、Ant Design Vue、Vben useAccess（按需隐藏审核按钮）
-->
<template>
  <Page auto-content-height class="hse-page">
    <Row :gutter="[16, 16]" class="mb-4">
      <Col :xs="24" :sm="12" :md="6">
        <HseStatCard
          title="待审核"
          :value="stats.byReviewStatus?.pending || 0"
          icon="lucide:clock"
          color="orange"
          suffix="份"
        />
      </Col>
      <Col :xs="24" :sm="12" :md="6">
        <HseStatCard
          title="已通过"
          :value="stats.byReviewStatus?.approved || 0"
          icon="lucide:check-circle"
          color="green"
          suffix="份"
        />
      </Col>
      <Col :xs="24" :sm="12" :md="6">
        <HseStatCard
          title="已驳回"
          :value="stats.byReviewStatus?.rejected || 0"
          icon="lucide:x-circle"
          color="red"
          suffix="份"
        />
      </Col>
      <Col :xs="24" :sm="12" :md="6">
        <HseStatCard
          title="即将过期"
          :value="stats.byValidStatus?.expiring || 0"
          icon="lucide:alert-circle"
          color="purple"
          suffix="份"
        />
      </Col>
    </Row>

    <Card :bordered="false">
      <!-- 工具栏 -->
      <div class="toolbar mb-4 flex flex-wrap items-center gap-2">
        <a-input-search
          v-model:value="queryParams.keyword"
          placeholder="搜索文件名"
          style="width: 240px"
          allow-clear
          @search="loadList"
        />
        <a-select
          v-model:value="queryParams.reviewStatus"
          placeholder="审核状态"
          style="width: 140px"
          allow-clear
          @change="loadList"
          :options="reviewStatusOptions"
        />
        <div class="flex-1"></div>
      </div>

      <!-- 待审核文件表格 -->
      <Table
        :columns="(columns as any)"
        :data-source="fileList"
        :loading="loading"
        :pagination="pagination"
        row-key="id"
        @change="handleTableChange"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'originalName'">
            <IconifyIcon
              :icon="getFileIcon(record.fileType)"
              class="inline mr-1"
            />
            {{ record.originalName }}
          </template>
          <template v-else-if="column.key === 'reviewStatus'">
            <a-tag :color="reviewColorMap[record.reviewStatus]">
              {{ reviewTextMap[record.reviewStatus] }}
            </a-tag>
          </template>
          <template v-else-if="column.key === 'validStatus'">
            <a-tag :color="validColorMap[record.validStatus]">
              {{ validTextMap[record.validStatus] }}
            </a-tag>
          </template>
          <template v-else-if="column.key === 'action'">
            <a-button
              v-if="record.reviewStatus === 'pending'"
              type="link"
              size="small"
              @click="openReviewModal(record as any, 'approved')"
            >
              通过
            </a-button>
            <a-button
              v-if="record.reviewStatus === 'pending'"
              type="link"
              size="small"
              danger
              @click="openReviewModal(record as any, 'rejected')"
            >
              驳回
            </a-button>
            <a-button type="link" size="small" @click="handleDetail(record as any)">
              详情
            </a-button>
          </template>
        </template>
      </Table>
    </Card>

    <!-- 审核弹窗 -->
    <a-modal
      v-model:open="reviewModalOpen"
      :title="reviewAction === 'approved' ? '审核通过' : '审核驳回'"
      :confirm-loading="reviewing"
      ok-text="确认"
      cancel-text="取消"
      @ok="confirmReview"
    >
      <a-form layout="vertical">
        <a-form-item label="文件名">
          <span>{{ reviewTarget?.originalName }}</span>
        </a-form-item>
        <a-form-item label="审核意见">
          <a-textarea
            v-model:value="reviewComment"
            :rows="3"
            :placeholder="
              reviewAction === 'approved'
                ? '请输入审核意见（可选）'
                : '请输入驳回原因'
            "
            :maxlength="500"
            show-count
          />
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 详情抽屉 -->
    <a-drawer
      v-model:open="detailDrawerOpen"
      title="文件详情"
      width="560"
      placement="right"
    >
      <a-descriptions v-if="detailData" :column="1" bordered size="small">
        <a-descriptions-item label="文件名">{{ detailData.originalName }}</a-descriptions-item>
        <a-descriptions-item label="文件类型">{{ detailData.fileType }}</a-descriptions-item>
        <a-descriptions-item label="文件大小">{{ detailData.fileSizeText }}</a-descriptions-item>
        <a-descriptions-item label="分类">{{ detailData.categoryName || '未分类' }}</a-descriptions-item>
        <a-descriptions-item label="审核状态">
          <a-tag :color="reviewColorMap[detailData.reviewStatus]">
            {{ reviewTextMap[detailData.reviewStatus] }}
          </a-tag>
        </a-descriptions-item>
        <a-descriptions-item label="有效期">
          {{ detailData.validStartDate || '-' }} 至 {{ detailData.validEndDate || '长期' }}
        </a-descriptions-item>
        <a-descriptions-item label="上传人">{{ detailData.uploadedBy }}</a-descriptions-item>
        <a-descriptions-item label="上传时间">{{ detailData.uploadedAt }}</a-descriptions-item>
        <a-descriptions-item label="审核人">{{ detailData.reviewUser || '-' }}</a-descriptions-item>
        <a-descriptions-item label="审核时间">{{ detailData.reviewTime || '-' }}</a-descriptions-item>
        <a-descriptions-item label="备注">{{ detailData.summary || '-' }}</a-descriptions-item>
      </a-descriptions>
    </a-drawer>
  </Page>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { Card, Row, Col, Table, message } from 'ant-design-vue';
import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';
import HseStatCard from '#/components/hse/StatCard.vue';
import {
  getDocumentList,
  getDocumentDetail,
  getDocumentStats,
  reviewDocument,
  type DocumentsApi,
} from '#/api/hse/documents';

// ========== 统计 ==========
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
    // 忽略
  }
}

// ========== 列表 ==========
const loading = ref(false);
const fileList = ref<DocumentsApi.DocumentFile[]>([]);
const queryParams = reactive<DocumentsApi.DocumentListParams>({
  page: 1,
  pageSize: 20,
  reviewStatus: 'pending',
  keyword: '',
});

const pagination = reactive({
  current: 1,
  pageSize: 20,
  total: 0,
  showTotal: (total: number) => `共 ${total} 条`,
  showSizeChanger: true,
});

async function loadList() {
  loading.value = true;
  try {
    const result = await getDocumentList(queryParams);
    fileList.value = result.list;
    pagination.total = result.total;
    pagination.current = result.page;
  } catch (err: any) {
    message.error(err?.message || '加载列表失败');
  } finally {
    loading.value = false;
  }
}

function handleTableChange(pag: any) {
  queryParams.page = pag.current;
  queryParams.pageSize = pag.pageSize;
  pagination.current = pag.current;
  pagination.pageSize = pag.pageSize;
  loadList();
}

// ========== 审核 ==========
const reviewModalOpen = ref(false);
const reviewing = ref(false);
const reviewTarget = ref<DocumentsApi.DocumentFile | null>(null);
const reviewAction = ref<'approved' | 'rejected'>('approved');
const reviewComment = ref('');

function openReviewModal(record: DocumentsApi.DocumentFile, action: 'approved' | 'rejected') {
  reviewTarget.value = record;
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
    loadList();
    loadStats();
  } catch (err: any) {
    message.error(err?.message || '审核操作失败');
  } finally {
    reviewing.value = false;
  }
}

// ========== 详情 ==========
const detailDrawerOpen = ref(false);
const detailData = ref<DocumentsApi.DocumentFile | null>(null);

async function handleDetail(record: DocumentsApi.DocumentFile) {
  try {
    detailData.value = await getDocumentDetail(record.id);
    detailDrawerOpen.value = true;
  } catch (err: any) {
    message.error(err?.message || '加载详情失败');
  }
}

// ========== 映射 ==========
const reviewStatusOptions = [
  { label: '待审核', value: 'pending' },
  { label: '已通过', value: 'approved' },
  { label: '已驳回', value: 'rejected' },
];

const reviewColorMap: Record<string, string> = {
  pending: 'orange',
  approved: 'green',
  rejected: 'red',
};
const reviewTextMap: Record<string, string> = {
  pending: '待审核',
  approved: '已通过',
  rejected: '已驳回',
};

const validColorMap: Record<string, string> = {
  valid: 'green',
  expiring: 'orange',
  expired: 'red',
  none: 'default',
};
const validTextMap: Record<string, string> = {
  valid: '有效',
  expiring: '即将过期',
  expired: '已过期',
  none: '无有效期',
};

const columns = [
  { title: '文件名', key: 'originalName', dataIndex: 'originalName', ellipsis: true },
  { title: '类型', key: 'fileType', dataIndex: 'fileType', width: 90 },
  { title: '分类', key: 'categoryName', dataIndex: 'categoryName', width: 120 },
  { title: '上传人', key: 'uploadedBy', dataIndex: 'uploadedBy', width: 100 },
  { title: '上传时间', key: 'uploadedAt', dataIndex: 'uploadedAt', width: 170 },
  { title: '有效期', key: 'validStatus', width: 110 },
  { title: '审核状态', key: 'reviewStatus', width: 100 },
  { title: '操作', key: 'action', width: 180, fixed: 'right' },
];

function getFileIcon(fileType: string): string {
  const map: Record<string, string> = {
    pdf: 'lucide:file-text',
    word: 'lucide:file-text',
    excel: 'lucide:file-spreadsheet',
    image: 'lucide:image',
    video: 'lucide:video',
    other: 'lucide:file',
  };
  return map[fileType] || 'lucide:file';
}

onMounted(() => {
  loadStats();
  loadList();
});
</script>
