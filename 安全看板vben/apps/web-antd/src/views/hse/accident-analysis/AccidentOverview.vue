<template>
  <Row :gutter="[16, 16]" class="mb-4">
    <Col :xs="24" :sm="12" :md="6">
      <Card :bordered="false" size="small">
        <Statistic title="事故总数" :value="data?.totalCount || 0" :value-style="{ color: tokens.colorError }">
          <template #prefix><IconifyIcon icon="lucide:flame" :style="{ color: tokens.colorError }" /></template>
        </Statistic>
      </Card>
    </Col>
    <Col :xs="24" :sm="12" :md="6">
      <Card :bordered="false" size="small">
        <Statistic title="涉及人数" :value="data?.involvedCount || 0">
          <template #prefix><IconifyIcon icon="lucide:users" :style="{ color: tokens.colorPrimary }" /></template>
        </Statistic>
      </Card>
    </Col>
    <Col :xs="24" :sm="12" :md="6">
      <Card :bordered="false" size="small">
        <Statistic title="责任人数" :value="data?.responsibleCount || 0" :value-style="{ color: tokens.colorWarning }">
          <template #prefix><IconifyIcon icon="lucide:shield-alert" :style="{ color: tokens.colorWarning }" /></template>
        </Statistic>
      </Card>
    </Col>
    <Col :xs="24" :sm="12" :md="6">
      <Card :bordered="false" size="small">
        <Statistic title="重大事故" :value="data?.majorCount || 0" :value-style="{ color: tokens.colorPrimary }">
          <template #prefix><IconifyIcon icon="lucide:alert-octagon" :style="{ color: tokens.colorPrimary }" /></template>
        </Statistic>
      </Card>
    </Col>
  </Row>

  <Card :bordered="false" size="small">
    <Row :gutter="[16, 16]">
      <Col :xs="24" :sm="8">
        <Statistic title="伤亡人数" :value="data?.totalCasualties || 0" :value-style="{ color: tokens.colorError }">
          <template #prefix><IconifyIcon icon="lucide:heart-pulse" :style="{ color: tokens.colorError }" /></template>
        </Statistic>
      </Col>
      <Col :xs="24" :sm="8">
        <Statistic title="受伤人数" :value="data?.totalInjuries || 0" :value-style="{ color: tokens.colorWarning }">
          <template #prefix><IconifyIcon icon="lucide:bandage" :style="{ color: tokens.colorWarning }" /></template>
        </Statistic>
      </Col>
      <Col :xs="24" :sm="8">
        <Statistic title="经济损失" :value="formatLoss(data?.totalLoss)">
          <template #prefix><IconifyIcon icon="lucide:coins" :style="{ color: tokens.colorSuccess }" /></template>
        </Statistic>
      </Col>
    </Row>
  </Card>
</template>

<script setup lang="ts">
import { useAntdDesignTokens } from '@vben/hooks';
import { Card, Col, Row, Statistic } from 'ant-design-vue';
import { IconifyIcon } from '@vben/icons';
import type { AccidentAnalysisApi } from '#/api/hse/accident-analysis';

defineProps<{
  data: AccidentAnalysisApi.OverviewData | null;
}>();

const { tokens } = useAntdDesignTokens();

function formatLoss(loss?: number) {
  if (!loss) return '0元';
  if (loss >= 10000) {
    return `${(loss / 10000).toFixed(1)}万元`;
  }
  return `${loss.toFixed(0)}元`;
}
</script>
