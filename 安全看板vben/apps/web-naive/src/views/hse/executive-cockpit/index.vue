<template>
  <HsePageLayout :title="'公司HSE安全总览'" :auto-content-height="true">
    <div class="cockpit-container">
      <div class="cockpit-header">
        <div class="header-left">
          <IconifyIcon icon="lucide:layout-dashboard" :size="28" class="header-icon" />
          <div class="header-info">
            <h1 class="header-title">公司HSE安全总览</h1>
            <p class="header-desc">{{ currentYear }}年度安全态势总览 · 模型版本 {{ overviewData?.modelVersion?.version || 'v1.1' }}</p>
          </div>
        </div>
        <div class="header-actions">
          <NSelect
            v-model:value="selectedYear"
            :options="yearOptions"
            style="width: 120px"
            @update:value="handleYearChange"
          />
          <NButton @click="refreshData">
            <IconifyIcon icon="lucide:refresh-cw" :size="16" />
            刷新
          </NButton>
        </div>
      </div>

      <div class="section-title">
        <IconifyIcon icon="lucide:activity" :size="18" />
        <span>公司HSE安全态势</span>
      </div>
      <div class="kpi-row">
        <div
          v-for="card in overviewData?.kpiCards || []"
          :key="card.key"
          class="kpi-card"
          :class="`status-${card.status}`"
        >
          <div class="kpi-label">{{ card.title }}</div>
          <div class="kpi-value">
            <span class="value-num">{{ card.value }}</span>
            <span class="value-unit" v-if="card.unit">{{ card.unit }}</span>
          </div>
          <div class="kpi-desc">{{ card.description }}</div>
          <div class="kpi-status-dot" :class="`dot-${card.status}`"></div>
        </div>
      </div>

      <div class="cockpit-row">
        <div class="cockpit-col col-8">
          <NCard class="cockpit-card" :bordered="false">
            <template #header>
              <div class="card-title">
                <IconifyIcon icon="lucide:trophy" :size="16" />
                <span>组织安全排名</span>
              </div>
            </template>
            <div class="ranking-level-selector">
              <NRadioGroup v-model:value="rankingLevel" size="small" @change="fetchOrgRanking">
                <NRadioButton value="department">部门</NRadioButton>
                <NRadioButton value="center">中心</NRadioButton>
                <NRadioButton value="area">片区</NRadioButton>
              </NRadioGroup>
              <div class="status-legend">
                <span class="legend-item"><span class="legend-dot green"></span>绿区</span>
                <span class="legend-item"><span class="legend-dot yellow"></span>黄区</span>
                <span class="legend-item"><span class="legend-dot red"></span>红区</span>
              </div>
            </div>
            <div v-if="orgRankingData" class="ranking-stats">
              <div class="stat-item green">
                <span class="stat-num">{{ orgRankingData.statusStats.green }}</span>
                <span class="stat-label">绿区</span>
              </div>
              <div class="stat-item yellow">
                <span class="stat-num">{{ orgRankingData.statusStats.yellow }}</span>
                <span class="stat-label">黄区</span>
              </div>
              <div class="stat-item red">
                <span class="stat-num">{{ orgRankingData.statusStats.red }}</span>
                <span class="stat-label">红区</span>
              </div>
            </div>
            <NDataTable
              :columns="rankingColumns"
              :data="orgRankingData?.rankings || []"
              :pagination="false"
              :row-key="(row) => row.orgId"
              size="small"
              class="ranking-table"
            />
          </NCard>
        </div>

        <div class="cockpit-col col-4">
          <NCard class="cockpit-card" :bordered="false">
            <template #header>
              <div class="card-title">
                <IconifyIcon icon="lucide:alert-triangle" :size="16" />
                <span>重大风险预警</span>
              </div>
            </template>
            <div v-if="majorRiskData" class="warning-stats">
              <div class="warning-stat danger">
                <div class="ws-num">{{ majorRiskData.warningStats.highRiskOrgCount }}</div>
                <div class="ws-label">高风险组织</div>
              </div>
              <div class="warning-stat danger">
                <div class="ws-num">{{ majorRiskData.warningStats.highRiskEmployeeCount }}</div>
                <div class="ws-label">高风险员工</div>
              </div>
              <div class="warning-stat warning">
                <div class="ws-num">{{ majorRiskData.warningStats.majorAccidentCount }}</div>
                <div class="ws-label">重大事故</div>
              </div>
              <div class="warning-stat warning">
                <div class="ws-num">{{ majorRiskData.warningStats.overdueCount }}</div>
                <div class="ws-label">整改逾期</div>
              </div>
            </div>
            <NTabs v-model:value="activeWarningTab" size="small" class="warning-tabs">
              <NTabPane name="orgs" tab="高风险组织">
                <div v-if="majorRiskData?.highRiskOrgs?.length" class="warning-list">
                  <div
                    v-for="org in majorRiskData.highRiskOrgs.slice(0, 5)"
                    :key="org.orgId"
                    class="warning-item clickable"
                    @click="handleOrgClick(org)"
                  >
                    <div class="wi-header">
                      <span class="wi-title">{{ org.orgName }}</span>
                      <NTag type="error">{{ org.riskLevel }}</NTag>
                    </div>
                    <div class="wi-reasons">
                      <span v-for="(reason, idx) in org.warningReasons" :key="idx" class="wi-reason">
                        {{ reason }}
                      </span>
                    </div>
                  </div>
                </div>
                <NEmpty v-else description="暂无高风险组织" />
              </NTabPane>
              <NTabPane name="employees" tab="高风险员工">
                <div v-if="majorRiskData?.highRiskEmployees?.length" class="warning-list">
                  <div
                    v-for="emp in majorRiskData.highRiskEmployees.slice(0, 5)"
                    :key="emp.employeeId"
                    class="warning-item clickable"
                    @click="handleEmployeeClick(emp.employeeId)"
                  >
                    <div class="wi-header">
                      <span class="wi-title">{{ emp.employeeName }}</span>
                      <NTag :type="emp.riskLevelCode === 'critical' ? 'error' : 'warning'">{{ emp.riskLevel }}</NTag>
                    </div>
                    <div class="wi-meta">
                      <span>{{ emp.positionName }}</span>
                      <span>{{ emp.deptName }}</span>
                    </div>
                  </div>
                </div>
                <NEmpty v-else description="暂无高风险员工" />
              </NTabPane>
            </NTabs>
          </NCard>
        </div>
      </div>

      <div class="cockpit-row">
        <div class="cockpit-col col-8">
          <NCard class="cockpit-card" :bordered="false">
            <template #header>
              <div class="card-title">
                <IconifyIcon icon="lucide:trending-up" :size="16" />
                <span>风险态势分析</span>
              </div>
            </template>
            <div class="trend-tabs">
              <NRadioGroup v-model:value="activeTrendType" size="small">
                <NRadioButton value="employee">员工风险</NRadioButton>
                <NRadioButton value="driver">驾驶风险</NRadioButton>
                <NRadioButton value="accident">事故趋势</NRadioButton>
              </NRadioGroup>
            </div>
            <EchartsUI ref="trendChartRef" height="300px" />
          </NCard>
        </div>

        <div class="cockpit-col col-4">
          <NCard class="cockpit-card" :bordered="false">
            <template #header>
              <div class="card-title">
                <IconifyIcon icon="lucide:target" :size="16" />
                <span>考核指标完成情况</span>
              </div>
            </template>
            <div v-if="indicatorData" class="indicator-summary">
              <div class="ind-summary-item">
                <div class="ind-circle">
                  <svg viewBox="0 0 120 120">
                    <circle cx="60" cy="60" r="50" fill="none" stroke="hsl(var(--border))" stroke-width="10" />
                    <circle
                      cx="60" cy="60" r="50" fill="none"
                      :stroke="indicatorData.contractCompletionRate >= 90 ? '#52c41a' : indicatorData.contractCompletionRate >= 70 ? '#faad14' : '#f5222d'"
                      stroke-width="10"
                      :stroke-dasharray="`${indicatorData.contractCompletionRate * 3.14} 314`"
                      stroke-dashoffset="78.5"
                      stroke-linecap="round"
                    />
                    <text x="60" y="55" text-anchor="middle" class="circle-num">{{ indicatorData.contractCompletionRate }}%</text>
                    <text x="60" y="75" text-anchor="middle" class="circle-label">目标责任书</text>
                  </svg>
                </div>
              </div>
              <div class="ind-summary-item">
                <div class="ind-circle">
                  <svg viewBox="0 0 120 120">
                    <circle cx="60" cy="60" r="50" fill="none" stroke="hsl(var(--border))" stroke-width="10" />
                    <circle
                      cx="60" cy="60" r="50" fill="none"
                      :stroke="indicatorData.keyIndicatorRate >= 90 ? '#52c41a' : indicatorData.keyIndicatorRate >= 70 ? '#faad14' : '#f5222d'"
                      stroke-width="10"
                      :stroke-dasharray="`${indicatorData.keyIndicatorRate * 3.14} 314`"
                      stroke-dashoffset="78.5"
                      stroke-linecap="round"
                    />
                    <text x="60" y="55" text-anchor="middle" class="circle-num">{{ indicatorData.keyIndicatorRate }}%</text>
                    <text x="60" y="75" text-anchor="middle" class="circle-label">关键指标</text>
                  </svg>
                </div>
              </div>
            </div>
            <div class="indicator-list">
              <div v-for="ind in indicatorData?.indicators?.slice(0, 5) || []" :key="ind.id" class="indicator-item">
                <div class="ind-header">
                  <span class="ind-name">{{ ind.name }}</span>
                  <NTag :type="IND_STATUS_TAG[ind.status]">{{ Math.round(ind.completionRate) }}%</NTag>
                </div>
                <div class="ind-progress">
                  <div class="ind-progress-bar">
                    <div
                      class="ind-progress-fill"
                      :class="`fill-${ind.status}`"
                      :style="{ width: Math.min(100, ind.completionRate) + '%' }"
                    ></div>
                  </div>
                  <div class="ind-values">
                    <span>目标: {{ ind.targetValue }}{{ ind.targetUnit }}</span>
                    <span>实际: {{ ind.actualValue }}{{ ind.actualUnit }}</span>
                  </div>
                </div>
              </div>
            </div>
          </NCard>
        </div>
      </div>

      <div class="cockpit-row">
        <div class="cockpit-col col-12">
          <NCard class="cockpit-card" :bordered="false">
            <template #header>
              <div class="card-title">
                <IconifyIcon icon="lucide:clipboard-check" :size="16" />
                <span>管理履职分析</span>
              </div>
            </template>
            <div v-if="managementData" class="management-content">
              <div class="mgmt-kpi-row">
                <div
                  v-for="kpi in managementData.kpiMetrics"
                  :key="kpi.key"
                  class="mgmt-kpi-card"
                  :class="`mgmt-status-${kpi.status}`"
                >
                  <div class="mgmt-kpi-title">{{ kpi.title }}</div>
                  <div class="mgmt-kpi-value">
                    <span class="mk-val">{{ kpi.value }}</span>
                    <span class="mk-unit">{{ kpi.unit }}</span>
                  </div>
                  <div class="mgmt-kpi-target">目标: {{ kpi.target }}{{ kpi.unit }}</div>
                  <div class="mgmt-kpi-desc">{{ kpi.description }}</div>
                </div>
              </div>
              <div class="mgmt-detail-row">
                <div class="mgmt-chart-col">
                  <div class="sub-title">各网格级别巡查完成率</div>
                  <EchartsUI ref="inspectionChartRef" height="220px" />
                </div>
                <div class="mgmt-chart-col">
                  <div class="sub-title">隐患发现与整改闭环</div>
                  <EchartsUI ref="closureChartRef" height="220px" />
                </div>
              </div>
            </div>
          </NCard>
        </div>
      </div>
    </div>
  </HsePageLayout>
