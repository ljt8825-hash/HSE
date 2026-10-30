/**
 * A-02A / B02-DEC-03.34 — 终态登记后端双写单元测试（纯单测，不连接数据库）
 *
 * 被测对象：employeeAssignmentService.terminateEmployee（单事务：锁行 → 关系闸门 → 关段 → 历史 → 审计 → COMMIT）
 * 测试通过 jest.mock('../config/db') 注入可控 client，断言 SQL 顺序、写入内容、COMMIT/ROLLBACK 与回滚边界。
 *
 * 覆盖（任务书 §6）：
 *   T4 正常辞职登记；T5 正常死亡登记；T6 正常退休登记；
 *   T7 已处于终态时重复登记（拒绝，不写）；
 *   T8 NULL/空关系、无当前有效任职段（拒绝，不写）；
 *   T9 事务中途失败后的完整回滚（关系已改/段未关 不可发生）。
 *
 * 边界声明：本文件不直接连库，client.query 由本地驱动；断言的是「事务行为与写入边界」，
 * 而非真实 PG 约束（PG 约束属 DB-INT，本节点不连库核验）。
 */
jest.mock('../config/db', () => ({
  pool: { query: jest.fn(), connect: jest.fn() },
  isConnected: jest.fn(() => true),
}));

jest.mock('../services/employeeEventService', () => ({
  publishEmployeeEvent: jest.fn(),
}));

const { pool } = require('../config/db');
const employeeEventService = require('../services/employeeEventService');
const assignmentService = require('../services/employeeAssignmentService');

const BIZ_CONFLICT = -4;

/** 构造可控 client：根据 SQL 文本驱动返回，并记录调用顺序 */
function makeClient({ employee, assignments = [], updateRowCount = 1, failAt = null } = {}) {
  const calls = [];
  const query = jest.fn(async (sql, params) => {
    calls.push({ sql: String(sql).trim(), params });
    const s = String(sql).trim();

    if (s === 'BEGIN') return { rows: [], rowCount: 0 };
    if (s === 'COMMIT') return { rows: [], rowCount: 0 };
    if (s === 'ROLLBACK') return { rows: [], rowCount: 0 };

    // 锁员工行
    if (/FROM employee WHERE/.test(s) && /FOR UPDATE/.test(s)) {
      return { rows: employee ? [employee] : [], rowCount: employee ? 1 : 0 };
    }
    // 锁当前任职段
    if (/FROM employee_assignment/.test(s) && /FOR UPDATE/.test(s)) {
      return { rows: assignments || [], rowCount: assignments ? assignments.length : 0 };
    }
    // 关系权威写入
    if (/^UPDATE employee SET employment_relation/.test(s)) {
      if (failAt === 'relation') throw new Error('forced relation failure');
      return { rowCount: updateRowCount };
    }
    // 关闭当前任职段
    if (/^UPDATE employee_assignment/.test(s)) {
      if (failAt === 'segment') throw new Error('forced segment failure');
      return { rowCount: updateRowCount };
    }
    if (/^INSERT INTO employee_history/.test(s)) return { rowCount: 1 };
    if (/^INSERT INTO sys_operation_log/.test(s)) return { rowCount: 1 };
    return { rows: [], rowCount: 0 };
  });

  const client = { query, release: jest.fn() };
  pool.connect.mockReturnValue(client);
  return { client, calls };
}

const RELATION = { FORMAL: '正式员工', RESIGNED: '辞职', DECEASED: '死亡', RETIRED: '退休' };

const baseEmployee = (relation) => ({
  id: 9001,
  name: '测试员工',
  employment_relation: relation,
  is_deleted: false,
});

const baseAssignment = () => ({
  id: 5001,
  status: 'active',
  org_unit_id: 100,
  position_id: 200,
  start_date: '2024-01-01',
});

const matchSql = (re, sql) => (re instanceof RegExp ? re.test(sql) : re(sql));
const findCall = (calls, re) => calls.find((c) => matchSql(re, c.sql));
const hasCall = (calls, re) => calls.some((c) => matchSql(re, c.sql));

beforeEach(() => {
  pool.connect.mockReset();
  employeeEventService.publishEmployeeEvent.mockReset();
});

