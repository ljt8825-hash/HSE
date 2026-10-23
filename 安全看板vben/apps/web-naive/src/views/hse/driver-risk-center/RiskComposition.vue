<script lang="ts" setup>
/**
 * 驾驶风险构成（web-naive 迁移，2026-09-30 重设计）
 * 纯列表 + 进度条，配色统一为 HSE 系统语义色
 */
import { computed } from 'vue';

import {
  NAvatar,
  NEmpty,
  NList,
  NListItem,
  NProgress,
  NStatistic,
  NThing,
} from 'naive-ui';

import { IconifyIcon } from '@vben/icons';

import type { DriverRiskCenterApi } from '#/api/hse/driver-risk-center';

const props = defineProps<{
  data: DriverRiskCenterApi.OverviewData | null;
}>();

// HSE 系统语义色（Canvas 固定值）：主/成功绿、信息蓝、预警黄、危险红
const tokens = {
  colorSuccess: '#52c41a',
  colorInfo: '#2080f0',
  colorWarning: '#faad14',
  colorError: '#f5222d',
};

const compositionList = computed(() => {
  if (!props.data) return [];
  const total = props.data.driverCount || 1;
  return [
    {
      key: 'demerit',
      name: '驾驶证扣分',
      subtitle: '近5年有扣分记录',
      icon: 'lucide:ticket',
      color: tokens.colorError,
      count: props.data.demeritStatistics?.demeritDriverCount || 0,
      percent:
        ((props.data.demeritStatistics?.demeritDriverCount || 0) / total) * 100,
    },
    {
      key: 'accident',
      name: '交通事故',
      subtitle: '涉交通事故人数',
      icon: 'lucide:flame',
      color: tokens.colorInfo,
      count: props.data.accidentStatistics?.accidentDriverCount || 0,
      percent:
        ((props.data.accidentStatistics?.accidentDriverCount || 0) / total) *
        100,
    },
    {
      key: 'inspection',
      name: '三检情况',
      subtitle: '有三检记录人数',
      icon: 'lucide:clipboard-check',
      color: tokens.colorWarning,
      count: props.data.inspectionStatistics?.inspectionDriverCount || 0,
      percent:
        ((props.data.inspectionStatistics?.inspectionDriverCount || 0) /
          total) *
        100,
    },
    {
      key: 'training',
      name: '培训情况',
      subtitle: '有培训记录人数',
      icon: 'lucide:book-open',
      color: tokens.colorSuccess,
      count: props.data.trainingStatistics?.trainedDriverCount || 0,
      percent:
        ((props.data.trainingStatistics?.trainedDriverCount || 0) / total) * 100,
    },
  ];
});
</script>

<template>
  <div class="risk-composition">
    <NList v-if="compositionList.length">
      <NListItem
        v-for="item in compositionList"
        :key="item.key"
        class="composition-item"
      >
        <NThing :title="item.name">
          <template #avatar>
            <NAvatar
              :style="{
                backgroundColor: `${item.color}1a`,
                color: item.color,
              }"
            >
              <IconifyIcon :icon="item.icon" />
            </NAvatar>
          </template>
          <template #description>
            <span class="item-subtitle">{{ item.subtitle }}</span>
          </template>
        </NThing>
        <template #suffix>
          <div class="risk-item-actions">
            <NStatistic :value="item.count" class="item-count" />
            <NProgress
              class="risk-progress"
              type="line"
              :percentage="Math.min(100, Math.round(item.percent))"
              :color="item.color"
              :show-indicator="false"
            />
          </div>
        </template>
      </NListItem>
    </NList>
    <NEmpty v-else description="暂无数据" />
  </div>
</template>

<style scoped>
.risk-composition {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.risk-composition .composition-item {
  padding: 10px 0;
}
.risk-composition .composition-item:not(:last-child) {
  border-bottom: 1px solid hsl(var(--border));
}
.risk-composition .item-subtitle {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}
.risk-composition .risk-item-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  min-width: 150px;
}
.risk-composition .item-count :deep(.n-statistic-value) {
  font-size: 18px;
}
.risk-composition .risk-progress {
  width: 110px;
}
</style>
