<template>
  <Page auto-content-height class="hse-page">
    <SortableStatRow v-if="hasVisibleStats" page-key="training">
      <template v-if="statsLoading">
        <Col :xs="24" :sm="12" :md="8" :lg="6" :xl="6" v-for="i in 4" :key="`skel-${i}`">
          <Card :bordered="false">
            <Skeleton active :paragraph="{ rows: 2 }" />
          </Card>
        </Col>
      </template>
      <template v-else>
        <Col :xs="24" :sm="12" :md="8" :lg="6" :xl="6" v-for="stat in statItems" :key="stat.key" class="sortable-stat-col" :data-stat-key="stat.key" v-show="isStatVisible(stat.key)">
          <HseStatCard
            :title="stat.label"
            :value="stat.value"
            :icon="stat.icon"
            :color="(stat.color as any)"
          />
        </Col>
      </template>
    </SortableStatRow>

    <Card :bordered="false">
      <template #title>
        <div class="card-header">
          <span>培训管理</span>
          <div class="header-buttons">
            <Space :size="8">
              <HelpButton menuCode="HSE_TRAINING_LIST" />
              <ImportButtonGroup v-if="isActionVisible('import')" module="training" module-name="培训计划" @refresh="fetchData" />
            <Button v-if="isActionVisible('exportRecords')" :loading="exporting" @click="handleExportRecords">
              <template #icon><IconifyIcon icon="lucide:download" /></template>
              导出记录
            </Button>
            <Button v-if="isActionVisible('exportLedger')" :loading="exporting" @click="handleExportLedger">
              <template #icon><IconifyIcon icon="lucide:file-text" /></template>
              导出台账
            </Button>
            <Button v-if="isActionVisible('create')" :type="'primary'" @click="handleCreate">
              <template #icon><IconifyIcon icon="lucide:plus" /></template>
              新增培训
            </Button>
            <ComponentVisibilitySettings
              title="培训管理显示设置"
              v-model:model-value="config"
              :stat-items="visibilityStatItems"
              :action-buttons="actionButtons"
              @reset="resetToDefault"
            />
            </Space>
          </div>
        </div>
      </template>

      <Form v-if="isFilterVisible" layout="inline" class="filter-form">
        <FormItem label="关键词">
          <Input
            v-model:value="searchForm.keyword"
            placeholder="搜索标题/培训师"
            allow-clear
            @change="handleSearch"
          />
        </FormItem>
        <FormItem label="培训类型">
          <Select
            v-model:value="searchForm.type"
            placeholder="全部类型"
            allow-clear
            @change="handleSearch"
          >
            <SelectOption v-for="opt in typeOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</SelectOption>
          </Select>
        </FormItem>
        <FormItem label="状态">
          <Select
            v-model:value="searchForm.status"
            placeholder="全部状态"
            allow-clear
            @change="handleSearch"
          >
            <SelectOption v-for="opt in statusOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</SelectOption>
          </Select>
        </FormItem>
        <FormItem>
          <Button @click="handleReset">重置</Button>
        </FormItem>
      </Form>

      <Table
        ref="tableRef"
        :columns="tableColumns"
        :data-source="dataList"
        :loading="loading"
        :pagination="{
          current: pagination.current,
          pageSize: pagination.pageSize,
          total: total,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (t) => `共 ${t} 条记录`,
        }"
        :row-key="(record) => record.id"
        @change="handleTableChange"
        size="middle"
        :scroll="{ x: 1410 }"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'trainingType'">
            <Tag :color="getTypeColor(record.trainingType)">
              {{ getTypeText(record.trainingType) }}
            </Tag>
          </template>
          <template v-else-if="column.key === 'result'">
            <Tag :color="getStatusColor(record.result)">
              {{ getStatusText(record.result) }}
            </Tag>
          </template>
          <template v-else-if="column.key === 'score'">
            <span>{{ record.score != null ? `${record.score} 分` : '-' }}</span>
          </template>
          <template v-else-if="column.key === 'dateRange'">
            {{ record.trainingDate ? formatDate(record.trainingDate) : '-' }}
          </template>
          <template v-else-if="column.key === 'expiryStatus'">
            <Badge
              :status="getExpiryBadgeStatus(record.expiryStatus)"
              :text="getExpiryStatusText(record.expiryStatus)"
            />
          </template>
          <template v-else-if="column.key === 'duration'">
            {{ record.durationMinutes }} 学时
          </template>
          <template v-else-if="column.key === 'idCard'">
            <span>{{ record.idCard || '-' }}</span>
          </template>
          <template v-else-if="column.key === 'action'">
            <Space>
              <Button :type="'link'" size="small" @click="handleView(record as any)">查看</Button>
              <Button :type="'link'" size="small" @click="handleEdit(record as any)">编辑</Button>
              <Popconfirm
                title="确定要删除该培训计划吗？"
                ok-text="删除"
                cancel-text="取消"
                @confirm="handleDelete(record as any)"
              >
                <Button :type="'link'" size="small" danger>删除</Button>
              </Popconfirm>
            </Space>
          </template>
        </template>
      </Table>
    </Card>

    <Modal
      v-model:open="modalVisible"
      :title="editingTraining ? '编辑培训' : '新增培训'"
      :confirm-loading="modalLoading"
      width="720px"
      @ok="handleSave"
      @cancel="modalVisible = false"
    >
      <Form ref="formRef" :model="trainingForm" :rules="(formRules as any)" layout="vertical">
        <Row :gutter="16">
          <Col :span="24">
            <FormItem label="培训标题" required>
              <Input v-model:value="trainingForm.title" placeholder="请输入培训标题" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="培训类型" required>
              <Select v-model:value="trainingForm.type" placeholder="请选择类型" style="width: 100%">
                <SelectOption v-for="opt in typeOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</SelectOption>
              </Select>
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="目标人群">
              <Input v-model:value="trainingForm.targetAudience" placeholder="如：全员/新员工/特种作业人员" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="培训师" required>
              <Input v-model:value="trainingForm.trainer" placeholder="请输入培训师姓名" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="计划人数">
              <InputNumber v-model:value="trainingForm.plannedAttendees" :min="1" style="width: 100%" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="开始日期">
              <DatePicker v-model:value="trainingForm.startDate" style="width: 100%" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="结束日期">
              <DatePicker v-model:value="trainingForm.endDate" style="width: 100%" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="培训地点">
              <Input v-model:value="trainingForm.location" placeholder="请输入培训地点" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="时长(学时)">
              <InputNumber v-model:value="trainingForm.duration" :min="0.5" :step="0.5" style="width: 100%" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="是否需要考试">
              <Select v-model:value="(trainingForm.examRequired as any)" style="width: 100%">
                <SelectOption :value="true">需要</SelectOption>
                <SelectOption :value="false">不需要</SelectOption>
              </Select>
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem v-if="trainingForm.examRequired" label="及格分数">
              <InputNumber v-model:value="trainingForm.passScore" :min="0" :max="100" style="width: 100%" />
            </FormItem>
          </Col>
          <Col :span="24">
            <FormItem label="培训内容">
              <Textarea
                v-model:value="trainingForm.content"
                :rows="3"
                placeholder="请输入培训内容大纲"
              />
            </FormItem>
          </Col>
          <Col :span="24">
            <FormItem label="备注">
              <Textarea v-model:value="trainingForm.remark" :rows="2" placeholder="其他说明" />
            </FormItem>
          </Col>
        </Row>
      </Form>
    </Modal>

    <Drawer v-model:open="detailDrawerVisible" title="培训详情" width="820px" @close="handleDetailClose">
      <template v-if="currentTraining">
        <Tabs v-model:activeKey="detailTab">
          <TabPane key="info" tab="基本信息">
            <Descriptions :column="1" bordered size="small">
              <DescriptionsItem label="培训标题">{{ currentTraining.name }}</DescriptionsItem>
              <DescriptionsItem label="培训类型">
                <Tag :color="getTypeColor(currentTraining.trainingType)">
                  {{ getTypeText(currentTraining.trainingType) }}
                </Tag>
              </DescriptionsItem>
              <DescriptionsItem label="培训结果">
                <Tag :color="getStatusColor(currentTraining.result)">
                  {{ getStatusText(currentTraining.result) }}
                </Tag>
              </DescriptionsItem>
              <DescriptionsItem label="部门/岗位">{{ currentTraining.department }} / {{ currentTraining.position }}</DescriptionsItem>
              <DescriptionsItem label="培训师">{{ currentTraining.trainer }}</DescriptionsItem>
              <DescriptionsItem label="培训日期">
                {{ currentTraining.trainingDate ? formatDate(currentTraining.trainingDate) : '-' }}
              </DescriptionsItem>
              <DescriptionsItem label="培训时长">{{ currentTraining.durationMinutes }} 学时</DescriptionsItem>
              <DescriptionsItem label="时效状态">
                <Badge
                  :status="getExpiryBadgeStatus((currentTraining as any).expiryStatus)"
                  :text="getExpiryStatusText((currentTraining as any).expiryStatus)"
                />
              </DescriptionsItem>
              <DescriptionsItem label="考试成绩">
                {{ currentTraining.score != null ? `${currentTraining.score} 分` : '未记录' }}
              </DescriptionsItem>
              <DescriptionsItem label="培训内容">{{ currentTraining.content }}</DescriptionsItem>
              <DescriptionsItem v-if="currentTraining.remark" label="备注">
                {{ currentTraining.remark }}
              </DescriptionsItem>
            </Descriptions>

            <div class="records-section">
              <div class="records-title">
                <span>培训记录</span>
                <Tag color="blue">{{ trainingRecords.length }} 条</Tag>
              </div>
              <Table
                :columns="recordColumns"
                :data-source="trainingRecords"
                :loading="recordsLoading"
                :pagination="false"
                :row-key="(record) => record.id"
                size="small"
                :scroll="{ y: 320 }"
              >
                <template #bodyCell="{ column, record }">
                  <template v-if="column.key === 'attendStatus'">
                    <Tag :color="getAttendStatusColor(record.attendStatus)">
                      {{ getAttendStatusText(record.attendStatus) }}
                    </Tag>
                  </template>
                  <template v-else-if="column.key === 'examResult'">
                    <Tag v-if="record.examResult" :color="getExamResultColor(record.examResult)">
                      {{ getExamResultText(record.examResult) }}
                    </Tag>
                    <span v-else>-</span>
                  </template>
                  <template v-else-if="column.key === 'traineeName'">
                    <EmployeeName v-if="record.employeeId" :employee-id="record.employeeId" />
                    <span v-else>{{ record.traineeName || '-' }}</span>
                  </template>
                </template>
              </Table>
            </div>
          </TabPane>

          <TabPane key="attachments" tab="附件列表">
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
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip"
                >
                  <Button :type="'primary'" :loading="attachmentLoading">
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
              :scroll="{ y: 360 }"
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
                    <Button :type="'link'" size="small" @click="handlePreviewAttachment(record as any)">
                      预览/下载
                    </Button>
                    <Popconfirm
                      title="确定要删除该附件吗？"
                      ok-text="删除"
                      cancel-text="取消"
                      @confirm="handleDeleteAttachment(record as any)"
                    >
                      <Button :type="'link'" size="small" danger>删除</Button>
                    </Popconfirm>
                  </Space>
                </template>
              </template>
            </Table>
            <div v-if="attachmentList.length === 0 && !attachmentLoading" class="empty-tip">
              暂无附件，点击右上角上传
            </div>
          </TabPane>

          <TabPane key="versions" tab="历史版本">
            <Table
              :columns="versionColumns"
              :data-source="versionList"
              :loading="versionLoading"
              :pagination="false"
              :row-key="(record) => record.id"
              size="small"
              :scroll="{ y: 360 }"
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
            <div v-if="versionList.length === 0 && !versionLoading" class="empty-tip">
              暂无版本变更记录
            </div>
          </TabPane>
        </Tabs>
      </template>
    </Drawer>

  </Page>
