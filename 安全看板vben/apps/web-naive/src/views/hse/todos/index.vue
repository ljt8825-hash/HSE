<script lang="ts" setup>
/**
 * 我的待办（web-naive）
 * 工作台视图：按周期展示待办缺口、快捷导航、最新动态、待办列表
 */
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import {
  NButton,
  NCard,
  NEmpty,
  NSpace,
  NSpin,
  NTabs,
  NTabPane,
  NTag,
} from 'naive-ui';
import { message } from '#/adapter/naive';
import { $t } from '#/locales';

import { HseActionBar, HsePageLayout, type HseActionKey } from '#/components/hse';
import { exportTodo, getTodos, type TodosApi } from '#/api/hse/todos';
import { getTodoNodes, type AssessmentPlanApi } from '#/api/hse/assessment-plan';

defineOptions({ name: 'HseTodos' });

const router = useRouter();

type TodoSource = TodosApi.TodoItem;
type PlanNode = AssessmentPlanApi.PlanNode;

// ===================== 周期切换 =====================
const activeCadence = ref<TodosApi.TodoCadence>('daily');

const CADENCE_LABEL: Record<TodosApi.TodoCadence, string> = {
  daily: '每天',
  weekly: '每周',
  monthly: '每月',
  yearly: '每年',
};

const CADENCE_NAV: { color: string; title: string; cadence: TodosApi.TodoCadence }[] = [
  { color: '#1fdaca', title: '每天', cadence: 'daily' },
  { color: '#bf0c2c', title: '每周', cadence: 'weekly' },
  { color: '#e18525', title: '每月', cadence: 'monthly' },
  { color: '#3fb27f', title: '每年', cadence: 'yearly' },
];

const MODULE_NAV = [
  { color: '#e18525', title: '目标职责', url: '/objectives/responsibility' },
  { color: '#bf0c2c', title: '保险管理', url: '/hse/insurance' },
  { color: '#1fdaca', title: '培训管理', url: '/hse/training' },
  { color: '#3fb27f', title: '隐患治理', url: '/hse/hazards' },
];

// ===================== 考核节点 =====================
const nodeItems = ref<PlanNode[]>([]);
const dueCount = computed(() => nodeItems.value.filter((n) => n.status === 'due').length);

async function loadNodes() {
  try {
    const res = await getTodoNodes();
    nodeItems.value = res?.list ?? [];
  } catch {
    nodeItems.value = [];
  }
}

// ===================== 待办数据 =====================
const loading = ref(false);
const sourcesByCadence = ref<Record<TodosApi.TodoCadence, TodoSource[]>>({
  daily: [],
  weekly: [],
  monthly: [],
  yearly: [],
});

async function loadAll() {
  loading.value = true;
  try {
    const cadences: TodosApi.TodoCadence[] = ['daily', 'weekly', 'monthly', 'yearly'];
    const results = await Promise.allSettled(
      cadences.map((c) => getTodos(c).then((r) => ({ cadence: c, list: r?.list ?? [] }))),
    );
    const next: Record<TodosApi.TodoCadence, TodoSource[]> = {
      daily: [],
      weekly: [],
      monthly: [],
      yearly: [],
    };
    for (const r of results) {
      if (r.status === 'fulfilled') {
        next[r.value.cadence] = r.value.list as TodoSource[];
      }
    }
    sourcesByCadence.value = next;
  } finally {
    loading.value = false;
  }
}

// ===================== 派生数据 =====================
const currentSources = computed<TodoSource[]>(() => {
  const list = sourcesByCadence.value[activeCadence.value] ?? [];
  return [...list].sort((a, b) => {
    const ea = a.error ? 1 : 0;
    const eb = b.error ? 1 : 0;
    if (ea !== eb) return ea - eb;
    return b.count - a.count;
  });
});

const cadenceCount = computed(() => (c: TodosApi.TodoCadence) =>
  (sourcesByCadence.value[c] ?? []).reduce((s, x) => s + (x.count || 0), 0),
);

