<script lang="ts" setup>
/**
 * 扣分原因分析（web-naive）
 * 从 web-antd 1:1 移植：Tabs/Table → NTabs/NDataTable(render)；
 * 两个 ECharts 饼图用 LOCAL tokens 常量 + useEcharts(render) 模式。
 */
import type { AssessmentAnalysisApi } from '#/api/hse/assessment-analysis';
import type { DataTableColumns } from 'naive-ui';
import type { ECOption, EchartsUIType } from '@vben/plugins/echarts';
import { EchartsUI, useEcharts } from '@vben/plugins/echarts';
import { IconifyIcon } from '@vben/icons';
import { computed, h, onMounted, ref, watch } from 'vue';

import { NCard, NDataTable, NEmpty, NStatistic, NTabPane, NTabs, NTag } from 'naive-ui';

defineOptions({ name: 'DeductionAnalysis' });

type ReasonItem = AssessmentAnalysisApi.ReasonAnalysisItem;
type DeptItem = AssessmentAnalysisApi.DepartmentDeductionItem;
type PersonItem = AssessmentAnalysisApi.PersonDeductionItem;

const props = defineProps<{
  data: AssessmentAnalysisApi.DeductionData;
}>();

// Canvas 无法解析 CSS 变量，颜色必须用 hex 字符串
const tokens = {
  colorTextBase: '#1f1f1f',
  colorPrimary: '#1890ff',
  colorError: '#f5222d',
  colorWarning: '#faad14',
  colorSuccess: '#52c41a',
  colorBgElevated: '#ffffff',
  colorBorder: '#f0f0f0',
  colorBgContainer: '#ffffff',
};

const activeTab = ref('reason');
const reasonRef = ref<EchartsUIType>();
const rectRef = ref<EchartsUIType>();
const { renderEcharts: renderReason, resize: resizeReason } = useEcharts(reasonRef);
const { renderEcharts: renderRect, resize: resizeRect } = useEcharts(rectRef);

function getSeverityType(severity: string): 'error' | 'warning' | 'info' | 'default' {
  const map: Record<string, 'error' | 'warning' | 'info' | 'default'> = {
    重大: 'error',
    较大: 'warning',
    一般: 'warning',
    轻微: 'info',
  };
  return map[severity] || 'default';
}

const reasonColumns: DataTableColumns<ReasonItem> = [
  { title: '原因类别', key: 'reasonType', width: 120 },
  { title: '具体原因', key: 'subReason', width: 180 },
  { title: '次数', key: 'count', width: 80, align: 'center' },
  { title: '扣分数', key: 'deductionPoints', width: 100, align: 'center' },
  {
    title: '严重程度',
    key: 'severity',
    width: 100,
    align: 'center',
    render: (row) =>
      h(NTag, { type: getSeverityType(row.severity), size: 'small', bordered: false }, { default: () => row.severity }),
  },
];

const deptColumns: DataTableColumns<DeptItem> = [
  { title: '部门名称', key: 'deptName', width: 150 },
  { title: '事故次数', key: 'accidentCount', width: 100, align: 'center' },
  { title: '三违次数', key: 'violationCount', width: 100, align: 'center' },
  { title: '逾期整改', key: 'overdueCount', width: 100, align: 'center' },
  {
    title: '总扣分',
    key: 'totalDeduction',
    width: 100,
    align: 'center',
    render: (row) => h('span', { class: 'deduction-points danger' }, String(row.totalDeduction)),
  },
];

const personColumns: DataTableColumns<PersonItem> = [
  { title: '人员姓名', key: 'employeeName', width: 100 },
  { title: '工号', key: 'employeeCode', width: 100 },
  { title: '岗位', key: 'positionName', width: 100 },
  { title: '所属部门', key: 'deptName', width: 120 },
  { title: '事故次数', key: 'accidentCount', width: 80, align: 'center' },
  { title: '三违次数', key: 'violationCount', width: 80, align: 'center' },
  { title: '扣分次数', key: 'demeritCount', width: 80, align: 'center' },
  {
    title: '总扣分',
    key: 'totalDeduction',
    width: 100,
    align: 'center',
    render: (row) =>
      h('span', { class: row.totalDeduction > 0 ? 'deduction-points danger' : 'deduction-points' }, String(row.totalDeduction)),
  },
];

