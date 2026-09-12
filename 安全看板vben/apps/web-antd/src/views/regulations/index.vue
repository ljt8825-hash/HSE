<template>
  <Page auto-content-height class="hse-page">
    <Row v-if="statsLoading" :gutter="[16, 16]" class="mb-4">
      <Col :xs="24" :sm="12" :md="8" :lg="6" :xl="6" v-for="i in 4" :key="`skel-${i}`">
        <Card :bordered="false">
          <Skeleton active :paragraph="{ rows: 2 }" />
        </Card>
      </Col>
    </Row>
    <Row v-else :gutter="[16, 16]" class="mb-4">
      <Col :xs="24" :sm="12" :md="8" :lg="6" :xl="6" v-for="stat in statItems" :key="stat.key">
        <HseStatCard
          :title="stat.label"
          :value="stat.value"
          :icon="stat.icon"
          :color="(stat.color as any)"
          :clickable="true"
          @click="handleStatCardClick(stat.key)"
        />
      </Col>
    </Row>

    <Card :bordered="false">
      <template #title>
        <div class="card-header">
          <span>{{ $t('hse.regulations.title') }}</span>
          <div class="action-group">
            <Space :size="8">
              <HelpButton menuCode="HSE_REGULATIONS" />
              <ImportButtonGroup module="regulations" :module-name="$t('hse.regulations.title')" @refresh="fetchData" />
            <Button @click="handleExport" :loading="exportLoading">
              <template #icon><IconifyIcon icon="lucide:download" /></template>
              {{ $t('hse.regulations.action.export') }}
            </Button>
            <Button type="primary" @click="handleCreate">
              <template #icon><IconifyIcon icon="lucide:plus" /></template>
              {{ $t('hse.regulations.action.create') }}
            </Button>
            </Space>
          </div>
        </div>
      </template>

      <Form layout="inline" class="filter-form">
        <FormItem label="关键词">
          <Input
            v-model:value="searchForm.keyword"
            placeholder="搜索标题/文号/摘要"
            allow-clear
            @change="handleSearch"
          />
        </FormItem>
        <FormItem label="分类">
          <Select
            v-model:value="searchForm.category"
            placeholder="全部分类"
            allow-clear
            @change="handleSearch"
          >
            <SelectOption value="national">国家</SelectOption>
            <SelectOption value="provincial">省级</SelectOption>
            <SelectOption value="municipal">市级</SelectOption>
            <SelectOption value="internal">内部</SelectOption>
            <SelectOption value="industry">行业</SelectOption>
          </Select>
        </FormItem>
        <FormItem label="类型">
          <Select
            v-model:value="searchForm.type"
            placeholder="全部类型"
            allow-clear
            @change="handleSearch"
          >
            <SelectOption value="law">法律</SelectOption>
            <SelectOption value="regulation">法规</SelectOption>
            <SelectOption value="standard">标准</SelectOption>
            <SelectOption value="procedure">规程</SelectOption>
            <SelectOption value="guideline">指南</SelectOption>
          </Select>
        </FormItem>
        <FormItem label="状态">
          <Select
            v-model:value="searchForm.status"
            placeholder="全部状态"
            allow-clear
            @change="handleSearch"
          >
            <SelectOption value="active">有效</SelectOption>
            <SelectOption value="published">已发布</SelectOption>
            <SelectOption value="draft">草案</SelectOption>
            <SelectOption value="revising">修订中</SelectOption>
            <SelectOption value="obsolete">已废止</SelectOption>
          </Select>
        </FormItem>
        <FormItem>
          <Button @click="handleReset">重置</Button>
        </FormItem>
      </Form>

      <Table
        :columns="columns"
        :data-source="regulationList"
        :loading="loading"
        :pagination="{
          current: pagination.page,
          pageSize: pagination.pageSize,
          total: total,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (t) => `共 ${t} 条记录`,
        }"
        :row-key="(record) => record.id"
        @change="(handleTableChange as any)"
        size="middle"
        :scroll="{ x: 960 }"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'status'">
            <Tag :color="getStatusColor(record.status)">
              {{ getStatusText(record.status) }}
            </Tag>
          </template>
          <template v-else-if="column.key === 'expiryStatus'">
            <Badge
              :status="getExpiryBadgeStatus(record.expiryStatus)"
              :text="$t(`hse.regulations.expiry.${record.expiryStatus || 'unknown'}`)"
            />
          </template>
          <template v-else-if="column.key === 'effectiveDate'">
            {{ formatDate(record.effectiveDate) }}
          </template>
          <template v-else-if="column.key === 'version'">
            {{ record.version || '—' }}
          </template>
          <template v-else-if="column.key === 'action'">
            <Button type="link" size="small" @click="handleView(record as any)">查看</Button>
            <Button type="link" size="small" @click="handleEdit(record as any)">编辑</Button>
            <Popconfirm
              title="确定要删除此制度吗？"
              ok-text="删除"
              cancel-text="取消"
              @confirm="handleDelete(record as any)"
            >
              <Button type="link" size="small" danger>删除</Button>
            </Popconfirm>
          </template>
        </template>
      </Table>
    </Card>

    <Modal
      v-model:open="modalVisible"
      :title="editingRegulation ? '编辑制度' : '新增制度'"
      :confirm-loading="modalLoading"
      width="760px"
      @ok="handleSave"
      @cancel="modalVisible = false"
    >
      <Form ref="formRef" :model="regulationForm" :rules="(formRules as any)" layout="vertical">
        <Row :gutter="16">
          <Col :span="24">
            <FormItem label="制度标题" required>
              <Input v-model:value="regulationForm.title" placeholder="请输入制度标题" />
            </FormItem>
          </Col>
          <Col :span="8">
            <FormItem label="分类" required>
              <Select v-model:value="regulationForm.category" placeholder="请选择分类" style="width: 100%">
                <SelectOption value="national">国家</SelectOption>
                <SelectOption value="provincial">省级</SelectOption>
                <SelectOption value="municipal">市级</SelectOption>
                <SelectOption value="internal">内部</SelectOption>
                <SelectOption value="industry">行业</SelectOption>
              </Select>
            </FormItem>
          </Col>
          <Col :span="8">
            <FormItem label="类型" required>
              <Select v-model:value="regulationForm.type" placeholder="请选择类型" style="width: 100%">
                <SelectOption value="law">法律</SelectOption>
                <SelectOption value="regulation">法规</SelectOption>
                <SelectOption value="standard">标准</SelectOption>
                <SelectOption value="procedure">规程</SelectOption>
                <SelectOption value="guideline">指南</SelectOption>
              </Select>
            </FormItem>
          </Col>
          <Col :span="8">
            <FormItem label="状态">
              <Select v-model:value="regulationForm.status" placeholder="请选择状态" style="width: 100%">
                <SelectOption value="active">有效</SelectOption>
                <SelectOption value="published">已发布</SelectOption>
                <SelectOption value="draft">草案</SelectOption>
                <SelectOption value="revising">修订中</SelectOption>
                <SelectOption value="obsolete">已废止</SelectOption>
              </Select>
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="文号">
              <Input v-model:value="regulationForm.documentNo" placeholder="如 GB/T 28001-2011" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="版本">
              <Input v-model:value="regulationForm.version" placeholder="如 V2.0、2011版" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="发布日期">
              <DatePicker v-model:value="regulationForm.issueDate" style="width: 100%" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="生效日期">
              <DatePicker v-model:value="regulationForm.effectiveDate" style="width: 100%" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="发布机构">
              <Input v-model:value="regulationForm.issuer" placeholder="请输入发布机构" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="归口部门">
              <Input v-model:value="regulationForm.department" placeholder="请输入归口部门" />
            </FormItem>
          </Col>
          <Col :span="24">
            <FormItem label="摘要">
              <Textarea
                v-model:value="regulationForm.summary"
                :rows="2"
                placeholder="请输入制度摘要"
              />
            </FormItem>
          </Col>
          <Col :span="24">
            <FormItem label="制度内容">
              <Textarea
                v-model:value="regulationForm.content"
                :rows="5"
                placeholder="请输入制度正文内容"
              />
            </FormItem>
          </Col>
        </Row>
      </Form>
    </Modal>

    <Drawer v-model:open="detailDrawerVisible" :title="$t('hse.regulations.action.view')" width="780px">
      <template v-if="currentRegulation">
        <div class="detail-section">
          <h3 class="detail-title">{{ currentRegulation.title }}</h3>
          <Tag :color="getCategoryColor(currentRegulation.category)">
            {{ getCategoryText(currentRegulation.category) }}
          </Tag>
          <Tag :color="getTypeColor(currentRegulation.type)">
            {{ getTypeText(currentRegulation.type) }}
          </Tag>
          <Tag :color="getStatusColor(currentRegulation.status)">
            {{ getStatusText(currentRegulation.status) }}
          </Tag>
          <Badge
            :status="getExpiryBadgeStatus(currentRegulation.expiryStatus)"
            :text="$t(`hse.regulations.expiry.${currentRegulation.expiryStatus || 'unknown'}`)"
            class="detail-expiry-badge"
          />
        </div>
        <div class="detail-section">
          <div class="detail-row">
            <span class="detail-label">文号：</span>
            <span class="detail-value">{{ currentRegulation.documentNo || '—' }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">版本：</span>
            <span class="detail-value">{{ currentRegulation.version || '—' }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">发布机构：</span>
            <span class="detail-value">{{ currentRegulation.issuer || '—' }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">归口部门：</span>
            <span class="detail-value">{{ currentRegulation.department || '—' }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">发布日期：</span>
            <span class="detail-value">{{ formatDate(currentRegulation.issueDate) }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">生效日期：</span>
            <span class="detail-value">{{ formatDate(currentRegulation.effectiveDate) }}</span>
          </div>
        </div>
        <div class="detail-section">
          <div class="detail-label">摘要</div>
          <div class="detail-content">
            {{ currentRegulation.summary || '暂无摘要' }}
          </div>
        </div>
        <div class="detail-section">
          <div class="detail-label">制度内容</div>
          <div class="detail-content detail-content-full">
            {{ currentRegulation.content || '暂无内容' }}
          </div>
        </div>
        <div v-if="currentRegulation.remark" class="detail-section">
          <div class="detail-label">备注</div>
          <div class="detail-content">{{ currentRegulation.remark }}</div>
        </div>

        <!-- 附件列表与历史版本 Tabs -->
        <Tabs v-model:activeKey="detailTab" class="detail-tabs">
          <TabPane :tab="$t('hse.regulations.version.tabAttachments')" key="attachments">
            <div class="attachment-section">
              <div class="attachment-toolbar">
                <Input
                  v-model:value="uploadVersion"
                  :placeholder="$t('hse.regulations.attachment.versionPlaceholder')"
                  style="width: 160px"
                  allow-clear
                />
                <Upload
                  :show-upload-list="false"
                  :before-upload="(file) => handleUploadAttachment(file)"
                  accept=".pdf,.doc,.docx"
                >
                  <Button type="primary" :loading="attachmentUploading">
                    <template #icon><IconifyIcon icon="lucide:upload" /></template>
                    {{ $t('hse.regulations.attachment.upload') }}
                  </Button>
                </Upload>
              </div>
              <Table
                :columns="attachmentColumns"
                :data-source="attachmentList"
                :loading="attachmentLoading"
                size="small"
                :pagination="false"
                :row-key="(record) => record.id"
                :locale="{ emptyText: $t('hse.regulations.attachment.empty') }"
              >
                <template #bodyCell="{ column, record }">
                  <template v-if="column.key === 'originalName'">
                    <a :href="record.fileUrl" target="_blank" rel="noopener">{{ record.originalName }}</a>
                    <Tag v-if="record.isLatest" color="green" style="margin-left: 8px">
                      {{ $t('hse.regulations.attachment.isLatest') }}
                    </Tag>
                  </template>
                  <template v-else-if="column.key === 'fileSize'">
                    {{ formatFileSize(record.fileSize) }}
                  </template>
                  <template v-else-if="column.key === 'createdAt'">
                    {{ formatDateTime(record.createdAt) }}
                  </template>
                  <template v-else-if="column.key === 'action'">
                    <a :href="record.fileUrl" target="_blank" rel="noopener">
                      {{ $t('hse.regulations.attachment.download') }}
                    </a>
                    <Popconfirm
                      :title="$t('hse.regulations.attachment.deleteConfirm')"
                      ok-text="删除"
                      cancel-text="取消"
                      @confirm="handleDeleteAttachment(record as any)"
                    >
                      <Button type="link" size="small" danger>
                        {{ $t('hse.regulations.attachment.delete') }}
                      </Button>
                    </Popconfirm>
                  </template>
                </template>
              </Table>
            </div>
          </TabPane>
          <TabPane :tab="$t('hse.regulations.version.tabVersions')" key="versions">
            <Table
              :columns="versionColumns"
              :data-source="versionList"
              :loading="versionLoading"
              size="small"
              :pagination="false"
              :row-key="(record) => record.id"
              :locale="{ emptyText: $t('hse.regulations.version.empty') }"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'changeType'">
                  <Tag :color="getChangeTypeColor(record.changeType)">
                    {{ getChangeTypeText(record.changeType) }}
                  </Tag>
                </template>
                <template v-else-if="column.key === 'createdAt'">
                  {{ formatDateTime(record.createdAt) }}
                </template>
              </template>
            </Table>
          </TabPane>
        </Tabs>
      </template>
    </Drawer>
  </Page>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue';
import {
  Card,
  Row,
  Col,
  Table,
  Form,
  FormItem,
  Input,
  Select,
  SelectOption,
  Button,
  Modal,
  Drawer,
  Tag,
  Badge,
  DatePicker,
  Textarea,
  Tabs,
  TabPane,
  Upload,
  message,
  Popconfirm,
  Skeleton,
  Space,
} from 'ant-design-vue';
import type { FormInstance } from 'ant-design-vue';
import { IconifyIcon } from '@vben/icons';
import { Page } from '@vben/common-ui';
import { HelpButton } from '#/components/hse';
import HseStatCard from '#/components/hse/StatCard.vue';
import ImportButtonGroup from '#/components/hse/ImportButtonGroup.vue';
import dayjs, { type Dayjs } from 'dayjs';
import { $t } from '#/locales';

import {
  getRegulationList,
  getRegulationStats,
  createRegulation,
  updateRegulation,
  deleteRegulation,
  getRegulationAttachments,
  uploadRegulationAttachment,
  deleteRegulationAttachment,
  getRegulationVersions,
  exportRegulations,
  type RegulationsApi,
} from '#/api/hse/regulations';

const loading = ref(false);
const statsLoading = ref(false);
const regulationList = ref<RegulationsApi.Regulation[]>([]);
const total = ref(0);

const searchForm = reactive({
  keyword: '',
  category: undefined as string | undefined,
  type: undefined as string | undefined,
  status: undefined as string | undefined,
});

const pagination = reactive({
  page: 1,
  pageSize: 10,
});

const modalVisible = ref(false);
const modalLoading = ref(false);
const editingRegulation = ref<RegulationsApi.Regulation | null>(null);
const regulationForm = reactive({
  title: '',
  category: 'national' as RegulationsApi.Regulation['category'],
  type: 'law' as RegulationsApi.Regulation['type'],
  documentNo: '',
  version: '',
  status: 'active' as RegulationsApi.Regulation['status'],
  issueDate: undefined as Dayjs | undefined,
  effectiveDate: undefined as Dayjs | undefined,
  issuer: '',
  department: '',
  summary: '',
  content: '',
});

const formRef = ref<FormInstance>();

const formRules = {
  title: [
    { required: true, message: '请输入制度标题', trigger: 'blur' },
    { min: 3, max: 200, message: '标题长度为3-200字符', trigger: 'blur' },
  ],
  category: [{ required: true, message: '请选择分类', trigger: 'change' }],
  type: [{ required: true, message: '请选择类型', trigger: 'change' }],
  documentNo: [{ required: true, message: '请输入文号', trigger: 'blur' }],
  version: [{ required: true, message: '请输入版本', trigger: 'blur' }],
  issueDate: [{ required: true, message: '请选择发布日期', trigger: 'change' }],
  effectiveDate: [{ required: true, message: '请选择生效日期', trigger: 'change' }],
  issuer: [{ required: true, message: '请输入发布机构', trigger: 'blur' }],
  summary: [{ required: true, message: '请输入摘要', trigger: 'blur' }],
};

const detailDrawerVisible = ref(false);
const currentRegulation = ref<RegulationsApi.Regulation | null>(null);

// 详情 Drawer Tab 切换
const detailTab = ref<'attachments' | 'versions'>('attachments');

// 附件列表状态
const attachmentList = ref<RegulationsApi.Attachment[]>([]);
const attachmentLoading = ref(false);
const attachmentUploading = ref(false);
const uploadVersion = ref('');
const attachmentColumns = [
  { title: $t('hse.regulations.attachment.fileName'), key: 'originalName', width: 280 },
  { title: $t('hse.regulations.attachment.version'), dataIndex: 'version', key: 'version', width: 90 },
  { title: $t('hse.regulations.attachment.uploadedBy'), dataIndex: 'uploadedBy', key: 'uploadedBy', width: 100 },
  { title: $t('hse.regulations.attachment.fileSize'), key: 'fileSize', width: 100 },
  { title: $t('hse.regulations.attachment.uploadedAt'), key: 'createdAt', width: 160 },
  { title: '操作', key: 'action', width: 130 },
];

// 历史版本状态
const versionList = ref<RegulationsApi.VersionRecord[]>([]);
const versionLoading = ref(false);
const versionColumns = [
  { title: $t('hse.regulations.version.version'), dataIndex: 'version', key: 'version', width: 100 },
  { title: $t('hse.regulations.version.changeType'), key: 'changeType', width: 110 },
  { title: $t('hse.regulations.version.changeSummary'), dataIndex: 'changeSummary', key: 'changeSummary' },
  { title: $t('hse.regulations.version.changedBy'), dataIndex: 'changedBy', key: 'changedBy', width: 110 },
  { title: $t('hse.regulations.version.changedAt'), key: 'createdAt', width: 160 },
];

// 报表导出
const exportLoading = ref(false);

const statsData = ref({
  total: 0,
  active: 0,
  published: 0,
  draft: 0,
  revising: 0,
  obsolete: 0,
});

const statItems = computed(() => [
  { key: 'total', label: '制度总数', value: statsData.value.total, color: 'blue', icon: 'lucide:book-open' },
  { key: 'active', label: '有效', value: statsData.value.active, color: 'green', icon: 'lucide:check-circle-2' },
  { key: 'revising', label: '修订中', value: statsData.value.revising, color: 'orange', icon: 'lucide:clock' },
  { key: 'draft', label: '草案', value: statsData.value.draft, color: 'cyan', icon: 'lucide:file-text' },
]);

const columns = [
  {
    title: '序号',
    key: 'index',
    width: 60,
    align: 'center' as const,
    customRender: ({ index }: { index: number }) => (pagination.page - 1) * pagination.pageSize + index + 1,
  },
  { title: '制度标题', dataIndex: 'title', key: 'title', width: 220, ellipsis: true },
  { title: '版本', dataIndex: 'version', key: 'version', width: 100, align: 'center' as const },
  { title: '状态', key: 'status', width: 100, align: 'center' as const },
  { title: $t('hse.regulations.expiry.title'), key: 'expiryStatus', width: 110, align: 'center' as const },
  { title: '生效日期', key: 'effectiveDate', width: 120, align: 'center' as const },
  { title: '操作', key: 'action', width: 180, align: 'center' as const, fixed: 'right' as const },
];

function formatDate(date: string): string {
  if (!date) return '-';
  return dayjs(date).format('YYYY-MM-DD');
}

function getCategoryColor(category: string): string {
  const map: Record<string, string> = {
    national: 'red',
    provincial: 'orange',
    municipal: 'gold',
    internal: 'blue',
    industry: 'cyan',
  };
  return map[category] || 'default';
}

function getCategoryText(category: string): string {
  const map: Record<string, string> = {
    national: '国家',
    provincial: '省级',
    municipal: '市级',
    internal: '内部',
    industry: '行业',
  };
  return map[category] || category;
}

function getTypeColor(type: string): string {
  const map: Record<string, string> = {
    law: 'red',
    regulation: 'orange',
    standard: 'blue',
    procedure: 'cyan',
    guideline: 'purple',
  };
  return map[type] || 'default';
}

function getTypeText(type: string): string {
  const map: Record<string, string> = {
    law: '法律',
    regulation: '法规',
    standard: '标准',
    procedure: '规程',
    guideline: '指南',
  };
  return map[type] || type;
}

function getStatusColor(status: string): string {
  const map: Record<string, string> = {
    active: 'green',
    published: 'green',
    draft: 'gold',
    revising: 'orange',
    obsolete: 'red',
  };
  return map[status] || 'default';
}

function getStatusText(status: string): string {
  const map: Record<string, string> = {
    active: '有效',
    published: '已发布',
    draft: '草案',
    revising: '修订中',
    obsolete: '已废止',
  };
  return map[status] || status;
}

// 时效状态 → Antd Badge 状态映射
function getExpiryBadgeStatus(status?: string): 'success' | 'warning' | 'error' | 'default' | 'processing' {
  const map: Record<string, 'success' | 'warning' | 'error' | 'default' | 'processing'> = {
    normal: 'success',       // 绿色 正常
    expiring: 'warning',     // 黄色 临期
    expired: 'error',        // 红色 过期
    permanent: 'default',    // 灰色 长期有效
    unknown: 'default',
  };
  return map[status || 'unknown'] || 'default';
}

// 变更类型颜色
function getChangeTypeColor(type: string): string {
  const map: Record<string, string> = {
    create: 'green',
    update: 'blue',
    import: 'cyan',
    revise: 'orange',
  };
  return map[type] || 'default';
}

// 变更类型文本
function getChangeTypeText(type: string): string {
  const fallbackMap: Record<string, string> = {
    create: $t('hse.regulations.version.changeTypeCreate'),
    update: $t('hse.regulations.version.changeTypeUpdate'),
    import: $t('hse.regulations.version.changeTypeImport'),
    revise: $t('hse.regulations.version.changeTypeRevise'),
  };
  return fallbackMap[type] || type;
}

// 文件大小格式化
function formatFileSize(bytes: number): string {
  if (!bytes) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// 完整日期时间格式化
function formatDateTime(date: string): string {
  if (!date) return '-';
  return dayjs(date).format('YYYY-MM-DD HH:mm');
}

async function fetchData() {
  loading.value = true;
  try {
    const params: RegulationsApi.RegulationListParams = {
      page: pagination.page,
      pageSize: pagination.pageSize,
      keyword: searchForm.keyword || undefined,
      category: searchForm.category,
      type: searchForm.type,
      status: searchForm.status,
    };
    const res = await getRegulationList(params);
    regulationList.value = res.list || [];
    total.value = res.total || 0;
  } catch (err) {
    console.warn('获取规章制度列表失败:', err);
    message.error($t('hse.message.fetchListFailed', { module: $t('hse.module.regulations') }));
    regulationList.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
}

async function fetchStats() {
  statsLoading.value = true;
  try {
    const res = await getRegulationStats();
    statsData.value = {
      total: res.total,
      active: res.active || 0,
      published: res.published || 0,
      draft: res.draft || 0,
      revising: res.revising || 0,
      obsolete: res.obsolete || 0,
    };
  } catch (err) {
    console.warn('获取制度统计失败:', err);
    message.error($t('hse.message.fetchStatsFailed'));
  } finally {
    statsLoading.value = false;
  }
}

function handleSearch() {
  pagination.page = 1;
  fetchData();
}

function handleReset() {
  searchForm.keyword = '';
  searchForm.category = undefined;
  searchForm.type = undefined;
  searchForm.status = undefined;
  pagination.page = 1;
  fetchData();
}

function handleStatCardClick(key: string) {
  searchForm.keyword = '';
  searchForm.category = undefined;
  searchForm.type = undefined;
  
  switch (key) {
    case 'active':
      searchForm.status = 'active';
      break;
    case 'revising':
      searchForm.status = 'revising';
      break;
    case 'draft':
      searchForm.status = 'draft';
      break;
    default:
      searchForm.status = undefined;
  }
  
  pagination.page = 1;
  fetchData();
}

function handleTableChange(pag: { current: number; pageSize: number }) {
  pagination.page = pag.current;
  pagination.pageSize = pag.pageSize;
  fetchData();
}

function handleCreate() {
  editingRegulation.value = null;
  Object.assign(regulationForm, {
    title: '',
    category: 'national',
    type: 'law',
    documentNo: '',
    version: '',
    status: 'active',
    issueDate: dayjs(),
    effectiveDate: dayjs().add(30, 'day'),
    issuer: '',
    department: '',
    summary: '',
    content: '',
  });
  modalVisible.value = true;
}

function handleEdit(record: RegulationsApi.Regulation) {
  editingRegulation.value = record;
  Object.assign(regulationForm, {
    title: record.title,
    category: record.category,
    type: record.type,
    documentNo: record.documentNo,
    version: record.version,
    status: record.status,
    issueDate: dayjs(record.issueDate),
    effectiveDate: dayjs(record.effectiveDate),
    issuer: record.issuer,
    department: record.department,
    summary: record.summary,
    content: record.content,
  });
  modalVisible.value = true;
}

function handleView(record: RegulationsApi.Regulation) {
  currentRegulation.value = record;
  detailDrawerVisible.value = true;
  detailTab.value = 'attachments';
  attachmentList.value = [];
  versionList.value = [];
  uploadVersion.value = '';
  fetchAttachments(record.id);
  fetchVersions(record.id);
}

// 获取附件列表
async function fetchAttachments(id: number) {
  attachmentLoading.value = true;
  try {
    const res = await getRegulationAttachments(id);
    attachmentList.value = res || [];
  } catch (err) {
    console.warn('获取附件列表失败:', err);
    message.error($t('hse.regulations.attachment.loadFailed'));
    attachmentList.value = [];
  } finally {
    attachmentLoading.value = false;
  }
}

// 上传附件（复用 files 路由，Upload 组件 before-upload 返回 false 阻止默认行为）
async function handleUploadAttachment(file: File) {
  if (!currentRegulation.value) return false;
  attachmentUploading.value = true;
  try {
    await uploadRegulationAttachment(currentRegulation.value.id, file, {
      version: uploadVersion.value || undefined,
      uploadedBy: 'admin',
    });
    message.success($t('hse.regulations.attachment.uploadSuccess'));
    uploadVersion.value = '';
    await fetchAttachments(currentRegulation.value.id);
  } catch (err) {
    console.warn('附件上传失败:', err);
    message.error($t('hse.regulations.attachment.uploadFailed'));
  } finally {
    attachmentUploading.value = false;
  }
  return false; // 阻止 antd Upload 默认上传
}

// 删除附件（Popconfirm 确认）
async function handleDeleteAttachment(record: RegulationsApi.Attachment) {
  if (!currentRegulation.value) return;
  try {
    await deleteRegulationAttachment(currentRegulation.value.id, record.id);
    message.success($t('hse.regulations.attachment.deleteSuccess'));
    await fetchAttachments(currentRegulation.value.id);
  } catch (err) {
    console.warn('附件删除失败:', err);
    message.error($t('hse.regulations.attachment.deleteFailed'));
  }
}

// 获取历史版本
async function fetchVersions(id: number) {
  versionLoading.value = true;
  try {
    const res = await getRegulationVersions(id);
    versionList.value = res || [];
  } catch (err) {
    console.warn('获取历史版本失败:', err);
    message.error($t('hse.regulations.version.loadFailed'));
    versionList.value = [];
  } finally {
    versionLoading.value = false;
  }
}

// 报表导出（CSV Blob 下载，复用后端 /export 端点）
async function handleExport() {
  exportLoading.value = true;
  try {
    const blob = await exportRegulations();
    if (!(blob instanceof Blob)) {
      message.error($t('hse.regulations.export.failed'));
      return;
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `regulations_${dayjs().format('YYYYMMDD_HHmmss')}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    message.success($t('hse.regulations.export.success'));
  } catch (err) {
    console.warn('导出失败:', err);
    message.error($t('hse.regulations.export.failed'));
  } finally {
    exportLoading.value = false;
  }
}

async function handleSave() {
  try {
    await formRef.value?.validate();
  } catch {
    return;
  }
  if (!regulationForm.title) {
    message.warning($t('hse.regulations.validate.titleRequired'));
    return;
  }
  modalLoading.value = true;
  try {
    const data: Partial<RegulationsApi.Regulation> = {
      title: regulationForm.title,
      category: regulationForm.category,
      type: regulationForm.type,
      documentNo: regulationForm.documentNo,
      version: regulationForm.version,
      status: regulationForm.status,
      issueDate: regulationForm.issueDate?.format('YYYY-MM-DD') || '',
      effectiveDate: regulationForm.effectiveDate?.format('YYYY-MM-DD') || '',
      issuer: regulationForm.issuer,
      department: regulationForm.department,
      summary: regulationForm.summary,
      content: regulationForm.content,
    };
    if (editingRegulation.value) {
      await updateRegulation(editingRegulation.value.id, data);
      message.success('更新成功');
    } else {
      await createRegulation(data);
      message.success('创建成功');
    }
    modalVisible.value = false;
    fetchData();
    fetchStats();
  } catch (err) {
    console.warn('保存失败:', err);
    message.error($t('hse.message.saveFailed'));
  } finally {
    modalLoading.value = false;
  }
}

async function handleDelete(record: RegulationsApi.Regulation) {
  try {
    await deleteRegulation(record.id);
    message.success('删除成功');
    fetchData();
    fetchStats();
  } catch (err) {
    console.warn('删除失败:', err);
    message.error($t('hse.message.deleteFailed'));
  }
}

onMounted(() => {
  fetchStats();
  fetchData();
});
</script>

<style scoped lang="scss">
.hse-page {
  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;

    .action-group {
      display: flex;
      gap: 8px;
    }
  }

  .filter-form {
    margin-bottom: 16px;
    padding-bottom: 16px;
    border-bottom: 1px solid hsl(var(--border));
  }

  .detail-section {
    margin-bottom: 24px;

    .detail-title {
      margin: 0 0 8px 0;
      font-size: 18px;
      font-weight: 600;
    }

    .detail-row {
      display: flex;
      padding: 8px 0;
      border-bottom: 1px solid hsl(var(--border));

      .detail-label {
        width: 100px;
        color: hsl(var(--foreground) / 0.45);
        flex-shrink: 0;
      }

      .detail-value {
        flex: 1;
        color: hsl(var(--foreground));
      }
    }

    .detail-label {
      color: hsl(var(--foreground) / 0.45);
      margin-bottom: 8px;
    }

    .detail-content {
      padding: 12px;
      background: hsl(var(--muted));
      border-radius: 6px;
      color: hsl(var(--foreground));
      line-height: 1.6;
      white-space: pre-wrap;
      word-break: break-all;
    }

    .detail-content-full {
      max-height: 400px;
      overflow-y: auto;
    }
  }

  .detail-expiry-badge {
    margin-left: 8px;
  }

  .detail-tabs {
    margin-top: 8px;

    .attachment-section {
      .attachment-toolbar {
        display: flex;
        gap: 12px;
        margin-bottom: 12px;
        align-items: center;
      }
    }
  }
}
</style>