const dailyCount = computed(() => cadenceCount.value('daily'));
const weeklyCount = computed(() => cadenceCount.value('weekly'));
const monthlyCount = computed(() => cadenceCount.value('monthly'));
const yearlyCount = computed(() => cadenceCount.value('yearly'));
const totalCount = computed(
  () => dailyCount.value + weeklyCount.value + monthlyCount.value + yearlyCount.value,
);

function countColor(c: number): string {
  if (c >= 20) return '#ef4444';
  if (c >= 5) return '#f59e0b';
  return '#10b981';
}

function countLevel(c: number): string {
  if (c >= 20) return '紧急';
  if (c >= 5) return '关注';
  return '常规';
}

function formatTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function relativeTime(iso: string): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const diff = Math.max(0, Date.now() - t);
  const m = Math.floor(diff / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  if (d === 1) return '昨天';
  if (d < 7) return `${d} 天前`;
  return formatTime(iso);
}

// 待办缺口卡片
const gapCardItems = computed(() =>
  currentSources.value.map((s) => {
    const color = s.error ? '#ef4444' : countColor(s.count);
    const level = s.error ? '异常' : countLevel(s.count);
    return {
      sourceCode: s.sourceCode,
      title: s.error ? `【异常】${s.title}` : s.title,
      module: s.module,
      subBoard: s.subBoard,
      count: s.error ? 0 : s.count,
      link: s.link,
      time: s.error ? '查询失败' : relativeTime(s.updatedAt),
      color,
      level,
    };
  }),
);

const maxGap = computed(() => {
  const nums = gapCardItems.value.filter((c) => c.count > 0).map((c) => c.count);
  return nums.length ? Math.max(...nums) : 1;
});

const sizedGapCards = computed(() =>
  gapCardItems.value.map((c) => {
    const ratio = c.count / maxGap.value;
    let span = 'col-span-1';
    let numSize = 'text-2xl';
    let pad = 'p-3';
    if (c.count === 0) {
      numSize = 'text-xl';
    } else if (ratio >= 0.5) {
      span = 'sm:col-span-2 row-span-2';
      numSize = 'text-4xl';
      pad = 'p-5';
    } else if (ratio >= 0.2) {
      span = 'sm:col-span-2';
      numSize = 'text-3xl';
      pad = 'p-4';
    }
    return { ...c, span, numSize, pad };
  }),
);

// ===================== 操作 =====================
const actionState = ref<Partial<Record<HseActionKey, { hidden?: boolean }>>>({
  downloadTemplate: { hidden: true },
  import: { hidden: true },
  export: { hidden: true },
  create: { hidden: true },
});

async function onRefresh() {
  await Promise.all([loadAll(), loadNodes()]);
}

function navToSource(link?: string) {
  if (link && link.startsWith('/')) {
    router.push(link).catch(() => {});
  }
}

function navToUrl(url: string) {
  if (url.startsWith('/')) {
    router.push(url).catch(() => {});
  }
}

