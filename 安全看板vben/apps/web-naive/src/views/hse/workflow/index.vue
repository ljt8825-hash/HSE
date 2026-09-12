<script lang="ts" setup>
/**
 * 工作流引擎 - 审批任务管理（web-naive）
 * 待办任务 / 已办事项 / 审批历史
 */
import { computed, reactive, ref, onMounted } from 'vue';

import {
  NButton,
  NCard,
  NDrawer,
  NDrawerContent,
  NForm,
  NFormItem,
  NGi,
  NInput,
  NModal,
  NSelect,
  NSpace,
  NStatistic,
  NTabPane,
  NTabs,
  NText,
  NTimeline,
  NTimelineItem,
} from 'naive-ui';

import { HseDataGrid, HsePageLayout, HseSearchPanel, HseStatusTag } from '#/components/hse';
import type { VxeTableGridColumns } from '#/adapter/vxe-table';
import {
  getWorkflowTasks,
  approveTask,
  rejectTask,
  getTaskHistory,
  type WorkflowApi,
} from '#/api/hse/workflow';
import { message } from '#/adapter/naive';

defineOptions({ name: 'HseWorkflow' });

const activeTab = ref('pending');

// ===================== 待办任务 =====================
const pendingLoading = ref(false);
const pendingList = ref<WorkflowApi.WorkflowTask[]>([]);
const pendingTotal = ref(0);
const pendingPage = ref(1);
const pendingPageSize = ref(10);
const pendingKeyword = ref('');

async function fetchPendingTasks() {
  pendingLoading.value = true;
  try {
    const res = await getWorkflowTasks({
      page: pendingPage.value,
      pageSize: pendingPageSize.value,
      status: 'pending',
      keyword: pendingKeyword.value || undefined,
    } as WorkflowApi.TaskListParams & { keyword?: string });
    pendingList.value = res.list ?? [];
    pendingTotal.value = res.total ?? 0;
  } catch {
    pendingList.value = [];
    pendingTotal.value = 0;
  } finally {
    pendingLoading.value = false;
  }
}

function onPendingPageChange(payload: { currentPage: number; pageSize: number }) {
  pendingPage.value = payload.currentPage;
  pendingPageSize.value = payload.pageSize;
  fetchPendingTasks();
}

function onPendingSearch() {
  pendingPage.value = 1;
  fetchPendingTasks();
}

function onPendingReset() {
  pendingKeyword.value = '';
  onPendingSearch();
}

// ===================== 已办任务 =====================
const doneLoading = ref(false);
const doneList = ref<WorkflowApi.WorkflowTask[]>([]);
const doneTotal = ref(0);
const donePage = ref(1);
const donePageSize = ref(10);
const doneStatus = ref<string | null>(null);

async function fetchDoneTasks() {
  doneLoading.value = true;
  try {
    const params: WorkflowApi.TaskListParams = {
      page: donePage.value,
      pageSize: donePageSize.value,
    };
    // Request all non-pending, filter client-side for status
    const res = await getWorkflowTasks({
      ...params,
      status: doneStatus.value || undefined,
    } as WorkflowApi.TaskListParams);
    doneList.value = (res.list ?? []).filter((t) => t.status !== 'pending');
    doneTotal.value = doneList.value.length;
  } catch {
    doneList.value = [];
    doneTotal.value = 0;
  } finally {
    doneLoading.value = false;
  }
}

function onDonePageChange(payload: { currentPage: number; pageSize: number }) {
  donePage.value = payload.currentPage;
  donePageSize.value = payload.pageSize;
  fetchDoneTasks();
}

function onDoneStatusChange(value: string | null) {
  doneStatus.value = value;
  donePage.value = 1;
  fetchDoneTasks();
}

// ===================== 统计 =====================
const pendingCount = computed(() => pendingList.value.length);
const approvedCount = computed(() => doneList.value.filter((t) => t.status === 'approved').length);
const rejectedCount = computed(() => doneList.value.filter((t) => t.status === 'rejected').length);
const totalCount = computed(() => pendingTotal.value + doneTotal.value);

// ===================== 审批操作 =====================
const historyDrawerVisible = ref(false);
const taskHistory = ref<WorkflowApi.WorkflowTask[]>([]);

