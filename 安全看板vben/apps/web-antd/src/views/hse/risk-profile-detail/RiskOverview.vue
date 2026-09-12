<template>
  <div class="risk-overview">
    <div class="score-card">
      <div class="score-ring">
        <div class="ring-progress" :style="ringStyle">
          <div class="ring-center">
            <div class="score-value">{{ data.totalScore }}</div>
            <div class="score-label">综合风险积分</div>
          </div>
        </div>
      </div>
      <div class="risk-level" :style="{ backgroundColor: data.riskLevelColor + '15', color: data.riskLevelColor }">
        <IconifyIcon :icon="levelIcon" :size="20" />
        <span>{{ data.riskLevelName }}</span>
      </div>
    </div>

    <div class="stats-row">
      <div class="stat-item">
        <div class="stat-icon" style="background-color: #1890ff15; color: #1890ff;">
          <IconifyIcon icon="lucide:trending-up" :size="20" />
        </div>
        <div class="stat-content">
          <div class="stat-label">风险趋势</div>
          <div class="stat-value">{{ trendText }}</div>
        </div>
      </div>
      <div class="stat-item">
        <div class="stat-icon" style="background-color: #fa8c1615; color: #fa8c16;">
          <IconifyIcon icon="lucide:trophy" :size="20" />
        </div>
        <div class="stat-content">
          <div class="stat-label">风险排名</div>
          <div class="stat-value">{{ data.rank !== null ? `第 ${data.rank} 名` : '-' }}</div>
        </div>
      </div>
    </div>

    <div class="calculated-time" v-if="data.calculatedAt">
      <IconifyIcon icon="lucide:clock" :size="14" />
      <span>计算时间：{{ formatDateTime(data.calculatedAt) }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { IconifyIcon } from '@vben/icons';
import type { RiskProfileDetailApi } from '#/api/hse/risk-profile-detail';

const props = defineProps<{
  data: RiskProfileDetailApi.RiskOverview;
}>();

const levelIcon = computed(() => {
  const level = props.data.riskLevel;
  if (level === 'critical') return 'lucide:alert-triangle';
  if (level === 'high') return 'lucide:alert-circle';
  if (level === 'medium') return 'lucide:circle';
  return 'lucide:check-circle';
});

const ringStyle = computed(() => {
  const score = props.data.totalScore;
  const percentage = Math.min(score / 100, 1);
  const deg = percentage * 360;
  return {
    background: `conic-gradient(${props.data.riskLevelColor} 0deg, ${props.data.riskLevelColor} ${deg}deg, hsl(var(--muted)) ${deg}deg, hsl(var(--muted)) 360deg)`,
  };
});

const trendText = computed(() => {
  return '-';
});

function formatDateTime(dateTime?: string) {
  if (!dateTime) return '-';
  const date = new Date(dateTime);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
</script>

<style lang="less" scoped>
.risk-overview {
  padding: 16px;

  .score-card {
    display: flex;
    align-items: center;
    gap: 24px;
    margin-bottom: 20px;

    .score-ring {
      .ring-progress {
        width: 140px;
        height: 140px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;

        .ring-center {
          width: 110px;
          height: 110px;
          border-radius: 50%;
          background: hsl(var(--card));
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;

          .score-value {
            font-size: 32px;
            font-weight: 700;
            color: hsl(var(--foreground));
          }

          .score-label {
            font-size: 12px;
            color: hsl(var(--muted-foreground));
            margin-top: 4px;
          }
        }
      }
    }

    .risk-level {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
    }
  }

  .stats-row {
    display: flex;
    gap: 16px;

    .stat-item {
      flex: 1;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px;
      background: hsl(var(--muted));
      border-radius: 8px;

      .stat-icon {
        width: 40px;
        height: 40px;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .stat-content {
        .stat-label {
          font-size: 12px;
          color: hsl(var(--muted-foreground));
        }

        .stat-value {
          font-size: 16px;
          font-weight: 600;
          color: hsl(var(--foreground));
          margin-top: 2px;
        }
      }
    }
  }

  .calculated-time {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: hsl(var(--muted-foreground));
    margin-top: 16px;
    padding-top: 12px;
    border-top: 1px solid hsl(var(--border));
  }
}
</style>