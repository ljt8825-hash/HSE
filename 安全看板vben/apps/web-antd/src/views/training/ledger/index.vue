<template>
  <Page auto-content-height class="hse-page">
    <Row :gutter="[16, 16]" class="mb-4">
      <Col
        v-for="stat in statItems"
        :key="stat.key"
        :xs="24"
        :sm="12"
        :md="8"
        :lg="6"
        :xl="6"
      >
        <HseStatCard
          :title="stat.label"
          :value="stat.value"
          :icon="stat.icon"
          :color="stat.color"
        />
      </Col>
    </Row>

    <Card :bordered="false">
      <template #title>
        <div class="card-header">
          <span>培训记录（按培训人员汇总）</span>
          <Space>
            <ImportButtonGroup
              module="ledger"
              module-name="培训台账"
              @refresh="fetchSummary"
            />
            <Button @click="openMonthlyImport">
              <template #icon><IconifyIcon icon="lucide:file-up" /></template>
              导入月度台账
            </Button>
            <Button @click="handleExportSummary">
              <template #icon><IconifyIcon icon="lucide:download" /></template>
              导出
            </Button>
            <Button type="primary" @click="handleCreate">
              <template #icon><IconifyIcon icon="lucide:plus" /></template>
              新增记录
            </Button>
          </Space>
        </div>
      </template>

      <Form layout="inline" class="filter-form">
        <FormItem label="培训月份">
          <DatePicker
            v-model:value="monthFilter"
            picker="month"
            :allow-clear="false"
            style="width: 160px"
            @change="fetchSummary"
          />
        </FormItem>
        <FormItem label="关键词">
          <Input
            v-model:value="keyword"
            placeholder="搜索姓名/部门"
            allow-clear
            @change="handleSearch"
          />
        </FormItem>
        <FormItem>
          <Button @click="fetchSummary">查询</Button>
          <Button class="ml-2" @click="handleReset">重置</Button>
        </FormItem>
      </Form>

      <Table
        :columns="columns"
        :data-source="summaryRows"
        :loading="loading"
        :pagination="pagination"
        :row-key="(record: TrainingPersonnelApi.SummaryItem) => record.employeeId"
        @change="(handleTableChange as any)"
        size="middle"
        :scroll="{ x: 900 }"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'name'">
            {{ record.name }}
          </template>
          <template v-else-if="column.key === 'department'">
            {{ record.department }}
          </template>
          <template v-else-if="column.key === 'month'">
            {{ record.month }}
          </template>
          <template v-else-if="column.key === 'missingCount'">
            <a
              v-if="record.missingCount > 0"
              class="missing-link"
              @click="openUntrained(record as any)"
            >
              <Tag color="error">{{ record.missingCount }}</Tag>
            </a>
            <Tag v-else color="success">0</Tag>
          </template>
          <template v-else-if="column.key === 'incompleteCount'">
            <Tag :color="(record.incompleteCount || 0) > 0 ? 'warning' : 'success'">
              {{ record.incompleteCount || 0 }}
            </Tag>
          </template>
          <template v-else-if="column.key === 'action'">
            <Space>
              <Button type="link" size="small" @click="openPersonDetail(record as any)">
                查看明细
              </Button>
              <Button type="link" size="small" @click="openPersonCreate(record as any)">
                新增记录
              </Button>
            </Space>
          </template>
        </template>
      </Table>
    </Card>

    <!-- 培训人员当月培训明细抽屉 -->
    <Drawer
      v-model:open="detailDrawerVisible"
      :title="`${currentPerson?.name || ''} - ${monthLabel} 培训明细`"
      width="900px"
    >
      <template v-if="currentPerson">
        <Descriptions :column="3" bordered size="small" class="mb-4">
          <DescriptionsItem label="姓名">{{ currentPerson.name }}</DescriptionsItem>
          <DescriptionsItem label="部门">{{ currentPerson.department }}</DescriptionsItem>
          <DescriptionsItem label="岗位">{{ currentPerson.position || '-' }}</DescriptionsItem>
          <DescriptionsItem label="应培训人数">{{ currentPerson.expectedCount }}</DescriptionsItem>
          <DescriptionsItem label="实际培训人数">{{ currentPerson.actualCount }}</DescriptionsItem>
          <DescriptionsItem label="缺少人数">
            <Tag :color="currentPerson.missingCount > 0 ? 'error' : 'success'">
              {{ currentPerson.missingCount }}
            </Tag>
          </DescriptionsItem>
        </Descriptions>
        <div class="drawer-toolbar">
          <Space>
            <Button type="primary" @click="openPersonCreate(currentPerson)">
              <template #icon><IconifyIcon icon="lucide:plus" /></template>
              新增培训记录
            </Button>
            <ImportButtonGroup
              module="ledger"
              module-name="培训台账"
              @refresh="fetchPersonRecords"
            />
          </Space>
        </div>
        <Table
          :columns="detailColumns"
          :data-source="detailList"
          :loading="detailLoading"
          :pagination="detailPagination"
          :row-key="(record: LedgerApi.LedgerItem) => record.id"
          @change="(handleDetailTableChange as any)"
          size="small"
          :scroll="{ x: 1000 }"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'trainingDate'">
              {{ formatDate(record.trainingDate) }}
            </template>
            <template v-else-if="column.key === 'result'">
              <Tag :color="getResultColor(record.result)">{{ record.result }}</Tag>
            </template>
            <template v-else-if="column.key === 'name'">
              <EmployeeName v-if="record.employeeId" :employee-id="record.employeeId" />
              <span v-else>{{ record.name || '-' }}</span>
            </template>
            <template v-else-if="column.key === 'action'">
              <Space>
                <Button type="link" size="small" @click="handleView(record as any)">查看</Button>
                <Button type="link" size="small" @click="handleEdit(record as any)">编辑</Button>
                <Popconfirm
                  title="确定要删除该培训记录吗？"
                  ok-text="删除"
                  cancel-text="取消"
                  @confirm="handleDelete(record as any)"
                >
                  <Button type="link" size="small" danger>删除</Button>
                </Popconfirm>
              </Space>
            </template>
          </template>
        </Table>
      </Template>
    </Drawer>

    <Modal
      v-model:open="modalVisible"
      :title="editingRecord ? '编辑培训记录' : '新增培训记录'"
      :confirm-loading="modalLoading"
      width="720px"
      @ok="handleSave"
      @cancel="modalVisible = false"
    >
      <Form
        ref="formRef"
        :model="ledgerForm"
        :rules="(formRules as any)"
        layout="vertical"
      >
        <Row :gutter="16">
          <Col :span="12">
            <FormItem label="参训人员" name="employeeId" required>
              <EmployeeSelector v-model:value="ledgerForm.employeeId" placeholder="选择参训人员" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="培训师(培训人员)" name="trainerId">
              <EmployeeSelector v-model:value="ledgerForm.trainerId" placeholder="选择培训师" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="培训类型" name="trainingType">
              <Select
                v-model:value="ledgerForm.trainingType"
                placeholder="请选择培训类型"
                style="width: 100%"
              >
                <SelectOption v-for="opt in typeOptions" :key="opt" :value="opt">{{ opt }}</SelectOption>
              </Select>
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="培训日期" name="trainingDate">
              <Input
                v-model:value="ledgerForm.trainingDate"
                type="date"
                style="width: 100%"
              />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="时长(分钟)" name="durationMinutes">
              <InputNumber
                v-model:value="ledgerForm.durationMinutes"
                :min="0"
                style="width: 100%"
              />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="成绩" name="score">
              <InputNumber
                v-model:value="ledgerForm.score"
                :min="0"
                :max="100"
                placeholder="0-100"
                style="width: 100%"
              />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="结果" name="result">
              <Select
                v-model:value="ledgerForm.result"
                placeholder="请选择结果"
                style="width: 100%"
              >
                <SelectOption v-for="opt in resultOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</SelectOption>
              </Select>
            </FormItem>
          </Col>
          <Col :span="24">
            <FormItem label="培训内容" name="content">
              <Input.TextArea
                v-model:value="ledgerForm.content"
                :rows="3"
                placeholder="请输入培训内容"
              />
            </FormItem>
          </Col>
          <Col :span="24">
            <FormItem label="培训证明附件">
              <Upload
                :show-upload-list="true"
                :before-upload="handleUploadAttachment"
                accept=".pdf,.doc,.docx,.jpg,.png"
                list-type="text"
              >
                <Button type="primary">
                  <template #icon><IconifyIcon icon="lucide:upload" /></template>
                  上传附件
                </Button>
              </Upload>
            </FormItem>
          </Col>
          <Col :span="24">
            <FormItem label="备注" name="remark">
              <Input v-model:value="ledgerForm.remark" placeholder="请输入备注" />
            </FormItem>
          </Col>
        </Row>
      </Form>
    </Modal>

    <Drawer v-model:open="attachmentDrawerVisible" title="培训记录详情" width="720px">
      <template v-if="currentRecord">
        <Descriptions :column="1" bordered size="small">
          <DescriptionsItem label="姓名">
            <EmployeeName v-if="currentRecord.employeeId" :employee-id="currentRecord.employeeId" />
            <span v-else>{{ currentRecord.name || '-' }}</span>
          </DescriptionsItem>
          <DescriptionsItem label="部门">{{ currentRecord.department }}</DescriptionsItem>
          <DescriptionsItem label="培训师">
            {{ currentRecord.trainer || '-' }}
          </DescriptionsItem>
          <DescriptionsItem label="培训日期">
            {{ formatDate(currentRecord.trainingDate) }}
          </DescriptionsItem>
          <DescriptionsItem label="培训内容">
            {{ currentRecord.content || '-' }}
          </DescriptionsItem>
          <DescriptionsItem label="成绩">
            {{ currentRecord.score === null || currentRecord.score === undefined ? '-' : currentRecord.score }}
          </DescriptionsItem>
          <DescriptionsItem label="结果">
            <Tag :color="getResultColor(currentRecord.result)">{{ currentRecord.result }}</Tag>
          </DescriptionsItem>
          <DescriptionsItem v-if="currentRecord.remark" label="备注">
            {{ currentRecord.remark }}
          </DescriptionsItem>
        </Descriptions>
        <div class="attachment-toolbar">
          <Space>
            <span>新版本号：</span>
            <Input
              v-model:value="attachmentVersion"
              placeholder="如 1.0"
              style="width: 120px"
            />
            <Upload
              :show-upload-list="false"
              :before-upload="handleUploadAttachment"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.jpg,.png"
            >
              <Button type="primary" :loading="attachmentLoading">
                <template #icon><IconifyIcon icon="lucide:upload" /></template>
                上传附件
              </Button>
            </Upload>
          </Space>
        </div>
        <Table
          :columns="attachmentColumns"
          :data-source="attachmentList"
          :loading="attachmentLoading"
          :pagination="false"
          :row-key="(record) => record.id"
          size="small"
          :scroll="{ y: 300 }"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'fileSize'">
              {{ formatFileSize(record.fileSize) }}
            </template>
            <template v-else-if="column.key === 'isLatest'">
              <Tag v-if="record.isLatest" color="green">最新</Tag>
              <Tag v-else color="default">历史</Tag>
            </template>
            <template v-else-if="column.key === 'createdAt'">
              {{ formatDateTime(record.createdAt) }}
            </template>
            <template v-else-if="column.key === 'action'">
              <Space>
                <Button type="link" size="small" @click="handlePreviewAttachment(record as any)">
                  预览/下载
                </Button>
                <Popconfirm
                  title="确定要删除该附件吗？"
                  ok-text="删除"
                  cancel-text="取消"
                  @confirm="handleDeleteAttachment(record as any)"
                >
                  <Button type="link" size="small" danger>删除</Button>
                </Popconfirm>
              </Space>
            </template>
          </template>
        </Table>
        <div v-if="attachmentList.length === 0 && !attachmentLoading" class="empty-tip">
          暂无培训证明附件，点击右上角上传
        </div>
      </template>
    </Drawer>

    <!-- 缺少人数弹窗：未培训人员名单（在岗 / 离职） -->
    <Modal
      v-model:open="untrainedModalVisible"
      :title="untrainedModalTitle"
      :footer="null"
      width="560px"
    >
      <div v-if="untrainedLoading" class="modal-loading">加载中...</div>
      <template v-else>
        <div class="untrained-section">
          <div class="untrained-section-title">在岗未培训（{{ untrainedInpost.length }}）</div>
          <div v-if="untrainedInpost.length === 0" class="untrained-empty">无</div>
          <Space v-else wrap>
            <Tag v-for="u in untrainedInpost" :key="u.name" color="orange">{{ u.name }}</Tag>
          </Space>
        </div>
        <div class="untrained-section">
          <div class="untrained-section-title">已离职未培训（{{ untrainedDeparted.length }}）</div>
          <div v-if="untrainedDeparted.length === 0" class="untrained-empty">无</div>
          <Space v-else wrap>
            <Tag v-for="u in untrainedDeparted" :key="u.name" color="default">{{ u.name }}</Tag>
          </Space>
        </div>
      </template>
    </Modal>

    <!-- 月度培训台账导入弹窗 -->
    <Modal
      v-model:open="monthlyImportVisible"
      title="导入月度培训台账"
      :footer="null"
      width="560px"
    >
      <div class="monthly-import-tip">
        <p>上传《月度考核结果》Excel 中的「月度培训台账」工作表，将按培训人汇总后覆盖写入当前月份（{{ monthFilter }}）。</p>
        <p>字段对应：培训人数→应培训、未培训人数→实际、缺少签字人数→缺少、资料不完整→资料不完整。</p>
      </div>
      <Upload
        :show-upload-list="false"
        :before-upload="handleMonthlyImport"
        accept=".xlsx,.xls"
        :disabled="monthlyImportLoading"
      >
        <div class="monthly-import-upload">
          <IconifyIcon icon="lucide:upload-cloud" class="upload-icon" />
          <p class="upload-text">
            <span v-if="monthlyImportLoading">导入中...</span>
            <span v-else>点击或拖拽 Excel 文件到此处上传</span>
          </p>
          <p class="upload-hint">支持 .xlsx / .xls 格式</p>
        </div>
      </Upload>
      <Alert
        v-if="monthlyImportResult"
        :type="monthlyImportResult.ok ? 'success' : 'error'"
        show-icon
        class="mt-3"
      >
        <template #message>
          <div v-if="monthlyImportResult.ok">
            导入成功：{{ monthlyImportResult.trainers }} 名培训人，应培训 {{ monthlyImportResult.expectedTotal }}、
            实际 {{ monthlyImportResult.actualTotal }}、缺少 {{ monthlyImportResult.missingTotal }}、
            资料不完整 {{ monthlyImportResult.incompleteTotal }}
            <span v-if="monthlyImportResult.unmatched?.length">
              ；未匹配姓名：{{ monthlyImportResult.unmatched.join('、') }}
            </span>
          </div>
          <div v-else>{{ monthlyImportResult.message }}</div>
        </template>
      </Alert>
    </Modal>
  </Page>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import {
  Card,
  Row,
  Col,
  Table,
  Form,
  FormItem,
  Input,
  InputNumber,
  Select,
  SelectOption,
  DatePicker,
  Button,
  Modal,
  Drawer,
  Tag,
  Space,
  message,
  Popconfirm,
  Descriptions,
  DescriptionsItem,
  Upload,
  Alert,
} from 'ant-design-vue';
import type { FormInstance } from 'ant-design-vue';
import { IconifyIcon } from '@vben/icons';
import { Page } from '@vben/common-ui';
import dayjs from 'dayjs';
import HseStatCard from '#/components/hse/StatCard.vue';
import ImportButtonGroup from '#/components/hse/ImportButtonGroup.vue';
import EmployeeSelector from '#/components/hse/EmployeeSelector.vue';
import { EmployeeName } from '#/composables/hse';
import {
  createLedger,
  updateLedger,
  deleteLedger,
  type LedgerApi,
  getTrainingPersonnelSummary,
  getTrainingPersonnelRecords,
  getTrainingPersonnelSummaryUntrained,
  exportTrainingPersonnelSummary,
  importTrainingLedgerMonthly,
  type TrainingPersonnelApi,
  getTrainingAttachments,
  uploadTrainingAttachment,
  deleteTrainingAttachment,
  getAssessmentGrades,
  type AssessmentGradeRule,
  type TrainingAttachment,
} from '#/api/hse/training';