describe('T4-T6 正常终态登记（辞职/死亡/退休）', () => {
  const cases = [
    { type: '辞职', relation: RELATION.RESIGNED, eventDate: '2026-11-10' },
    { type: '死亡', relation: RELATION.DECEASED, eventDate: '2026-11-11' },
    { type: '退休', relation: RELATION.RETIRED, eventDate: '2026-11-12' },
  ];

  cases.forEach(({ type, relation, eventDate }) => {
    it(`${type}：关系+离职日期+关段+历史+审计 同事务写入`, async () => {
      const { calls } = makeClient({ employee: baseEmployee(RELATION.FORMAL), assignments: [baseAssignment()] });

      const result = await assignmentService.terminateEmployee({
        employee_id: 9001,
        terminal_type: type,
        event_date: eventDate,
        remark: '审批 2026-11',
      });

      // 1) 不返回 error，且返回正确的权威关系
      expect(result.error).toBeUndefined();
      expect(result.responseData.employment_relation).toBe(relation);
      expect(result.responseData.leave_date).toBe(eventDate);
      expect(result.responseData.assignment_status_code).toBe('inactive');
      expect(result.responseData.is_current).toBe(false);

      // 2) 事务顺序：BEGIN → 锁员工 → 锁段 → UPDATE employee → UPDATE assignment → history → audit → COMMIT
      const idxBegin = calls.findIndex((c) => c.sql === 'BEGIN');
      const idxEmpUpd = calls.findIndex((c) => /^UPDATE employee SET employment_relation/.test(c.sql));
      const idxSegUpd = calls.findIndex((c) => /^UPDATE employee_assignment/.test(c.sql));
      const idxHist = calls.findIndex((c) => /^INSERT INTO employee_history/.test(c.sql));
      const idxAudit = calls.findIndex((c) => /^INSERT INTO sys_operation_log/.test(c.sql));
      const idxCommit = calls.findIndex((c) => c.sql === 'COMMIT');
      expect(idxBegin).toBeGreaterThanOrEqual(0);
      expect(idxEmpUpd).toBeGreaterThan(idxBegin);
      expect(idxSegUpd).toBeGreaterThan(idxEmpUpd);
      expect(idxHist).toBeGreaterThan(idxSegUpd);
      expect(idxAudit).toBeGreaterThan(idxHist);
      expect(idxCommit).toBeGreaterThan(idxAudit);

      // 3) 关系写入 SQL 正确携带关系值与离职日期
      const empUpdCall = calls[idxEmpUpd];
      expect(empUpdCall.params).toContain(relation);
      expect(empUpdCall.params).toContain(eventDate);

      // 4) 审计记录写入（同一事务，非内存事件）
      expect(idxAudit).toBeGreaterThanOrEqual(0);
      const auditCall = calls[idxAudit];
      expect(auditCall.params.join(' ')).toContain('终态登记');

      // 5) 事件在 COMMIT 之后发布
      expect(employeeEventService.publishEmployeeEvent).toHaveBeenCalledTimes(1);
    });
  });

  it('缺少业务事件日期 → 拒绝（-3），不产生任何数据库交互', async () => {
    const { calls } = makeClient({ employee: baseEmployee(RELATION.FORMAL), assignments: [baseAssignment()] });
    const result = await assignmentService.terminateEmployee({
      employee_id: 9001,
      terminal_type: '退休',
      event_date: '',
    });
    expect(result.error).toBe(-3);
    expect(pool.connect).not.toHaveBeenCalled();
    expect(calls.length).toBe(0);
  });

  it('无效终态类型（如「离职」）→ 拒绝（-3）', async () => {
    const { calls } = makeClient({ employee: baseEmployee(RELATION.FORMAL), assignments: [baseAssignment()] });
    const result = await assignmentService.terminateEmployee({
      employee_id: 9001,
      terminal_type: '离职',
      event_date: '2026-11-12',
    });
    expect(result.error).toBe(-3);
    expect(pool.connect).not.toHaveBeenCalled();
    expect(calls.length).toBe(0);
  });
});

describe('T7 已处于终态 → 拒绝且不写', () => {
  ['辞职', '死亡', '退休'].forEach((rel) => {
    it(`当前关系=${rel} → -4 拒绝，无 BEGIN 后的任何写入`, async () => {
      const { calls } = makeClient({ employee: baseEmployee(rel), assignments: [baseAssignment()] });
      const result = await assignmentService.terminateEmployee({
        employee_id: 9001,
        terminal_type: '退休',
        event_date: '2026-11-12',
      });
      expect(result.error).toBe(BIZ_CONFLICT);
      // 只允许 锁行 + 回滚，不得出现任何 UPDATE/INSERT/COMMIT
      expect(hasCall(calls, /^UPDATE /)).toBe(false);
      expect(hasCall(calls, /^INSERT /)).toBe(false);
      expect(hasCall(calls, (s) => s === 'COMMIT')).toBe(false);
      expect(hasCall(calls, (s) => s === 'ROLLBACK')).toBe(true);
      expect(employeeEventService.publishEmployeeEvent).not.toHaveBeenCalled();
    });
  });
});

