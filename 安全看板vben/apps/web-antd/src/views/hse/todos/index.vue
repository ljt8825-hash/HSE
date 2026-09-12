<script lang="ts" setup>
import type {
  WorkbenchQuickNavItem,
  WorkbenchTodoItem,
  WorkbenchTrendItem,
} from '@vben/common-ui';

import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import {
  WorkbenchHeader,
  WorkbenchQuickNav,
  WorkbenchTodo,
  WorkbenchTrends,
} from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';

import { exportTodo, getTodos, type TodoCadence } from '#/api/hse/todos';
import { getTodoNodes, type AssessmentPlanApi } from '#/api/hse/assessment-plan';

type TodoSource = {
  sourceCode: string;
  module: string;
  subBoard: string;
  title: string;
  count: number;
  link: string;
  updatedAt: string;
  error?: string | null;
};

type PlanNode = AssessmentPlanApi.PlanNode;

const router = useRouter();

const activeCadence = ref<TodoCadence>('daily');

// 本周期考核节点（按各模块生效方案推算）
const nodeItems = ref<PlanNode[]>([]);
const dueCount = computed(() => nodeItems.value.filter((n) => n.status === 'due').length);

async function loadNodes() {
  try {
    const res = await getTodoNodes();
    nodeItems.value = res?.list ?? [];
  } catch (e) {
    console.error('load nodes fail:', e);
    nodeItems.value = [];
  }
}

// 各周期的源（避免重复请求，4 个周期一次性并发拉）
const sourcesByCadence = ref<Record<TodoCadence, TodoSource[]>>({
  daily: [],
  weekly: [],
  monthly: [],
  yearly: [],
});

async function loadAll() {
  const cadences: TodoCadence[] = ['daily', 'weekly', 'monthly', 'yearly'];
  const results = await Promise.allSettled(
    cadences.map((c) => getTodos(c).then((r) => ({ cadence: c, list: r?.list ?? [] }))),
  );
  const next: Record<TodoCadence, TodoSource[]> = {
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
}

onMounted(async () => {
  await loadAll();
  void loadNodes();
  document.addEventListener('click', handleGlobalClick);
});

onBeforeUnmount(() => {
  document.removeEventListener('click', handleGlobalClick);
});

// —— 静态配置 ————————————————————————————————————————————
const CADENCE_LABEL: Record<TodoCadence, string> = {
  daily: '每天',
  weekly: '每周',
  monthly: '每月',
  yearly: '每年',
};

// 4 个周期入口（快捷导航中前 4 个）
const CADENCE_NAV = [
  { color: '#1fdaca', icon: 'lucide:calendar-check-2', title: '每天', cadence: 'daily' as TodoCadence },
  { color: '#bf0c2c', icon: 'lucide:calendar-days', title: '每周', cadence: 'weekly' as TodoCadence },
  { color: '#e18525', icon: 'lucide:calendar-range', title: '每月', cadence: 'monthly' as TodoCadence },
  { color: '#3fb27f', icon: 'lucide:calendar-clock', title: '每年', cadence: 'yearly' as TodoCadence },
];

// 模块入口（4 个最常用来源模块）
const MODULE_NAV = [
  { color: '#e18525', icon: 'lucide:target', title: '目标职责', url: '/objectives/responsibility' },
  { color: '#bf0c2c', icon: 'lucide:shield-alert', title: '保险管理', url: '/hse/insurance' },
  { color: '#1fdaca', icon: 'lucide:graduation-cap', title: '培训管理', url: '/hse/training' },
  { color: '#3fb27f', icon: 'lucide:alert-triangle', title: '隐患治理', url: '/hse/hazards' },
];

// 每个来源模块对应的图标（与来源模块名绑定，新增源时同步补映射）
const MODULE_ICON_FOR_SOURCE: Record<string, string> = {
  目标职责: 'lucide:target',
  保险管理: 'lucide:shield-check',
  培训管理: 'lucide:graduation-cap',
  隐患治理: 'lucide:alert-triangle',
  考核管理: 'lucide:clipboard-check',
  安委会: 'lucide:users-round',
  规章制度: 'lucide:book-text',
  三违管理: 'lucide:alert-octagon',
  网格管理: 'lucide:grid-3x3',
};

// 工具函数
function formatTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function countColor(c: number): string {
  if (c >= 20) return '#ef4444'; // 紧急 红
  if (c >= 5) return '#f59e0b'; // 关注 橙
  return '#10b981'; // 常规 绿
}

function countLevel(c: number): string {
  if (c >= 20) return '紧急';
  if (c >= 5) return '关注';
  return '常规';
}

// "3 分钟前 / 刚刚 / 1 小时前 / 昨天"——按 updatedAt 距今
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

// —— 派生数据 ——————————————————————————————————————————
const currentSources = computed<TodoSource[]>(() => {
  const list = sourcesByCadence.value[activeCadence.value] ?? [];
  // 把 error 项放到末尾，正常项按 count 降序
  return [...list].sort((a, b) => {
    const ea = a.error ? 1 : 0;
    const eb = b.error ? 1 : 0;
    if (ea !== eb) return ea - eb;
    return b.count - a.count;
  });
});

const cadenceCount = computed(() => (c: TodoCadence) =>
  (sourcesByCadence.value[c] ?? []).reduce((s, x) => s + (x.count || 0), 0),
);

const dailyCount = computed(() => cadenceCount.value('daily'));
const weeklyCount = computed(() => cadenceCount.value('weekly'));
const monthlyCount = computed(() => cadenceCount.value('monthly'));
const yearlyCount = computed(() => cadenceCount.value('yearly'));
const totalCount = computed(
  () => dailyCount.value + weeklyCount.value + monthlyCount.value + yearlyCount.value,
);

// 顶部问候区的时间（按当前小时）
const currentHour = new Date().getHours();
const greeting = computed(() => {
  if (currentHour < 6) return '凌晨好';
  if (currentHour < 12) return '上午好';
  if (currentHour < 14) return '中午好';
  if (currentHour < 18) return '下午好';
  return '晚上好';
});

// —— 待办缺口卡片（按数量自动调整大小，treemap 风格） ————————
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
      icon: (s.module && MODULE_ICON_FOR_SOURCE[s.module]) || 'lucide:check-square',
    };
  }),
);

