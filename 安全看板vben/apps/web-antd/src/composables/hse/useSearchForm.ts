/**
 * useSearchForm —— 搜索表单状态统一管理 composable（第三阶段 · 页面统一化）
 *
 * 封装搜索表单的「初始化 / 重置 / 防抖 / 可选 localStorage 持久化」逻辑，
 * 消除各列表页重复实现 `searchForm` + `Form inline` 的现状。
 *
 * 设计要点：
 * - 泛型 `T` 保证表单字段类型安全，`form` 为响应式对象可直接 `v-model` 绑定。
 * - `onSearch` 由调用方注入（通常是触发列表重新拉取）；`reset()` 与
 *   `debouncedSearch()` 都会回调它。
 * - 可选 `persist` + `storageKey`：刷新后恢复搜索条件（默认关闭）。
 *
 * @example
 * const { form: searchForm } = useSearchForm({
 *   defaults: { keyword: '', status: undefined },
 *   onSearch: () => table.handleReset(),
 *   debounceMs: 300,
 * });
 */
import { reactive, watch } from 'vue';
import { useDebounceFn } from '@vueuse/core';

/** useSearchForm 配置项 */
export interface UseSearchFormOptions<T extends Record<string, any>> {
  /** 表单初始值（同时也是 reset 的基准） */
  defaults: T;
  /** 搜索触发回调（reset / debouncedSearch 亦会调用） */
  onSearch: () => void;
  /** 防抖延迟（毫秒），默认 300 */
  debounceMs?: number;
  /** 是否启用 localStorage 持久化，默认 false */
  persist?: boolean;
  /** 持久化 key（启用 persist 时必填） */
  storageKey?: string;
}

/** useSearchForm 返回值 */
export interface UseSearchFormReturn<T extends Record<string, any>> {
  /** 表单响应式对象（直接 v-model 绑定） */
  form: T;
  /** 重置为 defaults 并触发 onSearch */
  reset: () => void;
  /** 经防抖的搜索触发函数 */
  debouncedSearch: () => void;
}

/**
 * 创建受管的搜索表单状态。
 * @template T 表单字段类型
 * @param options 配置项
 */
export function useSearchForm<T extends Record<string, any>>(
  options: UseSearchFormOptions<T>,
): UseSearchFormReturn<T> {
  const { defaults, onSearch, debounceMs = 300, persist = false, storageKey } = options;

  // 从 localStorage 恢复（若启用）
  const restored = persist && storageKey
    ? (() => {
        try {
          return JSON.parse(localStorage.getItem(storageKey) || '{}');
        } catch {
          return {};
        }
      })()
    : {};

  const form = reactive({ ...defaults, ...restored }) as T;

  // 防抖搜索
  const debouncedSearch = useDebounceFn(onSearch, debounceMs);

  /** 重置表单为默认值并触发搜索 */
  function reset(): void {
    Object.assign(form, defaults);
    onSearch();
  }

  // 持久化（若启用）
  if (persist && storageKey) {
    watch(
      () => ({ ...form }),
      (val) => {
        try {
          localStorage.setItem(storageKey, JSON.stringify(val));
        } catch {
          /* 忽略持久化异常（隐私模式 / 配额超限） */
        }
      },
      { deep: true },
    );
  }

  return { form, reset, debouncedSearch };
}
