/**
 * B02-DEC-03.15 / D1 退休原因权威来源 · 单元测试
 *
 * 性质：**纯单元测试**（jest.mock 掉 config/db 与 employeeEventService），不连接任何数据库。
 *      SQL 断言只验证「生成的 SQL 文本结构 / 分支顺序 / 参数」，不等于数据库执行结果。
 *      需要真实库验证的部分在报告中列为 DB-INT（集成测试待办），本文件不冒充集成测试。
 *
 * 覆盖（对应任务 §五 D6 与 §七 验收）：
 *   G1 关系取值字典：正式 4 值 + 历史兼容值 + NULL 语义
 *   G2 展示派生：inactive 不得单独决定原因（退休 → retired，辞职/死亡 → left）
 *   G3 筛选：退休新记录可检索 + 旧 retired 数据兼容 + 离职口径不含退休
 *   G4 D2 历史事件：after_status 与 event_type 原因一致，不误标
 *   G5 写入校验：未知关系值拒绝，NULL 允许且不推断
 *   G6 终态关闭路径：退休关闭任职段；中间态 / 返聘不关闭
 *   G7 历史兼容：former / retired / reinstated 行为未被破坏
 *   G8 assignEmployee 任职段影响
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
const dict = require('../services/employeeStatusDict');
const assignmentService = require('../services/employeeAssignmentService');
const employeeService = require('../services/employeeService');
const profileService = require('../services/employeeProfileService');

// ------------------------------------------------------------
// 辅助
// ------------------------------------------------------------
function makeClient(orgRow) {
  const calls = [];
  const client = {
    calls,
    query: jest.fn(async (sql, params) => {
      calls.push([sql, params]);
      if (sql.includes('FROM employee_assignment ea')) {
        return { rows: orgRow ? [orgRow] : [] };
      }
      if (sql.includes('FROM employee WHERE') && sql.includes('FOR UPDATE')) {
        // A-02B 并发栅栏：事务内再次锁定员工行复核关系；此处默认在职，闸门通过
        return { rows: [{ id: 7, name: '张三', employment_relation: '正式员工' }], rowCount: 1 };
      }
      if (sql.includes('INSERT INTO employee_assignment')) {
        return { rows: [{ id: 99 }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    }),
    release: jest.fn(),
  };
  pool.connect.mockResolvedValue(client);
  // assignEmployee 在开启事务前会校验员工存在（pool.query，非 client）
  pool.query.mockResolvedValue({ rows: [{ id: 7, name: '张三' }], rowCount: 1 });
  return client;
}

const ORG_ROW = {
  id: 11, employee_id: 7, status: 'active', position_id: 3, org_unit_id: 4, org_path: '/A/B',
};

function findCall(client, keyword) {
  return client.calls.find(([sql]) => sql.includes(keyword));
}

/** 抓取 listEmployees 生成的主查询 SQL（含 SELECT 列表） */
async function captureListSql(query) {
  pool.query.mockReset();
  pool.query
    .mockResolvedValueOnce({ rows: [{ total: 0 }] })
    .mockResolvedValueOnce({ rows: [] });
  await employeeService.listEmployees(query);
  return pool.query.mock.calls.map((c) => String(c[0])).join('\n---\n');
}

/**
 * 只取 WHERE 条件段。
 * 注意：SELECT 列表里的统一派生天然包含 '退休' 分支，因此判断「筛选口径」必须只看 WHERE，
 * 否则会产生假失败。
 */
async function captureListWhere(query) {
  pool.query.mockReset();
  pool.query
    .mockResolvedValueOnce({ rows: [{ total: 0 }] })
    .mockResolvedValueOnce({ rows: [] });
  await employeeService.listEmployees(query);
  const calls = pool.query.mock.calls;
  const sql = String(calls[calls.length - 1][0]);
  return sql.slice(sql.lastIndexOf('WHERE '));
}

beforeEach(() => {
  jest.clearAllMocks();
  pool.query.mockReset();
  pool.connect.mockReset();
});