</template>

<script setup lang="ts">
import { ref, reactive, nextTick, onMounted, computed } from 'vue';
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
  InputNumber,
  Textarea,
  message,
  Popconfirm,
  Space,
  Descriptions,
  DescriptionsItem,
  Skeleton,
  Tabs,
  TabPane,
  Upload,
} from 'ant-design-vue';
import type { FormInstance } from 'ant-design-vue';
import { IconifyIcon } from '@vben/icons';
import { Page } from '@vben/common-ui';
import { HelpButton } from '#/components/hse';
import HseStatCard from '#/components/hse/StatCard.vue';
import ImportButtonGroup from '#/components/hse/ImportButtonGroup.vue';
import SortableStatRow from '#/components/hse/SortableStatRow.vue';
import ComponentVisibilitySettings from '#/components/hse/ComponentVisibilitySettings.vue';
import { useTableColumnSettings } from '#/composables/useTableColumnSettings';
import { useComponentVisibility } from '#/composables/useComponentVisibility';
import { useSearchForm, useDataTable, EmployeeName } from '#/composables/hse';
import dayjs, { type Dayjs } from 'dayjs';
import { $t } from '#/locales';

import {
  getTrainingPlanList,
  getTrainingStats,
  createTrainingPlan,
  updateTrainingPlan,
  deleteTrainingPlan,
  getTrainingRecords,
  getTrainingAttachments,
  uploadTrainingAttachment,
  deleteTrainingAttachment,
  getTrainingVersions,
  exportTrainingRecords,
  exportTrainingLedger,
  getTrainingTypes,
  getPlanStatusFlow,
  type TrainingApi,
  type TrainingAttachment,
  type TrainingVersionRecord,
  type ExpiryStatus,
  type TrainingTypeRule,
  type PlanStatusFlowRule,
} from '#/api/hse/training';

