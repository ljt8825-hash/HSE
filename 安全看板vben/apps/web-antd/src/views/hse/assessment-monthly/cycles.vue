<template>
  <div class="p-4">
    <a-card>
      <template #title>考核周期管理</template>
      <a-space class="mb-4">
        <a-input-search
          v-model:value="keyword"
          placeholder="搜索周期名称"
          style="width: 240px"
          allow-clear
          @search="loadData"
        />
        <a-select
          v-model:value="filterStatus"
          placeholder="状态筛选"
          style="width: 140px"
          allow-clear
          @change="loadData"
        >
          <Select.Option value="not_started">未开始</Select.Option>
          <Select.Option value="in_progress">进行中</Select.Option>
          <Select.Option value="pending_review">待审核</Select.Option>
          <Select.Option value="reviewed">已审核</Select.Option>
          <Select.Option value="frozen">已冻结</Select.Option>
        </a-select>
        <a-button type="primary" @click="showCreateModal">
          <template #icon><plus-outlined /></template>
          新建周期
        </a-button>
        <a-button @click="loadData">
          <template #icon><reload-outlined /></template>
          刷新
        </a-button>
      </a-space>

      <a-table :columns="columns" :data-source="dataSource" :loading="loading" :pagination="pagination" @change="handleTableChange">
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'status'">
            <a-tag :color="getStatusColor(record.status)">{{ getStatusText(record.status) }}</a-tag>
          </template>
          <template v-else-if="column.key === 'action'">
            <a-space>
              <a-button type="link" size="small" @click="handleStart(record)" v-if="record.status === 'not_started'">
                启动
              </a-button>
              <a-button type="link" size="small" @click="handleView(record)">
                详情
              </a-button>
              <a-popconfirm
                title="确认删除该考核周期？"
                ok-text="确认"
                cancel-text="取消"
                @confirm="handleDelete(record)"
              >
                <a-button type="link" size="small" danger v-if="record.status !== 'frozen'">
                  删除
                </a-button>
              </a-popconfirm>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <a-modal v-model:open="createModalOpen" title="新建考核周期" @ok="handleCreate" :confirm-loading="creating">
      <a-form :model="createForm" layout="vertical">
        <a-form-item label="考核年份" required>
          <a-input-number v-model:value="createForm.assessment_year" :min="2020" :max="2099" style="width: 100%" />
        </a-form-item>
        <a-form-item label="考核月份" required>
          <a-input-number v-model:value="createForm.assessment_month" :min="1" :max="12" style="width: 100%" />
        </a-form-item>
        <a-form-item label="周期名称">
          <a-input v-model:value="createForm.cycle_name" placeholder="留空则自动生成" />
        </a-form-item>
        <a-form-item label="备注">
          <a-textarea v-model:value="createForm.remark" :rows="3" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons-vue';
import { message, Select } from 'ant-design-vue';
import {
  getAssessmentCycleList,
  createAssessmentCycle,
  deleteAssessmentCycle,
  startAssessmentCycle,
} from '#/api/hse/assessment-monthly';
import type { AssessmentMonthlyApi } from '#/api/hse/assessment-monthly';

type AssessmentCycle = AssessmentMonthlyApi.AssessmentCycle;

const loading = ref(false);
const creating = ref(false);
const keyword = ref('');
const filterStatus = ref<string | undefined>();
const dataSource = ref<AssessmentCycle[]>([]);

const pagination = reactive({
  current: 1,
  pageSize: 20,
  total: 0,
  showSizeChanger: true,
  showTotal: (total: number) => `共 ${total} 条`,
});

const columns = [
  { title: '周期编码', dataIndex: 'cycle_code', key: 'cycle_code', width: 200 },
  { title: '周期名称', dataIndex: 'cycle_name', key: 'cycle_name' },
  { title: '考核年月', key: 'period', width: 120, customRender: ({ record }: any) => `${record.assessment_year}年${record.assessment_month}月` },
  { title: '状态', dataIndex: 'status', key: 'status', width: 100 },
  { title: '考核对象数', dataIndex: 'target_count', key: 'target_count', width: 110 },
  { title: '已评分', dataIndex: 'scored_count', key: 'scored_count', width: 100 },
  { title: '创建人', dataIndex: 'created_by_name', key: 'created_by_name', width: 100 },
  { title: '创建时间', dataIndex: 'created_at', key: 'created_at', width: 180 },
  { title: '操作', key: 'action', width: 180, fixed: 'right' as const },
];

const createModalOpen = ref(false);
const createForm = reactive({
  assessment_year: new Date().getFullYear(),
  assessment_month: new Date().getMonth() + 1,
  cycle_name: '',
  remark: '',
});

function getStatusText(status: string) {
  const map: Record<string, string> = {
    not_started: '未开始',
    in_progress: '进行中',
    pending_review: '待审核',
    reviewed: '已审核',
    frozen: '已冻结',
  };
  return map[status] || status;
}

function getStatusColor(status: string) {
  const map: Record<string, string> = {
    not_started: 'default',
    in_progress: 'processing',
    pending_review: 'warning',
    reviewed: 'success',
    frozen: 'purple',
  };
  return map[status] || 'default';
}

async function loadData() {
  loading.value = true;
  try {
    const res: any = await getAssessmentCycleList({
      page: pagination.current,
      page_size: pagination.pageSize,
      status: filterStatus.value,
      sort_by: 'created_at',
      sort_order: 'desc',
    });
    dataSource.value = res.list || [];
    pagination.total = res.total || 0;
  } catch (e: any) {
    message.error(e.message || '加载失败');
  } finally {
    loading.value = false;
  }
}

function handleTableChange(pag: any) {
  pagination.current = pag.current;
  pagination.pageSize = pag.pageSize;
  loadData();
}

function showCreateModal() {
  createForm.assessment_year = new Date().getFullYear();
  createForm.assessment_month = new Date().getMonth() + 1;
  createForm.cycle_name = '';
  createForm.remark = '';
  createModalOpen.value = true;
}

async function handleCreate() {
  creating.value = true;
  try {
    await createAssessmentCycle(createForm);
    message.success('创建成功');
    createModalOpen.value = false;
    loadData();
  } catch (e: any) {
    message.error(e.message || '创建失败');
  } finally {
    creating.value = false;
  }
}

async function handleStart(record: AssessmentCycle) {
  try {
    await startAssessmentCycle(record.id);
    message.success('考核周期已启动');
    loadData();
  } catch (e: any) {
    message.error(e.message || '启动失败');
  }
}

async function handleDelete(record: AssessmentCycle) {
  try {
    await deleteAssessmentCycle(record.id);
    message.success('删除成功');
    loadData();
  } catch (e: any) {
    message.error(e.message || '删除失败');
  }
}

function handleView(_record?: any) {
  message.info('详情页开发中');
}

onMounted(() => {
  loadData();
});
</script>
