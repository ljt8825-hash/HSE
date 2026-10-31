/**
 * A-02e.5-B1 · 普通分配入口（POST /org/assign）终态防复活闸门 —— 单元测试
 *
 * 性质：**纯单元测试**。jest.mock 掉 config/db、employeeEventService、routes/audit，
 *      不建立任何数据库连接。断言的是「服务函数的控制流 + 发出的 SQL 语句结构 + 副作用次数」，
 *      **不等于**数据库执行结果；真实库验证属 DB-INT（需单独授权），本文件不冒充集成测试。
 *
 * 覆盖（对应任务书 §5「必须覆盖的测试」）：
 *   T1~T3 已明确辞职 / 死亡 / 退休 ⇒ 普通分配被拒绝
 *   T4    中间态（关系=待岗；段=pending|secondment|unpaid_leave）⇒ 不得被误封
 *   T5    employment_relation = NULL / 空 ⇒ 不得推断为终态，且不得回填关系字段
 *   T6    正常在职 ⇒ 既有流程（关旧段 → 建新段 → 记历史）逐项不变
 *   T7    被拒绝时零副作用：不取连接、无 UPDATE/INSERT、无事件、无审计日志
 *   T8    既有行为边界：员工不存在 -2、缺 start_date -3、未知关系值不猜测
 */

jest.mock('../config/db', () => ({
  pool: { query: jest.fn(), connect: jest.fn() },
  isConnected: jest.fn(() => true),
}));

jest.mock('../services/employeeEventService', () => ({
  publishEmployeeEvent: jest.fn(),
}));

jest.mock('../routes/audit', () => ({
  auditLog: jest.fn(async () => {}),
  auditMiddleware: jest.fn(),
}));

const { pool } = require('../config/db');
const employeeEventService = require('../services/employeeEventService');
const { auditLog } = require('../routes/audit');
const assignmentService = require('../services/employeeAssignmentService');
const controller = require('../controllers/hse-assignment');

// ------------------------------------------------------------
// 测试替身
// ------------------------------------------------------------

/** 一条正常的「当前任职段」 */
const CURRENT_SEGMENT = {
  id: 11, employee_id: 7, status: 'active', position_id: 3, org_unit_id: 4, org_path: '/A/B',
};

/**
 * 装配一次调用的数据库替身。
 * @param {Object} opts
 * @param {string|null|undefined} opts.relation - 预事务（BEGIN 之前）员工 employment_relation 原值
 * @param {string|null|undefined} [opts.inTxRelation] - 事务内 FOR UPDATE 重读到的关系值；
 *        用于模拟「预事务读=在职 → 事务内重读=终态」的竞争窗口（A-02B T11）。
 *        缺省时与 relation 一致。
 * @param {Array} [opts.currentRows] - 当前任职段查询结果
 * @param {Array} [opts.employeeRows] - 预事务员工查询结果（传入 [] 表示员工不存在）
 * @returns {Object} 事务 client 替身（记录了全部 SQL）
 */
