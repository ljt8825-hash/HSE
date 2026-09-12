<template>
  <Page auto-content-height class="hse-page">
    <SortableStatRow page-key="training-stats">
      <template v-if="statsLoading">
        <Col :xs="24" :sm="12" :md="8" :lg="6" v-for="i in 4" :key="`skel-${i}`">
          <Card :bordered="false">
            <Skeleton active :paragraph="{ rows: 2 }" />
          </Card>
        </Col>
      </template>
      <template v-else>
        <Col :xs="24" :sm="12" :md="8" :lg="6" v-for="stat in statItems" :key="stat.key" class="sortable-stat-col" :data-stat-key="stat.key" v-show="isStatVisible(stat.key)">
          <HseStatCard
            :title="stat.label"
            :value="stat.value"
            :icon="stat.icon"
            :color="(stat.color as any)"
          />
        </Col>
      </template>
    </SortableStatRow>

    <Card :bordered="false" title="岗位培训完成率" style="margin-bottom: 20px;">
      <div v-if="statsLoading" class="chart-skeleton">
        <Skeleton active :paragraph="{ rows: 6 }" />
      </div>
      <div v-else-if="positionCompletionRate" class="completion-chart">
        <div v-for="(rate, position) in positionCompletionRate" :key="position" class="completion-item">
          <div class="completion-label">{{ position }}</div>
          <div class="completion-bar-wrap">
            <div class="completion-bar" :style="{ width: `${rate}%`, backgroundColor: getBarColor(rate) }"></div>
          </div>
          <div class="completion-rate">{{ rate }}%</div>
        </div>
      </div>
      <div v-else class="empty-tip">暂无岗位培训要求数据</div>
    </Card>

    <Card :bordered="false" title="员工培训完成情况" style="margin-bottom: 20px;">
      <div v-if="statsLoading" class="chart-skeleton">
        <Skeleton active :paragraph="{ rows: 6 }" />
      </div>
      <div v-else-if="byEmployee" class="completion-chart">
        <div v-for="(count, employee) in byEmployee" :key="employee" class="completion-item">
          <div class="completion-label" style="max-width: 200px;">{{ employee }}</div>
          <div class="completion-bar-wrap">
            <div class="completion-bar" :style="{ width: `${Math.min(count * 10, 100)}%` }"></div>
          </div>
          <div class="completion-rate">{{ count }}次</div>
        </div>
      </div>
      <div v-else class="empty-tip">暂无员工培训记录数据</div>
    </Card>

    <Card :bordered="false" title="逾期未培训人员">
      <div v-if="statsLoading" class="chart-skeleton">
        <Skeleton active :paragraph="{ rows: 6 }" />
      </div>
      <Table
        v-else
        :columns="overdueColumns"
        :data-source="overdueEmployees"
        :loading="statsLoading"
        :pagination="{
          current: 1,
          pageSize: 20,
          total: overdueEmployees.length,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (t) => `共 ${t} 条记录`,
        }"
        :row-key="(record) => `${record.name}-${record.trainingDate}`"
        size="middle"
      >
        <template #bodyCell="{ column }">
          <template v-if="column.key === 'expiryStatus'">
            <Badge status="error" text="已过期" />
          </template>
        </template>
      </Table>
      <div v-if="!statsLoading && overdueEmployees.length === 0" class="empty-tip">
        暂无逾期未培训人员
      </div>
    </Card>
  </Page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import {
  Card,
  Col,
  Table,
  Badge,
  message,
  Skeleton,
} from 'ant-design-vue';
import { Page } from '@vben/common-ui';
import HseStatCard from '#/components/hse/StatCard.vue';
import SortableStatRow from '#/components/hse/SortableStatRow.vue';
import { useComponentVisibility } from '#/composables/useComponentVisibility';

import {
  getEnhancedTrainingStats,
  type EnhancedTrainingStats,
} from '#/api/hse/training';

