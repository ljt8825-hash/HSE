<template>
  <div class="deduction-analysis">
    <div class="deduction-tabs">
      <a-tabs v-model:activeKey="activeTab" @change="handleTabChange">
        <a-tab-pane key="reason" tab="扣分原因分析">
          <div class="reason-chart">
            <EchartsUI v-if="data.reasonAnalysis.length" ref="reasonChartRef" style="width: 100%; height: 200px" />
            <Empty v-else description="暂无数据" />
          </div>
          <a-table :columns="reasonColumns" :data-source="data.reasonAnalysis" :pagination="false" row-key="subReason">
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'severity'">
                <a-tag :color="getSeverityColor(record.severity)">{{ record.severity }}</a-tag>
              </template>
              <template v-if="column.key === 'deductionPoints'">
                <span class="deduction-points">{{ record.deductionPoints }}</span>
              </template>
            </template>
          </a-table>
        </a-tab-pane>
        <a-tab-pane key="department" tab="责任单位">
          <a-table :columns="deptColumns" :data-source="data.departmentDeduction" :pagination="false" row-key="deptName">
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'totalDeduction'">
                <span class="deduction-points danger">{{ record.totalDeduction }}</span>
              </template>
            </template>
          </a-table>
        </a-tab-pane>
        <a-tab-pane key="person" tab="责任人员">
          <a-table :columns="personColumns" :data-source="data.personDeduction" :pagination="false" row-key="employeeId">
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'totalDeduction'">
                <span class="deduction-points" :class="{ danger: record.totalDeduction > 0 }">{{ record.totalDeduction }}</span>
              </template>
            </template>
          </a-table>
        </a-tab-pane>
        <a-tab-pane key="rectification" tab="整改情况">
          <Row :gutter="[16, 16]" class="rectification-stats">
            <Col :xs="12" :sm="8" :lg="4"><Statistic title="总任务" :value="data.rectificationStatus.total"><template #prefix><IconifyIcon icon="lucide:clipboard-list" /></template></Statistic></Col>
            <Col :xs="12" :sm="8" :lg="4"><Statistic title="已完成" :value="data.rectificationStatus.completed" :value-style="{ color: 'hsl(var(--success))' }"><template #prefix><IconifyIcon icon="lucide:check-circle" /></template></Statistic></Col>
            <Col :xs="12" :sm="8" :lg="4"><Statistic title="进行中" :value="data.rectificationStatus.inProgress" :value-style="{ color: 'hsl(var(--primary))' }"><template #prefix><IconifyIcon icon="lucide:clock" /></template></Statistic></Col>
            <Col :xs="12" :sm="8" :lg="4"><Statistic title="已逾期" :value="data.rectificationStatus.overdue" :value-style="{ color: 'hsl(var(--error))' }"><template #prefix><IconifyIcon icon="lucide:alert-triangle" /></template></Statistic></Col>
            <Col :xs="12" :sm="8" :lg="4"><Statistic title="待处理" :value="data.rectificationStatus.pending"><template #prefix><IconifyIcon icon="lucide:circle" /></template></Statistic></Col>
          </Row>
          <EchartsUI ref="rectPieChartRef" style="width: 100%; height: 220px" />
        </a-tab-pane>
      </a-tabs>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { Col, Empty, Row, Statistic } from 'ant-design-vue';
import { useAntdDesignTokens } from '@vben/hooks';
import { IconifyIcon } from '@vben/icons';
import type { EchartsUIType } from '@vben/plugins/echarts';
import { EchartsUI, useEcharts } from '@vben/plugins/echarts';
import type { AssessmentAnalysisApi } from '#/api/hse/assessment-analysis';

const props = defineProps<{
  data: AssessmentAnalysisApi.DeductionData;
}>();

const activeTab = ref('reason');
const reasonChartRef = ref<EchartsUIType>();
const rectPieChartRef = ref<EchartsUIType>();
const { renderEcharts: renderReasonChart } = useEcharts(reasonChartRef);
const { renderEcharts: renderRectPieChart } = useEcharts(rectPieChartRef);
const { tokens } = useAntdDesignTokens();

function handleTabChange(key: string) {
  activeTab.value = key;
  if (key === 'rectification') {
    initRectPieChart();
  }
}

function getSeverityColor(severity: string): string {
  const colors: Record<string, string> = {
    '重大': 'red',
    '较大': 'orange',
    '一般': 'gold',
    '轻微': 'blue',
  };
  return colors[severity] || 'default';
}

const reasonColumns = [
  { key: 'reasonType', title: '原因类别', width: 120 },
  { key: 'subReason', title: '具体原因', width: 180 },
  { key: 'count', title: '次数', width: 80, align: 'center' },
  { key: 'deductionPoints', title: '扣分数', width: 100, align: 'center' },
  { key: 'severity', title: '严重程度', width: 100, align: 'center' },
];

