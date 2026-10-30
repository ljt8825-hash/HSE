/**
 * useEmployeeData —— 统一员工数据获取（Q2 §3.1）
 *
 * 替代各模块散落的取数逻辑（尤其 hazards 坏掉的 getEmployeeName，Q1 P0-1）。
 * 以 employee_id（数字）为唯一键，模块级 Map 缓存，命中立即返回。
 *
 * Q5 增强：订阅 useEmployeeEvent 进程内事件总线，命中缓存的员工发生
 * 调岗/离职/状态变更/信息更新时自动失效缓存；若当前组件正展示该员工则
 * 触发 refresh()（Q2 §2.2），实现跨模块数据联动刷新。
 */

import { ref, onUnmounted, type Ref } from 'vue';
import { getEmployeesByIds } from '#/api/hse/employee';
import { mapEmployeeItemToInfo, type EmployeeInfo } from './types';
import { useEmployeeEvent } from './useEmployeeEvent';

export interface UseEmployeeDataReturn {
  employee: Ref<EmployeeInfo | null>;
  loading: Ref<boolean>;
  error: Ref<Error | null>;
  /** 强制刷新（绕过缓存） */
  refresh: () => Promise<void>;
}

/** 模块级缓存：employeeId → EmployeeInfo（Q2 §3.1） */
const cache = new Map<number, EmployeeInfo>();

/** Q2 §2.1 全部 4 类员工变更事件（Q5 事件驱动缓存失效） */
// A-02e.5-B2.2：新增 EMPLOYEE_REHIRED（返聘）。只补订阅白名单，不改任何展示逻辑；
// 若不订阅，返聘后缓存不会失效，详情页会继续显示旧组织/旧状态。
const EMPLOYEE_EVENT_TYPES = [
  'EMPLOYEE_TRANSFERRED',
  'EMPLOYEE_RESIGNED',
  'EMPLOYEE_STATUS_CHANGED',
  'EMPLOYEE_INFO_UPDATED',
  'EMPLOYEE_REHIRED',
] as const;

export function useEmployeeData(employeeId: number): UseEmployeeDataReturn {
  const employee = ref<EmployeeInfo | null>(cache.get(employeeId) ?? null);
  const loading = ref(false);
  const error = ref<Error | null>(null);

  async function fetchData(force = false): Promise<void> {
    if (!force && cache.has(employeeId)) {
      employee.value = cache.get(employeeId)!;
      return;
    }
    loading.value = true;
    error.value = null;
    try {
      // R1-Phase1 P0-1：切换为真实后端批量端点，返回完整 EmployeeItem
      // （含 orgStatus/phone/idCard，SelectorItem 缺失这些字段）。
      const res = await getEmployeesByIds([employeeId]);
      const info = res[0] ? mapEmployeeItemToInfo(res[0]) : null;
      if (info) cache.set(employeeId, info);
      employee.value = info;
    } catch (e) {
      error.value = e instanceof Error ? e : new Error(String(e));
    } finally {
      loading.value = false;
    }
  }

  async function refresh(): Promise<void> {
    await fetchData(true);
  }

  // Q5：订阅员工变更事件，命中缓存即失效；若当前组件正展示该员工则刷新（Q2 §2.2）
  // 仅在缓存中已存在该 employeeId 时触发，避免无效刷新（要求 4.1）。
  const { subscribe } = useEmployeeEvent();
  const unsubscribe = subscribe([...EMPLOYEE_EVENT_TYPES], (event) => {
    try {
      if (cache.has(event.employeeId)) {
        cache.delete(event.employeeId);
        if (employeeId === event.employeeId) {
          void refresh();
        }
      }
    } catch (e) {
      // 单个事件处理异常不应阻断其他订阅者（要求 4.1）
      console.error('[useEmployeeData] 事件处理异常:', e);
    }
  });
  onUnmounted(unsubscribe);

  if (!cache.has(employeeId)) {
    // 初始未命中：触发一次加载（fire-and-forget，loading 状态已置位）
    void fetchData(false);
  }

  return { employee, loading, error, refresh };
}
