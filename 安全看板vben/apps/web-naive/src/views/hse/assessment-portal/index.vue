<script lang="ts" setup>
/**
 * 月度考核聚合门户（web-naive · 门户+镜像联动）
 * 能力：周期选择 + 岗位 Tab（乡镇作业中心经理/管理员）+ 考核类别卡片（上限分/扣分对象/规则数）
 *      + 每卡「进入台账 →」RouterLink 跳转到对应镜像子路由（复用各模块原组件，数据同源）。
 * 数据源：getAssessmentCycleList（周期）+ getCategoryLimits(role)（类别扣分上限，按岗位取套）。
 * 边界：仅门户页与镜像路由新增；不改任何原始台账路由/组件/后端。
 */
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';

import {
  NCard,
  NEmpty,
  NGi,
  NGrid,
  NSelect,
  NStatistic,
  NTabPane,
  NTabs,
  NTag,
} from 'naive-ui';
import { IconifyIcon } from '@vben/icons';

import { HsePageLayout } from '#/components/hse';
import {
  getAssessmentCycleList,
  type AssessmentMonthlyApi,
} from '#/api/hse/assessment-monthly';
import {
  getCategoryLimits,
  type CategoryLimitApi,
} from '#/api/hse/assessment-rule';
import { message } from '#/adapter/naive';

import { DEFAULT_LEDGER_ROUTE, ledgerPages, resolveLedgerRoute } from './ledger-map';

defineOptions({ name: 'AssessmentPortal' });

const loading = ref(false);
const cycleList = ref<AssessmentMonthlyApi.AssessmentCycle[]>([]);
const selectedCycleId = ref<number | null>(null);
const activeRole = ref<'manager' | 'admin'>('manager');
const categories = ref<CategoryLimitApi.CategoryLimit[]>([]);

const cycleOptions = computed(() =>
  cycleList.value.map((c) => ({
    label: c.cycleName || `${c.assessmentYear}-${c.assessmentMonth}`,
    value: c.id,
  })),
);

/** 岗位 Tab 选项 */
const roleTabs = [
  { label: '乡镇作业中心经理', value: 'manager', icon: 'lucide:users-round' },
  { label: '管理员', value: 'admin', icon: 'lucide:shield-check' },
];

/** 扣分对象中文标签 */
function deductTargetLabel(target?: string | null): string {
  if (!target) return '—';
  if (target === 'self') return '本人';
  if (target === 'manager') return '乡镇作业中心经理';
  if (target === 'admin') return '管理员';
  return target;
}

/** 类别 → 跳转路由（未知类别回退到规则库） */
function routeOf(category?: string | null): string {
  return resolveLedgerRoute(category);
}

async function loadCycles() {
  try {
    const res = await getAssessmentCycleList({
      page: 1,
      page_size: 50,
      sort_by: 'created_at',
      sort_order: 'desc',
    });
    cycleList.value = res.list || [];
    const first = cycleOptions.value[0];
    if (first && selectedCycleId.value == null) {
      selectedCycleId.value = first.value;
    }
  } catch {
    message.error('加载考核周期失败');
  }
}

async function loadCategories() {
  loading.value = true;
  try {
    categories.value = await getCategoryLimits(activeRole.value);
  } catch {
    message.error('加载类别扣分上限失败');
  } finally {
    loading.value = false;
  }
}

// 岗位 Tab 切换 → 重新按岗位加载类别上限
watch(activeRole, () => loadCategories());

const quickEntries = [
  { title: '自动评分', path: '/objectives/assessment-scoring', icon: 'lucide:calculator' },
  { title: '扣分审核', path: '/objectives/assessment-deduction-review', icon: 'lucide:check-circle-2' },
  { title: '结果冻结', path: '/objectives/assessment-freeze', icon: 'lucide:snowflake' },
  { title: '考核周期', path: '/objectives/assessment-cycles', icon: 'lucide:repeat' },
  { title: 'Excel导入导出', path: '/objectives/assessment-excel', icon: 'lucide:file-spreadsheet' },
  { title: '扣分规则库', path: '/objectives/assessment-rule', icon: 'lucide:list-tree' },
];

onMounted(async () => {
  await loadCycles();
  await loadCategories();
});
</script>

