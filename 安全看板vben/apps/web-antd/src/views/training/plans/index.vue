<template>
  <Page auto-content-height class="hse-page">
    <Card :bordered="false">
      <template #title>
        <div class="card-header">
          <span>培训计划管理</span>
          <div class="header-buttons">
            <Button v-if="isActionVisible('create')" type="primary" @click="handleCreate">
              <template #icon><IconifyIcon icon="lucide:plus" /></template>
              新增培训计划
            </Button>
            <ComponentVisibilitySettings
              title="培训计划管理显示设置"
              v-model:model-value="config"
              :stat-items="[]"
              :action-buttons="actionButtons"
              @reset="resetToDefault"
            />
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
        <FormItem label="计划类型">
          <Select
            v-model:value="searchForm.planType"
            placeholder="全部类型"
            allow-clear
            @change="handleSearch"
          >
            <SelectOption value="annual">年度培训计划</SelectOption>
            <SelectOption value="special">专项培训</SelectOption>
            <SelectOption value="new_employee">新员工培训</SelectOption>
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
        :data-source="planList"
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
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'planType'">
            <Tag :color="getPlanTypeColor(record.planType)">
              {{ getPlanTypeText(record.planType) }}
            </Tag>
          </template>
          <template v-else-if="column.key === 'status'">
            <Tag :color="getStatusColor(record.status)">
              {{ getStatusText(record.status) }}
            </Tag>
          </template>
          <template v-else-if="column.key === 'attendees'">
            <span>{{ record.actualAttendees }} / {{ record.plannedAttendees }}</span>
          </template>
          <template v-else-if="column.key === 'dateRange'">
            {{ formatDate(record.startDate) }} ~ {{ formatDate(record.endDate) }}
          </template>
          <template v-else-if="column.key === 'durationHours'">
            {{ record.durationHours }} 小时
          </template>
          <template v-else-if="column.key === 'exam'">
            <Tag v-if="record.examRequired" color="blue">
              需要({{ record.passScore }}分)
            </Tag>
            <Tag v-else color="default">不需要</Tag>
          </template>
          <template v-else-if="column.key === 'trainerName'">
            <EmployeeName v-if="record.trainerId" :employee-id="record.trainerId" />
            <span v-else>{{ record.trainerName || '-' }}</span>
          </template>
          <template v-else-if="column.key === 'action'">
            <Space>
              <Button type="link" size="small" @click="handleView(record as any)">查看</Button>
              <Button type="link" size="small" @click="handleEdit(record as any)">编辑</Button>
              <Popconfirm
                title="确定要删除该培训计划吗？"
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
    </Card>

    <Modal
      v-model:open="modalVisible"
      :title="editingPlan ? '编辑培训计划' : '新增培训计划'"
      :confirm-loading="modalLoading"
      width="720px"
      @ok="handleSave"
      @cancel="modalVisible = false"
    >
      <Form ref="formRef" :model="planForm" :rules="(formRules as any)" layout="vertical">
        <Row :gutter="16">
          <Col :span="24">
            <FormItem label="计划标题" required>
              <Input v-model:value="planForm.title" placeholder="请输入计划标题" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="计划类型" required>
              <Select v-model:value="planForm.planType" placeholder="请选择类型" style="width: 100%">
                <SelectOption value="annual">年度培训计划</SelectOption>
                <SelectOption value="special">专项培训</SelectOption>
                <SelectOption value="new_employee">新员工培训</SelectOption>
              </Select>
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="培训类型" required>
              <Input v-model:value="planForm.trainingType" placeholder="如：安全培训、技能培训" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="目标人群">
              <Input v-model:value="planForm.targetAudience" placeholder="如：全员/新员工/特种作业人员" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="培训师" required>
              <EmployeeSelector
                v-model:value="planForm.trainerId"
                mode="single"
                placeholder="请选择培训师"
                @change="onTrainerChange"
              />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="计划人数">
              <InputNumber v-model:value="planForm.plannedAttendees" :min="1" style="width: 100%" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="实际人数">
              <InputNumber v-model:value="planForm.actualAttendees" :min="0" style="width: 100%" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="开始日期">
              <DatePicker v-model:value="planForm.startDate" style="width: 100%" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="结束日期">
              <DatePicker v-model:value="planForm.endDate" style="width: 100%" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="培训地点">
              <Input v-model:value="planForm.location" placeholder="请输入培训地点" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="时长(小时)">
              <InputNumber v-model:value="planForm.durationHours" :min="0.5" :step="0.5" style="width: 100%" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="是否需要考试">
              <Select v-model:value="planForm.examRequired" style="width: 100%">
                <SelectOption :value="true">需要</SelectOption>
                <SelectOption :value="false">不需要</SelectOption>
              </Select>
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem v-if="planForm.examRequired" label="及格分数">
              <InputNumber v-model:value="planForm.passScore" :min="0" :max="100" style="width: 100%" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="状态">
              <Select v-model:value="planForm.status" style="width: 100%">
                <SelectOption v-for="opt in statusOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</SelectOption>
              </Select>
            </FormItem>
          </Col>
          <Col :span="24">
            <FormItem label="培训内容">
              <Textarea
                v-model:value="planForm.content"
                :rows="3"
                placeholder="请输入培训内容大纲"
              />
            </FormItem>
          </Col>
          <Col :span="24">
            <FormItem label="备注">
              <Textarea v-model:value="planForm.remark" :rows="2" placeholder="其他说明" />
            </FormItem>
          </Col>
        </Row>
      </Form>
    </Modal>

    <Drawer v-model:open="detailDrawerVisible" title="培训计划详情" width="720px" @close="detailDrawerVisible = false">
      <template v-if="currentPlan">
        <Descriptions :column="1" bordered size="small">
          <DescriptionsItem label="计划标题">{{ currentPlan.title }}</DescriptionsItem>
          <DescriptionsItem label="计划类型">
            <Tag :color="getPlanTypeColor(currentPlan.planType)">
              {{ getPlanTypeText(currentPlan.planType) }}
            </Tag>
          </DescriptionsItem>
          <DescriptionsItem label="培训类型">{{ currentPlan.trainingType }}</DescriptionsItem>
          <DescriptionsItem label="目标人群">{{ currentPlan.targetAudience }}</DescriptionsItem>
          <DescriptionsItem label="培训师">
            <EmployeeName v-if="currentPlan.trainerId" :employee-id="currentPlan.trainerId" />
            <span v-else>{{ currentPlan.trainerName || '-' }}</span>
          </DescriptionsItem>
          <DescriptionsItem label="计划/实际人数">
            {{ currentPlan.actualAttendees }} / {{ currentPlan.plannedAttendees }}
          </DescriptionsItem>
          <DescriptionsItem label="培训日期">
            {{ formatDate(currentPlan.startDate) }} ~ {{ formatDate(currentPlan.endDate) }}
          </DescriptionsItem>
          <DescriptionsItem label="培训地点">{{ currentPlan.location }}</DescriptionsItem>
          <DescriptionsItem label="培训时长">{{ currentPlan.durationHours }} 小时</DescriptionsItem>
          <DescriptionsItem label="状态">
            <Tag :color="getStatusColor(currentPlan.status)">
              {{ getStatusText(currentPlan.status) }}
            </Tag>
          </DescriptionsItem>
          <DescriptionsItem label="是否考试">
            <Tag v-if="currentPlan.examRequired" color="blue">
              需要({{ currentPlan.passScore }}分及格)
            </Tag>
            <Tag v-else color="default">不需要</Tag>
          </DescriptionsItem>
          <DescriptionsItem label="培训内容">{{ currentPlan.content }}</DescriptionsItem>
          <DescriptionsItem v-if="currentPlan.remark" label="备注">
            {{ currentPlan.remark }}
          </DescriptionsItem>
        </Descriptions>
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
  DatePicker,
  InputNumber,
  Textarea,
  message,
  Popconfirm,
  Space,
  Descriptions,
  DescriptionsItem,
} from 'ant-design-vue';
import type { FormInstance } from 'ant-design-vue';
import { IconifyIcon } from '@vben/icons';
import { Page } from '@vben/common-ui';
import ComponentVisibilitySettings from '#/components/hse/ComponentVisibilitySettings.vue';
import { useTableColumnSettings } from '#/composables/useTableColumnSettings';
import { useComponentVisibility } from '#/composables/useComponentVisibility';
import type { VisibilityItem } from '#/composables/useComponentVisibility';
import EmployeeSelector from '#/components/hse/EmployeeSelector.vue';
import { EmployeeName } from '#/composables/hse';
import dayjs, { type Dayjs } from 'dayjs';