const statsLoading = ref(false);
const statsData = ref<EnhancedTrainingStats>({
  byPosition: {},
  byEmployee: {},
  overdueEmployees: [],
  positionCompletionRate: {},
  employeeCompletionRate: {},
});

const statItems = computed(() => {
  const positionCount = Object.keys(statsData.value.positionCompletionRate).length;
  const employeeCount = Object.keys(statsData.value.byEmployee).length;
  const overdueCount = statsData.value.overdueEmployees.length;
  const avgRate = positionCount > 0
    ? Math.round(Object.values(statsData.value.positionCompletionRate).reduce((a, b) => a + b, 0) / positionCount)
    : 0;

  return [
    { key: 'positionCount', label: '岗位数量', value: positionCount, color: 'blue', icon: 'lucide:briefcase' },
    { key: 'employeeCount', label: '员工数量', value: employeeCount, color: 'blue', icon: 'lucide:users' },
    { key: 'avgCompletion', label: '平均完成率', value: `${avgRate}%`, color: 'green', icon: 'lucide:check-circle-2' },
    { key: 'overdueCount', label: '逾期人数', value: overdueCount, color: 'red', icon: 'lucide:alert-circle' },
  ];
});

const visibilityStatItems = computed(() => statItems.value.map((s) => ({ key: s.key, label: s.label })));
const actionButtons = ref([]);

const { isStatVisible } = useComponentVisibility({
  pageKey: 'training-stats',
  statItems: visibilityStatItems,
  actionButtons,
});

const positionCompletionRate = computed(() => statsData.value.positionCompletionRate);
const byEmployee = computed(() => statsData.value.byEmployee);
const overdueEmployees = computed(() => statsData.value.overdueEmployees);

const overdueColumns = [
  { title: '姓名', dataIndex: 'name', key: 'name', width: 100 },
  { title: '工号', dataIndex: 'employeeCode', key: 'employeeCode', width: 100 },
  { title: '岗位', dataIndex: 'positionName', key: 'positionName', width: 120 },
  { title: '部门', dataIndex: 'orgName', key: 'orgName', width: 150 },
  { title: '培训类型', dataIndex: 'trainingType', key: 'trainingType', width: 120 },
  { title: '培训日期', dataIndex: 'trainingDate', key: 'trainingDate', width: 120 },
  { title: '状态', key: 'expiryStatus', width: 100 },
];

function getBarColor(rate: number): string {
  if (rate >= 80) return '#22c55e';
  if (rate >= 50) return '#eab308';
  return '#ef4444';
}

async function fetchStats() {
  statsLoading.value = true;
  try {
    const stats = await getEnhancedTrainingStats();
    statsData.value = stats;
  } catch (err) {
    console.warn('获取培训统计失败:', err);
    message.error('获取培训统计失败');
    statsData.value = {
      byPosition: {},
      byEmployee: {},
      overdueEmployees: [],
      positionCompletionRate: {},
      employeeCompletionRate: {},
    };
  } finally {
    statsLoading.value = false;
  }
}

onMounted(async () => {
  await fetchStats();
});
</script>

<style scoped lang="scss">
.hse-page {
  .completion-chart {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .completion-item {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .completion-label {
    width: 150px;
    font-size: 13px;
    color: hsl(var(--foreground));
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .completion-bar-wrap {
    flex: 1;
    height: 20px;
    background: hsl(var(--muted));
    border-radius: 10px;
    overflow: hidden;
  }

  .completion-bar {
    height: 100%;
    border-radius: 10px;
    transition: width 0.3s ease;
    background: hsl(var(--primary));
  }

  .completion-rate {
    width: 60px;
    text-align: right;
    font-size: 13px;
    font-weight: 600;
    color: hsl(var(--foreground));
  }

  .empty-tip {
    text-align: center;
    color: hsl(var(--muted-foreground));
    padding: 24px 0;
    font-size: 13px;
  }

  .chart-skeleton {
    padding: 16px;
  }
}
</style>