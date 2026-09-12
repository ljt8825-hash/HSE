<template>
  <Page auto-content-height class="hse-page">
    <Card :bordered="false">
      <template #title>
        <div class="card-header">
          <span>审批任务</span>
          <ImportButtonGroup module="workflow" module-name="审批任务" />
        </div>
      </template>

      <Row :gutter="[16, 16]" class="stat-row">
        <Col :xs="12" :sm="8" :md="6">
          <Card :bordered="false" size="small" class="stat-card">
            <Statistic title="待办任务" :value="pendingCount" :value-style="{ color: 'hsl(var(--warning))' }">
              <template #prefix>
                <IconifyIcon icon="lucide:clock" />
              </template>
            </Statistic>
          </Card>
        </Col>
        <Col :xs="12" :sm="8" :md="6">
          <Card :bordered="false" size="small" class="stat-card">
            <Statistic title="已通过" :value="approvedCount" :value-style="{ color: 'hsl(var(--success))' }">
              <template #prefix>
                <IconifyIcon icon="lucide:check-circle" />
              </template>
            </Statistic>
          </Card>
        </Col>
        <Col :xs="12" :sm="8" :md="6">
          <Card :bordered="false" size="small" class="stat-card">
            <Statistic title="已驳回" :value="rejectedCount" :value-style="{ color: 'hsl(var(--error))' }">
              <template #prefix>
                <IconifyIcon icon="lucide:x-circle" />
              </template>
            </Statistic>
          </Card>
        </Col>
        <Col :xs="12" :sm="8" :md="6">
          <Card :bordered="false" size="small" class="stat-card">
            <Statistic title="全部任务" :value="totalCount">
              <template #prefix>
                <IconifyIcon icon="lucide:list-checks" />
              </template>
            </Statistic>
          </Card>
        </Col>
      </Row>

      <Tabs v-model:activeKey="activeTab" @change="(k: any) => handleTabChange(k)">
        <Tabs.TabPane key="pending" tab="我的待办">
          <div class="toolbar">
            <Space>
              <Input.Search
                v-model:value="searchForm.keyword"
                placeholder="搜索任务名称/节点"
                class="search-input"
                @search="pendingTable.handleReset"
              />
            </Space>
          </div>

            <Table
              :columns="taskColumns"
              :data-source="pendingList"
              :loading="pendingLoading"
              :pagination="pendingPagination"
              :row-key="(record) => record.id"
              @change="handlePendingTableChange"
              size="middle"
            >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'status'">
                <Tag color="warning">待处理</Tag>
              </template>
              <template v-else-if="column.key === 'createdAt'">
                {{ formatDate(record.createdAt) }}
              </template>
              <template v-else-if="column.key === 'action'">
                <Space>
                  <Button type="link" size="small" @click="handleViewHistory(record as any)">
                    审批历史
                  </Button>
                  <Button type="link" size="small" @click="handleApprove(record as any)">
                    通过
                  </Button>
                  <Button type="link" size="small" danger @click="handleReject(record as any)">
                    驳回
                  </Button>
                </Space>
              </template>
            </template>
          </Table>
        </Tabs.TabPane>

        <Tabs.TabPane key="done" tab="已办事项">
          <div class="toolbar">
            <Space>
              <Select
                v-model:value="searchForm.status"
                placeholder="全部状态"
                allow-clear
                class="filter-select"
                @change="doneTable.handleReset"
              >
                <Select.Option value="approved">已通过</Select.Option>
                <Select.Option value="rejected">已驳回</Select.Option>
              </Select>
            </Space>
          </div>

            <Table
              :columns="doneColumns"
              :data-source="doneList"
              :loading="doneLoading"
              :pagination="donePagination"
              :row-key="(record) => record.id"
              @change="handleDoneTableChange"
              size="middle"
            >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'status'">
                <Tag :color="getTaskStatusColor(record.status)">
                  {{ getTaskStatusText(record.status) }}
                </Tag>
              </template>
              <template v-else-if="column.key === 'approvedAt'">
                {{ record.approvedAt ? formatDate(record.approvedAt) : '-' }}
              </template>
              <template v-else-if="column.key === 'action'">
                <Space>
                  <Button type="link" size="small" @click="handleViewHistory(record as any)">
                    审批历史
                  </Button>
                </Space>
              </template>
            </template>
          </Table>
        </Tabs.TabPane>
      </Tabs>
    </Card>

    <Drawer v-model:open="historyDrawerVisible" title="审批历史" width="500px">
      <Timeline>
        <TimelineItem
          v-for="(item, index) in taskHistory"
          :key="index"
          :color="item.status === 'approved' ? 'green' : item.status === 'rejected' ? 'red' : 'blue'"
        >
          <p><strong>{{ item.nodeName }}</strong></p>
          <p class="history-time">
            {{ item.approvedAt ? formatDate(item.approvedAt) : '待处理' }}
          </p>
          <p v-if="item.remark" class="history-remark">{{ item.remark }}</p>
        </TimelineItem>
      </Timeline>
    </Drawer>

    <Modal
      v-model:open="approveModalVisible"
      :title="isReject ? '驳回任务' : '通过任务'"
      :confirm-loading="approveLoading"
      @ok="handleApproveConfirm"
      @cancel="approveModalVisible = false"
    >
      <Form layout="vertical">
        <FormItem label="意见">
          <Input.TextArea
            v-model:value="approveForm.remark"
            :rows="4"
            :placeholder="isReject ? '请输入驳回原因...' : '请输入审批意见...'"
          />
        </FormItem>
      </Form>
    </Modal>
  </Page>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import {
  Button,
  Card,
  Col,
  Drawer,
  Form,
  FormItem,
  Input,
  Modal,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
  Timeline,
  TimelineItem,
  message,
} from 'ant-design-vue';
import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';
import dayjs from 'dayjs';
import { $t } from '#/locales';

