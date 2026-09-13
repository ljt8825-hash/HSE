/**
 * 人员保险稳定 ID 联动回归测试（任务6，全部 mock db，不产生真实连接）
 *
 * 覆盖场景：
 *  1. 花名册人员无保险 → 两险 uninsured
 *  2. 仅雇主险 / 仅工伤险 / 两险都有
 *  3. 过期与 30 天内临期状态
 *  4. 两个同名人员不同 employeeId/保单 → 不串单不合并
 *  5. 改名但 employeeId 不变 → 仍关联该人员，显示当前姓名
 *  6. 同险种多条历史 → 确定性选择一条（SQL 含 ROW_NUMBER 排序），字段不跨记录拼接
 *  7. employee_id 为空/引用不存在 → 未匹配（不按姓名自动绑定）
 *  8. sync-from-roster 接收 employeeIds（详情不再发送保险记录 ID）
 *  9. 创建 / generate-from-pending 写入 employee_id；重复当前险种被拒绝
 *  10-13 见 insurance-file / requireRole / import 测试套件
 */
jest.mock('../config/db', () => ({
  pool: { query: jest.fn() },
  isConnected: jest.fn(() => true),
  testConnection: jest.fn(),
}));

const request = require('supertest');
const jwt = require('jsonwebtoken');

const app = require('../app');
const db = require('../config/db');
const { pool } = db;

const adminUserRow = {
  id: 1,
  username: 'admin',
  real_name: '系统管理员',
  role: 'admin',
  department: '安全部',
  phone: '',
  email: '',
  avatar: null,
  is_active: true,
};

function signToken(payload) {
  return jwt.sign({ type: 'access', ...payload }, process.env.JWT_SECRET, {
    expiresIn: '1h',
    jwtid: 'pi-jti-' + Math.random().toString(36).slice(2),
  });
}

function mockAuth() {
  pool.query.mockResolvedValueOnce({ rows: [] }); // 黑名单
  pool.query.mockResolvedValueOnce({ rows: [adminUserRow] }); // 用户
}

/** 主列表查询返回：count + 数据行 */
function mockList(rows) {
  pool.query.mockResolvedValueOnce({ rows: [{ total: rows.length }] }); // COUNT
  pool.query.mockResolvedValueOnce({ rows }); // 列表
}

/** 构造一个主列表返回行（v_employee_current + 保险侧字段）。
 *  任务7 新语义：当前有效需 is_current=true 且 start_date<=业务日<=expire_date，
 *  故默认补齐 emp_is_current/inj_is_current=true；使用方如需测停用/未来显式覆盖。 */
function rosterRow(overrides = {}) {
  return {
    employee_id: 1,
    name: '张三',
    gender: '男',
    age: 35,
    id_card: '',
    department: '安全部',
    position: '安全员',
    personnel_id: null,
    emp_id: null, emp_policy_no: null, emp_start_date: null, emp_expire_date: null, emp_is_current: true, emp_premium: null, emp_coverage: null,
    inj_id: null, inj_policy_no: null, inj_start_date: null, inj_expire_date: null, inj_is_current: true, inj_premium: null, inj_coverage: null,
    ...overrides,
  };
}

describe('人员保险稳定 ID 联动', () => {
  beforeEach(() => {
    pool.query.mockReset();
  });

  const auth = { Authorization: `Bearer ${signToken({ id: 1, username: 'admin', role: 'admin' })}` };

  // ---------- 场景1：花名册人员无保险 → 两险 uninsured ----------
  test('无保险事实时两险均为 uninsured，不插入虚假记录', async () => {
    mockAuth();
    mockList([rosterRow()]);
    const res = await request(app).get('/api/insurance/personnel').set(auth);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.list).toHaveLength(1);
    const item = res.body.data.list[0];
    expect(item.employeeId).toBe(1);
    expect(item.rowKey).toBe('employee:1');
    expect(item.employer.hasInsurance).toBe(false);
    expect(item.employer.status).toBe('uninsured');
    expect(item.injury.status).toBe('uninsured');
  });

  // ---------- 场景2：仅雇主险 / 仅工伤险 / 两险都有 ----------
  test('仅雇主险时工伤险为 uninsured', async () => {
    mockAuth();
    mockList([rosterRow({ emp_id: 10, emp_policy_no: 'E-1', emp_start_date: '2024-01-01', emp_expire_date: '2027-12-31', emp_coverage: 800000 })]);
    const res = await request(app).get('/api/insurance/personnel').set(auth);
    const item = res.body.data.list[0];
    expect(item.employer.hasInsurance).toBe(true);
    expect(item.employer.status).toBe('insured');
    expect(item.injury.hasInsurance).toBe(false);
    expect(item.injury.status).toBe('uninsured');
  });

  test('仅工伤险时雇主险为 uninsured', async () => {
    mockAuth();
    mockList([rosterRow({ inj_id: 20, inj_policy_no: 'I-1', inj_start_date: '2024-01-01', inj_expire_date: '2027-12-31' })]);
    const res = await request(app).get('/api/insurance/personnel').set(auth);
    const item = res.body.data.list[0];
    expect(item.injury.hasInsurance).toBe(true);
    expect(item.employer.hasInsurance).toBe(false);
  });

  test('两险都有时均 insured', async () => {
    mockAuth();
    mockList([rosterRow({
      emp_id: 10, emp_policy_no: 'E-1', emp_start_date: '2024-01-01', emp_expire_date: '2027-12-31', emp_coverage: 800000,
      inj_id: 20, inj_policy_no: 'I-1', inj_start_date: '2024-01-01', inj_expire_date: '2027-12-31',
    })]);
    const res = await request(app).get('/api/insurance/personnel').set(auth);
    const item = res.body.data.list[0];
    expect(item.employer.status).toBe('insured');
    expect(item.injury.status).toBe('insured');
  });

  // ---------- 场景3：过期与 30 天内临期 ----------
  test('到期日已过 → expired；30 天内 → expiring', async () => {
    mockAuth();
    mockList([rosterRow({ emp_id: 10, emp_start_date: '2019-01-01', emp_expire_date: '2020-01-01' })]);
    const a = await request(app).get('/api/insurance/personnel').set(auth);
    expect(a.body.data.list[0].employer.status).toBe('expired');

    pool.query.mockReset();
    mockAuth();
    const future30 = new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10);
    mockList([rosterRow({ emp_id: 10, emp_start_date: '2020-01-01', emp_expire_date: future30 })]);
    const b = await request(app).get('/api/insurance/personnel').set(auth);
    expect(b.body.data.list[0].employer.status).toBe('expiring');
  });

  // ---------- 场景4：同名两人不串单 ----------
  test('两个同名人员（不同 employeeId/保单）rowKey 不同、保单不串', async () => {
    mockAuth();
    mockList([
      rosterRow({ employee_id: 1, name: '李四', emp_id: 10, emp_policy_no: 'E-A', emp_expire_date: '2027-12-31' }),
      rosterRow({ employee_id: 2, name: '李四', inj_id: 20, inj_policy_no: 'I-B', inj_expire_date: '2027-12-31' }),
    ]);
    const res = await request(app).get('/api/insurance/personnel').set(auth);
    const list = res.body.data.list;
    expect(list).toHaveLength(2);
    expect(list[0].rowKey).toBe('employee:1');
    expect(list[1].rowKey).toBe('employee:2');
    // 人员1只有雇主险，人员2只有工伤险，互不串单
    expect(list[0].employer.policyNo).toBe('E-A');
    expect(list[0].injury.hasInsurance).toBe(false);
    expect(list[1].injury.policyNo).toBe('I-B');
    expect(list[1].employer.hasInsurance).toBe(false);
  });

  // ---------- 场景5：改名但 employeeId 不变 ----------
  test('保险快照旧名、花名册新名：仍按 employeeId 关联并显示当前姓名', async () => {
    mockAuth();
    mockList([rosterRow({ employee_id: 7, name: '王新名', emp_id: 10, emp_policy_no: 'E-X', emp_expire_date: '2027-12-31' })]);
    const res = await request(app).get('/api/insurance/personnel').set(auth);
    const item = res.body.data.list[0];
    expect(item.employeeId).toBe(7);
    expect(item.personName).toBe('王新名'); // 花名册当前姓名
    expect(item.employer.policyNo).toBe('E-X'); // 保险仍关联
  });

  // ---------- 场景6：同险种多条历史 → 确定性选择（SQL 层面锁定） ----------
  test('主列表 SQL 使用 employee_id 关联与 ROW_NUMBER 确定性排序', async () => {
    mockAuth();
    mockList([]);
    await request(app).get('/api/insurance/personnel').set(auth);
    const sqlCalls = pool.query.mock.calls.map((c) => String(c[0]));
    const listSql = sqlCalls.find((s) => s.includes('FROM v_employee_current ev') && s.includes('LIMIT'));
    expect(listSql).toBeDefined();
    // 关联键为 employee_id（不得再按 person_name 关联）
    expect(listSql).toContain('emp.employee_id = ev.employee_id');
    expect(listSql).not.toContain('piv.person_name = ev.name');
    expect(listSql).not.toContain('GROUP BY person_name');
    // 确定性选择：ROW_NUMBER + 当前有效 CASE 优先（任务8），再 is_current>到期日>起期>id
    expect(listSql).toContain('ROW_NUMBER() OVER');
    expect(listSql).toContain('WHEN p.is_current = true');
    expect(listSql).toContain("(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date");
    expect(listSql).toContain('THEN 0');
    expect(listSql).toContain('END ASC');
    expect(listSql).toContain('p.is_current DESC, p.expire_date DESC NULLS LAST');
    expect(listSql).toContain('p.start_date DESC NULLS LAST, p.id DESC');
  });

  // ---------- 场景7：未匹配保险记录（employee_id 为空/不存在）不按姓名自动绑定 ----------
  test('pending-list 排除已参保人员按 employee_id（NOT EXISTS），不按姓名', async () => {
    mockAuth();
    pool.query.mockResolvedValueOnce({ rows: [] }); // 员工查询（无数据）
    const res = await request(app).get('/api/insurance/personnel/pending-list').set(auth);
    expect(res.statusCode).toBe(200);
    // calls[0]=黑名单, calls[1]=用户, calls[2]=员工查询（pending-list）
    const sql = String(pool.query.mock.calls[2][0]);
    // 使用 NOT EXISTS employee_id 排除，不再按 person_name IN 排除
    expect(sql).toContain('NOT EXISTS');
    expect(sql).toContain('p.employee_id = e.employee_id');
    expect(sql).not.toContain('person_name NOT IN');
  });

  // ---------- 场景8：sync-from-roster 接收 employeeIds ----------
  test('sync-from-roster 接收 employeeIds 并按 employee_id 更新快照', async () => {
    mockAuth();
    pool.query.mockResolvedValueOnce({ rows: [{ id: 10 }] }); // UPDATE 命中
    const res = await request(app)
      .post('/api/insurance/personnel/sync-from-roster')
      .set(auth)
      .send({ employeeIds: [7] });
    expect(res.statusCode).toBe(200);
    expect(res.body.data.synced).toBe(1);
    const sql = String(pool.query.mock.calls[2][0]); // 黑名单、用户、UPDATE
    expect(sql).toContain('p.employee_id = $1');
    expect(sql).toContain('e.employee_id = $1');
    expect(sql).not.toContain('e.name = p.person_name');
  });

  test('sync-from-roster 旧字段 ids 不再被接受（视为未选择）', async () => {
    mockAuth();
    const res = await request(app)
      .post('/api/insurance/personnel/sync-from-roster')
      .set(auth)
      .send({ ids: [10] });
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('请选择要同步的人员');
  });

  // ---------- 场景9：创建与 generate-from-pending 写入 employee_id ----------
  test('POST /personnel 接收 employeeId 并从花名册解析快照', async () => {
    mockAuth();
    pool.query.mockResolvedValueOnce({ rows: [{ name: '赵六', org_name: '安全部', position_name: '安全员' }] }); // 快照查询
    pool.query.mockResolvedValueOnce({ rows: [{ id: 99, employee_id: 5, person_name: '赵六' }] }); // INSERT RETURNING
    const res = await request(app)
      .post('/api/insurance/personnel')
      .set(auth)
      .send({ employeeId: 5, insuranceType: '雇主责任险' });
    expect(res.statusCode).toBe(200);
    // calls[0]=黑名单, calls[1]=用户, calls[2]=快照查询, calls[3]=INSERT
    // （任务1/提示词10：无起止日期 → 最终事实非 active → 不查冲突）
    const sql = String(pool.query.mock.calls[3][0]);
    expect(sql).toContain('employee_id');
    // 客户端未提交姓名：INSERT 参数使用花名册解析的姓名
    expect(pool.query.mock.calls[3][1]).toContain('赵六');
  });

  test('POST /personnel 缺 employeeId 拒绝', async () => {
    mockAuth();
    const res = await request(app)
      .post('/api/insurance/personnel')
      .set(auth)
      .send({ person_name: '无名', insuranceType: '雇主责任险' });
    // strict schema：缺 employeeId 且含未知字段（person_name）→ 400 明确拒绝
    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('generate-from-pending 写入 employee_id 且重复当前险种被拒绝', async () => {
    mockAuth();
    // 1) 员工查询 2) 冲突服务（命中 → 拒绝）3) INSERT（不应调用）
    pool.query.mockResolvedValueOnce({
      rows: [{ employee_id: 3, name: '钱七', gender: '男', birth_date: '1990-01-01', org_name: 'A', position_name: 'P', has_five_ins: false }],
    });
    pool.query.mockResolvedValueOnce({ rows: [{ id: 55 }] }); // 冲突服务命中
    const res = await request(app)
      .post('/api/insurance/personnel/generate-from-pending')
      .set(auth)
      // 任务1（提示词10）：仅当最终事实在业务日 active 时才查冲突——传 active 区间使冲突检查发生
      .send({ ids: [3], defaultStartDate: '2026-01-01', defaultExpireDate: '2027-01-01' });
    expect(res.statusCode).toBe(200);
    // INSERT 未被调用（防重复生效），且错误信息包含"已存在当前保单"
    const insertCalls = pool.query.mock.calls.filter((c) => String(c[0]).includes('INSERT INTO personnel_insurance'));
    expect(insertCalls).toHaveLength(0);
    // 任务9：结构化 failed 数组（含稳定 reason）
    expect(res.body.data.failed.some((e) => e.reason === 'duplicate_active_policy')).toBe(true);
    expect(res.body.data.generated).toBe(0);
  });

  test('generate-from-pending 无重复时 INSERT 写入 employee_id（generated 按保单数）', async () => {
    mockAuth();
    pool.query.mockResolvedValueOnce({
      rows: [{ employee_id: 3, name: '钱七', gender: '男', birth_date: '1990-01-01', org_name: 'A', position_name: 'P', has_five_ins: false }],
    });
    pool.query.mockResolvedValueOnce({ rows: [] }); // 冲突服务：无
    pool.query.mockResolvedValueOnce({ rows: [] }); // INSERT（两个险种可能多次）
    pool.query.mockResolvedValueOnce({ rows: [] }); // 冲突服务（第二个险种）
    pool.query.mockResolvedValueOnce({ rows: [] }); // INSERT（第二个险种）
    const res = await request(app)
      .post('/api/insurance/personnel/generate-from-pending')
      .set(auth)
      .send({ ids: [3], defaultStartDate: '2026-01-01', defaultExpireDate: '2027-01-01' });
    const insertCalls = pool.query.mock.calls.filter((c) => String(c[0]).includes('INSERT INTO personnel_insurance'));
    expect(insertCalls.length).toBeGreaterThan(0);
    expect(insertCalls[0][0]).toContain('employee_id');
    // 任务9：generated = 实际写入保单数（此处规则为 adult_employer → 仅 雇主责任险 1 个险种）
    expect(res.body.data.generated).toBe(1);
    expect(res.body.data.failed).toHaveLength(0);
  });
});