// ============================================================
// G1 关系取值字典
// ============================================================
describe('D1 · G1 employment_relation 取值字典', () => {
  it('退休是正式关系取值（与 辞职/死亡 并列）', () => {
    expect(dict.RELATION.RETIRED).toBe('退休');
    expect(dict.RELATION_VALUES).toContain('退休');
    expect(dict.TERMINAL_RELATION_VALUES).toContain('退休');
  });

  it('正式关系取值集合为 正式员工 / 辞职 / 死亡 / 退休', () => {
    expect([...dict.RELATION_VALUES]).toEqual(['正式员工', '辞职', '死亡', '退休']);
  });

  it('待岗 属历史兼容值，不进入正式取值集合（A-05：待岗是中间态）', () => {
    expect(dict.LEGACY_RELATION_VALUES).toContain('待岗');
    expect(dict.RELATION_VALUES).not.toContain('待岗');
    expect(dict.WRITABLE_RELATION_VALUES).toContain('待岗');
  });

  it('离职口径不含退休（§七：退休不得误标为离职）', () => {
    expect([...dict.LEFT_RELATION_VALUES]).toEqual(['辞职', '死亡']);
    expect(dict.LEFT_RELATION_VALUES).not.toContain('退休');
  });

  it('关系取值校验：未知值拒绝并给出可选项', () => {
    const r = dict.validateRelationInput('已离职');
    expect(r.ok).toBe(false);
    expect(r.message).toContain('无效的用工关系取值');
    expect(r.message).toContain('退休');
  });

  it('关系取值校验：assignment 状态值不得混入关系字段', () => {
    expect(dict.validateRelationInput('离职').ok).toBe(false);
    expect(dict.validateRelationInput('在职').ok).toBe(false);
    expect(dict.validateRelationInput('active').ok).toBe(false);
  });
});

// ============================================================
// G2 展示派生：inactive 不得单独决定原因
// ============================================================
describe('D1 · G2 展示派生（退休不显示为离职）', () => {
  it('displayStatusSql 退休分支派生 retired，且优先于 left 分支', () => {
    const sql = dict.displayStatusSql('e.employment_relation', 'ev.assignment_status').replace(/\s+/g, ' ');
    expect(sql).toContain("WHEN e.employment_relation = '退休' THEN 'retired'");
    expect(sql).toContain("IN ('辞职','死亡') THEN 'left'");
    // 分支顺序：退休必须在 left 之前，否则会被 left 吞掉
    expect(sql.indexOf("THEN 'retired'")).toBeLessThan(sql.indexOf("THEN 'left'"));
    expect(sql).toContain('ELSE ev.assignment_status');
  });

  it('displayStatusSql 不再把 关系=退休 归入 left', () => {
    const sql = dict.displayStatusSql('e.employment_relation', 'ev.assignment_status');
    expect(sql).not.toMatch(/IN \('辞职','死亡','退休'\)/);
  });

  it('profileStatusSql 退休分支前置，且保留 is_deleted 回退顺序', () => {
    const sql = dict.profileStatusSql('e.employment_relation', 'e.is_deleted').replace(/\s+/g, ' ');
    expect(sql).toContain("WHEN e.employment_relation = '退休' THEN 'retired'");
    expect(sql.indexOf("THEN 'retired'")).toBeLessThan(sql.indexOf("THEN 'left'"));
    expect(sql.indexOf("THEN 'left'")).toBeLessThan(sql.indexOf('WHEN e.is_deleted THEN'));
    expect(sql).toContain("ELSE 'active'");
  });

  it('关系为空时回落到任职段状态（不推断原因）', () => {
    const sql = dict.displayStatusSql('e.employment_relation', 'ev.assignment_status');
    expect(sql.trim().endsWith('END')).toBe(true);
    expect(sql).toContain('ELSE ev.assignment_status');
  });

  it('拒绝非法列引用（防注入）', () => {
    expect(() => dict.displayStatusSql("e.employment_relation; DROP TABLE x", 'y')).toThrow(/非法列引用/);
    expect(() => dict.profileStatusSql('ok_col', 'x OR 1=1')).toThrow(/非法列引用/);
  });

  it('退休展示值 retired 在前端字典中已有「退休」标签', () => {
    expect(dict.toStatusLabel('retired')).toBe('退休');
  });
});

