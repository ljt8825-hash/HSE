/**
 * M1-02 · V1/V2 人员导入任职写入统一改造 —— 单元测试（§七 覆盖矩阵）
 *
 * 被测：
 *   - services/employeeImportService.js   `importExcelFile()`              （V1）
 *   - services/employeeImportV2Service.js `performBatchImport()`（别名 batchImport） （V2）
 * 统一服务：
 *   - services/assignmentSegmentService.js `writeSegment()`
 *
 * 性质：纯单元测试。mock config/db（含可编排的 client 替身），不建连、不读文件、不写库。
 * 断言「控制流 + 下发的 SQL 形态 + 事务/保存点语义 + 批次去重登记时机 + 零副作用」，
 * **不等于**数据库执行结果；真实库验证属 DB-INT（需单独授权）。
 *
 * 覆盖（任务书 §七）：
 *   V1：A/B/C 当前段数量保护、关段失败回滚、新段插入失败回滚、批次去重
 *       （第一条成功后续同 id 标记冲突 / 第一条失败允许重试 / 不同员工互不影响 / 单员工失败不影响其他）
 *   V2：SAVEPOINT 成功后登记批次去重、SAVEPOINT 失败后不登记、批次去重
 *       （第一条成功后续同 id 标记冲突 / 第一条失败允许重试 / 不同员工互不影响）、
 *       关闭旧段 rowCount 异常回滚当前行、INSERT 异常回滚当前行、外层事务及批次状态正确
 */

jest.mock('../config/db', () => ({
  pool: { query: jest.fn(), connect: jest.fn() },
  isConnected: jest.fn(() => true),
}));

// V1 依赖（最小装配；resolveOrgUnitByDeptName 等直接 mock，避免真实 SQL 抖动）
jest.mock('xlsx', () => ({
  readFile: jest.fn(),
  utils: { sheet_to_json: jest.fn() },
  SSF: { parse_date_code: jest.fn(() => null) },
}));
jest.mock('../routes/hse-employee/_shared', () => ({
  secureEncode: (v) => ({ cipher: v ? `enc:${v}` : null, hash: v ? `hash:${v}` : null }),
}));
jest.mock('../services/employeeAssignmentService', () => ({
  resolveOrgUnitId: jest.fn(async () => ({ orgUnitId: 5, orgPath: '/城区作业中心' })),
  resolveOrgUnitByDeptName: jest.fn(async () => 5),
  matchOrgPath: jest.fn(async () => null),
  matchPositionByName: jest.fn(async () => null),
}));

// V2 依赖
jest.mock('../routes/audit', () => ({ auditLog: jest.fn(async () => {}), auditMiddleware: jest.fn() }));
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
const XLSX = require('xlsx');
const importV1 = require('../services/employeeImportService');
const importV2 = require('../services/employeeImportV2Service');

const WRITE_RE = /^\s*(INSERT|UPDATE|DELETE)\b/i;

/**
 * 可编排的 client 替身。
 * @param {Object} cfg
 * @param {Object} [cfg.byCode]    employee_code → { id, name, employment_relation }            (V1)
 * @param {Object} [cfg.byNo]      employee_no   → { id, employment_relation }                  (V2)
 * @param {Object} [cfg.byIdCard]  id_card_hash  → { id, employment_relation }                  (V2)
 * @param {Object} [cfg.byPhone]   'hash|name'   → { id, employment_relation }                  (V2)
 * @param {Object} [cfg.segments]  employee_id   → 当前段数组（控制 A/B/C 数量保护）
 * @param {number} [cfg.closeFail] 关闭段 UPDATE 前 N 次返回 rowCount=0（模拟 rowCount≠1）
 * @param {number} [cfg.insertFail]新段 INSERT 前 N 次返回空行（模拟 writeSegment 新建段失败守卫）
 */
