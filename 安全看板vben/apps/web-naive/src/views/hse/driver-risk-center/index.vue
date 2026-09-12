<script lang="ts" setup>
/**
 * 驾驶员专项风险中心（web-naive 迁移）
 * 迁移自 web-antd，数据逻辑 / API 调用 / 图表配置保持一致
 * 说明：无后端导入端点 → 降级隐藏「导入」按钮组；同时不展示帮助按钮
 */
import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';

import { IconifyIcon } from '@vben/icons';

import { NCard, NTag} from 'naive-ui';

import {
  getAccidentStatistics,
  getDemeritStatistics,
  getDriverList,
  getDriverRiskOverview,
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

defineOptions({ name: 'HseDriverRiskCenter' });

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

// 性能优化：独立 API 调用改为 Promise.all 并行执行
onMounted(async () => {
  await Promise.all([
    loadOverview(),
    loadDemerit(),
    loadAccident(),
    loadTopDrivers(),
  ]);
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

    <div class="mb-4">
      <RiskOverview :data="overviewData" />
    </div>

    <div class="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
      <div class="lg:col-span-5">
        <NCard class="center-card" :bordered="false">
          <template #header>
            <div class="card-title">
              <IconifyIcon icon="lucide:pie-chart" :size="16" />
              <span>风险等级分布</span>
            </div>
          </template>
          <LevelDistribution :data="overviewData?.levelDistribution ?? null" />
        </NCard>
      </div>
      <div class="lg:col-span-7">
        <NCard class="center-card" :bordered="false">
          <template #header>
            <div class="card-title">
              <IconifyIcon icon="lucide:bar-chart-3" :size="16" />
              <span>驾驶风险构成</span>
            </div>
          </template>
          <RiskComposition :data="overviewData" />
        </NCard>
      </div>
    </div>

    <div class="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
      <div class="lg:col-span-8">
        <NCard class="center-card" :bordered="false">
          <template #header>
            <div class="card-title">
              <IconifyIcon icon="lucide:ticket" :size="16" />
              <span>驾驶证扣分分析</span>
              <NTag size="small" type="error" :bordered="false">近5年</NTag>
            </div>
          </template>
          <DemeritAnalysis
            :data="demeritData"
            @driver-click="handleDriverClick"
          />
        </NCard>
      </div>
      <div class="lg:col-span-4">
        <NCard class="center-card" :bordered="false">
          <template #header>
            <div class="card-title">
              <IconifyIcon icon="lucide:trophy" :size="16" />
              <span>TOP风险排行</span>
            </div>
          </template>
          <TopRanking
            :top-list="topDrivers"
            :loading="loading.top"
            @driver-click="handleDriverClick"
          />
        </NCard>
      </div>
    </div>

    <div>
      <NCard class="center-card" :bordered="false">
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
</style>