// ============================================================
// G3 筛选：退休可检索 + 旧数据兼容
// ============================================================
describe('D1 · G3 筛选口径', () => {
  it('status=retired → 关系=退休 或 旧 assignment_status=retired', async () => {
    const sql = await captureListSql({ status: 'retired' });
    expect(sql).toContain("e.employment_relation = '退休'");
    expect(sql).toContain("ev.assignment_status = 'retired'");
    expect(sql).toContain('OR');
  });

  it('status=left → 仅 辞职/死亡，不含退休', async () => {
    const where = await captureListWhere({ status: 'left' });
    expect(where).toContain("e.employment_relation IN ('辞职','死亡')");
    expect(where).not.toContain('退休');
  });

  it('status=active → 仅正式员工', async () => {
    const where = await captureListWhere({ status: 'active' });
    expect(where).toContain("e.employment_relation = '正式员工'");
    expect(where).not.toContain('退休');
  });

  it('employmentRelation=total 含退休（全员口径不漏人）', async () => {
    const sql = await captureListSql({ employmentRelation: 'total' });
    expect(sql).toContain("e.employment_relation IN ('正式员工','辞职','死亡','退休'");
  });

  it('employeeProfileService 列表 status=retired 同样双口径', async () => {
    pool.query.mockReset();
    pool.query
      .mockResolvedValueOnce({ rows: [{ total: 0 }] })
      .mockResolvedValueOnce({ rows: [] });
    await profileService.getProfileList({ status: 'retired' });
    const sql = pool.query.mock.calls.map((c) => String(c[0])).join('\n');
    expect(sql).toContain("e.employment_relation = '退休'");
    expect(sql).toContain("ev.assignment_status = 'retired'");
  });

  it('employeeProfileService 列表 SQL 使用统一派生（不误标退休为离职）', async () => {
    pool.query.mockReset();
    pool.query
      .mockResolvedValueOnce({ rows: [{ total: 0 }] })
      .mockResolvedValueOnce({ rows: [] });
    await profileService.getProfileList({});
    const sql = pool.query.mock.calls.map((c) => String(c[0])).join('\n');
    expect(sql).toContain("WHEN e.employment_relation = '退休' THEN 'retired'");
  });

  it('驾驶员筛选排除全部终态原因（含退休），退休驾驶员不算在岗驾驶员', async () => {
    pool.query.mockReset();
    pool.query
      .mockResolvedValueOnce({ rows: [{ total: 0 }] })
      .mockResolvedValueOnce({ rows: [] });
    await profileService.getProfileList({ is_driver: 'true' });
    const sql = pool.query.mock.calls.map((c) => String(c[0])).join('\n');
    expect(sql).toContain("NOT IN ('辞职','死亡','退休')");
  });
});

// ============================================================
// G4 D2 历史事件标签
// ============================================================
describe('D2 · 历史事件原因可区分', () => {
  it('终态原因原样写入 after_status（退休 / 辞职 / 死亡）', () => {
    expect(dict.toHistoryStatusLabel('退休', 'inactive')).toBe('退休');
    expect(dict.toHistoryStatusLabel('辞职', 'inactive')).toBe('辞职');
    expect(dict.toHistoryStatusLabel('死亡', 'inactive')).toBe('死亡');
  });

  it('死亡不被误标为辞职', () => {
    expect(dict.toHistoryStatusLabel('死亡', 'inactive')).not.toBe('辞职');
    expect(dict.toHistoryStatusLabel('死亡', 'inactive')).not.toBe('离职');
  });

  it('无原因信息的终态仍写通用「离职」（不推断原因）', () => {
    expect(dict.toHistoryStatusLabel('离职', 'inactive')).toBe('离职');
    expect(dict.toHistoryStatusLabel('inactive', 'inactive')).toBe('离职');
    expect(dict.toHistoryStatusLabel(undefined, 'inactive')).toBe('离职');
  });

  it('非终态仍走编码 → 中文标签', () => {
    expect(dict.toHistoryStatusLabel('待岗', 'pending')).toBe('待岗');
    expect(dict.toHistoryStatusLabel('在职', 'active')).toBe('在职');
    expect(dict.toHistoryStatusLabel('返聘', 'reinstated')).toBe('返聘');
  });
});