import {
  getTrainingPlanItems,
  createTrainingPlanItem,
  updateTrainingPlanItem,
  deleteTrainingPlanItem,
  getPlanStatusFlow,
  type TrainingPlanApi,
  type PlanStatusFlowRule,
} from '#/api/hse/training';

const loading = ref(false);
const planList = ref<TrainingPlanApi.TrainingPlanItem[]>([]);
const total = ref(0);

const searchForm = reactive({
  keyword: '',
  planType: undefined as string | undefined,
  status: undefined as string | undefined,
});

const pagination = reactive({
  page: 1,
  pageSize: 10,
});

const modalVisible = ref(false);
const modalLoading = ref(false);
const editingPlan = ref<TrainingPlanApi.TrainingPlanItem | null>(null);
const planForm = reactive({
  title: '',
  planType: 'annual' as TrainingPlanApi.TrainingPlanItem['planType'],
  trainingType: '',
  targetAudience: '',
  trainerName: '',
  trainerId: 0,
  plannedAttendees: 0,
  actualAttendees: 0,
  startDate: undefined as Dayjs | undefined,
  endDate: undefined as Dayjs | undefined,
  location: '',
  durationHours: 4,
  content: '',
  examRequired: false as any,
  passScore: 60,
  status: 'draft' as TrainingPlanApi.TrainingPlanItem['status'],
  remark: '',
});

