<template>
  <HsePageLayout :auto-content-height="true" class="hse-overview-page">
    <template #title>
      <div class="flex items-center gap-2">
        <IconifyIcon icon="lucide:layout-dashboard" :size="20" />
        <span>安全总览首页</span>
      </div>
    </template>

    <div class="overview-container">
      <div class="overview-header">
        <div class="overview-title">
          <IconifyIcon icon="lucide:layout-dashboard" :size="24" class="title-icon" />
          <h2 class="title-text">安全总览首页</h2>
        </div>
        <div class="overview-filters">
          <NSelect
            v-model:value="selectedYear"
            :options="yearOptions"
            style="width: 140px"
            @update:value="fetchStats"
          />
          <NDatePicker
            v-model:value="dateRange"
            type="daterange"
            style="width: 280px"
            @update:value="fetchStats"
          />
        </div>
      </div>

      <template v-for="(group, gKey) in cardGroups" :key="gKey">
        <div v-if="group.cards.length > 0" class="overview-section">
          <div class="section-header">
            <IconifyIcon :icon="groupIcons[gKey] || 'lucide:layout-grid'" :size="18" class="section-icon" />
            <span class="section-title">{{ group.title }}</span>
            <span class="section-count">{{ group.cards.length }}项指标</span>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            <HseStatCard
              v-for="card in group.cards"
              :key="card.card_code"
              :title="card.card_title"
              :value="getCardValue(card)"
              :icon="card.icon"
              :color="card.semantic_color"
              :clickable="card.click_action !== 'none'"
              :loading="statsLoading"
              @click="handleCardClick(card)"
            />
          </div>
        </div>
      </template>

      <div class="overview-section">
        <div class="section-header">
          <IconifyIcon icon="lucide:bell-alert" :size="18" class="section-icon" />
          <span class="section-title">待办提醒</span>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          <NCard class="reminder-card reminder-danger" :bordered="false" :hoverable="true" @click="router.push('/hazards/list')">
            <div class="reminder-content">
              <IconifyIcon icon="lucide:alert-octagon" :size="28" class="reminder-icon" />
              <div>
                <div class="reminder-value">{{ stats.hazard.expired || 0 }}</div>
                <div class="reminder-label">超期隐患</div>
              </div>
            </div>
          </NCard>
          <NCard class="reminder-card reminder-warning" :bordered="false" :hoverable="true" @click="router.push('/hazards/list')">
            <div class="reminder-content">
              <IconifyIcon icon="lucide:clock-alert" :size="28" class="reminder-icon" />
              <div>
                <div class="reminder-value">{{ stats.hazard.pending || 0 }}</div>
                <div class="reminder-label">待整改隐患</div>
              </div>
            </div>
          </NCard>
          <NCard class="reminder-card reminder-warning" :bordered="false" :hoverable="true" @click="router.push('/training/certificates')">
            <div class="reminder-content">
              <IconifyIcon icon="lucide:alert-triangle" :size="28" class="reminder-icon" />
              <div>
                <div class="reminder-value">{{ stats.training.certificates.expiring || 0 }}</div>
                <div class="reminder-label">临期证书</div>
              </div>
            </div>
          </NCard>
          <NCard class="reminder-card reminder-danger" :bordered="false" :hoverable="true" @click="router.push('/training/certificates')">
            <div class="reminder-content">
              <IconifyIcon icon="lucide:x-circle" :size="28" class="reminder-icon" />
              <div>
                <div class="reminder-value">{{ stats.training.certificates.expired || 0 }}</div>
                <div class="reminder-label">过期证书</div>
              </div>
            </div>
          </NCard>
        </div>
      </div>
    </div>
  </HsePageLayout>
</template>