// ============================================================
// G5 写入校验
// ============================================================
describe('D1 · G5 写入校验', () => {
  it('退休可写入', () => {
    expect(dict.validateRelationInput('退休')).toEqual({ ok: true, value: '退休' });
  });

  it('NULL / 空串允许写入且不推断（A-01：待核实）', () => {
    expect(dict.validateRelationInput(null)).toEqual({ ok: true, value: null });
    expect(dict.validateRelationInput('')).toEqual({ ok: true, value: null });
    expect(dict.validateRelationInput('   ')).toEqual({ ok: true, value: null });
  });

  it('未传该字段时跳过校验（不影响其他字段更新）', () => {
    expect(dict.validateRelationInput(undefined)).toEqual({ ok: true, skip: true });
  });

  // ── A-02B（B02-DEC-03.35）：以下用例验证「普通编辑接口收口」——
  // 旧的 D1 用例（updateEmployee 写入 employment_relation 通过 / 未知值-3 / 空串写 NULL）
  // 已被本节点显式推翻：关系变更只能走 A-02A 终态登记 / B2.2 返聘，普通编辑携带该字段一律拒绝(-4)，
  // 且在「任何业务更新之前」短路，不产生部分更新。
  it('updateEmployee 携带 employment_relation=退休 → 拒绝(-4)，不执行任何 UPDATE', async () => {
    pool.query.mockReset();
    pool.query.mockResolvedValue({ rows: [{ id: 3 }], rowCount: 1 });
    const res = await employeeService.updateEmployee(3, { employment_relation: '退休' });
    expect(res.error).toBe(-4);
    expect(res.message).toContain('终态登记');
    const upd = pool.query.mock.calls.find(([sql]) => String(sql).includes('UPDATE employee SET'));
    expect(upd).toBeUndefined();
  });

  it('updateEmployee 携带未知关系值 → 同样拒绝(-4)，不执行 UPDATE', async () => {
    pool.query.mockReset();
    pool.query.mockResolvedValue({ rows: [], rowCount: 0 });
    const res = await employeeService.updateEmployee(3, { employment_relation: '已离职' });
    expect(res.error).toBe(-4);
    expect(res.message).toContain('普通编辑接口');
    const upd = pool.query.mock.calls.find(([sql]) => String(sql).includes('UPDATE employee SET'));
    expect(upd).toBeUndefined();
  });

  it('updateEmployee 携带空串关系 → 同样拒绝(-4)，不写 NULL（NULL 不得由普通编辑推断/补值）', async () => {
    pool.query.mockReset();
    pool.query.mockResolvedValue({ rows: [{ id: 3 }], rowCount: 1 });
    const res = await employeeService.updateEmployee(3, { employment_relation: '' });
    expect(res.error).toBe(-4);
    const upd = pool.query.mock.calls.find(([sql]) => String(sql).includes('UPDATE employee SET'));
    expect(upd).toBeUndefined();
  });

  it('updateEmployee 不携带 employment_relation → 正常更新其他字段，且 UPDATE 不含 employment_relation', async () => {
    pool.query.mockReset();
    pool.query.mockResolvedValue({ rows: [{ id: 3, name: '新名' }], rowCount: 1 });
    const res = await employeeService.updateEmployee(3, { name: '新名', person_type: 'X' });
    expect(res.error).toBeUndefined();
    const updCalls = pool.query.mock.calls.filter(([sql]) => String(sql).includes('UPDATE employee SET'));
    expect(updCalls.length).toBe(1);
    expect(String(updCalls[0][0])).toContain('name = $');
    expect(String(updCalls[0][0])).not.toContain('employment_relation =');
  });

  it('updateEmployee 携带 employment_relation 时即使同时有其他字段，也不产生部分更新', async () => {
    pool.query.mockReset();
    pool.query.mockResolvedValue({ rows: [{ id: 3 }], rowCount: 1 });
    const res = await employeeService.updateEmployee(3, { name: '新名', employment_relation: '辞职' });
    expect(res.error).toBe(-4);
    const writeCalls = pool.query.mock.calls.filter(([sql]) => /^(UPDATE|INSERT|DELETE)\b/i.test(String(sql)));
    expect(writeCalls.length).toBe(0);
  });

  it('employment_relation=NULL 的员工仍可正常编辑其他允许字段', async () => {
    pool.query.mockReset();
    pool.query.mockResolvedValue({ rows: [{ id: 3, name: '新名' }], rowCount: 1 });
    const res = await employeeService.updateEmployee(3, { name: '新名' });
    expect(res.error).toBeUndefined();
    expect(res.row.name).toBe('新名');
  });

  it('终态人员不能通过普通编辑恢复关系：携带 employment_relation=正式员工 同样拒绝(-4)', async () => {
    pool.query.mockReset();
    pool.query.mockResolvedValue({ rows: [{ id: 3 }], rowCount: 1 });
    const res = await employeeService.updateEmployee(3, { employment_relation: '正式员工' });
    expect(res.error).toBe(-4);
    const upd = pool.query.mock.calls.find(([sql]) => String(sql).includes('UPDATE employee SET'));
    expect(upd).toBeUndefined();
  });
});

