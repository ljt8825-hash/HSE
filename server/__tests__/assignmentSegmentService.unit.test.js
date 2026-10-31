/**
 * M1-01-A · 统一任职段写入服务（assignmentSegmentService.writeSegment）—— 单元测试
 *
 * 性质：**纯单元测试**。jest.mock('../config/db') 仅用于断言「writeSegment 不建立连接、
 *       不触碰 employee.employment_relation」，writeSegment 本身只用调用方传入的 client，
 *       不读 config/db、不连库。本文件不冒充集成测试（DB-INT 属单独授权）。
 *
 * 覆盖（对应任务书 §5「writeSegment 必须覆盖」）：
 *   T1 client 传入校验：不传 client ⇒ 抛错（防止误用 pool）
 *   T2 不建连：pool.connect 不得被调用（内部禁止 pool.connect / BEGIN / COMMIT / ROLLBACK）
 *   T3 A 场景（currentSegments=[] + newSegment）⇒ 仅 INSERT，不 UPDATE
 *   T4 B 场景 ASSIGN（1 条当前段 + newSegment）⇒ 先 UPDATE 关闭（WHERE id=$1、endDate）再 INSERT
 *   T5 B 场景 TERMINATE（1 条当前段、无 newSegment）⇒ 仅 UPDATE（status=inactive 谓词），无 INSERT
 *   T6 B 场景 rowCount 不符（UPDATE 返回 0）⇒ 抛 SegmentCloseFailedError，且不继续 INSERT
 *   T7 C 场景（2 条当前段）⇒ 抛 SegmentConflictError，无任何写
 *   T8 不碰 relation：全程不得出现 UPDATE employee / employment_relation 语句
 *   T9 INSERT 失败 ⇒ 向上抛（不吞），且不发任何副作用之外的静默
 */

jest.mock('../config/db', () => ({
  pool: { query: jest.fn(), connect: jest.fn() },
  isConnected: jest.fn(() => true),
}));

const { pool } = require('../config/db');
const {
  writeSegment,
  SegmentConflictError,
  SegmentCloseFailedError,
} = require('../services/assignmentSegmentService');

// ------------------------------------------------------------
// 测试替身
// ------------------------------------------------------------

/**
 * 构造一个可控的 client 替身，按 SQL 文本路由返回，并记录全部调用。
 * @param {Object} opts
 * @param {number} [opts.closeRowCount] - 关闭段 UPDATE 的返回 rowCount（默认 1）
 * @param {Error|null} [opts.insertError] - INSERT 时抛出的错误（模拟建段失败）
 */
