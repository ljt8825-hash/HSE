// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { useEmployeeEvent, publishEmployeeEvent } from '../useEmployeeEvent';
import type { EmployeeEventEnvelope } from '../types';

function makeEvent(
  type: EmployeeEventEnvelope['type'],
  employeeId: number,
  occurredAt: string,
): EmployeeEventEnvelope {
  return { type, employeeId, occurredAt, payload: {}, schemaVersion: 1 };
}

describe('useEmployeeEvent', () => {
  it('subscribe 仅收到匹配类型的事件', () => {
    const { subscribe } = useEmployeeEvent();
    const handler = vi.fn();
    const unsub = subscribe(['EMPLOYEE_RESIGNED'], handler);

    publishEmployeeEvent(makeEvent('EMPLOYEE_RESIGNED', 1, 't1'));
    expect(handler).toHaveBeenCalledTimes(1);

    unsub();
    publishEmployeeEvent(makeEvent('EMPLOYEE_RESIGNED', 1, 't2'));
    expect(handler).toHaveBeenCalledTimes(1); // 已取消订阅
  });

  it('不匹配类型不触发 handler', () => {
    const { subscribe } = useEmployeeEvent();
    const handler = vi.fn();
    subscribe(['EMPLOYEE_TRANSFERRED'], handler);

    publishEmployeeEvent(makeEvent('EMPLOYEE_RESIGNED', 1, 't1'));
    expect(handler).not.toHaveBeenCalled();
  });

  it('幂等去重：相同 (type,employeeId,occurredAt) 仅触发一次', () => {
    const { subscribe } = useEmployeeEvent();
    const handler = vi.fn();
    subscribe(['EMPLOYEE_RESIGNED'], handler);

    const ev = makeEvent('EMPLOYEE_RESIGNED', 5, 'same-key');
    publishEmployeeEvent(ev);
    publishEmployeeEvent(ev);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('多订阅者独立触发', () => {
    const { subscribe } = useEmployeeEvent();
    const h1 = vi.fn();
    const h2 = vi.fn();
    subscribe(['EMPLOYEE_STATUS_CHANGED'], h1);
    subscribe(['EMPLOYEE_STATUS_CHANGED', 'EMPLOYEE_RESIGNED'], h2);

    publishEmployeeEvent(makeEvent('EMPLOYEE_STATUS_CHANGED', 9, 't9'));
    expect(h1).toHaveBeenCalledTimes(1);
    expect(h2).toHaveBeenCalledTimes(1);

    publishEmployeeEvent(makeEvent('EMPLOYEE_RESIGNED', 9, 't9b'));
    expect(h2).toHaveBeenCalledTimes(2);
    expect(h1).toHaveBeenCalledTimes(1); // h1 未订阅 RESIGNED
  });
});
