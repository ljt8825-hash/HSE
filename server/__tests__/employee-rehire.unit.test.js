/**
 * A-02e.5-B2.2 · 返聘正向出口（POST /org/rehire）—— 单元测试
 *
 * 性质：**纯单元测试**。jest.mock 掉 config/db、employeeEventService、routes/audit，
 *      不建立任何数据库连接。断言的是「控制流 + SQL 语句结构 + 参数 + 副作用次数」，
 *      **不等于**数据库执行结果；真实事务/行锁/索引行为属 DB-INT（需单独授权），本文件不冒充集成测试。
 *
 * 覆盖（对应任务书 §4 A~E）：
 *   A 正常返聘：关系重置、新段四字段、旧段保留、历史可关联、事件在 COMMIT 之后
 *   B 资格拒绝：辞职 / 死亡 / NULL / 空 / 待岗 / 正式员工 —— 零写入
 *   C 事务与异常：建段失败回滚、历史失败回滚、UPDATE 0 行、已有当前段、无历史段、时间轴、重复返聘
 *   D 旧接口：PUT /org/:id/status 传「返聘」/「reinstated」明确拒绝；其他合法状态行为不变
 *   E 字段语义：employment_relation 权威、reinstated 不进关系白名单、不碰 employment_relationship_status
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
const dict = require('../services/employeeStatusDict');
const service = require('../services/employeeAssignmentService');
const controller = require('../controllers/hse-assignment');

// ------------------------------------------------------------
// 测试替身
// ------------------------------------------------------------

/** 原退休终态段（返聘不得改动它） */
const PREV_SEGMENT = {
  id: 21,
  status: 'inactive',
  org_unit_id: 4,
  position_id: 3,
  start_date: '2020-01-01',
  end_date: '2026-09-30',
};

/**
 * 装配一次返聘调用的数据库替身。
 * 分支按 SQL 文本识别；顺序不可随意调换（'FROM employee_assignment' 同时被两条查询命中）。
 */