</template>

<script setup lang="ts">
import type { ExecutiveCockpitApi } from '#/api/hse/executive-cockpit';

import { h, onMounted, reactive, ref, nextTick, watch } from 'vue';
import { useRouter } from 'vue-router';

import {
  NButton,
  NCard,
  NDataTable,
  NEmpty,
  NRadioGroup,
  NRadioButton,
  NSelect,
  NTabPane,
  NTabs,
  NTag,
} from 'naive-ui';
import { IconifyIcon } from '@vben/icons';
import type { ECOption, EchartsUIType } from '@vben/plugins/echarts';
import { EchartsUI, useEcharts } from '@vben/plugins/echarts';

import {
  getExecutiveOverview,
  getOrgRanking,
  getRiskTrend,
  getIndicatorCompletion,
  getMajorRiskWarning,
  getManagementPerformance,
} from '#/api/hse/executive-cockpit';
import { HsePageLayout } from '#/components/hse';
import { message } from '#/adapter/naive';

// Canvas 无法解析 CSS 变量，option 颜色统一使用 hex
const tokens = {
  colorTextBase: '#1f1f1f',
  colorPrimary: '#1890ff',
  colorError: '#f5222d',
  colorWarning: '#faad14',
  colorSuccess: '#52c41a',
  colorBgElevated: '#ffffff',
  colorBorder: '#f0f0f0',
};