const {
  loading,
  dataList,
  total,
  pagination,
  fetchData,
  handleTableChange,
  handleReset: tableHandleReset,
} = useDataTable<TrainingApi.TrainingPlanItem>({
  fetchFn: async ({ page, pageSize }) => {
    const params: TrainingApi.TrainingListParams = {
      page,
      pageSize,
      keyword: searchForm.keyword || undefined,
      type: searchForm.type,
      status: searchForm.status,
    };
    const res = await getTrainingPlanList(params);
    await fetchStats();
    return { list: res.list || [], total: res.total || 0 };
  },
  defaultPageSize: 10,
});

const { form: searchForm, reset: resetSearch } = useSearchForm<{
  keyword: string;
  type: string | undefined;
  status: string | undefined;
}>({
  defaults: {
    keyword: '',
    type: undefined,
    status: undefined,
  },
  onSearch: () => tableHandleReset(),
});

const statsLoading = ref(false);

const modalVisible = ref(false);
const modalLoading = ref(false);
const editingTraining = ref<TrainingApi.TrainingPlanItem | null>(null);
const trainingForm = reactive({
  title: '',
  type: 'safety' as TrainingApi.TrainingPlanForm['type'],
  targetAudience: '',
  trainer: '',
  plannedAttendees: 30,
  startDate: undefined as Dayjs | undefined,
  endDate: undefined as Dayjs | undefined,
  location: '',
  duration: 4,
  content: '',
  examRequired: false,
  passScore: 60,
  remark: '',
});

