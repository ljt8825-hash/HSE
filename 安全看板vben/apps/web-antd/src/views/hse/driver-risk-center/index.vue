<template>
  <Page auto-content-height class="hse-page">
    <template #title>
      <div class="page-title">
        <IconifyIcon icon="lucide:car" :size="20" />
        <span>驾驶员专项风险中心</span>
      </div>
    </template>
    <template #description>公司驾驶员安全风险管理</template>
    <template #extra>
      <Space :size="8">
        <HelpButton menuCode="HSE_DRIVER_RISK_CENTER" />
        <ImportButtonGroup module="driver-risk-center" module-name="驾驶员风险中心" />
      </Space>
    </template>

    <Row :gutter="[16, 16]" class="mb-4">
      <Col :span="24">
        <RiskOverview :data="overviewData" />
      </Col>
    </Row>

    <Row :gutter="[16, 16]" class="mb-4">
      <Col :xs="24" :lg="10">
        <Card class="center-card" :bordered="false">
          <template #title>
            <div class="card-title">
              <IconifyIcon icon="lucide:pie-chart" :size="16" />
              <span>风险等级分布</span>
            </div>
          </template>
          <LevelDistribution :data="overviewData?.levelDistribution ?? null" />
        </Card>
      </Col>
      <Col :xs="24" :lg="14">
        <Card class="center-card" :bordered="false">
          <template #title>
            <div class="card-title">
              <IconifyIcon icon="lucide:bar-chart-3" :size="16" />
              <span>驾驶风险构成</span>
            </div>
          </template>
          <RiskComposition :data="overviewData" />
        </Card>
      </Col>
    </Row>

    <Row :gutter="[16, 16]" class="mb-4">
      <Col :xs="24" :lg="16">
        <Card class="center-card" :bordered="false">
          <template #title>
            <div class="card-title">
              <IconifyIcon icon="lucide:ticket" :size="16" />
              <span>驾驶证扣分分析</span>
              <Tag color="red">近5年</Tag>
            </div>
          </template>
          <DemeritAnalysis
            :data="demeritData"
            @driver-click="handleDriverClick"
          />
        </Card>
      </Col>
      <Col :xs="24" :lg="8">
        <Card class="center-card" :bordered="false">
          <template #title>
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
        </Card>
      </Col>
    </Row>

    <Row :gutter="[16, 16]">
      <Col :span="24">
        <Card class="center-card" :bordered="false">
          <template #title>
            <div class="card-title">
              <IconifyIcon icon="lucide:flame" :size="16" />
              <span>交通事故分析</span>
            </div>
          </template>
          <AccidentAnalysis :data="accidentData" />
        </Card>
      </Col>
    </Row>
  </Page>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { Page } from '@vben/common-ui';
import { Card, Col, Row, Space, Tag, message } from 'ant-design-vue';
import { IconifyIcon } from '@vben/icons';
import { HelpButton } from '#/components/hse';
import ImportButtonGroup from '#/components/hse/ImportButtonGroup.vue';
import { useRouter } from 'vue-router';
import {
  getDriverRiskOverview,
  getDriverList,
  getDemeritStatistics,
  getAccidentStatistics,
  type DriverRiskCenterApi,
} from '#/api/hse/driver-risk-center';
import RiskOverview from './RiskOverview.vue';
import LevelDistribution from './LevelDistribution.vue';
import RiskComposition from './RiskComposition.vue';
import DemeritAnalysis from './DemeritAnalysis.vue';
import AccidentAnalysis from './AccidentAnalysis.vue';
import TopRanking from './TopRanking.vue';

const router = useRouter();

const overviewData = ref<DriverRiskCenterApi.OverviewData | null>(null);
const demeritData = ref<DriverRiskCenterApi.DemeritStatisticsData | null>(null);
const accidentData = ref<DriverRiskCenterApi.AccidentStatisticsData | null>(null);
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

<style lang="less" scoped>
.page-title,
.card-title {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