async function doExport(sourceCode: string) {
  try {
    const blob = await exportTodo(sourceCode);
    const url = URL.createObjectURL(blob as Blob);
    const a = document.createElement('a');
    a.href = url;
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    a.download = `待办明细_${sourceCode}_${today}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch {
    message.error('导出失败');
  }
}

// ===================== 问候语 =====================
const currentHour = new Date().getHours();
const greeting = computed(() => {
  if (currentHour < 6) return '凌晨好';
  if (currentHour < 12) return '上午好';
  if (currentHour < 14) return '中午好';
  if (currentHour < 18) return '下午好';
  return '晚上好';
});

onMounted(() => {
  loadAll();
  loadNodes();
});
</script>

<template>
  <HsePageLayout
    :description="`视图：${CADENCE_LABEL[activeCadence]} ｜ 点击待办卡片可前往来源模块处理`"
    :title="$t('page.hse.todos')"
  >
    <template #extra>
      <NSpace>
        <NButton type="primary" @click="navToUrl('/hse/todos/plan')">考核计划配置</NButton>
        <HseActionBar :actions="actionState" @refresh="onRefresh" />
      </NSpace>
    </template>

    <!-- 问候区 -->
    <NCard :bordered="false" class="mb-4">
      <div class="text-base">
        {{ greeting }}，当前还有
        <strong :style="{ color: '#ef4444' }">{{ cadenceCount(activeCadence) }}</strong>
        条{{ CADENCE_LABEL[activeCadence] }}待跟进事项，请尽快处理！
      </div>
    </NCard>

    <!-- 本周期考核节点 -->
    <NCard :bordered="false" class="mb-4">
      <template #header>
        <div class="flex items-center justify-between">
          <span class="font-semibold">本周期考核节点</span>
          <span v-if="nodeItems.length" class="text-xs text-gray-400">
            共 {{ nodeItems.length }} 个模块 · 紧急
            <strong style="color: #ef4444">{{ dueCount }}</strong> 个
          </span>
        </div>
      </template>
      <div v-if="nodeItems.length" class="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <div
          v-for="n in nodeItems"
          :key="n.moduleCode"
          class="flex cursor-pointer flex-col rounded-lg border p-3 transition hover:shadow-md"
          :class="n.status === 'due' ? 'border-red-400/60 bg-red-50' : 'border-gray-200'"
          @click="navToUrl('/hse/todos/plan')"
        >
          <span class="text-xs text-gray-600">{{ n.moduleName }}</span>
          <span
            class="mt-1 text-sm font-bold leading-none"
            :style="{ color: n.status === 'due' ? '#ef4444' : '#378add' }"
          >
            {{ n.dueLabel }}
          </span>
          <span
            class="mt-1.5 text-xs"
            :style="{ color: n.status === 'due' ? '#ef4444' : '#6b7280' }"
          >
            {{ n.status === 'due' ? `仅剩 ${n.daysLeft} 天` : `${n.daysLeft} 天后` }}
          </span>
        </div>
      </div>
      <NEmpty v-else description="暂无生效考核方案，请先到「考核计划」配置" class="py-4" />
    </NCard>

    <!-- 周期标签页 -->
    <NTabs v-model:value="activeCadence" type="segment" class="mb-4">
      <NTabPane v-for="c in CADENCE_NAV" :key="c.cadence" :name="c.cadence" :tab="c.title" />
    </NTabs>

    <NSpin :show="loading">
      <!-- 3:2 布局：待办缺口 + 快捷导航 -->
      <div class="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-5">
        <!-- 待办缺口 -->
        <NCard :bordered="false" class="lg:col-span-3" title="待办缺口">
          <template #header-extra>
            <span class="text-xs text-gray-400">按数量自动调整卡片大小</span>
          </template>
          <div v-if="sizedGapCards.length" class="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <div
              v-for="card in sizedGapCards"
              :key="card.sourceCode"
              :class="[card.span, card.pad, 'group relative flex cursor-pointer flex-col rounded-xl border transition hover:shadow-md']"
              :style="{ borderColor: card.color + '40' }"
              @click="navToSource(card.link)"
            >
              <div class="flex items-start justify-between">
                <span
                  class="rounded-full px-2 py-0.5 text-xs font-medium"
                  :style="{ backgroundColor: card.color + '1a', color: card.color }"
                >
                  {{ card.level }}
                </span>
              </div>
              <div :class="card.numSize" class="mt-2 font-bold leading-none" :style="{ color: card.color }">
                {{ card.count }}<span class="ml-1 text-sm font-normal text-gray-400">条</span>
              </div>
              <div class="mt-2 line-clamp-1 text-sm font-medium">{{ card.title }}</div>
              <div class="mt-1 text-xs text-gray-400">{{ card.module }} · {{ card.subBoard }}</div>
              <div class="mt-auto flex items-center justify-between pt-2">
                <span class="text-xs text-gray-400">{{ card.time }}</span>
                <NButton
                  size="tiny"
                  type="primary"
                  quaternary
                  @click.stop="doExport(card.sourceCode)"
                >
                  导出明细
                </NButton>
              </div>
            </div>
          </div>
          <NEmpty v-else description="暂无待办事项" class="py-8" />
        </NCard>

        <!-- 快捷导航 -->
        <NCard :bordered="false" class="lg:col-span-2" title="快捷导航">
          <div class="grid grid-cols-2 gap-3">
            <div
              v-for="item in CADENCE_NAV"
              :key="item.cadence"
              class="flex cursor-pointer flex-col items-center justify-center rounded-lg border p-3 transition hover:shadow-md"
              @click="activeCadence = item.cadence"
            >
              <div
                class="mb-1 flex h-8 w-8 items-center justify-center rounded-full"
                :style="{ backgroundColor: item.color + '20', color: item.color }"
              >
                <span class="text-sm font-bold">{{ cadenceCount(item.cadence) }}</span>
              </div>
              <span class="text-xs text-gray-600">{{ item.title }}</span>
            </div>
            <div
              v-for="item in MODULE_NAV"
              :key="item.title"
              class="flex cursor-pointer flex-col items-center justify-center rounded-lg border p-3 transition hover:shadow-md"
              @click="navToUrl(item.url)"
            >
              <div
                class="mb-1 flex h-8 w-8 items-center justify-center rounded-full"
                :style="{ backgroundColor: item.color + '20', color: item.color }"
              >
                <span class="text-xs">{{ item.title.slice(0, 2) }}</span>
              </div>
              <span class="text-xs text-gray-600">{{ item.title }}</span>
            </div>
          </div>
        </NCard>
      </div>

      <!-- 待办列表 -->
      <NCard :bordered="false" :title="`待办事项（${CADENCE_LABEL[activeCadence]}）`">
        <div v-if="currentSources.length" class="space-y-2">
          <div
            v-for="s in currentSources"
            :key="s.sourceCode"
            class="flex items-center justify-between rounded-lg border p-3 transition hover:bg-gray-50"
          >
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <span class="font-medium">{{ s.title }}</span>
                <NTag v-if="s.error" type="error" size="small">异常</NTag>
              </div>
              <div class="mt-1 text-xs text-gray-500">
                <template v-if="s.error">
                  ⚠️ {{ s.error }}
                </template>
                <template v-else>
                  <span :style="{ color: countColor(s.count), fontWeight: 600 }">{{ s.count }}</span>
                  条 · {{ s.module }} · {{ s.subBoard }} · {{ relativeTime(s.updatedAt) }}
                </template>
              </div>
            </div>
            <NSpace>
              <NButton
                v-if="!s.error"
                size="small"
                type="primary"
                quaternary
                @click="doExport(s.sourceCode)"
              >
                导出明细
              </NButton>
              <NButton
                v-if="!s.error"
                size="small"
                type="primary"
                @click="navToSource(s.link)"
              >
                前往处理
              </NButton>
            </NSpace>
          </div>
        </div>
        <NEmpty v-else :description="`${CADENCE_LABEL[activeCadence]} 暂无待办事项`" class="py-8" />
      </NCard>
    </NSpin>

    <!-- 底部统计条 -->
    <NCard :bordered="false" class="mt-4">
      <div class="flex flex-wrap items-center justify-between gap-3 text-sm">
        <div class="flex items-center gap-2">
          <span class="h-2 w-2 rounded-full bg-red-500"></span>
          <span class="text-gray-500">每天</span>
          <strong class="text-base text-red-500">{{ dailyCount }}</strong>
        </div>
        <div class="flex items-center gap-2">
          <span class="h-2 w-2 rounded-full bg-orange-500"></span>
          <span class="text-gray-500">每周</span>
          <strong class="text-base text-orange-500">{{ weeklyCount }}</strong>
        </div>
        <div class="flex items-center gap-2">
          <span class="h-2 w-2 rounded-full bg-blue-500"></span>
          <span class="text-gray-500">每月</span>
          <strong class="text-base text-blue-500">{{ monthlyCount }}</strong>
        </div>
        <div class="flex items-center gap-2">
          <span class="h-2 w-2 rounded-full bg-green-500"></span>
          <span class="text-gray-500">每年</span>
          <strong class="text-base text-green-500">{{ yearlyCount }}</strong>
        </div>
        <div class="ml-auto flex items-center gap-4 border-l border-gray-200 pl-3">
          <span class="text-gray-500">
            总计<strong class="ml-1 text-base text-gray-900">{{ totalCount }}</strong>
          </span>
        </div>
      </div>
    </NCard>
  </HsePageLayout>
</template>