const formRef = ref<FormInstance>();

const formRules = {
  title: [
    { required: true, message: '请输入培训标题', trigger: 'blur' },
    { min: 3, max: 100, message: '标题长度为3-100字符', trigger: 'blur' },
  ],
  type: [{ required: true, message: '请选择培训类型', trigger: 'change' }],
  trainer: [{ required: true, message: '请输入培训师', trigger: 'blur' }],
  plannedAttendees: [
    { required: true, message: '请输入计划人数', trigger: 'change' },
    { type: 'number', min: 1, message: '计划人数必须大于等于1', trigger: 'change' },
  ],
  startDate: [{ required: true, message: '请选择开始日期', trigger: 'change' }],
  endDate: [{ required: true, message: '请选择结束日期', trigger: 'change' }],
  location: [{ required: true, message: '请输入培训地点', trigger: 'blur' }],
  duration: [
    { required: true, message: '请输入时长', trigger: 'change' },
    {
      type: 'number',
      validator: (_rule: any, value: number) =>
        value > 0 ? Promise.resolve() : Promise.reject('时长必须大于0'),
      trigger: 'change',
    },
  ],
  content: [{ required: true, message: '请输入培训内容', trigger: 'blur' }],
};

const detailDrawerVisible = ref(false);
const currentTraining = ref<TrainingApi.TrainingPlanItem | null>(null);
const trainingRecords = ref<TrainingApi.TrainingRecord[]>([]);
const recordsLoading = ref(false);

// 附件与版本管理
const detailTab = ref<'info' | 'attachments' | 'versions'>('info');
const attachmentList = ref<TrainingAttachment[]>([]);
const attachmentLoading = ref(false);
const attachmentVersion = ref('1.0');
const versionList = ref<TrainingVersionRecord[]>([]);
const versionLoading = ref(false);
const exporting = ref(false);

const attachmentColumns = [
  { title: '文件名', dataIndex: 'originalName', key: 'originalName', ellipsis: true },
  { title: '版本', dataIndex: 'version', key: 'version', width: 90 },
  { title: '大小', key: 'fileSize', width: 100 },
  { title: '状态', key: 'isLatest', width: 90 },
  { title: '上传人', dataIndex: 'uploadedBy', key: 'uploadedBy', width: 100 },
  { title: '上传时间', key: 'createdAt', width: 160 },
  { title: '操作', key: 'action', width: 140 },
];

const versionColumns = [
  { title: '版本', dataIndex: 'version', key: 'version', width: 100 },
  { title: '变更类型', key: 'changeType', width: 110 },
  { title: '变更说明', dataIndex: 'changeSummary', key: 'changeSummary', ellipsis: true },
  { title: '操作人', dataIndex: 'changedBy', key: 'changedBy', width: 110 },
  { title: '时间', key: 'createdAt', width: 160 },
];