function makeClient({ closeRowCount = 1, insertError = null } = {}) {
  const calls = [];
  const client = {
    calls,
    query: jest.fn(async (sql, params) => {
      const text = String(sql);
      calls.push({ sql: text, params });
      if (/^UPDATE employee_assignment/.test(text)) {
        return { rows: [], rowCount: closeRowCount };
      }
      if (/^INSERT INTO employee_assignment/.test(text)) {
        if (insertError) throw insertError;
        return { rows: [{ id: 77, status: params && params[4] }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    }),
  };
  return { client, calls };
}

/** 取事务内全部写语句（INSERT / UPDATE / DELETE） */
function writeCalls(calls) {
  return calls.filter((c) => /^(INSERT|UPDATE|DELETE)\b/i.test(c.sql.trim()));
}

const SEG = { id: 11, employee_id: 7, status: 'active', org_unit_id: 4, position_id: 3 };
const SEG2 = { id: 12, employee_id: 7, status: 'active', org_unit_id: 5, position_id: 3 };
const NEW_SEG = {
  employee_id: 7,
  org_unit_id: 8,
  position_id: 3,
  supervisor_id: null,
  status: 'active',
  start_date: '2026-11-01',
  remark: '调岗',
  created_by: 1,
};

beforeEach(() => {
  jest.clearAllMocks();
  pool.connect.mockReset();
  pool.query.mockReset();
});

// ============================================================
// T1 client 传入校验
// ============================================================
describe('T1 · client 传入校验', () => {
  it('不传 client ⇒ 抛错', async () => {
    await expect(writeSegment(undefined, { scenario: 'ASSIGN', currentSegments: [] }))
      .rejects.toThrow(/client/i);
  });

  it('client 无 query 方法 ⇒ 抛错', async () => {
    await expect(writeSegment({}, { scenario: 'ASSIGN', currentSegments: [] }))
      .rejects.toThrow(/client/i);
  });

  it('未知 scenario ⇒ 抛错', async () => {
    const { client } = makeClient();
    await expect(writeSegment(client, { scenario: 'BOGUS', currentSegments: [] }))
      .rejects.toThrow(/scenario/i);
  });
});

// ============================================================
// T2 不建连 / 不启事务
// ============================================================
describe('T2 · 不触碰连接与事务', () => {
  it('A 场景：pool.connect 不得被调用', async () => {
    const { client } = makeClient();
    await writeSegment(client, {
      employeeId: 7, scenario: 'ASSIGN', currentSegments: [], newSegment: NEW_SEG,
    });
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it('A 场景：不得发出 BEGIN / COMMIT / ROLLBACK', async () => {
    const { client, calls } = makeClient();
    await writeSegment(client, {
      employeeId: 7, scenario: 'ASSIGN', currentSegments: [], newSegment: NEW_SEG,
    });
    expect(calls.some((c) => /^(BEGIN|COMMIT|ROLLBACK)\b/i.test(c.sql.trim()))).toBe(false);
  });
});

// ============================================================
// T3 A 场景（无当前段 + 新建）
// ============================================================
describe('T3 · A 场景（currentSegments=[] + newSegment）', () => {
  it('仅 INSERT，不 UPDATE / DELETE', async () => {
    const { client, calls } = makeClient();
    const r = await writeSegment(client, {
      employeeId: 7, scenario: 'ASSIGN', currentSegments: [], newSegment: NEW_SEG,
    });

    expect(r.closed).toBeNull();
    expect(r.inserted).toEqual({ id: 77, status: 'active' });
    const writes = writeCalls(calls);
    expect(writes).toHaveLength(1);
    expect(writes[0].sql).toMatch(/^INSERT INTO employee_assignment/i);
  });

  it('INSERT 语句参数化 status（$5），不得写死为 SQL 字面量', async () => {
    const { client, calls } = makeClient();
    await writeSegment(client, {
      employeeId: 7, scenario: 'REHIRE', currentSegments: [],
      newSegment: { ...NEW_SEG, status: 'reinstated' },
    });
    const ins = calls.find((c) => /^INSERT INTO employee_assignment/i.test(c.sql));
    expect(ins.sql).toContain('VALUES ($1, $2, $3, $4, $5, true, true, $6, $7, $8)');
    expect(ins.params[4]).toBe('reinstated'); // 状态走参数，不在 SQL 里硬编码
  });
});

// ============================================================
// T4 B 场景 ASSIGN（1 条当前段 + 新建）
// ============================================================
describe('T4 · B 场景 ASSIGN（1 条当前段 + 新建）', () => {
  it('先关闭旧段（WHERE id=$1、endDate）再新建，顺序固定', async () => {
    const { client, calls } = makeClient();
    const r = await writeSegment(client, {
      employeeId: 7, scenario: 'ASSIGN', currentSegments: [SEG],
      newSegment: NEW_SEG, endDate: '2026-10-31',
    });

    expect(r.closed).toBe(SEG);
    expect(r.inserted.id).toBe(77);

    const idxClose = calls.findIndex((c) => /^UPDATE employee_assignment/i.test(c.sql));
    const idxInsert = calls.findIndex((c) => /^INSERT INTO employee_assignment/i.test(c.sql));
    expect(idxClose).toBeGreaterThanOrEqual(0);
    expect(idxInsert).toBeGreaterThan(idxClose);

    const close = calls[idxClose];
    expect(close.sql).toContain('SET is_current = false, end_date = $2');
    expect(close.sql).toContain('WHERE id = $1');
    expect(close.sql).not.toContain('status = $2'); // ASSIGN 不写 status 列
    expect(close.params).toEqual([SEG.id, '2026-10-31']);
  });
});

// ============================================================
// T5 B 场景 TERMINATE（1 条当前段、仅关闭）
// ============================================================
describe('T5 · B 场景 TERMINATE（1 条当前段、无 newSegment）', () => {
  it('仅 UPDATE 关闭（status=inactive 谓词 + 幂等谓词），不 INSERT', async () => {
    const { client, calls } = makeClient();
    const r = await writeSegment(client, {
      employeeId: 7, scenario: 'TERMINATE', currentSegments: [SEG],
      closeStatus: 'inactive', endDate: '2026-11-10',
    });

    expect(r.closed).toBe(SEG);
    expect(r.inserted).toBeNull();

    const writes = writeCalls(calls);
    expect(writes).toHaveLength(1);
    expect(writes[0].sql).toMatch(/^UPDATE employee_assignment/i);
    expect(writes[0].sql).toContain('status = $2');
    expect(writes[0].sql).toContain('is_current = false');
    expect(writes[0].sql).toContain('is_deleted = false');
    expect(writes[0].params).toEqual([SEG.id, 'inactive', '2026-11-10']);
  });
});

// ============================================================
// T6 B 场景 rowCount 不符 ⇒ 拒绝继续
// ============================================================
describe('T6 · B 场景 rowCount !== 1 ⇒ SegmentCloseFailedError', () => {
  it('关闭 UPDATE 返回 0 行 ⇒ 抛 SegmentCloseFailedError，且不 INSERT', async () => {
    const { client, calls } = makeClient({ closeRowCount: 0 });

    await expect(writeSegment(client, {
      employeeId: 7, scenario: 'ASSIGN', currentSegments: [SEG],
      newSegment: NEW_SEG, endDate: '2026-10-31',
    })).rejects.toBeInstanceOf(SegmentCloseFailedError);

    // 关闭已发生，但绝不应再执行 INSERT（避免「段未关却建新段」）
    expect(calls.some((c) => /^INSERT INTO employee_assignment/i.test(c.sql))).toBe(false);
  });
});

// ============================================================
// T7 C 场景（多条当前段）⇒ 拒绝
// ============================================================
describe('T7 · C 场景（>1 条当前段）⇒ SegmentConflictError', () => {
  it('抛 SegmentConflictError，且零写入', async () => {
    const { client, calls } = makeClient();

    await expect(writeSegment(client, {
      employeeId: 7, scenario: 'ASSIGN', currentSegments: [SEG, SEG2],
      newSegment: NEW_SEG, endDate: '2026-10-31',
    })).rejects.toBeInstanceOf(SegmentConflictError);

    expect(writeCalls(calls)).toEqual([]);
  });
});

// ============================================================
// T8 不碰 employment_relation
// ============================================================
describe('T8 · 不修改 employee.employment_relation', () => {
  it('A / B / TERMINATE 三种场景均不得出现 UPDATE employee 语句', async () => {
    for (const [scenario, segs, extra] of [
      ['ASSIGN', [], { newSegment: NEW_SEG }],
      ['ASSIGN', [SEG], { newSegment: NEW_SEG, endDate: '2026-10-31' }],
      ['TERMINATE', [SEG], { closeStatus: 'inactive', endDate: '2026-11-10' }],
    ]) {
      const { calls } = makeClient();
      await writeSegment(client0(calls), {
        employeeId: 7, scenario, currentSegments: segs, ...extra,
      });
      const all = calls.map((c) => c.sql).join('\n');
      expect(all).not.toMatch(/UPDATE\s+employee\b/i);
      expect(all).not.toContain('employment_relation');
    }
  });
});

// T8 辅助：复用同一 calls 数组
function client0(calls) {
  return {
    calls,
    query: jest.fn(async (sql, params) => {
      const text = String(sql);
      calls.push({ sql: text, params });
      if (/^UPDATE employee_assignment/.test(text)) return { rows: [], rowCount: 1 };
      if (/^INSERT INTO employee_assignment/.test(text)) return { rows: [{ id: 77 }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    }),
  };
}

// ============================================================
// T9 INSERT 失败 ⇒ 不吞
// ============================================================
describe('T9 · INSERT 失败向上抛', () => {
  it('建段抛错 ⇒ 异常原样向上传播', async () => {
    const { client } = makeClient({ insertError: new Error('duplicate key') });
    await expect(writeSegment(client, {
      employeeId: 7, scenario: 'ASSIGN', currentSegments: [], newSegment: NEW_SEG,
    })).rejects.toThrow('duplicate key');
  });
});