function setup(opts = {}) {
  const {
    relation = '退休',
    employeeExists = true,
    currentRows = [],
    prevRows,
    orgRows = [{ id: 4, org_path: '/集团/乡镇作业中心' }],
    deptRows = [],
    relRowCount = 1,
    assignmentError = null,
    historyError = null,
  } = opts;

  const calls = [];
  const client = {
    calls,
    query: jest.fn(async (sql, params) => {
      const text = String(sql);
      calls.push([text, params]);

      if (/^BEGIN/i.test(text.trim()) || /^COMMIT/i.test(text.trim()) || /^ROLLBACK/i.test(text.trim())) {
        return { rows: [], rowCount: null };
      }
      if (/FROM\s+employee\s+WHERE/i.test(text)) {
        return employeeExists
          ? { rows: [{ id: 7, name: '张三', employment_relation: relation }], rowCount: 1 }
          : { rows: [], rowCount: 0 };
      }
      if (/FROM\s+department\s+d/i.test(text)) {
        return { rows: deptRows, rowCount: deptRows.length };
      }
      if (/FROM\s+hse_org_unit/i.test(text) && /WHERE\s+id\s*=/i.test(text)) {
        return { rows: orgRows, rowCount: orgRows.length };
      }
      if (/FROM\s+employee_assignment/i.test(text) && /is_current\s*=\s*true/i.test(text)) {
        return { rows: currentRows, rowCount: currentRows.length };
      }
      if (/FROM\s+employee_assignment/i.test(text)) {
        const rows = prevRows === undefined ? [PREV_SEGMENT] : prevRows;
        return { rows, rowCount: rows.length };
      }
      if (/UPDATE\s+employee\s+SET\s+employment_relation/i.test(text)) {
        return { rows: [], rowCount: relRowCount };
      }
      if (/INSERT\s+INTO\s+employee_assignment/i.test(text)) {
        if (assignmentError) throw assignmentError;
        return { rows: [{ id: 99 }], rowCount: 1 };
      }
      if (/INSERT\s+INTO\s+employee_history/i.test(text)) {
        if (historyError) throw historyError;
        return { rows: [{ id: 55 }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    }),
    release: jest.fn(),
  };
  pool.connect.mockResolvedValue(client);
  return client;
}

/** 事务内全部写语句（INSERT / UPDATE / DELETE） */
function writeCalls(client) {
  return client.calls.filter(([sql]) => /^(INSERT|UPDATE|DELETE)\b/i.test(sql.trim()));
}

/** 是否执行过某关键字语句（BEGIN/COMMIT/ROLLBACK） */
function did(client, keyword) {
  return client.calls.some(([sql]) => new RegExp(`^${keyword}\\b`, 'i').test(sql.trim()));
}

/** 取第一条命中关键字的语句 */
function findCall(client, pattern) {
  return client.calls.find(([sql]) => pattern.test(String(sql)));
}

/** 把事务内语句归类成可断言的顺序序列 */
function sequence(client) {
  return client.calls.map(([sql]) => {
    const s = String(sql).replace(/\s+/g, ' ').trim();
    if (/^BEGIN/i.test(s)) return 'BEGIN';
    if (/^COMMIT/i.test(s)) return 'COMMIT';
    if (/^ROLLBACK/i.test(s)) return 'ROLLBACK';
    if (/FROM employee WHERE/i.test(s)) return 'LOCK_EMPLOYEE';
    if (/FROM department d/i.test(s)) return 'READ_DEPT';
    if (/FROM hse_org_unit/i.test(s)) return 'READ_ORG';
    if (/FROM employee_assignment/i.test(s) && /is_current = true/i.test(s)) return 'CHECK_CURRENT';
    if (/FROM employee_assignment/i.test(s)) return 'READ_PREV';
    if (/UPDATE employee SET employment_relation/i.test(s)) return 'UPDATE_RELATION';
    if (/INSERT INTO employee_assignment/i.test(s)) return 'INSERT_SEGMENT';
    if (/INSERT INTO employee_history/i.test(s)) return 'INSERT_HISTORY';
    return 'OTHER';
  });
}

const REHIRE_ARGS = {
  employee_id: 7,
  org_unit_id: 4,
  position_id: 3,
  start_date: '2026-11-01',
  change_reason: '返聘',
  userId: 1,
};

beforeEach(() => {
  jest.clearAllMocks();
  pool.query.mockReset();
  pool.connect.mockReset();
  employeeEventService.publishEmployeeEvent.mockReset();
});

// ============================================================
// A 正常返聘
// ============================================================
describe('A · 正常返聘（关系=退休）', () => {
  it('A1 写入顺序固定：锁行 → 查当前段 → 读旧段 → 解析组织 → 改关系 → 建段 → 写历史 → COMMIT', async () => {
    const client = setup();

    const r = await service.rehireEmployee({ ...REHIRE_ARGS });

    expect(r.error).toBeUndefined();
    expect(sequence(client)).toEqual([
      'BEGIN',
      'LOCK_EMPLOYEE',
      'CHECK_CURRENT',
      'READ_PREV',
      'READ_ORG',
      'UPDATE_RELATION',
      'INSERT_SEGMENT',
      'INSERT_HISTORY',
      'COMMIT',
    ]);
  });

  it('A2 关系重置为「正式员工」（RH-04），且只写 employment_relation 一列', async () => {
    const client = setup();

    const r = await service.rehireEmployee({ ...REHIRE_ARGS });

    const upd = findCall(client, /UPDATE employee SET employment_relation/i);
    expect(upd).toBeDefined();
    expect(upd[1]).toEqual([7, '正式员工']);
    expect(upd[0]).not.toMatch(/employment_relationship_status/i);

    expect(r.responseData.employment_relation).toBe('正式员工');
    expect(r.audit).toMatchObject({ fromRelation: '退休', toRelation: '正式员工' });
  });

  it('A3 新段：status=reinstated、is_current=true、is_primary=true、start_date=业务生效日', async () => {
    const client = setup();

    const r = await service.rehireEmployee({ ...REHIRE_ARGS });

    const ins = findCall(client, /INSERT INTO employee_assignment/i);
    expect(ins[0]).toContain("VALUES ($1, $2, $3, $4, $5, true, true, $6, $7, $8)");
    expect(ins[1][4]).toBe('reinstated');
    expect(dict.isWritableStatus(ins[1][4])).toBe(true);
    expect(ins[1][5]).toBe('2026-11-01');
    expect(ins[1][1]).toBe(4);          // org_unit_id 落库
    expect(r.responseData.status_code).toBe('reinstated');
    expect(r.responseData.is_current).toBe(true);
    expect(r.responseData.is_primary).toBe(true);
  });

  it('A4 旧退休段：不 UPDATE、不 DELETE、不改 status/is_current/end_date', async () => {
    const client = setup();

    await service.rehireEmployee({ ...REHIRE_ARGS });

    expect(client.calls.filter(([sql]) => /UPDATE\s+employee_assignment/i.test(String(sql)))).toEqual([]);
    expect(client.calls.filter(([sql]) => /DELETE\s+FROM/i.test(String(sql)))).toEqual([]);
    // 旧段信息仅作为历史记录的 before_* 取值被读取
    expect(client.calls.some(([sql]) => /ORDER BY start_date DESC, id DESC/i.test(String(sql)))).toBe(true);
  });

  it('A5 历史：event_type=返聘、event_date 与新段 start_date 同源同日（否则现有历史查询关联不上）', async () => {
    const client = setup();

    await service.rehireEmployee({ ...REHIRE_ARGS });

    const hist = findCall(client, /INSERT INTO employee_history/i);
    expect(hist[0]).toContain("'返聘'");
    const params = hist[1];
    // [$1 employee_id, '返聘', $2 event_date, $3 before_dept, $4 after_dept,
    //  $5 before_pos, $6 after_pos, $7 before_status, '返聘', $8 remark, $9 approver]
    expect(params[0]).toBe(7);
    expect(params[1]).toBe('2026-11-01');
    expect(params[2]).toBe(PREV_SEGMENT.org_unit_id);
    expect(params[3]).toBe(4);
    expect(params[4]).toBe(PREV_SEGMENT.position_id);
    expect(params[5]).toBe(3);
    expect(params[6]).toBe('退休');        // before_status = 权威原因（不写 inactive/离职）
    expect(params[7]).toBeNull();         // remark（用例未传）
    expect(params[8]).toBe(1);            // approver_id = 服务端操作者

    const seg = findCall(client, /INSERT INTO employee_assignment/i);
    expect(params[1]).toBe(seg[1][5]);
  });

  it('A6 事件在 COMMIT 之后发布，类型 EMPLOYEE_REHIRED，payload 含新旧段 ID', async () => {
    const client = setup();
    let callsAtPublish = null;
    employeeEventService.publishEmployeeEvent.mockImplementation(() => {
      callsAtPublish = client.calls.map(([sql]) => String(sql).trim());
      return {};
    });

    const r = await service.rehireEmployee({ ...REHIRE_ARGS });

    const ev = employeeEventService.publishEmployeeEvent.mock.calls[0][0];
    expect(ev.type).toBe('EMPLOYEE_REHIRED');
    expect(ev.employeeId).toBe(7);
    expect(ev.payload).toMatchObject({
      fromRelation: '退休',
      toRelation: '正式员工',
      toStatus: '返聘',
      toStatusCode: 'reinstated',
      effectiveDate: '2026-11-01',
      previousAssignmentId: 21,
      newAssignmentId: 99,
      orgUnitId: 4,
    });
    // 发布时 COMMIT 必须已执行，且不能出现 ROLLBACK
    expect(callsAtPublish.some((s) => /^COMMIT/i.test(s))).toBe(true);
    expect(callsAtPublish.some((s) => /^ROLLBACK/i.test(s))).toBe(false);
    expect(r.eventType).toBe('返聘');
  });

  it('A7 未显式给 org_unit_id 时，可按 5 列扁平组织解析出 org_unit_id', async () => {
    const client = setup({ deptRows: [{ id: 8, org_path: '/集团/项目部' }] });

    const r = await service.rehireEmployee({
      employee_id: 7, team_id: 5, start_date: '2026-11-01', userId: 1,
    });

    expect(r.error).toBeUndefined();
    const ins = findCall(client, /INSERT INTO employee_assignment/i);
    expect(ins[1][1]).toBe(8);
    expect(sequence(client)).toContain('READ_DEPT');
  });

  it('A8 事件发布失败不影响已提交的返聘结果（仅告警）', async () => {
    setup();
    employeeEventService.publishEmployeeEvent.mockImplementation(() => {
      throw new Error('WS 未启动');
    });

    const r = await service.rehireEmployee({ ...REHIRE_ARGS });

    expect(r.error).toBeUndefined();
    expect(r.eventType).toBe('返聘');
  });
});

// ============================================================
// B 资格拒绝
// ============================================================
describe('B · 资格拒绝（仅「退休」可返聘）', () => {
  const cases = [
    ['辞职', '辞职'],
    ['死亡', '死亡'],
    ['NULL（待核实）', null],
    ['空串', ''],
    ['全空白', '   '],
    ['正式员工（在职）', '正式员工'],
    ['待岗（历史兼容关系值）', '待岗'],
    ['未知历史值', '内退'],
  ];

  it.each(cases)('关系=%s ⇒ -4 且零业务写入', async (_label, relation) => {
    const client = setup({ relation });

    const r = await service.rehireEmployee({ ...REHIRE_ARGS });

    expect(r.error).toBe(-4);
    expect(writeCalls(client)).toEqual([]);
    expect(did(client, 'COMMIT')).toBe(false);
    expect(did(client, 'ROLLBACK')).toBe(true);
    expect(employeeEventService.publishEmployeeEvent).not.toHaveBeenCalled();
  });

  it('拒绝文案按真实关系值分支，不模糊化（辞职/死亡 ≠ 退休）', async () => {
    for (const [relation, expectText] of [['辞职', '辞职'], ['死亡', '死亡'], ['正式员工', '无需返聘'], [null, '待核实']]) {
      pool.connect.mockReset();
      setup({ relation });
      const r = await service.rehireEmployee({ ...REHIRE_ARGS });
      expect(r.message).toContain(expectText);
      expect(r.message).toContain('退休');
    }
  });

  it('退休（含首尾空白）按 trim 后判定，可正常返聘', async () => {
    setup({ relation: '  退休  ' });
    const r = await service.rehireEmployee({ ...REHIRE_ARGS });
    expect(r.error).toBeUndefined();
  });
});

// ============================================================
// C 事务与异常
// ============================================================
describe('C · 事务与异常', () => {
  it('C1 建段失败 ⇒ 整体 ROLLBACK、不提交、不发事件（关系更新必须被一并回滚）', async () => {
    const client = setup({
      assignmentError: new Error('duplicate key value violates unique constraint "uk_emp_assign_primary"'),
    });

    await expect(service.rehireEmployee({ ...REHIRE_ARGS })).rejects.toThrow('uk_emp_assign_primary');

    const seq = sequence(client);
    expect(seq.indexOf('UPDATE_RELATION')).toBeGreaterThan(-1);
    expect(seq.indexOf('UPDATE_RELATION')).toBeLessThan(seq.indexOf('INSERT_SEGMENT'));
    expect(seq[seq.length - 1]).toBe('ROLLBACK');
    expect(did(client, 'COMMIT')).toBe(false);
    expect(employeeEventService.publishEmployeeEvent).not.toHaveBeenCalled();
  });

  it('C2 历史写入失败 ⇒ 关系更新与新段一并回滚', async () => {
    const client = setup({ historyError: new Error('employee_history 写入失败') });

    await expect(service.rehireEmployee({ ...REHIRE_ARGS })).rejects.toThrow('employee_history');

    const seq = sequence(client);
    expect(seq).toContain('INSERT_SEGMENT');
    expect(seq[seq.length - 1]).toBe('ROLLBACK');
    expect(did(client, 'COMMIT')).toBe(false);
    expect(employeeEventService.publishEmployeeEvent).not.toHaveBeenCalled();
  });

  it('C3 关系更新命中 0 行 ⇒ -2，且不得继续建段/写历史', async () => {
    const client = setup({ relRowCount: 0 });

    const r = await service.rehireEmployee({ ...REHIRE_ARGS });

    expect(r.error).toBe(-2);
    expect(client.calls.some(([sql]) => /INSERT INTO employee_assignment/i.test(String(sql)))).toBe(false);
    expect(client.calls.some(([sql]) => /INSERT INTO employee_history/i.test(String(sql)))).toBe(false);
    expect(did(client, 'COMMIT')).toBe(false);
  });

  it('C4 员工不存在 ⇒ -2，零写入', async () => {
    const client = setup({ employeeExists: false });

    const r = await service.rehireEmployee({ ...REHIRE_ARGS });

    expect(r.error).toBe(-2);
    expect(writeCalls(client)).toEqual([]);
  });

  it('C5 已存在 is_current=true 段 ⇒ 判数据异常并拒绝，不自动关闭、不覆盖', async () => {
    const client = setup({ currentRows: [{ id: 31, status: 'active' }] });

    const r = await service.rehireEmployee({ ...REHIRE_ARGS });

    expect(r.error).toBe(-4);
    expect(r.message).toContain('数据异常');
    expect(r.message).toContain('31');
    expect(writeCalls(client)).toEqual([]);
  });

  it('C6 无任何历史任职段 ⇒ 判数据异常并拒绝（不凭空建首段）', async () => {
    const client = setup({ prevRows: [] });

    const r = await service.rehireEmployee({ ...REHIRE_ARGS });

    expect(r.error).toBe(-4);
    expect(r.message).toContain('数据异常');
    expect(writeCalls(client)).toEqual([]);
  });

  it('C7 时间轴：生效日 <= 旧段 end_date ⇒ 拒绝', async () => {
    for (const date of ['2026-09-30', '2026-09-01']) {
      pool.connect.mockReset();
      const client = setup({ prevRows: [{ ...PREV_SEGMENT, end_date: '2026-09-30' }] });
      const r = await service.rehireEmployee({ ...REHIRE_ARGS, start_date: date });
      expect(r.error).toBe(-4);
      expect(r.message).toContain('必须晚于');
      expect(writeCalls(client)).toEqual([]);
    }
  });

  it('C8 时间轴：旧段 end_date 为空时，以旧段 start_date 为界', async () => {
    const client = setup({ prevRows: [{ ...PREV_SEGMENT, end_date: null, start_date: '2025-06-01' }] });

    const r = await service.rehireEmployee({ ...REHIRE_ARGS, start_date: '2025-06-01' });

    expect(r.error).toBe(-4);
    expect(writeCalls(client)).toEqual([]);
  });

  it('C9 旧段时间轴自身倒挂 ⇒ 判数据异常并拒绝（不修改旧段去修数据）', async () => {
    const client = setup({ prevRows: [{ ...PREV_SEGMENT, start_date: '2026-09-01', end_date: '2026-01-01' }] });

    const r = await service.rehireEmployee({ ...REHIRE_ARGS });

    expect(r.error).toBe(-4);
    expect(r.message).toContain('倒挂');
    expect(writeCalls(client)).toEqual([]);
  });

  it('C10 重复返聘：第二次调用时关系已非「退休」⇒ 拒绝，不产生第二条当前段', async () => {
    const first = setup();
    const r1 = await service.rehireEmployee({ ...REHIRE_ARGS });
    expect(r1.error).toBeUndefined();
    expect(first.calls.filter(([sql]) => /INSERT INTO employee_assignment/i.test(String(sql))).length).toBe(1);

    pool.connect.mockReset();
    const second = setup({ relation: '正式员工' });
    const r2 = await service.rehireEmployee({ ...REHIRE_ARGS });

    expect(r2.error).toBe(-4);
    expect(second.calls.filter(([sql]) => /INSERT INTO employee_assignment/i.test(String(sql))).length).toBe(0);
  });

  it('C11 并发基线：关系读取必须带 FOR UPDATE（行锁是串行化的前提）', async () => {
    const client = setup();
    await service.rehireEmployee({ ...REHIRE_ARGS });
    const lock = findCall(client, /FROM\s+employee\s+WHERE/i);
    expect(lock[0]).toMatch(/FOR UPDATE/i);
    expect(lock[1]).toEqual([7]);
  });
});

// ============================================================
// D 旧接口（PUT /org/:id/status）
// ============================================================
describe('D · 旧状态接口不再支持「返聘」', () => {
  it('D1 传「返聘」⇒ -4，不取连接、不写任何表、不发事件', async () => {
    const client = setup();

    const r = await service.changeAssignmentStatus({
      id: 11, status: '返聘', event_date: '2026-11-01', userId: 1,
    });

    expect(r.error).toBe(-4);
    expect(r.message).toContain('返聘流程');
    expect(r.message).toContain('/org/rehire');
    expect(pool.connect).not.toHaveBeenCalled();
    expect(client.calls).toEqual([]);
    expect(employeeEventService.publishEmployeeEvent).not.toHaveBeenCalled();
  });

  it('D2 传编码「reinstated」同样拒绝（不能绕过中文入参校验）', async () => {
    setup();

    const r = await service.changeAssignmentStatus({
      id: 11, status: 'reinstated', event_date: '2026-11-01',
    });

    expect(r.error).toBe(-4);
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it('D3 其他合法状态行为不变：退休仍按终态关闭任职段', async () => {
    const client = setup({
      currentRows: [{ id: 11, employee_id: 7, status: 'active', position_id: 3, org_unit_id: 4, org_path: '/A/B' }],
    });

    const r = await service.changeAssignmentStatus({
      id: 11, status: '退休', event_date: '2026-10-01', userId: 1,
    });

    expect(r.error).toBeUndefined();
    const upd = findCall(client, /UPDATE employee_assignment SET status/i);
    expect(upd[0]).toContain('is_current = false');
    expect(upd[0]).toContain('end_date');
    expect(upd[1][1]).toBe('inactive');
    expect(r.audit.statusCode).toBe('inactive');
  });

  it('D4 其他合法状态行为不变：待岗仍不关闭任职段', async () => {
    const client = setup({
      currentRows: [{ id: 11, employee_id: 7, status: 'active', position_id: 3, org_unit_id: 4, org_path: '/A/B' }],
    });

    const r = await service.changeAssignmentStatus({
      id: 11, status: '待岗', event_date: '2026-10-04', userId: 1,
    });

    expect(r.error).toBeUndefined();
    const upd = findCall(client, /UPDATE employee_assignment SET status/i);
    expect(upd[0]).not.toContain('is_current = false');
    expect(upd[1][1]).toBe('pending');
  });

  it('D5 参数非法仍是 -3（无效状态文案不再列「返聘」）', async () => {
    setup();
    const r = await service.changeAssignmentStatus({ id: 11, status: '内退', event_date: '2026-10-01' });
    expect(r.error).toBe(-3);
    expect(r.message).not.toContain('返聘');
  });
});

// ============================================================
// E 字段语义
// ============================================================
describe('E · 字段语义', () => {
  it('E1 reinstated 属「仅业务动作可写」编码，且不在关系白名单', () => {
    expect(dict.isActionOnlyStatus('reinstated')).toBe(true);
    expect(dict.isActionOnlyStatus('active')).toBe(false);
    expect(dict.isActionOnlyStatus(null)).toBe(false);
    expect(dict.isWritableStatus('reinstated')).toBe(true); // 仍是合法段编码，只是入口受限

    expect(dict.validateRelationInput('reinstated').ok).toBe(false);
    expect(dict.validateRelationInput('返聘').ok).toBe(false);
    expect(dict.RELATION_VALUES).not.toContain('返聘');
    expect(dict.validateRelationInput('正式员工')).toEqual({ ok: true, value: '正式员工' });
  });

  it('E2 返聘全流程不读写 employment_relationship_status（历史死列）', async () => {
    const client = setup();
    await service.rehireEmployee({ ...REHIRE_ARGS });
    const all = client.calls.map(([sql]) => String(sql)).join('\n');
    expect(all).not.toContain('employment_relationship_status');
  });

  it('E3 返聘后展示派生：关系=正式员工 + 段=reinstated ⇒ org_status=「返聘」', () => {
    // displayStatusSql 关系优先：关系不再是「退休」，落到 ELSE 分支取段状态
    const sql = dict.displayStatusSql('e.employment_relation', 'ev.assignment_status');
    expect(sql).toContain("= '退休'");
    expect(sql).toContain('ELSE ev.assignment_status');
    expect(dict.toStatusLabel('reinstated')).toBe('返聘');
  });
});

// ============================================================
// 控制器
// ============================================================
describe('控制器 · POST /org/rehire', () => {
  it('成功：审计日志记录返聘事实，响应 camelCase 且含新段信息', async () => {
    setup();

    const res = { json: jest.fn() };
    await controller.rehireEmployee(
      {
        body: {
          employee_id: 7, org_unit_id: 4, position_id: 3, start_date: '2026-11-01',
          change_reason: '返聘',
        },
        user: { id: 1, username: 'admin' },
        ip: '127.0.0.1',
      },
      res
    );

    expect(res.json).toHaveBeenCalledTimes(1);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(99);
    expect(body.data.statusCode).toBe('reinstated');
    expect(body.data.employmentRelation).toBe('正式员工');

    expect(auditLog).toHaveBeenCalledTimes(1);
    const audit = auditLog.mock.calls[0][0];
    expect(audit.module).toBe('人员返聘');
    expect(audit.description).toContain('返聘');
    expect(audit.userId).toBe(1);
    expect(audit.detail).toMatchObject({ previousAssignmentId: 21, newAssignmentId: 99 });
  });

  it('失败（关系非退休）：返回 -4，不写审计日志', async () => {
    setup({ relation: '辞职' });

    const res = { json: jest.fn() };
    await controller.rehireEmployee(
      { body: { employee_id: 7, org_unit_id: 4, start_date: '2026-11-01' }, user: { id: 1 }, ip: '::1' },
      res
    );

    const body = res.json.mock.calls[0][0];
    expect(body.code).toBe(-4);
    expect(body.success).toBe(false);
    expect(auditLog).not.toHaveBeenCalled();
  });

  it('操作者身份只取 req.user，body 里的 userId 被忽略', async () => {
    const client = setup();

    await controller.rehireEmployee(
      {
        body: { employee_id: 7, org_unit_id: 4, start_date: '2026-11-01', userId: 999 },
        user: { id: 1, username: 'admin' },
        ip: '127.0.0.1',
      },
      { json: jest.fn() }
    );

    const ins = findCall(client, /INSERT INTO employee_assignment/i);
    expect(ins[1][7]).toBe(1); // created_by
    const hist = findCall(client, /INSERT INTO employee_history/i);
    expect(hist[1][8]).toBe(1); // approver_id
    expect(auditLog.mock.calls[0][0].userId).toBe(1);
  });
});