function makeClient(cfg = {}) {
  const byCode = cfg.byCode || {};
  const byNo = cfg.byNo || {};
  const byIdCard = cfg.byIdCard || {};
  const byPhone = cfg.byPhone || {};
  const segments = cfg.segments || {};
  let closeFail = cfg.closeFail || 0;
  let insertFail = cfg.insertFail || 0;
  let nextEmpId = 901;
  let nextSegId = 7001;
  const calls = [];

  const query = jest.fn(async (sql, params = []) => {
    const text = String(sql).replace(/\s+/g, ' ').trim();
    calls.push({ text, params });

    if (/^(BEGIN|COMMIT|ROLLBACK|SAVEPOINT|ROLLBACK TO SAVEPOINT|RELEASE SAVEPOINT)/i.test(text)) {
      return { rows: [], rowCount: 0 };
    }
    // employee 匹配（V1 按工号；V2 三条路径）
    if (text.includes('FROM employee WHERE employee_code')) {
      // V1 用 byCode（employee_code 键），V2 用 byNo（employee_no 键）；二者共用同一 SQL
      const row = byCode[params[0]] || byNo[params[0]];
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }
    if (text.includes('FROM employee WHERE id_card_hash')) {
      const row = byIdCard[params[0]];
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }
    if (text.includes('FROM employee WHERE phone_hash')) {
      const row = byPhone[`${params[0]}|${params[1]}`];
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }
    if (text.includes('FROM employee WHERE id =')) {
      // 行锁（FOR UPDATE）后复核，结果不被使用
      return { rows: [], rowCount: 0 };
    }
    // 当前段读取（writeSegment 的 currentSegments 来源；V1 无 is_primary，V2 有 is_primary）
    if (text.includes('FROM employee_assignment')) {
      const arr = segments[params[0]] || [];
      return { rows: arr, rowCount: arr.length };
    }
    if (text.includes('INSERT INTO employee (')) return { rows: [{ id: nextEmpId++ }], rowCount: 1 };
    if (text.includes('UPDATE employee SET')) return { rows: [], rowCount: 1 };
    if (text.includes('UPDATE employee_assignment')) {
      if (closeFail > 0) { closeFail--; return { rows: [], rowCount: 0 }; }
      return { rows: [], rowCount: 1 };
    }
    if (text.includes('INSERT INTO employee_assignment')) {
      if (insertFail > 0) { insertFail--; return { rows: [], rowCount: 0 }; }
      return { rows: [{ id: nextSegId++ }], rowCount: 1 };
    }
    if (text.includes('INSERT INTO employee_history')) return { rows: [], rowCount: 1 };
    if (text.includes('UPDATE employee_import_pending')) return { rows: [], rowCount: 1 };
    if (text.includes('UPDATE employee_import_batch')) return { rows: [], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  });

  return { query, release: jest.fn(), calls };
}

// ---------- V1 装配 ----------
function makeV1Row(over = {}) {
  return {
    工号: 'E900', 姓名: '新员工', 身份证号: '110101199001011234', 手机号: '13800000001',
    性别: '男', 所属部门: '城区作业中心', 入职日期: '2026-01-05', ...over,
  };
}
async function runV1(rows, cfg = {}) {
  XLSX.readFile.mockReturnValue({ SheetNames: ['Sheet1'], Sheets: { Sheet1: {} } });
  XLSX.utils.sheet_to_json.mockReturnValue(rows);
  const client = makeClient(cfg);
  pool.connect.mockResolvedValue(client);
  const result = await importV1.importExcelFile({ tmpFile: 'fake.xlsx', userId: 1 });
  const calls = client.calls;
  return {
    result,
    calls,
    writes: calls.filter((c) => WRITE_RE.test(c.text)),
    segInserts: calls.filter((c) => c.text.includes('INSERT INTO employee_assignment')),
    closeUpdates: calls.filter((c) => /UPDATE\s+employee_assignment\s+SET\s+is_current\s*=\s*false/.test(c.text)),
  };
}

// ---------- V2 装配 ----------
function makeV2Pending(over = {}) {
  return {
    id: 1, row_num: 2, employee_no: 'E001', employee_name: '张三', raw_dept: '城区作业中心',
    raw_position: '保洁员', raw_team: null, raw_work_area: null, hire_date: '2026-01-05',
    is_driver: false, license_type: null, target_org_id: 5, target_unit_id: null, target_pos_id: 3,
    id_card_hash: null, phone_hash: null, gender: '男', birth_date: '1990-01-01',
    id_card_encrypted: null, phone_encrypted: null, person_type: '生产人员', supervisor_id: 9,
    raw_supervisor: null, is_public_welfare: false, ...over,
  };
}
async function runV2(pendings, cfg = {}, batch = {}) {
  pool.query
    .mockResolvedValueOnce({ rows: [{ batch_no: 'B001', rule_version: 'v1', status: 'pending', ...batch }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: pendings, rowCount: pendings.length });
  const client = makeClient(cfg);
  pool.connect.mockResolvedValue(client);
  const descriptor = await importV2.batchImport(11, { id: 1, username: 'admin' }, '127.0.0.1');
  const calls = client.calls;
  const writes = calls.filter((c) => WRITE_RE.test(c.text));
  return {
    descriptor,
    result: descriptor.payload || {},
    error: descriptor.error || null,
    calls,
    writes,
    segInserts: calls.filter((c) => c.text.includes('INSERT INTO employee_assignment')),
    closeUpdates: calls.filter((c) => /UPDATE\s+employee_assignment\s+SET\s+is_current\s*=\s*false/.test(c.text)),
    commits: calls.filter((c) => c.text === 'COMMIT'),
    rollbacks: calls.filter((c) => c.text === 'ROLLBACK'),
    spRollbacks: calls.filter((c) => c.text.startsWith('ROLLBACK TO SAVEPOINT')),
  };
}

beforeEach(() => { jest.clearAllMocks(); pool.query.mockReset(); pool.connect.mockReset(); });

// ============================================================
// V1 · A/B/C 当前段数量保护
// ============================================================
describe('V1 · 当前段数量保护（A/B/C）', () => {
  const existing = (id, rel = '正式员工') => ({ id, name: '张三', employee_code: 'E001', employment_relation: rel });

  it('A 场景：当前段 0 条 → 仅新建段，无关闭 UPDATE', async () => {
    const { result, segInserts, closeUpdates } = await runV1(
      [makeV1Row({ 工号: 'E001', 姓名: '张三' })],
      { byCode: { E001: existing(7) }, segments: {} },
    );
    expect(result.success).toBe(1);
    expect(result.failed).toBe(0);
    expect(segInserts).toHaveLength(1);
    expect(closeUpdates).toHaveLength(0);
  });

  it('B 场景：当前段 1 条 → 关闭旧段(rowCount=1) + 新建段', async () => {
    const { result, segInserts, closeUpdates } = await runV1(
      [makeV1Row({ 工号: 'E001', 姓名: '张三' })],
      { byCode: { E001: existing(7) }, segments: { 7: [{ id: 7001, employee_id: 7, org_unit_id: 5, position_id: 3, status: 'active' }] } },
    );
    expect(result.success).toBe(1);
    expect(result.failed).toBe(0);
    expect(segInserts).toHaveLength(1);
    expect(closeUpdates).toHaveLength(1);
  });

  it('C 场景：当前段 2 条 → 数据异常拒绝，零写入、整行回滚', async () => {
    const { result, segInserts, closeUpdates } = await runV1(
      [makeV1Row({ 工号: 'E001', 姓名: '张三' })],
      { byCode: { E001: existing(7) }, segments: { 7: [{ id: 7001, employee_id: 7 }, { id: 7002, employee_id: 7 }] } },
    );
    expect(result.success).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.errors[0].message).toContain('数据异常');
    expect(segInserts).toHaveLength(0);
    expect(closeUpdates).toHaveLength(0);
    expect(result.errors[0].message).toContain('2 条');
  });

  it('A 场景（新员工）：无当前段，仅新建段 + 入职历史', async () => {
    const { result, segInserts } = await runV1([makeV1Row({ 工号: 'E777' })]);
    expect(result.success).toBe(1);
    expect(segInserts).toHaveLength(1);
  });
});

// ============================================================
// V1 · 关段失败 / 新段插入失败 → 整行回滚
// ============================================================
describe('V1 · 关段失败 / 新段插入失败回滚', () => {
  const existing = (id) => ({ id, name: '张三', employee_code: 'E001', employment_relation: '正式员工' });

  it('关段 rowCount≠1 → 抛 SegmentCloseFailedError，整行回滚，零插入', async () => {
    const { result, segInserts, calls } = await runV1(
      [makeV1Row({ 工号: 'E001', 姓名: '张三' })],
      { byCode: { E001: existing(7) }, segments: { 7: [{ id: 7001, employee_id: 7 }] }, closeFail: 1 },
    );
    expect(result.success).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.errors[0].message).toContain('关闭');
    expect(segInserts).toHaveLength(0);
    expect(calls.some((c) => c.text === 'ROLLBACK')).toBe(true);
    expect(calls.some((c) => c.text === 'COMMIT')).toBe(false);
  });

  it('新段 INSERT 返回空行 → writeSegment 守卫抛错，整行回滚，零提交', async () => {
    const { result, segInserts, calls } = await runV1(
      [makeV1Row({ 工号: 'E001', 姓名: '张三' })],
      { byCode: { E001: existing(7) }, segments: { 7: [{ id: 7001, employee_id: 7 }] }, insertFail: 1 },
    );
    expect(result.success).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.errors[0].message).toContain('新任职段未能创建');
    expect(segInserts).toHaveLength(1); // INSERT 语句已下发但返回空（被守卫拦截）
    expect(calls.some((c) => c.text === 'ROLLBACK')).toBe(true);
    expect(calls.some((c) => c.text === 'COMMIT')).toBe(false);
  });
});