const approveModalVisible = ref(false);
const approveLoading = ref(false);
const isReject = ref(false);
const currentTask = ref<WorkflowApi.WorkflowTask | null>(null);
const approveForm = reactive({ remark: '' });

async function handleViewHistory(record: WorkflowApi.WorkflowTask) {
  try {
    const history = await getTaskHistory(record.instanceId);
    taskHistory.value = history ?? [];
  } catch {
    taskHistory.value = [
      {
        id: record.id,
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
    await Promise.all([fetchPendingTasks(), fetchDoneTasks()]);
  } catch {
    message.error('操作失败');
  } finally {
    approveLoading.value = false;
  }
}

// ===================== 工具函数 =====================
function formatDate(date?: string): string {
  if (!date) return '-';
  try {
    return new Date(date).toLocaleString('zh-CN');
  } catch {
    return date;
  }
}

function getTaskStatusType(status: string): 'success' | 'danger' | 'warning' | 'neutral' {
  const map: Record<string, 'success' | 'danger' | 'warning' | 'neutral'> = {
    pending: 'warning',
    approved: 'success',
    rejected: 'danger',
  };
  return map[status] || 'neutral';
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
  activeTab.value = key;
  if (key === 'done') {
    fetchDoneTasks();
  } else {
    fetchPendingTasks();
  }
}

// ===================== 表格列 =====================
const pendingColumns = ref<VxeTableGridColumns>([
  { title: '序号', field: '_index', type: 'seq', width: 60, align: 'center' },
  { title: '任务节点', field: 'nodeName', minWidth: 160, align: 'left' },
  { title: '实例ID', field: 'instanceId', width: 100, align: 'center' },
  { title: '指派人', field: 'assignee', width: 100, align: 'center' },
  { title: '状态', field: 'status', width: 100, align: 'center', slots: { default: 'status' } },
  { title: '到达时间', field: 'createdAt', width: 170, align: 'center', slots: { default: 'createdAt' } },
  {
    title: '操作',
    field: 'action',
    width: 200,
    align: 'center',
    fixed: 'right',
    slots: { default: 'action' },
  },
]);

const doneColumns = ref<VxeTableGridColumns>([
  { title: '序号', field: '_index', type: 'seq', width: 60, align: 'center' },
  { title: '任务节点', field: 'nodeName', minWidth: 160, align: 'left' },
  { title: '实例ID', field: 'instanceId', width: 100, align: 'center' },
  { title: '指派人', field: 'assignee', width: 100, align: 'center' },
  { title: '状态', field: 'status', width: 100, align: 'center', slots: { default: 'status' } },
  { title: '处理时间', field: 'approvedAt', width: 170, align: 'center', slots: { default: 'approvedAt' } },
  {
    title: '操作',
    field: 'action',
    width: 120,
    align: 'center',
    fixed: 'right',
    slots: { default: 'action' },
  },
]);

onMounted(() => {
  fetchPendingTasks();
});
</script>

<template>
  <HsePageLayout title="工作流引擎" description="审批任务管理与流程跟踪">
    <!-- 统计卡 -->
    <div class="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
      <NCard :bordered="false">
        <NStatistic label="待办任务" :value="pendingCount" />
      </NCard>
      <NCard :bordered="false">
        <NStatistic label="已通过" :value="approvedCount" />
      </NCard>
      <NCard :bordered="false">
        <NStatistic label="已驳回" :value="rejectedCount" />
      </NCard>
      <NCard :bordered="false">
        <NStatistic label="全部任务" :value="totalCount" />
      </NCard>
    </div>

    <!-- Tab 切换 -->
    <NCard :bordered="false">
      <NTabs v-model:value="activeTab" type="line" @update:value="handleTabChange">
        <!-- 我的待办 -->
        <NTabPane name="pending" tab="我的待办">
          <div class="mb-4">
            <HseSearchPanel @query="onPendingSearch" @reset="onPendingReset">
              <NGi>
                <NInput
                  v-model:value="pendingKeyword"
                  placeholder="搜索任务名称/节点"
                  clearable
                  @keyup.enter="onPendingSearch"
                />
              </NGi>
            </HseSearchPanel>
          </div>
          <HseDataGrid
            :columns="pendingColumns"
            :data="pendingList"
            :loading="pendingLoading"
            :pager="true"
            :total="pendingTotal"
            @page-change="onPendingPageChange"
          >
            <template #status="{ row }">
              <HseStatusTag :type="getTaskStatusType(row.status)">
                {{ getTaskStatusText(row.status) }}
              </HseStatusTag>
            </template>
            <template #createdAt="{ row }">
              {{ formatDate(row.createdAt) }}
            </template>
            <template #action="{ row }">
              <NSpace justify="center">
                <NButton size="small" type="primary" quaternary @click="handleViewHistory(row)">
                  审批历史
                </NButton>
                <NButton size="small" type="success" quaternary @click="handleApprove(row)">
                  通过
                </NButton>
                <NButton size="small" type="error" quaternary @click="handleReject(row)">
                  驳回
                </NButton>
              </NSpace>
            </template>
          </HseDataGrid>
        </NTabPane>

        <!-- 已办事项 -->
        <NTabPane name="done" tab="已办事项">
          <div class="mb-4 flex items-center gap-3">
            <NText depth="3">筛选状态:</NText>
            <NSelect
              :value="doneStatus"
              placeholder="全部状态"
              clearable
              style="width: 160px;"
              :options="[
                { label: '已通过', value: 'approved' },
                { label: '已驳回', value: 'rejected' },
              ]"
              @update:value="onDoneStatusChange"
            />
          </div>
          <HseDataGrid
            :columns="doneColumns"
            :data="doneList"
            :loading="doneLoading"
            :pager="true"
            :total="doneTotal"
            @page-change="onDonePageChange"
          >
            <template #status="{ row }">
              <HseStatusTag :type="getTaskStatusType(row.status)">
                {{ getTaskStatusText(row.status) }}
              </HseStatusTag>
            </template>
            <template #approvedAt="{ row }">
              {{ formatDate(row.approvedAt) }}
            </template>
            <template #action="{ row }">
              <NSpace justify="center">
                <NButton size="small" type="primary" quaternary @click="handleViewHistory(row)">
                  审批历史
                </NButton>
              </NSpace>
            </template>
          </HseDataGrid>
        </NTabPane>
      </NTabs>
    </NCard>

    <!-- 审批历史抽屉 -->
    <NDrawer
      v-model:show="historyDrawerVisible"
      :width="500"
      placement="right"
    >
      <NDrawerContent title="审批历史" closable>
        <NTimeline>
          <NTimelineItem
            v-for="(item, index) in taskHistory"
            :key="index"
            :type="item.status === 'approved' ? 'success' : item.status === 'rejected' ? 'error' : 'default'"
          >
            <NSpace vertical :size="4">
              <NText strong>{{ item.nodeName }}</NText>
              <NText depth="3" size="small">
                {{ item.approvedAt ? formatDate(item.approvedAt) : '待处理' }}
              </NText>
              <NText v-if="item.remark" size="small">{{ item.remark }}</NText>
            </NSpace>
          </NTimelineItem>
        </NTimeline>
      </NDrawerContent>
    </NDrawer>

    <!-- 审批弹窗 -->
    <NModal
      v-model:show="approveModalVisible"
      :title="isReject ? '驳回任务' : '通过任务'"
      preset="card"
      style="width: 500px; max-width: 92vw;"
      :mask-closable="false"
    >
      <NForm label-placement="top">
        <NFormItem label="审批意见">
          <NInput
            v-model:value="approveForm.remark"
            type="textarea"
            :placeholder="isReject ? '请输入驳回原因...' : '请输入审批意见（选填）...'"
            :rows="4"
          />
        </NFormItem>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="approveModalVisible = false">取消</NButton>
          <NButton
            :type="isReject ? 'error' : 'primary'"
            :loading="approveLoading"
            @click="handleApproveConfirm"
          >
            确认{{ isReject ? '驳回' : '通过' }}
          </NButton>
        </NSpace>
      </template>
    </NModal>
  </HsePageLayout>
</template>
