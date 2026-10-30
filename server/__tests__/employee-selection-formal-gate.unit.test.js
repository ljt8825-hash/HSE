/**
 * B-1-P1-03-02-R1 — 人员选择资格统一·返修测试（纯单测，不连接数据库）
 *
 * R1-03 resolveSignee 运行时行为测试（真调用导出函数，mock pool.query 捕获实际 SQL）：
 *   四种解析路径（employeeId/employeeCode/idCard/name）+ 辞职/NULL 拒绝 + 同名唯一性 + 别名正确性。
 * R1-04 generateFromPending 逐人资格校验行为测试：
 *   正式员工进入原流程；非正式员工（辞职/NULL/退休）逐人拒绝且不绕过；混合批次互不影响。
 * R1-05 弱断言修复：buildRosterWhere 经 rosterStats 真实调用链验证（找不到目标 SQL 即失败）；
 *   删除原版无意义变量与 if 条件弱断言；所有测试有明确失败条件。
 */
jest.mock('../config/db', () => ({
  pool: { query: jest.fn(), connect: jest.fn() },
  isConnected: jest.fn(() => true),
}));

const { pool } = require('../config/db');
const selectorService = require('../services/employeeSelectorService');
const { formalEmployeeEligibilitySql } = require('../services/employeeStatusDict');

const FORMAL_EV = formalEmployeeEligibilitySql('ev');

beforeEach(() => jest.clearAllMocks());

// ============================================================
// 生成器单一事实源（保留：字节一致 + 注入防护）
// ============================================================
describe('B-1-P1-03-02-R1 · formalEmployeeEligibilitySql 生成器', () => {
  it('T0a 默认别名 v 与 R4 冻结常量逐字节一致；别名参数化', () => {
    const r4 = require('../services/assessmentTargetEligibility').FORMAL_EMPLOYEE_ELIGIBILITY_SQL;
    expect(formalEmployeeEligibilitySql('v')).toBe(r4);
    expect(formalEmployeeEligibilitySql('ev')).toContain('fe.id = ev.employee_id');
    expect(formalEmployeeEligibilitySql('e')).toContain("fe.employment_relation = '正式员工'");
  });

  it('T0b 非法别名（注入面）拒绝', () => {
    expect(() => formalEmployeeEligibilitySql('v; DROP TABLE employee')).toThrow();
    expect(() => formalEmployeeEligibilitySql('')).toThrow();
  });
});

// ============================================================
// 公共选择器（新选过滤 + 历史回显保护）
// ============================================================
describe('B-1-P1-03-02-R1 · 公共选择器', () => {
  it('T1 listSelector（新选候选）SQL 含正式员工资格条件', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    await selectorService.listSelector({ keyword: '张' });
    const sql = pool.query.mock.calls[0][0];
    expect(sql).toContain('FROM v_employee_org_full');
    expect(sql).toContain(FORMAL_EV);
    expect(sql).toContain("fe.employment_relation = '正式员工'");
  });

  it('T10/T11 listSelector 保留原有筛选与分页契约', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    await selectorService.listSelector({
      keyword: '李', org_unit_id: '12', position_id: '34', is_driver: 'true', limit: '50',
    });
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain('ev.is_deleted = false');
    expect(sql).toContain('ev.is_current = true');
    expect(sql).toContain('ev.name ILIKE $1 OR ev.employee_code ILIKE $1');
    expect(sql).toContain('ev.org_unit_id = $2');
    expect(sql).toContain('ev.position_id = $3');
    expect(sql).toContain("ev.position_name ILIKE '%驾驶员%'");
    expect(sql).toContain('LIMIT $4');
    expect(params).toEqual(['%李%', 12, 34, 50]);
  });

  it('T7/T9 getSelectorById（历史回显）SQL 不含正式员工资格条件', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    await selectorService.getSelectorById(8095);
    const sql = pool.query.mock.calls[0][0];
    expect(sql).toContain('FROM v_employee_org_full');
    expect(sql).not.toContain("employment_relation = '正式员工'");
    expect(sql).not.toContain('EXISTS');
  });

  it('T7/T9 batchSelector（历史回显）SQL 不含正式员工资格条件', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    await selectorService.batchSelector([8095, 9734]);
    const sql = pool.query.mock.calls[0][0];
    expect(sql).toContain('employee_id = ANY($1)');
    expect(sql).not.toContain("employment_relation = '正式员工'");
    expect(sql).not.toContain('EXISTS');
  });
});

