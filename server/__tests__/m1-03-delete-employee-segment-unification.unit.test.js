/**
 * M1-03-01 — deleteEmployee 软删除与任职段关闭统一 单元测试（纯 mock，不连接数据库）
 *
 * 被测对象：
 *   1. employeeService.deleteEmployee(id)        —— 事务化软删 + 统一任职段关闭
 *   2. assignmentSegmentService.writeSegment(...) — DELETE 场景最小扩展
 *
 * 覆盖任务书 §七 全部 15 项：
 *   #1  员工不存在 → 返回原有错误结构，不写任职段
 *   #2  员工已删除 → 返回原有错误结构，无副作用
 *   #3  无当前任职段(A) → 允许软删，事务正常提交
 *   #4  恰好一条当前段(B) → 关闭该段，end_date 保持数据库 CURRENT_DATE
 *   #5  多条当前段(C) → 拒绝并整体回滚，员工不被软删
 *   #6  关闭 rowCount=0 → 整体回滚
 *   #7  关闭 rowCount>1 或异常 → 不提交
 *   #8  软删 UPDATE 未命中 → 不提交
 *   #9  关段成功但软删失败 → 回滚关段（同事务原子性）
 *   #10 任职段服务异常 → 整体回滚
 *   #11 锁定员工 SQL 含 FOR UPDATE
 *   #12 锁后用工关系复核使用锁定查询返回值（非旧值）
 *   #13 DELETE 场景不得修改 employee.employment_relation
 *   #14 DELETE 场景不得修改任职段 status
 *   #15 ASSIGN/REHIRE/TERMINATE 既有行为不回归（见文件末 sanity 用例 + 既有测试套件）
 *
 * 边界声明：全部为纯 mock 单元测试，断言「事务行为与写入边界」，不等于真实 PG 并发验证
 *          （DB-INT 范畴，需专用测试库授权，本节点未做、也未伪称通过）。
 */
jest.mock('../config/db', () => ({
  pool: { query: jest.fn(), connect: jest.fn() },
  isConnected: jest.fn(() => true),
}));

const { pool } = require('../config/db');
const employeeService = require('../services/employeeService');
const { writeSegment } = require('../services/assignmentSegmentService');

// ------------------------------------------------------------
// 通用：单条当前段
// ------------------------------------------------------------
function seg(overrides = {}) {
  return {
    id: 5001, employee_id: 7, org_unit_id: 5, position_id: 3,
    status: 'active', is_current: true, is_primary: true,
    start_date: '2026-01-05', end_date: null, ...overrides,
  };
}

// ------------------------------------------------------------
// deleteEmployee 可控 client
// ------------------------------------------------------------
function makeDeleteClient({
  employeeRow = { id: 7, name: '张三', employment_relation: '正式员工', is_deleted: false },
  currentSegments = [],
  softDeleteRows = null,
  segmentCloseRowCount = 1,
  segmentCloseThrow = false,
  softDeleteThrow = false,
} = {}) {
  const calls = [];
  const client = {
    query: jest.fn(async (sql, params) => {
      const s = String(sql).trim();
      calls.push({ text: s, params });

      if (s === 'BEGIN') return { rows: [], rowCount: 0 };
      if (s === 'COMMIT') return { rows: [], rowCount: 0 };
      if (s === 'ROLLBACK') return { rows: [], rowCount: 0 };

      // 锁定员工主表
      if (/SELECT[\s\S]*FROM employee[\s\S]*WHERE id = \$1 FOR UPDATE/.test(s)) {
        return employeeRow ? { rows: [employeeRow], rowCount: 1 } : { rows: [], rowCount: 0 };
      }
      // 读取当前有效任职段
      if (/SELECT[\s\S]*FROM employee_assignment[\s\S]*WHERE employee_id = \$1 AND is_current = true AND is_deleted = false/.test(s)) {
        return { rows: currentSegments, rowCount: currentSegments.length };
      }
      // 软删 employee
      if (/^UPDATE employee SET is_deleted = true/.test(s)) {
        if (softDeleteThrow) throw new Error('forced soft-delete failure');
        const rows = softDeleteRows || (employeeRow ? [{ id: employeeRow.id, name: employeeRow.name }] : []);
        return { rows, rowCount: rows.length };
      }
      // 关闭当前任职段（writeSegment DELETE 场景）
      if (/^UPDATE employee_assignment/.test(s)) {
        if (segmentCloseThrow) throw new Error('forced segment close failure');
        return { rows: [], rowCount: segmentCloseRowCount };
      }
      throw new Error('unexpected SQL: ' + s);
    }),
    release: jest.fn(),
  };
  return { client, calls };
}