// ========== 汇总 ==========
const loading = ref(false);
const summaryList = ref<TrainingPersonnelApi.SummaryItem[]>([]);
const keyword = ref('');
const monthFilter = ref(dayjs().format('YYYY-MM'));
const monthLabel = computed(() => monthFilter.value);
const pagination = reactive({ page: 1, pageSize: 15, total: 0, showSizeChanger: true });

const columns = [
  { title: '姓名', dataIndex: 'name', key: 'name', width: 100, fixed: 'left' as const },
  { title: '部门', dataIndex: 'department', key: 'department', width: 160, ellipsis: true },
  { title: '培训日期', dataIndex: 'month', key: 'month', width: 110 },
  { title: '应培训人数', dataIndex: 'expectedCount', key: 'expectedCount', width: 110 },
  { title: '实际培训人数', dataIndex: 'actualCount', key: 'actualCount', width: 110 },
  { title: '缺少人数', dataIndex: 'missingCount', key: 'missingCount', width: 110 },
  { title: '资料不完整', dataIndex: 'incompleteCount', key: 'incompleteCount', width: 110 },
  { title: '操作', key: 'action', width: 170, fixed: 'right' as const },
];

const summaryRows = computed(() => {
  if (!keyword.value.trim()) return summaryList.value;
  const kw = keyword.value.trim();
  return summaryList.value.filter(
    (r) => r.name.includes(kw) || (r.department || '').includes(kw),
  );
});