// ============================================================
// V1 · 批次去重（employee.id 键）
// ============================================================
describe('V1 · 批次去重（employee.id 稳定键）', () => {
  const existing = (id) => ({ id, name: '张三', employee_code: 'E001', employment_relation: '正式员工' });
  const seg = { 7: [{ id: 7001, employee_id: 7 }] };

  it('第一条成功、第二条同 id → 标记重复冲突（fail），不重复写入', async () => {
    const { result, segInserts } = await runV1(
      [makeV1Row({ 工号: 'E001', 姓名: '张三' }), makeV1Row({ 工号: 'E001', 姓名: '张三' })],
      { byCode: { E001: existing(7) }, segments: seg },
    );
    expect(result.success).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.errors[0].message).toContain('重复');
    expect(segInserts).toHaveLength(1); // 仅第一条成功写入
  });

  it('第一条失败、第二条同 id → 允许重试，第二条成功写入', async () => {
    // closeFail=1：第一条关段失败 → 不登记去重；第二条（同 id）重新关段成功
    const { result, segInserts } = await runV1(
      [makeV1Row({ 工号: 'E001', 姓名: '张三' }), makeV1Row({ 工号: 'E001', 姓名: '张三' })],
      { byCode: { E001: existing(7) }, segments: seg, closeFail: 1 },
    );
    expect(result.success).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.errors[0].message).toContain('关闭');
    expect(segInserts).toHaveLength(1); // 仅第二条（重试）成功写入
  });

  it('不同员工（不同 id）互不影响：各自行独立成功', async () => {
    const cfg = {
      byCode: {
        E001: { id: 7, name: '甲', employee_code: 'E001', employment_relation: '正式员工' },
        E002: { id: 8, name: '乙', employee_code: 'E002', employment_relation: '正式员工' },
      },
      segments: { 7: [{ id: 7001, employee_id: 7 }], 8: [{ id: 7002, employee_id: 8 }] },
    };
    const { result, segInserts } = await runV1(
      [makeV1Row({ 工号: 'E001', 姓名: '甲' }), makeV1Row({ 工号: 'E002', 姓名: '乙', 身份证号: '110101199001011242', 手机号: '13800000002' })],
      cfg,
    );
    expect(result.success).toBe(2);
    expect(result.failed).toBe(0);
    expect(segInserts).toHaveLength(2);
  });

  it('单员工失败不影响其它员工：首行关段失败，其余成功', async () => {
    // 仅第一条（id=7）关段失败；id=8/9 正常
    const cfg = {
      byCode: {
        E001: { id: 7, name: '甲', employee_code: 'E001', employment_relation: '正式员工' },
        E002: { id: 8, name: '乙', employee_code: 'E002', employment_relation: '正式员工' },
        E003: { id: 9, name: '丙', employee_code: 'E003', employment_relation: '正式员工' },
      },
      segments: { 7: [{ id: 7001, employee_id: 7 }], 8: [{ id: 7002, employee_id: 8 }], 9: [{ id: 7003, employee_id: 9 }] },
      closeFail: 1,
    };
    const { result, segInserts, calls } = await runV1(
      [
        makeV1Row({ 工号: 'E001', 姓名: '甲' }),
        makeV1Row({ 工号: 'E002', 姓名: '乙', 身份证号: '110101199001011242', 手机号: '13800000002' }),
        makeV1Row({ 工号: 'E003', 姓名: '丙', 身份证号: '110101199001011259', 手机号: '13800000003' }),
      ],
      cfg,
    );
    expect(result.total).toBe(3);
    expect(result.success).toBe(2);
    expect(result.failed).toBe(1);
    expect(segInserts).toHaveLength(2); // 仅 id=8、id=9 写入
    // 失败员工 id=7 不应出现任何 employee_assignment（关段/建段）写入（关段失败被回滚）
    const segWritesOnFailed = calls
      .filter((c) => /employee_assignment/.test(c.text) && WRITE_RE.test(c.text))
      .filter((c) => (c.params || []).includes(7));
    expect(segWritesOnFailed).toEqual([]);
  });
});