const statsData = ref<TrainingApi.TrainingStats>({
  totalPlans: 0,
  ongoing: 0,
  completed: 0,
  totalAttendees: 0,
  passRate: 0,
  byType: {},
});

const statItems = computed(() => [
  { key: 'totalPlans', label: '培训计划数', value: statsData.value.totalPlans, color: 'blue', icon: 'lucide:graduation-cap' },
  { key: 'ongoing', label: '进行中', value: statsData.value.ongoing, color: 'orange', icon: 'lucide:clock' },
  { key: 'completed', label: '已完成', value: statsData.value.completed, color: 'green', icon: 'lucide:check-circle-2' },
  { key: 'attendees', label: '参训人次', value: statsData.value.totalAttendees, color: 'blue', icon: 'lucide:users' },
  {
    key: 'passRate',
    label: '通过率',
    value: `${(statsData.value.passRate ?? 0).toFixed(1)}%`,
    color: 'green',
    icon: 'lucide:check-circle-2',
  },
]);

const originalColumns = ref([
  { title: '培训标题', dataIndex: 'name', key: 'name', width: 200 },
  { title: '类型', key: 'trainingType', width: 100 },
  { title: '结果', key: 'result', width: 100 },
  { title: '培训师', dataIndex: 'trainer', key: 'trainer', width: 100 },
  { title: '直接上级', dataIndex: 'supervisorName', key: 'supervisorName', width: 100, ellipsis: true },
  { title: '考试成绩', key: 'score', width: 110 },
  { title: '培训日期', key: 'dateRange', width: 200 },
  { title: '时效提醒', key: 'expiryStatus', width: 110 },
  { title: '时长', key: 'duration', width: 90 },
  { title: '身份证号', key: 'idCard', width: 160 },
  { title: '操作', key: 'action', width: 200, fixed: 'right' as const },
]);

const { columns: tableColumns, initSortable, initResizable } = useTableColumnSettings(originalColumns, 'training');
const tableRef = ref<any>(null);

const visibilityStatItems = computed(() => statItems.value.map((s) => ({ key: s.key, label: s.label })));
const actionButtons = ref([
  { key: 'import', label: '导入数据' },
  { key: 'exportRecords', label: '导出记录' },
  { key: 'exportLedger', label: '导出台账' },
  { key: 'create', label: '新增培训' },
]);

const { config, isStatVisible, isActionVisible, isFilterVisible, resetToDefault } = useComponentVisibility({
  pageKey: 'training',
  statItems: visibilityStatItems,
  actionButtons,
});

const hasVisibleStats = computed(() => statItems.value.some((s) => isStatVisible.value(s.key)));

const recordColumns = [
  { title: '姓名', dataIndex: 'traineeName', key: 'traineeName', width: 90 },
  { title: '工号', dataIndex: 'traineeId', key: 'traineeId', width: 100 },
  { title: '部门', dataIndex: 'department', key: 'department', width: 120 },
  { title: '出勤', key: 'attendStatus', width: 90 },
  { title: '考试成绩', dataIndex: 'examScore', key: 'examScore', width: 90 },
  { title: '考试结果', key: 'examResult', width: 90 },
  { title: '证书编号', dataIndex: 'certificateNo', key: 'certificateNo', width: 140 },
  { title: '备注', dataIndex: 'remark', key: 'remark' },
];

function formatDate(date: string): string {
  return dayjs(date).format('YYYY-MM-DD');
}

function getTypeColor(type: string): string {
  const rule = trainingTypeRules.value.find((r) => r.code === type);
  if (rule?.semanticColor) return rule.semanticColor;
  const map: Record<string, string> = {
    safety: 'red',
    skills: 'blue',
    emergency: 'orange',
    induction: 'gold',
    regular: 'default',
    HSE: 'blue',
    '新员工': 'green',
    '驾驶员': 'orange',
    '太行': 'purple',
    '复训': 'gold',
    '消防培训': 'red',
    '安全培训': 'red',
    '技能培训': 'blue',
    '应急培训': 'orange',
    '岗前培训': 'gold',
    '日常培训': 'default',
  };
  return map[type] || 'default';
}

function getTypeText(type: string): string {
  if (!type) return '-';
  const opt = typeOptions.value.find((o) => o.value === type);
  if (opt) return opt.label;
  const cn: Record<string, string> = {
    HSE: 'HSE',
    '新员工': '新员工',
    '驾驶员': '驾驶员',
    '太行': '太行',
    '复训': '复训',
    '消防培训': '消防培训',
    '合格': '合格',
    '不合格': '不合格',
  };
  return cn[type] || type;
}