// ============================================================================
// 任务7 追加：固定时间状态边界（直接测 calcInsuranceStatus 纯函数；新语义 isCurrent 必填）
// ============================================================================
describe('calcInsuranceStatus 状态边界（任务7，固定时间）', () => {
  const { calcInsuranceStatus } = require('../routes/insurance');
  // 固定业务日期：2026-08-05
  const today = new Date('2026-08-05T00:00:00Z');

  test('is_current=false → uninsured', () => {
    expect(calcInsuranceStatus({ isCurrent: false, startDate: '2026-01-01', expireDate: '2027-01-01' }, today)).toBe('uninsured');
  });

  test('is_current 缺失 → uninsured（不再默认视为当前保单）', () => {
    expect(calcInsuranceStatus({ startDate: '2026-01-01', expireDate: '2027-01-01' }, today)).toBe('uninsured');
  });

  test('起期缺失 → uninsured', () => {
    expect(calcInsuranceStatus({ isCurrent: true, expireDate: '2027-01-01' }, today)).toBe('uninsured');
  });

  test('止期缺失 → uninsured', () => {
    expect(calcInsuranceStatus({ isCurrent: true, startDate: '2026-01-01' }, today)).toBe('uninsured');
  });

  test('起期晚于止期 → uninsured', () => {
    expect(calcInsuranceStatus({ isCurrent: true, startDate: '2027-01-01', expireDate: '2026-01-01' }, today)).toBe('uninsured');
  });

  test('未来才生效（start_date > today）→ uninsured', () => {
    expect(calcInsuranceStatus({ isCurrent: true, startDate: '2026-09-01', expireDate: '2027-09-01' }, today)).toBe('uninsured');
  });

  test('刚好今天生效（start_date = today）→ insured', () => {
    expect(calcInsuranceStatus({ isCurrent: true, startDate: '2026-08-05', expireDate: '2027-08-05' }, today)).toBe('insured');
  });

  test('刚好今天到期（expire_date = today）→ expiring（边界含今天，0 天）', () => {
    expect(calcInsuranceStatus({ isCurrent: true, startDate: '2026-01-01', expireDate: '2026-08-05' }, today)).toBe('expiring');
  });

  test('刚好 30 天到期 → expiring；31 天 → insured（第30天只属 expiring）', () => {
    expect(calcInsuranceStatus({ isCurrent: true, startDate: '2026-01-01', expireDate: '2026-09-04' }, today)).toBe('expiring'); // 30 天
    expect(calcInsuranceStatus({ isCurrent: true, startDate: '2026-01-01', expireDate: '2026-09-05' }, today)).toBe('insured'); // 31 天
  });

  test('node-pg 反序列化：日期为 JS Date 对象时仍正确判定（修复 String(Date) 得 "Fri May 01" 损坏 → 误判 uninsured）', () => {
    // DB 模式下 PG date 列经 node-pg 返回本地午夜 Date 对象；旧实现 String(Date).slice(0,10) 得 "Fri May 01 2026..."
    // → 字符串比较失效 → 全部误判 uninsured（列表与 SQL 统计口径分裂的根因）
    const today = new Date(2026, 7, 6); // 2026-08-06 本地
    // 当前有效：start 2026-05-01 <= 今天 <= expire 2027-04-30，剩余 >30 天 → insured
    expect(calcInsuranceStatus({
      isCurrent: true,
      startDate: new Date(2026, 4, 1),
      expireDate: new Date(2027, 3, 30),
    }, today)).toBe('insured');
    // 字符串输入行为不变
    expect(calcInsuranceStatus({ isCurrent: true, startDate: '2026-05-01', expireDate: '2027-04-30' }, today)).toBe('insured');
    // Date 对象 + 已过期 → expired
    expect(calcInsuranceStatus({
      isCurrent: true,
      startDate: new Date(2025, 0, 1),
      expireDate: new Date(2025, 5, 30),
    }, today)).toBe('expired');
    // Date 对象 + 未来 → uninsured
    expect(calcInsuranceStatus({
      isCurrent: true,
      startDate: new Date(2026, 8, 1),
      expireDate: new Date(2027, 8, 1),
    }, today)).toBe('uninsured');
  });

  test('已过期 → expired', () => {
    expect(calcInsuranceStatus({ isCurrent: true, startDate: '2026-01-01', expireDate: '2026-08-04' }, today)).toBe('expired');
  });

  test('无任何事实 → uninsured', () => {
    expect(calcInsuranceStatus({}, today)).toBe('uninsured');
  });
});

// ============================================================================
// 任务1/3/8 追加：写入契约与 SQL 参数断言
// ============================================================================
describe('人员保险写入契约（任务1/3）', () => {
  beforeEach(() => {
    pool.query.mockReset();
  });

  const auth = { Authorization: `Bearer ${signToken({ id: 1, username: 'admin', role: 'admin' })}` };

  test('页面 camelCase payload POST /personnel：每个 DB 字段与值正确', async () => {
    mockAuth();
    pool.query.mockResolvedValueOnce({ rows: [{ employee_id: 5, name: '赵六', org_name: '安全部', position_name: '安全员' }] }); // resolveEmployee
    pool.query.mockResolvedValueOnce({ rows: [] }); // 冲突服务（无当前有效）
    pool.query.mockResolvedValueOnce({ rows: [{ id: 99, employee_id: 5, person_name: '赵六' }] }); // INSERT RETURNING
    const res = await request(app)
      .post('/api/insurance/personnel')
      .set(auth)
      .send({
        employeeId: 5,
        insuranceType: '雇主责任险',
        coverageAmount: 800000,
        premium: 1200,
        startDate: '2026-08-05',
        expireDate: '2027-08-04',
        isCurrent: true,
        policyNo: 'P-2026-001',
        remark: '测试',
      });
    expect(res.statusCode).toBe(200);
    const insertCall = pool.query.mock.calls[4];
    expect(insertCall[0]).toContain('employee_id');
    // 参数数组：[employeeId, employeeId, name, dept, pos, insuranceType, coverage, premium, start, expire, isCurrent, policyNo, remark]
    expect(insertCall[1]).toEqual([5, 5, '赵六', '安全部', '安全员', '雇主责任险', 800000, 1200, '2026-08-05', '2027-08-04', true, 'P-2026-001', '测试']);
  });

  test('旧 snake_case / 页面旧字段 payload 被明确拒绝（strict schema）', async () => {
    mockAuth();
    const res = await request(app)
      .post('/api/insurance/personnel')
      .set(auth)
      .send({ personnel_id: 5, person_name: '张三', insurance_type: '雇主责任险', policy_no: 'X', policyNumber: 'Y' });
    expect(res.statusCode).toBe(400); // Zod strict 拒绝未知字段
  });

  test('缺 employeeId 被拒绝（400，而非静默成功）', async () => {
    mockAuth();
    const res = await request(app)
      .post('/api/insurance/personnel')
      .set(auth)
      .send({ insuranceType: '雇主责任险' });
    expect(res.statusCode).toBe(400);
  });

  test('服务端忽略客户端伪造姓名，快照来自人员主数据', async () => {
    mockAuth();
    pool.query.mockResolvedValueOnce({ rows: [{ employee_id: 5, name: '赵六', org_name: '安全部', position_name: '安全员' }] });
    pool.query.mockResolvedValueOnce({ rows: [{ id: 99, employee_id: 5, person_name: '赵六' }] });
    // 客户端提交 person_name 进不了 strict schema（400）；快照必须来自服务端查询
    // （任务1/提示词10：无起止日期 → 非 active → 无冲突查询；INSERT 在 calls[3]）
    const res = await request(app)
      .post('/api/insurance/personnel')
      .set(auth)
      .send({ employeeId: 5, insuranceType: '雇主责任险' });
    expect(res.statusCode).toBe(200);
    const insertCall = pool.query.mock.calls[3];
    expect(insertCall[1][2]).toBe('赵六'); // person_name 来自 resolveEmployee 结果
  });

  test('更新不换人：关联键与快照不变，只更新保单字段', async () => {
    mockAuth();
    // 任务9：PUT 先读现有行（SELECT），合并"更新后完整事实"；更新后非当前有效（expire 已过）→ 无冲突查询
    pool.query.mockResolvedValueOnce({ rows: [{ id: 10, employee_id: 5, person_name: '赵六', insurance_type: '雇主责任险', start_date: '2020-01-01', expire_date: '2026-01-01', is_current: false, coverage_amount: 0, premium: 0, policy_no: '', remark: '', created_at: null, updated_at: null }] }); // SELECT 现有行
    pool.query.mockResolvedValueOnce({ rows: [{ id: 10, employee_id: 5, person_name: '赵六' }] }); // UPDATE RETURNING
    const res = await request(app)
      .put('/api/insurance/personnel/10')
      .set(auth)
      .send({ premium: 1500, expireDate: '2027-08-04' });
    expect(res.statusCode).toBe(200);
    const sql = String(pool.query.mock.calls[3][0]); // 黑名单、用户、SELECT、UPDATE
    // 不包含 employee_id 更新
    expect(sql).not.toContain('employee_id=$');
    expect(sql).toContain('premium=COALESCE($4,premium)');
  });

  test('显式换人：SQL 参数数组中 ID/姓名/部门/岗位准确（姓名不是员工数字 ID）', async () => {
    mockAuth();
    // 任务9：PUT 先 SELECT 现有行（合并"更新后完整事实"用于冲突检查）；换人时 resolveEmployee 调用两次
    // （一次校验合并事实、一次生成 setSql 快照）；更新后 expire 已过 → 不触发冲突查询。
    pool.query.mockResolvedValueOnce({ rows: [{ id: 10, employee_id: 5, person_name: '赵六', insurance_type: '雇主责任险', start_date: '2020-01-01', expire_date: '2026-01-01', is_current: false, coverage_amount: 0, premium: 0, policy_no: '', remark: '', created_at: null, updated_at: null }] }); // SELECT
    pool.query.mockResolvedValueOnce({ rows: [{ employee_id: 8, name: '钱八', org_name: '车队', position_name: '驾驶员' }] }); // resolveEmployee（合并校验）
    pool.query.mockResolvedValueOnce({ rows: [{ employee_id: 8, name: '钱八', org_name: '车队', position_name: '驾驶员' }] }); // resolveEmployee（setSql 快照）
    pool.query.mockResolvedValueOnce({ rows: [{ id: 10, employee_id: 8, person_name: '钱八' }] }); // UPDATE RETURNING
    const res = await request(app)
      .put('/api/insurance/personnel/10')
      .set(auth)
      .send({ employeeId: 8 });
    expect(res.statusCode).toBe(200);
    const sql = String(pool.query.mock.calls[5][0]);
    expect(sql).toContain('employee_id=$10');
    expect(sql).toContain('person_name=$11');
    const params = pool.query.mock.calls[5][1];
    // [id, undefined×8, employeeId, name, dept, pos]
    expect(params[9]).toBe(8);        // $10 employee_id
    expect(params[10]).toBe('钱八');  // $11 person_name（姓名，不是 8）
    expect(params[11]).toBe('车队');  // $12 department
    expect(params[12]).toBe('驾驶员'); // $13 position
  });
});

// ============================================================================
// 任务4.1/8：直接导入 personnel/import
// ============================================================================
describe('直接导入 /personnel/import（任务4.1）', () => {
  beforeEach(() => {
    pool.query.mockReset();
  });

  const auth = { Authorization: `Bearer ${signToken({ id: 1, username: 'admin', role: 'admin' })}` };

  test('工号唯一解析成功并写入 employee_id + 服务端快照', async () => {
    mockAuth();
    pool.query.mockResolvedValueOnce({ rows: [{ employee_id: 3, name: '钱七', org_name: 'A', position_name: 'P' }] }); // resolveEmployee by code
    pool.query.mockResolvedValueOnce({ rows: [] }); // INSERT
    const res = await request(app)
      .post('/api/insurance/personnel/import')
      .set(auth)
      .send({ records: [{ employeeCode: 'E003', insuranceType: '雇主责任险', policyNo: 'P1' }] });
    expect(res.statusCode).toBe(200);
    expect(res.body.data.success).toBe(1);
    // 任务1（提示词10）：无起止日期 → 最终事实非 active → 不查冲突；INSERT 在 calls[3]
    const insertCall = pool.query.mock.calls[3];
    expect(insertCall[0]).toContain('employee_id');
    expect(insertCall[1][0]).toBe(3); // employee_id
    expect(insertCall[1][2]).toBe('钱七'); // 快照姓名
  });

  test('工号无候选 → 该行失败 employee_not_found', async () => {
    mockAuth();
    pool.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .post('/api/insurance/personnel/import')
      .set(auth)
      .send({ records: [{ employeeCode: 'E999', insuranceType: '雇主责任险' }] });
    expect(res.body.data.success).toBe(0);
    expect(res.body.data.failed).toBe(1);
    expect(res.body.data.errors[0]).toContain('人员不存在');
  });

  test('缺少员工标识 → 该行失败 missing_employee_id（不按姓名猜测，不整批 400）', async () => {
    mockAuth();
    const res = await request(app)
      .post('/api/insurance/personnel/import')
      .set(auth)
      .send({ records: [{ personName: '无名', insuranceType: '雇主责任险' }] });
    expect(res.statusCode).toBe(200); // 任务8：逐行 safeParse，整批不 400
    expect(res.body.data.failed).toBe(1);
    expect(res.body.data.rowErrors[0].reason).toBe('missing_employee_id');
  });

  test('姓名与主数据不一致 → 该行失败（姓名仅附加校验）', async () => {
    mockAuth();
    pool.query.mockResolvedValueOnce({ rows: [{ employee_id: 3, name: '钱七', org_name: 'A', position_name: 'P' }] });
    const res = await request(app)
      .post('/api/insurance/personnel/import')
      .set(auth)
      .send({ records: [{ employeeCode: 'E003', personName: '李四', insuranceType: '雇主责任险' }] });
    expect(res.body.data.failed).toBe(1);
    expect(res.body.data.errors[0]).toContain('姓名与人员主数据不一致');
  });
});

// ============================================================================
// 任务5/8：未匹配 API
// ============================================================================
describe('未匹配 API /personnel/unmatched（任务5）', () => {
  beforeEach(() => {
    pool.query.mockReset();
  });

  const auth = { Authorization: `Bearer ${signToken({ id: 1, username: 'admin', role: 'admin' })}` };

  test('返回分页明细与按原因统计，不泄露敏感字段', async () => {
    mockAuth();
    pool.query.mockResolvedValueOnce({
      rows: [{ total: 2, missing_cnt: 1, not_found_cnt: 1 }],
    });
    pool.query.mockResolvedValueOnce({
      rows: [
        { id: 1, employee_id: null, person_name: '甲', insurance_type: '雇主责任险', policy_no: 'P1', reason: 'missing_employee_id' },
        { id: 2, employee_id: 999, person_name: '乙', insurance_type: '工伤保险', policy_no: 'P2', reason: 'employee_not_found' },
      ],
    });
    const res = await request(app).get('/api/insurance/personnel/unmatched').set(auth);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.total).toBe(2);
    expect(res.body.data.byReason).toEqual({ missing_employee_id: 1, employee_not_found: 1 });
    expect(res.body.data.list[0]).not.toHaveProperty('idCard');
    expect(res.body.data.list[0]).not.toHaveProperty('filePath');
    expect(res.body.data.list[1].employeeId).toBe(999);
    expect(res.body.data.list[1].reason).toBe('employee_not_found');
  });

  test('有效 employee_id 不进入未匹配列表（SQL 排除已关联）', async () => {
    mockAuth();
    pool.query.mockResolvedValueOnce({ rows: [{ total: 0, missing_cnt: 0, not_found_cnt: 0 }] });
    pool.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/api/insurance/personnel/unmatched').set(auth);
    expect(res.body.data.total).toBe(0);
    const countSql = String(pool.query.mock.calls[2][0]);
    expect(countSql).toContain('p.employee_id IS NULL OR ev.employee_id IS NULL');
  });
});

// ============================================================================
// 任务6/8：syncStatus 与当前有效选单（主列表格式化）
// ============================================================================
describe('syncStatus 与当前有效选单（任务6）', () => {
  beforeEach(() => {
    pool.query.mockReset();
  });

  const auth = { Authorization: `Bearer ${signToken({ id: 1, username: 'admin', role: 'admin' })}` };

  test('无任何保险 → syncStatus missing', async () => {
    mockAuth();
    mockList([rosterRow()]);
    const res = await request(app).get('/api/insurance/personnel').set(auth);
    expect(res.body.data.list[0].syncStatus).toBe('missing');
  });

  test('快照与花名册一致 → synced；改名 → unsynced', async () => {
    mockAuth();
    mockList([rosterRow({
      emp_id: 10, emp_policy_no: 'E1', emp_expire_date: '2027-12-31',
      emp_person_name: '张三', emp_department: '安全部', emp_position: '安全员',
      emp_is_current: true,
    })]);
    const a = await request(app).get('/api/insurance/personnel').set(auth);
    expect(a.body.data.list[0].syncStatus).toBe('synced');

    pool.query.mockReset();
    mockAuth();
    mockList([rosterRow({
      emp_id: 10, emp_expire_date: '2027-12-31',
      emp_person_name: '旧名', emp_department: '安全部', emp_position: '安全员', // 快照旧名
      emp_is_current: true,
    })]);
    const b = await request(app).get('/api/insurance/personnel').set(auth);
    expect(b.body.data.list[0].syncStatus).toBe('unsynced');
  });

  test('is_current=false 的雇主险 → 状态 uninsured（不视为当前参保）', async () => {
    mockAuth();
    mockList([rosterRow({
      emp_id: 10, emp_expire_date: '2027-12-31', emp_is_current: false,
    })]);
    const res = await request(app).get('/api/insurance/personnel').set(auth);
    expect(res.body.data.list[0].employer.status).toBe('uninsured');
  });
});

// ============================================================================
// 任务8/10：内存模式同名无稳定 ID 不合并
// ============================================================================
describe('内存模式稳定 ID 规则（任务8）', () => {
  beforeEach(() => {
    pool.query.mockReset();
    db.isConnected.mockReturnValue(false);
  });

  afterEach(() => {
    db.isConnected.mockReturnValue(true);
  });

  const auth = { Authorization: `Bearer ${signToken({ id: 1, username: 'admin', role: 'admin' })}` };

  test('两条同名但无稳定 ID 的旧记录不合并、进入未匹配结果', async () => {
    const { memoryStores } = require('../routes/insurance');
    memoryStores.personnel.length = 0;
    memoryStores.personnel.push(
      { id: 1, person_name: '张三', insurance_type: '雇主责任险', policy_no: 'A', is_deleted: false, employee_id: null },
      { id: 2, person_name: '张三', insurance_type: '工伤保险', policy_no: 'B', is_deleted: false, employee_id: null },
    );
    // authMiddleware 需要 mock（黑名单 + 用户）
    mockAuth();
    // 未匹配列表：两条都进 missing_employee_id（不按姓名合并）
    const res = await request(app).get('/api/insurance/personnel/unmatched').set(auth);
    expect(res.body.data.total).toBe(2);
    expect(res.body.data.list.every((r) => r.reason === 'missing_employee_id')).toBe(true);
    memoryStores.personnel.length = 0;
  });
});

