<template>
  <Page auto-content-height class="hse-page">
    <div class="toolbar">
      <Space :size="8">
        <HelpButton menuCode="HSE_BI" />
        <ImportButtonGroup module="bi" module-name="BI数据看板" />
      </Space>
    </div>

    <Row :gutter="[16, 16]" class="mb-4">
      <Col :xs="24" :sm="12" :md="8" :lg="6" v-for="stat in statItems" :key="stat.key">
        <HseStatCard
          :title="stat.label"
          :value="stat.value"
          :icon="stat.icon"
          :color="(stat.color as any)"
          :suffix="stat.suffix"
        />
      </Col>
    </Row>

    <Row :gutter="[16, 16]" class="mb-4">
      <Col :xs="24" :lg="16">
        <Card title="安全指标趋势分析" :bordered="false" class="h-80 flex items-center justify-center">
          <div class="text-center text-gray-400">
            <IconifyIcon icon="lucide:bar-chart-3" class="text-6xl mb-4 opacity-50" />
            <p>多维度趋势图表</p>
            <p class="text-sm mt-2">功能开发中，敬请期待</p>
          </div>
        </Card>
      </Col>
      <Col :xs="24" :lg="8">
        <Card title="数据指标概览" :bordered="false" class="h-80 flex items-center justify-center">
          <div class="text-center text-gray-400">
            <IconifyIcon icon="lucide:list-checks" class="text-4xl mb-4 opacity-50" />
            <p>指标列表区域</p>
          </div>
        </Card>
      </Col>
    </Row>

    <Row :gutter="[16, 16]">
      <Col :xs="24" :lg="8">
        <Card title="隐患分类统计" :bordered="false" class="h-72 flex items-center justify-center">
          <div class="text-center text-gray-400">
            <IconifyIcon icon="lucide:pie-chart" class="text-4xl mb-4 opacity-50" />
            <p>饼图区域</p>
          </div>
        </Card>
      </Col>
      <Col :xs="24" :lg="8">
        <Card title="部门绩效排行" :bordered="false" class="h-72 flex items-center justify-center">
          <div class="text-center text-gray-400">
            <IconifyIcon icon="lucide:bar-chart-2" class="text-4xl mb-4 opacity-50" />
            <p>柱状图区域</p>
          </div>
        </Card>
      </Col>
      <Col :xs="24" :lg="8">
        <Card title="数据访问统计" :bordered="false" class="h-72 flex items-center justify-center">
          <div class="text-center text-gray-400">
            <IconifyIcon icon="lucide:activity" class="text-4xl mb-4 opacity-50" />
            <p>访问量趋势</p>
          </div>
        </Card>
      </Col>
    </Row>
  </Page>
</template>

<script setup lang="ts">
import { Card, Row, Col, Space } from 'ant-design-vue';
import { IconifyIcon } from '@vben/icons';
import { Page } from '@vben/common-ui';
import { HelpButton } from '#/components/hse';
import HseStatCard from '#/components/hse/StatCard.vue';
import ImportButtonGroup from '#/components/hse/ImportButtonGroup.vue';

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

.toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 16px;
}
</style>