function setup({ relation, currentRows = [CURRENT_SEGMENT], employeeRows, inTxRelation } = {}) {
  const calls = [];
  const client = {
    calls,
    query: jest.fn(async (sql, params) => {
      const text = String(sql);
      calls.push([text, params]);
      if (text.includes('FROM employee_assignment ea')) {
        return { rows: currentRows, rowCount: currentRows.length };
      }
      if (text.includes('FROM employee WHERE') && text.includes('FOR UPDATE')) {
        // A-02B 并发栅栏：事务内再次锁定员工行并复核关系
        const rel = inTxRelation !== undefined ? inTxRelation : relation;
        return { rows: [{ id: 7, name: '张三', employment_relation: rel }], rowCount: 1 };
      }
      if (text.includes('INSERT INTO employee_assignment')) {
        return { rows: [{ id: 99 }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    }),
    release: jest.fn(),
  };
  pool.connect.mockResolvedValue(client);
  pool.query.mockResolvedValue({
    rows: employeeRows !== undefined
      ? employeeRows
      : [{ id: 7, name: '张三', employment_relation: relation }],
    rowCount: 1,
  });
  return client;
}

/** 取事务内所有写语句（INSERT / UPDATE / DELETE） */
function writeCalls(client) {
  return client.calls.filter(([sql]) => /^(INSERT|UPDATE|DELETE)\b/i.test(sql.trim()));
}

/** 取全部执行过的 SQL 文本（含事务外的 pool.query） */
function allSql(client) {
  return client.calls.map(([sql]) => sql)
    .concat(pool.query.mock.calls.map(([sql]) => String(sql)));
}

const ASSIGN_ARGS = {
  employee_id: 7, team_id: 5, start_date: '2026-11-01', change_reason: '调岗',
};

beforeEach(() => {
  jest.clearAllMocks();
  pool.query.mockReset();
  pool.connect.mockReset();
});

// ============================================================
// T1~T3 终态关系 ⇒ 拒绝
// ============================================================
describe('A-02e.5-B1 · T1~T3 权威关系为终态 ⇒ 拒绝', () => {
  const cases = [
    ['辞职', '辞职'],
    ['死亡', '死亡'],
    ['退休', '退休'],
    ['退休（含首尾空格，须 trim 后判定）', '  退休  '],
  ];

  it.each(cases)('关系=%s ⇒ error=-4 且零写入', async (_label, relation) => {
    setup({ relation });

    const r = await assignmentService.assignEmployee({ ...ASSIGN_ARGS });

    expect(r.error).toBe(-4);
    expect(r.message).toContain('终态');
    expect(r.message).toContain('返聘');
    // 不得让上层误判为「入职成功」：成功路径字段一个都不能有
    expect(r.eventType).toBeUndefined();
    expect(r.responseData).toBeUndefined();
    expect(r.employeeName).toBeUndefined();
  });

  it('拒绝消息回显真实关系值（便于运维定位，不做模糊化）', async () => {
    setup({ relation: '退休' });
    const r = await assignmentService.assignEmployee({ ...ASSIGN_ARGS });
    expect(r.message).toContain('「退休」');
  });
});

// ============================================================
// T7 零副作用
// ============================================================
describe('A-02e.5-B1 · T7 被拒绝时零副作用', () => {
  it('不取连接、不开事务、无任何写语句、不发事件', async () => {
    const client = setup({ relation: '辞职' });

    await assignmentService.assignEmployee({ ...ASSIGN_ARGS });

    expect(pool.connect).not.toHaveBeenCalled();
    expect(client.query).not.toHaveBeenCalled();
    expect(employeeEventService.publishEmployeeEvent).not.toHaveBeenCalled();
    // 唯一一次库操作是读员工，且必须是 SELECT
    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(String(pool.query.mock.calls[0][0]).trim()).toMatch(/^SELECT\b/);
    expect(String(pool.query.mock.calls[0][0])).toContain('employment_relation');
  });

  it('controller 在 -4 时直接返回错误：不写审计日志、不组装成功响应', async () => {
    setup({ relation: '退休' });
    const res = { json: jest.fn() };

    await controller.assignEmployee(
      {
        body: { employee_id: 7, start_date: '2026-11-01' },
        user: { id: 1, username: 'admin' },
        ip: '127.0.0.1',
      },
      res
    );

    expect(res.json).toHaveBeenCalledTimes(1);
    const body = res.json.mock.calls[0][0];
    expect(body.code).toBe(-4);
    expect(body.success).toBe(false);
    expect(body.message).toContain('终态');
    expect(auditLog).not.toHaveBeenCalled();
    expect(pool.connect).not.toHaveBeenCalled();
  });
});

// ============================================================
// T4 中间态不得被误封
// ============================================================
describe('A-02e.5-B1 · T4 中间态不得被误封', () => {
  it('关系=待岗（历史兼容关系值）⇒ 放行', async () => {
    const client = setup({ relation: '待岗', currentRows: [{ ...CURRENT_SEGMENT, status: 'pending' }] });

    const r = await assignmentService.assignEmployee({ ...ASSIGN_ARGS });

    expect(r.error).toBeUndefined();
    expect(writeCalls(client).length).toBeGreaterThan(0);
  });

  it.each(['pending', 'secondment', 'unpaid_leave'])(
    '当前段 status=%s（关系仍为正式员工）⇒ 放行（段状态不参与终态判定）',
    async (status) => {
      const client = setup({ relation: '正式员工', currentRows: [{ ...CURRENT_SEGMENT, status }] });

      const r = await assignmentService.assignEmployee({ ...ASSIGN_ARGS });

      expect(r.error).toBeUndefined();
      expect(client.calls.some(([sql]) => sql.includes('INSERT INTO employee_assignment'))).toBe(true);
    }
  );

  it('关系=正式员工但已无 is_current 段（历史畸形数据）⇒ 放行，不得用段形态反推终态', async () => {
    setup({ relation: '正式员工', currentRows: [] });

    const r = await assignmentService.assignEmployee({ ...ASSIGN_ARGS });

    expect(r.error).toBeUndefined();
    expect(r.eventType).toBe('入职');
  });
});

// ============================================================
// T5 NULL 不得推断
// ============================================================
describe('A-02e.5-B1 · T5 关系为 NULL / 空 不得推断为终态', () => {
  it.each([null, undefined, '', '   '])('关系=%p ⇒ 放行', async (relation) => {
    setup({ relation });

    const r = await assignmentService.assignEmployee({ ...ASSIGN_ARGS });

    expect(r.error).toBeUndefined();
  });

  it('放行时不得回填 / 反写 employment_relation（NULL 保持待核实）', async () => {
    const client = setup({ relation: null });

    await assignmentService.assignEmployee({ ...ASSIGN_ARGS });

    const empWrites = allSql(client).filter(
      (sql) => /UPDATE\s+employee\b/i.test(sql) || /employment_relation\s*=/i.test(sql)
    );
    expect(empWrites).toEqual([]);
  });

  it('关系=NULL 且无当前段（待核实）⇒ 放行，不得因「无 is_current 段」判定终态', async () => {
    setup({ relation: null, currentRows: [] });

    const r = await assignmentService.assignEmployee({ employee_id: 8, team_id: 5, start_date: '2026-11-01' });

    expect(r.error).toBeUndefined();
    expect(r.eventType).toBe('入职');
  });
});

// ============================================================
// T6 正常流程不被破坏
// ============================================================
describe('A-02e.5-B1 · T6 正常在职流程逐项不变', () => {
  it('关系=正式员工 + 有当前段 ⇒ 关旧段（新段生效日-1）→ 建 active 新段 → 记「调岗」历史 → 发事件', async () => {
    const client = setup({ relation: '正式员工' });

    const r = await assignmentService.assignEmployee({ ...ASSIGN_ARGS, position_id: 9 });

    expect(r.error).toBeUndefined();
    expect(r.eventType).toBe('调岗');

    const close = client.calls.find(([sql]) => sql.includes('SET is_current = false, end_date = $2'));
    expect(close).toBeTruthy();
    expect(close[1][1]).toBe('2026-10-31');

    const ins = client.calls.find(([sql]) => sql.includes('INSERT INTO employee_assignment'));
    // M1-01：status 现由 writeSegment 参数化写入（$5），不在 SQL 字面量里硬编码
    expect(ins[1][4]).toBe('active');

    const hist = client.calls.find(([sql]) => sql.includes('INSERT INTO employee_history'));
    expect(hist[1][1]).toBe('调岗');

    expect(employeeEventService.publishEmployeeEvent).toHaveBeenCalledTimes(1);
    expect(r.responseData.status).toBe('在职');
  });
});

// ============================================================
// T8 既有行为边界
// ============================================================
describe('A-02e.5-B1 · T8 既有行为与闸门边界', () => {
  it('员工不存在 ⇒ -2（原语义不变），且不取连接', async () => {
    setup({ employeeRows: [] });

    const r = await assignmentService.assignEmployee({ employee_id: 999, team_id: 5, start_date: '2026-11-01' });

    expect(r.error).toBe(-2);
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it('缺 start_date ⇒ -3，且不查库（参数校验优先于关系判定）', async () => {
    setup({ relation: '退休' });

    const r = await assignmentService.assignEmployee({ employee_id: 7 });

    expect(r.error).toBe(-3);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('未知 / 历史遗留关系取值 ⇒ 不判定为终态（fail-open，未知值治理不属本闸门）', async () => {
    setup({ relation: '劳务派遣' });

    const r = await assignmentService.assignEmployee({ ...ASSIGN_ARGS });

    expect(r.error).toBeUndefined();
  });
});

// ============================================================
// A-02B（B02-DEC-03.35）· T11/T12 并发栅栏：终态人员不可被重新分配
// ============================================================
describe('A-02B · T11 终态人员不可被重新分配（并发栅栏生效）', () => {
  it('预事务读=正式员工、事务内重读=辞职 ⇒ 拒绝(-4)，不产生新任职段、执行 ROLLBACK 而非 COMMIT', async () => {
    const client = setup({ relation: '正式员工', inTxRelation: '辞职' });

    const r = await assignmentService.assignEmployee({ ...ASSIGN_ARGS });

    expect(r.error).toBe(-4);
    expect(r.message).toContain('终态');
    // 不得新建 active 任职段
    expect(client.calls.some(([sql]) => sql.includes('INSERT INTO employee_assignment'))).toBe(false);
    // 必须回滚，不得提交（否则会留下「终态关系 + 新 active 段」不一致）
    expect(client.calls.some(([sql]) => /ROLLBACK/i.test(sql))).toBe(true);
    expect(client.calls.some(([sql]) => /COMMIT/i.test(sql))).toBe(false);
  });

  it.each(['辞职', '死亡', '退休'])('事务内重读为终态(%s) ⇒ 一律拒绝且不建段', async (rel) => {
    const client = setup({ relation: '正式员工', inTxRelation: rel });

    const r = await assignmentService.assignEmployee({ ...ASSIGN_ARGS });

    expect(r.error).toBe(-4);
    expect(client.calls.some(([sql]) => sql.includes('INSERT INTO employee_assignment'))).toBe(false);
  });
});

describe('A-02B · T12 并发串行化栅栏就位（锁序一致，与 terminateEmployee 一致）', () => {
  it('事务内 FOR UPDATE 锁员工 必须发生在 关旧段 / 建新段 之前', async () => {
    const client = setup({ relation: '正式员工' });

    await assignmentService.assignEmployee({ ...ASSIGN_ARGS, position_id: 9 });

    const idxLock = client.calls.findIndex(([sql]) => sql.includes('FOR UPDATE') && sql.includes('FROM employee WHERE'));
    const idxInsert = client.calls.findIndex(([sql]) => sql.includes('INSERT INTO employee_assignment'));
    const idxClose = client.calls.findIndex(([sql]) => sql.includes('SET is_current = false, end_date = $2'));
    expect(idxLock).toBeGreaterThanOrEqual(0);
    expect(idxLock).toBeLessThan(idxInsert);
    expect(idxLock).toBeLessThan(idxClose);
  });

  it('正常在职流程：事务内复核通过 ⇒ 关旧段→建新段→记历史 仍完整（回归，未被栅栏误伤）', async () => {
    const client = setup({ relation: '正式员工' });

    const r = await assignmentService.assignEmployee({ ...ASSIGN_ARGS, position_id: 9 });

    expect(r.error).toBeUndefined();
    expect(r.eventType).toBe('调岗');
    expect(client.calls.some(([sql]) => sql.includes('INSERT INTO employee_assignment'))).toBe(true);
    expect(client.calls.some(([sql]) => /COMMIT/i.test(sql))).toBe(true);
  });
});