const router = useRouter();
const currentYear = new Date().getFullYear();
const yearOptions = [
  { label: `${currentYear}年`, value: currentYear },
  { label: `${currentYear - 1}年`, value: currentYear - 1 },
  { label: `${currentYear - 2}年`, value: currentYear - 2 },
];
const selectedYear = ref(currentYear);

const overviewData = ref<ExecutiveCockpitApi.OverviewData | null>(null);
const orgRankingData = ref<ExecutiveCockpitApi.OrgRankingData | null>(null);
const riskTrendData = ref<ExecutiveCockpitApi.RiskTrendData | null>(null);
const indicatorData = ref<ExecutiveCockpitApi.IndicatorCompletionData | null>(null);
const majorRiskData = ref<ExecutiveCockpitApi.MajorRiskWarningData | null>(null);
const managementData = ref<ExecutiveCockpitApi.ManagementPerformanceData | null>(null);

const rankingLevel = ref('department');
const activeTrendType = ref('employee');
const activeWarningTab = ref('orgs');

const trendChartRef = ref<EchartsUIType>();
const inspectionChartRef = ref<EchartsUIType>();
const closureChartRef = ref<EchartsUIType>();

// 性能优化：统一使用 @vben/plugins/echarts 的 useEcharts（按需注册组件，避免全量引入 echarts 主库）
const { renderEcharts: renderTrendChart } = useEcharts(trendChartRef);
const { renderEcharts: renderInspectionChart } = useEcharts(inspectionChartRef);
const { renderEcharts: renderClosureChart } = useEcharts(closureChartRef);