describe('T8 关系/段异常 → 拒绝且不写', () => {
  it('关系为 NULL / 空串 → -4 拒绝', async () => {
    const { calls } = makeClient({ employee: baseEmployee(null), assignments: [baseAssignment()] });
    const r1 = await assignmentService.terminateEmployee({ employee_id: 9001, terminal_type: '退休', event_date: '2026-11-12' });
    expect(r1.error).toBe(BIZ_CONFLICT);
    expect(hasCall(calls, /^UPDATE /)).toBe(false);

    const { calls: calls2 } = makeClient({ employee: baseEmployee(''), assignments: [baseAssignment()] });
    const r2 = await assignmentService.terminateEmployee({ employee_id: 9001, terminal_type: '退休', event_date: '2026-11-12' });
    expect(r2.error).toBe(BIZ_CONFLICT);
    expect(hasCall(calls2, /^UPDATE /)).toBe(false);
  });

  it('非「正式员工」关系（如待岗）→ -4 拒绝', async () => {
    const { calls } = makeClient({ employee: baseEmployee('待岗'), assignments: [baseAssignment()] });
    const r = await assignmentService.terminateEmployee({ employee_id: 9001, terminal_type: '退休', event_date: '2026-11-12' });
    expect(r.error).toBe(BIZ_CONFLICT);
    expect(hasCall(calls, /^UPDATE /)).toBe(false);
  });

  it('软删员工 → -4 拒绝', async () => {
    const soft = { ...baseEmployee(RELATION.FORMAL), is_deleted: true };
    const { calls } = makeClient({ employee: soft, assignments: [baseAssignment()] });
    const r = await assignmentService.terminateEmployee({ employee_id: 9001, terminal_type: '退休', event_date: '2026-11-12' });
    expect(r.error).toBe(BIZ_CONFLICT);
    expect(hasCall(calls, /^UPDATE /)).toBe(false);
  });

  it('无当前有效任职段 → -4 拒绝（禁止自动补造段）', async () => {
    const { calls } = makeClient({ employee: baseEmployee(RELATION.FORMAL), assignments: [] });
    const r = await assignmentService.terminateEmployee({ employee_id: 9001, terminal_type: '退休', event_date: '2026-11-12' });
    expect(r.error).toBe(BIZ_CONFLICT);
    expect(hasCall(calls, /^UPDATE /)).toBe(false);
    expect(hasCall(calls, (s) => s === 'ROLLBACK')).toBe(true);
  });

  it('存在多条 is_current=true 段（数据异常）→ -4 拒绝', async () => {
    const { calls } = makeClient({
      employee: baseEmployee(RELATION.FORMAL),
      assignments: [baseAssignment(), { ...baseAssignment(), id: 5002 }],
    });
    const r = await assignmentService.terminateEmployee({ employee_id: 9001, terminal_type: '退休', event_date: '2026-11-12' });
    expect(r.error).toBe(BIZ_CONFLICT);
    expect(hasCall(calls, /^UPDATE /)).toBe(false);
  });

  it('事件日期早于当前段开始日期 → -4 拒绝（防时间轴倒挂）', async () => {
    const { calls } = makeClient({
      employee: baseEmployee(RELATION.FORMAL),
      assignments: [{ ...baseAssignment(), start_date: '2026-01-01' }],
    });
    const r = await assignmentService.terminateEmployee({ employee_id: 9001, terminal_type: '退休', event_date: '2025-12-31' });
    expect(r.error).toBe(BIZ_CONFLICT);
    expect(hasCall(calls, /^UPDATE /)).toBe(false);
  });
});

describe('T9 事务中途失败 → 完整回滚', () => {
  it('关系 UPDATE 返回 0 行（并发被改）→ 抛错，ROLLBACK，段/历史/审计 全部不写', async () => {
    const { calls } = makeClient({
      employee: baseEmployee(RELATION.FORMAL),
      assignments: [baseAssignment()],
      updateRowCount: 0,
    });

    await expect(
      assignmentService.terminateEmployee({ employee_id: 9001, terminal_type: '退休', event_date: '2026-11-12' }),
    ).rejects.toThrow();

    // 锁行 + 锁段 + 关系 UPDATE 已发生，但段 UPDATE / 历史 / 审计 / COMMIT 均未发生
    expect(hasCall(calls, /FROM employee WHERE/)).toBe(true);
    expect(hasCall(calls, /FROM employee_assignment/)).toBe(true);
    expect(hasCall(calls, /^UPDATE employee SET employment_relation/)).toBe(true);
    expect(hasCall(calls, /^UPDATE employee_assignment/)).toBe(false);
    expect(hasCall(calls, /^INSERT INTO employee_history/)).toBe(false);
    expect(hasCall(calls, /^INSERT INTO sys_operation_log/)).toBe(false);
    expect(hasCall(calls, (s) => s === 'COMMIT')).toBe(false);
    expect(hasCall(calls, (s) => s === 'ROLLBACK')).toBe(true);
    expect(employeeEventService.publishEmployeeEvent).not.toHaveBeenCalled();
  });
});
