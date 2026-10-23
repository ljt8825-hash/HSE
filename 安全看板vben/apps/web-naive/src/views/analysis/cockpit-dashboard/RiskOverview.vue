<script lang="ts" setup>
import type { CockpitApi } from '#/api/hse/cockpit';

import { computed } from 'vue';

import { IconifyIcon } from '@vben/icons';

const props = defineProps<{
  data: CockpitApi.OverviewData | null;
  loading?: boolean;
}>();

const emit = defineEmits<{
  (e: 'levelClick', levelCode: string): void;
}>();

const statItems = computed(() => {
  if (!props.data) return [];
  return [
    {
      key: 'totalEmployees',
      label: '员工总数',
      value: props.data.totalEmployees,
      icon: 'lucide:users',
      color: '#1890ff',
      suffix: '人',
      clickable: false,
    },
    {
      key: 'evaluatedCount',
      label: '已评估人数',
      value: props.data.evaluatedCount,
      icon: 'lucide:user-check',
      color: '#52c41a',
      suffix: '人',
      clickable: false,
    },
    {
      key: 'criticalRiskCount',
      label: '重大风险人数',
      value: props.data.criticalRiskCount,
      icon: 'lucide:alert-triangle',
      color: '#f5222d',
      suffix: '人',
      clickable: true,
      levelCode: 'critical',
    },
    {
      key: 'highRiskCount',
      label: '较高风险人数',
      value: props.data.highRiskCount,
      icon: 'lucide:alert-circle',
      color: '#fa8c16',
      suffix: '人',
      clickable: true,
      levelCode: 'high',
    },
    {
      key: 'highRiskRatio',
      label: '高风险占比',
      value: props.data.highRiskRatio,
      icon: 'lucide:pie-chart',
      color: '#722ed1',
      suffix: '%',
      clickable: false,
    },
    {
      key: 'improvementRate',
      label: '风险改善率',
      value: props.data.improvementRate,
      icon: 'lucide:trending-up',
      color: '#13c2c2',
      suffix: '%',
      clickable: false,
    },
  ];
});

function handleCardClick(item: any) {
  if (item.clickable && item.levelCode) {
    emit('levelClick', item.levelCode);
  }
}
</script>

<template>
  <div class="risk-overview">
    <div class="overview-grid">
      <div
        v-for="item in statItems"
        :key="item.key"
        class="stat-card"
        :class="{ clickable: item.clickable }"
        @click="handleCardClick(item)"
      >
        <div class="stat-icon" :style="{ backgroundColor: item.color + '15', color: item.color }">
          <IconifyIcon :icon="item.icon" :size="24" />
        </div>
        <div class="stat-content">
          <div class="stat-label">{{ item.label }}</div>
          <div class="stat-value" :style="{ color: item.color }">
            <span>{{ item.value }}</span>
            <span class="stat-suffix">{{ item.suffix }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.risk-overview {
  width: 100%;
}

.overview-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 16px;
}

@media (max-width: 1400px) {
  .overview-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (max-width: 768px) {
  .overview-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

.stat-card {
  background: hsl(var(--card));
  border-radius: 8px;
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 16px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
  border: 1px solid hsl(var(--border));
  transition: all 0.3s ease;
}

.stat-card.clickable {
  cursor: pointer;
}

.stat-card.clickable:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.stat-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.stat-content {
  flex: 1;
  min-width: 0;
}

.stat-label {
  font-size: 13px;
  color: hsl(var(--muted-foreground));
  margin-bottom: 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.stat-value {
  font-size: 24px;
  font-weight: 600;
  line-height: 1.2;
}

.stat-suffix {
  font-size: 14px;
  font-weight: 400;
  margin-left: 4px;
}
</style>