const loading = reactive({
  overview: false,
  orgRanking: false,
  riskTrend: false,
  indicator: false,
  majorRisk: false,
  management: false,
});

const IND_STATUS_TAG: Record<string, 'success' | 'info' | 'warning' | 'error' | 'default'> = {
  excellent: 'success',
  good: 'info',
  warning: 'warning',
  danger: 'error',
};

const STATUS_TAG_TYPE: Record<string, 'success' | 'warning' | 'error'> = {
  green: 'success',
  yellow: 'warning',
  red: 'error',
};

const rankingColumns = [
  {
    key: 'rank',
    title: '排名',
    width: 60,
    align: 'center' as const,
    render: (row: any) => h('span', { class: getRankClass(row.rank) }, String(row.rank)),
  },
  {
    key: 'orgName',
    title: '组织名称',
    width: 150,
    render: (row: any) =>
      h('span', { class: 'org-link', onClick: () => handleOrgClick(row) }, row.orgName),
  },
  {
    key: 'status',
    title: '状态',
    width: 70,
    align: 'center' as const,
    render: (row: any) =>
      h(
        NTag,
        { size: 'small', type: STATUS_TAG_TYPE[row.status] || 'default' },
        {
          default: () =>
            row.status === 'green' ? '绿区' : row.status === 'yellow' ? '黄区' : '红区',
        },
      ),
  },
  {
    key: 'overallScore',
    title: '得分',
    width: 70,
    align: 'center' as const,
    render: (row: any) => h('span', { class: getScoreClass(row.overallScore) }, String(row.overallScore)),
  },
  { key: 'grade', title: '等级', width: 70, align: 'center' as const },
  { key: 'accidentCount', title: '事故', width: 50, align: 'center' as const },
  { key: 'highRiskCount', title: '高风险', width: 60, align: 'center' as const },
];

function getRankClass(rank: number) {
  if (rank === 1) return 'rank-gold';
  if (rank === 2) return 'rank-silver';
  if (rank === 3) return 'rank-bronze';
  return '';
}

function getScoreClass(score: number) {
  if (score >= 90) return 'score-excellent';
  if (score >= 80) return 'score-good';
  if (score >= 70) return 'score-warning';
  return 'score-danger';
}

function handleYearChange() {
  fetchAllData();
}

function refreshData() {
  fetchAllData();
  message.success('数据已刷新');
}

function handleOrgClick(org: any) {
  message.info(`查看 ${org.orgName || org.deptName} 考核详情`);
}

function handleEmployeeClick(employeeId: number) {
  router.push(`/hse-advanced/risk-profile/${employeeId}`);
}

async function fetchOverview() {
  loading.overview = true;
  try {
    const res: any = await getExecutiveOverview(selectedYear.value);
    overviewData.value = res;
  } catch (e: any) {
    message.error(e.message || '获取总体态势数据失败');
  } finally {
    loading.overview = false;
  }
}

async function fetchOrgRanking() {
  loading.orgRanking = true;
  try {
    const res: any = await getOrgRanking(rankingLevel.value, selectedYear.value);
    orgRankingData.value = res;
  } catch (e: any) {
    message.error(e.message || '获取组织排名数据失败');
  } finally {
    loading.orgRanking = false;
  }
}

