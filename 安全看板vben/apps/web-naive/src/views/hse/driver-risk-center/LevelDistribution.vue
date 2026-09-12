<script lang="ts" setup>
/**
 * 风险等级分布（web-naive 迁移）
 * 环形图 + 等级明细列表；图表配置与 antd 版本保持一致
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
          color: tokens.colorTextBase,
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
      backgroundColor: tokens.colorBgElevated,
      textStyle: { color: tokens.colorTextBase },
      formatter: '{b}: {c} ({d}%)',
    },
    series: [
      {
        type: 'pie',
        radius: ['55%', '75%'],
        center: ['50%', '50%'],
        avoidLabelOverlap: false,
        label: {
          show: false,
        },
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
      class="grid grid-cols-1 items-center gap-4 md:grid-cols-2"
    >
      <div>
        <EchartsUI ref="chartRef" height="220px" width="100%" />
      </div>
      <div>
        <NList>
          <NListItem v-for="item in levelList" :key="item.levelCode">
            <div class="flex items-center gap-2">
              <span
                class="level-dot"
                :style="{ backgroundColor: item.colorCode }"
              />
              <span>{{ item.levelName }}</span>
            </div>
            <template #suffix>
              <span>
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
.level-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
</style>