// ============================================================
// R1-01/R1-03 resolveSignee 运行时行为测试（真调用，mock pool.query）
// ============================================================
describe('B-1-P1-03-02-R1 · resolveSignee 四种解析路径（真调用）', () => {
  const objectiveService = require('../services/objectiveService');
  const FORM_ROW = { employee_id: 6887, name: '艾测试', org_unit_id: 9, org_name: '某作业中心' };

  it('R1-01a 正式员工经 employeeId 解析成功，SQL 别名与资格条件正确', async () => {
    pool.query.mockResolvedValueOnce({ rows: [FORM_ROW] });
    const r = await objectiveService.resolveSignee({ employeeId: '6887' });
    expect(r).toEqual(FORM_ROW);
    const sql = pool.query.mock.calls[0][0];
    expect(sql).toContain('FROM v_employee_current ev');                 // 别名已定义（R1-01 修复点）
    expect(sql).toContain('ev.employee_deleted=false');
    expect(sql).toContain("ev.assignment_status='active'");
    expect(sql).toContain('fe.id = ev.employee_id');                     // EXISTS 引用别名
    expect(sql).toContain('AND ev.employee_id=$1');
    expect(pool.query.mock.calls[0][1]).toEqual(['6887']);
  });

  it('R1-01b 正式员工经 employeeCode 解析成功', async () => {
    pool.query.mockResolvedValueOnce({ rows: [FORM_ROW] });
    const r = await objectiveService.resolveSignee({ employeeCode: 'E001' });
    expect(r).toEqual(FORM_ROW);
    const sql = pool.query.mock.calls[0][0];
    expect(sql).toContain('FROM v_employee_current ev');
    expect(sql).toContain('ev.employee_code ILIKE $1');
    expect(pool.query.mock.calls[0][1]).toEqual(['E001']);
  });

  it('R1-01c 正式员工经 idCard 解析成功（唯一命中语义保持）', async () => {
    pool.query.mockResolvedValueOnce({ rows: [FORM_ROW] });
    const r = await objectiveService.resolveSignee({ idCard: '3724XXXXXX' });
    expect(r).toEqual(FORM_ROW);
    const sql = pool.query.mock.calls[0][0];
    expect(sql).toContain('ev.id_card=$1');
  });

  it('R1-01d 正式员工经 name 唯一匹配解析成功', async () => {
    pool.query.mockResolvedValueOnce({ rows: [FORM_ROW] });
    const r = await objectiveService.resolveSignee({ name: '艾测试' });
    expect(r).toEqual(FORM_ROW);
    const sql = pool.query.mock.calls[0][0];
    expect(sql).toContain('ev.name=$1');
  });

  it('R1-03e 辞职人员（段仍 active）不能解析为新签订人——资格过滤使其零候选', async () => {
    // DB 层面：EXISTS 资格条件使辞职人员不返回行；mock 0 行模拟该过滤结果，
    // 同时断言发出的 SQL 确实携带资格条件（防止 mock 0 行掩盖缺条件）。
    pool.query.mockResolvedValueOnce({ rows: [] });
    const r = await objectiveService.resolveSignee({ employeeId: '8095' });
    expect(r).toBeNull();
    const sql = pool.query.mock.calls[0][0];
    expect(sql).toContain("fe.employment_relation = '正式员工'");
  });

  it('R1-03f employment_relation 为 NULL 的人员不能解析为正式员工', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const r = await objectiveService.resolveSignee({ employeeId: '7001' });
    expect(r).toBeNull();
    // NULL 与 '正式员工' 等值比较为 NULL → 不命中；SQL 必须是精确等值而非 IS NULL 放行
    const sql = pool.query.mock.calls[0][0];
    expect(sql).toMatch(/fe\.employment_relation = '正式员工'/);
    expect(sql).not.toMatch(/IS NULL/);
  });

  it('R1-03g 同名多人仍遵循原唯一性规则（>1 行不解析）', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [FORM_ROW, { ...FORM_ROW, employee_id: 7000 }],
    });
    const r = await objectiveService.resolveSignee({ name: '重名' });
    expect(r).toBeNull();
  });

  it('R1-03h 全部查询 SQL 均定义 ev 别名，不存在未定义别名的引用', async () => {
    const captured = [];
    pool.query.mockImplementation(async (sql) => { captured.push(String(sql)); return { rows: [FORM_ROW] }; });
    await objectiveService.resolveSignee({ employeeId: '6887' });
    await objectiveService.resolveSignee({ employeeCode: 'E001' });
    await objectiveService.resolveSignee({ idCard: '37X' });
    await objectiveService.resolveSignee({ name: '艾测试' });
    expect(captured.length).toBe(4);
    for (const sql of captured) {
      expect(sql).toContain('FROM v_employee_current ev');
      expect(sql).not.toMatch(/FROM v_employee_current\s+WHERE/); // 无别名形态必须消失
    }
  });
});

