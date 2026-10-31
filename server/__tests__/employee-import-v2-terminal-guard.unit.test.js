/**
 * A-02e.5-C1 · V2 花名册导入（POST /api/hse/employee-import/v2/batch/:id/import）
 *            终态防复活闸门 —— 单元测试
 *
 * 被测真实入口：routes/hse-employee-import-v2/main.js → controllers/employeeImportV2Controller.js
 *              → services/employeeImportV2Service.js `performBatchImport()`
 * 本文件只覆盖 V2；V1 由 employee-import-v1-terminal-guard.unit.test.js 独立覆盖。
 *
 * 性质：纯单元测试。mock 掉 config/db、routes/audit、utils/encryption、middleware/upload，
 *      不建连、不读文件、不写库。断言「控制流 + 下发的 SQL 形态 + 批次事务语义 + 零副作用」，
 *      **不等于**数据库执行结果；真实库验证属 DB-INT（需单独授权）。
 */

jest.mock('../config/db', () => ({
  pool: { query: jest.fn(), connect: jest.fn() },
  isConnected: jest.fn(() => true),
}));

jest.mock('../routes/audit', () => ({
  auditLog: jest.fn(async () => {}),
  auditMiddleware: jest.fn(),
}));

jest.mock('../utils/encryption', () => ({
  encrypt: jest.fn((v) => (v == null ? null : `enc:${v}`)),
  hashSensitive: jest.fn((v) => (v == null ? null : `hash:${v}`)),
}));

jest.mock('../middleware/upload', () => ({
  validateUploadedFile: jest.fn(),
  deleteFile: jest.fn(),
  fixFilenameEncoding: jest.fn((n) => n),
}));

const { pool } = require('../config/db');
const { auditLog } = require('../routes/audit');
const { isTerminalRelation } = require('../services/employeeStatusDict');
const importV2 = require('../services/employeeImportV2Service');

// ------------------------------------------------------------
// 装配
// ------------------------------------------------------------

const WRITE_RE = /^\s*(INSERT|UPDATE|DELETE)\b/i;

/** 一条 approved 的 pending 行 */
function pendingRow(over = {}) {
  return {
    id: 1,
    row_num: 2,
    employee_no: 'E001',
    employee_name: '张三',
    raw_dept: '城区作业中心',
    raw_position: '保洁员',
    raw_team: null,
    raw_work_area: null,
    hire_date: '2026-01-05',
    is_driver: false,
    license_type: null,
    target_org_id: 5,
    target_unit_id: null,
    target_pos_id: 3,
    id_card_hash: null,
    phone_hash: null,
    gender: '男',
    birth_date: '1990-01-01',
    id_card_encrypted: null,
    phone_encrypted: null,
    person_type: '生产人员',
    supervisor_id: 9,
    raw_supervisor: null,
    is_public_welfare: false,
    ...over,
  };
}

/**
 * 事务 client 替身。
 * @param {Object} opts
 * @param {Object} [opts.byNo]   - employee_no → { id, employment_relation }
 * @param {Object} [opts.byIdCardHash] - hash → { id, employment_relation }
 * @param {Object} [opts.byPhoneHash]  - 'hash|name' → { id, employment_relation }
 */