function onTrainerChange(item: any) {
  // Q4 修复：组件 change 事件回写完整 SelectorItem，同步培训师名称（原 v-model:employee-name 误用已移除）
  planForm.trainerName = item?.name ?? '';
}

const formRef = ref<FormInstance>();

const formRules = {
  title: [
    { required: true, message: '请输入计划标题', trigger: 'blur' },
    { min: 3, max: 100, message: '标题长度为3-100字符', trigger: 'blur' },
  ],
  planType: [{ required: true, message: '请选择计划类型', trigger: 'change' }],
  trainingType: [{ required: true, message: '请输入培训类型', trigger: 'blur' }],
};

const detailDrawerVisible = ref(false);
const currentPlan = ref<TrainingPlanApi.TrainingPlanItem | null>(null);

const originalColumns = ref([
  { title: '计划标题', dataIndex: 'title', key: 'title', width: 200 },
  { title: '计划类型', key: 'planType', width: 120 },
  { title: '培训类型', dataIndex: 'trainingType', key: 'trainingType', width: 120 },
  { title: '培训师', dataIndex: 'trainerName', key: 'trainerName', width: 100 },
  { title: '实际/计划', key: 'attendees', width: 110 },
  { title: '培训日期', key: 'dateRange', width: 200 },
  { title: '时长', key: 'durationHours', width: 90 },
  { title: '考试', key: 'exam', width: 110 },
  { title: '状态', key: 'status', width: 100 },
  { title: '操作', key: 'action', width: 200, fixed: 'right' as const },
]);

const { columns: tableColumns, initSortable, initResizable } = useTableColumnSettings(originalColumns, 'training-plans');
const tableRef = ref<any>(null);

const actionButtons = ref([
  { key: 'create', label: '新增培训计划' },
]);

const { config, isActionVisible, isFilterVisible, resetToDefault } = useComponentVisibility({
  pageKey: 'training-plans',
  statItems: ref<VisibilityItem[]>([]),
  actionButtons,
});

function formatDate(date: string): string {
  return dayjs(date).format('YYYY-MM-DD');
}

function getPlanTypeColor(type: string): string {
  const map: Record<string, string> = {
    annual: 'blue',
    special: 'orange',
    new_employee: 'green',
  };
  return map[type] || 'default';
}

function getPlanTypeText(type: string): string {
  const map: Record<string, string> = {
    annual: '年度培训计划',
    special: '专项培训',
    new_employee: '新员工培训',
  };
  return map[type] || type;
}

function getStatusColor(status: string): string {
  const statuses = (planStatusRules.value as any)?.statuses || [];
  const rule = statuses.find((s: any) => s.code === status);
  if (rule?.semanticColor) return rule.semanticColor;
  const map: Record<string, string> = {
    draft: 'default',
    approved: 'gold',
    in_progress: 'blue',
    completed: 'green',
    cancelled: 'red',
    pending_approval: 'gold',
  };
  return map[status] || 'default';
}

function getStatusText(status: string): string {
  if (!status) return '-';
  const opt = statusOptions.value.find((o) => o.value === status);
  if (opt) return opt.label;
  const map: Record<string, string> = {
    draft: '草稿',
    approved: '已审批',
    in_progress: '进行中',
    completed: '已完成',
    cancelled: '已取消',
  };
  return map[status] || status;
}