// ============================================================
// R1-05 buildRosterWhere 经 rosterStats 真实调用链验证（找不到目标 SQL 即失败）
// ============================================================
describe('B-1-P1-03-02-R1 · 目标责任书在职台账（rosterStats 真调用链）', () => {
  it('R1-05a rosterStats 发出的台账 SQL 含正式员工资格条件（含 hse_target_contracts，缺之即失败）', async () => {
    const objectiveService = require('../services/objectiveService');
    pool.query.mockImplementation(async (sql) => {
      if (/COUNT\(\*\)::int AS c/.test(String(sql))) return { rows: [{ c: 0 }] };
      return { rows: [] }; // ensureTables 等辅助查询
    });
    const r = await objectiveService.rosterStats({});
    expect(r.payload).toBeDefined(); // 调用成功
    const rosterSql = pool.query.mock.calls.map((c) => String(c[0]))
      .find((s) => s.includes('FROM v_employee_current e') && s.includes('hse_target_contracts'));
    // 明确失败条件：目标 SQL 未被触发或不含资格条件
    expect(rosterSql).toBeDefined();
    expect(rosterSql).toContain('FROM v_employee_current e');
    expect(rosterSql).toContain('fe.id = e.employee_id');
    expect(rosterSql).toContain("fe.employment_relation = '正式员工'");
  });
});