const statItems = computed(() => [
  {
    key: 'total',
    label: '培训人员数',
    value: summaryList.value.length,
    color: 'blue' as const,
    icon: 'lucide:users',
  },
  {
    key: 'expected',
    label: '应培训总数',
    value: summaryList.value.reduce((s, r) => s + (r.expectedCount || 0), 0),
    color: 'orange' as const,
    icon: 'lucide:target',
  },
  {
    key: 'actual',
    label: '实际培训总数',
    value: summaryList.value.reduce((s, r) => s + (r.actualCount || 0), 0),
    color: 'green' as const,
    icon: 'lucide:circle-check',
  },
  {
    key: 'missing',
    label: '缺少人数总数',
    value: summaryList.value.reduce((s, r) => s + Math.max(r.missingCount || 0, 0), 0),
    color: 'red' as const,
    icon: 'lucide:alert-triangle',
  },
]);

async function fetchSummary() {
  loading.value = true;
  try {
    const res = await getTrainingPersonnelSummary(monthFilter.value);
    summaryList.value = res.list || [];
    pagination.total = res.total || summaryList.value.length;
  } catch (err) {
    console.warn('获取培训人员汇总失败:', err);
    message.error('获取培训人员汇总失败');
    summaryList.value = [];
    pagination.total = 0;
  } finally {
    loading.value = false;
  }
}