// ============================================================================
// 任务4.2/8：通用导入 personnel 模块配置静态契约锁定
// ============================================================================
describe('通用导入 personnel 模块配置（任务4.2）', () => {
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'services', 'importShared.js'), 'utf-8');
  // 提取 personnel 配置段
  const m = src.match(/personnel: \{[\s\S]*?\n  \},/);
  const cfg = m ? m[0] : '';

  test('工号/员工编号映射为中间字段 employee_code，不直接映射 employee_id', () => {
    expect(cfg).toContain("'员工编号': 'employee_code'");
    expect(cfg).toContain("'工号': 'employee_code'");
    // 不再有直接把工号映射为 employee_id 的键
    expect(cfg).not.toMatch(/'员工编号': 'employee_id'/);
    expect(cfg).not.toMatch(/'工号': 'employee_id'/);
  });

  test('姓名映射为 person_name（实际列）；身份证映射为中间字段 id_card（经 id_card_hash 精确匹配，非按姓名关联，不落库）', () => {
    expect(cfg).toContain("'姓名': 'person_name'");
    expect(cfg).not.toMatch(/'姓名': 'name'/);
    // 雇主险清单无工号场景：证件号码 → 中间字段 id_card（confirm 阶段按 employee.id_card_hash 精确匹配员工；
    // id_card 不在 dbColumns 写库白名单，仅作解析中间字段）
    expect(cfg).toContain("'证件号码': 'id_card'");
    expect(cfg).toContain("'身份证号': 'id_card'");
    // 姓名不得直接作为关联键
    expect(cfg).not.toMatch(/'姓名': 'id_card'/);
    expect(cfg).not.toMatch(/'姓名': 'employee_code'/);
  });

  test('日期映射为 start_date/expire_date（实际列）', () => {
    expect(cfg).toContain("'保险起期': 'start_date'");
    expect(cfg).toContain("'保险到期': 'expire_date'");
    expect(cfg).toContain("dateFields: ['start_date', 'expire_date']");
  });

  test('冲突键为稳定员工 ID + 险种 + 保单号（不含 name/id_card）', () => {
    expect(cfg).toContain("conflictKey: ['employee_id', 'insurance_type', 'policy_no']");
    expect(cfg).not.toContain("'name', 'id_card'");
  });
  // 注：通用导入的"真实执行"行为（人员解析/姓名冲突/ID工号矛盾/错误行过滤/INSERT 参数）
  // 已由 import-personnel-behavior.unit.test.js 通过 mock XLSX + mock DB 走完整 confirm 流程覆盖；
  // 本块仅保留字段映射配置的契约锁定，不再以源码字符串断言代替行为测试。
});
// ============================================================================
// 任务7 追加：确定性选单行为测试（DB SQL 与内存比较器等价）
// ============================================================================
describe('确定性选单（任务7：当前有效优先 + 稳定排序）', () => {
  const { pickBestInsuranceRecord, compareInsuranceRecords, policyPivotSql } = require('../routes/insurance');
  const today = new Date('2026-08-05T00:00:00Z');

  test('同员工同险种：当前有效 > 未来 > 历史 > 停用（内存比较器）', () => {
    const records = [
      { id: 1, is_current: true, start_date: '2026-01-01', expire_date: '2026-12-31', policy_no: 'FUTURE-DISPLAY' }, // 未来（若被选仅展示）
      { id: 2, is_current: true, start_date: '2026-01-01', expire_date: '2026-06-30', policy_no: 'EXPIRED' },       // 历史
      { id: 3, is_current: false, start_date: '2026-01-01', expire_date: '2027-12-31', policy_no: 'STOPPED' },     // 停用
      { id: 4, is_current: true, start_date: '2026-02-01', expire_date: '2027-01-31', policy_no: 'ACTIVE' },       // 当前有效
    ];
    const best = pickBestInsuranceRecord(records, today);
    expect(best.id).toBe(4);
    // 字段整体来自同一条记录（禁止跨记录拼接）
    expect(best.policy_no).toBe('ACTIVE');
  });

  test('同 rank（当前有效）：止期晚者优先，止期相同起期晚者优先，再按 id', () => {
    const records = [
      { id: 10, is_current: true, start_date: '2026-01-01', expire_date: '2027-06-30', policy_no: 'A' },
      { id: 11, is_current: true, start_date: '2026-01-01', expire_date: '2027-12-31', policy_no: 'B' }, // 止期最晚
      { id: 12, is_current: true, start_date: '2026-02-01', expire_date: '2027-12-31', policy_no: 'C' }, // 同止期起期晚
    ];
    expect(pickBestInsuranceRecord(records, today).id).toBe(12);
  });

  test('内存比较器与 SQL ROW_NUMBER 排序条件一致（policyPivotSql 含当前有效 CASE；rank1/2 要求完整合法日期）', () => {
    const sql = policyPivotSql('雇主责任险');
    const BD = "(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date";
    // 任务9：rank0 active = is_current=true + 起止齐全 + start<=expire + 区间
    expect(sql).toContain(`WHEN p.is_current = true AND p.start_date IS NOT NULL AND p.expire_date IS NOT NULL AND p.start_date <= p.expire_date AND p.start_date <= ${BD} AND p.expire_date >= ${BD} THEN 0`);
    // rank1 future / rank2 expired 必须同时要求 is_current=true、起止齐全、start<=expire
    expect(sql).toContain(`WHEN p.is_current = true AND p.start_date IS NOT NULL AND p.expire_date IS NOT NULL AND p.start_date <= p.expire_date AND p.start_date > ${BD} THEN 1`);
    expect(sql).toContain(`WHEN p.is_current = true AND p.start_date IS NOT NULL AND p.expire_date IS NOT NULL AND p.start_date <= p.expire_date AND p.expire_date < ${BD} THEN 2`);
    expect(sql).toContain('ELSE 3');
    expect(sql).toContain('END ASC');
    // rank 0（当前有效）在前：CASE 置于 ORDER BY 第一列
    const rankPos = sql.indexOf('THEN 0');
    const orderByPos = sql.indexOf('ORDER BY');
    expect(rankPos).toBeGreaterThan(orderByPos);
  });

  test('is_current=false 的未来/过期记录 rank=3（内存比较器，与 SQL CASE 等价）', () => {
    const records = [
      { id: 1, is_current: false, start_date: '2027-01-01', expire_date: '2028-01-01', policy_no: 'INACTIVE-FUTURE' }, // 停用未来 → rank3
      { id: 2, is_current: false, start_date: '2025-01-01', expire_date: '2026-01-01', policy_no: 'INACTIVE-EXPIRED' }, // 停用过期 → rank3
      { id: 3, is_current: true, start_date: '2026-02-01', expire_date: '2027-01-31', policy_no: 'ACTIVE' },            // 当前有效 → rank0
    ];
    expect(pickBestInsuranceRecord(records, today).id).toBe(3);
    // 无当前有效时，停用未来/停用过期 rank 均为 3（都不能排到 rank1/rank2），
    // 同 rank 内按 is_current/止期/起期/id 稳定选择（止期晚者优先：INACTIVE-FUTURE 止期 2028 > 2026）
    const noActive = [
      { id: 1, is_current: false, start_date: '2027-01-01', expire_date: '2028-01-01', policy_no: 'INACTIVE-FUTURE' },
      { id: 2, is_current: false, start_date: '2025-01-01', expire_date: '2026-01-01', policy_no: 'INACTIVE-EXPIRED' },
    ];
    const best = pickBestInsuranceRecord(noActive, today);
    expect(best.id).toBe(1); // 同 rank3：止期晚者优先（2028-01-01 > 2026-01-01）
  });

  test('缺起期/止期/起期晚于止期的记录 rank=3（停用/不完整），排在当前有效之后', () => {
    const records = [
      { id: 1, is_current: true, start_date: null, expire_date: '2027-12-31', policy_no: 'NO-START' },   // 缺起期
      { id: 2, is_current: true, start_date: '2027-01-01', expire_date: '2026-01-01', policy_no: 'BAD' }, // 起期晚于止期
      { id: 3, is_current: true, start_date: '2026-02-01', expire_date: '2027-01-31', policy_no: 'ACTIVE' },
    ];
    expect(pickBestInsuranceRecord(records, today).id).toBe(3);
  });

  test('比较器严格全序（无环、自反）——随机记录排序稳定', () => {
    const records = [
      { id: 1, is_current: true, start_date: '2026-01-01', expire_date: '2027-12-31' },
      { id: 2, is_current: true, start_date: '2026-01-01', expire_date: '2027-12-31' },
      { id: 3, is_current: false, start_date: null, expire_date: null },
    ];
    const a = compareInsuranceRecords(records[0], records[1], today);
    const b = compareInsuranceRecords(records[1], records[0], today);
    expect(a === 0 || a > 0).toBe(true);
    expect(a).toBe(-b); // 反对称
  });
});

// ============================================================================
// 任务8 追加：主列表四态筛选 SQL 语义（人员级互斥四态 + Asia/Shanghai 业务日）
// ============================================================================
describe('主列表四态筛选 SQL（任务8）', () => {
  beforeEach(() => {
    pool.query.mockReset();
  });

  const auth = { Authorization: `Bearer ${signToken({ id: 1, username: 'admin', role: 'admin' })}` };
  const BD = "(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date";

  async function getSql(insuranceStatus) {
    mockAuth();
    mockList([]);
    await request(app).get('/api/insurance/personnel').query({ insuranceStatus }).set(auth);
    const sqlCalls = pool.query.mock.calls.map((c) => String(c[0]));
    return sqlCalls.find((s) => s.includes('FROM v_employee_current ev') && s.includes('LIMIT'));
  }

  test('insured：NOT expiring 且任一当前有效（人员级互斥；不再用险种 OR 直接判定）', async () => {
    const sql = await getSql('insured');
    expect(sql).toContain('NOT (');
    expect(sql).toContain(`expire_date <= ${BD} + INTERVAL '30 days'`);
    expect(sql).toContain('emp.is_current = true');
    expect(sql).toContain('emp.start_date <= ' + BD);
    expect(sql).not.toContain('emp.expire_date > ' + BD + " + INTERVAL '30 days'");
  });

  test('expiring：任一当前有效且止期 <= 第30天（含第30天，与 insured 无重叠）', async () => {
    const sql = await getSql('expiring');
    expect(sql).toContain(`expire_date <= ${BD} + INTERVAL '30 days'`);
    expect(sql).toContain('emp.is_current = true');
    expect(sql).not.toContain('emp.expire_date > ' + BD + " + INTERVAL '30 days'");
  });

  test('uninsured：NOT covered 且 NOT hasExpired（与 expired 互斥；不只查 id IS NULL）', async () => {
    const sql = await getSql('uninsured');
    // covered = ((emp 当前有效) OR (inj 当前有效))，外层 NOT
    expect(sql).toContain('NOT (((emp.is_current = true');
    expect(sql).toContain(') OR (inj.is_current = true');
    // 互斥：uninsured 必须排除历史过期（NOT hasExpired），否则与 expired 重叠。
    // 任务9：hasExpired 是"真正 expired"（is_current=true + 起止齐全 + start<=expire + expire<业务日）
    expect(sql).toContain('AND NOT (((emp.id IS NOT NULL AND emp.is_current = true AND emp.start_date IS NOT NULL');
    expect(sql).not.toContain('AND emp.id IS NULL AND inj.id IS NULL');
  });

  test('expired：NOT covered 且 hasExpired（与 uninsured 互斥）', async () => {
    const sql = await getSql('expired');
    expect(sql).toContain('NOT (((emp.is_current = true');
    expect(sql).toContain('emp.expire_date < ' + BD);
    // expired 必须要求真正 expired（is_current=true + 完整合法日期），不含停用/缺起期/非法记录
    expect(sql).toContain('emp.id IS NOT NULL AND emp.is_current = true AND emp.start_date IS NOT NULL');
    // 旧实现"NOT active AND expire_date < BD"会把停用/缺起期误判 expired——现在必须有 is_current=true
    expect(sql).not.toMatch(/NOT \(emp\.is_current = true AND[^)]*\) AND emp\.expire_date < /);
  });

  test('syncStatus 三态：missing 无关联记录 / synced 有记录且快照全一致 / unsynced 任一不一致（COUNT 与 list 同一 whereSql）', async () => {
    const missing = await getSqlBySync('missing');
    expect(missing).toContain('emp.id IS NULL AND inj.id IS NULL');

    const synced = await getSqlBySync('synced');
    expect(synced).toContain('(emp.id IS NOT NULL OR inj.id IS NOT NULL)');
    expect(synced).toContain('COALESCE(emp.person_name');
    expect(synced).toContain('NOT (');
    expect(synced).not.toContain("'synced' = $");

    const unsynced = await getSqlBySync('unsynced');
    expect(unsynced).toContain('COALESCE(emp.person_name');
    expect(unsynced).toContain('COALESCE(inj.person_name');
  });

  async function getSqlBySync(syncStatus) {
    pool.query.mockReset(); // 每次独立查询，避免 mock 累积污染
    mockAuth();
    mockList([]);
    await request(app).get('/api/insurance/personnel').query({ syncStatus }).set(auth);
    const sqlCalls = pool.query.mock.calls.map((c) => String(c[0]));
    return sqlCalls.find((s) => s.includes('FROM v_employee_current ev') && s.includes('LIMIT'));
  }

  test('合规筛选：雇主险按当前有效，工伤险按记录存在（inj.id IS NOT NULL，不要求日期）', async () => {
    mockAuth();
    mockList([]);
    await request(app).get('/api/insurance/personnel').query({ complianceStatus: 'compliant' }).set(auth);
    const sqlCalls = pool.query.mock.calls.map((c) => String(c[0]));
    const sql = sqlCalls.find((s) => s.includes('FROM v_employee_current ev') && s.includes('LIMIT'));
    expect(sql).toContain('emp.is_current = true'); // 雇主险仍要求当前有效
    expect(sql).toContain('COALESCE(emp.coverage_amount, 0) >= 800000');
    expect(sql).toContain('inj.id IS NOT NULL'); // 工伤险按月缴纳：有记录即合规
    expect(sql).not.toContain('inj.id IS NOT NULL OR'); // 旧"任一当前有效"结构已废弃
  });
});

