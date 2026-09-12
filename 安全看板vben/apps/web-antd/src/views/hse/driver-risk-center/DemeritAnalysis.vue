<template>
  <div class="demerit-analysis">
    <Row :gutter="[16, 16]" class="mb-4">
      <Col :xs="12" :sm="6"><Statistic title="扣分人数" :value="data?.overall?.demeritDriverCount || 0" /></Col>
      <Col :xs="12" :sm="6"><Statistic title="扣分次数" :value="data?.overall?.demeritTotalCount || 0" /></Col>
      <Col :xs="12" :sm="6"><Statistic title="累计扣分" :value="data?.overall?.totalPoints || 0" :value-style="{ color: 'hsl(var(--warning))' }" /></Col>
      <Col :xs="12" :sm="6"><Statistic title="单次平均" :value="data?.overall?.avgPointsPerRecord || 0" /></Col>
    </Row>

    <Row :gutter="[16, 16]">
      <Col :xs="24" :lg="14">
        <div class="section-title">扣分分布</div>
        <EchartsUI v-if="data?.pointsDistribution?.length" ref="chartRef" style="width: 100%; height: 200px" />
        <Empty v-else description="暂无数据" />
      </Col>
      <Col :xs="24" :lg="10">
        <div class="section-title">TOP扣分驾驶员</div>
        <List v-if="topDrivers.length" :data-source="topDrivers" size="small">
          <template #renderItem="{ item, index }">
            <ListItem class="top-item" @click="$emit('driver-click', item.employeeId)">
              <ListItemMeta :title="item.name" :description="item.positionName">
                <template #avatar><Badge :count="index + 1" /></template>
              </ListItemMeta>
              <template #actions><strong class="points-value">{{ item.totalPoints }} 分</strong></template>
            </ListItem>
          </template>
        </List>
        <Empty v-else description="暂无数据" />
      </Col>
    </Row>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { Badge, Col, Empty, List, ListItem, ListItemMeta, Row, Statistic } from 'ant-design-vue';
import type { EchartsUIType } from '@vben/plugins/echarts';

import { useAntdDesignTokens } from '@vben/hooks';
import { EchartsUI, useEcharts } from '@vben/plugins/echarts';
import type { DriverRiskCenterApi } from '#/api/hse/driver-risk-center';

const props = defineProps<{
  data: DriverRiskCenterApi.DemeritStatisticsData | null;
}>();

defineEmits<{
  (e: 'driver-click', employeeId: number): void;
}>();

const chartRef = ref<EchartsUIType>();
const { renderEcharts } = useEcharts(chartRef);
const { tokens } = useAntdDesignTokens();

const topDrivers = computed(() => props.data?.topDrivers || []);

const chartOption = computed<Parameters<ReturnType<typeof useEcharts>['renderEcharts']>[0]>(() => {
  if (!props.data?.pointsDistribution || props.data.pointsDistribution.length === 0) {
    return {
      title: {
        text: '暂无数据',
        left: 'center',
        top: 'center',
        textStyle: { color: tokens.colorTextBase, fontSize: 12, fontWeight: 'normal' },
      },
      series: [],
    };
  }

  return {
    tooltip: {
      trigger: 'item',
      backgroundColor: tokens.colorBgElevated,
      textStyle: { color: tokens.colorTextBase },
      formatter: '{b}: {c}次 ({d}%)',
    },
    series: [
      {
        type: 'pie',
        radius: ['40%', '65%'],
        center: ['50%', '50%'],
        label: {
          show: true,
          fontSize: 11,
          formatter: '{b}\n{d}%',
        },
        labelLine: {
          length: 10,
          length2: 8,
        },
        data: props.data.pointsDistribution.map((item, index) => ({
          name: item.range,
          value: item.count,
          itemStyle: {
            color: [tokens.colorSuccess, tokens.colorWarning, tokens.colorWarning, tokens.colorError][index] || tokens.colorPrimary,
          },
        })),
      },
    ],
  };
});

watch([() => props.data, tokens], () => {
  renderEcharts(chartOption.value);
}, { deep: true });

onMounted(() => {
  renderEcharts(chartOption.value);
});
</script>

<style lang="less" scoped>
.demerit-analysis {
  .section-title {
    margin-bottom: 12px;
    color: hsl(var(--foreground));
    font-weight: 600;
  }

  .top-item {
    cursor: pointer;

    &:hover {
      background: hsl(var(--muted));
    }
  }

  .points-value {
    color: hsl(var(--error));
  }
}
</style>
