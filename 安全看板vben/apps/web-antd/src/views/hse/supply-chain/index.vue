<template>
  <Page auto-content-height class="hse-page">
    <div class="toolbar">
      <Space :size="8">
        <HelpButton menuCode="HSE_SUPPLY_CHAIN" />
        <ImportButtonGroup module="supply-chain" module-name="供应链安全" />
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
        <Card title="供应商安全评估" :bordered="false" class="h-80 flex items-center justify-center">
          <div class="text-center text-gray-400">
            <IconifyIcon icon="lucide:truck" class="text-6xl mb-4 opacity-50" />
            <p>供应商安全评估管理</p>
            <p class="text-sm mt-2">功能开发中，敬请期待</p>
          </div>
        </Card>
      </Col>
      <Col :xs="24" :lg="8">
        <Card title="风险供应商列表" :bordered="false" class="h-80 flex items-center justify-center">
          <div class="text-center text-gray-400">
            <IconifyIcon icon="lucide:alert-triangle" class="text-4xl mb-4 opacity-50" />
            <p>风险供应商清单</p>
          </div>
        </Card>
      </Col>
    </Row>

    <Row :gutter="[16, 16]">
      <Col :xs="24" :lg="8">
        <Card title="供应商等级分布" :bordered="false" class="h-72 flex items-center justify-center">
          <div class="text-center text-gray-400">
            <IconifyIcon icon="lucide:pie-chart" class="text-4xl mb-4 opacity-50" />
            <p>等级分布饼图</p>
          </div>
        </Card>
      </Col>
      <Col :xs="24" :lg="8">
        <Card title="评估完成进度" :bordered="false" class="h-72 flex items-center justify-center">
          <div class="text-center text-gray-400">
            <IconifyIcon icon="lucide:list-checks" class="text-4xl mb-4 opacity-50" />
            <p>进度统计图表</p>
          </div>
        </Card>
      </Col>
      <Col :xs="24" :lg="8">
        <Card title="品类风险分析" :bordered="false" class="h-72 flex items-center justify-center">
          <div class="text-center text-gray-400">
            <IconifyIcon icon="lucide:bar-chart-2" class="text-4xl mb-4 opacity-50" />
            <p>品类风险柱状图</p>
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
  { key: 'suppliers', label: '供应商数', value: 56, icon: 'lucide:building-2', color: 'blue', suffix: '家' },
  { key: 'qualifiedRate', label: '合格率', value: 86, icon: 'lucide:badge-check', color: 'green', suffix: '%' },
  { key: 'riskSuppliers', label: '风险供应商', value: 3, icon: 'lucide:alert-triangle', color: 'red', suffix: '家' },
  { key: 'evaluationRate', label: '评估完成率', value: 92, icon: 'lucide:clipboard-check', color: 'purple', suffix: '%' },
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