// ============================================================
// G6 终态关闭路径
// ============================================================
describe('D1 · G6 终态关闭路径', () => {
  it('退休 → status=inactive + is_current=false + end_date + after_status=退休', async () => {
    const client = makeClient(ORG_ROW);
    const res = await assignmentService.changeAssignmentStatus({
      id: 11, status: '退休', event_date: '2026-10-01', remark: '到龄退休',
    });
    expect(res.error).toBeUndefined();

    const upd = findCall(client, 'UPDATE employee_assignment');
    expect(upd[0]).toContain('is_current = false');
    expect(upd[0]).toContain('end_date');
    expect(upd[1][1]).toBe('inactive');
    expect(upd[1][2]).toBe('2026-10-01');

    const hist = findCall(client, 'INSERT INTO employee_history');
    // event_type = 退休；after_status = 退休（不再统一成「离职」）
    expect(hist[1][1]).toBe('退休');
    expect(hist[1][6]).toBe('退休');
    expect(res.audit.statusCode).toBe('inactive');
  });

  it('辞职 / 死亡 同样关闭任职段，但原因标签各自保留', async () => {
    for (const [raw, label] of [['辞职', '辞职'], ['死亡', '死亡']]) {
      pool.connect.mockReset();
      const client = makeClient(ORG_ROW);
      const res = await assignmentService.changeAssignmentStatus({
        id: 11, status: raw, event_date: '2026-10-02',
      });
      expect(res.error).toBeUndefined();
      const upd = findCall(client, 'UPDATE employee_assignment');
      expect(upd[0]).toContain('is_current = false');
      expect(upd[1][1]).toBe('inactive');
      const hist = findCall(client, 'INSERT INTO employee_history');
      expect(hist[1][1]).toBe(label);
      expect(hist[1][6]).toBe(label);
    }
  });

  it('事件 payload.toStatus 保留原因，不被统一成「离职」', async () => {
    makeClient(ORG_ROW);
    await assignmentService.changeAssignmentStatus({
      id: 11, status: '退休', event_date: '2026-10-03',
    });
    const ev = employeeEventService.publishEmployeeEvent.mock.calls.pop()[0];
    expect(ev.payload.toStatus).toBe('退休');
    expect(ev.payload.toStatusCode).toBe('inactive');
  });

  it('待岗 → pending：不关闭任职段（中间态）', async () => {
    const client = makeClient(ORG_ROW);
    const res = await assignmentService.changeAssignmentStatus({
      id: 11, status: '待岗', event_date: '2026-10-04',
    });
    const upd = findCall(client, 'UPDATE employee_assignment');
    expect(upd[1][1]).toBe('pending');
    expect(upd[0]).not.toContain('is_current = false');
    expect(upd[0]).not.toContain('end_date');
    expect(res.audit.statusCode).toBe('pending');
  });

  // A-02e.5-B2.2 语义纠正：原用例标题为「返聘 → reinstated：保持原有行为（不关闭任职段）」，
  // 断言的是「把一条【在职】当前段的 status 改成 reinstated」——它记录的是缺陷现状，不是正确语义：
  // 该路径既不建新段、也不改 employment_relation，只会产出「段说返聘、关系说退休/在职」的畸形数据
  // （A-02e.5-B2.1 §5 证据）。现改为断言「旧接口明确拒绝，并指向独立返聘流程」。
  it('返聘 → 状态变更接口明确拒绝（返聘不是状态变更，须走 POST /org/rehire）', async () => {
    const client = makeClient(ORG_ROW);
    const res = await assignmentService.changeAssignmentStatus({
      id: 11, status: '返聘', event_date: '2026-10-05',
    });

    expect(res.error).toBe(-4);
    expect(res.message).toContain('返聘流程');
    // 不得产生任何 reinstated 写入，也不得触碰任职段/历史
    expect(client.calls).toEqual([]);
    expect(pool.connect).not.toHaveBeenCalled();
  });
});

