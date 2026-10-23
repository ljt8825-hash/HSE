<script lang="ts" setup>
/**
 * 驾驶员风险总览（web-naive 迁移，2026-09-30 重设计）
 * 统计卡改用 HseStatCard 系统组件，语义色统一
 */
import { HseStatCard } from '#/components/hse';

import type { DriverRiskCenterApi } from '#/api/hse/driver-risk-center';

defineProps<{
  data: DriverRiskCenterApi.OverviewData | null;
}>();
</script>

<template>
  <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
    <HseStatCard
      title="驾驶员数量"
      :value="data?.driverCount || 0"
      icon="lucide:users"
      color="blue"
    />
    <HseStatCard
      title="高风险驾驶员"
      :value="data?.highRiskCount || 0"
      icon="lucide:alert-triangle"
      color="red"
    />
    <HseStatCard
      title="有扣分记录"
      :value="data?.demeritStatistics?.demeritDriverCount || 0"
      icon="lucide:ticket"
      color="yellow"
    />
    <HseStatCard
      title="涉事驾驶员"
      :value="data?.accidentStatistics?.accidentDriverCount || 0"
      icon="lucide:flame"
      color="orange"
    />
  </div>
</template>
