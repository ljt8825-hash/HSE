<script lang="ts" setup>
/**
 * 供应链安全（web-naive · 占位页面）
 * 功能建设中
 */
import { NCard, NEmpty, NGi, NGrid, NStatistic } from 'naive-ui';

import { HsePageLayout } from '#/components/hse';

defineOptions({ name: 'HseSupplyChain' });

const statItems = [
  { key: 'suppliers', label: '供应商数', value: 56, suffix: '家' },
  { key: 'qualifiedRate', label: '合格率', value: 86, suffix: '%' },
  { key: 'riskSuppliers', label: '风险供应商', value: 3, suffix: '家' },
  { key: 'evaluationRate', label: '评估完成率', value: 92, suffix: '%' },
];
</script>

<template>
  <HsePageLayout :title="$t('page.hse.supplyChain')" description="供应商安全评估与风险管理">
    <!-- 统计卡 -->
    <NGrid :cols="4" :x-gap="12" :y-gap="12" class="mb-4">
      <NGi v-for="stat in statItems" :key="stat.key">
        <NCard :bordered="false" size="small">
          <NStatistic :label="stat.label" :value="stat.value" :suffix="stat.suffix" />
        </NCard>
      </NGi>
    </NGrid>

    <!-- 占位区域 -->
    <NCard title="供应商安全评估" :bordered="false" class="mb-4">
      <NEmpty description="供应商安全评估管理 - 功能建设中，敬请期待" style="padding: 60px 0;">
        <template #icon>
          <div class="text-6xl opacity-30">🚚</div>
        </template>
      </NEmpty>
    </NCard>

    <NGrid :cols="2" :x-gap="12">
      <NGi>
        <NCard title="风险供应商列表" :bordered="false">
          <NEmpty description="风险供应商清单 - 功能建设中" style="padding: 40px 0;">
            <template #icon>
              <div class="text-4xl opacity-30">⚠️</div>
            </template>
          </NEmpty>
        </NCard>
      </NGi>
      <NGi>
        <NCard title="供应商等级分布" :bordered="false">
          <NEmpty description="等级分布图表 - 功能建设中" style="padding: 40px 0;">
            <template #icon>
              <div class="text-4xl opacity-30">📊</div>
            </template>
          </NEmpty>
        </NCard>
      </NGi>
    </NGrid>
  </HsePageLayout>
</template>