async function fetchRiskTrend() {
  loading.riskTrend = true;
  try {
    const res: any = await getRiskTrend(selectedYear.value);
    riskTrendData.value = res;
    await nextTick();
    initTrendChart();
  } catch (e: any) {
    message.error(e.message || '获取风险趋势数据失败');
  } finally {
    loading.riskTrend = false;
  }
}

async function fetchIndicator() {
  loading.indicator = true;
  try {
    const res: any = await getIndicatorCompletion(selectedYear.value);
    indicatorData.value = res;
  } catch (e: any) {
    message.error(e.message || '获取指标完成数据失败');
  } finally {
    loading.indicator = false;
  }
}

async function fetchMajorRisk() {
  loading.majorRisk = true;
  try {
    const res: any = await getMajorRiskWarning(selectedYear.value);
    majorRiskData.value = res;
  } catch (e: any) {
    message.error(e.message || '获取重大风险预警数据失败');
  } finally {
    loading.majorRisk = false;
  }
}

async function fetchManagement() {
  loading.management = true;
  try {
    const res: any = await getManagementPerformance(30);
    managementData.value = res;
    await nextTick();
    initManagementCharts();
  } catch (e: any) {
    message.error(e.message || '获取管理履职数据失败');
  } finally {
    loading.management = false;
  }
}

function initTrendChart() {
  if (!trendChartRef.value || !riskTrendData.value) return;

  let option: ECOption = {};

  if (activeTrendType.value === 'employee') {
    const data = riskTrendData.value.employeeRisk;
    option = {
      textStyle: { color: tokens.colorTextBase },
      tooltip: { trigger: 'axis', backgroundColor: tokens.colorBgElevated, textStyle: { color: tokens.colorTextBase } },
      legend: { data: ['平均风险分', '重大风险', '高风险'], bottom: 0 },
      grid: { left: '3%', right: '4%', bottom: '15%', top: '10%', containLabel: true },
      xAxis: { type: 'category', data: data.months, axisLabel: { fontSize: 11, color: tokens.colorTextBase }, axisLine: { lineStyle: { color: tokens.colorBorder } } },
      yAxis: [
        { type: 'value', name: '分数', position: 'left' },
        { type: 'value', name: '人数', position: 'right' },
      ],
      series: [
        {
          name: '平均风险分',
          type: 'line',
          smooth: true,
          data: data.avgScores,
          itemStyle: { color: tokens.colorPrimary },
          areaStyle: { opacity: 0.1 },
        },
        {
          name: '重大风险',
          type: 'bar',
          yAxisIndex: 1,
          data: data.majorCount,
          itemStyle: { color: tokens.colorError },
        },
        {
          name: '高风险',
          type: 'bar',
          yAxisIndex: 1,
          data: data.highCount,
          itemStyle: { color: tokens.colorWarning },
        },
      ],
    };
  } else if (activeTrendType.value === 'driver') {
    const data = riskTrendData.value.driverRisk;
    option = {
      textStyle: { color: tokens.colorTextBase },
      tooltip: { trigger: 'axis', backgroundColor: tokens.colorBgElevated, textStyle: { color: tokens.colorTextBase } },
      legend: { data: ['累计扣分', '扣分驾驶员数'], bottom: 0 },
      grid: { left: '3%', right: '4%', bottom: '15%', top: '10%', containLabel: true },
      xAxis: { type: 'category', data: data.months, axisLabel: { fontSize: 11, rotate: 30, color: tokens.colorTextBase }, axisLine: { lineStyle: { color: tokens.colorBorder } } },
      yAxis: [
        { type: 'value', name: '扣分', position: 'left' },
        { type: 'value', name: '人数', position: 'right' },
      ],
      series: [
        {
          name: '累计扣分',
          type: 'line',
          smooth: true,
          data: data.totalPoints,
          itemStyle: { color: tokens.colorWarning },
          areaStyle: { opacity: 0.1 },
        },
        {
          name: '扣分驾驶员数',
          type: 'bar',
          yAxisIndex: 1,
          data: data.driverCount,
          itemStyle: { color: tokens.colorPrimary },
        },
      ],
    };
  } else {
    const data = riskTrendData.value.accident;
    option = {
      textStyle: { color: tokens.colorTextBase },
      tooltip: { trigger: 'axis', backgroundColor: tokens.colorBgElevated, textStyle: { color: tokens.colorTextBase } },
      legend: { data: ['事故起数', '重大事故', '事故指数'], bottom: 0 },
      grid: { left: '3%', right: '4%', bottom: '15%', top: '10%', containLabel: true },
      xAxis: { type: 'category', data: data.periods, axisLabel: { fontSize: 11, color: tokens.colorTextBase }, axisLine: { lineStyle: { color: tokens.colorBorder } } },
      yAxis: [
        { type: 'value', name: '起数', position: 'left' },
        { type: 'value', name: '指数', position: 'right' },
      ],
      series: [
        {
          name: '事故起数',
          type: 'bar',
          data: data.accidentCount,
          itemStyle: { color: tokens.colorPrimary },
        },
        {
          name: '重大事故',
          type: 'bar',
          data: data.majorCount,
          itemStyle: { color: tokens.colorError },
        },
        {
          name: '事故指数',
          type: 'line',
          smooth: true,
          yAxisIndex: 1,
          data: data.weightedIndex,
          itemStyle: { color: tokens.colorWarning },
        },
      ],
    };
  }

  renderTrendChart(option);
}

