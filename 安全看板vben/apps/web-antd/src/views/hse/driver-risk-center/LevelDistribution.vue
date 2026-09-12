<template>
  <div class="level-distribution">
    <Row v-if="total > 0" :gutter="[16, 16]" align="middle">
      <Col :xs="24" :md="12">
        <EchartsUI ref="chartRef" style="width: 100%; height: 220px" />
      </Col>
      <Col :xs="24" :md="12">
        <List :data-source="levelList" size="small">
          <template #renderItem="{ item }">
            <ListItem>
              <Badge :color="item.colorCode" :text="item.levelName" />
              <template #actions>
                <span>{{ item.count }}（{{ ((item.count / total) * 100).toFixed(1) }}%）</span>
              </template>
            </ListItem>
          </template>
        </List>
      </Col>
    </Row>
    <Empty v-else description="暂无数据" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import type { EchartsUIType } from '@vben/plugins/echarts';
import { Badge, Col, Empty, List, ListItem, Row } from 'ant-design-vue';

import { useAntdDesignTokens } from '@vben/hooks';
import { EchartsUI, useEcharts } from '@vben/plugins/echarts';
import type { DriverRiskCenterApi } from '#/api/hse/driver-risk-center';

const props = defineProps<{
  data: DriverRiskCenterApi.LevelDistributionItem[] | null;
}>();

const chartRef = ref<EchartsUIType>();
const { renderEcharts } = useEcharts(chartRef);
const { tokens } = useAntdDesignTokens();

const levelList = computed(() => props.data || []);
const total = computed(() => levelList.value.reduce((sum, item) => sum + item.count, 0));

const chartOption = computed<Parameters<ReturnType<typeof useEcharts>['renderEcharts']>[0]>(() => {
  if (total.value === 0) {
    return {
      title: {
        text: '暂无数据',
        left: 'center',
        top: 'center',
        textStyle: { color: tokens.colorTextBase, fontSize: 14, fontWeight: 'normal' },
      },
      series: [],
    };
  }

  const data = levelList.value.map(item => ({
    name: item.levelName,
    value: item.count,
    itemStyle: { color: item.colorCode },
  }));

  return {
    tooltip: {
      trigger: 'item',
      backgroundColor: tokens.colorBgElevated,
      textStyle: { color: tokens.colorTextBase },
      formatter: '{b}: {c} ({d}%)',
    },
    series: [
      {
        type: 'pie',
        radius: ['55%', '75%'],
        center: ['50%', '50%'],
        avoidLabelOverlap: false,
        label: {
          show: false,
        },
        data,
      },
    ],
  };
});

watch([() => props.data, tokens], () => {
  renderEcharts(chartOption.value);
}, { deep: true });

onMounted(() => {
  renderEcharts(chartOption.value);
});
</script>

<style lang="less" scoped>
.level-distribution {
}
</style>
