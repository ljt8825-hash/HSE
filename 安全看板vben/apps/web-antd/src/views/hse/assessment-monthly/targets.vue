<template>
  <div class="p-4">
    <a-card>
      <template #title>考核对象管理</template>

      <a-row :gutter="16" class="mb-4">
        <a-col :span="6">
          <a-select
            v-model:value="selectedCycleId"
            placeholder="请选择考核周期"
            style="width: 100%"
            :loading="cycleLoading"
            @change="handleCycleChange"
          >
            <Select.Option v-for="cycle in cycleList" :key="cycle.id" :value="cycle.id">
              {{ cycle.cycleName }}
            </Select.Option>
          </a-select>
        </a-col>
      </a-row>

      <a-space class="mb-4" wrap>
        <a-select
          v-model:value="filterTownship"
          placeholder="乡镇"
          style="width: 140px"
          allow-clear
          @change="loadData"
        >
          <Select.Option value="乡镇1">乡镇1</Select.Option>
          <Select.Option value="乡镇2">乡镇2</Select.Option>
          <Select.Option value="乡镇3">乡镇3</Select.Option>
        </a-select>
        <a-select
          v-model:value="filterPosition"
          placeholder="岗位"
          style="width: 140px"
          allow-clear
          @change="loadData"
        >
          <Select.Option value="安全员">安全员</Select.Option>
          <Select.Option value="负责人">负责人</Select.Option>
        </a-select>
        <a-select
          v-model:value="filterStatus"
          placeholder="状态"
          style="width: 140px"
          allow-clear
          @change="loadData"
        >
          <Select.Option value="pending">待评分</Select.Option>
          <Select.Option value="scored">已评分</Select.Option>
          <Select.Option value="reviewed">已审核</Select.Option>
          <Select.Option value="frozen">已冻结</Select.Option>
        </a-select>
        <a-input-search
          v-model:value="keyword"
          placeholder="搜索姓名/工号"
          style="width: 240px"
          allow-clear
          @search="loadData"
        />
        <a-button type="primary" @click="handleSync" :loading="syncing">
          <template #icon><sync-outlined /></template>
          同步对象
        </a-button>
        <a-button @click="showAddModal">
          <template #icon><plus-outlined /></template>
          添加对象
        </a-button>
        <a-button
          danger
          :disabled="selectedRowKeys.length === 0"
          @click="handleBatchRemove"
        >
          <template #icon><delete-outlined /></template>
          移除对象
        </a-button>
        <a-button @click="loadData">
          <template #icon><reload-outlined /></template>
          刷新
        </a-button>
      </a-space>

      <a-table
        :columns="columns"
        :data-source="dataSource"
        :loading="loading"
        :pagination="pagination"
        :row-selection="rowSelection"
        :scroll="{ x: 1200 }"
        @change="handleTableChange"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'status'">
            <a-tag :color="getStatusColor(record.status)">{{ getStatusText(record.status) }}</a-tag>
          </template>
          <template v-else-if="column.key === 'grade'">
            <a-tag :color="getGradeColor(record.grade)">{{ record.grade || '-' }}</a-tag>
          </template>
          <template v-else-if="column.key === 'score_total'">
            <span :class="record.scoreTotal >= 90 ? 'text-green-600 font-semibold' : record.scoreTotal >= 80 ? 'text-blue-600' : 'text-orange-600'">
              {{ record.scoreTotal ?? '-' }}
            </span>
          </template>
          <template v-else-if="column.key === 'action'">
            <a-space>
              <a-popconfirm
                title="确认移除该考核对象？"
                ok-text="确认"
                cancel-text="取消"
                @confirm="handleRemove(record)"
              >
                <a-button type="link" size="small" danger>移除</a-button>
              </a-popconfirm>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <a-modal v-model:open="addModalOpen" title="添加考核对象" width="600px" @ok="handleAdd" :confirm-loading="adding">
      <a-alert message="提示" type="info" show-icon class="mb-4">
        <template #description>
          输入员工ID列表，多个员工用逗号分隔。
        </template>
      </a-alert>
      <a-form :model="addForm" layout="vertical">
        <a-form-item label="员工ID列表" required>
          <a-textarea
            v-model:value="addForm.employeeIds"
            :rows="4"
            placeholder="例如：1001,1002,1003"
          />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import {
  SyncOutlined,
  PlusOutlined,
  DeleteOutlined,
  ReloadOutlined,
} from '@ant-design/icons-vue';
import { message, Select } from 'ant-design-vue';
import {
  getAssessmentCycleList,
  getAssessmentTargetList,
  syncAssessmentTargets,
  addAssessmentTargets,
  removeAssessmentTarget,
} from '#/api/hse/assessment-monthly';
import type { AssessmentMonthlyApi } from '#/api/hse/assessment-monthly';

type AssessmentTarget = AssessmentMonthlyApi.AssessmentTarget;
type AssessmentCycle = AssessmentMonthlyApi.AssessmentCycle;

const loading = ref(false);
const cycleLoading = ref(false);
const syncing = ref(false);
const adding = ref(false);
const keyword = ref('');
const filterTownship = ref<string | undefined>();
const filterPosition = ref<string | undefined>();
const filterStatus = ref<string | undefined>();
const selectedCycleId = ref<number | string | undefined>();
const cycleList = ref<AssessmentCycle[]>([]);
const dataSource = ref<AssessmentTarget[]>([]);
const selectedRowKeys = ref<(string | number)[]>([]);

