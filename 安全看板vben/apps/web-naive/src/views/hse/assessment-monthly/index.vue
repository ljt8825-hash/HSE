<script lang="ts" setup>
/**
 * 月度安全履职考核 - 工作台（web-naive · 阶段06B-3）
 * 契约来源：apps/web-antd/src/views/hse/assessment-monthly/index.vue
 * 能力：顶部说明卡 + 4 统计卡（周期总数/进行中/已冻结/指标数）+ 7 个快速入口（修正旧版死链，
 *      指向真实月度子路由）+ 当前周期进度卡（进度百分比 = scored_count / target_count）。
 * 旧版经 useHseAssessmentStore 取数；web-naive 无此 store，按任务书就地用
 * getAssessmentCycleList（page 1/page_size 50/sort_by created_at/sort_order desc）与 getMetricList 并行计算。
 * 派生值等价保留：cycleTotal / activeCycles / frozenCycles / metricCount / currentCycle（取列表首条）。
 */
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';

import {
  NCard,
  NEmpty,
  NGi,
  NGrid,
  NProgress,
  NStatistic,
} from 'naive-ui';
import { IconifyIcon } from '@vben/icons';

import { HseActionBar, HsePageLayout, HseStatusTag, type HseActionKey } from '#/components/hse';
import {
  getAssessmentCycleList,
  getMetricList,
  type AssessmentMonthlyApi,
} from '#/api/hse/assessment-monthly';
import { message } from '#/adapter/naive';

defineOptions({ name: 'AssessmentMonthlyIndex' });

const loading = ref(false);
const cycleList = ref<AssessmentMonthlyApi.AssessmentCycle[]>([]);
const metricList = ref<AssessmentMonthlyApi.AssessmentMetric[]>([]);

const cycleTotal = computed(() => cycleList.value.length);
const activeCycles = computed(
  () =>
    cycleList.value.filter(
      (c) => c.status === 'in_progress' || c.status === 'pending_review',
    ).length,
);
const frozenCycles = computed(
  () => cycleList.value.filter((c) => c.status === 'frozen').length,
);
const metricCount = computed(() => metricList.value.length);

// 快速入口：修正旧版 /hse/assessment-monthly/* 死链，指向本批真实路由 /objectives/assessment-*
const quickEntries = [
  { title: '考核周期', path: '/objectives/assessment-cycles', icon: 'lucide:calendar', color: 'blue' },
  { title: '考核对象', path: '/objectives/assessment-targets', icon: 'lucide:users', color: 'green' },
  { title: '自动评分', path: '/objectives/assessment-scoring', icon: 'lucide:bar-chart-3', color: 'blue' },
  { title: '扣分审核', path: '/objectives/assessment-deduction-review', icon: 'lucide:check-circle', color: 'orange' },
  { title: '扣分调整', path: '/objectives/assessment-rule?tab=deduction-adjust', icon: 'lucide:edit-3', color: 'red' },
  { title: '结果冻结', path: '/objectives/assessment-freeze', icon: 'lucide:lock', color: 'blue' },
  { title: 'Excel导入导出', path: '/objectives/assessment-excel', icon: 'lucide:file-spreadsheet', color: 'neutral' },
];

const currentCycle = computed(() => cycleList.value[0] ?? null);

const cycleStatusText = computed(() => {
  const map: Record<string, string> = {
    not_started: '未开始',
    in_progress: '进行中',
    pending_review: '待审核',
    reviewed: '已审核',
    frozen: '已冻结',
  };
  return map[currentCycle.value?.status || 'not_started'];
});

const cycleStatusTag: Record<string, 'success' | 'info' | 'warning' | 'danger' | 'neutral'> = {
  not_started: 'neutral',
  in_progress: 'info',
  pending_review: 'warning',
  reviewed: 'success',
  frozen: 'danger',
};

const progressPercent = computed(() => {
  const c = currentCycle.value;
  if (!c || c.targetCount === 0) return 0;
  return Math.round((c.scoredCount / c.targetCount) * 100);
});

const progressStatus = computed<'success' | 'warning' | 'error'>(() => {
  if (currentCycle.value?.status === 'frozen') return 'success';
  if (progressPercent.value >= 100) return 'success';
  if (progressPercent.value >= 50) return 'warning';
  return 'error';
});

const actionState = ref<Partial<Record<HseActionKey, { hidden?: boolean }>>>({
  downloadTemplate: { hidden: true },
  import: { hidden: true },
  export: { hidden: true },
  create: { hidden: true },
});

