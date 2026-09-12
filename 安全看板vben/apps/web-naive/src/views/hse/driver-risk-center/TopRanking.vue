<script lang="ts" setup>
/**
 * TOP风险排行（web-naive 迁移）
 * 纯列表，无图表
 */
import { NAvatar, NBadge, NEmpty, NList, NListItem, NSpin, NTag, NThing } from 'naive-ui';

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
    <NSpin :show="loading">
      <NList v-if="loading || topList.length" hoverable clickable>
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
              <span class="text-muted-foreground text-xs">
                {{ item.positionName }} · {{ item.orgName }}
              </span>
            </template>
          </NThing>
          <template #suffix>
            <div class="rank-actions">
              <div class="risk-score">{{ item.totalScore }} 分</div>
              <NTag
                size="small"
                :bordered="false"
                :color="{ textColor: item.riskLevelColor }"
              >
                {{ item.riskLevelName }}
              </NTag>
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
.driver-top-ranking .rank-item {
  cursor: pointer;
}

.driver-top-ranking .rank-actions {
  display: flex;
  gap: 12px;
  align-items: center;
}

.driver-top-ranking .risk-score {
  font-weight: 600;
  color: hsl(var(--error));
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