const reasonOption = computed<ECOption>(() => {
  const grouped = props.data.reasonAnalysis.reduce(
    (acc, item) => {
      acc[item.reasonType] = (acc[item.reasonType] || 0) + item.deductionPoints;
      return acc;
    },
    {} as Record<string, number>,
  );

  const categories = Object.keys(grouped);
  const values = Object.values(grouped);

  return {
    tooltip: {
      trigger: 'item',
      backgroundColor: tokens.colorBgElevated,
      textStyle: { color: tokens.colorTextBase },
      formatter: '{b}: {c} 分',
    },
    legend: {
      bottom: 0,
      textStyle: { color: tokens.colorTextBase },
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
          borderWidth: 2,
        },
        label: { show: false },
        emphasis: {
          label: { show: true, fontSize: 14, fontWeight: 'bold' },
        },
        labelLine: { show: false },
        data: categories.map((cat, idx) => ({
          value: values[idx],
          name: cat,
          itemStyle: {
            color: [tokens.colorError, tokens.colorWarning, tokens.colorPrimary, tokens.colorSuccess, tokens.colorPrimary][idx % 5],
          },
        })),
      },
    ],
  };
});

const rectOption = computed<ECOption>(() => {
  const { completed, inProgress, overdue, pending } = props.data.rectificationStatus;

  return {
    tooltip: {
      trigger: 'item',
      backgroundColor: tokens.colorBgElevated,
      textStyle: { color: tokens.colorTextBase },
      formatter: '{b}: {c} 项 ({d}%)',
    },
    legend: {
      bottom: 0,
      textStyle: { color: tokens.colorTextBase },
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
          borderWidth: 2,
        },
        label: { show: false },
        labelLine: { show: false },
      },
    ],
  };
});

onMounted(() => {
  if (reasonRef.value) renderReason(reasonOption.value);
  if (rectRef.value) renderRect(rectOption.value);
  window.addEventListener('resize', resizeReason);
  window.addEventListener('resize', resizeRect);
});

watch(
  () => props.data,
  () => {
    if (reasonRef.value) renderReason(reasonOption.value);
    if (rectRef.value) renderRect(rectOption.value);
  },
  { deep: true },
);
</script>

<template>
  <div class="deduction-analysis">
    <NTabs v-model:value="activeTab" type="line">
      <NTabPane name="reason" tab="扣分原因分析">
        <div class="reason-chart">
          <EchartsUI v-if="data.reasonAnalysis.length" ref="reasonRef" style="width: 100%; height: 200px" />
          <NEmpty v-else description="暂无数据" />
        </div>
        <NDataTable
          :columns="reasonColumns"
          :data="data.reasonAnalysis"
          :pagination="false"
          size="small"
          :scroll-x="600"
        />
      </NTabPane>
      <NTabPane name="department" tab="责任单位">
        <NDataTable
          :columns="deptColumns"
          :data="data.departmentDeduction"
          :pagination="false"
          size="small"
          :scroll-x="600"
        />
      </NTabPane>
      <NTabPane name="person" tab="责任人员">
        <NDataTable
          :columns="personColumns"
          :data="data.personDeduction"
          :pagination="false"
          size="small"
          :scroll-x="700"
        />
      </NTabPane>
      <NTabPane name="rectification" tab="整改情况">
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <NCard size="small" :bordered="false">
            <div class="stat-row"><IconifyIcon icon="lucide:clipboard-list" /><NStatistic label="总任务" :value="data.rectificationStatus.total" /></div>
          </NCard>
          <NCard size="small" :bordered="false">
            <div class="stat-row"><IconifyIcon icon="lucide:check-circle" /><NStatistic label="已完成" :value="data.rectificationStatus.completed" /></div>
          </NCard>
          <NCard size="small" :bordered="false">
            <div class="stat-row"><IconifyIcon icon="lucide:clock" /><NStatistic label="进行中" :value="data.rectificationStatus.inProgress" /></div>
          </NCard>
          <NCard size="small" :bordered="false">
            <div class="stat-row"><IconifyIcon icon="lucide:alert-triangle" /><NStatistic label="已逾期" :value="data.rectificationStatus.overdue" /></div>
          </NCard>
          <NCard size="small" :bordered="false">
            <div class="stat-row"><IconifyIcon icon="lucide:circle" /><NStatistic label="待处理" :value="data.rectificationStatus.pending" /></div>
          </NCard>
        </div>
        <EchartsUI ref="rectRef" style="width: 100%; height: 220px" />
      </NTabPane>
    </NTabs>
  </div>
</template>

<style scoped>
.deduction-analysis :deep(.deduction-points) {
  font-weight: 600;
  color: hsl(var(--warning));
}

.deduction-analysis :deep(.deduction-points.danger) {
  color: hsl(var(--error));
}

.stat-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