import { useWorkflowStore } from '#/store/workflow';
import ImportButtonGroup from '#/components/hse/ImportButtonGroup.vue';
import { useSearchForm, useDataTable } from '#/composables/hse';
import { approveTask, rejectTask, getTaskHistory, type WorkflowApi } from '#/api/hse/workflow';

const workflowStore = useWorkflowStore();

const activeTab = ref('pending');

/** 审批任务搜索 / 筛选表单字段类型 */
interface WorkflowSearchForm {
  keyword: string;
  status?: string;
}

// 搜索 / 筛选表单（统一由 useSearchForm 托管状态与重置）
const { form: searchForm } = useSearchForm<WorkflowSearchForm>({
  defaults: { keyword: '', status: undefined },
  onSearch: () => {
    if (activeTab.value === 'pending') pendingTable.handleReset();
    else doneTable.handleReset();
  },
  debounceMs: 300,
});

// 待办任务表格（统一由 useDataTable 托管分页 / loading / 数据）
const pendingTable = useDataTable<WorkflowApi.WorkflowTask>({
  fetchFn: async ({ page, pageSize }) => {
    await workflowStore.fetchTasks({ page, pageSize, status: 'pending' });
    const list = workflowStore.tasks.filter((t) => t.status === 'pending');
    return { list, total: list.length };
  },
  defaultPageSize: 10,
  paginationExtra: { showSizeChanger: true, showTotal: (t: number) => `共 ${t} 条` },
});

// 已办任务表格（同样接入 useDataTable；已办为 store 全量后客户端按状态筛选）
const doneTable = useDataTable<WorkflowApi.WorkflowTask>({
  fetchFn: async ({ page, pageSize }) => {
    await workflowStore.fetchTasks({ page, pageSize });
    let list = workflowStore.tasks.filter((t) => t.status !== 'pending');
    if (searchForm.status) list = list.filter((t) => t.status === searchForm.status);
    return { list, total: list.length };
  },
  defaultPageSize: 10,
  paginationExtra: { showSizeChanger: true, showTotal: (t: number) => `共 ${t} 条` },
});

const { dataList: pendingList, loading: pendingLoading, pagination: pendingPagination, fetchData: fetchPendingTasks, handleTableChange: handlePendingTableChange } = pendingTable;
const { dataList: doneList, loading: doneLoading, pagination: donePagination, fetchData: fetchDoneTasks, handleTableChange: handleDoneTableChange } = doneTable;

const historyDrawerVisible = ref(false);
const taskHistory = ref<WorkflowApi.WorkflowTask[]>([]);

const approveModalVisible = ref(false);
const approveLoading = ref(false);
const isReject = ref(false);
const currentTask = ref<WorkflowApi.WorkflowTask | null>(null);
const approveForm = reactive({ remark: '' });

// pendingTasks / doneTasks 已由 useDataTable 的 pendingList / doneList 托管

const pendingCount = computed(() =>
  workflowStore.tasks.filter((t) => t.status === 'pending').length,
);
const approvedCount = computed(() =>
  workflowStore.tasks.filter((t) => t.status === 'approved').length,
);
const rejectedCount = computed(() =>
  workflowStore.tasks.filter((t) => t.status === 'rejected').length,
);
const totalCount = computed(() => workflowStore.tasks.length);

const taskColumns = [
  {
    title: '序号',
    key: 'index',
    width: 60,
    align: 'center' as const,
    customRender: ({ index }: { index: number }) => (pendingPagination.current - 1) * pendingPagination.pageSize + index + 1,
  },
  { title: '任务节点', dataIndex: 'nodeName', key: 'nodeName', width: 160 },
  { title: '实例ID', dataIndex: 'instanceId', key: 'instanceId', width: 100 },
  { title: '指派人', dataIndex: 'assignee', key: 'assignee', width: 100 },
  { title: '状态', key: 'status', width: 100 },
  { title: '到达时间', key: 'createdAt', width: 170 },
  { title: '操作', key: 'action', width: 200, fixed: 'right' as const },
];

