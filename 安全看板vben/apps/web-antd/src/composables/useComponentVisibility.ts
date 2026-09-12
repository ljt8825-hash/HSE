import type { Ref } from 'vue';

import { computed, ref, watch } from 'vue';

export interface VisibilityItem {
  key: string;
  label: string;
}

export interface VisibilityConfig {
  stats: Record<string, boolean>;
  actions: Record<string, boolean>;
  filter: boolean;
}

export interface UseComponentVisibilityOptions {
  pageKey: string;
  statItems: Ref<VisibilityItem[]>;
  actionButtons: Ref<VisibilityItem[]>;
  defaultVisible?: Partial<VisibilityConfig>;
}

const STORAGE_PREFIX = 'component-visibility';

function buildStorageKey(pageKey: string) {
  return `${STORAGE_PREFIX}:${pageKey}`;
}

export function useComponentVisibility(options: UseComponentVisibilityOptions) {
  const { pageKey, statItems, actionButtons } = options;
  const storageKey = buildStorageKey(pageKey);

  function buildDefaultConfig(): VisibilityConfig {
    const stats: Record<string, boolean> = {};
    statItems.value.forEach((item) => {
      stats[item.key] = options.defaultVisible?.stats?.[item.key] ?? true;
    });
    const actions: Record<string, boolean> = {};
    actionButtons.value.forEach((item) => {
      actions[item.key] = options.defaultVisible?.actions?.[item.key] ?? true;
    });
    return {
      stats,
      actions,
      filter: options.defaultVisible?.filter ?? true,
    };
  }

  const config = ref<VisibilityConfig>(buildDefaultConfig());

  function loadFromStorage() {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const saved: Partial<VisibilityConfig> = JSON.parse(raw);
        const defaultConfig = buildDefaultConfig();
        config.value = {
          stats: { ...defaultConfig.stats, ...saved.stats },
          actions: { ...defaultConfig.actions, ...saved.actions },
          filter: saved.filter ?? defaultConfig.filter,
        };
      }
    } catch {
      config.value = buildDefaultConfig();
    }
  }

  function saveToStorage() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(config.value));
    } catch {
      // ignore
    }
  }

  function resetToDefault() {
    config.value = buildDefaultConfig();
    saveToStorage();
  }

  // 确保新增 key 默认显示
  watch(
    [statItems, actionButtons],
    () => {
      let changed = false;

      statItems.value.forEach((item) => {
        if (!(item.key in config.value.stats)) {
          config.value.stats[item.key] = true;
          changed = true;
        }
      });

      actionButtons.value.forEach((item) => {
        if (!(item.key in config.value.actions)) {
          config.value.actions[item.key] = true;
          changed = true;
        }
      });

      if (changed) {
        saveToStorage();
      }
    },
    { immediate: true, deep: true },
  );

  watch(
    config,
    () => {
      saveToStorage();
    },
    { deep: true },
  );

  const isStatVisible = computed(() => {
    return (key: string) => config.value.stats[key] !== false;
  });

  const isActionVisible = computed(() => {
    return (key: string) => config.value.actions[key] !== false;
  });

  const isFilterVisible = computed(() => config.value.filter !== false);

  // 立即加载
  loadFromStorage();

  return {
    config,
    isStatVisible,
    isActionVisible,
    isFilterVisible,
    resetToDefault,
  };
}
