/**
 * useEmployeeEvent —— 进程内员工变更事件总线（Q2 §2 / §3.2）
 *
 * 设计：前端先实现订阅 + 缓存失效骨架，后端 EMPLOYEE_* 事件发布列为 Sprint-Q 后端协作项
 * （Q2 §8 R6）。订阅返回取消函数，组件应在 onUnmounted 中调用。
 * 幂等：以 (type, employeeId, occurredAt) 去重（Q2 §2.2）。
 */

import type { EmployeeEventEnvelope, EmployeeEventType } from './types';

type EventHandler = (e: EmployeeEventEnvelope) => void;

const subscribers = new Map<EventHandler, EmployeeEventType[]>();
const dedupKeys = new Set<string>();

export interface UseEmployeeEventReturn {
  /**
   * 订阅指定类型事件。
   * @returns 取消订阅函数
   */
  subscribe: (
    types: EmployeeEventType[],
    handler: EventHandler,
  ) => () => void;
}

export function useEmployeeEvent(): UseEmployeeEventReturn {
  function subscribe(
    types: EmployeeEventType[],
    handler: EventHandler,
  ): () => void {
    subscribers.set(handler, types);
    return () => {
      subscribers.delete(handler);
    };
  }

  return { subscribe };
}

/**
 * 进程内发布事件。预留给 Q5 后端事件接入时调用（WebSocket / 轮询拉取到事件后转发至此）。
 * 幂等去重：相同 (type, employeeId, occurredAt) 仅投递一次。
 */
export function publishEmployeeEvent(event: EmployeeEventEnvelope): void {
  const key = `${event.type}:${event.employeeId}:${event.occurredAt}`;
  if (dedupKeys.has(key)) return;
  dedupKeys.add(key);
  // 防止内存无限增长（跨天事件键基本不复用）
  if (dedupKeys.size > 2000) dedupKeys.clear();

  subscribers.forEach((types, handler) => {
    if (types.includes(event.type)) {
      try {
        handler(event);
      } catch (err) {
        // 单个 handler 异常不应阻断其他订阅者
        console.error('[useEmployeeEvent] handler error:', err);
      }
    }
  });
}