// 当前视图下的最大缺口数，用于决定卡片跨度
const maxGap = computed(() => {
  const nums = gapCardItems.value.filter((c) => c.count > 0).map((c) => c.count);
  return nums.length ? Math.max(...nums) : 1;
});

// 按数量占比自动决定卡片大小：数量越大卡片越大，保持页面整洁
const sizedGapCards = computed(() =>
  gapCardItems.value.map((c) => {
    const ratio = c.count / maxGap.value;
    let span = 'col-span-1';
    let numSize = 'text-3xl';
    let pad = 'p-4';
    if (c.count === 0) {
      numSize = 'text-2xl';
    } else if (ratio >= 0.5) {
      span = 'sm:col-span-2 lg:col-span-2 row-span-2';
      numSize = 'text-5xl';
      pad = 'p-6';
    } else if (ratio >= 0.2) {
      span = 'sm:col-span-2 lg:col-span-2';
      numSize = 'text-4xl';
      pad = 'p-5';
    }
    return {
      ...c,
      span,
      numSize,
      pad,
      borderColor: c.color + '40',
      badgeBg: c.color + '1a',
    };
  }),
);

function navToSource(link?: string) {
  if (link && link.startsWith('/')) {
    router.push(link).catch((err) => console.error('nav fail:', err));
  }
}

// —— 右 2/5 上：快捷导航（4 周期 + 4 模块，8 项） ————————
const quickNavItems = computed<WorkbenchQuickNavItem[]>(() => {
  const navItems: WorkbenchQuickNavItem[] = [];
  for (const item of CADENCE_NAV) {
    navItems.push({
      color: item.color,
      icon: item.icon,
      title: item.title,
      url: `#${item.cadence}`,
    });
  }
  for (const item of MODULE_NAV) {
    navItems.push({
      color: item.color,
      icon: item.icon,
      title: item.title,
      url: item.url,
    });
  }
  return navItems;
});

// —— 右 2/5 下：待办列表（WorkbenchTodo.content 是 v-html） ————
const todoItems = computed<WorkbenchTodoItem[]>(() =>
  currentSources.value.map((s) => ({
    completed: false,
    content: s.error
      ? `⚠️ ${s.error}`
      : `<span style="color:${countColor(s.count)};font-weight:600">${s.count}</span> 条 · ${s.module} · ${s.subBoard} · ` +
        `<a data-action="export" data-source="${s.sourceCode}" style="color:#3b82f6;cursor:pointer;text-decoration:underline">导出明细</a> · ` +
        `<a data-action="goto" data-link="${s.link}" style="color:#3b82f6;cursor:pointer;text-decoration:underline">前往处理</a>`,
    date: formatTime(s.updatedAt),
    title: s.title,
  })),
);