// ============================================================
// G7 历史兼容
// ============================================================
describe('G7 · 历史值兼容未被破坏', () => {
  it('former 仍为只读历史值，展示为中性「历史段」', () => {
    expect(dict.normalizeStatus('former')).toBeNull();
    expect(dict.toStatusLabel('former')).toBe('历史段');
  });

  it('历史 retired 编码仍可展示为「退休」', () => {
    expect(dict.toStatusLabel('retired')).toBe('退休');
  });

  it('新写入 retired 仍归一为 inactive（不新增 retired 写入值）', () => {
    expect(dict.normalizeStatus('retired')).toBe('inactive');
  });

  it('reinstated 展示与归一均保持原样', () => {
    expect(dict.normalizeStatus('返聘')).toBe('reinstated');
    expect(dict.toStatusLabel('reinstated')).toBe('返聘');
  });
});

// ============================================================
// G8 assignEmployee 任职段影响
// ============================================================
describe('G8 · assignEmployee 对任职段的影响', () => {
  it('存在当前段：关闭旧段并新建 active 段', async () => {
    const client = makeClient(ORG_ROW);
    const res = await assignmentService.assignEmployee({
      employee_id: 7, team_id: 5, position_id: 9, start_date: '2026-10-06', change_reason: '调岗',
    });
    expect(res.error).toBeUndefined();

    const closeCall = client.calls.find(([sql]) => sql.includes('SET is_current = false, end_date = $2'));
    expect(closeCall).toBeTruthy();
    // 旧段结束日期 = 新段开始日期 - 1 天
    expect(closeCall[1][1]).toBe('2026-10-05');

    const ins = client.calls.find(([sql]) => sql.includes('INSERT INTO employee_assignment'));
    expect(ins[0]).toContain("'active'");
    expect(ins[0]).toContain('is_current');

    const hist = findCall(client, 'INSERT INTO employee_history');
    expect(hist[1][1]).toBe('调岗');
    // assignEmployee 的 after_status 为 SQL 字面量「在职」（现状，本次不改）
    expect(hist[0]).toContain("'在职'");
  });

  it('无当前段：事件类型为「入职」', async () => {
    const client = makeClient(null);
    await assignmentService.assignEmployee({
      employee_id: 8, team_id: 5, start_date: '2026-10-07',
    });
    const hist = findCall(client, 'INSERT INTO employee_history');
    expect(hist[1][1]).toBe('入职');
  });

  it('已记录已知缺口：assignEmployee 关旧段时不改 status（R3，本轮不修）', async () => {
    const client = makeClient({ ...ORG_ROW, status: 'pending' });
    await assignmentService.assignEmployee({
      employee_id: 7, team_id: 5, start_date: '2026-10-08',
    });
    const closeCall = client.calls.find(([sql]) => sql.includes('SET is_current = false, end_date = $2'));
    // 现状：关闭旧段时未同时改 status，且新段恒为 active
    expect(closeCall[0]).not.toContain('status =');
    const ins = client.calls.find(([sql]) => sql.includes('INSERT INTO employee_assignment'));
    expect(ins[0]).toContain("'active'");
  });
});
