/**
 * HSE月度安全履职考核 Store - Sprint10-D-2-1
 * 存储考核周期、考核对象、评分状态等全局状态
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { AssessmentMonthlyApi } from '#/api/hse/assessment-monthly';

type AssessmentCycle = AssessmentMonthlyApi.AssessmentCycle;
type AssessmentMetric = AssessmentMonthlyApi.AssessmentMetric;
type ScoringProgress = AssessmentMonthlyApi.ScoringProgress;
import {
  getAssessmentCycleList,
  getMetricList,
  getScoringProgress,
} from '#/api/hse/assessment-monthly';

export const useHseAssessmentStore = defineStore('hse-assessment', () => {
  const currentCycle = ref<AssessmentCycle | null>(null);
  const cycleList = ref<AssessmentCycle[]>([]);
  const cycleTotal = ref(0);
  const metricList = ref<AssessmentMetric[]>([]);
  const scoringProgress = ref<ScoringProgress | null>(null);
  const loading = ref(false);

  const currentCycleId = computed(() => currentCycle.value?.id || null);
  const currentCycleStatus = computed(() => currentCycle.value?.status || 'not_started');

  async function fetchCycleList(params: Record<string, any> = {}) {
    loading.value = true;
    try {
      const res: any = await getAssessmentCycleList({
        page: 1,
        page_size: 50,
        sort_by: 'created_at',
        sort_order: 'desc',
        ...params,
      });
      cycleList.value = res.list || [];
      cycleTotal.value = res.total || 0;
      if (cycleList.value.length > 0 && !currentCycle.value) {
        currentCycle.value = cycleList.value[0]!;
      }
      return res;
    } finally {
      loading.value = false;
    }
  }

  async function fetchMetricList(params?: Record<string, any>) {
    const res: any = await getMetricList(params);
    metricList.value = res.list || [];
    return res;
  }

  async function fetchScoringProgress(cycleId: number | string) {
    const res: any = await getScoringProgress(cycleId);
    scoringProgress.value = res;
    return res;
  }

  function setCurrentCycle(cycle: AssessmentCycle | null) {
    currentCycle.value = cycle;
  }

  function $reset() {
    currentCycle.value = null;
    cycleList.value = [];
    cycleTotal.value = 0;
    metricList.value = [];
    scoringProgress.value = null;
    loading.value = false;
  }

  return {
    currentCycle,
    currentCycleId,
    currentCycleStatus,
    cycleList,
    cycleTotal,
    metricList,
    scoringProgress,
    loading,
    fetchCycleList,
    fetchMetricList,
    fetchScoringProgress,
    setCurrentCycle,
    $reset,
  };
});