// —— 底部全宽：最新动态（WorkbenchTrends.content 是 v-html） —————
// 这里只用纯文本 + 标签字符，不用 HTML 注入，避免再次出现源码字样。
// WorkbenchTrends 是 ul 列表，无 truncate 限制，链接颜色也依赖 Tailwind `*:text-primary`，
// 这里仍可用 v-html 包 <a>，但要确保内容无歧义（不放在 truncate 文段里）。
const trendItems = computed<WorkbenchTrendItem[]>(() => {
  const top = currentSources.value.filter((s) => !s.error).slice(0, 6);
  if (top.length === 0) {
    return [
      {
        avatar: 'lucide:check-circle-2',
        content: `${CADENCE_LABEL[activeCadence.value]} 暂无待办事项，保持节奏 👏`,
        date: '刚刚',
        title: '一切正常',
      },
    ];
  }
  const cadence = CADENCE_LABEL[activeCadence.value];
  return top.map((s) => ({
    avatar: 'lucide:user-round',
    // 纯文本 + 数字直接在 title 显示，避免 v-html 误渲染导致源码字样
    content: `${cadence} · ${s.module} · ${s.subBoard} 有 ${s.count} 条待办需要处理`,
    date: relativeTime(s.updatedAt),
    title: s.title,
  }));
});

// —— 交互 ——————————————————————————————————————————
function handleGlobalClick(e: MouseEvent) {
  const t = e.target as HTMLElement | null;
  if (!t) return;
  const action = t.dataset?.action;
  if (!action) return;
  e.preventDefault();
  if (action === 'export') {
    const code = t.dataset.source;
    if (code) void doExport(code);
  } else if (action === 'goto') {
    const link = t.dataset.link;
    if (link) router.push(link).catch((err) => console.error('nav fail:', err));
  }
}

