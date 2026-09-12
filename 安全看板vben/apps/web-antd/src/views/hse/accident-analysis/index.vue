<template>
  <Page auto-content-height class="hse-page">
    <template #title>
      <div class="page-title">
        <IconifyIcon icon="lucide:flame" :size="20" />
        <span>事故分析中心</span>
      </div>
    </template>
    <template #description>HSE事故风险分析与责任追踪</template>
    <template #extra>
      <Space :size="8">
        <HelpButton menuCode="HSE_ACCIDENT_LIST" />
        <ImportButtonGroup module="accident-analysis" module-name="事故分析中心" />
      </Space>
    </template>

    <div class="mb-4">
      <AccidentOverview :data="overviewData" />
    </div>

    <Row :gutter="[16, 16]">
      <Col :xs="24" :lg="12">
        <Card class="analysis-card" :bordered="false">
          <template #title>
            <div class="card-title">
              <IconifyIcon icon="lucide:layers" :size="16" />
              <span>事故分类分析</span>
            </div>
          </template>
          <AccidentClassification :data="classificationData" />
        </Card>
      </Col>
      <Col :xs="24" :lg="12">
        <Card class="analysis-card" :bordered="false">
          <template #title>
            <div class="card-title">
              <IconifyIcon icon="lucide:trending-up" :size="16" />
              <span>事故趋势</span>
            </div>
          </template>
          <AccidentTrend
            :data="trendData"
            @period-change="handlePeriodChange"
          />
        </Card>
      </Col>
      <Col :span="24">
        <Card class="analysis-card" :bordered="false">
          <template #title>
            <div class="card-title">
              <IconifyIcon icon="lucide:users" :size="16" />
              <span>责任人员分析</span>
            </div>
          </template>
          <ResponsibleAnalysis
            :data="responsibleData"
            :loading="loading.responsible"
            @employee-click="handleEmployeeClick"
          />
        </Card>
      </Col>
    </Row>
  </Page>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { Page } from '@vben/common-ui';
import { Card, Col, Row, Space, message } from 'ant-design-vue';
import { IconifyIcon } from '@vben/icons';
import { HelpButton } from '#/components/hse';
import ImportButtonGroup from '#/components/hse/ImportButtonGroup.vue';
import { useRouter } from 'vue-router';
import {
  getAccidentOverview,
  getAccidentTrend,
  getAccidentClassification,
  getAccidentResponsible,
  type AccidentAnalysisApi,
} from '#/api/hse/accident-analysis';
import AccidentOverview from './AccidentOverview.vue';
import AccidentClassification from './AccidentClassification.vue';
import AccidentTrend from './AccidentTrend.vue';
import ResponsibleAnalysis from './ResponsibleAnalysis.vue';

const router = useRouter();

const overviewData = ref<AccidentAnalysisApi.OverviewData | null>(null);
const trendData = ref<AccidentAnalysisApi.TrendData | null>(null);
const classificationData = ref<AccidentAnalysisApi.ClassificationData | null>(null);
const responsibleData = ref<AccidentAnalysisApi.ResponsibleData | null>(null);

const loading = reactive({
  overview: false,
  trend: false,
  classification: false,
  responsible: false,
});

async function loadOverview() {
  loading.overview = true;
  try {
    overviewData.value = await getAccidentOverview();
  } catch (e: any) {
    message.error(e.message || '加载事故总览失败');
  } finally {
    loading.overview = false;
  }
}

async function loadTrend(period: AccidentAnalysisApi.TrendPeriod = 'year', year?: number) {
  loading.trend = true;
  try {
    trendData.value = await getAccidentTrend({ period, year });
  } catch (e: any) {
    message.error(e.message || '加载事故趋势失败');
  } finally {
    loading.trend = false;
  }
}

async function loadClassification() {
  loading.classification = true;
  try {
    classificationData.value = await getAccidentClassification();
  } catch (e: any) {
    message.error(e.message || '加载事故分类失败');
  } finally {
    loading.classification = false;
  }
}

async function loadResponsible() {
  loading.responsible = true;
  try {
    responsibleData.value = await getAccidentResponsible({ page: 1, pageSize: 20 });
  } catch (e: any) {
    message.error(e.message || '加载责任人员分析失败');
  } finally {
    loading.responsible = false;
  }
}

function handlePeriodChange(period: AccidentAnalysisApi.TrendPeriod, year?: number) {
  loadTrend(period, year);
}

function handleEmployeeClick(employeeId: number) {
  router.push(`/hse-advanced/risk-profile/${employeeId}`);
}

// 性能优化：独立 API 调用改为 Promise.all 并行执行
onMounted(async () => {
  await Promise.all([
    loadOverview(),
    loadTrend('year'),
    loadClassification(),
    loadResponsible(),
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
