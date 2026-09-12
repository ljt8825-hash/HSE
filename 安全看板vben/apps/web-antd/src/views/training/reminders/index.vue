<template>
  <Page auto-content-height class="hse-page">
    <Alert
      type="info"
      show-icon
      message="接口能力已完成，定时调度将在 Sprint6 实现"
      description="当前提供查询能力，支持查看即将到期、已逾期、从未培训的员工。Sprint6 将集成定时任务自动推送提醒。"
      style="margin-bottom: 16px;"
    />

    <Tabs v-model:activeKey="activeTab">
      <TabPane key="expiry" tab="培训到期检查">
        <Row :gutter="[16, 16]" style="margin-bottom: 16px;">
          <Col :xs="24" :sm="8">
            <Card :bordered="false">
              <Statistic title="即将到期" :value="expiryData.summary?.expiringCount || 0" :value-style="{ color: '#faad14' }">
                <template #prefix><IconifyIcon icon="lucide:clock-alert" /></template>
              </Statistic>
            </Card>
          </Col>
          <Col :xs="24" :sm="8">
            <Card :bordered="false">
              <Statistic title="已逾期" :value="expiryData.summary?.expiredCount || 0" :value-style="{ color: '#ff4d4f' }">
                <template #prefix><IconifyIcon icon="lucide:alert-octagon" /></template>
              </Statistic>
            </Card>
          </Col>
          <Col :xs="24" :sm="8">
            <Card :bordered="false">
              <Statistic title="从未培训" :value="expiryData.summary?.missingCount || 0" :value-style="{ color: '#999' }">
                <template #prefix><IconifyIcon icon="lucide:user-x" /></template>
              </Statistic>
            </Card>
          </Col>
        </Row>

        <Form layout="inline" style="margin-bottom: 16px;">
          <FormItem label="到期天数">
            <Select v-model:value="daysAhead" style="width: 120px" @change="fetchExpiryData">
              <SelectOption :value="15">15天内</SelectOption>
              <SelectOption :value="30">30天内</SelectOption>
              <SelectOption :value="60">60天内</SelectOption>
              <SelectOption :value="90">90天内</SelectOption>
            </Select>
          </FormItem>
          <FormItem>
            <Button @click="fetchExpiryData">
              <template #icon><IconifyIcon icon="lucide:refresh-cw" /></template>
              刷新
            </Button>
          </FormItem>
        </Form>

        <Card :bordered="false" title="即将到期人员" style="margin-bottom: 16px;">
          <Table
            :columns="expiryColumns"
            :data-source="expiryData.expiring"
            :loading="expiryLoading"
            :pagination="{ pageSize: 10 }"
            :row-key="(record) => `exp-${record.employeeId}`"
            size="middle"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'name'">
                <EmployeeName :employee-id="record.employeeId" />
                <span v-if="!record.employeeId">{{ record.name || '-' }}</span>
              </template>
              <template v-else-if="column.key === 'expiryStatus'">
                <Tag color="orange">即将到期</Tag>
              </template>
              <template v-else-if="column.key === 'isDriver'">
                <Tag v-if="record.isDriver" color="blue">驾驶员</Tag>
                <span v-else>-</span>
              </template>
            </template>
          </Table>
        </Card>

        <Card :bordered="false" title="已逾期人员" style="margin-bottom: 16px;">
          <Table
            :columns="expiryColumns"
            :data-source="expiryData.expired"
            :loading="expiryLoading"
            :pagination="{ pageSize: 10 }"
            :row-key="(record) => `exp-${record.employeeId}`"
            size="middle"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'name'">
                <EmployeeName :employee-id="record.employeeId" />
                <span v-if="!record.employeeId">{{ record.name || '-' }}</span>
              </template>
              <template v-else-if="column.key === 'expiryStatus'">
                <Tag color="red">已逾期</Tag>
              </template>
              <template v-else-if="column.key === 'isDriver'">
                <Tag v-if="record.isDriver" color="blue">驾驶员</Tag>
                <span v-else>-</span>
              </template>
            </template>
          </Table>
        </Card>

        <Card :bordered="false" title="从未培训人员">
          <Table
            :columns="expiryColumns"
            :data-source="expiryData.missing"
            :loading="expiryLoading"
            :pagination="{ pageSize: 10 }"
            :row-key="(record) => `miss-${record.employeeId}`"
            size="middle"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'name'">
                <EmployeeName :employee-id="record.employeeId" />
                <span v-if="!record.employeeId">{{ record.name || '-' }}</span>
              </template>
              <template v-else-if="column.key === 'expiryStatus'">
                <Tag color="default">从未培训</Tag>
              </template>
              <template v-else-if="column.key === 'isDriver'">
                <Tag v-if="record.isDriver" color="blue">驾驶员</Tag>
                <span v-else>-</span>
              </template>
            </template>
          </Table>
        </Card>
      </TabPane>

      <TabPane key="newEmployee" tab="新员工培训识别">
        <Alert
          type="warning"
          show-icon
          message="新员工培训识别规则"
          description="入职日期在90天内的新员工，如未完成新员工类型培训或培训结果不合格，将在此显示。"
          style="margin-bottom: 16px;"
        />

        <Row :gutter="[16, 16]" style="margin-bottom: 16px;">
          <Col :xs="24" :sm="8">
            <Card :bordered="false">
              <Statistic title="新员工总数" :value="newEmployeeData.summary?.totalCount || 0" />
            </Card>
          </Col>
          <Col :xs="24" :sm="8">
            <Card :bordered="false">
              <Statistic title="未完成培训" :value="newEmployeeData.summary?.incompleteCount || 0" :value-style="{ color: '#ff4d4f' }" />
            </Card>
          </Col>
          <Col :xs="24" :sm="8">
            <Card :bordered="false">
              <Statistic title="已完成培训" :value="newEmployeeData.summary?.completedCount || 0" :value-style="{ color: '#52c41a' }" />
            </Card>
          </Col>
        </Row>

        <Card :bordered="false" title="新员工培训要求">
          <Table
            :columns="requirementColumns"
            :data-source="newEmployeeData.requirements"
            :pagination="false"
            :row-key="(record) => record.id"
            size="small"
          />
          <div v-if="!newEmployeeData.requirements || newEmployeeData.requirements.length === 0" class="empty-tip">
            暂无新员工培训要求，请先在培训要求管理中添加包含"新员工"或"入职"关键词的培训要求
          </div>
        </Card>

        <Card :bordered="false" title="未完成新员工培训人员" style="margin-top: 16px;">
          <Table
            :columns="newEmployeeColumns"
            :data-source="newEmployeeData.incomplete"
            :loading="newEmployeeLoading"
            :pagination="{ pageSize: 10 }"
            :row-key="(record) => `ne-${record.employeeId}`"
            size="middle"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'name'">
                <EmployeeName :employee-id="record.employeeId" />
                <span v-if="!record.employeeId">{{ record.name || '-' }}</span>
              </template>
              <template v-else-if="column.key === 'status'">
                <Tag :color="record.status === '未培训' ? 'red' : 'orange'">{{ record.status }}</Tag>
              </template>
              <template v-else-if="column.key === 'daysSinceHire'">
                <span :style="{ color: record.daysSinceHire > 30 ? '#ff4d4f' : '' }">
                  {{ record.daysSinceHire }} 天
                </span>
              </template>
            </template>
          </Table>
        </Card>
      </TabPane>
    </Tabs>
  </Page>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import {
  Card,
  Row,
  Col,
  Tabs,
  TabPane,
  Table,
  Form,
  FormItem,
  Select,
  SelectOption,
  Button,
  Tag,
  Alert,
  Statistic,
  message,
} from 'ant-design-vue';
import { IconifyIcon } from '@vben/icons';
import { Page } from '@vben/common-ui';
import { EmployeeName } from '#/composables/hse';