// ============================================================
// V2 · SAVEPOINT 去重登记时机 + 批次去重
// ============================================================
describe('V2 · SAVEPOINT 去重登记时机', () => {
  it('SAVEPOINT 成功后登记去重：第一条成功，第二条同 id 标记重复（fail）', async () => {
    const { result, segInserts, calls } = await runV2(
      [makeV2Pending({ id: 1, row_num: 2, employee_no: 'E001' }), makeV2Pending({ id: 2, row_num: 3, employee_no: 'E001', id_card_hash: 'HX', phone_hash: 'HY' })],
      { byNo: { E001: { id: 7, employment_relation: '正式员工' } }, segments: { 7: [{ id: 7001, employee_id: 7 }] } },
    );
    expect(result.assignmentCount).toBe(1);
    expect(result.failedCount).toBe(1);
    expect(result.errors[0]).toContain('重复');
    expect(segInserts).toHaveLength(1); // 仅第一条成功建段
    expect(calls.some((c) => c.text === 'ROLLBACK TO SAVEPOINT sp_1')).toBe(true); // 第二条回滚到保存点
    expect(calls.some((c) => c.text === 'COMMIT')).toBe(true);
  });

  it('SAVEPOINT 失败后不登记去重：第一条失败，第二条同 id 允许重试并成功', async () => {
    const { result, segInserts, calls } = await runV2(
      [makeV2Pending({ id: 1, row_num: 2, employee_no: 'E001' }), makeV2Pending({ id: 2, row_num: 3, employee_no: 'E001', id_card_hash: 'HX', phone_hash: 'HY' })],
      { byNo: { E001: { id: 7, employment_relation: '正式员工' } }, segments: { 7: [{ id: 7001, employee_id: 7 }] }, closeFail: 1 },
    );
    expect(result.assignmentCount).toBe(1);
    expect(result.failedCount).toBe(1);
    expect(result.errors[0]).toContain('关闭');
    expect(segInserts).toHaveLength(1); // 仅第二条（重试）成功建段
    const pendingImported = calls.filter((c) => c.text.includes("UPDATE employee_import_pending SET status = 'imported'"));
    expect(pendingImported).toHaveLength(1); // 仅第二条（成功行）回写 imported
  });

  it('不同员工（不同 id）互不影响：各自独立入库', async () => {
    const { result, segInserts } = await runV2(
      [
        makeV2Pending({ id: 1, row_num: 2, employee_no: 'E001' }),
        makeV2Pending({ id: 2, row_num: 3, employee_no: 'E002', id_card_hash: 'HX', phone_hash: 'HY' }),
      ],
      {
        byNo: {
          E001: { id: 7, employment_relation: '正式员工' },
          E002: { id: 8, employment_relation: '正式员工' },
        },
        segments: { 7: [{ id: 7001, employee_id: 7 }], 8: [{ id: 7002, employee_id: 8 }] },
      },
    );
    expect(result.assignmentCount).toBe(2);
    expect(result.failedCount).toBe(0);
    expect(segInserts).toHaveLength(2);
  });
});