// ============================================================================
// 任务7 追加：hasInsurance 与合规不被过期/未来/停用置 true（页面主列表）
// ============================================================================
describe('hasInsurance/合规只认当前有效（任务7）', () => {
  beforeEach(() => {
    pool.query.mockReset();
  });

  const auth = { Authorization: `Bearer ${signToken({ id: 1, username: 'admin', role: 'admin' })}` };

  test('is_current=false 的雇主险 → hasInsurance=false、status=uninsured', async () => {
    mockAuth();
    mockList([rosterRow({ emp_id: 10, emp_start_date: '2024-01-01', emp_expire_date: '2027-12-31', emp_is_current: false, emp_coverage: 800000 })]);
    const res = await request(app).get('/api/insurance/personnel').set(auth);
    const e = res.body.data.list[0].employer;
    expect(e.hasInsurance).toBe(false);
    expect(e.status).toBe('uninsured');
    expect(e.recordExists).toBe(true); // 停用记录仍有 ID 可编辑
  });

  test('未来才生效（start > today）→ hasInsurance=false、status=uninsured', async () => {
    mockAuth();
    const futureStart = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    mockList([rosterRow({ emp_id: 10, emp_start_date: futureStart, emp_expire_date: '2027-12-31', emp_is_current: true, emp_coverage: 800000 })]);
    const res = await request(app).get('/api/insurance/personnel').set(auth);
    const e = res.body.data.list[0].employer;
    expect(e.hasInsurance).toBe(false);
    expect(e.status).toBe('uninsured');
  });

  test('工伤险按月缴纳：有记录即合规（日期 NULL/过期/未来均不影响）', async () => {
    // 工伤险记录存在（身份证已匹配花名册）→ 视为已缴纳，不看日期
    mockAuth();
    mockList([rosterRow({ inj_id: 20, inj_start_date: '2024-01-01', inj_expire_date: '2025-12-31', inj_is_current: true, age: 35, gender: '男' })]);
    const res = await request(app).get('/api/insurance/personnel').set(auth);
    expect(res.body.data.list[0].injury.recordExists).toBe(true);
    expect(res.body.data.list[0].injury.hasInsurance).toBe(true); // 有记录即参保
    expect(res.body.data.list[0].complianceStatus).toBe('compliant');
    // 日期为 NULL 的工伤险记录同样合规（用户：工伤险不需要日期验证）
    pool.query.mockReset();
    mockAuth();
    mockList([rosterRow({ inj_id: 30, inj_start_date: null, inj_expire_date: null, inj_is_current: true })]);
    const b = await request(app).get('/api/insurance/personnel').set(auth);
    expect(b.body.data.list[0].injury.recordExists).toBe(true);
    expect(b.body.data.list[0].injury.hasInsurance).toBe(true);
    expect(b.body.data.list[0].complianceStatus).toBe('compliant');
  });

  test('有效雇主险80万 → 合规；有效工伤险 → 合规', async () => {
    mockAuth();
    mockList([rosterRow({ emp_id: 10, emp_start_date: '2024-01-01', emp_expire_date: '2027-12-31', emp_is_current: true, emp_coverage: 800000 })]);
    const a = await request(app).get('/api/insurance/personnel').set(auth);
    expect(a.body.data.list[0].complianceStatus).toBe('compliant');

    pool.query.mockReset();
    mockAuth();
    mockList([rosterRow({ inj_id: 20, inj_start_date: '2024-01-01', inj_expire_date: '2027-12-31', inj_is_current: true })]);
    const b = await request(app).get('/api/insurance/personnel').set(auth);
    expect(b.body.data.list[0].complianceStatus).toBe('compliant');
  });

  test('停用雇主险80万不因保额合规（必须当前有效）', async () => {
    mockAuth();
    mockList([rosterRow({ emp_id: 10, emp_start_date: '2024-01-01', emp_expire_date: '2027-12-31', emp_is_current: false, emp_coverage: 800000 })]);
    const res = await request(app).get('/api/insurance/personnel').set(auth);
    expect(res.body.data.list[0].complianceStatus).toBe('noncompliant');
  });

  test('合规口径（雇主险10万/80万档 + 工伤险组合）：10万+工伤险/80万单独/纯工伤险合规；10万无工伤险/无险不合规', async () => {
    const todayActive = { emp_start_date: '2024-01-01', emp_expire_date: '2027-12-31', emp_is_current: true, inj_start_date: '2024-01-01', inj_expire_date: '2027-12-31', inj_is_current: true };
    // 雇主险10万 + 工伤险 → 合规
    mockAuth();
    mockList([rosterRow({ emp_id: 1, emp_coverage: 100000, inj_id: 2, ...todayActive })]);
    const a = await request(app).get('/api/insurance/personnel').set(auth);
    expect(a.body.data.list[0].complianceStatus).toBe('compliant');
    // 雇主险10万 无工伤险 → 不合规
    pool.query.mockReset(); mockAuth();
    mockList([rosterRow({ emp_id: 1, emp_coverage: 100000, emp_start_date: '2024-01-01', emp_expire_date: '2027-12-31', emp_is_current: true })]);
    const b = await request(app).get('/api/insurance/personnel').set(auth);
    expect(b.body.data.list[0].complianceStatus).toBe('noncompliant');
    // 雇主险80万 单独 → 合规（不需要工伤险）
    pool.query.mockReset(); mockAuth();
    mockList([rosterRow({ emp_id: 1, emp_coverage: 800000, emp_start_date: '2024-01-01', emp_expire_date: '2027-12-31', emp_is_current: true })]);
    const c = await request(app).get('/api/insurance/personnel').set(auth);
    expect(c.body.data.list[0].complianceStatus).toBe('compliant');
    // 纯工伤险（无雇主险）→ 合规
    pool.query.mockReset(); mockAuth();
    mockList([rosterRow({ inj_id: 2, inj_start_date: '2024-01-01', inj_expire_date: '2027-12-31', inj_is_current: true })]);
    const d = await request(app).get('/api/insurance/personnel').set(auth);
    expect(d.body.data.list[0].complianceStatus).toBe('compliant');
    // 无任何当前有效险种 → 不合规
    pool.query.mockReset(); mockAuth();
    mockList([rosterRow({})]);
    const e = await request(app).get('/api/insurance/personnel').set(auth);
    expect(e.body.data.list[0].complianceStatus).toBe('noncompliant');
  });

  test('calcComplianceStatus 纯函数：雇主险当前有效 + 工伤险按记录存在（injuryExists，不看日期）', () => {
    const { calcComplianceStatus } = require('../routes/insurance');
    expect(calcComplianceStatus({ employerStatus: 'insured', injuryExists: false, empCoverage: 800000 })).toBe('compliant'); // 80万单独
    expect(calcComplianceStatus({ employerStatus: 'insured', injuryExists: false, empCoverage: 100000 })).toBe('noncompliant'); // 10万无工伤险
    expect(calcComplianceStatus({ employerStatus: 'insured', injuryExists: true, empCoverage: 100000 })).toBe('compliant'); // 10万+工伤险记录
    expect(calcComplianceStatus({ employerStatus: 'uninsured', injuryExists: true })).toBe('compliant'); // 纯工伤险（有记录，日期无关）
    expect(calcComplianceStatus({ employerStatus: 'uninsured', injuryExists: false, empCoverage: 800000 })).toBe('noncompliant'); // 无险
    expect(calcComplianceStatus({ employerStatus: 'expired', injuryExists: true, empCoverage: 800000 })).toBe('compliant'); // 雇主险过期但有工伤险记录 → 纯工伤险合规
    expect(calcComplianceStatus({ employerStatus: 'expired', injuryExists: false, empCoverage: 800000 })).toBe('noncompliant'); // 雇主险过期且无工伤险
  });
});

// ============================================================================
// 任务7 追加：stats 一人多保单只计一人（内存模式）+ DB 口径
// ============================================================================
describe('stats 人数口径（任务7）', () => {
  beforeEach(() => {
    pool.query.mockReset();
  });

  const auth = { Authorization: `Bearer ${signToken({ id: 1, username: 'admin', role: 'admin' })}` };

  test('内存模式：同一员工多张历史/当前保单只计一人；未匹配记录不污染', async () => {
    const { memoryStores } = require('../routes/insurance');
    memoryStores.personnel.length = 0;
    memoryStores.personnel.push(
      { id: 1, employee_id: 7, person_name: '张三', insurance_type: '雇主责任险', start_date: '2024-01-01', expire_date: '2027-12-31', is_current: true, coverage_amount: 800000, is_deleted: false },
      { id: 2, employee_id: 7, person_name: '张三', insurance_type: '雇主责任险', start_date: '2025-01-01', expire_date: '2026-06-30', is_current: false, coverage_amount: 800000, is_deleted: false }, // 同员工历史
      { id: 3, person_name: '李四', insurance_type: '雇主责任险', start_date: '2024-01-01', expire_date: '2027-12-31', is_current: true, coverage_amount: 800000, is_deleted: false, employee_id: null }, // 未匹配
    );
    db.isConnected.mockReturnValue(false);
    mockAuth();
    const res = await request(app).get('/api/insurance/personnel/stats').set(auth);
    expect(res.body.data.stats.total).toBe(1); // 只有稳定 ID 员工
    expect(res.body.data.stats.covered).toBe(1); // 一人参保
    expect(res.body.data.byType['雇主责任险']).toBe(1); // 一人，非 2 条记录
    db.isConnected.mockReturnValue(true);
    memoryStores.personnel.length = 0;
  });

  test('DB stats SQL 使用当前有效口径与人员级互斥四态（covered/expired/pending/expiring30d）', async () => {
    db.isConnected.mockReturnValue(true);
    mockAuth();
    pool.query.mockResolvedValueOnce({ rows: [{ total: 10, covered: 5, expired: 1, pending: 4, expiring30d: 2 }] }); // pivotStats
    pool.query.mockResolvedValueOnce({ rows: [{ v: 1 }] }); // highRisk
    pool.query.mockResolvedValueOnce({ rows: [{ emp_cnt: 3, inj_cnt: 4 }] }); // byType
    pool.query.mockResolvedValueOnce({ rows: [] }); // byDepartment
    const res = await request(app).get('/api/insurance/personnel/stats').set(auth);
    expect(res.body.data.stats.covered).toBe(5);
    const pivotSql = String(pool.query.mock.calls[2][0]);
    expect(pivotSql).toContain('emp_piv.is_current = true');
    expect(pivotSql).toContain("emp_piv.start_date <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date");
    // covered = 当前有效人数（personLevelSql.covered：(emp 当前有效) OR (inj 当前有效)）
    expect(pivotSql).toContain('COUNT(*) FILTER (WHERE ((emp_piv.is_current = true');
    expect(pivotSql).toContain(') OR (inj_piv.is_current = true');
    // expired 与 pending 互斥：expired = NOT covered AND hasExpired；pending = NOT covered AND NOT hasExpired。
    // 任务9：hasExpired 为"真正 expired"（is_current=true + 起止齐全 + start<=expire + expire<业务日）
    expect(pivotSql).toContain('COUNT(*) FILTER (WHERE NOT (((emp_piv.is_current = true');
    expect(pivotSql).toContain('AND NOT (((emp_piv.id IS NOT NULL AND emp_piv.is_current = true AND emp_piv.start_date IS NOT NULL');
    // 恒等式 total = covered + expired + pending：同一 pivot 内互斥计数
    expect(pivotSql).toContain('COUNT(*) FILTER (WHERE ((emp_piv.is_current = true');
    expect(pivotSql).toContain('COUNT(*)::int AS total');
    // expiring30d 仅当前有效且 <=30 天
    expect(pivotSql).toContain("emp_piv.expire_date <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date + INTERVAL '30 days'");
  });
});

// ============================================================================
// 任务7 追加：详情/新增/更新响应与 expiring-soon 统一状态 + 参数化 days
// ============================================================================
describe('旁路统一状态（任务7）', () => {
  beforeEach(() => {
    pool.query.mockReset();
  });

  const auth = { Authorization: `Bearer ${signToken({ id: 1, username: 'admin', role: 'admin' })}` };

  test('expiring-soon：仅当前有效保单，days 参数化（SQL 不插整数，Asia/Shanghai 业务日）', async () => {
    db.isConnected.mockReturnValue(true);
    mockAuth();
    pool.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/api/insurance/personnel/expiring-soon?days=45').set(auth);
    expect(res.statusCode).toBe(200);
    const sql = String(pool.query.mock.calls[2][0]);
    expect(sql).toContain('p.is_current = true');
    expect(sql).toContain("p.start_date <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date");
    expect(sql).toContain("p.expire_date <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date + ($1::int * INTERVAL '1 day')");
    expect(sql).not.toMatch(/INTERVAL '45 days'/); // 不直接拼接数字
    expect(pool.query.mock.calls[2][1]).toEqual([45]);
  });

  test('formatPersonnelIns（详情/创建/更新响应）使用统一状态：停用记录 status=uninsured', async () => {
    db.isConnected.mockReturnValue(true);
    mockAuth();
    // 新建响应：INSERT RETURNING 一条 is_current=false 记录
    pool.query.mockResolvedValueOnce({ rows: [{ employee_id: 5, name: '赵六', org_name: '安全部', position_name: '安全员' }] }); // resolveEmployee
    pool.query.mockResolvedValueOnce({ rows: [{ id: 99, employee_id: 5, person_name: '赵六', is_current: false, start_date: '2026-01-01', expire_date: '2027-12-31', premium: 100, coverage_amount: 0, policy_no: 'X', remark: '', created_at: null, updated_at: null }] });
    const res = await request(app)
      .post('/api/insurance/personnel')
      .set(auth)
      .send({ employeeId: 5, insuranceType: '雇主责任险', isCurrent: false });
    expect(res.body.data.insuranceStatus).toBe('uninsured');
  });
});

// ============================================================================
// 任务7 追加：直接导入严格 schema / ID工号矛盾 / 重复当前保单 / 日期顺序
// ============================================================================
describe('直接导入严格校验（任务7）', () => {
  beforeEach(() => {
    pool.query.mockReset();
    db.isConnected.mockReturnValue(true);
  });

  const auth = { Authorization: `Bearer ${signToken({ id: 1, username: 'admin', role: 'admin' })}` };

  test('未知字段（旧 snake_case）→ 该行失败 invalid_row_schema（不整批 400）', async () => {
    mockAuth();
    const res = await request(app)
      .post('/api/insurance/personnel/import')
      .set(auth)
      .send({ records: [{ employeeId: 1, insurance_type: '雇主责任险' }] });
    expect(res.statusCode).toBe(200); // 任务8：逐行 safeParse
    expect(res.body.data.failed).toBe(1);
    expect(res.body.data.rowErrors[0].reason).toBe('invalid_row_schema');
  });

  test('起期晚于止期 → 行失败 date_order_invalid，不写库', async () => {
    mockAuth();
    const res = await request(app)
      .post('/api/insurance/personnel/import')
      .set(auth)
      .send({ records: [{ employeeId: 1, insuranceType: '雇主责任险', startDate: '2027-01-01', expireDate: '2026-01-01' }] });
    expect(res.body.data.success).toBe(0);
    expect(res.body.data.failed).toBe(1);
    expect(res.body.data.rowErrors[0].reason).toBe('date_order_invalid');
    // 未执行任何 INSERT
    expect(pool.query.mock.calls.filter((c) => String(c[0]).includes('INSERT INTO personnel_insurance'))).toHaveLength(0);
  });

  test('employeeId 与 employeeCode 矛盾 → 行失败 id_code_conflict', async () => {
    mockAuth();
    pool.query.mockResolvedValueOnce({ rows: [{ employee_id: 1, employee_code: 'E001', name: '甲', org_name: 'A', position_name: 'P' }] }); // byCode
    pool.query.mockResolvedValueOnce({ rows: [{ employee_id: 2, employee_code: 'E002', name: '乙', org_name: 'B', position_name: 'Q' }] }); // byId
    const res = await request(app)
      .post('/api/insurance/personnel/import')
      .set(auth)
      .send({ records: [{ employeeId: 1, employeeCode: 'E002', insuranceType: '雇主责任险' }] });
    expect(res.body.data.failed).toBe(1);
    expect(res.body.data.rowErrors[0].reason).toBe('id_code_conflict');
  });

  test('重复当前保单（同员工同险种已有当前有效）→ 行失败 duplicate_active_policy', async () => {
    mockAuth();
    pool.query.mockResolvedValueOnce({ rows: [{ employee_id: 1, name: '甲', org_name: 'A', position_name: 'P' }] }); // resolveEmployee
    pool.query.mockResolvedValueOnce({ rows: [{ id: 55 }] }); // 重复查询命中
    const res = await request(app)
      .post('/api/insurance/personnel/import')
      .set(auth)
      // 任务1（提示词10）：仅最终事实在业务日 active 时查冲突——传 active 区间使冲突检查发生
      .send({ records: [{ employeeId: 1, insuranceType: '雇主责任险', startDate: '2026-01-01', expireDate: '2027-01-01' }] });
    expect(res.body.data.failed).toBe(1);
    expect(res.body.data.rowErrors[0].reason).toBe('duplicate_active_policy');
    // 未 INSERT
    expect(pool.query.mock.calls.filter((c) => String(c[0]).includes('INSERT INTO personnel_insurance'))).toHaveLength(0);
  });

  test('有效行 INSERT 参数由解析员工生成（快照姓名/部门/岗位，ID 与姓名不混）', async () => {
    mockAuth();
    pool.query.mockResolvedValueOnce({ rows: [{ employee_id: 3, name: '钱七', org_name: '车队', position_name: '驾驶员' }] }); // resolveEmployee
    pool.query.mockResolvedValueOnce({ rows: [] }); // 重复查询无命中
    pool.query.mockResolvedValueOnce({ rows: [] }); // INSERT
    const res = await request(app)
      .post('/api/insurance/personnel/import')
      .set(auth)
      .send({ records: [{ employeeId: 3, insuranceType: '雇主责任险', coverageAmount: 800000, premium: 1200, startDate: '2026-08-05', expireDate: '2027-08-04', isCurrent: true, policyNo: 'P-NEW' }] });
    expect(res.body.data.success).toBe(1);
    const insertCall = pool.query.mock.calls.find((c) => String(c[0]).includes('INSERT INTO personnel_insurance'));
    expect(insertCall[1][0]).toBe(3); // employee_id
    expect(insertCall[1][2]).toBe('钱七'); // person_name（不是 3）
    expect(insertCall[1][3]).toBe('车队');
    expect(insertCall[1][4]).toBe('驾驶员');
    expect(insertCall[1][8]).toBe('2026-08-05'); // start_date
    expect(insertCall[1][9]).toBe('2027-08-04'); // expire_date
    expect(insertCall[1][10]).toBe(true); // is_current
  });
});

