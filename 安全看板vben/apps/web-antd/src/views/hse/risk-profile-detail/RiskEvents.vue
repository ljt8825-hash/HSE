<template>
  <div class="risk-events">
    <a-radio-group v-model:value="activeTab" button-style="solid" class="event-tabs">
      <a-radio-button
        v-for="tab in tabs"
        :key="tab.key"
        :value="tab.key"
      >
        <IconifyIcon :icon="tab.icon" :size="16" />
        <span>{{ tab.label }}</span>
        <span class="tab-count">{{ getCount(tab.key) }}</span>
      </a-radio-button>
    </a-radio-group>

    <div class="event-content">
      <div v-if="activeTab === 'violations'" class="event-list">
        <div v-if="data.violations.length === 0" class="empty-list">
          <IconifyIcon icon="lucide:alert-triangle" :size="32" />
          <span>暂无三违记录</span>
        </div>
        <div v-else class="list-items">
          <div
            v-for="(item, index) in data.violations"
            :key="index"
            class="list-item"
          >
            <div class="item-date">{{ formatDate(item.date) }}</div>
            <div class="item-body">
              <div class="item-title">{{ item.description }}</div>
              <div class="item-meta">
                <span class="meta-tag">{{ item.type }}</span>
                <span class="meta-tag">{{ item.status }}</span>
                <span class="meta-tag">{{ item.township }}</span>
              </div>
            </div>
            <div class="item-amount" v-if="item.amount > 0">
              -{{ item.amount }}
            </div>
          </div>
        </div>
      </div>

      <div v-if="activeTab === 'driverRecords'" class="event-list">
        <div v-if="data.driverRecords.length === 0" class="empty-list">
          <IconifyIcon icon="lucide:car" :size="32" />
          <span>暂无驾驶证扣分记录</span>
        </div>
        <div v-else class="list-items">
          <div
            v-for="(item, index) in data.driverRecords"
            :key="index"
            class="list-item"
          >
            <div class="item-date">{{ formatDate(item.date) }}</div>
            <div class="item-body">
              <div class="item-title">{{ item.description }}</div>
              <div class="item-meta">
                <span class="meta-tag">{{ item.type }}</span>
                <span class="meta-tag">{{ item.status }}</span>
              </div>
            </div>
            <div class="item-detail">
              <span class="detail-item">扣分: {{ item.points }}分</span>
              <span class="detail-item" v-if="item.fineAmount > 0">罚款: {{ item.fineAmount }}</span>
            </div>
          </div>
        </div>
      </div>

      <div v-if="activeTab === 'inspections'" class="event-list">
        <div v-if="data.inspections.length === 0" class="empty-list">
          <IconifyIcon icon="lucide:check-circle" :size="32" />
          <span>暂无三检记录</span>
        </div>
        <div v-else class="list-items">
          <div
            v-for="(item, index) in data.inspections"
            :key="index"
            class="list-item"
          >
            <div class="item-date">{{ formatDate(item.date) }}</div>
            <div class="item-body">
              <div class="item-title">{{ item.siteName }} - {{ item.type }}</div>
              <div class="item-meta">
                <span class="meta-tag" :class="{ pass: item.result === '合格', fail: item.result === '不合格' }">
                  {{ item.result }}
                </span>
                <span class="meta-tag">{{ item.inspector }}</span>
              </div>
            </div>
            <div class="item-description">{{ item.description }}</div>
          </div>
        </div>
      </div>

      <div v-if="activeTab === 'accidents'" class="event-list">
        <div v-if="data.accidents.length === 0" class="empty-list">
          <IconifyIcon icon="lucide:flame" :size="32" />
          <span>暂无事故记录</span>
        </div>
        <div v-else class="list-items">
          <div
            v-for="(item, index) in data.accidents"
            :key="index"
            class="list-item"
          >
            <div class="item-date">{{ formatDate(item.date) }}</div>
            <div class="item-body">
              <div class="item-title">{{ item.description }}</div>
              <div class="item-meta">
                <span class="meta-tag">{{ item.type }}</span>
                <span class="meta-tag">{{ item.level }}</span>
                <span class="meta-tag">{{ item.responsibilityLevel }}</span>
              </div>
            </div>
            <div class="item-detail">
              <span v-if="item.casualties > 0" class="detail-item danger">伤亡: {{ item.casualties }}</span>
              <span v-if="item.injuries > 0" class="detail-item warning">受伤: {{ item.injuries }}</span>
            </div>
          </div>
        </div>
      </div>

      <div v-if="activeTab === 'trainings'" class="event-list">
        <div v-if="data.trainings.length === 0" class="empty-list">
          <IconifyIcon icon="lucide:book-open" :size="32" />
          <span>暂无培训记录</span>
        </div>
        <div v-else class="list-items">
          <div
            v-for="(item, index) in data.trainings"
            :key="index"
            class="list-item"
          >
            <div class="item-date">{{ formatDate(item.date) }}</div>
            <div class="item-body">
              <div class="item-title">{{ item.name }}</div>
              <div class="item-meta">
                <span class="meta-tag">{{ item.type }}</span>
                <span class="meta-tag" :class="{ pass: item.result === '合格', fail: item.result === '不合格' }">
                  {{ item.result }}
                </span>
              </div>
            </div>
            <div class="item-detail">
              <span class="detail-item">{{ item.durationHours }}小时</span>
              <span class="detail-item" v-if="item.expiryDate">{{ formatDate(item.expiryDate) }}到期</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { IconifyIcon } from '@vben/icons';
