<script lang="ts" setup>
/**
 * 风险等级分布（web-naive 迁移，2026-09-30 重设计）
 * 环形图 + 等级明细列表；图表高度自适应撑满卡片
 */
import { computed, onMounted, ref, watch } from 'vue';

import { NEmpty, NList, NListItem } from 'naive-ui';

import type { ECOption, EchartsUIType } from '@vben/plugins/echarts';
import { EchartsUI, useEcharts } from '@vben/plugins/echarts';

import type { DriverRiskCenterApi } from '#/api/hse/driver-risk-center';

const props = defineProps<{
  data: DriverRiskCenterApi.LevelDistributionItem[] | null;
}>();

const chartRef = ref<EchartsUIType>();
const { renderEcharts } = useEcharts(chartRef);

const levelList = computed(() => props.data || []);
const total = computed(() =>
  levelList.value.reduce((sum, item) => sum + item.count, 0),
);

const chartOption = computed<ECOption>(() => {
  if (total.value === 0) {
    return {
      title: {
        text: '暂无数据',
        left: 'center',
        top: 'center',
        textStyle: {
          color: '#1f1f1f',
          fontSize: 14,
          fontWeight: 'normal',
        },
      },
      series: [],
    };
  }

  const data = levelList.value.map((item) => ({
    name: item.levelName,
    value: item.count,
    itemStyle: { color: item.colorCode },
  }));

  return {
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(255, 255, 255, 0.92)',
      textStyle: { color: '#1f1f1f' },
      formatter: '{b}: {c} ({d}%)',
    },
    series: [
      {
        type: 'pie',
        radius: ['55%', '78%'],
        center: ['50%', '50%'],
        avoidLabelOverlap: false,
        label: { show: false },
        emphasis: { scaleSize: 4 },
        data,
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
  <div class="level-distribution">
    <div
      v-if="total > 0"
      class="flex h-full min-h-0 gap-4"
    >
      <div class="min-h-0 min-w-0 flex-1">
        <EchartsUI ref="chartRef" height="100%" width="100%" />
      </div>
      <div class="flex w-40 shrink-0 flex-col justify-center">
        <NList>
          <NListItem v-for="item in levelList" :key="item.levelCode">
            <div class="flex items-center gap-2">
              <span
                class="level-dot"
                :style="{ backgroundColor: item.colorCode }"
              />
              <span class="level-name">{{ item.levelName }}</span>
            </div>
            <template #suffix>
              <span class="level-count">
                {{ item.count }}（{{
                  ((item.count / total) * 100).toFixed(1)
                }}%）
              </span>
            </template>
          </NListItem>
        </NList>
      </div>
    </div>
    <NEmpty v-else description="暂无数据" />
  </div>
</template>

<style scoped>
.level-distribution {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.level-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.level-name {
  font-size: 13px;
  color: hsl(var(--foreground));
}
.level-count {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  white-space: nowrap;
}
</style>
