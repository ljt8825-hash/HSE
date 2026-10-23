<script lang="ts" setup>
/**
 * 驾驶员专项风险中心（web-naive 迁移，2026-09-30 重设计）
 * 等高紧凑网格：顶部统计卡 + 两行卡片 + 底部事故分析；
 * 图表自适应撑满卡片，配色统一为 HSE 系统语义色。
 * 说明：无后端导入端点 → 降级隐藏「导入」按钮组；同时不展示帮助按钮
 */
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';

import { IconifyIcon } from '@vben/icons';

import { NButton, NCard, NPopconfirm } from 'naive-ui';

import {
  getAccidentStatistics,
  getDemeritStatistics,
  getDriverList,
  getDriverRiskOverview,
  rebuildRiskSnapshot,
  type DriverRiskCenterApi,
} from '#/api/hse/driver-risk-center';
import { HsePageLayout } from '#/components/hse';

import AccidentAnalysis from './AccidentAnalysis.vue';
import DemeritAnalysis from './DemeritAnalysis.vue';
import LevelDistribution from './LevelDistribution.vue';
import RiskComposition from './RiskComposition.vue';
import RiskOverview from './RiskOverview.vue';
import TopRanking from './TopRanking.vue';
import { message } from '#/adapter/naive';

import { useUserStore } from '@vben/stores';

defineOptions({ name: 'HseDriverRiskCenter' });

const userStore = useUserStore();
const isAdmin = computed(() =>
  (userStore.userInfo?.roles ?? []).includes('admin'),
);
const rebuildBusy = ref(false);

const router = useRouter();
const overviewData = ref<DriverRiskCenterApi.OverviewData | null>(null);
const demeritData = ref<DriverRiskCenterApi.DemeritStatisticsData | null>(null);
const accidentData = ref<DriverRiskCenterApi.AccidentStatisticsData | null>(
  null,
);
const topDrivers = ref<DriverRiskCenterApi.DriverListItem[]>([]);

const loading = reactive({
  overview: false,
  demerit: false,
  accident: false,
  top: false,
});

async function loadOverview() {
  loading.overview = true;
  try {
    overviewData.value = await getDriverRiskOverview();
  } catch (e: any) {
    message.error(e.message || '加载风险总览失败');
  } finally {
    loading.overview = false;
  }
}

async function loadDemerit() {
  loading.demerit = true;
  try {
    demeritData.value = await getDemeritStatistics();
  } catch (e: any) {
    message.error(e.message || '加载扣分统计失败');
  } finally {
    loading.demerit = false;
  }
}

async function loadAccident() {
  loading.accident = true;
  try {
    accidentData.value = await getAccidentStatistics();
  } catch (e: any) {
    message.error(e.message || '加载事故统计失败');
  } finally {
    loading.accident = false;
  }
}

async function loadTopDrivers() {
  loading.top = true;
  try {
    const res = await getDriverList({ page: 1, pageSize: 10 });
    topDrivers.value = res.list;
  } catch (e: any) {
    message.error(e.message || '加载TOP排行失败');
  } finally {
    loading.top = false;
  }
}

function handleDriverClick(employeeId: number) {
  router.push(`/hse-advanced/risk-profile/${employeeId}`);
}

// 重新计算风险快照（仅 admin，写操作需确认）：以现场台账为明细底座重算并覆盖当日快照
async function reloadAll() {
  await Promise.all([
    loadOverview(),
    loadDemerit(),
    loadAccident(),
    loadTopDrivers(),
  ]);
}
async function handleRebuild() {
  rebuildBusy.value = true;
  try {
    await rebuildRiskSnapshot('write');
    message.success('风险快照已按现场台账底座重算并覆盖当日');
    await reloadAll();
  } catch (e: any) {
    message.error(e.message || '重算风险快照失败');
  } finally {
    rebuildBusy.value = false;
  }
}

// 性能优化：独立 API 调用改为 Promise.all 并行执行
onMounted(async () => {
  await reloadAll();
});
</script>

<template>
  <HsePageLayout
    auto-content-height
    title="驾驶员专项风险中心"
    description="公司驾驶员安全风险管理"
  >
    <template #title>
      <div class="page-title">
        <IconifyIcon icon="lucide:car" :size="20" />
        <span>驾驶员专项风险中心</span>
      </div>
    </template>
    <template #description>公司驾驶员安全风险管理</template>

    <template #extra>
      <NPopconfirm
        v-if="isAdmin"
        title="确认重新计算风险快照？"
        positive-text="确认重算"
        negative-text="取消"
        @positive-click="handleRebuild"
      >
        <template #trigger>
          <NButton type="warning" secondary :loading="rebuildBusy">
            重新计算风险快照
          </NButton>
        </template>
        <span>
          将以现场台账为明细底座重算全站风险并覆盖当日快照，影响驾驶员风险中心、画像、预警中心、领导驾驶舱、考核分析等 8 处口径。仅管理员可操作。
        </span>
      </NPopconfirm>
    </template>

    <div class="space-y-4">
      <RiskOverview :data="overviewData" />

      <div class="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div class="lg:col-span-5">
          <NCard class="h-full" :bordered="false">
            <template #header>
              <div class="card-title">
                <IconifyIcon icon="lucide:pie-chart" :size="16" />
                <span>风险等级分布</span>
              </div>
            </template>
            <div class="fill-height">
              <LevelDistribution
                :data="overviewData?.levelDistribution ?? null"
              />
            </div>
          </NCard>
        </div>
        <div class="lg:col-span-7">
          <NCard class="h-full" :bordered="false">
            <template #header>
              <div class="card-title">
                <IconifyIcon icon="lucide:bar-chart-3" :size="16" />
                <span>驾驶风险构成</span>
              </div>
            </template>
            <div class="fill-height">
              <RiskComposition :data="overviewData" />
            </div>
          </NCard>
        </div>
      </div>

      <div class="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div class="lg:col-span-7">
          <NCard class="h-full" :bordered="false">
            <template #header>
              <div class="card-title">
                <IconifyIcon icon="lucide:ticket" :size="16" />
                <span>驾驶证扣分分析</span>
              </div>
            </template>
            <div class="fill-height">
              <DemeritAnalysis
                :data="demeritData"
                @driver-click="handleDriverClick"
              />
            </div>
          </NCard>
        </div>
        <div class="lg:col-span-5">
          <NCard class="h-full" :bordered="false">
            <template #header>
              <div class="card-title">
                <IconifyIcon icon="lucide:trophy" :size="16" />
                <span>TOP风险排行</span>
              </div>
            </template>
            <div class="fill-height">
              <TopRanking
                :top-list="topDrivers"
                :loading="loading.top"
                @driver-click="handleDriverClick"
              />
            </div>
          </NCard>
        </div>
      </div>

      <NCard :bordered="false">
        <template #header>
          <div class="card-title">
            <IconifyIcon icon="lucide:flame" :size="16" />
            <span>交通事故分析</span>
          </div>
        </template>
        <AccidentAnalysis :data="accidentData" />
      </NCard>
    </div>
  </HsePageLayout>
</template>

<style scoped>
.page-title,
.card-title {
  display: flex;
  gap: 8px;
  align-items: center;
}
.fill-height {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
</style>