const doneColumns = [
  {
    title: '序号',
    key: 'index',
    width: 60,
    align: 'center' as const,
    customRender: ({ index }: { index: number }) => (donePagination.current - 1) * donePagination.pageSize + index + 1,
  },
  { title: '任务节点', dataIndex: 'nodeName', key: 'nodeName', width: 160 },
  { title: '实例ID', dataIndex: 'instanceId', key: 'instanceId', width: 100 },
  { title: '指派人', dataIndex: 'assignee', key: 'assignee', width: 100 },
  { title: '状态', key: 'status', width: 100 },
  { title: '处理时间', key: 'approvedAt', width: 170 },
  { title: '操作', key: 'action', width: 120, fixed: 'right' as const },
];

function formatDate(date: string): string {
  return dayjs(date).format('YYYY-MM-DD HH:mm:ss');
}

function getTaskStatusColor(status: string): string {
  const map: Record<string, string> = {
    pending: 'warning',
    approved: 'success',
    rejected: 'error',
  };
  return map[status] || 'default';
}

function getTaskStatusText(status: string): string {
  const map: Record<string, string> = {
    pending: '待处理',
    approved: '已通过',
    rejected: '已驳回',
  };
  return map[status] || status;
}

function handleTabChange(key: string) {
  if (key === 'pending') {
    fetchPendingTasks();
  } else if (key === 'done') {
    fetchDoneTasks();
  }
}

// 待办 / 已办 列表加载、搜索、分页变化已由 useDataTable 托管
// （fetchPendingTasks / fetchDoneTasks / handlePendingTableChange / handleDoneTableChange 现为 composable 别名）

async function handleViewHistory(record: WorkflowApi.WorkflowTask) {
  try {
    const history = await getTaskHistory(record.instanceId);
    taskHistory.value = history as unknown as WorkflowApi.WorkflowTask[];
  } catch (err) {
    console.warn('获取历史失败:', err);
    taskHistory.value = [
      {
        id: 1,
        instanceId: record.instanceId,
        nodeName: '发起申请',
        status: 'approved',
        createdAt: record.createdAt,
        approvedAt: record.createdAt,
        remark: '提交申请',
      },
      {
        id: 2,
        instanceId: record.instanceId,
        nodeName: record.nodeName,
        status: record.status,
        createdAt: record.createdAt,
        approvedAt: record.approvedAt,
        remark: record.remark,
      },
    ];
  }
  historyDrawerVisible.value = true;
}

function handleApprove(record: WorkflowApi.WorkflowTask) {
  currentTask.value = record;
  isReject.value = false;
  approveForm.remark = '';
  approveModalVisible.value = true;
}

function handleReject(record: WorkflowApi.WorkflowTask) {
  currentTask.value = record;
  isReject.value = true;
  approveForm.remark = '';
  approveModalVisible.value = true;
}

async function handleApproveConfirm() {
  if (!currentTask.value) return;
  approveLoading.value = true;
  try {
    if (isReject.value) {
      await rejectTask({ taskId: currentTask.value.id, remark: approveForm.remark });
      message.success('驳回成功');
    } else {
      await approveTask({ taskId: currentTask.value.id, remark: approveForm.remark });
      message.success('通过成功');
    }
    approveModalVisible.value = false;
    fetchPendingTasks();
  } catch (err) {
    console.warn('操作失败:', err);
    message.error($t('hse.message.operationFailed'));
  } finally {
    approveLoading.value = false;
  }
}

onMounted(() => {
  fetchPendingTasks();
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

  .stat-row {
    margin-bottom: 16px;

    .stat-card {
      cursor: pointer;
      transition: all 0.2s;

      &:hover {
        transform: translateY(-2px);
      }
    }
  }

  .toolbar {
    margin-bottom: 16px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .search-input {
    width: 240px;
  }

  .filter-select {
    width: 140px;
  }

  .history-time {
    color: hsl(var(--muted-foreground));
    font-size: 12px;
  }

  .history-remark {
    margin-top: 4px;
  }
}
</style>

<style lang="scss">
/* 非 scoped 块：Ant Statistic 内部元素需通过类命中覆盖默认样式。
   仅限 .stat-row .stat-card 内部，避免污染全局 antd 样式。 */
.stat-row .stat-card {
  .ant-statistic-title {
    font-size: 13px;
    color: hsl(var(--muted-foreground));
  }

  .ant-statistic-content {
    font-size: 24px;
    font-weight: 600;
  }

  .ant-statistic-content-prefix {
    font-size: 20px;
    margin-right: 8px;
  }
}
</style>

<!-- 设计系统对齐：非 scoped 块（.stat-row .stat-card .ant-statistic-*）已用 hsl(var(--muted-foreground)) 语义变量且仅限本页统计卡片，无全局泄漏、主题可跟随，保留 -->