// ============================================================
// R1-02/R1-04 generateFromPending 逐人资格校验（真调用）
// ============================================================
describe('B-1-P1-03-02-R1 · 待参保生成接口逐人资格校验', () => {
  const insurancePersonnelService = require('../services/insurancePersonnelService');

  /** 按 SQL 分派的可控 mock：资格表按 id 返回关系值；人员视图按 id 返回 person；INSERT 记录 */
  function installHandler({ relations = {}, persons = {}, insertIds = [] } = {}) {
    pool.query.mockImplementation(async (sql, params) => {
      const s = String(sql);
      if (s.includes('FROM v_employee_current WHERE employee_id')) {
        const id = params[0];
        return persons[id] ? { rows: [persons[id]] } : { rows: [] };
      }
      if (s.includes('SELECT employment_relation FROM employee')) {
        const id = params[0];
        const rel = relations[id];
        return { rows: rel === undefined ? [] : [{ employment_relation: rel }] };
      }
      if (s.includes('INSERT INTO personnel_insurance')) {
        insertIds.push(params[0]);
        return { rowCount: 1, rows: [] };
      }
      return { rows: [] }; // 重复保单冲突检查等：无冲突
    });
  }

  const FORM_PERSON = { employee_id: 101, name: '张正式', birth_date: '1990-05-01', gender: '男' };

  it('R1-04a 正式员工通过资格校验并进入原生成流程（规则匹配→INSERT）', async () => {
    const insertIds = [];
    installHandler({
      relations: { 101: '正式员工' },
      persons: { 101: FORM_PERSON },
      insertIds,
    });
    const r = await insurancePersonnelService.generateFromPending({
      ids: [101], defaultStartDate: '2026-11-01', defaultExpireDate: '2027-10-31',
    });
    expect(r.payload.processed).toBe(1);
    // 成人默认方案（非超龄且无五险）：资格通过后走原规则匹配，产生 INSERT
    expect(insertIds).toContain(101);
    expect(r.payload.generated).toBeGreaterThanOrEqual(1);
    expect(r.payload.failed.filter((f) => f.reason === 'not_formal_employee')).toHaveLength(0);
  });

  it('R1-04b 辞职/NULL/退休人员被逐人拒绝，reason=not_formal_employee，不产生 INSERT', async () => {
    const insertIds = [];
    installHandler({
      relations: { 201: '辞职', 202: null, 203: '退休' },
      persons: { 201: { ...FORM_PERSON, employee_id: 201 }, 202: { ...FORM_PERSON, employee_id: 202 }, 203: { ...FORM_PERSON, employee_id: 203 } },
      insertIds,
    });
    const r = await insurancePersonnelService.generateFromPending({
      ids: [201, 202, 203], defaultStartDate: '2026-11-01', defaultExpireDate: '2027-10-31',
    });
    expect(r.payload.processed).toBe(3);
    expect(r.payload.generated).toBe(0);
    expect(insertIds).toHaveLength(0);
    const reasons = r.payload.failed.filter((f) => f.reason === 'not_formal_employee');
    expect(reasons.map((f) => f.row).sort()).toEqual([201, 202, 203]);
    // 失败原因含可读的用工关系值（NULL 显示为待核实）
    expect(reasons.find((f) => f.row === 202).message).toContain('待核实');
  });

  it('R1-04c 直接传入非正式员工 ID 不能绕过资格校验（服务端拦截，不依赖前端筛选）', async () => {
    const insertIds = [];
    installHandler({
      relations: { 201: '辞职' },
      persons: { 201: { ...FORM_PERSON, employee_id: 201 } }, // 视图行存在（段仍 active）
      insertIds,
    });
    const r = await insurancePersonnelService.generateFromPending({
      ids: [201], defaultStartDate: '2026-11-01', defaultExpireDate: '2027-10-31',
    });
    expect(insertIds).toHaveLength(0);
    expect(r.payload.failed[0]).toMatchObject({ row: 201, reason: 'not_formal_employee' });
  });

  it('R1-04d 混合批次逐人处理：合格人员正常生成，不合格人员返回明确失败原因', async () => {
    const insertIds = [];
    installHandler({
      relations: { 101: '正式员工', 201: '辞职' },
      persons: { 101: FORM_PERSON, 201: { ...FORM_PERSON, employee_id: 201 } },
      insertIds,
    });
    const r = await insurancePersonnelService.generateFromPending({
      ids: [101, 201], defaultStartDate: '2026-11-01', defaultExpireDate: '2027-10-31',
    });
    expect(r.payload.processed).toBe(2);
    expect(r.payload.generated).toBeGreaterThanOrEqual(1);   // 101 正常生成
    expect(insertIds).toEqual([101]);                        // 201 未产生任何 INSERT
    const f = r.payload.failed.find((x) => x.row === 201);
    expect(f.reason).toBe('not_formal_employee');
    expect(f.message).toContain('辞职');
  });

  it('R1-04e 人员不存在仍返回 employee_not_found（原语义保持）', async () => {
    const insertIds = [];
    installHandler({ relations: {}, persons: {}, insertIds });
    const r = await insurancePersonnelService.generateFromPending({
      ids: [999], defaultStartDate: '2026-11-01', defaultExpireDate: '2027-10-31',
    });
    expect(r.payload.failed[0]).toMatchObject({ row: 999, reason: 'employee_not_found' });
    expect(insertIds).toHaveLength(0);
  });
});
