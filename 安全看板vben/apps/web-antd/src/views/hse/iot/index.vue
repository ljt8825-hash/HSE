<template>
  <Page auto-content-height class="hse-page">
    <div class="toolbar">
      <Space :size="8">
        <HelpButton menuCode="HSE_IOT" />
        <ImportButtonGroup module="iot" module-name="IoT物联网" />
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
        <Card title="设备实时监控" :bordered="false" class="h-80 flex items-center justify-center">
          <div class="text-center text-gray-400">
            <IconifyIcon icon="lucide:radio" class="text-6xl mb-4 opacity-50" />
            <p>IoT设备实时数据大屏</p>
            <p class="text-sm mt-2">功能开发中，敬请期待</p>
          </div>
        </Card>
      </Col>
      <Col :xs="24" :lg="8">
        <Card title="设备告警列表" :bordered="false" class="h-80 flex items-center justify-center">
          <div class="text-center text-gray-400">
            <IconifyIcon icon="lucide:alert-triangle" class="text-4xl mb-4 opacity-50" />
            <p>告警数据列表</p>
          </div>
        </Card>
      </Col>
    </Row>

    <Row :gutter="[16, 16]">
      <Col :xs="24" :lg="8">
        <Card title="传感器数据趋势" :bordered="false" class="h-72 flex items-center justify-center">
          <div class="text-center text-gray-400">
            <IconifyIcon icon="lucide:activity" class="text-4xl mb-4 opacity-50" />
            <p>实时数据曲线</p>
          </div>
        </Card>
      </Col>
      <Col :xs="24" :lg="8">
        <Card title="设备分布地图" :bordered="false" class="h-72 flex items-center justify-center">
          <div class="text-center text-gray-400">
            <IconifyIcon icon="lucide:map-pin" class="text-4xl mb-4 opacity-50" />
            <p>地理位置分布</p>
          </div>
        </Card>
      </Col>
      <Col :xs="24" :lg="8">
        <Card title="设备健康状态" :bordered="false" class="h-72 flex items-center justify-center">
          <div class="text-center text-gray-400">
            <IconifyIcon icon="lucide:heart-pulse" class="text-4xl mb-4 opacity-50" />
            <p>健康度分析</p>
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
  { key: 'devices', label: '设备数量', value: 256, icon: 'lucide:radio', color: 'blue', suffix: '台' },
  { key: 'onlineRate', label: '在线率', value: 98, icon: 'lucide:wifi', color: 'green', suffix: '%' },
  { key: 'dataPoints', label: '数据点数', value: 12580, icon: 'lucide:database', color: 'purple', suffix: '个' },
  { key: 'alerts', label: '告警数', value: 23, icon: 'lucide:alert-triangle', color: 'orange', suffix: '条' },
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
