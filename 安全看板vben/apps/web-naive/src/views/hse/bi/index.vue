<template>
  <HsePageLayout title="BI 数据看板" :auto-content-height="true">
    <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-4">
      <HseStatCard
        v-for="stat in statItems"
        :key="stat.key"
        :title="stat.label"
        :value="stat.value"
        :icon="stat.icon"
        :color="stat.color"
        :suffix="stat.suffix"
      />
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
      <NCard title="安全指标趋势分析" :bordered="false" class="h-80 lg:col-span-2 flex items-center justify-center">
        <div class="text-center text-gray-400">
          <IconifyIcon icon="lucide:bar-chart-3" class="text-6xl mb-4 opacity-50" />
          <p>多维度趋势图表</p>
          <p class="text-sm mt-2">功能开发中，敬请期待</p>
        </div>
      </NCard>
      <NCard title="数据指标概览" :bordered="false" class="h-80 flex items-center justify-center">
        <div class="text-center text-gray-400">
          <IconifyIcon icon="lucide:list-checks" class="text-4xl mb-4 opacity-50" />
          <p>指标列表区域</p>
        </div>
      </NCard>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <NCard title="隐患分类统计" :bordered="false" class="h-72 flex items-center justify-center">
        <div class="text-center text-gray-400">
          <IconifyIcon icon="lucide:pie-chart" class="text-4xl mb-4 opacity-50" />
          <p>饼图区域</p>
        </div>
      </NCard>
      <NCard title="部门绩效排行" :bordered="false" class="h-72 flex items-center justify-center">
        <div class="text-center text-gray-400">
          <IconifyIcon icon="lucide:bar-chart-2" class="text-4xl mb-4 opacity-50" />
          <p>柱状图区域</p>
        </div>
      </NCard>
      <NCard title="数据访问统计" :bordered="false" class="h-72 flex items-center justify-center">
        <div class="text-center text-gray-400">
          <IconifyIcon icon="lucide:activity" class="text-4xl mb-4 opacity-50" />
          <p>访问量趋势</p>
        </div>
      </NCard>
    </div>
  </HsePageLayout>
</template>

<script setup lang="ts">
import { NCard } from 'naive-ui';
import { IconifyIcon } from '@vben/icons';
import HsePageLayout from '#/components/hse/HsePageLayout.vue';
import HseStatCard from '#/components/hse/HseStatCard.vue';

defineOptions({ name: 'HseBiDashboard' });

const statItems = [
  { key: 'metrics', label: '数据指标', value: 128, icon: 'lucide:gauge', color: 'blue', suffix: '项' },
  { key: 'reports', label: '接入报表数', value: 36, icon: 'lucide:file-bar-chart', color: 'green', suffix: '份' },
  { key: 'dataVolume', label: '数据量', value: 2.5, icon: 'lucide:database', color: 'purple', suffix: 'TB' },
  { key: 'visits', label: '用户访问量', value: 8920, icon: 'lucide:users', color: 'orange', suffix: '次' },
];
</script>

<style scoped>
.h-72 {
  height: 288px;
}
.h-80 {
  height: 320px;
}
.flex {
  display: flex;
}
.items-center {
  align-items: center;
}
.justify-center {
  justify-content: center;
}
.text-center {
  text-align: center;
}
.text-gray-400 {
  color: hsl(var(--muted-foreground));
}
.text-sm {
  font-size: 14px;
}
.text-4xl {
  font-size: 36px;
}
.text-6xl {
  font-size: 48px;
}
.mb-2 {
  margin-bottom: 8px;
}
.mb-4 {
  margin-bottom: 16px;
}
.mt-2 {
  margin-top: 8px;
}
.opacity-50 {
  opacity: 0.5;
}
</style>