// ------------------------------------------------------------
// writeSegment 可控 client（针对 DELETE 场景 SQL 形态）
// ------------------------------------------------------------
function makeSegmentClient(closeRowCount = 1, closeThrow = false) {
  const calls = [];
  const client = {
    query: jest.fn(async (sql, params) => {
      const s = String(sql).trim();
      calls.push({ text: s, params });
      if (/^UPDATE employee_assignment/.test(s)) {
        if (closeThrow) throw new Error('forced close failure');
        return { rows: [], rowCount: closeRowCount };
      }
      throw new Error('unexpected SQL: ' + s);
    }),
  };
  return { client, calls };
}

beforeEach(() => jest.clearAllMocks());

describe('M1-03-01 · deleteEmployee 软删与任职段关闭统一', () => {
  // #1 员工不存在
  it('#1 员工不存在：ROLLBACK、无任职段写入、返回 { error: -2 }', async () => {
    const { client, calls } = makeDeleteClient({ employeeRow: null });
    pool.connect.mockResolvedValueOnce(client);
    const r = await employeeService.deleteEmployee(999);
    expect(r).toEqual({ error: -2, message: '员工不存在或已删除' });
    expect(calls.some((c) => c.text === 'ROLLBACK')).toBe(true);
    expect(calls.some((c) => c.text === 'COMMIT')).toBe(false);
    expect(calls.some((c) => c.text.startsWith('UPDATE employee_assignment'))).toBe(false);
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  // #2 员工已删除
  it('#2 员工已删除：ROLLBACK、无副作用、返回 { error: -2 }', async () => {
    const { client, calls } = makeDeleteClient({ employeeRow: { id: 7, name: '张三', employment_relation: '辞职', is_deleted: true } });
    pool.connect.mockResolvedValueOnce(client);
    const r = await employeeService.deleteEmployee(7);
    expect(r).toEqual({ error: -2, message: '员工不存在或已删除' });
    expect(calls.some((c) => c.text === 'ROLLBACK')).toBe(true);
    expect(calls.some((c) => c.text === 'COMMIT')).toBe(false);
    expect(calls.some((c) => c.text.startsWith('UPDATE employee_assignment'))).toBe(false);
    expect(calls.some((c) => c.text.startsWith('UPDATE employee SET'))).toBe(false);
  });

  // #3 A 场景：无当前段
  it('#3 无当前任职段(A)：允许软删，事务正常提交，无关段 UPDATE', async () => {
    const { client, calls } = makeDeleteClient({ currentSegments: [] });
    pool.connect.mockResolvedValueOnce(client);
    const r = await employeeService.deleteEmployee(7);
    expect(r).toEqual({ audit: { id: 7, name: '张三' } });
    expect(calls.some((c) => c.text === 'COMMIT')).toBe(true);
    expect(calls.some((c) => c.text.startsWith('UPDATE employee_assignment'))).toBe(false);
  });

  // #4 B 场景：恰好一条
  it('#4 恰好一条当前段(B)：关闭该段，end_date 保持数据库 CURRENT_DATE 语义', async () => {
    const { client, calls } = makeDeleteClient({ currentSegments: [seg()] });
    pool.connect.mockResolvedValueOnce(client);
    const r = await employeeService.deleteEmployee(7);
    expect(r).toEqual({ audit: { id: 7, name: '张三' } });
    const close = calls.find((c) => c.text.startsWith('UPDATE employee_assignment'));
    expect(close).toBeDefined();
    expect(close.text).toMatch(/end_date = CURRENT_DATE/);
    expect(close.text).toMatch(/is_current = false/);
    expect(close.text).not.toMatch(/status =/);
    expect(calls.some((c) => c.text === 'COMMIT')).toBe(true);
  });

  // #5 C 场景：多条
  it('#5 多条当前段(C)：拒绝并整体回滚，员工不被软删', async () => {
    const { client, calls } = makeDeleteClient({ currentSegments: [seg({ id: 5001 }), seg({ id: 5002 })] });
    pool.connect.mockResolvedValueOnce(client);
    const r = await employeeService.deleteEmployee(7);
    expect(r).toEqual({ error: -3, message: '存在多条当前有效任职段，数据异常，已拒绝删除' });
    expect(calls.some((c) => c.text === 'ROLLBACK')).toBe(true);
    expect(calls.some((c) => c.text === 'COMMIT')).toBe(false);
    // 不应触达软删 employee
    expect(calls.some((c) => c.text.startsWith('UPDATE employee SET'))).toBe(false);
  });

  // #6 关闭 rowCount = 0
  it('#6 关闭任职段 rowCount=0：整体回滚，不提交', async () => {
    const { client, calls } = makeDeleteClient({ currentSegments: [seg()], segmentCloseRowCount: 0 });
    pool.connect.mockResolvedValueOnce(client);
    await expect(employeeService.deleteEmployee(7)).rejects.toThrow();
    expect(calls.some((c) => c.text === 'ROLLBACK')).toBe(true);
    expect(calls.some((c) => c.text === 'COMMIT')).toBe(false);
  });

  // #7 关闭 rowCount > 1
  it('#7 关闭任职段 rowCount>1（并发改）或异常：不提交', async () => {
    const a = makeDeleteClient({ currentSegments: [seg()], segmentCloseRowCount: 2 });
    pool.connect.mockResolvedValueOnce(a.client);
    await expect(employeeService.deleteEmployee(7)).rejects.toThrow();
    expect(a.calls.some((c) => c.text === 'ROLLBACK')).toBe(true);
    expect(a.calls.some((c) => c.text === 'COMMIT')).toBe(false);

    const b = makeDeleteClient({ currentSegments: [seg()], segmentCloseThrow: true });
    pool.connect.mockResolvedValueOnce(b.client);
    await expect(employeeService.deleteEmployee(7)).rejects.toThrow('forced segment close failure');
    expect(b.calls.some((c) => c.text === 'ROLLBACK')).toBe(true);
    expect(b.calls.some((c) => c.text === 'COMMIT')).toBe(false);
  });

  // #8 软删未命中
  it('#8 软删 UPDATE 未命中：不提交', async () => {
    const { client, calls } = makeDeleteClient({ currentSegments: [seg()], softDeleteRows: [] });
    pool.connect.mockResolvedValueOnce(client);
    const r = await employeeService.deleteEmployee(7);
    expect(r).toEqual({ error: -2, message: '员工不存在或已删除' });
    expect(calls.some((c) => c.text === 'ROLLBACK')).toBe(true);
    expect(calls.some((c) => c.text === 'COMMIT')).toBe(false);
  });

  // #9 关段成功但软删失败：回滚关段（原子性）
  it('#9 关段成功但软删失败：ROLLBACK 撤销关段，无 COMMIT', async () => {
    const { client, calls } = makeDeleteClient({
      currentSegments: [seg()],
      softDeleteRows: [{ id: 7, name: '张三' }],
      softDeleteThrow: true,
    });
    pool.connect.mockResolvedValueOnce(client);
    await expect(employeeService.deleteEmployee(7)).rejects.toThrow('forced soft-delete failure');
    const closeIdx = calls.findIndex((c) => c.text.startsWith('UPDATE employee_assignment'));
    const rollbackIdx = calls.findIndex((c) => c.text === 'ROLLBACK');
    expect(closeIdx).toBeGreaterThanOrEqual(0);
    expect(rollbackIdx).toBeGreaterThan(closeIdx); // 关段在后、回滚在更后 → 同事务
    expect(calls.some((c) => c.text === 'COMMIT')).toBe(false);
  });

  // #10 任职段服务异常（非 SegmentConflictError）整体回滚
  it('#10 任职段服务异常：整体回滚并向上抛出', async () => {
    const { client, calls } = makeDeleteClient({ currentSegments: [seg()], segmentCloseThrow: true });
    pool.connect.mockResolvedValueOnce(client);
    await expect(employeeService.deleteEmployee(7)).rejects.toThrow('forced segment close failure');
    expect(calls.some((c) => c.text === 'ROLLBACK')).toBe(true);
    expect(calls.some((c) => c.text === 'COMMIT')).toBe(false);
  });

  // #11 锁定 SQL 含 FOR UPDATE
  it('#11 锁定员工主表的 SQL 必须包含 FOR UPDATE', async () => {
    const { client, calls } = makeDeleteClient({ currentSegments: [seg()] });
    pool.connect.mockResolvedValueOnce(client);
    await employeeService.deleteEmployee(7);
    const lock = calls.find((c) => c.text.startsWith('SELECT') && c.text.includes('FROM employee WHERE id'));
    expect(lock).toBeDefined();
    expect(lock.text.toUpperCase()).toContain('FOR UPDATE');
  });

  // #12 锁后用工关系复核使用锁定查询返回值（非旧值）
  it('#12 锁后用工关系复核基于锁定查询返回值：即便终态关系(退休)也仍按现有规则允许删除', async () => {
    // 锁定查询返回终态关系，且 name 取自锁定行 —— 证明决策依据锁定查询，而非外部旧值
    const { client, calls } = makeDeleteClient({
      employeeRow: { id: 7, name: '王五', employment_relation: '退休', is_deleted: false },
      currentSegments: [seg()],
    });
    pool.connect.mockResolvedValueOnce(client);
    const r = await employeeService.deleteEmployee(7);
    expect(r).toEqual({ audit: { id: 7, name: '王五' } }); // name 来自锁定行
    // 锁定查询确实读取了 employment_relation 字段
    const lock = calls.find((c) => c.text.includes('FOR UPDATE'));
    expect(lock.text).toMatch(/employment_relation/);
    // 不得因终态关系而拦截（现有规则：删除不区分 relation）
    expect(r.error).toBeUndefined();
  });

  // #13 DELETE 场景不得修改 employment_relation
  it('#13 DELETE 场景不修改 employee.employment_relation（软删语句不含 relation 写入）', async () => {
    const { client, calls } = makeDeleteClient({ currentSegments: [seg()] });
    pool.connect.mockResolvedValueOnce(client);
    await employeeService.deleteEmployee(7);
    // 任何写入 employee 的语句都不得触碰 employment_relation
    const empWrites = calls.filter((c) => c.text.startsWith('UPDATE employee'));
    empWrites.forEach((c) => expect(c.text).not.toMatch(/employment_relation/));
  });

  // #14 DELETE 场景不得修改任职段 status
  it('#14 writeSegment(DELETE) 关闭语句不得修改 status', async () => {
    const { client, calls } = makeSegmentClient(1);
    const { closed } = await writeSegment(client, {
      employeeId: 7, scenario: 'DELETE', currentSegments: [seg({ status: 'active' })],
    });
    expect(closed).not.toBeNull();
    const close = calls.find((c) => c.text.startsWith('UPDATE employee_assignment'));
    expect(close).toBeDefined();
    expect(close.text).not.toMatch(/status =/); // 不得写入 status
    expect(close.text).toMatch(/is_current = false/);
    expect(close.text).toMatch(/end_date = CURRENT_DATE/);
    expect(close.text).toMatch(/updated_at = NOW\(\)/);
    expect(close.text).toMatch(/WHERE id = \$1 AND is_current = true AND is_deleted = false/);
  });
});

describe('M1-03-01 · writeSegment DELETE 场景边界', () => {
  it('DELETE + 0 段：不发出关闭语句，返回 closed=null', async () => {
    const { client, calls } = makeSegmentClient();
    const { closed } = await writeSegment(client, { employeeId: 7, scenario: 'DELETE', currentSegments: [] });
    expect(closed).toBeNull();
    expect(calls.some((c) => c.text.startsWith('UPDATE employee_assignment'))).toBe(false);
  });

  it('DELETE + 1 段 + rowCount=1：关闭成功，closed=该段', async () => {
    const { client } = makeSegmentClient(1);
    const { closed } = await writeSegment(client, { employeeId: 7, scenario: 'DELETE', currentSegments: [seg()] });
    expect(closed).not.toBeNull();
    expect(closed.id).toBe(5001);
  });

  it('DELETE + >1 段：抛 SegmentConflictError（数据异常，由调用方转业务拒绝）', async () => {
    const { client } = makeSegmentClient();
    await expect(writeSegment(client, {
      employeeId: 7, scenario: 'DELETE', currentSegments: [seg({ id: 1 }), seg({ id: 2 })],
    })).rejects.toThrow(/is_current=true 的任职段/);
  });

  it('DELETE + 1 段 + rowCount=0：抛 SegmentCloseFailedError（调用方整体回滚）', async () => {
    const { client } = makeSegmentClient(0);
    await expect(writeSegment(client, {
      employeeId: 7, scenario: 'DELETE', currentSegments: [seg()],
    })).rejects.toThrow(/影响行数=0/);
  });

  it('未知 scenario 仍被拒绝（向后兼容，不影响既有场景）', async () => {
    const { client } = makeSegmentClient();
    await expect(writeSegment(client, { employeeId: 7, scenario: 'GHOST', currentSegments: [] }))
      .rejects.toThrow(/未知 scenario/);
  });

  // #15 sanity：ASSIGN 场景行为未被 DELETE 扩展破坏
  it('#15 ASSIGN 场景关闭语义保持不变（向后兼容）', async () => {
    const { client, calls } = makeSegmentClient(1);
    const { closed } = await writeSegment(client, {
      employeeId: 7, scenario: 'ASSIGN',
      currentSegments: [seg({ status: 'active' })],
      endDate: '2026-03-01',
    });
    expect(closed).not.toBeNull();
    const close = calls.find((c) => c.text.startsWith('UPDATE employee_assignment'));
    // ASSIGN 仍仅按 id 关闭，且不写 status
    expect(close.text).not.toMatch(/status =/);
    expect(close.text).toMatch(/end_date = \$2/);
    expect(close.text).toMatch(/WHERE id = \$1$/);
  });
});