// ============================================================================
// 任务7 追加：unified_schema 与迁移脚本结构化静态断言（禁止再断言该表不存在）
// ============================================================================
describe('unified_schema 与迁移 SQL 结构（任务7）', () => {
  const fs = require('fs');
  const path = require('path');

  test('unified_schema.sql 已定义 personnel_insurance 且含稳定 ID 与快照列', () => {
    const schema = fs.readFileSync(path.join(__dirname, '..', '..', 'sql', 'unified_schema.sql'), 'utf-8');
    // 承认事实：该文件包含 personnel_insurance 表定义（不再断言"不存在"）
    const tableMatch = schema.match(/CREATE TABLE IF NOT EXISTS personnel_insurance\s*\(([\s\S]*?)\);/);
    expect(tableMatch).not.toBeNull();
    const def = tableMatch[1];
    expect(def).toContain('employee_id');
    expect(def).toContain('department');
    expect(def).toContain('position');
    // personnel_id 不再 NOT NULL（兼容期保留旧列，但非唯一责任字段）
    expect(def).toMatch(/personnel_id\s+BIGINT(?!\s+NOT NULL)/);
    // person_name 保留为快照列（可空）
    expect(def).toMatch(/person_name\s+VARCHAR\(32\)(?!\s+NOT NULL)/);
    // 索引支撑员工-险种确定性选择
    expect(schema).toContain('idx_personnel_insurance_employee_id');
    expect(schema).toContain('idx_personnel_insurance_emp_type_current');
  });

  test('迁移 SQL 五阶段顺序（任务8）：列/索引 → 回填 → 核验 → 外键 → 收紧', () => {
    const mig = fs.readFileSync(path.join(__dirname, '..', 'sql', 'personnel_insurance_employee_id_migration.sql'), 'utf-8');
    // 用完整段落标题精确锚点（避免匹配文件头操作顺序注释里的同名文字）
    const s1 = mig.indexOf('阶段一：增加可空 employee_id 列与快照列（幂等；可重复执行）');
    const s2 = mig.indexOf('阶段二：确定性回填（仅人工确认候选后执行；不按姓名自动匹配）');
    const s3 = mig.indexOf('阶段三：只读核验 SQL（可重复执行；执行迁移前/后均建议运行）');
    // 阶段四标题含"事务外/人工分步"强调，与文件头操作顺序注释区分
    const s4 = mig.indexOf('阶段四：添加 NOT VALID 外键并 VALIDATE CONSTRAINT\n-- ⚠️ 事务外/人工分步执行');
    const s5 = mig.indexOf('阶段五：约束收紧（仅在前置核验通过后人工执行）');
    expect([s1, s2, s3, s4, s5].every((x) => x >= 0)).toBe(true);
    expect(s1).toBeLessThan(s2);
    expect(s2).toBeLessThan(s3);
    expect(s3).toBeLessThan(s4);
    expect(s4).toBeLessThan(s5);
    // 外键 DDL 必须在回填与核验之后（VALIDATE 前须无孤儿/无未关联在职/无重复当前保单）
    const fkPos = mig.indexOf('ADD CONSTRAINT fk_personnel_insurance_employee');
    const backfillPos = mig.indexOf('UPDATE personnel_insurance p');
    const verifyPos = mig.indexOf('SELECT\n  COUNT(*) AS total_records');
    expect(fkPos).toBeGreaterThan(backfillPos);
    expect(fkPos).toBeGreaterThan(verifyPos);
    // 禁止按姓名回填（只允许注释提及）
    expect(mig).not.toMatch(/UPDATE\s+personnel_insurance\s+SET\s+employee_id\s*=\s*e\.id\s+FROM\s+v_employee_current\s+e\s+WHERE\s+e\.name\s*=\s*person_name/i);
    // 外键非 CASCADE（不得级联删除保险历史）
    expect(mig).toContain('ON DELETE RESTRICT NOT VALID');
    // 外键需事务外/人工分步执行（不得伪装成自动连续迁移）
    expect(mig).toContain('事务外/人工分步执行');
  });
});
// ============================================================================
// 任务8 追加：共享人员解析器单测（services/employeeResolver）
// ============================================================================
describe('共享人员解析器 employeeResolver（任务8）', () => {
  const { resolveEmployee, isNameConsistent } = require('../services/employeeResolver');

  beforeEach(() => {
    pool.query.mockReset();
  });

  test('employeeId 解析成功', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ employee_id: 7, employee_code: 'E007', name: '甲', org_name: 'A', position_name: 'P' }] });
    const r = await resolveEmployee({ employeeId: 7 });
    expect(r.employee.employee_id).toBe(7);
    // 只发起一次查询（employeeId 路径）
    expect(pool.query.mock.calls).toHaveLength(1);
  });

  test('employeeCode 解析成功', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ employee_id: 8, employee_code: 'E008', name: '乙', org_name: 'B', position_name: 'Q' }] });
    const r = await resolveEmployee({ employeeCode: 'E008' });
    expect(r.employee.employee_id).toBe(8);
  });

  test('两者一致 → 成功（两次查询指向同一员工）', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ employee_id: 9, employee_code: 'E009', name: '丙', org_name: 'C', position_name: 'R' }] });
    pool.query.mockResolvedValueOnce({ rows: [{ employee_id: 9, employee_code: 'E009', name: '丙', org_name: 'C', position_name: 'R' }] });
    const r = await resolveEmployee({ employeeId: 9, employeeCode: 'E009' });
    expect(r.employee.employee_id).toBe(9);
  });

  test('两者冲突 → id_code_conflict（不静默优先其一）', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ employee_id: 1, employee_code: 'E001', name: '甲', org_name: 'A', position_name: 'P' }] });
    pool.query.mockResolvedValueOnce({ rows: [{ employee_id: 2, employee_code: 'E002', name: '乙', org_name: 'B', position_name: 'Q' }] });
    const r = await resolveEmployee({ employeeId: 1, employeeCode: 'E002' });
    expect(r.reason).toBe('id_code_conflict');
    expect(r.employee).toBeUndefined();
  });

  test('零候选 → employee_not_found；多候选 → employee_multiple_candidates', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const r1 = await resolveEmployee({ employeeCode: 'E999' });
    expect(r1.reason).toBe('employee_not_found');

    pool.query.mockResolvedValueOnce({ rows: [{ employee_id: 1 }, { employee_id: 2 }] });
    const r2 = await resolveEmployee({ employeeCode: 'E-DUP' });
    expect(r2.reason).toBe('employee_multiple_candidates');
  });

  test('已离职/删除 → employee_not_found（employee_deleted=false 过滤）', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] }); // 已离职员工不在 v_employee_current
    const r = await resolveEmployee({ employeeId: 5 });
    expect(r.reason).toBe('employee_not_found');
  });

  test('查询异常 → lookup_failed（fail-closed，不返回 employee）', async () => {
    pool.query.mockRejectedValueOnce(new Error('connection refused'));
    const r = await resolveEmployee({ employeeId: 5 });
    expect(r.reason).toBe('lookup_failed');
    expect(r.employee).toBeUndefined();
  });

  test('缺标识 → missing_employee_id', async () => {
    const r = await resolveEmployee({});
    expect(r.reason).toBe('missing_employee_id');
  });

  test('idCard（明文身份证）解析成功：按 id_card_hash 等值匹配', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ employee_id: 11, employee_code: 'E011', name: '甲', org_name: 'A', position_name: 'P' }] });
    const r = await resolveEmployee({ idCard: '372431197509217418' });
    expect(r.employee.employee_id).toBe(11);
    // 查询必须 JOIN employee.id_card_hash（密文不可等值匹配，走确定性哈希）
    const sql = String(pool.query.mock.calls[0][0]);
    expect(sql).toContain('id_card_hash');
    expect(sql).toContain('JOIN employee');
  });

  test('idCard 无匹配 → employee_not_found；与 employeeCode 矛盾 → id_code_conflict', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const r1 = await resolveEmployee({ idCard: '372431199999999999' });
    expect(r1.reason).toBe('employee_not_found');

    // code 指向员工1，身份证指向员工2 → 冲突
    pool.query.mockResolvedValueOnce({ rows: [{ employee_id: 1, employee_code: 'E001', name: '甲', org_name: 'A', position_name: 'P' }] });
    pool.query.mockResolvedValueOnce({ rows: [{ employee_id: 2, employee_code: 'E002', name: '乙', org_name: 'B', position_name: 'Q' }] });
    const r2 = await resolveEmployee({ employeeCode: 'E001', idCard: '372431197509217418' });
    expect(r2.reason).toBe('id_code_conflict');
  });

  test('isNameConsistent：未提供姓名不校验；不一致才拒绝', () => {
    expect(isNameConsistent(undefined, { name: '甲' })).toBe(true);
    expect(isNameConsistent('', { name: '甲' })).toBe(true);
    expect(isNameConsistent('甲', { name: '甲' })).toBe(true);
    expect(isNameConsistent('乙', { name: '甲' })).toBe(false);
  });
});

// ============================================================================
// 任务8 追加：Asia/Shanghai 业务日（零点边界）
// ============================================================================
describe('Asia/Shanghai 业务日（任务8）', () => {
  const { getBusinessDayStr } = require('../services/businessDay');

  test('UTC 08:00 → 北京 16:00 同日', () => {
    // 2026-08-05T08:00:00Z = 北京 2026-08-05 16:00
    expect(getBusinessDayStr(new Date('2026-08-05T08:00:00Z'))).toBe('2026-08-05');
  });

  test('UTC 2026-08-04T16:30:00Z → 北京 2026-08-05 00:30（跨日）', () => {
    // 北京 = UTC+8：2026-08-04 16:30 UTC = 2026-08-05 00:30 CST
    expect(getBusinessDayStr(new Date('2026-08-04T16:30:00Z'))).toBe('2026-08-05');
  });

  test('UTC 2026-08-05T15:59:00Z → 北京 2026-08-05 23:59（同日）', () => {
    expect(getBusinessDayStr(new Date('2026-08-05T15:59:00Z'))).toBe('2026-08-05');
  });

  test('UTC 2026-08-05T16:00:00Z → 北京 2026-08-06 00:00（跨日）', () => {
    expect(getBusinessDayStr(new Date('2026-08-05T16:00:00Z'))).toBe('2026-08-06');
  });

  test('字符串业务日原样返回', () => {
    expect(getBusinessDayStr('2026-08-05T00:00:00Z')).toBe('2026-08-05');
  });

  test('纯函数不依赖测试机器时区（固定 UTC 时刻 → 固定北京日期）', () => {
    // 与 calcInsuranceStatus 固定时间用例共用同一业务日语义
    const { calcInsuranceStatus } = require('../routes/insurance');
    // 北京 2026-08-05 当天生效、止期 2026-08-05（0 天）→ expiring
    const t = new Date('2026-08-04T16:30:00Z'); // = 北京 2026-08-05 00:30
    expect(calcInsuranceStatus({ isCurrent: true, startDate: '2026-08-05', expireDate: '2026-08-05' }, t)).toBe('expiring');
  });
});

// ============================================================================
// 任务8 追加：人员级四态互斥组合矩阵（calcPersonStatus）
// ============================================================================
describe('人员级四态组合矩阵（任务8）', () => {
  const { calcPersonStatus } = require('../routes/insurance');

  test('一个险种 insured、另一个 expiring → 人员级 expiring（优先级最高）', () => {
    expect(calcPersonStatus('insured', 'expiring')).toBe('expiring');
    expect(calcPersonStatus('expiring', 'insured')).toBe('expiring');
  });

  test('一个 expired、另一个 uninsured → 人员级 expired（第二优先）', () => {
    expect(calcPersonStatus('expired', 'uninsured')).toBe('expired');
    expect(calcPersonStatus('uninsured', 'expired')).toBe('expired');
  });

  test('任一当前有效（非 expiring）→ insured', () => {
    expect(calcPersonStatus('insured', 'uninsured')).toBe('insured');
    expect(calcPersonStatus('uninsured', 'insured')).toBe('insured');
    expect(calcPersonStatus('insured', 'expired')).toBe('insured');
  });

  test('无当前有效且无过期 → uninsured（未来/停用/无记录）', () => {
    expect(calcPersonStatus('uninsured', 'uninsured')).toBe('uninsured');
  });

  test('四态互斥：任意组合恰好一个结果，且与 DB personLevelSql 语义一致', () => {
    const { personLevelSql } = require('../routes/insurance');
    const ps = personLevelSql('emp', 'inj');
    // covered = 任一当前有效（active 含 is_current=true + 完整合法日期）
    expect(ps.covered).toContain('OR');
    // 任务9：hasExpired 必须是"真正 expired"（is_current=true + 起止齐全 + start<=expire + expire<业务日）
    expect(ps.hasExpired).toContain('emp.is_current = true AND emp.start_date IS NOT NULL AND emp.expire_date IS NOT NULL AND emp.start_date <= emp.expire_date');
    // 旧实现"NOT active AND expire_date < BD"会把停用/缺起期误判 expired——禁止该形态
    expect(ps.hasExpired).not.toMatch(/NOT \(emp\.is_current = true AND[^)]*\) AND emp\.expire_date < /);
    expect(ps.expiring).toContain("INTERVAL '30 days'");
  });
});
// ============================================================================
// 任务8 追加：直接导入混合批次（坏 schema 行不整批 400；内部错误不泄漏）
// ============================================================================
describe('直接导入混合批次与错误收敛（任务8）', () => {
  beforeEach(() => {
    pool.query.mockReset();
    db.isConnected.mockReturnValue(true);
  });

  const auth = { Authorization: `Bearer ${signToken({ id: 1, username: 'admin', role: 'admin' })}` };

  test('混合批次：schema 错误行 + 解析失败行 + 合法行 → 合法行成功，其余逐行失败', async () => {
    mockAuth();
    // 合法行（第3行）解析 + 查重
    pool.query.mockResolvedValueOnce({ rows: [{ employee_id: 3, name: '钱七', org_name: '车队', position_name: '驾驶员' }] }); // resolveEmployee
    pool.query.mockResolvedValueOnce({ rows: [] }); // 查重
    pool.query.mockResolvedValueOnce({ rows: [] }); // INSERT
    const res = await request(app)
      .post('/api/insurance/personnel/import')
      .set(auth)
      .send({
        records: [
          { employeeId: 1, insurance_type: '雇主责任险' },             // 行1：未知字段 invalid_row_schema
          { personName: '无名', insuranceType: '雇主责任险' },          // 行2：缺员工标识 missing_employee_id
          { employeeId: 3, insuranceType: '雇主责任险', policyNo: 'P-NEW' }, // 行3：合法
        ],
      });
    expect(res.statusCode).toBe(200); // 不整批 400
    expect(res.body.data.total).toBe(3);
    expect(res.body.data.success).toBe(1);
    expect(res.body.data.failed).toBe(2);
    const reasons = res.body.data.rowErrors.map((e) => e.reason);
    expect(reasons).toContain('invalid_row_schema');
    expect(reasons).toContain('missing_employee_id');
    // 合法行成功写入（INSERT 参数快照正确）
    const insertCall = pool.query.mock.calls.find((c) => String(c[0]).includes('INSERT INTO personnel_insurance'));
    expect(insertCall).toBeDefined();
    expect(insertCall[1][2]).toBe('钱七');
  });

  test('内部 DB 错误不向响应泄漏 SQL/连接敏感文本（返回稳定 reason 与安全提示）', async () => {
    mockAuth();
    // 解析成功，但 INSERT 抛数据库错误（含敏感 SQL 片段）
    // （任务1/提示词10：无起止日期 → 非 active → 无查重查询；INSERT 直接抛错）
    pool.query.mockResolvedValueOnce({ rows: [{ employee_id: 3, name: '钱七', org_name: '车队', position_name: '驾驶员' }] });
    pool.query.mockRejectedValueOnce(new Error('column "secret_col" does not exist at connection 127.0.0.1:5432'));
    const res = await request(app)
      .post('/api/insurance/personnel/import')
      .set(auth)
      .send({ records: [{ employeeId: 3, insuranceType: '雇主责任险' }] });
    expect(res.body.data.failed).toBe(1);
    const rowErr = res.body.data.rowErrors[0];
    // 稳定 reason（internal_error 收敛，不再把 e.message 原文返回）
    expect(rowErr.reason).toBe('internal_error');
    const text = JSON.stringify(res.body);
    expect(text).not.toContain('secret_col');
    expect(text).not.toContain('127.0.0.1:5432');
    expect(text).not.toContain('does not exist at connection');
  });
});
// ============================================================================
// 任务9 追加：业务日 SQL 安全契约（带括号表达式 + 全入口 guard）
// ============================================================================
describe('业务日 SQL 安全契约（任务9）', () => {
  const { BUSINESS_DAY_SQL } = require('../services/businessDay');
  const { policyPivotSql, activePolicySql, personLevelSql, policyStateSql, BUSINESS_DAY_SQL: ROUTE_BD } = require('../routes/insurance');
  const fs = require('fs');
  const path = require('path');

  test('常量精确等于带括号表达式（不允许无括号错误形态）', () => {
    expect(BUSINESS_DAY_SQL).toBe("(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date");
    expect(BUSINESS_DAY_SQL).not.toMatch(/AT TIME ZONE\s+'Asia\/Shanghai'::date/);
  });

  test('routes 与 services 使用同一常量（不各自复制文字）', () => {
    expect(ROUTE_BD).toBe(BUSINESS_DAY_SQL);
  });

  test('所有 personnel 相关 SQL 构造不含裸 CURRENT_DATE 与错误无括号表达式', () => {
    const constructs = [
      policyPivotSql('雇主责任险'),
      policyPivotSql('工伤保险'),
      activePolicySql('emp'),
      personLevelSql('emp', 'inj').covered,
      personLevelSql('emp', 'inj').hasExpired,
      personLevelSql('emp', 'inj').expiring,
      policyStateSql('p').active,
      policyStateSql('p').future,
      policyStateSql('p').expired,
    ];
    constructs.forEach((sql) => {
      expect(sql).not.toMatch(/(?<![(\s])CURRENT_DATE/);
      expect(sql).not.toMatch(/AT TIME ZONE\s+'Asia\/Shanghai'::date/);
      expect(sql).toContain("(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date");
    });
  });

  test('import.js 人员保险查重/冲突 SQL 无裸 CURRENT_DATE（服务端常量导入）', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'services', 'personnelInsurancePolicyService.js'), 'utf-8');
    // 提取 personnel 相关 SQL 段落：不得出现裸 CURRENT_DATE（应为 ${BUSINESS_DAY_SQL}）
    // 冲突 SQL 已随三层化收敛至 services/personnelInsurancePolicyService.js（路径改为 ./businessDay）
    expect(src).toMatch(/require\(['"]\.\/?businessDay['"]\)/);
    expect(src).toContain('BUSINESS_DAY_SQL');
    // 通过共享冲突服务（personnelInsurancePolicyService）检查——该服务内部必须用带括号常量
    const svc = fs.readFileSync(path.join(__dirname, '..', 'services', 'personnelInsurancePolicyService.js'), 'utf-8');
    expect(svc).toContain("(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date");
    expect(svc).not.toMatch(/AT TIME ZONE\s+'Asia\/Shanghai'::date/);
  });

  test('overview 人员统计复用共享 pivot（buildPersonnelStatsPivotSql）且无旧记录数 SQL', () => {
    // 重构后该逻辑收敛于 services/insuranceStatsService.js（路由层纯聚合）
    const src = fs.readFileSync(path.join(__dirname, '..', 'services', 'insuranceStatsService.js'), 'utf-8');
    expect(src).toContain('buildPersonnelStatsPivotSql()');
    // 旧 overview 记录数统计（COUNT(*) FROM personnel_insurance WHERE is_deleted=false）已移除
    expect(src).not.toMatch(/result\.personnel\.total = r1\.rows\[0\]\.v/);
  });
});

// ============================================================================
// 任务9 追加：单险种真值表表驱动矩阵（JS calcInsuranceStatus 与 SQL policyStateSql 等价）
// ============================================================================
describe('单险种真值表矩阵（任务9）', () => {
  const { calcInsuranceStatus, policyStateSql, insuranceRecordRank, pickBestInsuranceRecord } = require('../routes/insurance');
  const today = new Date('2026-08-05T00:00:00Z'); // 北京 2026-08-05

  // [name, isCurrent, start, expire, expectedChildStatus, expectedRank]
  const cases = [
    ['当前有效', true, '2026-01-01', '2027-12-31', 'insured', 0],
    ['未来', true, '2027-01-01', '2027-12-31', 'uninsured', 1],
    ['历史', true, '2025-01-01', '2026-01-01', 'expired', 2],
    ['停用-有效区间', false, '2026-01-01', '2027-12-31', 'uninsured', 3],
    ['停用-未来', false, '2027-01-01', '2027-12-31', 'uninsured', 3],
    ['停用-历史', false, '2025-01-01', '2026-01-01', 'uninsured', 3],
    ['缺起期', true, null, '2027-12-31', 'uninsured', 3],
    ['缺止期', true, '2026-01-01', null, 'uninsured', 3],
    ['两者都缺', true, null, null, 'uninsured', 3],
    ['起期晚于止期-止期已过', true, '2026-06-01', '2026-01-01', 'uninsured', 3],
    ['起期晚于止期-起期在未来', true, '2027-06-01', '2027-01-01', 'uninsured', 3],
    ['当天生效', true, '2026-08-05', '2027-08-05', 'insured', 0],
    ['当天到期', true, '2026-01-01', '2026-08-05', 'expiring', 0],
    ['第30天', true, '2026-01-01', '2026-09-04', 'expiring', 0],
    ['第31天', true, '2026-01-01', '2026-09-05', 'insured', 0],
  ];

  cases.forEach(([name, isCurrent, start, exp, expectedStatus, expectedRank]) => {
    test(`${name}：child=${expectedStatus} rank=${expectedRank}`, () => {
      const rec = { id: 1, is_current: isCurrent, start_date: start, expire_date: exp };
      const status = calcInsuranceStatus({ isCurrent, startDate: start, expireDate: exp }, today);
      expect(status).toBe(expectedStatus);
      expect(insuranceRecordRank(rec, today)).toBe(expectedRank);
    });
  });

  test('SQL policyStateSql 各分支含完整有效日期条件（is_current=true + 起止齐全 + start<=expire）', () => {
    const BD = "(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date";
    const st = policyStateSql('p');
    expect(st.active).toContain('p.is_current = true AND p.start_date IS NOT NULL AND p.expire_date IS NOT NULL AND p.start_date <= p.expire_date');
    expect(st.future).toContain('p.is_current = true AND p.start_date IS NOT NULL AND p.expire_date IS NOT NULL AND p.start_date <= p.expire_date');
    expect(st.expired).toContain('p.is_current = true AND p.start_date IS NOT NULL AND p.expire_date IS NOT NULL AND p.start_date <= p.expire_date');
    expect(st.future).toContain(`p.start_date > ${BD}`);
    expect(st.expired).toContain(`p.expire_date < ${BD}`);
  });

  test('缺止期未来/缺起期历史/起期晚于止期在内存选单中 rank=3（不被排为未来/历史）', () => {
    const today = '2026-08-05';
    const noExpireFuture = { id: 1, is_current: true, start_date: '2027-01-01', expire_date: null };       // 缺止期未来 → rank3
    const noStartExpired = { id: 2, is_current: true, start_date: null, expire_date: '2026-01-01' };      // 缺起期历史 → rank3
    const badOrder = { id: 3, is_current: true, start_date: '2026-06-01', expire_date: '2026-01-01' };    // 起期晚于止期 → rank3
    expect(insuranceRecordRank(noExpireFuture, today)).toBe(3);
    expect(insuranceRecordRank(noStartExpired, today)).toBe(3);
    expect(insuranceRecordRank(badOrder, today)).toBe(3);
  });

  test('hasExpired 用真正 expired 条件：inactive expired 人员 DB 与 JS 都判 uninsured（不判 expired）', () => {
    const { personLevelSql, calcPersonStatus } = require('../routes/insurance');
    const ps = personLevelSql('emp', 'inj');
    // hasExpired 必须含 is_current=true + 起止齐全 + start<=expire（旧实现 NOT active AND expire<BD 会把停用/缺起期误判）
    expect(ps.hasExpired).toContain('emp.is_current = true AND emp.start_date IS NOT NULL AND emp.expire_date IS NOT NULL AND emp.start_date <= emp.expire_date');
    expect(ps.hasExpired).not.toMatch(/NOT \(emp\.is_current = true AND[^)]*\) AND emp\.expire_date < /);
    // JS 侧：停用过期（is_current=false + 过期区间）→ child uninsured → 人员级 uninsured
    const child = calcInsuranceStatus({ isCurrent: false, startDate: '2025-01-01', expireDate: '2026-01-01' }, new Date('2026-08-05T00:00:00Z'));
    expect(child).toBe('uninsured');
    expect(calcPersonStatus(child, 'uninsured')).toBe('uninsured');
  });
});