import type { RiskProfileDetailApi } from '#/api/hse/risk-profile-detail';

const props = defineProps<{
  data: RiskProfileDetailApi.RiskEvents;
}>();

const activeTab = ref<'violations' | 'driverRecords' | 'inspections' | 'accidents' | 'trainings'>('violations');

const tabs = [
  { key: 'violations', label: '三违记录', icon: 'lucide:alert-triangle' },
  { key: 'driverRecords', label: '驾驶证扣分', icon: 'lucide:car' },
  { key: 'inspections', label: '三检记录', icon: 'lucide:check-circle' },
  { key: 'accidents', label: '事故记录', icon: 'lucide:flame' },
  { key: 'trainings', label: '培训记录', icon: 'lucide:book-open' },
] as const;

function getCount(key: string) {
  switch (key) {
    case 'violations':
      return props.data.violations.length;
    case 'driverRecords':
      return props.data.driverRecords.length;
    case 'inspections':
      return props.data.inspections.length;
    case 'accidents':
      return props.data.accidents.length;
    case 'trainings':
      return props.data.trainings.length;
    default:
      return 0;
  }
}

function formatDate(date?: string) {
  if (!date) return '-';
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
</script>

<style lang="less" scoped>
.risk-events {
  .event-tabs {
    display: flex;
    gap: 8px;
    padding-bottom: 16px;
    border-bottom: 1px solid hsl(var(--border));
    overflow-x: auto;

    :deep(.ant-radio-button-wrapper) {
      height: auto;
      padding: 7px 12px;
      line-height: 1.5;
      white-space: nowrap;
    }

    :deep(.ant-radio-button-wrapper > span) {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }

    :deep(.ant-radio-button-wrapper-checked) {
      .tab-count {
        background: hsl(var(--card));
        color: hsl(var(--primary));
      }
    }

      .tab-count {
        background: hsl(var(--border));
        color: hsl(var(--muted-foreground));
        font-size: 12px;
        padding: 2px 8px;
        border-radius: 10px;
      }

  }

  .event-content {
    padding-top: 16px;

    .event-list {
      .empty-list {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 40px;
        color: hsl(var(--muted-foreground));
        font-size: 14px;

        svg {
          margin-bottom: 12px;
        }
      }

      .list-items {
        .list-item {
          display: flex;
          flex-direction: column;
          padding: 12px;
          border-bottom: 1px solid hsl(var(--border));

          &:last-child {
            border-bottom: none;
          }

          .item-date {
            font-size: 12px;
            color: hsl(var(--muted-foreground));
            margin-bottom: 8px;
          }

          .item-body {
            .item-title {
              font-size: 14px;
              font-weight: 600;
              color: hsl(var(--foreground));
              margin-bottom: 6px;
            }

            .item-meta {
              display: flex;
              gap: 8px;

              .meta-tag {
                font-size: 12px;
                padding: 2px 8px;
                border-radius: 4px;
                background: hsl(var(--muted));
                color: hsl(var(--muted-foreground));

                &.pass {
                  background: #f6ffed;
                  color: #52c41a;
                }

                &.fail {
                  background: #fff2f0;
                  color: #ff4d4f;
                }
              }
            }
          }

          .item-amount {
            font-size: 14px;
            font-weight: 600;
            color: #ff4d4f;
            margin-top: 8px;
          }

          .item-detail {
            display: flex;
            gap: 16px;
            margin-top: 8px;

            .detail-item {
              font-size: 12px;
              color: hsl(var(--muted-foreground));

              &.danger {
                color: #ff4d4f;
              }

              &.warning {
                color: #fa8c16;
              }
            }
          }

          .item-description {
            font-size: 13px;
            color: hsl(var(--muted-foreground));
            margin-top: 8px;
            line-height: 1.5;
          }
        }
      }
    }
  }
}
</style>

<!-- 设计系统对齐：
  - :deep(.ant-radio-button-wrapper-checked) .tab-count 的 background:#fff / color:#1890ff 改为语义变量 hsl(var(--card)) / hsl(var(--primary))，主题切换可跟随
  - 中性硬编码色（#f0f0f0→hsl(var(--border))、#f5f5f5→hsl(var(--muted))、#d9d9d9/#8c8c8c→hsl(var(--muted-foreground))、#1f1f1f→hsl(var(--foreground))）统一为语义变量，修复暗色模式不可读
  - 状态徽标底纹(#f6ffed/#fff2f0)与状态色(#52c41a/#ff4d4f/#fa8c16)属固定调色板，保留（待确认）
-->

