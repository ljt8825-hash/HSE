<template>
  <Page auto-content-height class="hse-page">
    <div class="toolbar">
      <Space :size="8">
        <HelpButton menuCode="HSE_AI_ANALYSIS" />
        <ImportButtonGroup module="ai-analysis" module-name="AI智能分析" />
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
        <Card title="风险预测分析" :bordered="false" class="h-80 flex items-center justify-center">
          <div class="text-center text-gray-400">
            <IconifyIcon icon="lucide:brain-circuit" class="text-6xl mb-4 opacity-50" />
            <p>AI风险预测模型可视化</p>
            <p class="text-sm mt-2">功能开发中，敬请期待</p>
          </div>
        </Card>
      </Col>
      <Col :xs="24" :lg="8">
        <Card title="智能预警列表" :bordered="false" class="h-80 flex items-center justify-center">
          <div class="text-center text-gray-400">
            <IconifyIcon icon="lucide:bell-ring" class="text-4xl mb-4 opacity-50" />
            <p>预警数据列表</p>
          </div>
        </Card>
      </Col>
    </Row>

    <Row :gutter="[16, 16]">
      <Col :xs="24" :lg="8">
        <Card title="模型准确率" :bordered="false" class="h-72 flex items-center justify-center">
          <div class="text-center text-gray-400">
            <IconifyIcon icon="lucide:target" class="text-4xl mb-4 opacity-50" />
            <p>准确率仪表盘</p>
          </div>
        </Card>
      </Col>
      <Col :xs="24" :lg="8">
        <Card title="异常行为识别" :bordered="false" class="h-72 flex items-center justify-center">
          <div class="text-center text-gray-400">
            <IconifyIcon icon="lucide:scan-face" class="text-4xl mb-4 opacity-50" />
            <p>行为分析图表</p>
          </div>
        </Card>
      </Col>
      <Col :xs="24" :lg="8">
        <Card title="安全趋势预测" :bordered="false" class="h-72 flex items-center justify-center">
          <div class="text-center text-gray-400">
            <IconifyIcon icon="lucide:trending-up" class="text-4xl mb-4 opacity-50" />
            <p>趋势预测曲线</p>
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
  { key: 'models', label: '模型数量', value: 12, icon: 'lucide:brain-circuit', color: 'purple', suffix: '个' },
  { key: 'analysis', label: '分析次数', value: 3580, icon: 'lucide:bar-chart-3', color: 'blue', suffix: '次' },
  { key: 'accuracy', label: '预警准确率', value: 92, icon: 'lucide:target', color: 'green', suffix: '%' },
  { key: 'predictions', label: '风险预测数', value: 86, icon: 'lucide:alert-triangle', color: 'orange', suffix: '项' },
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