// ============================================================
// V2 · 关闭旧段 rowCount 异常 / INSERT 异常 → 回滚当前行
// ============================================================
describe('V2 · 行级失败隔离（关闭/插入异常回滚当前行）', () => {
  it('关闭旧段 rowCount≠1 → 该行回滚到保存点，assignmentCount=0，零插入', async () => {
    const { result, segInserts, spRollbacks, commits, rollbacks } = await runV2(
      [makeV2Pending({ id: 1, row_num: 2, employee_no: 'E001' })],
      { byNo: { E001: { id: 7, employment_relation: '正式员工' } }, segments: { 7: [{ id: 7001, employee_id: 7 }] }, closeFail: 1 },
    );
    expect(result.assignmentCount).toBe(0);
    expect(result.failedCount).toBe(1);
    expect(segInserts).toHaveLength(0);
    expect(spRollbacks.some((c) => c.text === 'ROLLBACK TO SAVEPOINT sp_0')).toBe(true);
    expect(commits.some((c) => c.text === 'COMMIT')).toBe(true); // 外层事务仍提交（隔离后继续）
    expect(rollbacks.some((c) => c.text === 'ROLLBACK')).toBe(false); // 非整批回滚
  });

  it('新段 INSERT 返回空行 → writeSegment 守卫抛错，该行回滚到保存点，零提交', async () => {
    const { result, segInserts, spRollbacks, commits, rollbacks } = await runV2(
      [makeV2Pending({ id: 1, row_num: 2, employee_no: 'E001' })],
      { byNo: { E001: { id: 7, employment_relation: '正式员工' } }, segments: { 7: [{ id: 7001, employee_id: 7 }] }, insertFail: 1 },
    );
    expect(result.assignmentCount).toBe(0);
    expect(result.failedCount).toBe(1);
    expect(result.errors[0]).toContain('新任职段未能创建');
    expect(segInserts).toHaveLength(1); // INSERT 已下发但被守卫拦截
    expect(spRollbacks.some((c) => c.text === 'ROLLBACK TO SAVEPOINT sp_0')).toBe(true);
    expect(commits.some((c) => c.text === 'COMMIT')).toBe(true);
    expect(rollbacks.some((c) => c.text === 'ROLLBACK')).toBe(false);
  });
});

