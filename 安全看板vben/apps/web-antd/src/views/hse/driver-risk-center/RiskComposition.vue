<template>
  <div class="risk-composition">
    <List v-if="compositionList.length" :data-source="compositionList" size="small">
      <template #renderItem="{ item }">
        <ListItem>
          <ListItemMeta :title="item.name" :description="item.subtitle">
            <template #avatar>
              <Avatar :style="{ backgroundColor: `${item.color}20`, color: item.color }">
                <IconifyIcon :icon="item.icon" />
              </Avatar>
            </template>
          </ListItemMeta>
          <template #actions>
            <div class="risk-item-actions">
              <Statistic :value="item.count" />
              <Progress
                class="risk-progress"
                :percent="Math.min(100, Math.round(item.percent))"
                :stroke-color="item.color"
                :show-info="false"
              />
            </div>
          </template>
        </ListItem>
      </template>
    </List>
    <Empty v-else description="暂无数据" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Avatar, Empty, List, ListItem, ListItemMeta, Progress, Statistic } from 'ant-design-vue';
import { useAntdDesignTokens } from '@vben/hooks';
import { IconifyIcon } from '@vben/icons';
import type { DriverRiskCenterApi } from '#/api/hse/driver-risk-center';

const props = defineProps<{
  data: DriverRiskCenterApi.OverviewData | null;
}>();
const { tokens } = useAntdDesignTokens();

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
      percent: ((props.data.demeritStatistics?.demeritDriverCount || 0) / total) * 100,
    },
    {
      key: 'accident',
      name: '交通事故',
      subtitle: '涉交通事故人数',
      icon: 'lucide:flame',
      color: tokens.colorPrimary,
      count: props.data.accidentStatistics?.accidentDriverCount || 0,
      percent: ((props.data.accidentStatistics?.accidentDriverCount || 0) / total) * 100,
    },
    {
      key: 'inspection',
      name: '三检情况',
      subtitle: '有三检记录人数',
      icon: 'lucide:clipboard-check',
      color: tokens.colorWarning,
      count: props.data.inspectionStatistics?.inspectionDriverCount || 0,
      percent: ((props.data.inspectionStatistics?.inspectionDriverCount || 0) / total) * 100,
    },
    {
      key: 'training',
      name: '培训情况',
      subtitle: '有培训记录人数',
      icon: 'lucide:book-open',
      color: tokens.colorInfo,
      count: props.data.trainingStatistics?.trainedDriverCount || 0,
      percent: ((props.data.trainingStatistics?.trainedDriverCount || 0) / total) * 100,
    },
  ];
});
</script>

<style lang="less" scoped>
.risk-composition {
  .risk-item-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .risk-progress {
    width: 100%;
  }
}
</style>
