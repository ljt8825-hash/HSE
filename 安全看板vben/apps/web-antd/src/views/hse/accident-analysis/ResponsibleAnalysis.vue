<template>
  <div class="responsible-analysis">
    <Row :gutter="[16, 16]" class="mb-4">
      <Col :xs="24" :lg="12">
        <Typography.Text strong>岗位分布</Typography.Text>
        <div class="chart-panel">
          <EchartsUI ref="positionChartRef" style="width: 100%; height: 220px" />
          <Empty v-if="!hasPositionData" class="chart-empty" description="暂无责任事故数据" />
        </div>
      </Col>
      <Col :xs="24" :lg="12">
        <Typography.Text strong>部门分布</Typography.Text>
        <div class="chart-panel">
          <EchartsUI ref="deptChartRef" style="width: 100%; height: 220px" />
          <Empty v-if="!hasDepartmentData" class="chart-empty" description="暂无责任事故数据" />
        </div>
      </Col>
    </Row>

    <Typography.Text strong>责任人员TOP排行</Typography.Text>
    <List v-if="topResponsible.length > 0" :data-source="topResponsible" size="small" class="mb-4">
      <template #renderItem="{ item, index }">
        <ListItem>
          <ListItemMeta :title="item.personName" :description="`事故 ${item.accidentCount} 起 · 责任 ${item.responsibleCount} 起${item.casualties > 0 ? ` · 伤亡 ${item.casualties}` : ''}`">
            <template #avatar><Badge :count="index + 1" /></template>
          </ListItemMeta>
          <template #actions>
            <Button v-if="linkedEmployeeMap.has(item.personName)" type="link" size="small" @click="$emit('employee-click', linkedEmployeeMap.get(item.personName)!)">
              <template #icon><IconifyIcon icon="lucide:external-link" /></template>
              风险画像
            </Button>
          </template>
        </ListItem>
      </template>
    </List>
    <Empty v-else description="暂无数据" class="mb-4" />

    <Typography.Text strong>事故关联人员（可跳转风险画像）</Typography.Text>
    <List v-if="linkedEmployees.length > 0" :data-source="linkedEmployees" :loading="loading" size="small">
      <template #renderItem="{ item }">
        <ListItem class="employee-item" @click="$emit('employee-click', item.employeeId)">
          <ListItemMeta :title="item.name" :description="`${item.positionName || '-'} · ${item.orgName || '-'}`">
            <template #avatar><Avatar><template #icon><IconifyIcon icon="lucide:user" /></template></Avatar></template>
          </ListItemMeta>
          <template #actions>
            <Space>
              <Statistic title="事故" :value="item.accidentCount" />
              <Statistic title="责任" :value="item.responsibleCount" />
              <IconifyIcon icon="lucide:chevron-right" />
            </Space>
          </template>
        </ListItem>
      </template>
    </List>
    <Empty v-else-if="!loading" description="暂无数据" />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { Avatar, Badge, Button, Col, Empty, List, ListItem, ListItemMeta, Row, Space, Statistic, Typography } from 'ant-design-vue';
import { useAntdDesignTokens } from '@vben/hooks';
import { IconifyIcon } from '@vben/icons';
import type { EchartsUIType } from '@vben/plugins/echarts';

import { EchartsUI, useEcharts } from '@vben/plugins/echarts';
import type { AccidentAnalysisApi } from '#/api/hse/accident-analysis';

const props = defineProps<{
  data: AccidentAnalysisApi.ResponsibleData | null;
  loading: boolean;
}>();

defineEmits<{
  (e: 'employee-click', employeeId: number): void;
}>();

const positionChartRef = ref<EchartsUIType>();
const deptChartRef = ref<EchartsUIType>();
const { renderEcharts: renderPositionChart } = useEcharts(positionChartRef);
const { renderEcharts: renderDeptChart } = useEcharts(deptChartRef);
const { tokens } = useAntdDesignTokens();

const topResponsible = computed(() => props.data?.topResponsible || []);
const linkedEmployees = computed(() => props.data?.linkedEmployees?.list || []);
const hasPositionData = computed(() =>
  props.data?.positionDistribution?.some(item => item.responsibleCount > 0) ?? false,
);
const hasDepartmentData = computed(() =>
  props.data?.departmentDistribution?.some(item => item.responsibleCount > 0) ?? false,
);

// 建立 personName -> employeeId 映射，用于TOP列表跳转
const linkedEmployeeMap = computed(() => {
  const map = new Map<string, number>();
  linkedEmployees.value.forEach(emp => {
    map.set(emp.name, emp.employeeId);
  });
  return map;
});

const positionChartOption = computed<Parameters<ReturnType<typeof useEcharts>['renderEcharts']>[0]>(() => {
  const positionDistribution = props.data?.positionDistribution;
  if (!hasPositionData.value || !positionDistribution) {
    return { series: [] };
  }
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: '3%', right: '4%', bottom: '3%', top: '8%', containLabel: true },
    xAxis: {
      type: 'value',
      axisLabel: { fontSize: 11, color: tokens.colorTextBase },
      splitLine: { lineStyle: { color: tokens.colorBorder, type: 'dashed' } },
    },
    yAxis: {
      type: 'category',
      data: positionDistribution.map(p => p.positionName).reverse(),
      axisLabel: { fontSize: 11, color: tokens.colorTextBase },
    },
    series: [
      {
        type: 'bar',
        data: positionDistribution.map(p => p.responsibleCount).reverse(),
        itemStyle: { color: tokens.colorWarning, borderRadius: [0, 4, 4, 0] },
        barWidth: '50%',
      },
    ],
  };
});

const deptChartOption = computed<Parameters<ReturnType<typeof useEcharts>['renderEcharts']>[0]>(() => {
  const departmentDistribution = props.data?.departmentDistribution;
  if (!hasDepartmentData.value || !departmentDistribution) {
    return { series: [] };
  }
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: '3%', right: '4%', bottom: '3%', top: '8%', containLabel: true },
    xAxis: {
      type: 'value',
      axisLabel: { fontSize: 11, color: tokens.colorTextBase },
      splitLine: { lineStyle: { color: tokens.colorBorder, type: 'dashed' } },
    },
    yAxis: {
      type: 'category',
      data: departmentDistribution.map(d => d.departmentName).reverse(),
      axisLabel: { fontSize: 11, color: tokens.colorTextBase },
    },
    series: [
      {
        type: 'bar',
        data: departmentDistribution.map(d => d.responsibleCount).reverse(),
        itemStyle: { color: tokens.colorPrimary, borderRadius: [0, 4, 4, 0] },
        barWidth: '50%',
      },
    ],
  };
});

watch([() => props.data, tokens], () => {
  nextTick(() => {
    renderPositionChart(positionChartOption.value);
    renderDeptChart(deptChartOption.value);
  });
}, { deep: true });

onMounted(() => {
  nextTick(() => {
    renderPositionChart(positionChartOption.value);
    renderDeptChart(deptChartOption.value);
  });
});
</script>

<style lang="less" scoped>
.responsible-analysis {
  .chart-panel {
    position: relative;
    min-height: 252px;
  }

  .chart-empty {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0;
  }

  :deep(.ant-list-item-meta) {
    min-width: 0;
  }

  :deep(.ant-list-item-action) {
    margin-left: 16px;
  }
}
</style>

<!-- 设计系统对齐：保留 :deep(.ant-list-item-meta{min-width:0}) 与 :deep(.ant-list-item-action{margin-left:16px}) —— 纯列表项布局调整，主题无关，不影响主题色切换 -->