// ============================================================
// V2 · 外层事务及批次状态正确
// ============================================================
describe('V2 · 外层事务与批次状态', () => {
  it('全成功批次 → 外层 COMMIT、批次状态 completed、无整批 ROLLBACK', async () => {
    const { result, commits, rollbacks, calls } = await runV2(
      [makeV2Pending({ id: 1, row_num: 2, employee_no: 'E001' })],
      { byNo: { E001: { id: 7, employment_relation: '正式员工' } }, segments: { 7: [{ id: 7001, employee_id: 7 }] } },
    );
    expect(result.assignmentCount).toBe(1);
    expect(result.failedCount).toBe(0);
    expect(commits.some((c) => c.text === 'COMMIT')).toBe(true);
    expect(rollbacks.some((c) => c.text === 'ROLLBACK')).toBe(false);
    const batchUpdate = calls.find((c) => c.text.includes('UPDATE employee_import_batch'));
    expect(batchUpdate.params[0]).toBe('completed');
    expect(result.batchStatus || (result.payload && result.payload.batchStatus)).toBeUndefined();
  });

  it('混合批次（正常 + 终态）→ 终态行回滚到保存点、批次 partial_completed、外层 COMMIT', async () => {
    const { result, commits, rollbacks, spRollbacks, calls } = await runV2(
      [
        makeV2Pending({ id: 1, row_num: 2, employee_no: 'E001', employee_name: '正常甲' }),
        makeV2Pending({ id: 2, row_num: 3, employee_no: 'E002', employee_name: '退休乙', id_card_hash: 'HX', phone_hash: 'HY' }),
      ],
      {
        byNo: {
          E001: { id: 7, employment_relation: '正式员工' },
          E002: { id: 8, employment_relation: '退休' },
        },
        segments: { 7: [{ id: 7001, employee_id: 7 }] },
      },
    );
    expect(result.total).toBe(2);
    expect(result.assignmentCount).toBe(1);
    expect(result.failedCount).toBe(1);
    expect(spRollbacks.some((c) => c.text === 'ROLLBACK TO SAVEPOINT sp_1')).toBe(true);
    expect(commits.some((c) => c.text === 'COMMIT')).toBe(true);
    expect(rollbacks.some((c) => c.text === 'ROLLBACK')).toBe(false);
    const batchUpdate = calls.find((c) => c.text.includes('UPDATE employee_import_batch'));
    expect(batchUpdate.params[0]).toBe('partial_completed');
  });
});
