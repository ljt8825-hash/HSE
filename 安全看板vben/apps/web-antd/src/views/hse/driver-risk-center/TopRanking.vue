<template>
  <div class="driver-top-ranking">
    <List
      v-if="loading || topList.length"
      :data-source="topList"
      :loading="loading"
      item-layout="horizontal"
      size="small"
    >
      <template #renderItem="{ item, index }">
        <ListItem class="rank-item" @click="$emit('driver-click', item.employeeId)">
          <ListItemMeta :title="item.name" :description="`${item.positionName} · ${item.orgName}`">
            <template #avatar>
              <Badge :count="index + 1" :offset="[-2, 2]">
                <Avatar>
                  <template #icon><IconifyIcon icon="lucide:user" /></template>
                </Avatar>
              </Badge>
            </template>
          </ListItemMeta>
          <template #actions>
            <div class="rank-actions">
              <div class="risk-score">{{ item.totalScore }} 分</div>
              <Tag :style="{ color: item.riskLevelColor }">{{ item.riskLevelName }}</Tag>
              <div class="driver-stats">
                <span><IconifyIcon icon="lucide:ticket" /> {{ item.demeritPoints }}分</span>
                <span><IconifyIcon icon="lucide:car-front" /> {{ item.accidentCount }}起</span>
              </div>
            </div>
          </template>
        </ListItem>
      </template>
    </List>
    <Empty v-else description="暂无数据" />
  </div>
</template>

<script setup lang="ts">
import { Avatar, Badge, Empty, List, ListItem, ListItemMeta, Tag } from 'ant-design-vue';
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

<style lang="less" scoped>
.driver-top-ranking {
  .rank-item {
    cursor: pointer;

    &:hover {
      background: hsl(var(--muted));
    }
  }

  .rank-actions {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .risk-score {
    color: hsl(var(--error));
    font-weight: 600;
    white-space: nowrap;
  }

  .driver-stats {
    display: flex;
    align-items: center;
    gap: 8px;
    color: hsl(var(--muted-foreground));
    font-size: 12px;
    white-space: nowrap;
  }
}
</style>