// ============================================================================
// 任务9 追加：共享当前有效冲突服务（六写入口统一）
// ============================================================================
describe('共享当前有效冲突服务（任务9）', () => {
  const { findActivePolicyConflict, findActivePolicyConflictInMemory } = require('../services/personnelInsurancePolicyService');

  beforeEach(() => {
    pool.query.mockReset();
  });

  test('无冲突 → { conflict: null }', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const r = await findActivePolicyConflict({ employeeId: 5, insuranceType: '雇主责任险' });
    expect(r).toEqual({ conflict: null });
  });

  test('存在冲突 → 返回冲突记录 ID', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: 88 }] });
    const r = await findActivePolicyConflict({ employeeId: 5, insuranceType: '工伤保险' });
    expect(r.conflict.id).toBe(88);
  });

  test('excludeId 排除自身 → 查询参数包含 excludeId', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    await findActivePolicyConflict({ employeeId: 5, insuranceType: '雇主责任险', excludeId: 99 });
    const sql = String(pool.query.mock.calls[0][0]);
    const params = pool.query.mock.calls[0][1];
    expect(sql).toContain('AND p.id <> $3');
    expect(params[2]).toBe(99);
  });

  test('查询异常 → fail-closed（duplicate_check_failed，不返回 employee/conflict）', async () => {
    pool.query.mockRejectedValueOnce(new Error('connection reset'));
    const r = await findActivePolicyConflict({ employeeId: 5, insuranceType: '雇主责任险' });
    expect(r.error).toBe('duplicate_check_failed');
    expect(r.conflict).toBeUndefined();
  });

  test('内存等价检查：同员工同险种当前有效命中；excludeId 排除自身', () => {
    const records = [
      { id: 1, employee_id: 5, insurance_type: '雇主责任险', is_current: true, start_date: '2026-01-01', expire_date: '2027-12-31', is_deleted: false },
      { id: 2, employee_id: 5, insurance_type: '工伤保险', is_current: true, start_date: '2026-01-01', expire_date: '2027-12-31', is_deleted: false },
    ];
    const hit = findActivePolicyConflictInMemory({ employeeId: 5, insuranceType: '雇主责任险' }, { records, businessDay: '2026-08-05' });
    expect(hit.conflict.id).toBe(1);
    const excluded = findActivePolicyConflictInMemory({ employeeId: 5, insuranceType: '雇主责任险', excludeId: 1 }, { records, businessDay: '2026-08-05' });
    expect(excluded).toEqual({ conflict: null });
  });
});
// ============================================================================
// 任务9 追加：generate-from-pending 权限/计数/错误收敛 + 内存规范化 + overview 同口径
// ============================================================================
describe('generate-from-pending 权限与计数（任务9）', () => {
  beforeEach(() => {
    pool.query.mockReset();
    db.isConnected.mockReturnValue(true);
  });

  const auth = { Authorization: `Bearer ${signToken({ id: 1, username: 'admin', role: 'admin' })}` };

  test('未认证访问 → 401（与其他人员保险写接口一致的角色门槛）', async () => {
    const res = await request(app)
      .post('/api/insurance/personnel/generate-from-pending')
      .send({ ids: [3] });
    expect(res.statusCode).toBe(401);
  });

  test('viewer 访问 → 403', async () => {
    pool.query.mockReset();
    pool.query.mockResolvedValueOnce({ rows: [] }); // 黑名单
    pool.query.mockResolvedValueOnce({ rows: [{ id: 2, username: 'viewer1', role: 'viewer', real_name: '查看者', is_active: true }] }); // 用户
    const token = signToken({ id: 2, username: 'viewer1', role: 'viewer' });
    const res = await request(app)
      .post('/api/insurance/personnel/generate-from-pending')
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: [3] });
    expect(res.statusCode).toBe(403);
  });

  test('内部错误不泄漏 e.message（返回稳定 reason）', async () => {
    mockAuth();
    pool.query.mockResolvedValueOnce({ rows: [{ employee_id: 3, name: '钱七', gender: '男', birth_date: '1990-01-01', org_name: 'A', position_name: 'P', has_five_ins: false }] });
    pool.query.mockRejectedValueOnce(new Error('column "secret_col" does not exist at 127.0.0.1:5432')); // 冲突服务抛错
    const res = await request(app)
      .post('/api/insurance/personnel/generate-from-pending')
      .set(auth)
      .send({ ids: [3] });
    expect(res.statusCode).toBe(200);
    expect(res.body.data.generated).toBe(0);
    expect(res.body.data.failed.some((e) => e.reason === 'duplicate_check_failed' || e.reason === 'internal_error')).toBe(true);
    const text = JSON.stringify(res.body);
    expect(text).not.toContain('secret_col');
    expect(text).not.toContain('127.0.0.1:5432');
  });
});

// ============================================================================
// 任务9 追加：单条创建内存分支险种规范化（工伤险 → 工伤保险）
// ============================================================================
describe('内存模式险种规范化（任务9）', () => {
  beforeEach(() => {
    pool.query.mockReset();
    db.isConnected.mockReturnValue(false);
  });

  afterEach(() => {
    db.isConnected.mockReturnValue(true);
  });

  const auth = { Authorization: `Bearer ${signToken({ id: 1, username: 'admin', role: 'admin' })}` };

  test('内存创建提交 工伤险 → 实际保存为 工伤保险（主透视可见）', async () => {
    const { memoryStores } = require('../routes/insurance');
    memoryStores.personnel.length = 0;
    mockAuth();
    const res = await request(app)
      .post('/api/insurance/personnel')
      .set(auth)
      .send({ employeeId: 5, insuranceType: '工伤险', startDate: '2026-01-01', expireDate: '2027-12-31' });
    expect(res.statusCode).toBe(200);
    expect(res.body.data.insurance_type).toBe('工伤保险'); // 规范化，不再保存"工伤险"
    // 主透视可见（内存主列表按 工伤保险 识别）——GET 前重新注入认证 mock
    pool.query.mockReset();
    mockAuth();
    const listRes = await request(app).get('/api/insurance/personnel').set(auth);
    expect(listRes.body.data.list.some((r) => r.employeeId === 5)).toBe(true);
    memoryStores.personnel.length = 0;
  });

  test('内存创建提交 意外伤害险 → 拒绝（unsupported，不写库）', async () => {
    const { memoryStores } = require('../routes/insurance');
    memoryStores.personnel.length = 0;
    mockAuth();
    const res = await request(app)
      .post('/api/insurance/personnel')
      .set(auth)
      .send({ employeeId: 5, insuranceType: '意外伤害险' });
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('不支持的险种');
    expect(memoryStores.personnel.length).toBe(0); // 未写库
  });
});

// ============================================================================
// 任务9 追加：/stats/overview.personnel 与 /personnel/stats 同口径 + 恒等式
// ============================================================================
describe('overview 与 stats 同口径（任务9）', () => {
  beforeEach(() => {
    pool.query.mockReset();
    db.isConnected.mockReturnValue(true);
  });

  const auth = { Authorization: `Bearer ${signToken({ id: 1, username: 'admin', role: 'admin' })}` };

  test('overview 使用共享 pivot（总人数口径），不再按保险记录数', async () => {
    mockAuth();
    // overview: personnel pivot(1) + vehicles(5) + ensureOtherInsuranceTable(CREATE TABLE)(1) + other(5) = 12 次查询
    const pivotRow = { total: 10, covered: 5, expired: 1, pending: 4, expiring: 2 };
    pool.query.mockResolvedValueOnce({ rows: [pivotRow] }); // personnel pivot
    pool.query.mockResolvedValueOnce({ rows: [{ v: 10 }] }); // vehicles total
    pool.query.mockResolvedValueOnce({ rows: [{ v: 8 }] }); // vehicles active
    pool.query.mockResolvedValueOnce({ rows: [{ v: 1 }] }); // vehicles expired
    pool.query.mockResolvedValueOnce({ rows: [{ v: 1 }] }); // vehicles expiring
    pool.query.mockResolvedValueOnce({ rows: [{ v: 5000 }] }); // vehicles premium
    // ensureOtherInsuranceTable（4 条：CREATE TABLE + 2×CREATE INDEX + ALTER ADD COLUMN）
    pool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    pool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    pool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    pool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    pool.query.mockResolvedValueOnce({ rows: [{ v: 3 }] }); // other total
    pool.query.mockResolvedValueOnce({ rows: [{ v: 2 }] }); // other normal
    pool.query.mockResolvedValueOnce({ rows: [{ v: 0 }] }); // other expiring
    pool.query.mockResolvedValueOnce({ rows: [{ v: 1 }] }); // other expired
    pool.query.mockResolvedValueOnce({ rows: [{ p: 100, c: 200 }] }); // other premium/coverage
    const res = await request(app).get('/api/insurance/stats/overview').set(auth);
    expect(res.statusCode).toBe(200);
    const p = res.body.data.personnel;
    // 与 /personnel/stats 同口径：covered=insured+expiring；恒等式 total = covered + expired + pending
    expect(p.total).toBe(10);
    expect(p.covered).toBe(5);
    expect(p.expired).toBe(1);
    expect(p.pending).toBe(4);
    expect(p.expiring).toBe(2);
    expect(p.covered + p.expired + p.pending).toBe(p.total);
    // 使用共享 pivot 构造（含 policyPivotSql 确定性选单 + 业务日常量）
    const pivotSql = String(pool.query.mock.calls[2][0]);
    expect(pivotSql).toContain('policyPivotSql'.replace('policyPivotSql', 'ROW_NUMBER() OVER'));
    expect(pivotSql).toContain("(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date");
    expect(pivotSql).not.toMatch(/result\.personnel\.total = r1/);
  });

  test('overview 内存模式 personnel 复用人数口径（恒等式成立）', async () => {
    const { memoryStores } = require('../routes/insurance');
    memoryStores.personnel.length = 0;
    memoryStores.personnel.push(
      { id: 1, employee_id: 7, person_name: '张三', insurance_type: '雇主责任险', start_date: '2024-01-01', expire_date: '2027-12-31', is_current: true, coverage_amount: 800000, is_deleted: false },
      { id: 2, employee_id: 7, person_name: '张三', insurance_type: '工伤保险', start_date: '2025-01-01', expire_date: '2026-06-30', is_current: true, is_deleted: false },
      { id: 3, employee_id: 8, person_name: '李四', insurance_type: '雇主责任险', start_date: '2024-01-01', expire_date: '2025-12-31', is_current: true, is_deleted: false },
    );
    db.isConnected.mockReturnValue(false);
    mockAuth();
    const res = await request(app).get('/api/insurance/stats/overview').set(auth);
    const p = res.body.data.personnel;
    expect(p.total).toBe(2); // 稳定 ID 员工数
    expect(p.covered).toBe(1); // 张三（雇主险当前有效）
    expect(p.expired).toBe(1); // 李四（过期）
    expect(p.pending).toBe(0);
    expect(p.covered + p.expired + p.pending).toBe(p.total);
    db.isConnected.mockReturnValue(true);
    memoryStores.personnel.length = 0;
  });
});


