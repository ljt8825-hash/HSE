import { defineStore } from 'pinia';
import { ref } from 'vue';

import { getAlertList, getAlertStats, type AlertsApi } from '#/api/hse/alerts';

export const useAlertStore = defineStore('hse-alert', () => {
  const list = ref<AlertsApi.AlertItem[]>([]);
  const total = ref(0);
  const loading = ref(false);
  const stats = ref<AlertsApi.AlertStats | null>(null);

  async function fetchList(params: AlertsApi.AlertListParams) {
    loading.value = true;
    try {
      const res = await getAlertList(params);
      list.value = res.list || [];
      total.value = res.total || 0;
      return res;
    } catch (err) {
      console.warn('[AlertStore] fetchList failed:', err);
      list.value = [];
      total.value = 0;
      return { list: [], total: 0 };
    } finally {
      loading.value = false;
    }
  }

  async function fetchStats() {
    try {
      const res = await getAlertStats();
      stats.value = res;
      return res;
    } catch (err) {
      console.warn('[AlertStore] fetchStats failed:', err);
      stats.value = null;
      return null;
    }
  }

  function $reset() {
    list.value = [];
    total.value = 0;
    loading.value = false;
    stats.value = null;
  }

  return {
    list,
    total,
    loading,
    stats,
    fetchList,
    fetchStats,
    $reset,
  };
});
