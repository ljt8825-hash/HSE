<template>
  <div class="p-4">
    <a-card>
      <template #title>自动评分</template>

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

      <a-row :gutter="16" class="mb-4">
        <a-col :span="8">
          <a-card>
            <a-statistic
              title="总人数"
              :value="progress.totalTargets || 0"
              :value-style="{ color: 'hsl(var(--primary))' }"
            />
          </a-card>
        </a-col>
        <a-col :span="8">
          <a-card>
            <a-statistic
              title="已评分"
              :value="progress.scoredCount || 0"
              :value-style="{ color: 'hsl(var(--success))' }"
            />
          </a-card>
        </a-col>
        <a-col :span="8">
          <a-card>
            <a-statistic
              title="待评分"
              :value="pendingCount"
              :value-style="{ color: 'hsl(var(--warning))' }"
            />
          </a-card>
        </a-col>
      </a-row>

      <a-card class="mb-4">
        <div class="flex items-center justify-between mb-2">
          <span class="font-medium">评分进度</span>
          <span class="text-gray-500">{{ progressPercent }}%</span>
        </div>
        <a-progress :percent="progressPercent" :status="progressStatus" />
        <div class="mt-4 flex justify-end">
          <a-space>
            <a-button @click="loadProgress">
              <template #icon><reload-outlined /></template>
              刷新进度
            </a-button>
            <a-button
              type="primary"
              :loading="executing"
              :disabled="!selectedCycleId"
              @click="handleExecuteScoring"
            >
              <template #icon><play-circle-outlined /></template>
              执行评分
            </a-button>
          </a-space>
        </div>
      </a-card>

      <a-card title="评分结果列表">
        <a-table
          :columns="columns"
          :data-source="dataSource"
          :loading="loading"
          :pagination="pagination"
          :scroll="{ x: 1100 }"
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
          </template>
        </a-table>
      </a-card>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue';
import { ReloadOutlined, PlayCircleOutlined } from '@ant-design/icons-vue';
import { message, Select } from 'ant-design-vue';
import {
  getAssessmentCycleList,
  getScoringProgress,
  executeScoring,
  getAssessmentTargetList,
} from '#/api/hse/assessment-monthly';
import type { AssessmentMonthlyApi } from '#/api/hse/assessment-monthly';

type AssessmentTarget = AssessmentMonthlyApi.AssessmentTarget;
type AssessmentCycle = AssessmentMonthlyApi.AssessmentCycle;
type ScoringProgress = AssessmentMonthlyApi.ScoringProgress;

const loading = ref(false);
const cycleLoading = ref(false);
const executing = ref(false);
const selectedCycleId = ref<number | string | undefined>();
const cycleList = ref<AssessmentCycle[]>([]);
const dataSource = ref<AssessmentTarget[]>([]);
const progress = ref<ScoringProgress>({
  cycleId: 0,
  totalTargets: 0,
  scoredCount: 0,
  reviewedCount: 0,
  frozenCount: 0,
  progressPercent: 0,
  cycleStatus: '',
});

let progressTimer: ReturnType<typeof setInterval> | null = null;

const pagination = reactive({
  current: 1,
  pageSize: 20,
  total: 0,
  showSizeChanger: true,
  showTotal: (total: number) => `共 ${total} 条`,
});

const columns = [
  { title: '姓名', dataIndex: 'employeeName', key: 'employee_name', width: 100 },
  { title: '工号', dataIndex: 'employeeCode', key: 'employee_code', width: 120 },
  { title: '岗位', dataIndex: 'position', key: 'position', width: 120 },
  { title: '乡镇', dataIndex: 'township', key: 'township', width: 120 },
  { title: '部门', dataIndex: 'department', key: 'department', width: 140 },
  { title: '状态', dataIndex: 'status', key: 'status', width: 100 },
  { title: '自动评分', dataIndex: 'scoreAuto', key: 'score_auto', width: 100 },
  { title: '总分', dataIndex: 'scoreTotal', key: 'score_total', width: 100 },
  { title: '等级', dataIndex: 'grade', key: 'grade', width: 80 },
  { title: '排名', dataIndex: 'rankAll', key: 'rank_all', width: 80 },
];

const pendingCount = computed(() => {
  return (progress.value.totalTargets || 0) - (progress.value.scoredCount || 0);
});

const progressPercent = computed(() => {
  return progress.value.progressPercent || 0;
});

const progressStatus = computed(() => {
  if (progressPercent.value >= 100) return 'success';
  if (progressPercent.value >= 50) return 'active';
  return 'normal';
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
      loadProgress();
      loadData();
      startProgressPolling();
    }
  } catch (e: any) {
    message.error(e.message || '加载周期列表失败');
  } finally {
    cycleLoading.value = false;
  }
}

async function loadProgress() {
  if (!selectedCycleId.value) return;
  try {
    const res = await getScoringProgress(selectedCycleId.value);
    progress.value = res;
  } catch (e: any) {
    // 静默失败
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
  loadProgress();
  loadData();
}

function handleTableChange(pag: any) {
  pagination.current = pag.current;
  pagination.pageSize = pag.pageSize;
  loadData();
}

async function handleExecuteScoring() {
  if (!selectedCycleId.value) {
    message.warning('请先选择考核周期');
    return;
  }
  executing.value = true;
  try {
    const res: any = await executeScoring(selectedCycleId.value);
    message.success(res.message || '评分执行成功');
    loadProgress();
    loadData();
    startProgressPolling();
  } catch (e: any) {
    message.error(e.message || '评分执行失败');
  } finally {
    executing.value = false;
  }
}

function startProgressPolling() {
  stopProgressPolling();
  progressTimer = setInterval(() => {
    loadProgress();
    if (progressPercent.value >= 100) {
      stopProgressPolling();
      loadData();
    }
  }, 3000);
}

function stopProgressPolling() {
  if (progressTimer) {
    clearInterval(progressTimer);
    progressTimer = null;
  }
}

onMounted(() => {
  loadCycleList();
});

onUnmounted(() => {
  stopProgressPolling();
});
</script>