function handleSearch() {
  fetchSummary();
}

function handleReset() {
  keyword.value = '';
  monthFilter.value = dayjs().format('YYYY-MM');
  fetchSummary();
}

// ========== 缺少人数弹窗（未培训名单：在岗/离职） ==========
const untrainedModalVisible = ref(false);
const untrainedLoading = ref(false);
const untrainedInpost = ref<TrainingPersonnelApi.UntrainedItem[]>([]);
const untrainedDeparted = ref<TrainingPersonnelApi.UntrainedItem[]>([]);
const untrainedModalTitle = ref('未培训人员名单');

async function openUntrained(row: TrainingPersonnelApi.SummaryItem) {
  untrainedModalVisible.value = true;
  untrainedLoading.value = true;
  untrainedInpost.value = [];
  untrainedDeparted.value = [];
  untrainedModalTitle.value = `${row.name || ''} - ${monthFilter.value} 未培训人员名单`;
  try {
    const res = await getTrainingPersonnelSummaryUntrained(row.employeeId, monthFilter.value);
    const list = res?.list || [];
    untrainedInpost.value = list.filter((u) => u.status === 'inpost');
    untrainedDeparted.value = list.filter((u) => u.status === 'departed');
  } catch (err) {
    console.warn('获取未培训名单失败:', err);
    message.error('获取未培训名单失败');
  } finally {
    untrainedLoading.value = false;
  }
}