function getStatusColor(status: string): string {
  const statuses = (planStatusRules.value as any)?.statuses || [];
  const rule = statuses.find((s: any) => s.code === status);
  if (rule?.semanticColor) return rule.semanticColor;
  const map: Record<string, string> = {
    draft: 'default',
    planned: 'gold',
    ongoing: 'blue',
    completed: 'green',
    cancelled: 'red',
    pending_approval: 'gold',
    approved: 'cyan',
    in_progress: 'blue',
    '合格': 'green',
    '不合格': 'red',
  };
  return map[status] || 'default';
}

function getStatusText(status: string): string {
  if (!status) return '-';
  const opt = statusOptions.value.find((o) => o.value === status);
  if (opt) return opt.label;
  const cn: Record<string, string> = {
    '合格': '合格',
    '不合格': '不合格',
  };
  return cn[status] || status;
}

function getAttendStatusColor(status: string): string {
  const map: Record<string, string> = {
    attended: 'green',
    absent: 'red',
    late: 'orange',
    early_leave: 'gold',
  };
  return map[status] || 'default';
}

function getAttendStatusText(status: string): string {
  const map: Record<string, string> = {
    attended: '已出勤',
    absent: '缺席',
    late: '迟到',
    early_leave: '早退',
  };
  return map[status] || status;
}

function getExamResultColor(result: string): string {
  const map: Record<string, string> = {
    pass: 'green',
    fail: 'red',
    pending: 'gold',
  };
  return map[result] || 'default';
}

function getExamResultText(result: string): string {
  const map: Record<string, string> = {
    pass: '通过',
    fail: '不通过',
    pending: '待考',
  };
  return map[result] || result;
}

// ========== 时效提醒相关 ==========
function getExpiryBadgeStatus(status?: ExpiryStatus): 'success' | 'warning' | 'error' | 'default' {
  const map: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
    normal: 'success',
    expiring: 'warning',
    expired: 'error',
    unknown: 'default',
  };
  return map[status || 'unknown'] || 'default';
}

function getExpiryStatusText(status?: ExpiryStatus): string {
  const map: Record<string, string> = {
    normal: '正常',
    expiring: '临期',
    expired: '过期',
    unknown: '未知',
  };
  return map[status || 'unknown'] || '未知';
}