function initManagementCharts() {
  if (!managementData.value) return;

  // 巡查完成率图
  if (inspectionChartRef.value) {
    const data = managementData.value.inspectionCompletion;
    renderInspectionChart({
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, backgroundColor: tokens.colorBgElevated, textStyle: { color: tokens.colorTextBase } },
      grid: { left: '3%', right: '4%', bottom: '3%', top: '10%', containLabel: true },
      xAxis: { type: 'category', data: data.map((d: any) => d.gridLevel) },
      yAxis: { type: 'value', max: 100, axisLabel: { formatter: '{value}%', color: tokens.colorTextBase }, splitLine: { lineStyle: { color: tokens.colorBorder } } },
      series: [
        {
          type: 'bar',
          data: data.map((d: any) => ({
            value: d.completionRate,
            itemStyle: {
              color: d.completionRate >= 90 ? tokens.colorSuccess : d.completionRate >= 70 ? tokens.colorWarning : tokens.colorError,
            },
          })),
          label: { show: true, position: 'top', formatter: '{c}%' },
          barWidth: '40%',
        },
      ],
    });
  }

  // 隐患发现与整改闭环图
  if (closureChartRef.value) {
    const data = managementData.value.byLevelPerformance;
    renderClosureChart({
      tooltip: { trigger: 'axis', backgroundColor: tokens.colorBgElevated, textStyle: { color: tokens.colorTextBase } },
      legend: { data: ['隐患发现率', '整改闭环率'], bottom: 0 },
      grid: { left: '3%', right: '4%', bottom: '15%', top: '10%', containLabel: true },
      xAxis: { type: 'category', data: data.map((d: any) => d.gridLevel) },
      yAxis: { type: 'value', max: 100, axisLabel: { formatter: '{value}%', color: tokens.colorTextBase }, splitLine: { lineStyle: { color: tokens.colorBorder } } },
      series: [
        {
          name: '隐患发现率',
          type: 'bar',
          data: data.map((d: any) => d.hazardDiscoveryRate),
          itemStyle: { color: tokens.colorPrimary },
          label: { show: true, position: 'top', formatter: '{c}%' },
        },
        {
          name: '整改闭环率',
          type: 'bar',
          data: data.map((d: any) => d.closureRate),
          itemStyle: { color: tokens.colorSuccess },
          label: { show: true, position: 'top', formatter: '{c}%' },
        },
      ],
    });
  }
}

watch(activeTrendType, () => {
  initTrendChart();
  initManagementCharts();
});

function fetchAllData() {
  Promise.all([
    fetchOverview(),
    fetchOrgRanking(),
    fetchRiskTrend(),
    fetchIndicator(),
    fetchMajorRisk(),
    fetchManagement(),
  ]);
}

onMounted(() => {
  fetchAllData();
  window.addEventListener('resize', () => {
    trendChartRef.value?.resize();
    inspectionChartRef.value?.resize();
    closureChartRef.value?.resize();
  });
});
</script>

<style lang="less" scoped>
.cockpit-container {
  max-width: 100%;
  margin: 0 auto;
}