<template>
  <HsePageLayout
    title="月度安全履职考核 · 门户"
    description="统一入口：聚合散落在各模块的考核台账，镜像联动、数据同源；点击卡片「进入台账 →」跳转到对应镜像页面，改动与原模块实时同步。"
  >
    <!-- 周期选择 -->
    <div class="mb-4 flex flex-wrap items-center gap-3">
      <span class="text-sm text-muted-foreground">考核周期</span>
      <NSelect
        v-model:value="selectedCycleId"
        :options="cycleOptions"
        placeholder="请选择考核周期"
        clearable
        style="width: 220px"
      />
    </div>

    <!-- 岗位 + 类别卡片 -->
    <NTabs v-model:value="activeRole" type="line" animated>
      <NTabPane v-for="tab in roleTabs" :key="tab.value" :name="tab.value" :tab="tab.label">
        <template #tab>
          <span class="inline-flex items-center gap-1.5">
            <IconifyIcon :icon="tab.icon" class="h-4 w-4" />
            {{ tab.label }}
          </span>
        </template>

        <NEmpty v-if="!loading && categories.length === 0" description="暂无类别扣分上限配置" />

        <NGrid v-else :cols="4" :x-gap="16" :y-gap="16" responsive="screen">
          <NGi v-for="cat in categories" :key="cat.category">
            <RouterLink :to="routeOf(cat.category)" custom v-slot="{ navigate }">
              <NCard
                hoverable
                size="small"
                :title="cat.category"
                class="h-full cursor-pointer"
                @click="navigate"
              >
                <div class="flex flex-col gap-3">
                  <div class="grid grid-cols-2 gap-3">
                    <NStatistic label="类别上限" :value="cat.maxDeduct ?? '不设上限'" />
                    <NStatistic label="规则数" :value="cat.ruleCount ?? 0" />
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="text-xs text-muted-foreground">扣分对象</span>
                    <NTag size="small" type="info" round>
                      {{ deductTargetLabel(cat.deductTarget) }}
                    </NTag>
                  </div>
                  <div class="mt-1 flex items-center justify-end text-sm text-primary">
                    <span>进入台账 →</span>
                  </div>
                </div>
              </NCard>
            </RouterLink>
          </NGi>
        </NGrid>
      </NTabPane>
    </NTabs>

    <!-- 台账镜像入口：恒定展示全部散落的考核台账页（不依赖类别扣分上限表） -->
    <div class="mt-6">
      <div class="mb-3 flex items-center justify-between">
        <span class="text-sm font-semibold text-muted-foreground">台账镜像入口</span>
        <span class="text-xs text-muted-foreground">与各模块原页面数据同源，改动双向联动</span>
      </div>
      <NGrid :cols="4" :x-gap="16" :y-gap="16" responsive="screen">
        <NGi v-for="page in ledgerPages" :key="page.path">
          <RouterLink
            :to="page.path"
            class="flex items-center gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:border-primary"
          >
            <IconifyIcon :icon="page.icon" class="h-6 w-6 shrink-0 text-primary" />
            <span class="text-sm font-medium">{{ page.title }}</span>
            <IconifyIcon icon="lucide:arrow-up-right" class="ml-auto h-4 w-4 text-muted-foreground" />
          </RouterLink>
        </NGi>
      </NGrid>
    </div>

    <!-- 考核流程与配置入口 -->
    <div class="mt-6">
      <div class="mb-3 flex items-center justify-between">
        <span class="text-sm font-semibold text-muted-foreground">考核流程与配置</span>
        <RouterLink
          :to="DEFAULT_LEDGER_ROUTE"
          class="text-sm text-primary hover:underline"
        >
          配置扣分规则库 →
        </RouterLink>
      </div>
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <RouterLink
          v-for="entry in quickEntries"
          :key="entry.path"
          :to="entry.path"
          class="rounded-lg border border-border bg-card p-3 transition-colors hover:border-primary"
        >
          <div class="flex items-center gap-2">
            <IconifyIcon :icon="entry.icon" class="h-5 w-5 text-primary" />
            <span class="text-sm font-medium">{{ entry.title }}</span>
          </div>
        </RouterLink>
      </div>
    </div>
  </HsePageLayout>
</template>