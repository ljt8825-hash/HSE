<script lang="ts" setup>
/**
 * 驾驶证扣分分析（web-naive 迁移，2026-09-30 重设计）
 * 扣分分布饼图 + TOP扣分驾驶员列表；图表自适应撑满卡片
 */
import { computed, onMounted, ref, watch } from 'vue';

import { NBadge, NEmpty, NList, NListItem, NStatistic, NThing } from 'naive-ui';

import type { ECOption, EchartsUIType } from '@vben/plugins/echarts';
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

// HSE 系统语义色（Canvas 固定值）：成功绿、预警黄、危险红、信息蓝
const tokens = {
  colorSuccess: '#52c41a',
  colorWarning: '#faad14',
  colorError: '#f5222d',
  colorPrimary: '#2080f0',
};

const topDrivers = computed(() => props.data?.topDrivers || []);

const chartOption = computed<ECOption>(() => {
  if (
    !props.data?.pointsDistribution ||
    props.data.pointsDistribution.length === 0
  ) {
    return {
      title: {
        text: '暂无数据',
        left: 'center',
        top: 'center',
        textStyle: {
          color: '#1f1f1f',
          fontSize: 12,
          fontWeight: 'normal',
        },
      },
      series: [],
    };
  }

  return {
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(255, 255, 255, 0.92)',
      textStyle: { color: '#1f1f1f' },
      formatter: '{b}: {c}次 ({d}%)',
    },
    series: [
      {
        type: 'pie',
        radius: ['40%', '68%'],
        center: ['50%', '50%'],
        label: {
          show: true,
          fontSize: 11,
          color: '#1f1f1f',
          formatter: '{b}\n{d}%',
        },
        labelLine: {
          length: 10,
          length2: 8,
        },
        emphasis: { scaleSize: 4 },
        data: props.data.pointsDistribution.map((item, index) => ({
          name: item.range,
          value: item.count,
          itemStyle: {
            color:
              [
                tokens.colorSuccess,
                tokens.colorWarning,
                tokens.colorWarning,
                tokens.colorError,
              ][index] || tokens.colorPrimary,
          },
        })),
      },
    ],
  };
});

watch(
  () => props.data,
  () => {
    renderEcharts(chartOption.value);
  },
  { deep: true },
);

onMounted(() => {
  renderEcharts(chartOption.value);
});
</script>

<template>
  <div class="demerit-analysis">
    <div class="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div class="stat-chip">
        <NStatistic label="扣分人数">
          <span>{{ data?.overall?.demeritDriverCount || 0 }}</span>
        </NStatistic>
      </div>
      <div class="stat-chip">
        <NStatistic label="扣分次数">
          <span>{{ data?.overall?.demeritTotalCount || 0 }}</span>
        </NStatistic>
      </div>
      <div class="stat-chip">
        <NStatistic label="累计扣分">
          <span class="value-warning">{{ data?.overall?.totalPoints || 0 }}</span>
        </NStatistic>
      </div>
      <div class="stat-chip">
        <NStatistic label="单次平均">
          <span>{{ data?.overall?.avgPointsPerRecord || 0 }}</span>
        </NStatistic>
      </div>
    </div>

    <div
      class="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-12"
    >
      <div class="flex min-h-0 min-w-0 flex-col lg:col-span-7">
        <div class="section-title">扣分分布</div>
        <div class="min-h-0 flex-1">
          <EchartsUI
            v-if="data?.pointsDistribution?.length"
            ref="chartRef"
            height="100%"
            width="100%"
          />
          <NEmpty v-else description="暂无数据" />
        </div>
      </div>
      <div class="flex min-h-0 min-w-0 flex-col lg:col-span-5">
        <div class="section-title">TOP扣分驾驶员</div>
        <div class="min-h-0 flex-1 overflow-auto">
          <NList v-if="topDrivers.length" hoverable clickable>
            <NListItem
              v-for="(item, index) in topDrivers"
              :key="item.employeeId"
              class="top-item"
              @click="$emit('driver-click', item.employeeId)"
            >
              <NThing :title="item.name">
                <template #avatar>
                  <NBadge :value="index + 1" type="info" />
                </template>
                <template #description>
                  <span class="item-subtitle">{{ item.positionName }}</span>
                </template>
              </NThing>
              <template #suffix>
                <strong class="points-value">{{ item.totalPoints }} 分</strong>
              </template>
            </NListItem>
          </NList>
          <NEmpty v-else description="暂无数据" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.demerit-analysis {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.demerit-analysis .stat-chip {
  padding: 10px 12px;
  background: hsl(var(--muted));
  border-radius: 8px;
}
.demerit-analysis .stat-chip :deep(.n-statistic-label) {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}
.demerit-analysis .stat-chip :deep(.n-statistic-value) {
  font-size: 18px;
  color: hsl(var(--foreground));
}
.demerit-analysis .value-warning {
  color: #f0a020;
}
.demerit-analysis .section-title {
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 600;
  color: hsl(var(--muted-foreground));
}
.demerit-analysis .top-item {
  cursor: pointer;
}
.demerit-analysis .item-subtitle {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}
.demerit-analysis .points-value {
  color: #f5222d;
  white-space: nowrap;
}
</style>
