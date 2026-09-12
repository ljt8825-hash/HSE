/**
 * useEmployeeSelectorAdapter —— 将 useEmployeeSearch 桥接为 EmployeeSelector 的 props/events
 *
 * 用法：
 *   const { selectorProps, selectorEvents, selected } = useEmployeeSelectorAdapter({ mode: 'multiple' });
 *   <EmployeeSelector v-bind="selectorProps" v-on="selectorEvents" />
 *
 * 不修改 EmployeeSelector.vue 本身（留待 Q4 增强），仅做适配映射。
 * selectorProps.value 取自 search.selected 的 employeeId；change 事件回写 search.selected。
 */

import { computed } from 'vue';
import type { ComputedRef } from 'vue';
import { useEmployeeSearch } from './useEmployeeSearch';
import type { UseEmployeeSearchReturn } from './useEmployeeSearch';
import { mapSelectorToInfo, type EmployeeSearchOptions } from './types';
import type { EmployeeSelectorApi } from '#/api/hse/employee-selector';

export interface UseEmployeeSelectorAdapterReturn extends UseEmployeeSearchReturn {
  selectorProps: ComputedRef<Record<string, unknown>>;
  selectorEvents: Record<string, (...args: any[]) => void>;
}

export function useEmployeeSelectorAdapter(opts: EmployeeSearchOptions = {}): UseEmployeeSelectorAdapterReturn {
  const search = useEmployeeSearch(opts);
  const isMultiple = (opts.mode ?? 'single') === 'multiple';

  const selectorProps = computed<Record<string, unknown>>(() => {
    const value = isMultiple
      ? search.selected.value.map((i) => i.employeeId)
      : search.selected.value[0]?.employeeId;
    return {
      value,
      mode: opts.mode ?? 'single',
      maxCount: opts.maxCount ?? 50,
      orgUnitId: opts.filterDept,
      // 注：filterStatus 当前 EmployeeSelector 组件无对应 prop（Q2 §4.2 为 Q4 增强项），暂未透传
    };
  });

  const selectorEvents: Record<string, (...args: any[]) => void> = {
    change: (
      item:
        | EmployeeSelectorApi.SelectorItem
        | EmployeeSelectorApi.SelectorItem[]
        | undefined,
    ) => {
      if (isMultiple) {
        search.selected.value = Array.isArray(item)
          ? item.map(mapSelectorToInfo)
          : [];
      } else {
        search.selected.value = item
          ? [mapSelectorToInfo(item as EmployeeSelectorApi.SelectorItem)]
          : [];
      }
    },
  };

  return { ...search, selectorProps, selectorEvents };
}