async function doExport(sourceCode: string) {
  try {
    const blob = (await exportTodo(sourceCode)) as Blob;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    a.download = `待办明细_${sourceCode}_${today}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('export fail:', err);
  }
}

function navTo(nav: WorkbenchQuickNavItem) {
  const url = nav.url ?? '';
  if (url.startsWith('#')) {
    activeCadence.value = url.slice(1) as TodoCadence;
    return;
  }
  if (url.startsWith('http')) {
    window.open(url, '_blank');
    return;
  }
  if (url.startsWith('/')) {
    router.push(url).catch((err) => console.error('nav fail:', err));
  }
}
</script>

<template>
  <div class="p-5">
    <WorkbenchHeader>
      <template #title>
        {{ greeting }}，当前还有
        <strong :style="{ color: '#ef4444' }">{{
          cadenceCount(activeCadence)
        }}</strong>
        条{{ CADENCE_LABEL[activeCadence] }}待跟进事项，请尽快处理！
      </template>
      <template #description>
        视图：<strong>{{ CADENCE_LABEL[activeCadence] }}</strong>
        ｜点击下方"待办缺口"卡片或"待办事项"列表中的链接，可导出明细或前往来源模块处理
      </template>
    </WorkbenchHeader>

    <!-- 本周期考核节点（按各模块生效方案自动推算） -->
    <div class="mt-5 rounded-lg border border-border bg-card p-4">
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <IconifyIcon icon="lucide:calendar-clock" class="size-4" style="color: #378add" />
          <span class="text-sm font-semibold">本周期考核节点</span>
          <span v-if="nodeItems.length" class="text-xs text-foreground/50">
            共 {{ nodeItems.length }} 个模块 · 紧急 <strong style="color: #ef4444">{{ dueCount }}</strong> 个
          </span>
        </div>
        <a
          class="flex items-center gap-1 text-xs text-primary hover:underline"
          @click="router.push('/hse/todos/plan')"
        >
          <IconifyIcon icon="lucide:settings-2" class="size-3.5" />
          考核计划配置
        </a>
      </div>
      <div v-if="nodeItems.length" class="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <div
          v-for="n in nodeItems"
          :key="n.moduleCode"
          class="flex cursor-pointer flex-col rounded-lg border p-3 transition hover:shadow-md"
          :class="n.status === 'due' ? 'border-red-400/60 bg-red-50' : 'border-border bg-card'"
          @click="router.push('/hse/todos/plan')"
        >
          <span class="text-xs font-medium text-foreground/80">{{ n.moduleName }}</span>
          <span
            class="mt-1 text-sm font-bold leading-none"
            :style="{ color: n.status === 'due' ? '#ef4444' : '#378add' }"
          >
            {{ n.dueLabel }}
          </span>
          <span
            class="mt-1.5 text-xs"
            :style="{ color: n.status === 'due' ? '#ef4444' : 'var(--color-text-tertiary)' }"
          >
            {{ n.status === 'due' ? `仅剩 ${n.daysLeft} 天` : `${n.daysLeft} 天后` }}
          </span>
        </div>
      </div>
      <p v-else class="py-2 text-center text-xs text-foreground/40">
        暂无生效考核方案，请先到「考核计划」配置
      </p>
    </div>

    <!-- 3:2 的 2×2 网格（grid-cols-5）：每个网格行内两张卡默认 stretch 等高
         · 第 1 行：待办缺口(左 3/5) ↔ 快捷导航(右 2/5) → 底部齐平
         · 第 2 行：最新动态(左 3/5) ↔ 待办事项(右 2/5) → 顶部/底部齐平 -->
    <div class="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-5">
      <!-- 待办缺口：按数量自动调整卡片大小（treemap 风格） -->
      <div class="flex flex-col rounded-lg border border-border bg-card lg:col-span-3">
        <div class="flex items-center justify-between border-b border-border px-4 py-3">
          <span class="text-base font-semibold">待办缺口</span>
          <span class="text-xs text-foreground/50">按数量自动调整卡片大小</span>
        </div>
        <div class="grid grid-cols-2 gap-4 p-4 lg:grid-cols-3 grid-flow-row-dense">
          <div
            v-for="card in sizedGapCards"
            :key="card.sourceCode"
            :class="[
              card.span,
              card.pad,
              'group relative flex cursor-pointer flex-col rounded-xl border bg-card transition hover:shadow-md',
            ]"
            :style="{ borderColor: card.borderColor }"
            @click="navToSource(card.link)"
          >
            <div class="flex items-start justify-between">
              <IconifyIcon :icon="card.icon" class="size-6" :style="{ color: card.color }" />
              <span
                class="rounded-full px-2 py-0.5 text-xs font-medium"
                :style="{ backgroundColor: card.badgeBg, color: card.color }"
                >{{ card.level }}</span
              >
            </div>
            <div :class="card.numSize" class="mt-3 font-bold leading-none" :style="{ color: card.color }">
              {{ card.count }}<span class="ml-1 text-sm font-normal text-foreground/60">条</span>
            </div>
            <div class="mt-2 line-clamp-1 text-sm font-medium text-foreground">{{ card.title }}</div>
            <div class="mt-1 text-xs text-foreground/50">{{ card.module }} · {{ card.subBoard }}</div>
            <div class="mt-auto flex items-center justify-between pt-3">
              <span class="text-xs text-foreground/40">{{ card.time }}</span>
              <a class="text-xs text-primary hover:underline" @click.stop="doExport(card.sourceCode)">导出明细</a>
            </div>
          </div>
        </div>
      </div>
      <WorkbenchQuickNav
        :items="quickNavItems"
        title="快捷导航"
        class="h-full lg:col-span-2"
        @click="navTo"
      />
      <WorkbenchTrends
        :items="trendItems"
        title="最新动态"
        class="h-full lg:col-span-3"
      />
      <WorkbenchTodo
        :items="todoItems"
        :title="`待办事项（${CADENCE_LABEL[activeCadence]}）`"
        class="h-full lg:col-span-2"
      />
    </div>

    <!-- 顶部统计条（4 个周期数字 + 总计） -->
    <div
      class="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-card px-4 py-3 text-sm"
    >
      <div class="flex items-center gap-2">
        <span class="size-2 rounded-full bg-red-500"></span>
        <span class="text-foreground/70">每天</span>
        <strong class="text-base" style="color:#ef4444">{{ dailyCount }}</strong>
      </div>
      <div class="flex items-center gap-2">
        <span class="size-2 rounded-full bg-orange-500"></span>
        <span class="text-foreground/70">每周</span>
        <strong class="text-base" style="color:#f59e0b">{{ weeklyCount }}</strong>
      </div>
      <div class="flex items-center gap-2">
        <span class="size-2 rounded-full bg-blue-500"></span>
        <span class="text-foreground/70">每月</span>
        <strong class="text-base" style="color:#3b82f6">{{ monthlyCount }}</strong>
      </div>
      <div class="flex items-center gap-2">
        <span class="size-2 rounded-full bg-green-500"></span>
        <span class="text-foreground/70">每年</span>
        <strong class="text-base" style="color:#10b981">{{ yearlyCount }}</strong>
      </div>
      <div class="ml-auto flex items-center gap-4 border-l border-border pl-3">
        <span class="text-foreground/70">
          总计
          <strong class="text-base text-foreground">{{ totalCount }}</strong>
        </span>
        <a
          class="flex items-center gap-1 text-sm text-primary hover:underline"
          @click="router.push('/hse/todos/plan')"
        >
          <IconifyIcon icon="lucide:calendar-cog" class="size-4" />
          考核计划配置
        </a>
      </div>
    </div>
  </div>
</template>