async function fetchData() {
  loading.value = true;
  try {
    const params: TrainingPlanApi.PlanListParams = {
      page: pagination.page,
      pageSize: pagination.pageSize,
      keyword: searchForm.keyword || undefined,
      planType: searchForm.planType,
      status: searchForm.status,
    };
    const res = await getTrainingPlanItems(params);
    planList.value = res.list || [];
    total.value = res.total || 0;
  } catch (err) {
    console.warn('获取培训计划列表失败:', err);
    message.error('获取培训计划列表失败');
    planList.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
}

function handleSearch() {
  pagination.page = 1;
  fetchData();
}

function handleReset() {
  searchForm.keyword = '';
  searchForm.planType = undefined;
  searchForm.status = undefined;
  pagination.page = 1;
  fetchData();
}

function handleTableChange(pag: { current: number; pageSize: number }) {
  pagination.page = pag.current;
  pagination.pageSize = pag.pageSize;
  fetchData();
}

function handleCreate() {
  editingPlan.value = null;
  Object.assign(planForm, {
    title: '',
    planType: 'annual',
    trainingType: '',
    targetAudience: '',
    trainerName: '',
    trainerId: 0,
    plannedAttendees: 0,
    actualAttendees: 0,
    startDate: dayjs(),
    endDate: dayjs().add(1, 'day'),
    location: '',
    durationHours: 4,
    content: '',
    examRequired: false,
    passScore: 60,
    status: 'draft',
    remark: '',
  });
  modalVisible.value = true;
}

function handleEdit(record: TrainingPlanApi.TrainingPlanItem) {
  editingPlan.value = record;
  Object.assign(planForm, {
    title: record.title,
    planType: record.planType,
    trainingType: record.trainingType,
    targetAudience: record.targetAudience || '',
    trainerName: record.trainerName || '',
    trainerId: record.trainerId || 0,
    plannedAttendees: record.plannedAttendees,
    actualAttendees: record.actualAttendees,
    startDate: dayjs(record.startDate),
    endDate: dayjs(record.endDate),
    location: record.location || '',
    durationHours: record.durationHours,
    content: record.content || '',
    examRequired: record.examRequired,
    passScore: record.passScore,
    status: record.status,
    remark: record.remark || '',
  });
  modalVisible.value = true;
}

function handleView(record: TrainingPlanApi.TrainingPlanItem) {
  currentPlan.value = record;
  detailDrawerVisible.value = true;
}

async function handleSave() {
  try {
    await formRef.value?.validate();
  } catch {
    return;
  }
  modalLoading.value = true;
  try {
    const data: Partial<TrainingPlanApi.TrainingPlanItem> = {
      title: planForm.title,
      planType: planForm.planType,
      trainingType: planForm.trainingType,
      targetAudience: planForm.targetAudience,
      trainerName: planForm.trainerName,
      trainerId: planForm.trainerId || undefined,
      plannedAttendees: planForm.plannedAttendees,
      actualAttendees: planForm.actualAttendees,
      startDate: planForm.startDate?.toISOString().slice(0, 10) || new Date().toISOString().slice(0, 10),
      endDate: planForm.endDate?.toISOString().slice(0, 10) || new Date().toISOString().slice(0, 10),
      location: planForm.location,
      durationHours: planForm.durationHours,
      content: planForm.content,
      examRequired: planForm.examRequired,
      passScore: planForm.examRequired ? planForm.passScore : 60,
      status: planForm.status,
      remark: planForm.remark,
    };
    if (editingPlan.value) {
      await updateTrainingPlanItem(editingPlan.value.id, data);
      message.success('更新成功');
    } else {
      await createTrainingPlanItem(data);
      message.success('创建成功');
    }
    modalVisible.value = false;
    fetchData();
  } catch (err) {
    console.warn('保存失败:', err);
    message.error('保存失败');
  } finally {
    modalLoading.value = false;
  }
}

async function handleDelete(record: TrainingPlanApi.TrainingPlanItem) {
  try {
    await deleteTrainingPlanItem(record.id);
    message.success('删除成功');
    fetchData();
  } catch (err) {
    console.warn('删除失败:', err);
    message.error('删除失败');
  }
}

async function initTableFeatures() {
  await nextTick();
  if (tableRef.value?.$el) {
    initSortable(tableRef.value.$el);
    initResizable(tableRef.value.$el);
  }
}

// ========== 提示词-135 R4：状态枚举动态化（计划状态流转规则） ==========
const planStatusRules = ref<PlanStatusFlowRule>({ statuses: [], transitions: [] });
const legacyPlanStatusOptions = [
  { value: 'draft', label: '草稿' },
  { value: 'approved', label: '已审批' },
  { value: 'in_progress', label: '进行中' },
  { value: 'completed', label: '已完成' },
  { value: 'cancelled', label: '已取消' },
];
const statusOptions = computed(() => {
  const statuses = (planStatusRules.value as any)?.statuses || [];
  const ruleOpts = statuses.map((s: any) => ({ value: s.code, label: s.label }));
  const merged = [...ruleOpts];
  legacyPlanStatusOptions.forEach((o) => {
    if (!merged.find((m) => m.value === o.value)) merged.push(o);
  });
  return merged;
});
async function fetchPlanStatusFlow() {
  try {
    const flow = await getPlanStatusFlow();
    planStatusRules.value = flow || { statuses: [], transitions: [] };
  } catch (e) {
    planStatusRules.value = { statuses: [], transitions: [] };
  }
}

onMounted(async () => {
  await fetchPlanStatusFlow();
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
}
</style>