// ========== 附件相关辅助 ==========
function formatFileSize(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

function formatDateTime(date: string): string {
  if (!date) return '-';
  return dayjs(date).format('YYYY-MM-DD HH:mm');
}

function getChangeTypeColor(type: string): string {
  const map: Record<string, string> = {
    create: 'green',
    update: 'blue',
    import: 'gold',
    revise: 'orange',
    delete: 'red',
  };
  return map[type] || 'default';
}

function getChangeTypeText(type: string): string {
  const map: Record<string, string> = {
    create: '新增',
    update: '更新',
    import: '导入',
    revise: '修订',
    delete: '删除',
  };
  return map[type] || type;
}

// ========== 附件与版本管理 ==========
async function fetchAttachments(recordId: number) {
  attachmentLoading.value = true;
  try {
    const res = await getTrainingAttachments(recordId);
    attachmentList.value = Array.isArray(res) ? res : [];
  } catch (err) {
    console.warn('获取附件失败:', err);
    message.error($t('hse.message.fetchListFailed', { module: '附件' }));
    attachmentList.value = [];
  } finally {
    attachmentLoading.value = false;
  }
}

async function fetchVersions(recordId: number) {
  versionLoading.value = true;
  try {
    const res = await getTrainingVersions(recordId);
    versionList.value = Array.isArray(res) ? res : [];
  } catch (err) {
    console.warn('获取版本履历失败:', err);
    versionList.value = [];
  } finally {
    versionLoading.value = false;
  }
}

async function handleUploadAttachment(file: File) {
  if (!currentTraining.value) return false;
  attachmentLoading.value = true;
  try {
    await uploadTrainingAttachment(currentTraining.value.id, file, {
      version: attachmentVersion.value || '1.0',
    });
    message.success('附件上传成功');
    await fetchAttachments(currentTraining.value.id);
    await fetchVersions(currentTraining.value.id);
  } catch (err) {
    console.warn('附件上传失败:', err);
    message.error('附件上传失败');
  } finally {
    attachmentLoading.value = false;
  }
  return false; // 阻止 antd Upload 默认上传
}

async function handleDeleteAttachment(record: TrainingAttachment) {
  if (!currentTraining.value) return;
  try {
    await deleteTrainingAttachment(currentTraining.value.id, record.id);
    message.success('附件已删除');
    await fetchAttachments(currentTraining.value.id);
    await fetchVersions(currentTraining.value.id);
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
  // 在新窗口打开文件 URL（支持预览/下载）
  window.open(record.fileUrl, '_blank');
}

// ========== 导出 ==========
async function handleExportRecords() {
  exporting.value = true;
  try {
    const blob = await exportTrainingRecords();
    triggerBlobDownload(blob, `培训记录清单_${dayjs().format('YYYYMMDD')}.csv`);
    message.success('导出成功');
  } catch (err) {
    console.warn('导出培训记录失败:', err);
    message.error('导出失败，请稍后重试');
  } finally {
    exporting.value = false;
  }
}

async function handleExportLedger() {
  exporting.value = true;
  try {
    const blob = await exportTrainingLedger();
    triggerBlobDownload(blob, `培训台账_${dayjs().format('YYYYMMDD')}.csv`);
    message.success('导出成功');
  } catch (err) {
    console.warn('导出培训台账失败:', err);
    message.error('导出失败，请稍后重试');
  } finally {
    exporting.value = false;
  }
}

function triggerBlobDownload(blob: Blob, filename: string) {
  if (!blob) {
    message.warning('导出数据为空');
    return;
  }
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

function handleDetailClose() {
  detailTab.value = 'info';
  attachmentList.value = [];
  versionList.value = [];
}

// fetchData 已由 useDataTable 接管（见上方 useDataTable 配置），保留 fetchStats 副作用

async function fetchStats() {
  statsLoading.value = true;
  try {
    const stats = await getTrainingStats();
    statsData.value = stats;
  } catch (err) {
    console.warn('获取培训统计失败:', err);
    message.error($t('hse.message.fetchStatsFailed'));
    // 统计接口失败时统一返回空统计对象，避免依赖列表数据推断造成的不一致
    statsData.value = {
      totalPlans: 0, ongoing: 0, completed: 0,
      totalAttendees: 0, passRate: 0, byType: {},
    };
  } finally {
    statsLoading.value = false;
  }
}

function handleSearch() {
  tableHandleReset();
}

function handleReset() {
  resetSearch();
}

// handleTableChange 已由 useDataTable 接管

function handleCreate() {
  editingTraining.value = null;
  Object.assign(trainingForm, {
    title: '',
    type: 'safety',
    targetAudience: '',
    trainer: '',
    plannedAttendees: 30,
    startDate: dayjs(),
    endDate: dayjs().add(1, 'day'),
    location: '',
    duration: 4,
    content: '',
    examRequired: false,
    passScore: 60,
    remark: '',
  });
  modalVisible.value = true;
}

function handleEdit(record: TrainingApi.TrainingPlanItem) {
  editingTraining.value = record;
  Object.assign(trainingForm, {
    title: record.name,
    type: (record.trainingType || 'safety') as TrainingApi.TrainingPlanForm['type'],
    targetAudience: '',
    trainer: record.trainer,
    plannedAttendees: 30,
    startDate: record.trainingDate ? dayjs(record.trainingDate) : undefined,
    endDate: record.trainingDate ? dayjs(record.trainingDate) : undefined,
    location: record.department,
    duration: record.durationMinutes || 4,
    content: record.content,
    examRequired: false,
    passScore: record.score ?? 60,
    remark: record.remark || '',
  });
  modalVisible.value = true;
}

async function handleView(record: TrainingApi.TrainingPlanItem) {
  currentTraining.value = record;
  detailTab.value = 'info';
  detailDrawerVisible.value = true;
  trainingRecords.value = [];
  attachmentList.value = [];
  versionList.value = [];
  recordsLoading.value = true;
  try {
    const res = await getTrainingRecords(record.id);
    trainingRecords.value = Array.isArray(res) ? res : (res as any)?.list || [];
  } catch (err) {
    console.warn('获取培训记录失败:', err);
    message.error($t('hse.message.fetchListFailed', { module: $t('hse.module.trainingRecords') }));
    trainingRecords.value = [];
  } finally {
    recordsLoading.value = false;
  }
  // 并行加载附件与版本履历
  fetchAttachments(record.id);
  fetchVersions(record.id);
}

async function handleSave() {
  try {
    await formRef.value?.validate();
  } catch {
    return;
  }
  if (!trainingForm.title) {
    message.warning('请填写培训标题');
    return;
  }
  if (!trainingForm.trainer) {
    message.warning('请填写培训师');
    return;
  }
  modalLoading.value = true;
  try {
    const data: Partial<TrainingApi.TrainingPlanForm> = {
      title: trainingForm.title,
      type: trainingForm.type,
      targetAudience: trainingForm.targetAudience,
      trainer: trainingForm.trainer,
      plannedAttendees: trainingForm.plannedAttendees,
      startDate: trainingForm.startDate?.toISOString() || new Date().toISOString(),
      endDate: trainingForm.endDate?.toISOString() || new Date().toISOString(),
      location: trainingForm.location,
      duration: trainingForm.duration,
      content: trainingForm.content,
      examRequired: trainingForm.examRequired,
      passScore: trainingForm.examRequired ? trainingForm.passScore : undefined,
      remark: trainingForm.remark,
    };
    if (editingTraining.value) {
      await updateTrainingPlan(editingTraining.value.id, data);
      message.success('更新成功');
    } else {
      await createTrainingPlan(data);
      message.success('创建成功');
    }
    modalVisible.value = false;
    fetchData();
  } catch (err) {
    console.warn('保存失败:', err);
    message.error('保存失败');
    modalVisible.value = false;
    fetchData();
  } finally {
    modalLoading.value = false;
  }
}

async function handleDelete(record: TrainingApi.TrainingPlanItem) {
  try {
    await deleteTrainingPlan(record.id);
    message.success('删除成功');
    fetchData();
  } catch (err) {
    console.warn('删除失败:', err);
    message.error('删除失败');
    fetchData();
  }
}

async function initTableFeatures() {
  await nextTick();
  if (tableRef.value?.$el) {
    initSortable(tableRef.value.$el);
    initResizable(tableRef.value.$el);
  }
}

// ========== 提示词-135 R4：枚举动态化（从 /rules/* 影子数据拉取） ==========
const trainingTypeRules = ref<TrainingTypeRule[]>([]);
const planStatusRules = ref<PlanStatusFlowRule>({ statuses: [], transitions: [] });

// 历史遗留选项：兼容已存储旧 code 与数据库中文值（提示词-135 §5.3 兼容映射）
const legacyTypeOptions = [
  { value: 'safety', label: '安全培训' },
  { value: 'skills', label: '技能培训' },
  { value: 'emergency', label: '应急培训' },
  { value: 'induction', label: '岗前培训' },
  { value: 'regular', label: '日常培训' },
];
const legacyStatusOptions = [
  { value: 'draft', label: '草稿' },
  { value: 'planned', label: '已计划' },
  { value: 'ongoing', label: '进行中' },
  { value: 'completed', label: '已完成' },
  { value: 'cancelled', label: '已取消' },
];

// 规则优先 + 历史遗留补全（按 value 去重），保证下拉框覆盖新旧数据
const typeOptions = computed(() => {
  const ruleOpts = trainingTypeRules.value.map((r) => ({ value: r.code, label: r.label }));
  const merged = [...ruleOpts];
  legacyTypeOptions.forEach((o) => {
    if (!merged.find((m) => m.value === o.value)) merged.push(o);
  });
  return merged;
});

const statusOptions = computed(() => {
  const statuses = (planStatusRules.value as any)?.statuses || [];
  const ruleOpts = statuses.map((s: any) => ({ value: s.code, label: s.label }));
  const merged = [...ruleOpts];
  legacyStatusOptions.forEach((o) => {
    if (!merged.find((m) => m.value === o.value)) merged.push(o);
  });
  return merged;
});

async function fetchRules() {
  try {
    const [types, flow] = await Promise.all([getTrainingTypes(), getPlanStatusFlow()]);
    trainingTypeRules.value = types || [];
    planStatusRules.value = flow || { statuses: [], transitions: [] };
  } catch (e) {
    // 拉取失败时回退到历史遗留选项，保证页面可用
    trainingTypeRules.value = [];
    planStatusRules.value = { statuses: [], transitions: [] };
  }
}

onMounted(async () => {
  await fetchRules();
  await fetchData();
  await initTableFeatures();
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

  .header-buttons {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .filter-form {
    margin-bottom: 16px;
    padding-bottom: 16px;
    border-bottom: 1px solid hsl(var(--border));
  }

  .records-section {
    margin-top: 16px;

    .records-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 15px;
      font-weight: 600;
      margin-bottom: 8px;
    }
  }

  .attachment-toolbar {
    margin-bottom: 12px;
    padding: 8px 12px;
    background: hsl(var(--muted));
    border-radius: 6px;
  }

  .empty-tip {
    text-align: center;
    color: hsl(var(--muted-foreground));
    padding: 24px 0;
    font-size: 13px;
  }
}
</style>
