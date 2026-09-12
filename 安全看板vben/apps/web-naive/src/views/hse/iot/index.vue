<script lang="ts" setup>
/**
 * IoT物联网（web-naive · 占位页面）
 * 功能建设中
 */
import { NCard, NEmpty, NGi, NGrid, NStatistic } from 'naive-ui';

import { HsePageLayout } from '#/components/hse';

defineOptions({ name: 'HseIot' });

const statItems = [
  { key: 'devices', label: '设备数量', value: 256, suffix: '台' },
  { key: 'onlineRate', label: '在线率', value: 98, suffix: '%' },
  { key: 'dataPoints', label: '数据点数', value: 12580, suffix: '个' },
  { key: 'alerts', label: '告警数', value: 23, suffix: '条' },
];
</script>

<template>
  <HsePageLayout :title="$t('page.hse.iot')" description="物联网设备实时监控与数据采集">
    <!-- 统计卡 -->
    <NGrid :cols="4" :x-gap="12" :y-gap="12" class="mb-4">
      <NGi v-for="stat in statItems" :key="stat.key">
        <NCard :bordered="false" size="small">
          <NStatistic :label="stat.label" :value="stat.value" :suffix="stat.suffix" />
        </NCard>
      </NGi>
    </NGrid>

    <!-- 占位区域 -->
    <NCard title="设备实时监控" :bordered="false" class="mb-4">
      <NEmpty description="IoT设备实时数据大屏 - 功能建设中，敬请期待" style="padding: 60px 0;">
        <template #icon>
          <div class="text-6xl opacity-30">📡</div>
        </template>
      </NEmpty>
    </NCard>

    <NGrid :cols="2" :x-gap="12">
      <NGi>
        <NCard title="设备告警列表" :bordered="false">
          <NEmpty description="告警数据列表 - 功能建设中" style="padding: 40px 0;">
            <template #icon>
              <div class="text-4xl opacity-30">⚠️</div>
            </template>
          </NEmpty>
        </NCard>
      </NGi>
      <NGi>
        <NCard title="传感器数据趋势" :bordered="false">
          <NEmpty description="实时数据曲线 - 功能建设中" style="padding: 40px 0;">
            <template #icon>
              <div class="text-4xl opacity-30">📈</div>
            </template>
          </NEmpty>
        </NCard>
      </NGi>
    </NGrid>
  </HsePageLayout>
</template>
