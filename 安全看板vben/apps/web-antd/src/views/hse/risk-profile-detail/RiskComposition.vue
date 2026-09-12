<template>
  <div class="risk-composition">
    <div v-if="data" class="composition-list">
      <div
        v-for="(dim, key) in dimensions"
        :key="key"
        class="composition-item"
        :class="{ disabled: !dim.applicable }"
      >
        <div class="item-header">
          <div class="item-icon" :style="{ backgroundColor: dim.color + '15', color: dim.color }">
            <IconifyIcon :icon="dim.icon" :size="18" />
          </div>
          <div class="item-info">
            <div class="item-name">{{ dim.name }}</div>
            <div class="item-weight">权重 {{ (dim.weight * 100).toFixed(0) }}%</div>
          </div>
          <div class="item-score" :style="{ color: dim.color }">
            {{ dim.score }}
          </div>
        </div>
        <div class="progress-bar">
          <div
            class="progress-fill"
            :style="{ width: dim.score + '%', backgroundColor: dim.color }"
          ></div>
        </div>
        <div class="item-footer">
          <span class="raw-value">原始值: {{ dim.rawValue }}</span>
          <span v-if="!dim.applicable" class="not-applicable">不适用</span>
        </div>
      </div>
    </div>
    <div v-else class="empty-state">
      <IconifyIcon icon="lucide:bar-chart-3" :size="48" class="empty-icon" />
      <div class="empty-text">暂无风险构成数据</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { IconifyIcon } from '@vben/icons';
import type { RiskProfileDetailApi } from '#/api/hse/risk-profile-detail';

const props = defineProps<{
  data: RiskProfileDetailApi.RiskComposition | null;
}>();

const dimensions = computed(() => {
  if (!props.data) return [];
  return [
    {
      key: 'violation',
      name: '三违风险',
      icon: 'lucide:alert-triangle',
      color: '#f5222d',
      ...props.data.violation,
    },
    {
      key: 'driverCompliance',
      name: '驾驶风险',
      icon: 'lucide:car',
      color: '#fa8c16',
      ...props.data.driverCompliance,
    },
    {
      key: 'incident',
      name: '事故风险',
      icon: 'lucide:flame',
      color: '#722ed1',
      ...props.data.incident,
    },
    {
      key: 'trainingCompliance',
      name: '培训风险',
      icon: 'lucide:book-open',
      color: '#1890ff',
      ...props.data.trainingCompliance,
    },
    {
      key: 'managementExecution',
      name: '管理履职风险',
      icon: 'lucide:clipboard-check',
      color: '#13c2c2',
      ...props.data.managementExecution,
    },
  ];
});
</script>

<style lang="less" scoped>
.risk-composition {
  padding: 16px;

  .composition-list {
    .composition-item {
      padding: 12px;
      background: hsl(var(--muted));
      border-radius: 8px;
      margin-bottom: 12px;
      transition: all 0.3s;

      &:last-child {
        margin-bottom: 0;
      }

      &.disabled {
        opacity: 0.5;
      }

      .item-header {
        display: flex;
        align-items: center;
        gap: 12px;

        .item-icon {
          width: 36px;
          height: 36px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .item-info {
          flex: 1;

          .item-name {
            font-size: 14px;
            font-weight: 600;
            color: hsl(var(--foreground));
          }

          .item-weight {
            font-size: 12px;
            color: hsl(var(--muted-foreground));
            margin-top: 2px;
          }
        }

        .item-score {
          font-size: 24px;
          font-weight: 700;
        }
      }

      .progress-bar {
        height: 6px;
        background: hsl(var(--muted));
        border-radius: 3px;
        margin: 12px 0;
        overflow: hidden;

        .progress-fill {
          height: 100%;
          border-radius: 3px;
          transition: width 0.3s ease;
        }
      }

      .item-footer {
        display: flex;
        justify-content: space-between;
        font-size: 12px;
        color: hsl(var(--muted-foreground));

        .not-applicable {
          color: hsl(var(--muted-foreground));
        }
      }
    }
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 40px;

    .empty-icon {
      color: hsl(var(--muted-foreground));
      margin-bottom: 12px;
    }

    .empty-text {
      font-size: 14px;
      color: hsl(var(--muted-foreground));
    }
  }
}
</style>