// ============================================================================
// 任务10（提示词10）追加：全写路径统一 active 语义 + 直接导入内存 + 批量续保 + 写入口 guard
// ============================================================================
describe('任务10：统一 active 判定与全写路径语义（提示词10）', () => {
  const auth = { Authorization: `Bearer ${signToken({ id: 1, username: 'admin', role: 'admin' })}` };
  const { memoryStores } = require('../routes/insurance');

  beforeEach(() => {
    pool.query.mockReset();
    pool.connect = jest.fn();
  });

  // ---------- 2/3：创建 DB/内存 未来保单不被已有 active 误拦 ----------
  test('创建 DB：未来保单在已有 active 时不查冲突、成功写入（不误拦）', async () => {
    db.isConnected.mockReturnValue(true);
    mockAuth();
    pool.query.mockResolvedValueOnce({ rows: [{ employee_id: 5, name: '赵六', org_name: '安全部', position_name: '安全员' }] }); // resolveEmployee
    pool.query.mockResolvedValueOnce({ rows: [{ id: 99, employee_id: 5, person_name: '赵六' }] }); // INSERT RETURNING
    const res = await request(app)
      .post('/api/insurance/personnel')
      .set(auth)
      .send({ employeeId: 5, insuranceType: '雇主责任险', startDate: '2027-01-01', expireDate: '2028-01-01' }); // 未来（业务日 2026-08-05）
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    // 未来事实 → 不查冲突 → 无 SELECT p.id FROM personnel_insurance 查询
    const conflictCalls = pool.query.mock.calls.filter((c) => String(c[0]).includes('SELECT p.id FROM personnel_insurance p'));
    expect(conflictCalls).toHaveLength(0);
  });

  test('创建内存：未来保单在已有 active 时不误拦、成功写入', async () => {
    db.isConnected.mockReturnValue(false);
    mockAuth();
    memoryStores.personnel.length = 0;
    memoryStores.personnel.push({ id: 1, 
      employee_id: 5, personnel_id: 5, person_name: '赵六', insurance_type: '雇主责任险',
      coverage_amount: 0, premium: 0, start_date: '2026-01-01', expire_date: '2027-01-01',
      is_current: true, policy_no: 'A1', remark: '', is_deleted: false,
    });
    const res = await request(app)
      .post('/api/insurance/personnel')
      .set(auth)
      .send({ employeeId: 5, insuranceType: '雇主责任险', startDate: '2027-01-01', expireDate: '2028-01-01' }); // 未来
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(memoryStores.personnel.length).toBe(2); // 未来保单写入
    memoryStores.personnel.length = 0;
  });

  // ---------- 2/3：更新 DB/内存 未来保单与 DB/内存一致 ----------
  test('更新 DB：续保/改期为未来区间时不被另一张 active 误拦（excludeId 仅对 active 生效）', async () => {
    db.isConnected.mockReturnValue(true);
    mockAuth();
    // 现有目标 B（过期），另有 active A（不查：B 合并后是未来 → 不查冲突）
    pool.query.mockResolvedValueOnce({
      rows: [{ id: 10, employee_id: 5, person_name: '赵六', insurance_type: '雇主责任险', start_date: '2025-01-01', expire_date: '2026-06-01', is_current: false, coverage_amount: 0, premium: 0, policy_no: 'B1', remark: '', created_at: null, updated_at: null }],
    }); // SELECT 现有行
    pool.query.mockResolvedValueOnce({ rows: [{ id: 10, employee_id: 5, person_name: '赵六', insurance_type: '雇主责任险', start_date: '2027-01-01', expire_date: '2028-01-01', is_current: true, coverage_amount: 0, premium: 0, policy_no: 'B1', remark: '', created_at: null, updated_at: null }] }); // UPDATE RETURNING
    const res = await request(app)
      .put('/api/insurance/personnel/10')
      .set(auth)
      .send({ startDate: '2027-01-01', expireDate: '2028-01-01', isCurrent: true }); // 未来
    expect(res.statusCode).toBe(200);
    const conflictCalls = pool.query.mock.calls.filter((c) => String(c[0]).includes('SELECT p.id FROM personnel_insurance p'));
    expect(conflictCalls).toHaveLength(0); // 未来 → 不查冲突
  });

  test('更新内存：改期为未来区间时不撞已有 active（与 DB 一致）', async () => {
    db.isConnected.mockReturnValue(false);
    mockAuth();
    memoryStores.personnel.length = 0;
    memoryStores.personnel.push({ id: 1, 
      employee_id: 5, personnel_id: 5, person_name: '赵六', insurance_type: '雇主责任险',
      coverage_amount: 0, premium: 0, start_date: '2026-01-01', expire_date: '2027-01-01',
      is_current: true, policy_no: 'A1', remark: '', is_deleted: false,
    }); // active A
    memoryStores.personnel.push({ id: 2, 
      employee_id: 5, personnel_id: 5, person_name: '赵六', insurance_type: '雇主责任险',
      coverage_amount: 0, premium: 0, start_date: '2025-01-01', expire_date: '2026-06-01',
      is_current: false, policy_no: 'B1', remark: '', is_deleted: false,
    }); // 过期 B
    const res = await request(app)
      .put('/api/insurance/personnel/2')
      .set(auth)
      .send({ startDate: '2027-01-01', expireDate: '2028-01-01', isCurrent: true }); // 未来
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    memoryStores.personnel.length = 0;
  });

  // ---------- 1：直接导入内存模式 ----------
  test('直接导入内存：同批第二张同 employee/type active 被拒（duplicate_active_policy），未来保单不被误拦', async () => {
    db.isConnected.mockReturnValue(false);
    mockAuth();
    memoryStores.personnel.length = 0;
    const res = await request(app)
      .post('/api/insurance/personnel/import')
      .set(auth)
      .send({
        records: [
          { employeeId: 5, insuranceType: '雇主责任险', startDate: '2026-01-01', expireDate: '2027-01-01', policyNo: 'P1' }, // active 写入
          { employeeId: 5, insuranceType: '雇主责任险', startDate: '2026-06-01', expireDate: '2027-06-01', policyNo: 'P2' }, // 同批 active → 拒
          { employeeId: 5, insuranceType: '雇主责任险', startDate: '2027-01-01', expireDate: '2028-01-01', policyNo: 'P3' }, // 未来 → 放行
        ],
      });
    expect(res.body.data.success).toBe(2); // 行1 + 行3
    expect(res.body.data.failed).toBe(1);
    const row2 = res.body.data.rowErrors.find((e) => e.row === 2);
    expect(row2.reason).toBe('duplicate_active_policy');
    // 内存仅 2 条（行2 未 push）
    expect(memoryStores.personnel.filter((r) => !r.is_deleted)).toHaveLength(2);
    memoryStores.personnel.length = 0;
  });

  // ---------- 4：findActivePolicyConflictInMemory 默认业务日 ----------
  test('findActivePolicyConflictInMemory 默认业务日禁止 UTC 截断（源码 guard + 行为）', () => {
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'services', 'personnelInsurancePolicyService.js'), 'utf-8',
    );
    // 源码不得出现 UTC toISOString().slice(0,10) 默认业务日
    expect(src).not.toContain('toISOString().slice(0, 10)');
    expect(src).toContain('getBusinessDayStr()');
    // 行为：UTC 2026-08-05T16:30Z = 北京 2026-08-06 00:30 → 显式注入的上海业务日为 2026-08-06
    const { findActivePolicyConflictInMemory } = require('../services/personnelInsurancePolicyService');
    const { getBusinessDayStr } = require('../services/businessDay');
    const shDay = getBusinessDayStr(new Date('2026-08-05T16:30:00Z'));
    expect(shDay).toBe('2026-08-06'); // 上海跨日：UTC 16:30 → 次日
    const records = [
      { id: 1, employee_id: 5, insurance_type: '雇主责任险', is_current: true, start_date: '2026-08-06', expire_date: '2026-08-07' },
    ];
    // UTC 截断（08-05）会漏掉 08-06 生效的保单；上海业务日（08-06）应命中
    const viaSh = findActivePolicyConflictInMemory({ employeeId: 5, insuranceType: '雇主责任险' }, { records, businessDay: shDay });
    expect(viaSh.conflict).toBeTruthy();
  });

  // ---------- 7：批量续保 ----------
  test('批量续保：严格 schema（缺止期/未知字段/重复 ID → 400）', async () => {
    db.isConnected.mockReturnValue(true);
    const authedPut = (body) => { mockAuth(); return request(app).put('/api/insurance/personnel/batch-renewal').set(auth).send(body); };
    const r1 = await authedPut({ ids: [1] });
    expect(r1.statusCode).toBe(400); // 缺 policyEndDate
    const r2 = await authedPut({ ids: [1], policyEndDate: '2027-01-01', unknownField: 1 });
    expect(r2.statusCode).toBe(400); // 未知字段
    const r3 = await authedPut({ ids: [1, 1], policyEndDate: '2027-01-01' });
    expect(r3.statusCode).toBe(400); // 重复 ID
  });

  test('批量续保 DB：合法单条续保走事务（BEGIN→SELECT→冲突→UPDATE→COMMIT）', async () => {
    db.isConnected.mockReturnValue(true);
    mockAuth();
    const client = { query: jest.fn(), release: jest.fn() };
    pool.connect.mockResolvedValueOnce(client);
    client.query.mockResolvedValueOnce({ rows: [] }); // BEGIN
    client.query.mockResolvedValueOnce({
      rows: [{ id: 10, employee_id: 5, person_name: '赵六', insurance_type: '雇主责任险', start_date: '2025-01-01', expire_date: '2026-08-01', is_current: true, premium: 100, remark: '旧' }],
    }); // SELECT 目标
    client.query.mockResolvedValueOnce({ rows: [] }); // 冲突（无）
    client.query.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // UPDATE
    client.query.mockResolvedValueOnce({ rows: [] }); // COMMIT
    const res = await request(app)
      .put('/api/insurance/personnel/batch-renewal')
      .set(auth)
      .send({ ids: [10], policyEndDate: '2027-08-01' });
    expect(res.statusCode).toBe(200);
    expect(res.body.data.renewed).toBe(1);
    expect(res.body.data.failed).toBe(0);
    // 事务完整：BEGIN 与 COMMIT 均执行
    const beginCall = client.query.mock.calls.find((c) => String(c[0]) === 'BEGIN');
    const commitCall = client.query.mock.calls.find((c) => String(c[0]) === 'COMMIT');
    expect(beginCall).toBeDefined();
    expect(commitCall).toBeDefined();
    // UPDATE 用合并后的最终事实（expire_date=2027-08-01）
    const upd = client.query.mock.calls.find((c) => String(c[0]).includes('UPDATE personnel_insurance SET'));
    expect(upd[1][1]).toBe('2025-01-01'); // start 保持
    expect(upd[1][2]).toBe('2027-08-01'); // expire 更新
    expect(client.release).toHaveBeenCalled();
  });

  test('批量续保 DB：目标不存在 → 校验失败无写入（ROLLBACK）', async () => {
    db.isConnected.mockReturnValue(true);
    mockAuth();
    const client = { query: jest.fn(), release: jest.fn() };
    pool.connect.mockResolvedValueOnce(client);
    client.query.mockResolvedValueOnce({ rows: [] }); // BEGIN
    client.query.mockResolvedValueOnce({ rows: [] }); // SELECT 无目标
    client.query.mockResolvedValueOnce({ rows: [] }); // ROLLBACK
    const res = await request(app)
      .put('/api/insurance/personnel/batch-renewal')
      .set(auth)
      .send({ ids: [99], policyEndDate: '2027-01-01' });
    expect(res.body.data.renewed).toBe(0);
    expect(res.body.data.rowErrors[0].reason).toBe('target_not_found');
    const rollbackCall = client.query.mock.calls.find((c) => String(c[0]) === 'ROLLBACK');
    expect(rollbackCall).toBeDefined();
    // 无 UPDATE
    expect(client.query.mock.calls.filter((c) => String(c[0]).includes('UPDATE personnel_insurance'))).toHaveLength(0);
  });

  test('批量续保 DB：续保后撞上另一张 active（外部冲突 excludeId 生效）→ 拒绝', async () => {
    db.isConnected.mockReturnValue(true);
    mockAuth();
    const client = { query: jest.fn(), release: jest.fn() };
    pool.connect.mockResolvedValueOnce(client);
    client.query.mockResolvedValueOnce({ rows: [] }); // BEGIN
    client.query.mockResolvedValueOnce({
      rows: [{ id: 10, employee_id: 5, person_name: '赵六', insurance_type: '雇主责任险', start_date: '2025-01-01', expire_date: '2026-06-01', is_current: true, premium: 0, remark: '' }],
    }); // SELECT 目标（is_current=true 已过期；续保回 active 区间 → 触发冲突检查）
    client.query.mockResolvedValueOnce({ rows: [{ id: 55 }] }); // 冲突查询命中（active A，excludeId=10 排除自身）
    client.query.mockResolvedValueOnce({ rows: [] }); // ROLLBACK
    const res = await request(app)
      .put('/api/insurance/personnel/batch-renewal')
      .set(auth)
      .send({ ids: [10], policyEndDate: '2027-01-01' }); // 续保到 active
    expect(res.body.data.renewed).toBe(0);
    expect(res.body.data.rowErrors[0].reason).toBe('duplicate_active_policy');
    expect(client.query.mock.calls.filter((c) => String(c[0]).includes('UPDATE personnel_insurance'))).toHaveLength(0);
  });

  test('批量续保 DB：两个目标续保后形成同 key active → 批内拒绝第二个（原子语义）', async () => {
    db.isConnected.mockReturnValue(true);
    mockAuth();
    const client = { query: jest.fn(), release: jest.fn() };
    pool.connect.mockResolvedValueOnce(client);
    client.query.mockResolvedValueOnce({ rows: [] }); // BEGIN
    client.query.mockResolvedValueOnce({
      rows: [
        { id: 10, employee_id: 5, person_name: '赵六', insurance_type: '雇主责任险', start_date: '2025-01-01', expire_date: '2026-06-01', is_current: true, premium: 0, remark: '' },
        { id: 11, employee_id: 5, person_name: '赵六', insurance_type: '雇主责任险', start_date: '2025-02-01', expire_date: '2026-07-01', is_current: true, premium: 0, remark: '' },
      ],
    }); // SELECT 两目标（同 employee+type，is_current=true 已过期；续保回 active 同 key）
    client.query.mockResolvedValueOnce({ rows: [] }); // 冲突（目标10，excludeId=10）无
    client.query.mockResolvedValueOnce({ rows: [] }); // ROLLBACK（目标11 批内冲突）
    const res = await request(app)
      .put('/api/insurance/personnel/batch-renewal')
      .set(auth)
      .send({ ids: [10, 11], policyEndDate: '2027-01-01' }); // 两目标都续保到 active 同 key
    expect(res.body.data.renewed).toBe(0);
    const reasons = res.body.data.rowErrors.map((e) => e.reason);
    expect(reasons).toContain('duplicate_active_policy_in_batch');
    // 原子：无一 UPDATE
    expect(client.query.mock.calls.filter((c) => String(c[0]).includes('UPDATE personnel_insurance'))).toHaveLength(0);
  });

  test('批量续保 DB：写入异常回滚且响应不含 e.message', async () => {
    db.isConnected.mockReturnValue(true);
    mockAuth();
    const client = { query: jest.fn(), release: jest.fn() };
    pool.connect.mockResolvedValueOnce(client);
    client.query.mockResolvedValueOnce({ rows: [] }); // BEGIN
    client.query.mockResolvedValueOnce({
      rows: [{ id: 10, employee_id: 5, person_name: '赵六', insurance_type: '雇主责任险', start_date: '2025-01-01', expire_date: '2026-06-01', is_current: true, premium: 0, remark: '' }],
    }); // SELECT（is_current=true 已过期；续保回 active → 触发冲突检查）
    client.query.mockResolvedValueOnce({ rows: [] }); // 冲突无
    client.query.mockRejectedValueOnce(new Error('connection lost at 127.0.0.1:5432 secret_db')); // UPDATE 抛错
    client.query.mockResolvedValueOnce({ rows: [] }); // ROLLBACK
    const res = await request(app)
      .put('/api/insurance/personnel/batch-renewal')
      .set(auth)
      .send({ ids: [10], policyEndDate: '2027-01-01' });
    expect(res.body.code).toBe(-1);
    const text = JSON.stringify(res.body);
    expect(text).not.toContain('secret_db');
    expect(text).not.toContain('127.0.0.1');
    expect(text).not.toContain('connection lost');
    const rollbackCall = client.query.mock.calls.find((c) => String(c[0]) === 'ROLLBACK');
    expect(rollbackCall).toBeDefined();
  });

  test('批量续保内存：原子语义——任一目标校验失败则全部不改动', async () => {
    db.isConnected.mockReturnValue(false);
    mockAuth();
    memoryStores.personnel.length = 0;
    memoryStores.personnel.push({ id: 1, 
      employee_id: 5, personnel_id: 5, person_name: '赵六', insurance_type: '雇主责任险',
      coverage_amount: 0, premium: 0, start_date: '2025-01-01', expire_date: '2026-06-01',
      is_current: true, policy_no: 'B1', remark: '', is_deleted: false,
    }); // 目标1（is_current=true 已过期；续保回 active → 撞 active A）
    memoryStores.personnel.push({ id: 2, 
      employee_id: 6, personnel_id: 6, person_name: '钱七', insurance_type: '工伤保险',
      coverage_amount: 0, premium: 0, start_date: '2025-01-01', expire_date: '2026-06-01',
      is_current: false, policy_no: 'C1', remark: '', is_deleted: false,
    });
    // 目标2 续保到 active 后撞上……不，让目标1 撞上 active A（外部），目标2 合法 → 校验失败 → 全部不改动
    memoryStores.personnel.push({ id: 3, 
      employee_id: 5, personnel_id: 5, person_name: '赵六', insurance_type: '雇主责任险',
      coverage_amount: 0, premium: 0, start_date: '2026-01-01', expire_date: '2027-01-01',
      is_current: true, policy_no: 'A1', remark: '', is_deleted: false,
    }); // active A（同 employee 5 + 雇主责任险）
    const before = JSON.stringify(memoryStores.personnel);
    const res = await request(app)
      .put('/api/insurance/personnel/batch-renewal')
      .set(auth)
      .send({ ids: [1, 2], policyEndDate: '2027-01-01' }); // 目标1 续保后撞 active A
    expect(res.body.data.renewed).toBe(0);
    const reasons = res.body.data.rowErrors.map((e) => e.reason);
    expect(reasons).toContain('duplicate_active_policy');
    // 原子：全部未改动（目标2 虽合法也未应用）
    expect(JSON.stringify(memoryStores.personnel)).toBe(before);
    memoryStores.personnel.length = 0;
  });

  test('批量续保：viewer 无权限（403）', async () => {
    db.isConnected.mockReturnValue(true);
    pool.query.mockResolvedValueOnce({ rows: [] }); // 黑名单
    pool.query.mockResolvedValueOnce({ rows: [{ id: 2, username: 'viewer1', role: 'viewer', real_name: '观察员', is_active: true }] });
    const token = signToken({ id: 2, username: 'viewer1', role: 'viewer' });
    const res = await request(app)
      .put('/api/insurance/personnel/batch-renewal')
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: [1], policyEndDate: '2027-01-01' });
    expect(res.statusCode).toBe(403);
  });

  // ---------- 2/8：源码 guard（六入口统一 + 写入口矩阵） ----------
  test('源码 guard：写入口统一 isPolicyActiveOnBusinessDay，不再手写 wouldBeActive / isCurrent!==false 查冲突', () => {
    const fs = require('fs');
    const ins = fs.readFileSync(require('path').join(__dirname, '..', 'services', 'insurancePersonnelService.js'), 'utf-8');
    const imp = fs.readFileSync(require('path').join(__dirname, '..', 'services', 'importExcelService.js'), 'utf-8');
    // （src guard 二）写入口统一 active 判定来自 services/insurancePersonnelService.js
    const psvc = fs.readFileSync(require('path').join(__dirname, '..', 'services', 'insurancePersonnelService.js'), 'utf-8');
    // 不得再出现 wouldBeActive 变量（注释提及可接受，但代码不得使用）
    expect(psvc).not.toMatch(/wouldBeActive\s*=/);
    expect(ins).not.toMatch(/if \(b\.isCurrent !== false\)\s*\{[\s\S]*?findActivePolicyConflict/);
    expect(ins).not.toMatch(/if \(merged\.is_current !== false\)\s*\{/);
    expect(imp).not.toMatch(/if \(r\.is_current !== false && r\.employee_id != null\)\s*\{/);
    // 唯一 active 判定在保险与导入路由中都使用（重构后收敛到 personnel 服务）
    expect(psvc).toContain('isPolicyActiveOnBusinessDay');
    expect(imp).toContain('isPolicyActiveOnBusinessDay');
  });

  test('运行时写入口 guard：demo-data 已挂载且 personnel_insurance 演示已禁用；旧 src 未挂载', () => {
    const fs = require('fs');
    const appSrc = fs.readFileSync(require('path').join(__dirname, '..', 'app.js'), 'utf-8');
    const demo = fs.readFileSync(require('path').join(__dirname, '..', 'routes', 'demo-data.js'), 'utf-8');
    const ins = fs.readFileSync(require('path').join(__dirname, '..', 'services', 'insurancePersonnelService.js'), 'utf-8');
    // 挂载关系：routes/insurance（纯聚合）与 demo-data.js 都是运行时路由
    expect(appSrc).toMatch(/require\('\.\/routes\/insurance'\)/);
    expect(appSrc).toMatch(/require\('\.\/routes\/demo-data'\)/);
    expect(appSrc).toMatch(/app\.use\('\/api\/demo-data'/);
    // 旧 src/routes/insurance.ts 未被 app.js 挂载（非当前运行入口）
    expect(appSrc).not.toMatch(/src\/routes\/insurance/);
    // demo 人员保险分支明确禁用（不再旧列 INSERT 静默失败）
    expect(demo).toContain("key: 'personnel_insurance'");
    expect(demo).toContain('disabled: true');
    expect(demo).not.toMatch(/INSERT INTO personnel_insurance \(\s*name, id_card/);
    // 写路径统一 active 判定来自 services/insurancePersonnelService.js
    expect(ins).toContain('isPolicyActiveOnBusinessDay');
  });

  test('demo-data 显式请求 personnel_insurance → 明确"不支持"结果（不谎报生成成功）', async () => {
    db.isConnected.mockReturnValue(true);
    mockAuth();
    // demo-data generate：BEGIN → ensureTables 一堆查询（catch 吞）→ SELECT system_settings → ROLLBACK
    const client = { query: jest.fn().mockResolvedValue({ rows: [] }), release: jest.fn() };
    pool.connect.mockResolvedValueOnce(client);
    const res = await request(app)
      .post('/api/demo-data/generate')
      .set(auth)
      .send({ modules: ['personnel_insurance'] });
    expect(res.body.code).toBe(-3); // 可识别的不支持结果
    const text = JSON.stringify(res.body);
    expect(text).toContain('不支持');
    expect(text).toContain('人员保险');
    expect(text).not.toContain('生成成功');
    // 未执行旧列 personnel_insurance INSERT
    const insCalls = client.query.mock.calls.filter((c) => String(c[0]).includes('INSERT INTO personnel_insurance'));
    expect(insCalls).toHaveLength(0);
  });
});
// ============================================================================
// 任务11（提示词11）追加：严格布尔事实、空 employee 隔离、默认业务日 fake timer、批量续保事务补强
// ============================================================================
describe('任务11：严格布尔事实与空 employee 隔离 + 事务补强（提示词11）', () => {
  const { isPolicyActiveOnBusinessDay, findActivePolicyConflictInMemory } = require('../services/personnelInsurancePolicyService');
  const auth = { Authorization: `Bearer ${signToken({ id: 1, username: 'admin', role: 'admin' })}` };

  beforeEach(() => {
    pool.query.mockReset();
    pool.connect = jest.fn();
  });

  // ---------- 2：严格布尔表驱动（直接调用生产纯函数，不复制逻辑） ----------
  test('严格布尔：只有 isCurrent/is_current===true 才 active；false/null/undefined 均 inactive', () => {
    const day = '2026-08-05';
    const dates = { startDate: '2026-01-01', expireDate: '2027-01-01' };
    expect(isPolicyActiveOnBusinessDay({ isCurrent: true, ...dates }, day)).toBe(true);
    expect(isPolicyActiveOnBusinessDay({ isCurrent: false, ...dates }, day)).toBe(false);
    expect(isPolicyActiveOnBusinessDay({ isCurrent: null, ...dates }, day)).toBe(false);
    expect(isPolicyActiveOnBusinessDay({ isCurrent: undefined, ...dates }, day)).toBe(false);
    expect(isPolicyActiveOnBusinessDay({ is_current: true, ...dates }, day)).toBe(true);
    expect(isPolicyActiveOnBusinessDay({ is_current: false, ...dates }, day)).toBe(false);
    expect(isPolicyActiveOnBusinessDay({ is_current: null, ...dates }, day)).toBe(false);
    // 显式 camelCase false 不得被同对象旧 is_current=true 覆盖（任务2：字段优先级）
    expect(isPolicyActiveOnBusinessDay({ isCurrent: false, is_current: true, ...dates }, day)).toBe(false);
    // 仅 snake_case true 判 true
    expect(isPolicyActiveOnBusinessDay({ is_current: true, ...dates }, day)).toBe(true);
  });

  test('严格布尔：起止日期完整/不完整组合', () => {
    const day = '2026-08-05';
    expect(isPolicyActiveOnBusinessDay({ isCurrent: true, startDate: '2026-01-01', expireDate: '2027-01-01' }, day)).toBe(true);
    expect(isPolicyActiveOnBusinessDay({ isCurrent: true, startDate: null, expireDate: '2027-01-01' }, day)).toBe(false); // 缺起期
    expect(isPolicyActiveOnBusinessDay({ isCurrent: true, startDate: '2026-01-01', expireDate: null }, day)).toBe(false); // 缺止期
    expect(isPolicyActiveOnBusinessDay({ isCurrent: true, startDate: '2027-01-01', expireDate: '2026-01-01' }, day)).toBe(false); // 起晚于止
    expect(isPolicyActiveOnBusinessDay({ isCurrent: true, startDate: '2027-01-01', expireDate: '2028-01-01' }, day)).toBe(false); // 未来
    expect(isPolicyActiveOnBusinessDay({ isCurrent: true, startDate: '2025-01-01', expireDate: '2026-01-01' }, day)).toBe(false); // 历史
  });

  // ---------- 2：空 employee 隔离（内存冲突服务） ----------
  test('内存冲突服务：空/非法/其他 employee_id 全部排除，仅目标正整数可冲突', () => {
    const records = [
      { id: 1, employee_id: 99, insurance_type: '雇主责任险', is_current: true, start_date: '2026-01-01', expire_date: '2027-01-01' }, // 目标
      { id: 2, employee_id: null, insurance_type: '雇主责任险', is_current: true, start_date: '2026-01-01', expire_date: '2027-01-01' }, // 空 → 排除
      { id: 3, employee_id: undefined, insurance_type: '雇主责任险', is_current: true, start_date: '2026-01-01', expire_date: '2027-01-01' }, // undefined → 排除
      { id: 4, employee_id: 'abc', insurance_type: '雇主责任险', is_current: true, start_date: '2026-01-01', expire_date: '2027-01-01' }, // 非法 → 排除
      { id: 5, employee_id: 100, insurance_type: '雇主责任险', is_current: true, start_date: '2026-01-01', expire_date: '2027-01-01' }, // 其他员工 → 排除
    ];
    // 只有 employee_id=99 的记录参与冲突
    const hit = findActivePolicyConflictInMemory({ employeeId: 99, insuranceType: '雇主责任险' }, { records, businessDay: '2026-08-05' });
    expect(hit.conflict).toEqual({ id: 1 });
    // 仅空记录存在时不得误冲突（Codex 复现场景：employeeId=99 + 只有 employee_id=null 的 active 记录）
    const onlyNull = [
      { id: 7, employee_id: null, insurance_type: '雇主责任险', is_current: true, start_date: '2026-01-01', expire_date: '2027-01-01' },
    ];
    const noHit = findActivePolicyConflictInMemory({ employeeId: 99, insuranceType: '雇主责任险' }, { records: onlyNull, businessDay: '2026-08-05' });
    expect(noHit.conflict).toBeNull();
  });

  // ---------- 2：批量续保遇存量 is_current=null 不查冲突 ----------
  test('批量续保 DB：存量 is_current=null 续保后仍非 active → 不查 active 冲突', async () => {
    db.isConnected.mockReturnValue(true);
    mockAuth();
    const client = { query: jest.fn(), release: jest.fn() };
    pool.connect.mockResolvedValueOnce(client);
    client.query.mockResolvedValueOnce({ rows: [] }); // BEGIN
    client.query.mockResolvedValueOnce({
      rows: [{ id: 10, employee_id: 5, person_name: '赵六', insurance_type: '雇主责任险', start_date: '2026-01-01', expire_date: '2026-08-01', is_current: null, premium: 0, remark: '' }],
    }); // SELECT ... FOR UPDATE（is_current=null）
    client.query.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // UPDATE
    client.query.mockResolvedValueOnce({ rows: [] }); // COMMIT
    const res = await request(app)
      .put('/api/insurance/personnel/batch-renewal')
      .set(auth)
      .send({ ids: [10], policyEndDate: '2027-01-01' });
    expect(res.statusCode).toBe(200);
    expect(res.body.data.renewed).toBe(1);
    // 未执行冲突查询（is_current=null → 非 active → 不查）
    const conflictCalls = client.query.mock.calls.filter((c) => String(c[0]).includes('SELECT p.id FROM personnel_insurance p'));
    expect(conflictCalls).toHaveLength(0);
  });

  // ---------- 2：默认上海业务日 fake timer（不显式传 businessDay） ----------
  test('默认业务日：fake timer 固定 UTC 跨日边界时默认路径使用上海日期（不传 businessDay）', () => {
    // UTC 2026-08-05T16:30Z = 上海 2026-08-06 00:30；默认业务日必须为 08-06
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-05T16:30:00Z'));
    try {
      const records = [
        { id: 1, employee_id: 5, insurance_type: '雇主责任险', is_current: true, start_date: '2026-08-06', expire_date: '2026-08-07' }, // 上海 08-06 生效
      ];
      // 不传 businessDay → 走生产默认 getBusinessDayStr()（fake timer 当前时刻 → 上海 08-06）
      const viaDefault = findActivePolicyConflictInMemory({ employeeId: 5, insuranceType: '雇主责任险' }, { records });
      expect(viaDefault.conflict).toBeTruthy(); // 上海 08-06 命中；UTC 08-05 会漏掉
      // 直接调 active 纯函数默认路径同理
      expect(isPolicyActiveOnBusinessDay({ isCurrent: true, startDate: '2026-08-06', expireDate: '2026-08-07' })).toBe(true);
    } finally {
      jest.useRealTimers(); // 必须恢复真实 timer
    }
  });

  // ---------- 3：批量续保事务补强 ----------
  test('批量续保 DB：SELECT 使用 FOR UPDATE（合并依据在本事务中稳定）', async () => {
    db.isConnected.mockReturnValue(true);
    mockAuth();
    const client = { query: jest.fn(), release: jest.fn() };
    pool.connect.mockResolvedValueOnce(client);
    client.query.mockResolvedValueOnce({ rows: [] }); // BEGIN
    client.query.mockResolvedValueOnce({
      rows: [{ id: 10, employee_id: 5, person_name: '赵六', insurance_type: '雇主责任险', start_date: '2025-01-01', expire_date: '2026-06-01', is_current: true, premium: 0, remark: '' }],
    }); // SELECT ... FOR UPDATE
    client.query.mockResolvedValueOnce({ rows: [] }); // 冲突无
    client.query.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // UPDATE
    client.query.mockResolvedValueOnce({ rows: [] }); // COMMIT
    const res = await request(app)
      .put('/api/insurance/personnel/batch-renewal')
      .set(auth)
      .send({ ids: [10], policyEndDate: '2027-01-01' });
    expect(res.statusCode).toBe(200);
    expect(res.body.data.renewed).toBe(1);
    const selCall = client.query.mock.calls.find((c) => String(c[0]).includes('SELECT * FROM personnel_insurance'));
    expect(String(selCall[0])).toContain('FOR UPDATE');
  });

  test('批量续保 DB：第二条 UPDATE rowCount=0 → ROLLBACK、不 COMMIT、renewed≠2、不泄漏内部信息', async () => {
    db.isConnected.mockReturnValue(true);
    mockAuth();
    const client = { query: jest.fn(), release: jest.fn() };
    pool.connect.mockResolvedValueOnce(client);
    client.query.mockResolvedValueOnce({ rows: [] }); // BEGIN
    client.query.mockResolvedValueOnce({
      rows: [
        { id: 10, employee_id: 5, person_name: '赵六', insurance_type: '雇主责任险', start_date: '2025-01-01', expire_date: '2026-06-01', is_current: false, premium: 0, remark: '' },
        { id: 11, employee_id: 6, person_name: '钱七', insurance_type: '工伤保险', start_date: '2025-01-01', expire_date: '2026-06-01', is_current: false, premium: 0, remark: '' },
      ],
    }); // SELECT ... FOR UPDATE（两目标，续保后均非 active → 无冲突查询）
    client.query.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // UPDATE 目标10 成功
    client.query.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // UPDATE 目标11 0 行
    client.query.mockResolvedValueOnce({ rows: [] }); // ROLLBACK
    const res = await request(app)
      .put('/api/insurance/personnel/batch-renewal')
      .set(auth)
      .send({ ids: [10, 11], policyEndDate: '2027-01-01' });
    expect(res.body.code).toBe(-1); // 安全失败响应
    const text = JSON.stringify(res.body);
    expect(text).not.toContain('rowCount');
    expect(text).not.toContain('RENEWAL_ROWCOUNT_ZERO');
    expect(text).not.toContain('connection');
    // ROLLBACK 执行、COMMIT 未执行
    const rollbackCall = client.query.mock.calls.find((c) => String(c[0]) === 'ROLLBACK');
    const commitCall = client.query.mock.calls.find((c) => String(c[0]) === 'COMMIT');
    expect(rollbackCall).toBeDefined();
    expect(commitCall).toBeUndefined();
  });
});

// ============================================================================
// 空保险表回退花名册（未导入雇主险/工伤险场景）
// ============================================================================
describe('空保险表回退花名册（未导入雇主险/工伤险）', () => {
  beforeEach(() => {
    pool.query.mockReset();
  });

  const auth = { Authorization: `Bearer ${signToken({ id: 1, username: 'admin', role: 'admin' })}` };

  test('DB 模式：保险记录为空时列表仍返回全部花名册员工（姓名/部门/岗位取自花名册）', async () => {
    mockAuth();
    // 保险 pivot 无匹配（模拟未导入任何雇主险/工伤险）→ COUNT=花名册数，列表行 emp/inj 全 null
    mockList([
      rosterRow({ employee_id: 1, name: '张三', department: '安全部', position: '安全员' }),
      rosterRow({ employee_id: 2, name: '李四', department: '保洁部', position: '保洁员' }),
    ]);
    const res = await request(app)
      .get('/api/insurance/personnel')
      .query({ page: 1, pageSize: 10 })
      .set(auth);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.total).toBe(2);
    const rows = res.body.data.list;
    expect(rows).toHaveLength(2);
    // 花名册字段回退显示（而非空白）
    expect(rows[0].personName).toBe('张三');
    expect(rows[0].department).toBe('安全部');
    expect(rows[0].position).toBe('安全员');
    // 无保险事实：两险均无记录、未投保、同步状态 missing
    expect(rows[0].employer.recordExists).toBe(false);
    expect(rows[0].injury.recordExists).toBe(false);
    expect(rows[0].employer.hasInsurance).toBe(false);
    expect(rows[0].injury.hasInsurance).toBe(false);
    expect(rows[0].personStatus).toBe('uninsured');
    expect(rows[0].syncStatus).toBe('missing');
  });

  test('DB 模式：列表查询异常时返回安全文案，不泄漏内部错误', async () => {
    mockAuth();
    pool.query.mockRejectedValueOnce(new Error('relation "v_employee_current" does not exist'));
    const res = await request(app)
      .get('/api/insurance/personnel')
      .query({ page: 1, pageSize: 10 })
      .set(auth);
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(-1);
    expect(JSON.stringify(res.body)).not.toContain('v_employee_current');
  });

  test('内存模式：无花名册数据源时返回结构正确的空列表（不报错，降级预期）', async () => {
    const { memoryStores } = require('../routes/insurance');
    memoryStores.personnel.length = 0; // 确保未导入任何保险
    db.isConnected.mockReturnValueOnce(false);
    mockAuth();
    const res = await request(app)
      .get('/api/insurance/personnel')
      .query({ page: 1, pageSize: 10 })
      .set(auth);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.total).toBe(0);
    expect(res.body.data.list).toEqual([]);
  });
});
