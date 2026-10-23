<script lang="ts" setup>
/**
 * TOP风险排行（web-naive 迁移，2026-09-30 重设计）
 * 列表行信息紧凑排布，卡片等高撑满
 */
import {
  NAvatar,
  NBadge,
  NEmpty,
  NList,
  NListItem,
  NSpin,
  NTag,
  NThing,
} from 'naive-ui';

import { IconifyIcon } from '@vben/icons';

import type { DriverRiskCenterApi } from '#/api/hse/driver-risk-center';

defineProps<{
  topList: DriverRiskCenterApi.DriverListItem[];
  loading: boolean;
}>();

defineEmits<{
  (e: 'driver-click', employeeId: number): void;
}>();
</script>

<template>
  <div class="driver-top-ranking">
    <NSpin :show="loading" class="h-full">
      <NList
        v-if="loading || topList.length"
        hoverable
        clickable
        class="rank-list"
      >
        <NListItem
          v-for="(item, index) in topList"
          :key="item.employeeId"
          class="rank-item"
          @click="$emit('driver-click', item.employeeId)"
        >
          <NThing :title="item.name">
            <template #avatar>
              <NBadge :value="index + 1">
                <NAvatar>
                  <IconifyIcon icon="lucide:user" />
                </NAvatar>
              </NBadge>
            </template>
            <template #description>
              <span class="item-subtitle">
                {{ item.positionName }} · {{ item.orgName }}
              </span>
            </template>
          </NThing>
          <template #suffix>
            <div class="rank-actions">
              <div class="rank-line">
                <span class="risk-score">{{ item.totalScore }} 分</span>
                <NTag
                  size="small"
                  :bordered="false"
                  :color="{ textColor: item.riskLevelColor }"
                >
                  {{ item.riskLevelName }}
                </NTag>
              </div>
              <div class="driver-stats">
                <span>
                  <IconifyIcon icon="lucide:ticket" />
                  {{ item.demeritPoints }}分
                </span>
                <span>
                  <IconifyIcon icon="lucide:car-front" />
                  {{ item.accidentCount }}起
                </span>
              </div>
            </div>
          </template>
        </NListItem>
      </NList>
      <NEmpty v-else description="暂无数据" />
    </NSpin>
  </div>
</template>

<style scoped>
.driver-top-ranking {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.driver-top-ranking :deep(.n-spin-content) {
  height: 100%;
}
.driver-top-ranking .rank-list {
  height: 100%;
}
.driver-top-ranking .rank-item {
  cursor: pointer;
}
.driver-top-ranking .item-subtitle {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}
.driver-top-ranking .rank-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}
.driver-top-ranking .rank-line {
  display: flex;
  gap: 8px;
  align-items: center;
  white-space: nowrap;
}
.driver-top-ranking .risk-score {
  font-weight: 600;
  color: #f5222d;
  white-space: nowrap;
}
.driver-top-ranking .driver-stats {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  white-space: nowrap;
}
</style>
