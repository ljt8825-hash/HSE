<template>
  <Page auto-content-height class="hse-page">
    <Card :bordered="false" title="培训计划执行">
      <Alert
        type="info"
        show-icon
        message="从培训计划生成培训记录"
        description="选择一个培训计划，然后选择参训员工，系统将自动生成对应的培训记录并关联到该计划。"
        style="margin-bottom: 16px;"
      />

      <Form layout="vertical">
        <FormItem label="选择培训计划" required>
          <Select
            v-model:value="selectedPlanId"
            placeholder="请选择培训计划"
            style="width: 100%"
            :loading="planLoading"
            @change="(handlePlanChange as any)"
          >
            <SelectOption
              v-for="plan in planList"
              :key="plan.id"
              :value="plan.id"
              :disabled="plan.status === 'cancelled' || plan.status === 'completed'"
            >
              [{{ getPlanTypeText(plan.planType) }}] {{ plan.title }}
              <span style="color: #999; margin-left: 8px;">
                {{ formatDate(plan.startDate) }} ~ {{ formatDate(plan.endDate) }}
              </span>
            </SelectOption>
          </Select>
        </FormItem>
      </Form>

      <Card v-if="selectedPlan" size="small" title="计划详情" style="margin-bottom: 16px;">
        <Descriptions :column="3" size="small">
          <DescriptionsItem label="培训类型">{{ selectedPlan.trainingType }}</DescriptionsItem>
          <DescriptionsItem label="培训师">{{ selectedPlan.trainerName || '-' }}</DescriptionsItem>
          <DescriptionsItem label="培训地点">{{ selectedPlan.location || '-' }}</DescriptionsItem>
          <DescriptionsItem label="计划人数">{{ selectedPlan.plannedAttendees }}</DescriptionsItem>
          <DescriptionsItem label="实际人数">{{ selectedPlan.actualAttendees }}</DescriptionsItem>
          <DescriptionsItem label="时长">{{ selectedPlan.durationHours }} 小时</DescriptionsItem>
          <DescriptionsItem label="是否考试">
            <Tag v-if="selectedPlan.examRequired" color="blue">需要({{ selectedPlan.passScore }}分)</Tag>
            <Tag v-else color="default">不需要</Tag>
          </DescriptionsItem>
          <DescriptionsItem label="状态">
            <Tag :color="getStatusColor(selectedPlan.status)">{{ getStatusText(selectedPlan.status) }}</Tag>
          </DescriptionsItem>
          <DescriptionsItem label="培训内容">{{ selectedPlan.content || '-' }}</DescriptionsItem>
        </Descriptions>
      </Card>

      <Card v-if="selectedPlan" size="small" title="选择参训员工" style="margin-bottom: 16px;">
        <FormItem label="参训人员" required>
          <EmployeeSelector
            v-model:value="selectedEmployeeIds"
            mode="multiple"
            placeholder="请选择参训员工（支持多选）"
            :max-count="200"
          />
        </FormItem>

        <Row :gutter="16">
          <Col :span="8">
            <FormItem label="培训日期">
              <DatePicker v-model:value="executeForm.trainingDate" style="width: 100%" />
            </FormItem>
          </Col>
          <Col :span="8">
            <FormItem label="培训结果">
              <Select v-model:value="executeForm.result" style="width: 100%">
                <SelectOption value="合格">合格</SelectOption>
                <SelectOption value="不合格">不合格</SelectOption>
                <SelectOption value="缺勤">缺勤</SelectOption>
              </Select>
            </FormItem>
          </Col>
          <Col :span="8">
            <FormItem v-if="executeForm.result === '合格' || executeForm.result === '不合格'" label="考试成绩">
              <InputNumber v-model:value="executeForm.score" :min="0" :max="100" style="width: 100%" />
            </FormItem>
          </Col>
        </Row>

        <FormItem label="备注">
          <Textarea v-model:value="executeForm.remark" :rows="2" placeholder="可选" />
        </FormItem>

        <div class="action-bar">
          <Space>
            <Button
              type="primary"
              :loading="executeLoading"
              :disabled="!selectedEmployeeIds || selectedEmployeeIds.length === 0"
              @click="handleExecute"
            >
              <template #icon><IconifyIcon icon="lucide:check" /></template>
              生成培训记录
            </Button>
            <Button @click="handleReset">重置</Button>
          </Space>
          <span v-if="selectedEmployeeIds && selectedEmployeeIds.length > 0" class="selected-count">
            已选择 {{ selectedEmployeeIds.length }} 名员工
          </span>
        </div>
      </Card>

      <Card v-if="executeResult" size="small" title="执行结果" style="margin-top: 16px;">
        <Alert
          type="success"
          show-icon
          :message="`成功生成 ${executeResult.count} 条培训记录`"
          style="margin-bottom: 16px;"
        />
        <Table
          :columns="resultColumns"
          :data-source="executeResult.created"
          :pagination="{ pageSize: 10 }"
          :row-key="(record) => record.id"
          size="small"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'name'">
              <EmployeeName v-if="record.employeeId" :employee-id="record.employeeId" />
              <span v-else>{{ record.name || '-' }}</span>
            </template>
            <template v-else-if="column.key === 'result'">
              <Tag :color="getResultColor(record.result)">{{ record.result }}</Tag>
            </template>
          </template>
        </Table>
      </Card>
    </Card>
  </Page>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import {
  Card,
  Form,
  FormItem,
  Select,
  SelectOption,
  Button,
  Alert,
  Tag,
  DatePicker,
  InputNumber,
  Textarea,
  Table,
  Row,
  Col,
  Descriptions,
  DescriptionsItem,
  Space,
  message,
} from 'ant-design-vue';
import { IconifyIcon } from '@vben/icons';
import { Page } from '@vben/common-ui';
import dayjs, { type Dayjs } from 'dayjs';
import EmployeeSelector from '#/components/hse/EmployeeSelector.vue';
import { EmployeeName } from '#/composables/hse';