const deptColumns = [
  { key: 'deptName', title: '部门名称', width: 150 },
  { key: 'accidentCount', title: '事故次数', width: 100, align: 'center' },
  { key: 'violationCount', title: '三违次数', width: 100, align: 'center' },
  { key: 'overdueCount', title: '逾期整改', width: 100, align: 'center' },
  { key: 'totalDeduction', title: '总扣分', width: 100, align: 'center' },
];

const personColumns = [
  { key: 'employeeName', title: '人员姓名', width: 100 },
  { key: 'employeeCode', title: '工号', width: 100 },
  { key: 'positionName', title: '岗位', width: 100 },
  { key: 'deptName', title: '所属部门', width: 120 },
  { key: 'accidentCount', title: '事故次数', width: 80, align: 'center' },
  { key: 'violationCount', title: '三违次数', width: 80, align: 'center' },
  { key: 'demeritCount', title: '扣分次数', width: 80, align: 'center' },
  { key: 'totalDeduction', title: '总扣分', width: 100, align: 'center' },
];

function initReasonChart() {
  const grouped = props.data.reasonAnalysis.reduce((acc, item) => {
    acc[item.reasonType] = (acc[item.reasonType] || 0) + item.deductionPoints;
    return acc;
  }, {} as Record<string, number>);

  const categories = Object.keys(grouped);
  const values = Object.values(grouped);

  renderReasonChart({
    tooltip: {
      trigger: 'item',
      backgroundColor: tokens.colorBgElevated,
      textStyle: { color: tokens.colorTextBase },
      formatter: '{b}: {c} 分'
    },
    legend: {
      bottom: 0,
      textStyle: { color: tokens.colorTextBase }
    },
    series: [
      {
        name: '扣分原因',
        type: 'pie',
        radius: ['40%', '70%'],
        avoidLabelOverlap: false,
        itemStyle: {
          borderRadius: 4,
          borderColor: tokens.colorBgContainer,
          borderWidth: 2
        },
        label: {
          show: false
        },
        emphasis: {
          label: {
            show: true,
            fontSize: 14,
            fontWeight: 'bold'
          }
        },
        labelLine: {
          show: false
        },
        data: categories.map((cat, idx) => ({
          value: values[idx],
          name: cat,
          itemStyle: {
            color: [tokens.colorError, tokens.colorWarning, tokens.colorPrimary, tokens.colorSuccess, tokens.colorPrimary][idx % 5]
          }
        }))
      }
    ]
  });
}

function initRectPieChart() {
  const { completed, inProgress, overdue, pending } = props.data.rectificationStatus;

  renderRectPieChart({
    tooltip: {
      trigger: 'item',
      backgroundColor: tokens.colorBgElevated,
      textStyle: { color: tokens.colorTextBase },
      formatter: '{b}: {c} 项 ({d}%)'
    },
    legend: {
      bottom: 0,
      textStyle: { color: tokens.colorTextBase }
    },
    series: [
      {
        name: '整改状态',
        type: 'pie',
        radius: ['40%', '70%'],
        data: [
          { value: completed, name: '已完成', itemStyle: { color: tokens.colorSuccess } },
          { value: inProgress, name: '进行中', itemStyle: { color: tokens.colorPrimary } },
          { value: overdue, name: '已逾期', itemStyle: { color: tokens.colorError } },
          { value: pending, name: '待处理', itemStyle: { color: tokens.colorBorder } },
        ],
        itemStyle: {
          borderRadius: 4,
          borderColor: tokens.colorBgContainer,
          borderWidth: 2
        },
        label: { show: false },
        labelLine: { show: false }
      }
    ]
  });
}

onMounted(() => {
  initReasonChart();
});

watch([() => props.data, tokens], () => {
  initReasonChart();
  if (activeTab.value === 'rectification') {
    initRectPieChart();
  }
}, { deep: true });
</script>

<style lang="less" scoped>
.deduction-analysis {
  .deduction-tabs {
    :deep(.ant-tabs-nav) {
      margin-bottom: 16px;
    }

    :deep(.ant-table-thead > tr > th) {
      background: hsl(var(--muted));
      font-weight: 600;
    }

    .deduction-points {
      font-weight: 600;
      color: hsl(var(--warning));

      &.danger {
        color: hsl(var(--error));
      }
    }

    .rectification-stats {
      margin-bottom: 20px;
    }
  }
}
</style>

<!-- 设计系统对齐：保留 :deep(.ant-tabs-nav{margin-bottom}) 与 :deep(.ant-table-thead>tr>th{background:hsl(var(--muted))}) —— 表头背景已用语义变量；间距为布局调整 -->

