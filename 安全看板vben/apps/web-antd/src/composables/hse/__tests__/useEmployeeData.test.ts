// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('#/api/hse/employee', () => ({
  getEmployeesByIds: vi.fn(),
}));

import { getEmployeesByIds } from '#/api/hse/employee';
import { useEmployeeData } from '../useEmployeeData';

const mockBatch = vi.mocked(getEmployeesByIds);

beforeEach(() => {
  mockBatch.mockReset();
  // 按 id 返回确定数据（EmployeeItem snake_case），验证完整字段映射
  mockBatch.mockImplementation(async (ids: number[]) =>
    ids.map((id) => ({
      id,
      name: `员工${id}`,
      dept_name: '安环部',
      position_name: '安全员',
      employee_code: `E${id}`,
      org_status: '在职',
      phone: '13800000000',
      id_card: `3301${id}`,
    })),
  );
});

describe('useEmployeeData', () => {
  it('未命中缓存时请求并填充 employee', async () => {
    const { employee, loading } = useEmployeeData(101);
    expect(loading.value).toBe(true);
    await vi.waitFor(() => expect(employee.value).not.toBeNull());
    expect(employee.value?.name).toBe('员工101');
    // R1-Phase1 P0-1：切换后 EmployeeItem 含 org_status/id_card，映射不再为空
    expect(employee.value?.orgStatus).toBe('在职');
    expect(employee.value?.idCard).toBe('3301101');
    expect(mockBatch).toHaveBeenCalledTimes(1);
    expect(mockBatch).toHaveBeenCalledWith([101]);
  });

  it('缓存命中不重复请求', async () => {
    const r1 = useEmployeeData(102);
    await vi.waitFor(() => expect(mockBatch).toHaveBeenCalledTimes(1));
    // 同 id 二次调用应命中模块级缓存
    const r2 = useEmployeeData(102);
    expect(r2.employee.value?.name).toBe('员工102');
    expect(mockBatch).toHaveBeenCalledTimes(1);
  });

  it('refresh 强制重新请求并更新数据', async () => {
    const r = useEmployeeData(103);
    await vi.waitFor(() => expect(mockBatch).toHaveBeenCalledTimes(1));
    mockBatch.mockImplementation(async (ids: number[]) =>
      ids.map((id) => ({
        employee_id: id,
        name: '李四',
        org_name: '安环部',
        position_name: '安全员',
        employee_code: `E${id}`,
      })),
    );
    await r.refresh();
    expect(mockBatch).toHaveBeenCalledTimes(2);
    expect(r.employee.value?.name).toBe('李四');
  });

  it('请求失败设置 error 且不抛出未捕获异常', async () => {
    mockBatch.mockRejectedValue(new Error('network down'));
    const r = useEmployeeData(104);
    await vi.waitFor(() => expect(r.error.value).not.toBeNull());
    expect(r.employee.value).toBeNull();
    expect(r.error.value?.message).toBe('network down');
  });
});