.cockpit-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  padding: 24px;
  background: linear-gradient(135deg, #1890ff 0%, #096dd9 100%);
  border-radius: 12px;
  color: #fff;

  .header-left {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .header-icon {
    opacity: 0.9;
  }

  .header-title {
    font-size: 24px;
    font-weight: 700;
    margin: 0 0 6px 0;
  }

  .header-desc {
    font-size: 13px;
    opacity: 0.85;
    margin: 0;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 12px;
  }
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
  color: hsl(var(--foreground));
  margin-bottom: 12px;
  padding-left: 10px;
  border-left: 4px solid #1890ff;
}

.kpi-row {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 16px;
  margin-bottom: 20px;
}

.kpi-card {
  background: hsl(var(--card));
  border-radius: 10px;
  padding: 20px;
  position: relative;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  overflow: hidden;

  .kpi-label {
    font-size: 13px;
    color: hsl(var(--muted-foreground));
    margin-bottom: 8px;
  }

  .kpi-value {
    display: flex;
    align-items: baseline;
    gap: 4px;
    margin-bottom: 6px;

    .value-num {
      font-size: 28px;
      font-weight: 700;
      color: hsl(var(--foreground));
    }
    .value-unit {
      font-size: 14px;
      color: hsl(var(--muted-foreground));
    }
  }

  .kpi-desc {
    font-size: 12px;
    color: hsl(var(--muted-foreground));
  }

  .kpi-status-dot {
    position: absolute;
    top: 0;
    right: 0;
    width: 4px;
    height: 100%;
    border-radius: 0 10px 10px 0;
  }

  &.status-excellent .value-num { color: #52c41a; }
  &.status-good .value-num { color: #1890ff; }
  &.status-warning .value-num { color: #faad14; }
  &.status-danger .value-num { color: #f5222d; }

  .dot-excellent { background: #52c41a; }
  .dot-good { background: #1890ff; }
  .dot-warning { background: #faad14; }
  .dot-danger { background: #f5222d; }
}

.cockpit-row {
  display: flex;
  gap: 16px;
  margin-bottom: 20px;
}

.cockpit-col { flex-shrink: 0; }
.col-4 { flex: 0 0 33.333%; max-width: 33.333%; }
.col-8 { flex: 0 0 66.667%; max-width: 66.667%; }
.col-12 { flex: 0 0 100%; max-width: 100%; }

.cockpit-card {
  height: 100%;
  border-radius: 10px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.card-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: hsl(var(--foreground));
}

.ranking-level-selector {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;

  .status-legend {
    display: flex;
    gap: 12px;
    font-size: 12px;
    color: hsl(var(--muted-foreground));

    .legend-item {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .legend-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      &.green { background: #52c41a; }
      &.yellow { background: #faad14; }
      &.red { background: #f5222d; }
    }
  }
}

.ranking-stats {
  display: flex;
  gap: 16px;
  margin-bottom: 12px;
  padding: 10px 0;
  border-bottom: 1px solid hsl(var(--border));

  .stat-item {
    flex: 1;
    text-align: center;
    .stat-num {
      font-size: 20px;
      font-weight: 700;
    }
    .stat-label {
      font-size: 12px;
      color: hsl(var(--muted-foreground));
    }
    &.green .stat-num { color: #52c41a; }
    &.yellow .stat-num { color: #faad14; }
    &.red .stat-num { color: #f5222d; }
  }
}

.ranking-table :deep(.n-data-table-thead > tr > th) {
  background: hsl(var(--muted));
  font-weight: 600;
}

.rank-gold, .rank-silver, .rank-bronze {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  color: #fff;
  font-weight: 700;
  font-size: 12px;
}
.rank-gold { background: linear-gradient(135deg, #ffd700, #ffb700); }
.rank-silver { background: linear-gradient(135deg, #c0c0c0, #a8a8a8); }
.rank-bronze { background: linear-gradient(135deg, #cd7f32, #b87333); }

.score-excellent { color: #52c41a; font-weight: 700; }
.score-good { color: #1890ff; font-weight: 600; }
.score-warning { color: #faad14; font-weight: 600; }
.score-danger { color: #f5222d; font-weight: 700; }

.org-link {
  color: #1890ff;
  cursor: pointer;
  &:hover { text-decoration: underline; }
}

.warning-stats {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  margin-bottom: 12px;

  .warning-stat {
    text-align: center;
    padding: 12px 8px;
    border-radius: 8px;
    background: hsl(var(--muted));

    .ws-num {
      font-size: 22px;
      font-weight: 700;
    }
    .ws-label {
      font-size: 12px;
      color: hsl(var(--muted-foreground));
      margin-top: 2px;
    }
    &.danger .ws-num { color: #f5222d; }
    &.warning .ws-num { color: #faad14; }
  }
}

.warning-tabs {
  margin-top: 8px;
}

.warning-list {
  max-height: 280px;
  overflow-y: auto;
}

.warning-item {
  padding: 10px 0;
  border-bottom: 1px solid hsl(var(--border));

  &:last-child { border-bottom: none; }
  &.clickable { cursor: pointer; }
  &.clickable:hover { background: hsl(var(--muted)); margin: 0 -8px; padding: 10px 8px; border-radius: 4px; }

  .wi-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;

    .wi-title {
      font-size: 13px;
      font-weight: 500;
      color: hsl(var(--foreground));
    }
  }

  .wi-reasons {
    font-size: 12px;
    color: hsl(var(--muted-foreground));
    line-height: 1.6;

    .wi-reason {
      display: inline-block;
      margin-right: 8px;
    }
  }

  .wi-meta {
    font-size: 12px;
    color: hsl(var(--muted-foreground));
    display: flex;
    gap: 8px;
  }
}

.trend-tabs {
  margin-bottom: 12px;
}

.trend-chart {
  height: 300px;
}

.indicator-summary {
  display: flex;
  justify-content: space-around;
  margin-bottom: 16px;
  padding: 12px 0;
  border-bottom: 1px solid hsl(var(--border));

  .ind-summary-item {
    text-align: center;
  }

  .ind-circle svg {
    width: 100px;
    height: 100px;
  }

  .circle-num {
    font-size: 18px;
    font-weight: 700;
    fill: hsl(var(--foreground));
  }
  .circle-label {
    font-size: 11px;
    fill: hsl(var(--muted-foreground));
  }
}

.indicator-list {
  .indicator-item {
    padding: 10px 0;
    border-bottom: 1px solid #f5f5f5;

    &:last-child { border-bottom: none; }

    .ind-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;

      .ind-name {
        font-size: 13px;
        color: hsl(var(--foreground));
      }
    }

    .ind-progress {
      .ind-progress-bar {
        height: 6px;
        background: hsl(var(--border));
        border-radius: 3px;
        overflow: hidden;
        margin-bottom: 4px;

        .ind-progress-fill {
          height: 100%;
          border-radius: 3px;
          transition: width 0.3s;
        }
        .fill-excellent { background: #52c41a; }
        .fill-good { background: #1890ff; }
        .fill-warning { background: #faad14; }
        .fill-danger { background: #f5222d; }
      }

      .ind-values {
        display: flex;
        justify-content: space-between;
        font-size: 11px;
        color: hsl(var(--muted-foreground));
      }
    }
  }
}

.management-content {
  .mgmt-kpi-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
    margin-bottom: 20px;
  }

  .mgmt-kpi-card {
    padding: 16px;
    border-radius: 8px;
    border-left: 4px solid #1890ff;
    background: hsl(var(--muted));

    .mgmt-kpi-title {
      font-size: 13px;
      color: hsl(var(--muted-foreground));
      margin-bottom: 8px;
    }

    .mgmt-kpi-value {
      display: flex;
      align-items: baseline;
      gap: 4px;
      margin-bottom: 4px;

      .mk-val {
        font-size: 26px;
        font-weight: 700;
        color: hsl(var(--foreground));
      }
      .mk-unit {
        font-size: 13px;
        color: hsl(var(--muted-foreground));
      }
    }

    .mgmt-kpi-target {
      font-size: 12px;
      color: hsl(var(--muted-foreground));
      margin-bottom: 4px;
    }

    .mgmt-kpi-desc {
      font-size: 12px;
      color: hsl(var(--muted-foreground));
    }

    &.mgmt-status-excellent { border-left-color: #52c41a; .mk-val { color: #52c41a; } }
    &.mgmt-status-good { border-left-color: #1890ff; .mk-val { color: #1890ff; } }
    &.mgmt-status-warning { border-left-color: #faad14; .mk-val { color: #faad14; } }
    &.mgmt-status-danger { border-left-color: #f5222d; .mk-val { color: #f5222d; } }
  }

  .mgmt-detail-row {
    display: flex;
    gap: 20px;

    .mgmt-chart-col {
      flex: 1;
    }

    .sub-title {
      font-size: 13px;
      font-weight: 600;
      color: hsl(var(--foreground));
      margin-bottom: 8px;
    }

    .mgmt-chart {
      height: 220px;
    }
  }
}

@media (max-width: 1200px) {
  .kpi-row {
    grid-template-columns: repeat(3, 1fr);
  }
  .cockpit-row {
    flex-direction: column;
  }
  .col-4, .col-8, .col-12 {
    flex: 0 0 100%;
    max-width: 100%;
  }
}
</style>