// ========== 人员汇总导出（含未培训姓名及离职/在岗状态） ==========
async function handleExportSummary() {
  try {
    const blob = await exportTrainingPersonnelSummary(monthFilter.value);
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `培训人员汇总_${monthFilter.value}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  } catch (err) {
    console.warn('导出失败:', err);
    message.error('导出失败');
  }
}

function handleTableChange(pag: { current: number; pageSize: number }) {
  pagination.page = pag.current;
  pagination.pageSize = pag.pageSize;
}

// ========== 月度培训台账导入 ==========
const monthlyImportVisible = ref(false);
const monthlyImportLoading = ref(false);
const monthlyImportResult = ref<{
  ok: boolean;
  message?: string;
  trainers?: number;
  unmatched?: string[];
  expectedTotal?: number;
  actualTotal?: number;
  missingTotal?: number;
  incompleteTotal?: number;
} | null>(null);

function openMonthlyImport() {
  monthlyImportResult.value = null;
  monthlyImportVisible.value = true;
}

async function handleMonthlyImport(file: File) {
  monthlyImportLoading.value = true;
  monthlyImportResult.value = null;
  try {
    const res = await importTrainingLedgerMonthly(file, monthFilter.value);
    const data = res as any;
    monthlyImportResult.value = {
      ok: true,
      trainers: data.trainers,
      unmatched: data.unmatched || [],
      expectedTotal: data.expectedTotal,
      actualTotal: data.actualTotal,
      missingTotal: data.missingTotal,
      incompleteTotal: data.incompleteTotal,
    };
    message.success(`月度培训台账导入成功（${data.trainers} 名培训人）`);
    fetchSummary();
  } catch (err: any) {
    console.warn('月度培训台账导入失败:', err);
    const msg = err?.message || '导入失败';
    monthlyImportResult.value = { ok: false, message: msg };
    message.error(msg);
  } finally {
    monthlyImportLoading.value = false;
  }
  return false;
}

// ========== 培训人员当月明细 ==========
const detailDrawerVisible = ref(false);
const currentPerson = ref<TrainingPersonnelApi.SummaryItem | null>(null);
const detailList = ref<LedgerApi.LedgerItem[]>([]);
const detailLoading = ref(false);
const detailPagination = reactive({ page: 1, pageSize: 10, total: 0, showSizeChanger: true });

const detailColumns = [
  { title: '姓名', dataIndex: 'name', key: 'name', width: 100 },
  { title: '部门', dataIndex: 'department', key: 'department', width: 140 },
  { title: '培训类型', dataIndex: 'trainingType', key: 'trainingType', width: 110 },
  { title: '培训日期', key: 'trainingDate', width: 120 },
  { title: '培训内容', dataIndex: 'content', key: 'content', width: 200, ellipsis: true },
  { title: '成绩', dataIndex: 'score', key: 'score', width: 80 },
  { title: '结果', key: 'result', width: 90 },
  { title: '操作', key: 'action', width: 200, fixed: 'right' as const },
];

function openPersonDetail(row: TrainingPersonnelApi.SummaryItem) {
  currentPerson.value = row;
  detailDrawerVisible.value = true;
  detailPagination.page = 1;
  fetchPersonRecords();
}

async function fetchPersonRecords() {
  if (!currentPerson.value) return;
  detailLoading.value = true;
  try {
    const res = await getTrainingPersonnelRecords(
      currentPerson.value.employeeId,
      monthFilter.value,
      detailPagination.page,
      detailPagination.pageSize,
    );
    detailList.value = res.list || [];
    detailPagination.total = res.total || 0;
  } catch (err) {
    console.warn('获取明细失败:', err);
    message.error('获取培训明细失败');
    detailList.value = [];
  } finally {
    detailLoading.value = false;
  }
}

function handleDetailTableChange(pag: { current: number; pageSize: number }) {
  detailPagination.page = pag.current;
  detailPagination.pageSize = pag.pageSize;
  fetchPersonRecords();
}

// ========== 新增/编辑 ==========
const modalVisible = ref(false);
const modalLoading = ref(false);
const editingRecord = ref<LedgerApi.LedgerItem | null>(null);
const ledgerForm = reactive({
  employeeId: null as any,
  trainerId: null as any,
  name: '',
  department: '',
  position: '',
  trainingType: undefined as string | undefined,
  trainingDate: '',
  durationMinutes: 0,
  content: '',
  score: null as any,
  result: undefined as string | undefined,
  remark: '',
  trainer: '',
});
const formRef = ref<FormInstance>();

const typeOptions = ['HSE', '太行', '新员工', '驾驶员'];

const formRules = {
  employeeId: [{ required: true, message: '请选择参训人员', trigger: 'change' }],
  trainingDate: [{ required: true, message: '请选择培训日期', trigger: 'change' }],
};

const assessmentGradeRules = ref<AssessmentGradeRule[]>([]);
const legacyResultOptions = [{ value: '缺勤', label: '缺勤' }];
const resultOptions = computed(() => {
  const ruleOpts = assessmentGradeRules.value.map((g) => ({ value: g.label, label: g.label }));
  const merged = [...ruleOpts];
  legacyResultOptions.forEach((o) => {
    if (!merged.find((m) => m.value === o.value)) merged.push(o);
  });
  return merged;
});
async function fetchRuleGrades() {
  try {
    const grades = await getAssessmentGrades();
    assessmentGradeRules.value = grades || [];
  } catch (e) {
    assessmentGradeRules.value = [];
  }
}

function openPersonCreate(row: TrainingPersonnelApi.SummaryItem) {
  editingRecord.value = null;
  Object.assign(ledgerForm, {
    employeeId: null,
    trainerId: row.employeeId,
    trainer: row.name,
    name: '',
    department: row.department || '',
    position: '',
    trainingType: undefined,
    trainingDate: dayjs().format('YYYY-MM-DD'),
    durationMinutes: 0,
    content: '',
    score: null,
    result: undefined,
    remark: '',
  });
  modalVisible.value = true;
}

function handleCreate() {
  editingRecord.value = null;
  Object.assign(ledgerForm, {
    employeeId: null,
    trainerId: null,
    trainer: '',
    name: '',
    department: '',
    position: '',
    trainingType: undefined,
    trainingDate: dayjs().format('YYYY-MM-DD'),
    durationMinutes: 0,
    content: '',
    score: null,
    result: undefined,
    remark: '',
  });
  modalVisible.value = true;
}

function handleEdit(record: LedgerApi.LedgerItem) {
  editingRecord.value = record;
  Object.assign(ledgerForm, {
    employeeId: record.employeeId || null,
    trainerId: record.trainerId || null,
    trainer: record.trainer || '',
    name: record.name || '',
    department: record.department || '',
    position: record.position || '',
    trainingType: record.trainingType,
    trainingDate: record.trainingDate
      ? dayjs(record.trainingDate).format('YYYY-MM-DD')
      : '',
    durationMinutes: record.durationMinutes,
    content: record.content || '',
    score: record.score,
    result: record.result,
    remark: record.remark || '',
  });
  modalVisible.value = true;
}

async function handleSave() {
  try {
    await formRef.value?.validate();
  } catch {
    return;
  }
  if (!ledgerForm.employeeId) {
    message.warning('请选择参训人员');
    return;
  }
  modalLoading.value = true;
  try {
    const data: Partial<LedgerApi.LedgerItem> = {
      employeeId: ledgerForm.employeeId,
      trainerId: ledgerForm.trainerId,
      name: ledgerForm.name,
      department: ledgerForm.department,
      position: ledgerForm.position,
      trainingType: ledgerForm.trainingType,
      trainingDate: ledgerForm.trainingDate,
      durationMinutes: ledgerForm.durationMinutes,
      content: ledgerForm.content,
      score: ledgerForm.score,
      result: ledgerForm.result,
      remark: ledgerForm.remark,
      trainer: ledgerForm.trainer,
    };
    if (editingRecord.value) {
      await updateLedger(editingRecord.value.id, data);
    } else {
      await createLedger(data);
    }
    message.success('保存成功');
    modalVisible.value = false;
    await fetchSummary();
    if (detailDrawerVisible.value) fetchPersonRecords();
  } catch (err) {
    console.warn('保存失败:', err);
    message.error('保存失败');
  } finally {
    modalLoading.value = false;
  }
}

async function handleDelete(record: LedgerApi.LedgerItem) {
  try {
    await deleteLedger(record.id);
    message.success('删除成功');
    if (detailDrawerVisible.value) fetchPersonRecords();
  } catch (err) {
    console.warn('删除失败:', err);
    message.error('删除失败');
  }
}

// ========== 详情/附件 ==========
const attachmentDrawerVisible = ref(false);
const currentRecord = ref<LedgerApi.LedgerItem | null>(null);
const attachmentList = ref<TrainingAttachment[]>([]);
const attachmentLoading = ref(false);
const attachmentVersion = ref('1.0');

const attachmentColumns = [
  { title: '文件名', dataIndex: 'originalName', key: 'originalName', ellipsis: true },
  { title: '版本', dataIndex: 'version', key: 'version', width: 90 },
  { title: '大小', key: 'fileSize', width: 100 },
  { title: '状态', key: 'isLatest', width: 90 },
  { title: '上传时间', key: 'createdAt', width: 160 },
  { title: '操作', key: 'action', width: 140 },
];

function handleView(record: LedgerApi.LedgerItem) {
  currentRecord.value = record;
  attachmentDrawerVisible.value = true;
  attachmentList.value = [];
  fetchAttachments(record.id);
}

async function fetchAttachments(recordId: number) {
  attachmentLoading.value = true;
  attachmentList.value = [];
  try {
    const res = await getTrainingAttachments(recordId);
    attachmentList.value = Array.isArray(res) ? res : [];
  } catch (err) {
    console.warn('获取附件失败:', err);
  } finally {
    attachmentLoading.value = false;
  }
}

async function handleUploadAttachment(file: File) {
  if (!currentRecord.value) return false;
  attachmentLoading.value = true;
  try {
    await uploadTrainingAttachment(currentRecord.value.id, file, {
      version: attachmentVersion.value || '1.0',
    });
    message.success('附件上传成功');
    await fetchAttachments(currentRecord.value.id);
  } catch (err) {
    console.warn('附件上传失败:', err);
    message.error('附件上传失败');
  } finally {
    attachmentLoading.value = false;
  }
  return false;
}

async function handleDeleteAttachment(record: TrainingAttachment) {
  if (!currentRecord.value) return;
  try {
    await deleteTrainingAttachment(currentRecord.value.id, record.id);
    message.success('附件已删除');
    await fetchAttachments(currentRecord.value.id);
  } catch (err) {
    console.warn('删除附件失败:', err);
    message.error('删除附件失败');
  }
}

function handlePreviewAttachment(record: TrainingAttachment) {
  if (!record.fileUrl) {
    message.warning('文件路径无效');
    return;
  }
  window.open(record.fileUrl, '_blank');
}

// ========== 工具 ==========
function formatDate(date: string): string {
  if (!date) return '-';
  return dayjs(date).format('YYYY-MM-DD');
}
function formatDateTime(date: string): string {
  if (!date) return '-';
  return dayjs(date).format('YYYY-MM-DD HH:mm');
}
function formatFileSize(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${['B', 'KB', 'MB', 'GB'][i]}`;
}
function getResultColor(result: string): string {
  const grade = assessmentGradeRules.value.find((g) => g.label === result);
  if (grade?.semanticColor) return grade.semanticColor;
  const map: Record<string, string> = {
    优秀: 'gold',
    良好: 'cyan',
    合格: 'green',
    不合格: 'red',
    缺勤: 'orange',
  };
  return map[result] || 'default';
}

onMounted(() => {
  fetchRuleGrades();
  fetchSummary();
});
</script>

<style scoped lang="scss">
.hse-page {
  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
  }

  .filter-form {
    margin-bottom: 16px;
    padding-bottom: 16px;
    border-bottom: 1px solid hsl(var(--border));
  }

  .drawer-toolbar {
    margin-bottom: 16px;
  }

  .attachment-toolbar {
    margin: 16px 0;
  }

  .empty-tip {
    margin-top: 16px;
    text-align: center;
    color: hsl(var(--muted-foreground));
  }

  .missing-link {
    cursor: pointer;
    display: inline-block;
  }

  .modal-loading {
    padding: 24px 0;
    text-align: center;
    color: hsl(var(--muted-foreground));
  }

  .untrained-section {
    margin-bottom: 16px;
  }

  .untrained-section-title {
    font-weight: 600;
    margin-bottom: 8px;
  }

  .untrained-empty {
    color: hsl(var(--muted-foreground));
    font-size: 13px;
    padding: 4px 0;
  }

  .monthly-import-tip {
    margin-bottom: 16px;
    color: hsl(var(--muted-foreground));
    font-size: 13px;
    line-height: 1.7;
    p {
      margin: 0 0 4px;
    }
  }

  .monthly-import-upload {
    border: 1px dashed hsl(var(--border));
    border-radius: 8px;
    padding: 28px 16px;
    text-align: center;
    cursor: pointer;
    transition: border-color 0.2s;
    &:hover {
      border-color: hsl(var(--primary));
    }
    .upload-icon {
      font-size: 32px;
      color: hsl(var(--muted-foreground));
      margin-bottom: 8px;
    }
    .upload-text {
      font-size: 14px;
      color: hsl(var(--foreground));
    }
    .upload-hint {
      font-size: 12px;
      color: hsl(var(--muted-foreground));
      margin-top: 4px;
    }
  }
}
</style>