const pagination = reactive({
  current: 1,
  pageSize: 20,
  total: 0,
  showSizeChanger: true,
  showTotal: (total: number) => `共 ${total} 条`,
});

const rowSelection = {
  selectedRowKeys,
  onChange: (keys: (string | number)[]) => {
    selectedRowKeys.value = keys;
  },
};

const columns = [
  { title: '姓名', dataIndex: 'employeeName', key: 'employee_name', width: 100 },
  { title: '工号', dataIndex: 'employeeCode', key: 'employee_code', width: 120 },
  { title: '岗位', dataIndex: 'position', key: 'position', width: 120 },
  { title: '乡镇', dataIndex: 'township', key: 'township', width: 120 },
  { title: '部门', dataIndex: 'department', key: 'department', width: 140 },
  { title: '状态', dataIndex: 'status', key: 'status', width: 100 },
  { title: '总分', dataIndex: 'scoreTotal', key: 'score_total', width: 100 },
  { title: '等级', dataIndex: 'grade', key: 'grade', width: 80 },
  { title: '乡镇排名', dataIndex: 'rankTownship', key: 'rank_township', width: 100 },
  { title: '总排名', dataIndex: 'rankAll', key: 'rank_all', width: 100 },
  { title: '操作', key: 'action', width: 80, fixed: 'right' as const },
];

const addModalOpen = ref(false);
const addForm = reactive({
  employeeIds: '',
});

function getStatusText(status: string) {
  const map: Record<string, string> = {
    pending: '待评分',
    scored: '已评分',
    reviewed: '已审核',
    frozen: '已冻结',
  };
  return map[status] || status;
}

function getStatusColor(status: string) {
  const map: Record<string, string> = {
    pending: 'default',
    scored: 'processing',
    reviewed: 'success',
    frozen: 'purple',
  };
  return map[status] || 'default';
}

function getGradeColor(grade: string) {
  const map: Record<string, string> = {
    A: 'green',
    B: 'blue',
    C: 'orange',
    D: 'red',
  };
  return map[grade] || 'default';
}

async function loadCycleList() {
  cycleLoading.value = true;
  try {
    const res: any = await getAssessmentCycleList({
      page: 1,
      page_size: 100,
      sort_by: 'created_at',
      sort_order: 'desc',
    });
    cycleList.value = res.list || [];
    if (cycleList.value.length > 0 && !selectedCycleId.value) {
      selectedCycleId.value = cycleList.value[0]!.id;
      loadData();
    }
  } catch (e: any) {
    message.error(e.message || '加载周期列表失败');
  } finally {
    cycleLoading.value = false;
  }
}

async function loadData() {
  if (!selectedCycleId.value) {
    dataSource.value = [];
    return;
  }
  loading.value = true;
  try {
    const res: any = await getAssessmentTargetList(selectedCycleId.value, {
      page: pagination.current,
      page_size: pagination.pageSize,
      township: filterTownship.value,
      position: filterPosition.value,
      status: filterStatus.value,
      keyword: keyword.value || undefined,
      sort_by: 'score_total',
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

function handleCycleChange() {
  pagination.current = 1;
  selectedRowKeys.value = [];
  loadData();
}

function handleTableChange(pag: any) {
  pagination.current = pag.current;
  pagination.pageSize = pag.pageSize;
  loadData();
}

async function handleSync() {
  if (!selectedCycleId.value) {
    message.warning('请先选择考核周期');
    return;
  }
  syncing.value = true;
  try {
    const res: any = await syncAssessmentTargets(selectedCycleId.value);
    message.success(`同步成功：新增 ${res.added} 人，移除 ${res.removed} 人，共 ${res.total} 人`);
    loadData();
  } catch (e: any) {
    message.error(e.message || '同步失败');
  } finally {
    syncing.value = false;
  }
}

function showAddModal() {
  if (!selectedCycleId.value) {
    message.warning('请先选择考核周期');
    return;
  }
  addForm.employeeIds = '';
  addModalOpen.value = true;
}

async function handleAdd() {
  if (!addForm.employeeIds.trim()) {
    message.warning('请输入员工ID');
    return;
  }
  const ids = addForm.employeeIds
    .split(/[,，\s]+/)
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n));
  if (ids.length === 0) {
    message.warning('请输入有效的员工ID');
    return;
  }
  adding.value = true;
  try {
    await addAssessmentTargets(selectedCycleId.value!, ids);
    message.success('添加成功');
    addModalOpen.value = false;
    loadData();
  } catch (e: any) {
    message.error(e.message || '添加失败');
  } finally {
    adding.value = false;
  }
}

async function handleRemove(record: AssessmentTarget) {
  try {
    await removeAssessmentTarget(record.id);
    message.success('移除成功');
    loadData();
  } catch (e: any) {
    message.error(e.message || '移除失败');
  }
}

async function handleBatchRemove() {
  if (selectedRowKeys.value.length === 0) return;
  try {
    for (const key of selectedRowKeys.value) {
      await removeAssessmentTarget(key);
    }
    message.success(`已移除 ${selectedRowKeys.value.length} 个对象`);
    selectedRowKeys.value = [];
    loadData();
  } catch (e: any) {
    message.error(e.message || '移除失败');
  }
}

onMounted(() => {
  loadCycleList();
});
</script>
