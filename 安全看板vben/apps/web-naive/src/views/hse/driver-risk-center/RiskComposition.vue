<script lang="ts" setup>
/**
 * 驾驶风险构成（web-naive 迁移）
 * 纯列表 + 进度条，无图表
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

// 原 antd 设计令牌已替换为固定色值
const tokens = {
  colorTextBase: '#1f1f1f',
  colorPrimary: '#1890ff',
  colorInfo: '#1890ff',
  colorError: '#f5222d',
  colorWarning: '#faad14',
  colorSuccess: '#52c41a',
  colorBgElevated: '#ffffff',
  colorBorder: '#f0f0f0',
};

const compositionList = computed(() => {
  if (!props.data) return [];
  const total = props.data.driverCount || 1;
  return [
    {
      key: 'demerit',
      name: '驾驶证扣分',
      subtitle: '近一年有扣分记录',
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
      color: tokens.colorPrimary,
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
      color: tokens.colorInfo,
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
      <NListItem v-for="item in compositionList" :key="item.key">
        <NThing :title="item.name">
          <template #avatar>
            <NAvatar
              :style="{
                backgroundColor: `${item.color}20`,
                color: item.color,
              }"
            >
              <IconifyIcon :icon="item.icon" />
            </NAvatar>
          </template>
          <template #description>
            <span class="text-muted-foreground text-xs">
              {{ item.subtitle }}
            </span>
          </template>
        </NThing>
        <template #suffix>
          <div class="risk-item-actions">
            <NStatistic :value="item.count" />
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
.risk-composition .risk-item-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  min-width: 180px;
}

.risk-composition .risk-progress {
  width: 110px;
}
</style>
