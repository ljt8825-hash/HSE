<script lang="ts" setup>
/**
 * 培训综合考核统计（web-naive）
 * 统计卡 + 岗位完成率柱状图 + 员工培训次数 + 逾期人员表格。
 */
import { ref, computed, onMounted } from 'vue';

import {
  NCard,
  NStatistic,
} from 'naive-ui';
import { $t } from '#/locales';

import {
  HseActionBar,
  HseDataGrid,
  HsePageLayout,
  HseStatusTag,
  type HseActionKey,
} from '#/components/hse';
import type { VxeTableGridColumns } from '#/adapter/vxe-table';
import { getEnhancedTrainingStats, type EnhancedTrainingStats } from '#/api/hse/training';

defineOptions({ name: 'HseTrainingStats' });

// ===================== 数据 =====================
const loading = ref(false);
const statsData = ref<EnhancedTrainingStats>({
  byPosition: {},
  byEmployee: {},
  overdueEmployees: [],
  positionCompletionRate: {},
  employeeCompletionRate: {},
});

async function loadStats() {
  loading.value = true;
  try {
    const stats = await getEnhancedTrainingStats();
    statsData.value = stats;
  } catch {
    statsData.value = {
      byPosition: {},
      byEmployee: {},
      overdueEmployees: [],
      positionCompletionRate: {},
      employeeCompletionRate: {},
    };
  } finally {
    loading.value = false;
  }
}

// 统计卡
const positionCount = computed(() =>
  Object.keys(statsData.value.positionCompletionRate || {}).length,
);
const employeeCount = computed(() =>
  Object.keys(statsData.value.byEmployee || {}).length,
);
const overdueCount = computed(() =>
  (statsData.value.overdueEmployees || []).length,
);
const avgRate = computed(() => {
  const rates = Object.values(statsData.value.positionCompletionRate || {});
  if (rates.length === 0) return '0%';
  const avg = rates.reduce((a, b) => a + b, 0) / rates.length;
  return Math.round(avg) + '%';
});

// 岗位完成率条目
const positionRates = computed(() => {
  const entries = Object.entries(statsData.value.positionCompletionRate || {});
  return entries.map(([name, rate]) => ({ name, rate: rate as number }));
});

// 员工培训次数条目
const employeeCounts = computed(() => {
  const entries = Object.entries(statsData.value.byEmployee || {});
  return entries
    .map(([name, count]) => ({ name, count: count as number }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);
});

function getBarColor(rate: number): string {
  if (rate >= 80) return '#22c55e';
  if (rate >= 50) return '#eab308';
  return '#ef4444';
}

function getCountBarColor(count: number, max: number): string {
  const ratio = max > 0 ? count / max : 0;
  if (ratio >= 0.7) return '#3b82f6';
  if (ratio >= 0.4) return '#6366f1';
  return '#94a3b8';
}

const maxEmployeeCount = computed(() => {
  const counts = employeeCounts.value.map((e) => e.count);
  return counts.length > 0 ? Math.max(...counts) : 1;
});

// ===================== 操作栏 =====================
const actionState = ref<
  Partial<Record<HseActionKey, { hidden?: boolean }>>
>({
  downloadTemplate: { hidden: true },
  import: { hidden: true },
  export: { hidden: true },
  create: { hidden: true },
});

async function onRefresh() {
  await loadStats();
}

// ===================== 逾期表格 =====================
const overdueColumns = ref<VxeTableGridColumns>([
  { title: '姓名', field: 'name', width: 100, align: 'center' },
  { title: '工号', field: 'employeeCode', width: 120, align: 'center' },
  { title: '岗位', field: 'positionName', width: 130, align: 'center' },
  { title: '部门', field: 'orgName', minWidth: 150, align: 'left', showOverflow: 'tooltip' },
  { title: '培训类型', field: 'trainingType', width: 120, align: 'center' },
  { title: '培训日期', field: 'trainingDate', width: 120, align: 'center' },
  { title: '状态', field: 'expiryStatus', width: 100, align: 'center', slots: { default: 'status' } },
]);

onMounted(() => {
  loadStats();
});
</script>

<template>
  <HsePageLayout
    :description="$t('page.hse.trainingStatsDesc')"
    :title="$t('page.hse.trainingStats')"
  >
    <template #extra>
      <HseActionBar
        :actions="actionState"
        @refresh="onRefresh"
      />
    </template>

    <!-- 统计卡 -->
    <div class="mb-4 grid grid-cols-4 gap-3">
      <NCard :bordered="false">
        <NStatistic label="岗位数量" :value="positionCount" />
      </NCard>
      <NCard :bordered="false">
        <NStatistic label="员工数量" :value="employeeCount" />
      </NCard>
      <NCard :bordered="false">
        <NStatistic label="平均完成率" :value="avgRate" />
      </NCard>
      <NCard :bordered="false">
        <NStatistic label="逾期人数" :value="overdueCount" />
      </NCard>
    </div>

    <!-- 岗位培训完成率 -->
    <NCard :bordered="false" class="mb-4" title="岗位培训完成率">
      <div v-if="loading" class="text-center py-8 text-gray-400">加载中...</div>
      <div v-else-if="positionRates.length === 0" class="text-center py-8 text-gray-400">
        暂无岗位培训要求数据
      </div>
      <div v-else class="flex flex-col gap-3">
        <div v-for="item in positionRates" :key="item.name" class="flex items-center gap-3">
          <div class="w-32 text-sm text-gray-600 truncate text-right shrink-0">{{ item.name }}</div>
          <div class="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden">
            <div
              class="h-full rounded-full transition-all duration-500"
              :style="{
                width: `${item.rate}%`,
                backgroundColor: getBarColor(item.rate),
              }"
            />
          </div>
          <div class="w-14 text-sm font-semibold text-right shrink-0">{{ item.rate }}%</div>
        </div>
      </div>
    </NCard>

    <!-- 员工培训完成情况 -->
    <NCard :bordered="false" class="mb-4" title="员工培训次数（Top 20）">
      <div v-if="loading" class="text-center py-8 text-gray-400">加载中...</div>
      <div v-else-if="employeeCounts.length === 0" class="text-center py-8 text-gray-400">
        暂无员工培训记录数据
      </div>
      <div v-else class="flex flex-col gap-3">
        <div v-for="item in employeeCounts" :key="item.name" class="flex items-center gap-3">
          <div class="w-32 text-sm text-gray-600 truncate text-right shrink-0">{{ item.name }}</div>
          <div class="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden">
            <div
              class="h-full rounded-full transition-all duration-500"
              :style="{
                width: `${Math.min((item.count / maxEmployeeCount) * 100, 100)}%`,
                backgroundColor: getCountBarColor(item.count, maxEmployeeCount),
              }"
            />
          </div>
          <div class="w-14 text-sm font-semibold text-right shrink-0">{{ item.count }}次</div>
        </div>
      </div>
    </NCard>

    <!-- 逾期未培训人员表格 -->
    <NCard :bordered="false" title="逾期未培训人员">
      <HseDataGrid
        :columns="overdueColumns"
        :data="statsData.overdueEmployees || []"
        :loading="loading"
        :pager="false"
      >
        <template #status="{ row: _row }">
          <HseStatusTag type="danger">
            已过期
          </HseStatusTag>
        </template>
      </HseDataGrid>
      <div v-if="!loading && (!statsData.overdueEmployees || statsData.overdueEmployees.length === 0)" class="text-center py-8 text-gray-400">
        暂无逾期未培训人员
      </div>
    </NCard>
  </HsePageLayout>
</template>
