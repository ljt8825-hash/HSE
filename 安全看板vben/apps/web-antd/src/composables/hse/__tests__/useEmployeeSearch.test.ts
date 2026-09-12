// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('#/api/hse/employee-selector', () => ({
  getEmployeeSelectorBatch: vi.fn(),
  getEmployeeSelectorList: vi.fn(),
}));

import { getEmployeeSelectorList } from '#/api/hse/employee-selector';
import { useEmployeeSearch } from '../useEmployeeSearch';

const mockList = vi.mocked(getEmployeeSelectorList);

const SAMPLE = [
  { employee_id: 1, name: '张三', org_name: '安环部', position_name: '安全员', employee_code: 'E1' },
  { employee_id: 2, name: '李四', org_name: '生产部', position_name: '操作工', employee_code: 'E2' },
];

beforeEach(() => {
  mockList.mockReset();
  mockList.mockImplementation(async (params?: { keyword?: string }) =>
    params?.keyword
      ? SAMPLE.filter((s) => s.name.includes(params.keyword!))
      : SAMPLE,
  );
});

describe('useEmployeeSearch', () => {
  it('onSearch 经防抖后才发起请求', async () => {
    vi.useFakeTimers();
    const s = useEmployeeSearch({ debounceMs: 300 });
    s.onSearch('张');
    s.onSearch('张三'); // 覆盖，应只发最后一次
    expect(mockList).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(300);
    expect(mockList).toHaveBeenCalledTimes(1);
    expect(mockList).toHaveBeenCalledWith(
      expect.objectContaining({ keyword: '张三' }),
    );
    vi.useRealTimers();
  });

  it('onSearch 结果映射到 options(EmployeeInfo[])', async () => {
    vi.useFakeTimers();
    const s = useEmployeeSearch({ debounceMs: 0 });
    s.onSearch('张三');
    await vi.advanceTimersByTimeAsync(0);
    expect(s.options.value.length).toBe(1);
    expect(s.options.value[0].employeeId).toBe(1);
    expect(s.options.value[0].name).toBe('张三');
    vi.useRealTimers();
  });

  it('clear 清空选中/关键词/候选', () => {
    const s = useEmployeeSearch();
    s.selected.value = [
      { employeeId: 1, employeeCode: 'E1', name: '张三', deptName: '安环部', positionName: '安全员', orgStatus: '' },
    ];
    s.keyword.value = '张三';
    s.options.value = s.selected.value;
    s.clear();
    expect(s.selected.value.length).toBe(0);
    expect(s.keyword.value).toBe('');
    expect(s.options.value.length).toBe(0);
  });

  it('filterDept 透传为 org_unit_id', async () => {
    vi.useFakeTimers();
    const s = useEmployeeSearch({ filterDept: 7, debounceMs: 0 });
    s.onSearch('');
    await vi.advanceTimersByTimeAsync(0);
    expect(mockList).toHaveBeenCalledWith(
      expect.objectContaining({ org_unit_id: 7 }),
    );
    vi.useRealTimers();
  });
});