<script lang="ts" setup>
import { ref, reactive, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { NCard, NSelect, NDatePicker } from 'naive-ui';
import { IconifyIcon } from '@vben/icons';
import HsePageLayout from '#/components/hse/HsePageLayout.vue';
import HseStatCard from '#/components/hse/HseStatCard.vue';
import { requestClient } from '#/api/request';
import { message } from '#/adapter/naive';

defineOptions({ name: 'HseCockpitOverview' });

const router = useRouter();
const statsLoading = ref(false);
const selectedYear = ref(new Date().getFullYear());
const dateRange = ref<[number, number] | null>(null);
const yearOptions = [2024, 2025, 2026].map(y => ({ value: y, label: `${y}年` }));

const stats = reactive<any>({
  risk: { total: 0, byLevel: {}, expiring: 0, expired: 0, linkedHazards: 0 },
  hazard: { total: 0, byLevel: {}, byStatus: {}, expiring: 0, expired: 0, closed: 0, relatedRisks: 0, pending: 0 },
  training: {
    plans: { total: 0, byStatus: {} },
    records: { totalHours: 0, count: 0 },
    assessments: { pass: 0, fail: 0, byGrade: {} },
    certificates: { valid: 0, expiring: 0, expired: 0 },
    comprehensive: { gradeA: 0 },
  },
  personnel: { total: 0, overAge: 0 },
  violations: { total: 0, pending: 0 },
});

const cardGroups = reactive<any>({
  risk_control: { title: '风险管控', cards: [] },
  hazard_governance: { title: '隐患治理', cards: [] },
  training_assessment: { title: '培训考核', cards: [] },
  personnel: { title: '人员管理', cards: [] },
  site_mgmt: { title: '现场管理', cards: [] },
  other: { title: '其他', cards: [] },
});

const groupIcons: Record<string, string> = {
  risk_control: 'lucide:shield-alert',
  hazard_governance: 'lucide:search-check',
  training_assessment: 'lucide:graduation-cap',
  personnel: 'lucide:users',
  site_mgmt: 'lucide:hard-hat',
  other: 'lucide:layout-grid',
};

function getCardValue(card: any) {
  const params = card.data_source_params || {};
  const field = params.field;
  const key = params.key;
  const moduleCode = card.module_code;

  if (moduleCode === 'risk_control') {
    if (field === 'total') return stats.risk.total;
    if (field === 'byLevel') return stats.risk.byLevel?.[key] || 0;
    if (field === 'expiring') return stats.risk.expiring || 0;
    if (field === 'expired') return stats.risk.expired || 0;
    if (field === 'linkedHazards') return stats.risk.linkedHazards || 0;
  }
  if (moduleCode === 'hazard_governance') {
    if (field === 'total') return stats.hazard.total;
    if (field === 'byLevel') return stats.hazard.byLevel?.[key] || 0;
    if (field === 'byStatus') return stats.hazard.byStatus?.[key] || 0;
    if (field === 'expiring') return stats.hazard.expiring || 0;
    if (field === 'expired') return stats.hazard.expired || 0;
    if (field === 'closed') return stats.hazard.closed || 0;
    if (field === 'relatedRisks') return stats.hazard.relatedRisks || 0;
  }
  if (['training_plan', 'training_record', 'assessment', 'certificate', 'comprehensive'].includes(moduleCode)) {
    if (field === 'plans.total') return stats.training.plans.total;
    if (field === 'plans.byStatus') return stats.training.plans.byStatus?.[key] || 0;
    if (field === 'training.totalHours') return stats.training.records.totalHours || 0;
    if (field === 'training.recordCount') return stats.training.records.count || 0;
    if (field === 'assessments.pass') return stats.training.assessments.pass || 0;
    if (field === 'assessments.fail') return stats.training.assessments.fail || 0;
    if (field === 'assessments.byGrade') return stats.training.assessments.byGrade?.[key] || 0;
    if (field === 'certificates.valid') return stats.training.certificates.valid || 0;
    if (field === 'certificates.expiring') return stats.training.certificates.expiring || 0;
    if (field === 'certificates.expired') return stats.training.certificates.expired || 0;
    if (field === 'comprehensive.gradeA') return stats.training.comprehensive.gradeA || 0;
  }
  if (moduleCode === 'personnel') {
    if (field === 'total') return stats.personnel.total || 0;
  }
  if (moduleCode === 'violation' || moduleCode === 'site_mgmt') {
    if (field === 'total') return stats.violations.total || 0;
  }
  if (card.card_code === 'hazard_pending') {
    const byStatus = stats.hazard.byStatus || {};
    return (byStatus.assigned || 0) + (byStatus.discovered || 0);
  }
  if (card.card_code === 'hazard_processing') return stats.hazard.byStatus?.processing || 0;
  return 0;
}

async function fetchCards() {
  try {
    const res = await requestClient.get('/overview/cards');
    if (res?.groups) {
      Object.assign(cardGroups, res.groups);
    }
  } catch (e) {
    console.error('获取卡片配置失败:', e);
  }
}

async function fetchStats() {
  statsLoading.value = true;
  try {
    const res = await requestClient.get('/overview/stats', { params: { year: selectedYear.value } });
    if (res) {
      const d = res;
      Object.assign(stats, d);
    }
  } catch (e) {
    console.error('获取统计数据失败:', e);
  } finally {
    statsLoading.value = false;
  }
}

function handleCardClick(card: any) {
  if (!card.click_action || card.click_action === 'none') return;
  const route = card.target_route;
  const filters = card.filter_conditions || {};
  if (route) {
    router.push({ path: route, query: filters });
    message.info(`已跳转：${card.card_title}`);
  }
}

// 性能优化：独立 API 调用改为 Promise.all 并行执行
onMounted(async () => {
  await Promise.all([
    fetchCards(),
    fetchStats(),
  ]);
});
</script>

<style lang="less" scoped>
.hse-overview-page {
  padding: 16px;
  background: hsl(var(--background-deep));
  min-height: 100vh;
}

.overview-container {
  max-width: 1800px;
  margin: 0 auto;
}

.overview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  padding: 16px 20px;
  background: hsl(var(--card));
  border-radius: 8px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}

.overview-title {
  display: flex;
  align-items: center;
  gap: 12px;

  .title-icon {
    color: hsl(var(--primary));
  }

  .title-text {
    margin: 0;
    font-size: 20px;
    font-weight: 600;
    color: hsl(var(--foreground));
  }
}

.overview-filters {
  display: flex;
  gap: 12px;
  align-items: center;
}

.overview-section {
  margin-bottom: 28px;

  .section-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 16px;

    .section-icon {
      color: hsl(var(--primary));
    }

    .section-title {
      font-size: 16px;
      font-weight: 600;
      color: hsl(var(--foreground));
    }

    .section-count {
      font-size: 12px;
      color: hsl(var(--muted-foreground));
      background: hsl(var(--muted));
      padding: 2px 10px;
      border-radius: 10px;
    }
  }
}

.reminder-card {
  border-radius: 8px;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }
}

.reminder-content {
  display: flex;
  align-items: center;
  gap: 16px;
}

.reminder-icon {
  padding: 10px;
  border-radius: 12px;
}

.reminder-danger .reminder-icon {
  background: hsl(var(--destructive) / 0.12);
  color: hsl(var(--destructive));
}

.reminder-warning .reminder-icon {
  background: hsl(var(--warning) / 0.12);
  color: hsl(var(--warning));
}

.reminder-value {
  font-size: 24px;
  font-weight: 700;
  line-height: 1.2;
  color: hsl(var(--foreground));
}

.reminder-label {
  font-size: 13px;
  color: hsl(var(--muted-foreground));
  margin-top: 2px;
}
</style>