import {
  getExpiryReminders,
  getNewEmployeeReminders,
  type ExpiryReminderResult,
  type NewEmployeeReminderResult,
} from '#/api/hse/training';

const activeTab = ref<'expiry' | 'newEmployee'>('expiry');

const expiryLoading = ref(false);
const expiryData = ref<ExpiryReminderResult>({
  expiring: [],
  expired: [],
  missing: [],
  summary: { expiringCount: 0, expiredCount: 0, missingCount: 0, total: 0 },
  note: '',
});
const daysAhead = ref(30);

const newEmployeeLoading = ref(false);
const newEmployeeData = ref<NewEmployeeReminderResult>({
  incomplete: [],
  requirements: [],
  summary: { totalCount: 0, incompleteCount: 0, completedCount: 0 },
});

const expiryColumns = [
  { title: '姓名', dataIndex: 'name', key: 'name', width: 100 },
  { title: '工号', dataIndex: 'employeeCode', key: 'employeeCode', width: 100 },
  { title: '岗位', dataIndex: 'positionName', key: 'positionName', width: 120 },
  { title: '部门', dataIndex: 'orgName', key: 'orgName', width: 150 },
  { title: '是否驾驶员', key: 'isDriver', width: 100 },
  { title: '培训类型', dataIndex: 'trainingType', key: 'trainingType', width: 100 },
  { title: '最近培训日期', dataIndex: 'trainingDate', key: 'trainingDate', width: 120 },
  { title: '到期日期', dataIndex: 'expiryDate', key: 'expiryDate', width: 120 },
  { title: '状态', key: 'expiryStatus', width: 100 },
];