import {
  getTrainingPlanItems,
  executeTrainingPlan,
  type TrainingPlanApi,
  type ExecutePlanResult,
} from '#/api/hse/training';

const planLoading = ref(false);
const planList = ref<TrainingPlanApi.TrainingPlanItem[]>([]);
const selectedPlanId = ref<number | undefined>(undefined);
const selectedPlan = ref<TrainingPlanApi.TrainingPlanItem | null>(null);

const selectedEmployeeIds = ref<number[]>([]);
const executeLoading = ref(false);
const executeResult = ref<ExecutePlanResult | null>(null);

const executeForm = reactive({
  trainingDate: undefined as Dayjs | undefined,
  result: '合格',
  score: null as any,
  remark: '',
});

const resultColumns = [
  { title: '姓名', dataIndex: 'name', key: 'name', width: 100 },
  { title: '部门', dataIndex: 'department', key: 'department', width: 150 },
  { title: '岗位', dataIndex: 'position', key: 'position', width: 120 },
  { title: '培训类型', dataIndex: 'trainingType', key: 'trainingType', width: 100 },
  { title: '培训日期', dataIndex: 'trainingDate', key: 'trainingDate', width: 120 },
  { title: '结果', key: 'result', width: 80 },
  { title: '成绩', dataIndex: 'score', key: 'score', width: 80 },
];

function formatDate(date: string): string {
  return dayjs(date).format('YYYY-MM-DD');
}

function getPlanTypeText(type: string): string {
  const map: Record<string, string> = {
    annual: '年度',
    special: '专项',
    new_employee: '新员工',
  };
  return map[type] || type;
}

function getStatusColor(status: string): string {
  const map: Record<string, string> = {
    draft: 'default',
    approved: 'gold',
    in_progress: 'blue',
    completed: 'green',
    cancelled: 'red',
  };
  return map[status] || 'default';
}

function getStatusText(status: string): string {
  const map: Record<string, string> = {
    draft: '草稿',
    approved: '已审批',
    in_progress: '进行中',
    completed: '已完成',
    cancelled: '已取消',
  };
  return map[status] || status;
}

function getResultColor(result: string): string {
  const map: Record<string, string> = {
    合格: 'green',
    不合格: 'red',
    缺勤: 'orange',
  };
  return map[result] || 'default';
}

async function fetchPlans() {
  planLoading.value = true;
  try {
    const res = await getTrainingPlanItems({ page: 1, pageSize: 100 });
    planList.value = res.list || [];
  } catch (err) {
    console.warn('获取培训计划失败:', err);
    message.error('获取培训计划失败');
    planList.value = [];
  } finally {
    planLoading.value = false;
  }
}

function handlePlanChange(planId: number) {
  selectedPlan.value = planList.value.find(p => p.id === planId) || null;
  executeResult.value = null;
}

async function handleExecute() {
  if (!selectedPlanId.value) {
    message.warning('请先选择培训计划');
    return;
  }
  if (!selectedEmployeeIds.value || selectedEmployeeIds.value.length === 0) {
    message.warning('请选择参训员工');
    return;
  }

  executeLoading.value = true;
  try {
    const result = await executeTrainingPlan(selectedPlanId.value, {
      employeeIds: selectedEmployeeIds.value,
      trainingDate: executeForm.trainingDate?.toISOString().slice(0, 10) || new Date().toISOString().slice(0, 10),
      result: executeForm.result,
      score: executeForm.score,
      remark: executeForm.remark,
    });
    executeResult.value = result;
    message.success(`成功生成 ${result.count} 条培训记录`);
    // 刷新计划列表（实际人数已更新）
    await fetchPlans();
  } catch (err) {
    console.warn('生成培训记录失败:', err);
    message.error('生成培训记录失败');
  } finally {
    executeLoading.value = false;
  }
}

function handleReset() {
  selectedEmployeeIds.value = [];
  executeForm.trainingDate = undefined;
  executeForm.result = '合格';
  executeForm.score = null;
  executeForm.remark = '';
  executeResult.value = null;
}

onMounted(async () => {
  await fetchPlans();
});
</script>

<style scoped lang="scss">
.hse-page {
  .action-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-top: 8px;
  }

  .selected-count {
    color: hsl(var(--primary));
    font-weight: 500;
  }
}
</style>
