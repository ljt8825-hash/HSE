<script lang="ts" setup>
/**
 * 员工风险画像详情（web-naive）
 * 展示员工基础信息、风险总览、风险构成、风险趋势、风险事件明细
 */
import { computed, reactive, ref, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import {
  NAlert,
  NBackTop,
  NButton,
  NCard,
  NDescriptions,
  NDescriptionsItem,
  NEmpty,
  NGi,
  NGrid,
  NProgress,
  NSpin,
  NStatistic,
  NTabPane,
  NTabs,
  NTag,
  NText,
  NSpace,
} from 'naive-ui';

import { HsePageLayout, HseStatusTag } from '#/components/hse';
import {
  getProfileDetail,
  getProfileTrend,
  type RiskProfileDetailApi,
} from '#/api/hse/risk-profile-detail';
import { message } from '#/adapter/naive';

defineOptions({ name: 'HseRiskProfileDetail' });

const route = useRoute();
const router = useRouter();
const loading = reactive({
  profile: false,
  trend: false,
});

const profileData = ref<RiskProfileDetailApi.ProfileDetail | null>(null);
const trendData = ref<RiskProfileDetailApi.TrendData | null>(null);
const trendPeriod = ref<RiskProfileDetailApi.TrendPeriod>('week');

async function loadProfile() {
  const employeeId = Number(route.params.employeeId);
  if (!employeeId || Number.isNaN(employeeId)) {
    message.error('员工ID无效');
    return;
  }

  loading.profile = true;
  try {
    profileData.value = await getProfileDetail(employeeId);
    await loadTrend(employeeId, trendPeriod.value);
  } catch {
    message.error('加载员工风险画像失败');
  } finally {
    loading.profile = false;
  }
}

async function loadTrend(employeeId: number, period: RiskProfileDetailApi.TrendPeriod) {
  loading.trend = true;
  try {
    trendData.value = await getProfileTrend(employeeId, period);
  } catch {
    trendData.value = null;
  } finally {
    loading.trend = false;
  }
}

function handleBack() {
  router.back();
}

function handlePeriodChange(period: RiskProfileDetailApi.TrendPeriod) {
  trendPeriod.value = period;
  const employeeId = Number(route.params.employeeId);
  if (employeeId) {
    loadTrend(employeeId, period);
  }
}

function getRiskLevelType(level: string): 'success' | 'info' | 'warning' | 'danger' | 'neutral' {
  const map: Record<string, 'success' | 'info' | 'warning' | 'danger' | 'neutral'> = {
    low: 'success',
    medium: 'warning',
    high: 'danger',
    critical: 'danger',
  };
  return map[level] || 'neutral';
}

function getRiskLevelText(level: string): string {
  const map: Record<string, string> = {
    low: '低风险',
    medium: '中风险',
    high: '高风险',
    critical: '极高风险',
  };
  return map[level] || level;
}

function getDimensionLabel(key: string): string {
  const map: Record<string, string> = {
    violation: '违章记录',
    driverCompliance: '驾驶合规',
    incident: '事故记录',
    trainingCompliance: '培训合规',
    managementExecution: '管理执行',
  };
  return map[key] || key;
}

const compositionList = computed(() => {
  if (!profileData.value?.riskComposition) return [];
  const comp = profileData.value.riskComposition;
  return Object.entries(comp)
    .filter(([, v]) => v && v.applicable)
    .map(([key, value]) => ({
      key,
      label: getDimensionLabel(key),
      score: value.score,
      weight: value.weight,
    }))
    .sort((a, b) => b.score - a.score);
});

const trendPoints = computed(() => {
  if (!trendData.value?.trend) return [];
  return trendData.value.trend;
});

watch(
  () => route.params.employeeId,
  () => {
    loadProfile();
  },
);

onMounted(() => {
  loadProfile();
});
</script>

<template>
  <HsePageLayout title="员工风险画像详情" description="员工风险画像综合分析">
    <template #extra>
      <NButton @click="handleBack">
        <template #icon>
          <span>←</span>
        </template>
        返回
      </NButton>
    </template>

    <div v-if="loading.profile" class="flex items-center justify-center" style="min-height: 400px;">
      <NSpin size="large" description="加载中..." />
    </div>

    <template v-else-if="profileData">
      <!-- 基础信息 -->
      <NCard title="员工基础信息" :bordered="false" class="mb-4">
        <NDescriptions :column="3" bordered label-placement="left" size="small">
          <NDescriptionsItem label="姓名">{{ profileData.basicInfo.name }}</NDescriptionsItem>
          <NDescriptionsItem label="工号">{{ profileData.basicInfo.employeeCode }}</NDescriptionsItem>
          <NDescriptionsItem label="性别">{{ profileData.basicInfo.gender }}</NDescriptionsItem>
          <NDescriptionsItem label="部门">{{ profileData.basicInfo.department }}</NDescriptionsItem>
          <NDescriptionsItem label="岗位">{{ profileData.basicInfo.position }}</NDescriptionsItem>
          <NDescriptionsItem label="运营单元">{{ profileData.basicInfo.operationUnit }}</NDescriptionsItem>
          <NDescriptionsItem label="人员类型">{{ profileData.basicInfo.personType }}</NDescriptionsItem>
          <NDescriptionsItem label="人员分类">{{ profileData.basicInfo.personCategory }}</NDescriptionsItem>
          <NDescriptionsItem label="状态">
            <NTag type="success" size="small">{{ profileData.basicInfo.status }}</NTag>
          </NDescriptionsItem>
          <NDescriptionsItem label="联系方式">{{ profileData.basicInfo.phone }}</NDescriptionsItem>
          <NDescriptionsItem label="身份证号">{{ profileData.basicInfo.idCard }}</NDescriptionsItem>
          <NDescriptionsItem label="出生日期">{{ profileData.basicInfo.birthDate }}</NDescriptionsItem>
        </NDescriptions>
      </NCard>

      <!-- 风险总览 -->
      <NCard title="风险总览" :bordered="false" class="mb-4">
        <NGrid :cols="4" :x-gap="16">
          <NGi>
            <NCard :bordered="false" size="small">
              <NStatistic label="风险总分" :value="profileData.riskOverview.totalScore" />
            </NCard>
          </NGi>
          <NGi>
            <NCard :bordered="false" size="small">
              <NStatistic label="风险等级">
                <template #suffix>
                  <HseStatusTag :type="getRiskLevelType(profileData.riskOverview.riskLevel)">
                    {{ profileData.riskOverview.riskLevelName || getRiskLevelText(profileData.riskOverview.riskLevel) }}
                  </HseStatusTag>
                </template>
              </NStatistic>
            </NCard>
          </NGi>
          <NGi>
            <NCard :bordered="false" size="small">
              <NStatistic
                label="风险排名"
                :value="profileData.riskOverview.rank ?? '-'"
                :suffix="profileData.riskOverview.totalEmployees ? `/ ${profileData.riskOverview.totalEmployees}` : ''"
              />
            </NCard>
          </NGi>
          <NGi>
            <NCard :bordered="false" size="small">
              <NStatistic
                label="计算时间"
                :value="profileData.riskOverview.calculatedAt ? new Date(profileData.riskOverview.calculatedAt).toLocaleDateString('zh-CN') : '-'"
              />
            </NCard>
          </NGi>
        </NGrid>
      </NCard>

      <!-- 风险构成 -->
      <NCard title="风险构成" :bordered="false" class="mb-4">
        <div v-if="compositionList.length > 0" class="space-y-4">
          <div v-for="dim in compositionList" :key="dim.key" class="flex items-center gap-4">
            <NText class="w-24 text-right">{{ dim.label }}</NText>
            <div class="flex-1">
              <NProgress
                :percentage="Math.min(Math.round(dim.score), 100)"
                :color="dim.score >= 70 ? '#d03050' : dim.score >= 40 ? '#f0a020' : '#18a058'"
                :show-indicator="false"
                :height="12"
                :border-radius="6"
              />
            </div>
            <NText strong class="w-20">{{ dim.score.toFixed(1) }} 分</NText>
            <NText depth="3" class="w-16">权重 {{ (dim.weight * 100).toFixed(0) }}%</NText>
          </div>
        </div>
        <NEmpty v-else description="暂无风险构成数据" style="padding: 40px 0;" />
      </NCard>

      <!-- 风险趋势 -->
      <NCard title="风险趋势" :bordered="false" class="mb-4">
        <template #header-extra>
          <NSpace>
            <NButton
              size="small"
              :type="trendPeriod === 'day' ? 'primary' : 'default'"
              @click="handlePeriodChange('day')"
            >
              日
            </NButton>
            <NButton
              size="small"
              :type="trendPeriod === 'week' ? 'primary' : 'default'"
              @click="handlePeriodChange('week')"
            >
              周
            </NButton>
            <NButton
              size="small"
              :type="trendPeriod === 'month' ? 'primary' : 'default'"
              @click="handlePeriodChange('month')"
            >
              月
            </NButton>
          </NSpace>
        </template>
        <div v-if="loading.trend" class="flex items-center justify-center" style="min-height: 200px;">
          <NSpin />
        </div>
        <div v-else-if="trendPoints.length > 0" class="space-y-2">
          <div v-for="(point, index) in trendPoints" :key="index" class="flex items-center gap-4">
            <NText depth="3" class="w-28">{{ point.periodDate }}</NText>
            <div class="flex-1">
              <NProgress
                :percentage="Math.min(Math.round(point.avgScore), 100)"
                :color="point.avgScore >= 70 ? '#d03050' : point.avgScore >= 40 ? '#f0a020' : '#18a058'"
                :show-indicator="false"
                :height="10"
                :border-radius="5"
              />
            </div>
            <NText strong class="w-20">均{{ point.avgScore.toFixed(1) }}</NText>
            <NText depth="3" class="w-24">样本 {{ point.sampleCount }}</NText>
          </div>
        </div>
        <NEmpty v-else description="暂无趋势数据" style="padding: 40px 0;" />
      </NCard>

      <!-- 风险事件明细 -->
      <NCard title="风险事件明细" :bordered="false">
        <NTabs type="line" default-value="violations">
          <NTabPane name="violations" tab="违章记录">
            <template v-if="profileData.riskEvents.violations?.length">
              <NDescriptions :column="2" bordered size="small">
                <template v-for="(v, i) in profileData.riskEvents.violations" :key="i">
                  <NDescriptionsItem :label="`[${v.date}] ${v.type}`" :span="2">
                    <NSpace vertical :size="4">
                      <NText>{{ v.description }}</NText>
                      <NSpace>
                        <NTag size="small" type="warning">{{ v.punishment }}</NTag>
                        <NText depth="3" size="small">罚款: ¥{{ v.amount }}</NText>
                        <NText depth="3" size="small">{{ v.township }}</NText>
                      </NSpace>
                    </NSpace>
                  </NDescriptionsItem>
                </template>
              </NDescriptions>
            </template>
            <NEmpty v-else description="暂无违章记录" style="padding: 30px 0;" />
          </NTabPane>
          <NTabPane name="accidents" tab="事故记录">
            <template v-if="profileData.riskEvents.accidents?.length">
              <NDescriptions :column="2" bordered size="small">
                <template v-for="(a, i) in profileData.riskEvents.accidents" :key="i">
                  <NDescriptionsItem :label="`[${a.date}] ${a.type}`" :span="2">
                    <NSpace vertical :size="4">
                      <NText>{{ a.description }}</NText>
                      <NSpace>
                        <NTag size="small" type="error">{{ a.level }}</NTag>
                        <NText depth="3" size="small">责任: {{ a.responsibilityLevel }}</NText>
                        <NText depth="3" size="small">伤亡: {{ a.casualties }} / 受伤: {{ a.injuries }}</NText>
                        <NText depth="3" size="small">损失: ¥{{ a.lossAmount }}</NText>
                      </NSpace>
                    </NSpace>
                  </NDescriptionsItem>
                </template>
              </NDescriptions>
            </template>
            <NEmpty v-else description="暂无事故记录" style="padding: 30px 0;" />
          </NTabPane>
          <NTabPane name="trainings" tab="培训记录">
            <template v-if="profileData.riskEvents.trainings?.length">
              <NDescriptions :column="2" bordered size="small">
                <template v-for="(t, i) in profileData.riskEvents.trainings" :key="i">
                  <NDescriptionsItem :label="`[${t.date}] ${t.name}`" :span="2">
                    <NSpace vertical :size="4">
                      <NSpace>
                        <NTag size="small" :type="t.result === '合格' ? 'success' : 'error'">{{ t.result }}</NTag>
                        <NText depth="3" size="small">类型: {{ t.type }}</NText>
                        <NText depth="3" size="small">时长: {{ t.durationHours }}h</NText>
                        <NText depth="3" size="small">有效期至: {{ t.expiryDate }}</NText>
                      </NSpace>
                    </NSpace>
                  </NDescriptionsItem>
                </template>
              </NDescriptions>
            </template>
            <NEmpty v-else description="暂无培训记录" style="padding: 30px 0;" />
          </NTabPane>
        </NTabs>
      </NCard>
    </template>

    <NAlert v-else type="error" :show-icon="true">
      无法加载员工风险画像数据，请检查员工ID是否正确。
    </NAlert>

    <NBackTop />
  </HsePageLayout>
</template>
