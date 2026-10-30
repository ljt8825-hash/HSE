/**
 * B-1-P1-02-E — deleteEmployee 事务化单元测试（纯单测，不连接数据库）
 *
 * 被测对象：employeeService.deleteEmployee
 *   原实现：两次独立 pool.query（软删 employee + 关闭任职段）——第二次失败会留下
 *   「员工已软删但任职段仍 is_current=true」的半更新脏状态。
 *   现实现：单事务（BEGIN → 软删 → 关段 → COMMIT；任一失败 ROLLBACK + 向上抛出）。
 *
 * 覆盖：
 *   T1 正常删除：BEGIN → 软删（RETURNING）→ 关段（end_date=CURRENT_DATE 语义保留）→ COMMIT；
 *   T2 员工不存在 / 已删除：ROLLBACK、零 COMMIT、返回 { error: -2 }；
 *   T3 关段 UPDATE 中途失败：ROLLBACK + 异常向上抛（不返回伪造成功）；
 *   T4 COMMIT 失败：ROLLBACK + 异常向上抛；
 *   T5 ROLLBACK 自身失败不掩盖原异常。
 *
 * 边界声明：本文件不直接连库，断言「事务行为与写入边界」，非真实 PG 约束（DB-INT 范畴）。
 */
jest.mock('../config/db', () => ({
  pool: { query: jest.fn(), connect: jest.fn() },
  isConnected: jest.fn(() => true),
}));

const { pool } = require('../config/db');
const employeeService = require('../services/employeeService');

/** 构造可控 client：记录调用顺序，按场景注入失败点 */
function makeClient({ softDeleteRows = [{ id: 7, name: '张三' }], failAt = null } = {}) {
  const calls = [];
  const client = {
    query: jest.fn(async (sql) => {
      const s = String(sql).trim();
      calls.push(s);

      if (s === 'BEGIN') {
        if (failAt === 'begin') throw new Error('forced begin failure');
        return { rows: [], rowCount: 0 };
      }
      if (s === 'COMMIT') {
        if (failAt === 'commit') throw new Error('forced commit failure');
        return { rows: [], rowCount: 0 };
      }
      if (s === 'ROLLBACK') {
        if (failAt === 'rollback') throw new Error('forced rollback failure');
        return { rows: [], rowCount: 0 };
      }
      // 软删 employee（RETURNING id, name）
      if (/^UPDATE employee SET is_deleted = true/.test(s)) {
        return { rows: softDeleteRows, rowCount: softDeleteRows.length };
      }
      // 关闭当前任职段
      if (/^UPDATE employee_assignment/.test(s)) {
        if (failAt === 'segment') throw new Error('forced segment failure');
        return { rows: [], rowCount: 1 };
      }
      throw new Error('unexpected SQL: ' + s);
    }),
    release: jest.fn(),
  };
  return { client, calls };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('B-1-P1-02-E · deleteEmployee 事务化', () => {
  it('T1 正常删除：BEGIN → 软删 → 关段 → COMMIT，返回 audit；end_date=CURRENT_DATE 语义保留', async () => {
    const { client, calls } = makeClient();
    pool.connect.mockResolvedValueOnce(client);

    const result = await employeeService.deleteEmployee(7);

    expect(result).toEqual({ audit: { id: 7, name: '张三' } });
    expect(calls[0]).toBe('BEGIN');
    expect(calls.some((s) => /^UPDATE employee SET is_deleted = true/.test(s))).toBe(true);
    expect(calls.some((s) => /end_date = CURRENT_DATE/.test(s))).toBe(true);
    expect(calls.some((s) => /is_current = true\s+AND is_deleted = false/.test(s))).toBe(true);
    expect(calls[calls.length - 1]).toBe('COMMIT');
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('T2 员工不存在 / 已删除：ROLLBACK、零 COMMIT、返回 { error: -2 }', async () => {
    const { client, calls } = makeClient({ softDeleteRows: [] });
    pool.connect.mockResolvedValueOnce(client);

    const result = await employeeService.deleteEmployee(999);

    expect(result).toEqual({ error: -2, message: '员工不存在或已删除' });
    expect(calls[0]).toBe('BEGIN');
    expect(calls).toContain('ROLLBACK');
    expect(calls).not.toContain('COMMIT');
    expect(calls.some((s) => s.startsWith('UPDATE employee_assignment'))).toBe(false);
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('T3 关段 UPDATE 失败：ROLLBACK + 异常向上抛（软删不落库）', async () => {
    const { client, calls } = makeClient({ failAt: 'segment' });
    pool.connect.mockResolvedValueOnce(client);

    await expect(employeeService.deleteEmployee(7)).rejects.toThrow('forced segment failure');

    expect(calls).toContain('ROLLBACK');
    expect(calls).not.toContain('COMMIT');
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('T4 COMMIT 失败：ROLLBACK + 异常向上抛', async () => {
    const { client, calls } = makeClient({ failAt: 'commit' });
    pool.connect.mockResolvedValueOnce(client);

    await expect(employeeService.deleteEmployee(7)).rejects.toThrow('forced commit failure');

    expect(calls).toContain('ROLLBACK');
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('T5 ROLLBACK 自身失败不掩盖原异常', async () => {
    const { client } = makeClient({ failAt: 'segment' });
    // 让 ROLLBACK 也失败（二次故障场景）
    const origQuery = client.query.getMockImplementation();
    client.query.mockImplementation(async (sql) => {
      const s = String(sql).trim();
      if (s === 'ROLLBACK') throw new Error('rollback connection broken');
      return origQuery(sql);
    });
    pool.connect.mockResolvedValueOnce(client);

    await expect(employeeService.deleteEmployee(7)).rejects.toThrow('forced segment failure');
    expect(client.release).toHaveBeenCalledTimes(1);
  });
});
