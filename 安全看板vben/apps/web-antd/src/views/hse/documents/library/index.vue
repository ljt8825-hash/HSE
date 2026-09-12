<!--
  文件库主页面 - HSE V2.0 Sprint 1
  功能: 文件分类树 + 文件列表 + 上传/下载/删除 + 筛选
  复用: Page/Card/Row/Col(HseStatCard)、Ant Design Vue 组件、Vben useVbenModal
-->
<template>
  <Page auto-content-height class="hse-page">
    <!-- 统计卡片 -->
    <Row :gutter="[16, 16]" class="mb-4">
      <Col :xs="24" :sm="12" :md="6">
        <HseStatCard
          title="文件总数"
          :value="stats.total"
          icon="lucide:file-text"
          color="blue"
          suffix="份"
        />
      </Col>
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
          title="即将过期"
          :value="stats.byValidStatus?.expiring || 0"
          icon="lucide:alert-circle"
          color="red"
          suffix="份"
        />
      </Col>
    </Row>

    <Row :gutter="[16, 16]">
      <!-- 左侧分类树 -->
      <Col :xs="24" :lg="6">
        <Card title="文件分类" :bordered="false" class="category-card">
          <a-tree
            :tree-data="categoryTreeData"
            :selected-keys="selectedCategoryKeys"
            :default-expand-all="true"
            :field-names="{ title: 'name', key: 'id', children: 'children' }"
            @select="onCategorySelect"
          >
            <template #title="{ name, code }">
              <span>{{ name }}</span>
              <span class="text-xs text-gray-400 ml-1">{{ code }}</span>
            </template>
          </a-tree>
        </Card>
      </Col>

      <!-- 右侧文件列表 -->
      <Col :xs="24" :lg="18">
        <Card :bordered="false">
          <!-- 工具栏 -->
          <div class="toolbar mb-4 flex flex-wrap items-center gap-2">
            <a-input-search
              v-model:value="queryParams.keyword"
              placeholder="搜索文件名或摘要"
              style="width: 240px"
              allow-clear
              @search="loadList"
            />
            <a-select
              v-model:value="queryParams.fileType"
              placeholder="文件类型"
              style="width: 120px"
              allow-clear
              @change="loadList"
              :options="fileTypeOptions"
            />
            <a-select
              v-model:value="queryParams.reviewStatus"
              placeholder="审核状态"
              style="width: 120px"
              allow-clear
              @change="loadList"
              :options="reviewStatusOptions"
            />
            <a-select
              v-model:value="queryParams.validStatus"
              placeholder="有效期状态"
              style="width: 120px"
              allow-clear
              @change="loadList"
              :options="validStatusOptions"
            />
            <div class="flex-1"></div>
            <a-button type="primary" @click="uploadModalOpen = true">
              <template #icon><IconifyIcon icon="lucide:upload" /></template>
              上传文件
            </a-button>
          </div>

          <!-- 文件表格 -->
          <Table
            :columns="(columns as any)"
            :data-source="fileList"
            :loading="loading"
            :pagination="pagination"
            row-key="id"
            @change="handleTableChange"
          >
            <template #bodyCell="{ column, record }">
              <!-- 文件名列 -->
              <template v-if="column.key === 'originalName'">
                <a class="text-blue-600" @click="handleDetail(record as any)">
                  <IconifyIcon
                    :icon="getFileIcon(record.fileType)"
                    class="inline mr-1"
                  />
                  {{ record.originalName }}
                </a>
              </template>
              <!-- 审核状态列 -->
              <template v-else-if="column.key === 'reviewStatus'">
                <a-tag :color="reviewColorMap[record.reviewStatus]">
                  {{ reviewTextMap[record.reviewStatus] }}
                </a-tag>
              </template>
              <!-- 有效期状态列 -->
              <template v-else-if="column.key === 'validStatus'">
                <a-tag :color="validColorMap[record.validStatus]">
                  {{ validTextMap[record.validStatus] }}
                </a-tag>
              </template>
              <!-- AI评分列 -->
              <template v-else-if="column.key === 'aiScore'">
                <template v-if="record.analysisStatus === 'completed' && record.aiScore != null">
                  <Progress
                    :percent="record.aiScore"
                    :size="'small'"
                    :stroke-color="getScoreColor(record.aiScore)"
                    :show-info="true"
                    style="width: 100px"
                  />
                </template>
                <template v-else-if="record.analysisStatus === 'processing' || record.analysisStatus === 'pending'">
                  <a-tag color="processing">
                    <IconifyIcon icon="lucide:loader-2" class="animate-spin mr-1" :size="12" />
                    分析中
                  </a-tag>
                </template>
                <template v-else-if="record.analysisStatus === 'failed'">
                  <a-tag color="error">分析失败</a-tag>
                </template>
                <template v-else>
                  <span class="text-gray-400 text-sm">未分析</span>
                </template>
              </template>
              <!-- 风险等级列 -->
              <template v-else-if="column.key === 'riskLevel'">
                <a-tag :color="riskColorMap[record.riskLevel]" v-if="record.riskLevel">
                  {{ riskTextMap[record.riskLevel] }}
                </a-tag>
                <span v-else class="text-gray-400 text-sm">-</span>
              </template>
              <!-- 操作列 -->
              <template v-else-if="column.key === 'action'">
                <a-button type="link" size="small" @click="handleDownload(record as any)">
                  下载
                </a-button>
                <a-button type="link" size="small" @click="handleAiAnalysis(record as any)">
                  <IconifyIcon icon="lucide:sparkles" class="mr-1" :size="12" />
                  AI分析
                </a-button>
                <a-popconfirm
                  title="确认删除该文件？"
                  @confirm="handleDelete(record as any)"
                >
                  <a-button type="link" size="small" danger>删除</a-button>
                </a-popconfirm>
              </template>
            </template>
          </Table>
        </Card>
      </Col>
    </Row>

    <!-- 上传弹窗 -->
    <UploadModal v-model:open="uploadModalOpen" @success="onUploadSuccess" />

    <!-- AI分析抽屉 -->
    <DocumentAiAnalysis
      v-model:visible="aiDrawerVisible"
      :file-id="currentFileId"
      @refresh="loadList"
    />

    <!-- 详情抽屉 -->
    <a-drawer
      v-model:open="detailDrawerOpen"
      title="文件详情"
      width="560"
      placement="right"
    >
      <a-descriptions
        v-if="detailData"
        :column="1"
        bordered
        size="small"
      >
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
        <a-descriptions-item label="有效期状态">
          <a-tag :color="validColorMap[detailData.validStatus]">
            {{ validTextMap[detailData.validStatus] }}
          </a-tag>
        </a-descriptions-item>
        <a-descriptions-item label="上传人">{{ detailData.uploadedBy }}</a-descriptions-item>
        <a-descriptions-item label="上传时间">{{ detailData.uploadedAt }}</a-descriptions-item>
        <a-descriptions-item label="备注">{{ detailData.summary || '-' }}</a-descriptions-item>
        <a-descriptions-item label="标签" v-if="detailData.tags?.length">
          <a-tag v-for="t in detailData.tags" :key="t.id" :color="t.color">{{ t.name }}</a-tag>
        </a-descriptions-item>
      </a-descriptions>
    </a-drawer>
  </Page>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { Card, Progress, Row, Col, Table, message } from 'ant-design-vue';
