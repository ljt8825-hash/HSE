<script lang="ts" setup>
/**
 * 驾驶证扣分分析（web-naive 迁移）
 * 扣分分布饼图 + TOP扣分驾驶员列表；图表配置与 antd 版本保持一致
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

// Canvas 无法解析 CSS 变量，图表配色使用固定色值
const tokens = {
  colorTextBase: '#1f1f1f',
  colorPrimary: '#1890ff',
  colorError: '#f5222d',
  colorWarning: '#faad14',
  colorSuccess: '#52c41a',
  colorBgElevated: '#ffffff',
  colorBorder: '#f0f0f0',
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
          color: tokens.colorTextBase,
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
    <div class="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
      <NStatistic label="扣分人数">
        <span>{{ data?.overall?.demeritDriverCount || 0 }}</span>
      </NStatistic>
      <NStatistic label="扣分次数">
        <span>{{ data?.overall?.demeritTotalCount || 0 }}</span>
      </NStatistic>
      <NStatistic label="累计扣分">
        <span :style="{ color: 'hsl(var(--warning))' }">
          {{ data?.overall?.totalPoints || 0 }}
        </span>
      </NStatistic>
      <NStatistic label="单次平均">
        <span>{{ data?.overall?.avgPointsPerRecord || 0 }}</span>
      </NStatistic>
    </div>

    <div class="grid grid-cols-1 gap-4 lg:grid-cols-12">
      <div class="lg:col-span-7">
        <div class="section-title">扣分分布</div>
        <EchartsUI
          v-if="data?.pointsDistribution?.length"
          ref="chartRef"
          height="200px"
          width="100%"
        />
        <NEmpty v-else description="暂无数据" />
      </div>
      <div class="lg:col-span-5">
        <div class="section-title">TOP扣分驾驶员</div>
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
                <span class="text-muted-foreground text-xs">
                  {{ item.positionName }}
                </span>
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
</template>

<style scoped>
.demerit-analysis .section-title {
  margin-bottom: 12px;
  font-weight: 600;
  color: hsl(var(--foreground));
}

.demerit-analysis .top-item {
  cursor: pointer;
}

.demerit-analysis .points-value {
  color: hsl(var(--error));
}
</style>
