<template>
  <Page auto-content-height class="risk-profile-detail-page">
    <div class="profile-container">
      <div class="profile-header">
        <div class="header-left">
          <Button type="default" @click="handleBack">
            <IconifyIcon icon="lucide:arrow-left" :size="16" />
            <span>返回</span>
          </Button>
          <div class="header-title">
            <IconifyIcon icon="lucide:user-circle" :size="24" />
            <h2>员工风险画像详情</h2>
          </div>
        </div>
      </div>

      <div v-if="profileData" class="profile-content">
        <div class="content-left">
          <Card class="profile-card" :bordered="false">
            <template #title>
              <div class="card-title">
                <IconifyIcon icon="lucide:user" :size="16" />
                <span>员工基础信息</span>
              </div>
            </template>
            <BasicInfo :data="profileData?.basicInfo" />
          </Card>

          <Card class="profile-card" :bordered="false">
            <template #title>
              <div class="card-title">
                <IconifyIcon icon="lucide:activity" :size="16" />
                <span>风险总览</span>
              </div>
            </template>
            <RiskOverview :data="profileData?.riskOverview" />
          </Card>

          <Card class="profile-card" :bordered="false">
            <template #title>
              <div class="card-title">
                <IconifyIcon icon="lucide:pie-chart" :size="16" />
                <span>风险构成</span>
              </div>
            </template>
            <RiskComposition :data="profileData?.riskComposition" />
          </Card>
        </div>

        <div class="content-right">
          <Card class="profile-card" :bordered="false">
            <template #title>
              <div class="card-title">
                <IconifyIcon icon="lucide:trending-up" :size="16" />
                <span>风险趋势</span>
              </div>
            </template>
            <RiskTrend
              :data="trendData"
              :loading="loading.trend"
              @period-change="handlePeriodChange"
            />
          </Card>

          <Card class="profile-card event-card" :bordered="false">
            <template #title>
              <div class="card-title">
                <IconifyIcon icon="lucide:clipboard-list" :size="16" />
                <span>风险事件明细</span>
              </div>
            </template>
            <RiskEvents :data="profileData?.riskEvents" />
          </Card>
        </div>
      </div>
      <div v-else class="profile-loading">
        <a-spin tip="加载员工风险画像..." />
      </div>
    </div>
  </Page>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, watch } from 'vue';
import { Page } from '@vben/common-ui';
import { Card, Button, message } from 'ant-design-vue';
import { IconifyIcon } from '@vben/icons';
import { useRoute } from 'vue-router';
import {
  getProfileDetail,
  getProfileTrend,
  type RiskProfileDetailApi,
} from '#/api/hse/risk-profile-detail';
import BasicInfo from './BasicInfo.vue';
import RiskOverview from './RiskOverview.vue';
import RiskComposition from './RiskComposition.vue';
import RiskEvents from './RiskEvents.vue';
import RiskTrend from './RiskTrend.vue';

const route = useRoute();
const profileData = ref<RiskProfileDetailApi.ProfileDetail | null>(null);
const trendData = ref<RiskProfileDetailApi.TrendData | null>(null);

const loading = reactive({
  profile: false,
  trend: false,
});

async function loadProfile() {
  const employeeId = parseInt(route.params.employeeId as string);
  if (!employeeId) {
    message.error('员工ID无效');
    return;
  }

  loading.profile = true;
  try {
    profileData.value = await getProfileDetail(employeeId);
    loadTrend(employeeId, 'week');
  } catch (e: any) {
    message.error(e.message || '加载员工风险画像失败');
  } finally {
    loading.profile = false;
  }
}

async function loadTrend(employeeId: number, period: RiskProfileDetailApi.TrendPeriod) {
  loading.trend = true;
  try {
    trendData.value = await getProfileTrend(employeeId, period);
  } catch (e: any) {
    message.error(e.message || '加载风险趋势失败');
  } finally {
    loading.trend = false;
  }
}

function handlePeriodChange(period: RiskProfileDetailApi.TrendPeriod) {
  const employeeId = parseInt(route.params.employeeId as string);
  if (employeeId) {
    loadTrend(employeeId, period);
  }
}

function handleBack() {
  window.history.back();
}

watch(
  () => route.params.employeeId,
  () => {
    loadProfile();
  }
);

onMounted(() => {
  loadProfile();
});
</script>

<style lang="less" scoped>
.risk-profile-detail-page {
  .profile-container {
    padding: 20px;

    .profile-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;

      .header-left {
        display: flex;
        align-items: center;
        gap: 16px;

        .header-title {
          display: flex;
          align-items: center;
          gap: 8px;

          h2 {
            font-size: 20px;
            font-weight: 600;
            color: #1f1f1f;
            margin: 0;
          }
        }
      }
    }

    .profile-loading {
      display: flex;
      justify-content: center;
      padding: 80px 0;
    }

    .profile-content {
      display: flex;
      gap: 20px;

      .content-left {
        width: 380px;
        flex-shrink: 0;

        .profile-card {
          margin-bottom: 20px;

          &:last-child {
            margin-bottom: 0;
          }
        }
      }

      .content-right {
        flex: 1;

        .profile-card {
          margin-bottom: 20px;

          &:last-child {
            margin-bottom: 0;
          }

          &.event-card {
            max-height: calc(100vh - 450px);
            overflow-y: auto;
          }
        }
      }
    }
  }
}

@media (max-width: 1200px) {
  .risk-profile-detail-page {
    .profile-content {
      flex-direction: column;

      .content-left {
        width: 100%;
      }
    }
  }
}
</style>