import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';
import HseStatCard from '#/components/hse/StatCard.vue';
import UploadModal from './components/UploadModal.vue';
import DocumentAiAnalysis from './components/DocumentAiAnalysis.vue';
import {
  getDocumentList,
  getDocumentDetail,
  getDocumentStats,
  getCategoryTree,
  deleteDocument,
  downloadDocument,
  type DocumentsApi,
} from '#/api/hse/documents';

// ========== 统计数据 ==========
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

// ========== 分类树 ==========
const categoryTree = ref<DocumentsApi.CategoryNode[]>([]);
const selectedCategoryKeys = ref<number[]>([]);

const categoryTreeData = categoryTree;

async function loadCategoryTree() {
  try {
    categoryTree.value = await getCategoryTree();
  } catch {
    // 忽略
  }
}

function onCategorySelect(keys: any[]) {
  selectedCategoryKeys.value = keys as number[];
  queryParams.categoryId = keys[0] as number | undefined;
  queryParams.page = 1;
  loadList();
}

// ========== 文件列表 ==========
const loading = ref(false);
const fileList = ref<DocumentsApi.DocumentFile[]>([]);
const queryParams = reactive<DocumentsApi.DocumentListParams>({
  page: 1,
  pageSize: 20,
  keyword: '',
  fileType: undefined,
  reviewStatus: undefined,
  validStatus: undefined,
  categoryId: undefined,
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
    message.error(err?.message || '加载文件列表失败');
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

// ========== 上传弹窗 ==========
const uploadModalOpen = ref(false);

function onUploadSuccess() {
  loadList();
  loadStats();
}

// ========== 详情抽屉 ==========
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

// ========== 下载 ==========
async function handleDownload(record: DocumentsApi.DocumentFile) {
  try {
    const blob = await downloadDocument(record.id);
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = record.originalName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  } catch (err: any) {
    message.error(err?.message || '下载失败');
  }
}

// ========== 删除 ==========
async function handleDelete(record: DocumentsApi.DocumentFile) {
  try {
    await deleteDocument(record.id);
    message.success('删除成功');
    loadList();
    loadStats();
  } catch (err: any) {
    message.error(err?.message || '删除失败');
  }
}

// ========== 选项映射 ==========
const fileTypeOptions = [
  { label: 'PDF', value: 'pdf' },
  { label: 'Word', value: 'word' },
  { label: 'Excel', value: 'excel' },
  { label: '图片', value: 'image' },
  { label: '视频', value: 'video' },
  { label: '其他', value: 'other' },
];

const reviewStatusOptions = [
  { label: '待审核', value: 'pending' },
  { label: '已通过', value: 'approved' },
  { label: '已驳回', value: 'rejected' },
];

const validStatusOptions = [
  { label: '有效', value: 'valid' },
  { label: '即将过期', value: 'expiring' },
  { label: '已过期', value: 'expired' },
  { label: '无有效期', value: 'none' },
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

// 表格列定义
const columns = [
  { title: '文件名', key: 'originalName', dataIndex: 'originalName', ellipsis: true },
  { title: '类型', key: 'fileType', dataIndex: 'fileType', width: 90 },
  { title: 'AI评分', key: 'aiScore', width: 120 },
  { title: '风险等级', key: 'riskLevel', width: 100 },
  { title: '审核状态', key: 'reviewStatus', width: 100 },
  { title: '有效期', key: 'validStatus', width: 110 },
  { title: '上传时间', key: 'uploadedAt', dataIndex: 'uploadedAt', width: 170 },
  { title: '操作', key: 'action', width: 180, fixed: 'right' },
];

// AI分析抽屉状态
const aiDrawerVisible = ref(false);
const currentFileId = ref(0);

function handleAiAnalysis(record: DocumentsApi.DocumentFile) {
  currentFileId.value = record.id;
  aiDrawerVisible.value = true;
}

function getScoreColor(score: number): string {
  if (score >= 80) return '#52c41a';
  if (score >= 60) return '#faad14';
  if (score >= 40) return '#fa8c16';
  return '#f5222d';
}

const riskColorMap: Record<string, string> = {
  low: 'green',
  medium: 'gold',
  high: 'orange',
  critical: 'red',
};
const riskTextMap: Record<string, string> = {
  low: '低风险',
  medium: '中风险',
  high: '高风险',
  critical: '严重',
};

// 文件类型图标映射
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

// 初始化
onMounted(() => {
  loadStats();
  loadCategoryTree();
  loadList();
});
</script>

<style scoped>
.category-card {
  max-height: 600px;
  overflow-y: auto;
}
</style>