async function loadAll() {
  loading.value = true;
  try {
    const [cycleRes, metricRes] = await Promise.all([
      getAssessmentCycleList({
        page: 1,
        page_size: 50,
        sort_by: 'created_at',
        sort_order: 'desc',
      }),
      getMetricList(),
    ]);
    cycleList.value = cycleRes.list || [];
    metricList.value = metricRes.list || [];
  } catch {
    message.error('加载工作台数据失败');
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  loadAll();
});
</script>

<template>
  <HsePageLayout title="月度安全履职考核" :description="undefined">
    <template #extra>
      <HseActionBar :actions="actionState" @refresh="loadAll" />
    </template>

    <NCard :bordered="false" class="mb-4">
      <p class="text-muted-foreground">
        月度安全履职考核系统：考核周期管理、考核对象同步、自动评分、扣分审核、结果冻结全流程管理。
      </p>
    </NCard>

    <!-- 4 个统计卡 -->
    <NGrid :x-gap="16" :y-gap="16" cols="1 s:2 l:4" responsive="screen" class="mb-4">
      <NGi>
        <NCard :bordered="false">
          <NStatistic label="考核周期总数" :value="cycleTotal" />
        </NCard>
      </NGi>
      <NGi>
        <NCard :bordered="false">
          <NStatistic label="进行中周期" :value="activeCycles" />
        </NCard>
      </NGi>
      <NGi>
        <NCard :bordered="false">
          <NStatistic label="已冻结周期" :value="frozenCycles" />
        </NCard>
      </NGi>
      <NGi>
        <NCard :bordered="false">
          <NStatistic label="考核指标数" :value="metricCount" />
        </NCard>
      </NGi>
    </NGrid>

    <NGrid :x-gap="16" :y-gap="16" cols="1 l:2" responsive="screen">
      <!-- 快速入口 -->
      <NGi>
        <NCard title="快速入口" :bordered="false">
          <NGrid :x-gap="16" :y-gap="16" cols="1 s:2 l:3" responsive="screen">
            <NGi v-for="item in quickEntries" :key="item.path">
              <RouterLink :to="item.path" class="no-underline">
                <NCard hoverable :bordered="false" class="hse-quick-entry">
                  <div class="flex items-center justify-between gap-2">
                    <span class="text-sm">{{ item.title }}</span>
                    <span class="flex h-10 w-10 items-center justify-center rounded-full" :class="`bg-${item.color}`">
                      <IconifyIcon :icon="item.icon" class="text-lg" />
                    </span>
                  </div>
                </NCard>
              </RouterLink>
            </NGi>
          </NGrid>
        </NCard>
      </NGi>

      <!-- 当前周期进度 -->
      <NGi>
        <NCard title="当前周期进度" :bordered="false">
          <NEmpty v-if="!currentCycle" description="暂无考核周期" />
          <div v-else>
            <div class="mb-4 flex items-center gap-2">
              <span class="font-medium">{{ currentCycle.cycleName }}</span>
              <HseStatusTag :type="cycleStatusTag[currentCycle.status] || 'neutral'">
                {{ cycleStatusText }}
              </HseStatusTag>
            </div>
            <NProgress
              type="line"
              :percentage="progressPercent"
              :status="progressStatus"
              :show-indicator="true"
            />
            <div class="mt-4 flex justify-between text-sm text-muted-foreground">
              <span>考核对象：{{ currentCycle.targetCount }} 人</span>
              <span>已评分：{{ currentCycle.scoredCount }} 人</span>
              <span>已审核：{{ currentCycle.reviewedCount }} 人</span>
            </div>
          </div>
        </NCard>
      </NGi>
    </NGrid>
  </HsePageLayout>
</template>

<style scoped>
.no-underline {
  text-decoration: none;
  color: inherit;
}
.hse-quick-entry :deep(.n-card__content) {
  padding: 16px 20px;
}
.bg-blue {
  background: hsl(var(--primary) / 0.1);
  color: hsl(var(--primary));
}
.bg-green {
  background: hsl(var(--success) / 0.1);
  color: hsl(var(--success));
}
.bg-orange {
  background: hsl(var(--warning) / 0.1);
  color: hsl(var(--warning));
}
.bg-red {
  background: hsl(var(--error) / 0.1);
  color: hsl(var(--error));
}
.bg-neutral {
  background: hsl(var(--muted) / 0.5);
  color: hsl(var(--muted-foreground));
}
</style>