function makeClient({ byNo = {}, byIdCardHash = {}, byPhoneHash = {} } = {}) {
  const calls = [];
  let nextId = 501;
  const query = jest.fn(async (sql, params = []) => {
    const text = String(sql).replace(/\s+/g, ' ').trim();
    calls.push({ text, params });

    if (/^(BEGIN|COMMIT|ROLLBACK|SAVEPOINT|ROLLBACK TO SAVEPOINT|RELEASE SAVEPOINT)/i.test(text)) {
      return { rows: [], rowCount: 0 };
    }
    if (text.includes('FROM employee WHERE employee_code')) {
      const row = byNo[params[0]];
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }
    if (text.includes('FROM employee WHERE id_card_hash')) {
      const row = byIdCardHash[params[0]];
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }
    if (text.includes('FROM employee WHERE phone_hash')) {
      const row = byPhoneHash[`${params[0]}|${params[1]}`];
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }
    if (text.includes('INSERT INTO employee (')) return { rows: [{ id: nextId++ }], rowCount: 1 };
    if (text.includes('UPDATE employee SET')) return { rows: [], rowCount: 1 };
    if (text.includes('UPDATE employee_assignment')) return { rows: [], rowCount: 1 };
    if (text.includes('INSERT INTO employee_assignment')) return { rows: [{ id: 9001 }], rowCount: 1 };
    if (text.includes('UPDATE employee_import_pending')) return { rows: [], rowCount: 1 };
    if (text.includes('UPDATE employee_import_batch')) return { rows: [], rowCount: 1 };
    // M1-02：writeSegment 要求 INSERT 返回行；curSegRes 读取当前主岗段需返回代表性当前段（B 场景）
    if (text.includes('FROM employee_assignment')) return { rows: [{ id: 7001, employee_id: 7, org_unit_id: 5, position_id: 3, status: 'active' }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  });
  return { query, release: jest.fn(), calls };
}

/** 跑一次批次入库（调用真实入口 batchImport = POST /batch/:id/import 的 service 实现） */
async function runImport(pendings, clientOpts = {}, batch = {}) {
  pool.query
    .mockResolvedValueOnce({ rows: [{ batch_no: 'B001', rule_version: 'v1', status: 'pending', ...batch }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: pendings, rowCount: pendings.length });

  const client = makeClient(clientOpts);
  pool.connect.mockResolvedValue(client);

  const descriptor = await importV2.batchImport(11, { id: 1, username: 'admin' }, '127.0.0.1');
  const writes = client.calls.filter((c) => WRITE_RE.test(c.text));
  return {
    descriptor,
    result: descriptor.payload || {},
    error: descriptor.error || null,
    calls: client.calls,
    writes,
    // 行级副作用 = 排除批次级状态回写（UPDATE employee_import_batch 是批次语义，非该员工副作用）
    rowWrites: writes.filter((c) => !c.text.includes('employee_import_batch')),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  pool.query.mockReset();
  pool.connect.mockReset();
});

const terminalErr = (r) => (r.errors || []).join(' | ');

// ------------------------------------------------------------
// T1~T3 明确终态 ⇒ 拒绝且零写入
// ------------------------------------------------------------

describe('V2 · 明确终态人员（权威关系字段）⇒ 拒绝且零写入', () => {
  it.each(['辞职', '死亡', '退休'])('关系=%s → 该行失败，批次标记 partial_completed', async (relation) => {
    const { result, rowWrites, calls } = await runImport(
      [pendingRow()],
      { byNo: { E001: { id: 7, employment_relation: relation } } },
    );

    expect(result.total).toBe(1);
    expect(result.assignmentCount).toBe(0);
    expect(result.insertedCount).toBe(0);
    expect(result.failedCount).toBe(1);
    expect(terminalErr(result)).toContain('终态');
    expect(terminalErr(result)).toContain(relation);
    // 批次状态：既有语义（failedCount>0 ⇒ partial_completed）
    const batchUpdate = calls.find((c) => c.text.includes('UPDATE employee_import_batch'));
    expect(batchUpdate).toBeDefined();
    expect(batchUpdate.params[0]).toBe('partial_completed');
    // 零副作用（不含批次状态回写）
    expect(rowWrites).toEqual([]);
  });

  it('T3-b 判定不依赖任职段状态：终态拒绝时未查询 employee_assignment', async () => {
    const { calls } = await runImport([pendingRow()], { byNo: { E001: { id: 7, employment_relation: '退休' } } });
    expect(calls.some((c) => c.text.includes('FROM employee_assignment'))).toBe(false);
  });

  it('T3-c 关系值首尾空白同样识别为终态', async () => {
    const { result, rowWrites } = await runImport(
      [pendingRow()],
      { byNo: { E001: { id: 7, employment_relation: '  退休  ' } } },
    );
    expect(result.failedCount).toBe(1);
    expect(rowWrites).toEqual([]);
  });

  it('T3-d 三条匹配路径（工号 / 身份证哈希 / 手机号+姓名）均带出关系并拦截', async () => {
    const cases = [
      { p: pendingRow({ employee_no: 'E001' }), opt: { byNo: { E001: { id: 7, employment_relation: '辞职' } } } },
      { p: pendingRow({ employee_no: null, id_card_hash: 'H1' }), opt: { byIdCardHash: { H1: { id: 8, employment_relation: '死亡' } } } },
      { p: pendingRow({ employee_no: null, id_card_hash: null, phone_hash: 'H2' }), opt: { byPhoneHash: { 'H2|张三': { id: 9, employment_relation: '退休' } } } },
    ];
    for (const c of cases) {
      const { result, rowWrites } = await runImport([c.p], c.opt);
      expect(result.failedCount).toBe(1);
      expect(terminalErr(result)).toContain('终态');
      expect(rowWrites).toEqual([]);
    }
  });
});

// ------------------------------------------------------------
// T4 NULL 关系
// ------------------------------------------------------------

describe('V2 · NULL / 空关系不得推断为终态', () => {
  it.each([null, undefined, '', '   '])('关系=%p → 放行，正常建段且不回填关系字段', async (relation) => {
    const { result, calls, writes } = await runImport(
      [pendingRow()],
      { byNo: { E001: { id: 7, employment_relation: relation } } },
    );

    expect(result.failedCount).toBe(0);
    expect(result.assignmentCount).toBe(1);
    expect(calls.some((c) => c.text.includes('UPDATE employee_assignment'))).toBe(true);
    expect(calls.some((c) => c.text.includes('INSERT INTO employee_assignment'))).toBe(true);
    expect(writes.some((c) => c.text.includes('employment_relation'))).toBe(false);
  });
});

// ------------------------------------------------------------
// T5 中间状态
// ------------------------------------------------------------

describe('V2 · 中间状态 / 历史兼容值不得被误判为终态', () => {
  it.each(['待岗', '借调', '停薪留职', '正式员工', '未知历史值'])('关系=%s → 放行', async (relation) => {
    const { result } = await runImport([pendingRow()], { byNo: { E001: { id: 7, employment_relation: relation } } });
    expect(result.failedCount).toBe(0);
    expect(result.assignmentCount).toBe(1);
  });
});

// ------------------------------------------------------------
// T6 正常流程
// ------------------------------------------------------------

describe('V2 · 正常人员既有导入行为保持不变', () => {
  it('已有员工：更新缺失字段 → 关旧主岗段 → 建 active/current/primary 新段 → pending=imported', async () => {
    const { result, calls } = await runImport(
      [pendingRow()],
      { byNo: { E001: { id: 7, employment_relation: '正式员工' } } },
    );

    expect(result.insertedCount).toBe(0);
    expect(result.updatedCount).toBe(1);
    expect(result.assignmentCount).toBe(1);
    expect(result.failedCount).toBe(0);

    const order = calls.map((c) => c.text);
    const iUpdateEmp = order.findIndex((t) => t.startsWith('UPDATE employee SET gender'));
    const iCloseSeg = order.findIndex((t) => t.includes('UPDATE employee_assignment'));
    const iInsertSeg = order.findIndex((t) => t.includes('INSERT INTO employee_assignment'));
    const iPending = order.findIndex((t) => t.includes("UPDATE employee_import_pending SET status = 'imported'"));
    expect(iUpdateEmp).toBeGreaterThan(-1);
    expect(iCloseSeg).toBeGreaterThan(iUpdateEmp);
    expect(iInsertSeg).toBeGreaterThan(iCloseSeg);
    expect(iPending).toBeGreaterThan(iInsertSeg);
    expect(order.some((t) => t === 'COMMIT')).toBe(true);

    const insert = calls.find((c) => c.text.includes('INSERT INTO employee_assignment'));
    // M1-02：经 writeSegment 收口，V2 扩展列 operation_unit_id / dept_name 必须出现在 INSERT 中
    expect(insert.text).toContain('operation_unit_id');
    expect(insert.text).toContain('dept_name');
    // 列序（含 V2 扩展）：employee_id, org_unit_id, operation_unit_id, position_id,
    //   supervisor_id, status, dept_name, is_current, is_primary, start_date, remark, created_by
    expect(insert.params[0]).toBe(7);             // employee_id
    expect(insert.params[1]).toBe(5);             // org_unit_id
    expect(insert.params[5]).toBe('active');      // status（参数索引因扩展列后移）
    expect(insert.params[6]).toBe('城区作业中心');  // dept_name
    expect(insert.params[7]).toBe(true);          // is_current
    expect(insert.params[8]).toBe(true);          // is_primary
    expect(insert.params[9]).toBe('2026-01-05');  // start_date

    const batchUpdate = calls.find((c) => c.text.includes('UPDATE employee_import_batch'));
    expect(batchUpdate.params[0]).toBe('completed');
    expect(auditLog).toHaveBeenCalled();
  });

  it('新员工（无匹配）：新增 employee + 建段', async () => {
    const { result, calls } = await runImport([pendingRow({ employee_no: 'E777' })]);
    expect(result.insertedCount).toBe(1);
    expect(result.assignmentCount).toBe(1);
    expect(result.failedCount).toBe(0);
    expect(calls.some((c) => c.text.includes('INSERT INTO employee ('))).toBe(true);
  });
});

// ------------------------------------------------------------
// T7 混合批次语义
// ------------------------------------------------------------

describe('V2 · 混合批次（正常 + 终态 + 新员工）', () => {
  it('逐行 SAVEPOINT 隔离：终态行回滚到保存点，其它行正常入库，批次 partial_completed', async () => {
    const { result, calls } = await runImport(
      [
        pendingRow({ id: 1, row_num: 2, employee_no: 'E001', employee_name: '正常甲' }),
        pendingRow({ id: 2, row_num: 3, employee_no: 'E002', employee_name: '退休乙', id_card_hash: 'HX', phone_hash: 'HY' }),
        pendingRow({ id: 3, row_num: 4, employee_no: 'E003', employee_name: '新丙' }),
      ],
      { byNo: {
        E001: { id: 7, employment_relation: '正式员工' },
        E002: { id: 8, employment_relation: '退休' },
      } },
    );

    expect(result.total).toBe(3);
    expect(result.assignmentCount).toBe(2);
    expect(result.failedCount).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('第3行');
    expect(result.errors[0]).toContain('终态');

    // 终态行回滚到保存点，而不是整批 ROLLBACK
    expect(calls.some((c) => c.text === 'ROLLBACK TO SAVEPOINT sp_1')).toBe(true);
    expect(calls.some((c) => c.text === 'COMMIT')).toBe(true);
    expect(calls.some((c) => c.text === 'ROLLBACK')).toBe(false);

    // 终态乙（id=8）未出现在任何写语句参数中
    const writesOnTerminal = calls
      .filter((c) => WRITE_RE.test(c.text))
      .filter((c) => (c.params || []).includes(8));
    expect(writesOnTerminal).toEqual([]);

    // 另外两行仍正常建段
    const segInserts = calls.filter((c) => c.text.includes('INSERT INTO employee_assignment'));
    expect(segInserts).toHaveLength(2);
  });
});

// ------------------------------------------------------------
// T8 重复导入 / 重复匹配
// ------------------------------------------------------------

describe('V2 · 重复导入与批次状态', () => {
  it('终态员工重复入库：每次都拒绝且零写入（幂等拒绝）', async () => {
    const first = await runImport([pendingRow()], { byNo: { E001: { id: 7, employment_relation: '辞职' } } });
    const second = await runImport([pendingRow()], { byNo: { E001: { id: 7, employment_relation: '辞职' } } });
    expect(first.result.failedCount).toBe(1);
    expect(second.result.failedCount).toBe(1);
    expect(first.rowWrites).toEqual([]);
    expect(second.rowWrites).toEqual([]);
  });

  it('已完成批次再次入库仍按既有语义报 DONE，不进入闸门判定', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ batch_no: 'B001', rule_version: 'v1', status: 'completed' }], rowCount: 1 });
    const descriptor = await importV2.batchImport(11, { id: 1, username: 'admin' }, '127.0.0.1');
    expect(descriptor.error).toBeTruthy();
    expect(descriptor.error.code).toBe(-3);
    expect(descriptor.error.message).toContain('已入库完成');
    expect(pool.connect).not.toHaveBeenCalled();
  });
});

describe('isTerminalRelation 判定边界（V2 使用同一出口）', () => {
  it.each([
    ['辞职', true], ['死亡', true], ['退休', true], [' 退休 ', true],
    [null, false], [undefined, false], ['', false], ['   ', false],
    ['待岗', false], ['借调', false], ['停薪留职', false], ['正式员工', false],
  ])('%p → %p', (input, expected) => {
    expect(isTerminalRelation(input)).toBe(expected);
  });
});
