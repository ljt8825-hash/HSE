<script lang="ts" setup>
/**
 * 驾驶员风险总览（web-naive 迁移）
 * 纯统计卡片，无图表
 */
import { NCard, NStatistic } from 'naive-ui';

import { IconifyIcon } from '@vben/icons';

import type { DriverRiskCenterApi } from '#/api/hse/driver-risk-center';

defineProps<{
  data: DriverRiskCenterApi.OverviewData | null;
}>();
</script>

<template>
  <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
    <NCard :bordered="false" size="small">
      <NStatistic label="驾驶员数量">
        <template #prefix>
          <IconifyIcon
            icon="lucide:users"
            :style="{ color: 'hsl(var(--primary))' }"
          />
        </template>
        <span>{{ data?.driverCount || 0 }}</span>
      </NStatistic>
    </NCard>

    <NCard :bordered="false" size="small">
      <NStatistic label="高风险驾驶员">
        <template #prefix>
          <IconifyIcon
            icon="lucide:alert-triangle"
            :style="{ color: 'hsl(var(--error))' }"
          />
        </template>
        <span :style="{ color: 'hsl(var(--error))' }">
          {{ data?.highRiskCount || 0 }}
        </span>
      </NStatistic>
    </NCard>

    <NCard :bordered="false" size="small">
      <NStatistic label="有扣分记录">
        <template #prefix>
          <IconifyIcon
            icon="lucide:car"
            :style="{ color: 'hsl(var(--warning))' }"
          />
        </template>
        <span :style="{ color: 'hsl(var(--warning))' }">
          {{ data?.demeritStatistics?.demeritDriverCount || 0 }}
        </span>
      </NStatistic>
    </NCard>

    <NCard :bordered="false" size="small">
      <NStatistic label="涉事驾驶员">
        <template #prefix>
          <IconifyIcon
            icon="lucide:flame"
            :style="{ color: 'hsl(var(--primary))' }"
          />
        </template>
        <span :style="{ color: 'hsl(var(--primary))' }">
          {{ data?.accidentStatistics?.accidentDriverCount || 0 }}
        </span>
      </NStatistic>
    </NCard>
  </div>
</template>
