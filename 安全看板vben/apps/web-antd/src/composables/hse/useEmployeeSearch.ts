/**
 * useEmployeeSearch —— 统一员工搜索（Q2 §3.4）
 *
 * 封装 EmployeeSelector 的搜索能力，替代各模块手填 id / 自由文本 / 误用 props
 * （Q1 P0-3 / P2-1）。防抖默认 300ms；mode 控制单选/多选。
 */

import { ref, getCurrentInstance, onUnmounted } from 'vue';
import type { Ref } from 'vue';
import { getEmployeeSelectorList } from '#/api/hse/employee-selector';
import { mapSelectorToInfo, type EmployeeInfo, type EmployeeSearchOptions } from './types';

export interface UseEmployeeSearchReturn {
  /** 当前选中项（EmployeeInfo[]，单选时长度 0 或 1） */
  selected: Ref<EmployeeInfo[]>;
  keyword: Ref<string>;
  loading: Ref<boolean>;
  options: Ref<EmployeeInfo[]>;
  error: Ref<Error | null>;
  /** 触发搜索（经防抖） */
  onSearch: (kw: string) => void;
  /** 清空选中/关键词/候选 */
  clear: () => void;
}

export function useEmployeeSearch(opts: EmployeeSearchOptions = {}): UseEmployeeSearchReturn {
  const { filterDept, debounceMs = 300 } = opts;
  const selected = ref<EmployeeInfo[]>([]);
  const keyword = ref('');
  const loading = ref(false);
  const options = ref<EmployeeInfo[]>([]);
  const error = ref<Error | null>(null);

  let timer: ReturnType<typeof setTimeout> | null = null;

  function doFetch(kw: string): void {
    loading.value = true;
    error.value = null;
    getEmployeeSelectorList({
      keyword: kw || undefined,
      org_unit_id: filterDept,
      // TODO(Q4 EmployeeSelector 增强): filterStatus 当前选择器 API 无 status 过滤能力，待后端支持后透传
    })
      .then((res) => {
        options.value = res.map(mapSelectorToInfo);
      })
      .catch((e) => {
        error.value = e instanceof Error ? e : new Error(String(e));
        options.value = [];
      })
      .finally(() => {
        loading.value = false;
      });
  }

  function onSearch(kw: string): void {
    keyword.value = kw;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => doFetch(kw), debounceMs);
  }

  function clear(): void {
    selected.value = [];
    keyword.value = '';
    options.value = [];
  }

  // 仅在组件 setup 上下文中注册卸载清理；纯函数调用（如单测）时跳过
  if (getCurrentInstance()) {
    onUnmounted(() => {
      if (timer) clearTimeout(timer);
    });
  }

  return { selected, keyword, loading, options, error, onSearch, clear };
}
