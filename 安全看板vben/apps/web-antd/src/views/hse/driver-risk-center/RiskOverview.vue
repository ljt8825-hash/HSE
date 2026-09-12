<template>
  <Row :gutter="[16, 16]">
    <Col :xs="24" :sm="12" :md="6">
      <Card :bordered="false" size="small">
        <Statistic title="驾驶员数量" :value="data?.driverCount || 0">
          <template #prefix><IconifyIcon icon="lucide:users" :style="{ color: 'hsl(var(--primary))' }" /></template>
        </Statistic>
      </Card>
    </Col>
    <Col :xs="24" :sm="12" :md="6">
      <Card :bordered="false" size="small">
        <Statistic title="高风险驾驶员" :value="data?.highRiskCount || 0" :value-style="{ color: 'hsl(var(--error))' }">
          <template #prefix><IconifyIcon icon="lucide:alert-triangle" :style="{ color: 'hsl(var(--error))' }" /></template>
        </Statistic>
      </Card>
    </Col>
    <Col :xs="24" :sm="12" :md="6">
      <Card :bordered="false" size="small">
        <Statistic title="有扣分记录" :value="data?.demeritStatistics?.demeritDriverCount || 0" :value-style="{ color: 'hsl(var(--warning))' }">
          <template #prefix><IconifyIcon icon="lucide:car" :style="{ color: 'hsl(var(--warning))' }" /></template>
        </Statistic>
      </Card>
    </Col>
    <Col :xs="24" :sm="12" :md="6">
      <Card :bordered="false" size="small">
        <Statistic title="涉事驾驶员" :value="data?.accidentStatistics?.accidentDriverCount || 0" :value-style="{ color: 'hsl(var(--primary))' }">
          <template #prefix><IconifyIcon icon="lucide:flame" :style="{ color: 'hsl(var(--primary))' }" /></template>
        </Statistic>
      </Card>
    </Col>
  </Row>
</template>

<script setup lang="ts">
import { Card, Col, Row, Statistic } from 'ant-design-vue';
import { IconifyIcon } from '@vben/icons';
import type { DriverRiskCenterApi } from '#/api/hse/driver-risk-center';

defineProps<{
  data: DriverRiskCenterApi.OverviewData | null;
}>();
</script>