const newEmployeeColumns = [
  { title: '姓名', dataIndex: 'name', key: 'name', width: 100 },
  { title: '工号', dataIndex: 'employeeCode', key: 'employeeCode', width: 100 },
  { title: '岗位', dataIndex: 'positionName', key: 'positionName', width: 120 },
  { title: '部门', dataIndex: 'orgName', key: 'orgName', width: 150 },
  { title: '入职日期', dataIndex: 'hireDate', key: 'hireDate', width: 120 },
  { title: '入职天数', key: 'daysSinceHire', width: 100 },
  { title: '最近培训日期', dataIndex: 'lastTrainingDate', key: 'lastTrainingDate', width: 120 },
  { title: '最近培训结果', dataIndex: 'lastTrainingResult', key: 'lastTrainingResult', width: 100 },
  { title: '状态', key: 'status', width: 100 },
];

const requirementColumns = [
  { title: '岗位', dataIndex: 'positionName', key: 'positionName', width: 150 },
  { title: '培训名称', dataIndex: 'trainingName', key: 'trainingName', width: 200 },
  { title: '时长(分钟)', dataIndex: 'durationMinutes', key: 'durationMinutes', width: 100 },
];

async function fetchExpiryData() {
  expiryLoading.value = true;
  try {
    const data = await getExpiryReminders(daysAhead.value);
    expiryData.value = data;
  } catch (err) {
    console.warn('获取到期数据失败:', err);
    message.error('获取到期数据失败');
  } finally {
    expiryLoading.value = false;
  }
}

async function fetchNewEmployeeData() {
  newEmployeeLoading.value = true;
  try {
    const data = await getNewEmployeeReminders();
    newEmployeeData.value = data;
  } catch (err) {
    console.warn('获取新员工数据失败:', err);
    message.error('获取新员工培训数据失败');
  } finally {
    newEmployeeLoading.value = false;
  }
}

onMounted(async () => {
  await Promise.all([fetchExpiryData(), fetchNewEmployeeData()]);
});
</script>

<style scoped lang="scss">
.hse-page {
  .empty-tip {
    text-align: center;
    color: hsl(var(--muted-foreground));
    padding: 16px 0;
    font-size: 13px;
  }
}
</style>
