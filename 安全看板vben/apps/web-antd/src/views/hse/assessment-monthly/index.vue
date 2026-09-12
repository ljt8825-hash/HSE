<template>
  <div class="p-4">
    <!-- 工作台描述卡：独立 row，避免 a-card 上的 margin 被 a-row flex 布局吞掉 -->
    <a-row :gutter="16">
      <a-col :span="24">
        <a-card>
          <template #title>
            <span>月度安全履职考核 - 工作台</span>
          </template>
          <p class="text-gray-500">
            月度安全履职考核系统：考核周期管理、考核对象同步、自动评分、扣分审核、结果冻结全流程管理。</p>
        </a-card>
      </a-col>
    </a-row>

    <!-- 4 个统计卡：与上方间距 28px (mt-7)，对标 cockpit .overview-section { margin-bottom: 28px } -->
    <a-row :gutter="16" class="mt-7">
      <a-col :span="6">
        <a-card>
          <a-statistic title="考核周期总数" :value="cycleTotal" :value-style="{ color: 'hsl(var(--primary))' }" />
        </a-card>
      </a-col>
      <a-col :span="6">
        <a-card>
          <a-statistic title="进行中周期" :value="activeCycles" :value-style="{ color: 'hsl(var(--success))' }" />
        </a-card>
      </a-col>
      <a-col :span="6">
        <a-card>
          <a-statistic title="已冻结周期" :value="frozenCycles" :value-style="{ color: 'hsl(var(--warning))' }" />
        </a-card>
      </a-col>
      <a-col :span="6">
        <a-card>
          <a-statistic title="考核指标数" :value="metricCount" />
        </a-card>
      </a-col>
    </a-row>

    <a-row :gutter="16" class="mt-7">
      <a-col :span="12">
      <a-card>
        <template #title>快速入口</template>
        <a-row :gutter="[16, 16]">
          <a-col
            v-for="item in quickEntries"
            :key="item.path"
            :xs="24"
            :sm="12"
            :md="8"
          >
            <a-card
              class="quick-entry-card"
              :bordered="false"
              hoverable
            >
              <router-link :to="item.path" class="quick-entry-link">
                <div class="quick-entry-content">
                  <span class="quick-entry-title">{{ item.title }}</span>
                  <div class="quick-entry-icon" :class="`icon-${item.color}`">
                    <IconifyIcon :icon="item.icon" class="icon" />
                  </div>
                </div>
              </router-link>
            </a-card>
          </a-col>
        </a-row>
      </a-card>
    </a-col>
      <a-col :span="12">
      <a-card>
        <template #title>当前周期进度</template>
        <a-empty v-if="!currentCycle" description="暂无考核周期" />
        <div v-else>
          <div class="mb-4">
            <span class="font-medium">{{ currentCycle.cycleName }}</span>
            <a-tag :color="cycleStatusColor" class="ml-2">
              {{ cycleStatusText }}
            </a-tag>
          </div>
          <a-progress
            :percent="progressPercent"
            :status="progressStatus"
          />
          <div class="mt-4 flex justify-between text-sm text-gray-500">
            <span>考核对象：{{ currentCycle.targetCount }} 人</span>
            <span>已评分：{{ currentCycle.scoredCount }} 人</span>
            <span>已审核：{{ currentCycle.reviewedCount }} 人</span>
          </div>
        </div>
      </a-card>
    </a-col>
    </a-row>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useHseAssessmentStore } from '#/store/hse-assessment';
import { storeToRefs } from 'pinia';
import { IconifyIcon } from '@vben/icons';

const store = useHseAssessmentStore();
const { currentCycle, cycleList, cycleTotal, metricList } = storeToRefs(store);

const activeCycles = computed(() =>
  cycleList.value.filter((c: any) => c.status === 'in_progress' || c.status === 'pending_review').length,
);
const frozenCycles = computed(() => cycleList.value.filter((c: any) => c.status === 'frozen').length);
const metricCount = computed(() => metricList.value.length);

// 快速入口导航配置（路由与映射保持不变）
const quickEntries = [
  { title: '考核周期', path: '/hse/assessment-monthly/cycles', icon: 'lucide:calendar', color: 'blue' },
  { title: '考核对象', path: '/hse/assessment-monthly/targets', icon: 'lucide:users', color: 'green' },
  { title: '自动评分', path: '/hse/assessment-monthly/scoring', icon: 'lucide:bar-chart-3', color: 'blue' },
  { title: '扣分审核', path: '/hse/assessment-monthly/deduction-review', icon: 'lucide:check-circle', color: 'orange' },
  { title: '扣分调整', path: '/hse/assessment-monthly/deduction-adjust', icon: 'lucide:edit-3', color: 'red' },
  { title: '结果冻结', path: '/hse/assessment-monthly/freeze', icon: 'lucide:lock', color: 'blue' },
  { title: 'Excel导入导出', path: '/hse/assessment-monthly/excel', icon: 'lucide:file-spreadsheet', color: 'default' },
];

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

const cycleStatusColor = computed(() => {
  const map: Record<string, string> = {
    not_started: 'default',
    in_progress: 'processing',
    pending_review: 'warning',
    reviewed: 'success',
    frozen: 'purple',
  };
  return map[currentCycle.value?.status || 'not_started'];
});

const progressPercent = computed(() => {
  if (!currentCycle.value || currentCycle.value.targetCount === 0) return 0;
  return Math.round(
    (currentCycle.value.scoredCount / currentCycle.value.targetCount) * 100,
  );
});

const progressStatus = computed(() => {
  if (currentCycle.value?.status === 'frozen') return 'success';
  if (progressPercent.value >= 100) return 'success';
  if (progressPercent.value >= 50) return 'active';
  return 'normal';
});

// 性能优化：独立 API 调用改为 Promise.all 并行执行
onMounted(async () => {
  await Promise.all([
    store.fetchCycleList(),
    store.fetchMetricList(),
  ]);
});
</script>

<style lang="less" scoped>
.quick-entry-card {
  border-radius: 8px;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  transition: all 0.3s;

  :deep(.ant-card-body) {
    padding: 16px 20px;
  }

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
  }
}

.quick-entry-link {
  display: block;
  text-decoration: none;
  color: inherit;
}

.quick-entry-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.quick-entry-title {
  font-size: 14px;
  color: hsl(var(--foreground));
  flex: 1;
  min-width: 0;
}

.quick-entry-icon {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;

  .icon {
    font-size: 20px;
  }

  &.icon-blue {
    background: hsl(var(--primary) / 0.1);
    .icon { color: hsl(var(--primary)); }
  }
  &.icon-green {
    background: hsl(var(--success) / 0.1);
    .icon { color: hsl(var(--success)); }
  }
  &.icon-orange {
    background: hsl(var(--warning) / 0.1);
    .icon { color: hsl(var(--warning)); }
  }
  &.icon-red {
    background: hsl(var(--error) / 0.1);
    .icon { color: hsl(var(--error)); }
  }
  &.icon-default {
    background: hsl(var(--muted) / 0.5);
    .icon { color: hsl(var(--muted-foreground)); }
  }
}
</style>

<!-- 设计系统对齐：保留 :deep(.ant-card-body{padding}) —— 卡片体内边距布局调整，主题无关；如需可改为 a-card :body-style -->

