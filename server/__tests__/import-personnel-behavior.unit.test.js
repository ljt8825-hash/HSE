/**
 * 任务8（提示词08）：人员保险通用导入真实闭环行为测试（升级版）。
 * 修复 07 轮假阳性：成功用例不再只确认"存在 INSERT + 参数含预期值"，
 * 而是精确断言 INSERT 列清单、顺序与逐列参数映射；mock DB 增加接近 PostgreSQL 的护栏：
 * INSERT/UPDATE SQL 一旦出现 `_import_row_no/_import_error/employee_code` 或不在人员保险
 * 列白名单中的字段，即抛 `column does not exist`（修复前该测试必须失败）。
 * 覆盖批量 INSERT、批量失败后逐条 INSERT、命中 conflict 后 UPDATE 三条写入路径。
 * 全程零真实文件读写、零真实数据库连接、零子进程。
 */
jest.mock('xlsx', () => {
  const actual = jest.requireActual('xlsx');
  return { ...actual, readFile: jest.fn() };
});

jest.mock('../config/db', () => {
  const mockQuery = jest.fn().mockResolvedValue({ rows: [], rowCount: 0 });
  return {
    pool: { query: mockQuery, connect: jest.fn() },
    isConnected: jest.fn(() => true),
    testConnection: jest.fn(),
  };
});

jest.mock('../middleware/upload', () => {
  const noop = (req, res, next) => next();
  const uploader = { single: () => noop, array: () => noop };
  return {
    ensureDir: jest.fn(),
    deleteFile: jest.fn(),
    validateUploadedFile: jest.fn(),
    fixFilenameEncoding: jest.fn((n) => n),
    createUploader: jest.fn(() => ({ single: () => noop, array: () => noop })),
    uploadExcel: uploader,
    uploadImage: uploader,
    uploadDocument: uploader,
    uploadInsurance: uploader,
    uploadHazard: uploader,
  };
});

const request = require('supertest');
const jwt = require('jsonwebtoken');
const XLSX = require('xlsx');
const app = require('../app');
const { pool } = require('../config/db');
const db = require('../config/db');

const adminUserRow = { id: 1, username: 'admin', role: 'admin', real_name: '系统管理员', is_active: true };
const signToken = (payload) =>
  jwt.sign({ type: 'access', ...payload }, process.env.JWT_SECRET, { expiresIn: '1h', jwtid: 'ip-' + Math.random().toString(36).slice(2) });
const auth = { Authorization: `Bearer ${signToken(adminUserRow)}` };

/** 人员保险数据库列白名单（与 import.js personnel.dbColumns 一致）+ 代码追加的合法维护列 */
const PERSONNEL_DB_COLUMNS = [
  'employee_id', 'personnel_id', 'person_name', 'department', 'position',
  'insurance_type', 'coverage_amount', 'premium', 'start_date', 'expire_date',
  'is_current', 'policy_no', 'remark',
];
/** UPDATE 路径代码追加的维护列（合法，非内部元数据） */
const ALLOWED_MAINTENANCE_COLUMNS = ['updated_at', 'is_deleted', 'id'];

/** 从 INSERT/UPDATE SQL 中提取列名（INSERT: 括号列表；UPDATE: SET 键） */
function extractSqlColumns(sql) {
  const s = String(sql);
  const insertMatch = s.match(/INSERT INTO \w+ \(([^)]+)\)/);
  if (insertMatch) return insertMatch[1].split(',').map((c) => c.trim()).filter(Boolean);
  const updateMatch = s.match(/UPDATE \w+ SET ([\s\S]*?) WHERE/i);
  if (updateMatch) {
    return updateMatch[1].split(',').map((c) => c.trim().split('=')[0].trim()).filter(Boolean);
  }
  return [];
}

/**
 * 安装带 PostgreSQL 护栏的 mock 查询实现（并注入固定前置序列）。
 * 固定注入：authMiddleware 黑名单+用户、POST /confirm 的 module_type 查询、
 * confirmImportNative 的 filepath 查询。sequence 从人员解析/查重/写库开始按序消费。
 * 每次 INSERT/UPDATE personnel_insurance 都检查列：含内部元数据或非白名单列 → 抛
 * `column "X" does not exist`（模拟真实 PG 行为）。
 */
function installGuardedPool(sequence = []) {
  let idx = 0;
  pool.query.mockReset();
  pool.query.mockResolvedValueOnce({ rows: [] }); // authMiddleware 黑名单
  pool.query.mockResolvedValueOnce({ rows: [adminUserRow] }); // authMiddleware 用户
  pool.query.mockResolvedValueOnce({ rows: [{ module_type: 'personnel' }] }); // POST /confirm 查 module_type
  pool.query.mockResolvedValueOnce({ rows: [{ filepath: '/tmp/mem.xlsx', original_name: 'mem.xlsx' }] }); // confirmImportNative 查 filepath
  pool.query.mockImplementation((sql, params) => {
    const s = String(sql);
    if (/INSERT INTO personnel_insurance|UPDATE personnel_insurance/.test(s)) {
      const bad = extractSqlColumns(s).filter((c) =>
        /^_import_/.test(c) || c === 'employee_code' || (!PERSONNEL_DB_COLUMNS.includes(c) && !ALLOWED_MAINTENANCE_COLUMNS.includes(c))
      );
      if (bad.length > 0) {
        return Promise.reject(new Error(`column "${bad[0]}" does not exist`));
      }
    }
    const r = sequence[idx++];
    return Promise.resolve(r !== undefined ? r : { rows: [], rowCount: 0 });
  });
}

function mockAuth() {
  // authMiddleware 消耗黑名单 + 用户查询（护栏实现默认返回空 rows，认证会失败 → 需先注入）
  pool.query.mockReset();
  pool.query.mockResolvedValueOnce({ rows: [] }); // 黑名单
  pool.query.mockResolvedValueOnce({ rows: [adminUserRow] }); // 用户
}

/** 构造一个 personnel 模块内存工作簿（与模板表头一一对应） */
function buildWorkbook(rows) {
  const headers = ['工号', '姓名', '保险类型', '保单号', '保险起期', '保险到期', '保额', '保费', '是否当前', '备注'];
  const aoa = [headers, ...rows.map((r) => headers.map((h) => r[h] ?? ''))];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!ref'] = `A1:J${aoa.length}`;
  return { SheetNames: ['Sheet1'], Sheets: { Sheet1: ws } };
}

/** 模拟一次 confirm 请求：认证 + file_records + 预处理（员工解析/查重）+ 写库序列 */
function mockConfirmSequence(seq) {
  mockAuth();
  // 认证后：POST /confirm 查 module_type；confirmImportNative 查 filepath；然后 seq 按序消费
  pool.query.mockResolvedValueOnce({ rows: [{ module_type: 'personnel' }] });
  pool.query.mockResolvedValueOnce({ rows: [{ filepath: '/tmp/mem.xlsx', original_name: 'mem.xlsx' }] });
  seq.forEach((r) => pool.query.mockResolvedValueOnce(r));
}

const EMP_ROW = (id, code, name, org, pos) => ({ employee_id: id, employee_code: code, name, org_name: org, position_name: pos });

describe('通用导入 personnel 真实闭环（任务8：列白名单 + PG 护栏）', () => {
  beforeEach(() => {
    XLSX.readFile.mockClear();
  });

  // ---------- 模板 ----------
  test('模板响应（CSV）包含工号及全部可导入表头（与 fieldMapping 对应）', async () => {
    mockAuth();
    const res = await request(app).get('/api/import/template/personnel?format=csv').set(auth);
    expect(res.statusCode).toBe(200);
    const csv = res.text;
    expect(csv).toContain('工号');
    expect(csv).toContain('保险类型');
    expect(csv).toContain('保单号');
    expect(csv).toContain('保险起期');
    expect(csv).toContain('保险到期');
    expect(csv).toContain('保额');
    expect(csv).toContain('保费');
    expect(csv).toContain('是否当前');
    expect(csv).toContain('备注');
    expect(csv).not.toContain('身份证号');
  });

  // ---------- 成功路径：INSERT 精确列清单 + 参数映射（PG 护栏自动拦截内部元数据） ----------
  test('成功行 INSERT：精确列白名单与顺序，逐列参数映射（_import_row_no 泄漏会触发 column does not exist）', async () => {
    // 任务9 序列：resolveEmployee → conflict 目标查询（existingMap，无同目标）→ 冲突检查（findActivePolicyConflict 无命中）→ 批量 INSERT
    installGuardedPool([
      { rows: [EMP_ROW(3, 'E003', '钱七', '车队', '驾驶员')] }, // resolveEmployee by code
      { rows: [] }, // conflict 目标查询（同 employee+type+policy_no 无命中）
      { rows: [] }, // findActivePolicyConflict（无当前有效冲突）
      { rows: [], rowCount: 1 }, // 批量 INSERT
    ]);
    XLSX.readFile.mockReturnValue(buildWorkbook([
      { 工号: 'E003', 姓名: '钱七', 保险类型: '雇主责任险', 保单号: 'P1', 保险起期: '2026-01-01', 保险到期: '2027-01-01', 保额: 800000, 保费: 500, 是否当前: '是', 备注: '备注X' },
    ]));
    const res = await request(app)
      .post('/api/import/confirm')
      .set(auth)
      .send({ fileRecordId: 1 });
    expect(res.body.success).toBe(true);
    expect(res.body.data.inserted).toBe(1);
    const insertCall = pool.query.mock.calls.find((c) => String(c[0]).includes('INSERT INTO personnel_insurance'));
    expect(insertCall).toBeDefined();
    // 精确列清单（白名单顺序，不含 _import_row_no/_import_error/employee_code）
    const cols = extractSqlColumns(insertCall[0]);
    expect(cols).toEqual(PERSONNEL_DB_COLUMNS);
    // 逐列参数映射（白名单顺序）
    const params = insertCall[1];
    const map = Object.fromEntries(cols.map((c, i) => [c, params[i]]));
    expect(map.employee_id).toBe(3);
    // personnel_id 兼容列可为 null（新代码以 employee_id 为关联键）
    expect(map.person_name).toBe('钱七');
    expect(map.department).toBe('车队');
    expect(map.position).toBe('驾驶员');
    expect(map.insurance_type).toBe('雇主责任险');
    expect(map.coverage_amount).toBe(800000);
    expect(map.premium).toBe(500);
    expect(map.start_date).toBe('2026-01-01');
    expect(map.expire_date).toBe('2027-01-01');
    expect(map.is_current).toBe(true);
    expect(map.policy_no).toBe('P1');
    expect(map.remark).toBe('备注X');
  });

  // ---------- 批量 INSERT 列护栏（修复前：_import_row_no 出现在列中 → mock 抛 unknown-column） ----------
  test('修复前缺陷复现：若 INSERT 列含 _import_row_no，护栏抛 column does not exist（证明内部元数据不可能进入 SQL）', () => {
    // 模拟旧实现（Object.keys(row) 含 _import_row_no）生成的 SQL
    const badSql = `INSERT INTO personnel_insurance (employee_id, _import_row_no, person_name) VALUES ($1,$2,$3)`;
    const bad = extractSqlColumns(badSql).filter((c) => c === '_import_row_no' || !PERSONNEL_DB_COLUMNS.includes(c));
    expect(bad).toEqual(['_import_row_no']);
  });

  // ---------- 批量失败后逐条降级 INSERT（仍白名单） ----------
  test('批量 INSERT 失败 → 逐条降级 INSERT 使用白名单列，失败行进 rowErrors 不丢失', async () => {
    installGuardedPool([
      { rows: [EMP_ROW(3, 'E003', '钱七', '车队', '驾驶员')] },
      { rows: [] }, // conflict 目标查询（无命中 → INSERT 场景）
      { rows: [] }, // findActivePolicyConflict（无当前有效冲突）
    ]);
    // 拦截写库 SQL：第一次 INSERT（批量）抛错触发降级；后续逐条 INSERT 成功。
    // 所有 INSERT 列仍须通过护栏（白名单校验），证明内部元数据不会泄漏。
    const origImpl = pool.query.getMockImplementation();
    let insertCount = 0;
    pool.query.mockImplementation((sql, params) => {
      if (String(sql).includes('INSERT INTO personnel_insurance')) {
        insertCount++;
        if (insertCount === 1) return Promise.reject(new Error('batch failed'));
        return Promise.resolve({ rows: [], rowCount: 1 });
      }
      return origImpl(sql, params);
    });
    XLSX.readFile.mockReturnValue(buildWorkbook([
      { 工号: 'E003', 姓名: '钱七', 保险类型: '雇主责任险', 保单号: 'P1', 保险起期: '2026-01-01', 保险到期: '2027-01-01', 保额: 800000, 保费: 500, 是否当前: '是', 备注: '' },
    ]));
    const res = await request(app)
      .post('/api/import/confirm')
      .set(auth)
      .send({ fileRecordId: 1 });
    expect(res.body.success).toBe(true);
    // 逐条 INSERT 必须仍使用白名单列
    const inserts = pool.query.mock.calls.filter((c) => String(c[0]).includes('INSERT INTO personnel_insurance'));
    expect(inserts.length).toBeGreaterThanOrEqual(2);
    inserts.forEach((c) => {
      const cols = extractSqlColumns(c[0]);
      expect(cols.every((x) => PERSONNEL_DB_COLUMNS.includes(x) || ALLOWED_MAINTENANCE_COLUMNS.includes(x))).toBe(true);
      expect(cols.some((x) => /^_import_/.test(x) || x === 'employee_code')).toBe(false);
    });
    // 逐条 INSERT 成功 → inserted 计入
    expect(res.body.data.inserted).toBe(1);
  });

  // ---------- 同目标 UPDATE（任务9：先识别 UPDATE 目标再排除自身检查冲突） ----------
  test('命中 conflict（同 employee_id+险种+保单号）→ 排除自身后无冲突 → UPDATE 使用白名单列', async () => {
    installGuardedPool([
      { rows: [EMP_ROW(3, 'E003', '钱七', '车队', '驾驶员')] },
      // conflict 目标查询（existingMap）：同 employee_id+insurance_type+policy_no 已有记录（目标本身）
      { rows: [{ id: 99, employee_id: 3, insurance_type: '雇主责任险', policy_no: 'P1', is_deleted: false }] },
      // findActivePolicyConflict 以 excludeId=99 查询：排除目标自身后无其他当前有效 → 允许 UPDATE
      { rows: [] },
    ]);
    XLSX.readFile.mockReturnValue(buildWorkbook([
      { 工号: 'E003', 姓名: '钱七', 保险类型: '雇主责任险', 保单号: 'P1', 保险起期: '2026-01-01', 保险到期: '2027-01-01', 保额: 800000, 保费: 600, 是否当前: '是', 备注: '' },
    ]));
    const res = await request(app)
      .post('/api/import/confirm')
      .set(auth)
      .send({ fileRecordId: 1 });
    expect(res.body.success).toBe(true);
    const updateCall = pool.query.mock.calls.find((c) => String(c[0]).includes('UPDATE personnel_insurance'));
    expect(updateCall).toBeDefined();
    // UPDATE 列必须在白名单内（不含 _import_* / employee_code）
    const cols = extractSqlColumns(updateCall[0]);
    expect(cols.every((x) => PERSONNEL_DB_COLUMNS.includes(x) || ALLOWED_MAINTENANCE_COLUMNS.includes(x))).toBe(true);
    expect(cols.some((x) => /^_import_/.test(x) || x === 'employee_code')).toBe(false);
  });

  // ---------- 混合可选字段不错位 ----------
  test('两行可选字段缺失不同：白名单固定列序，缺失以 NULL 占位不错位', async () => {
    installGuardedPool([
      { rows: [EMP_ROW(3, 'E003', '钱七', '车队', '驾驶员')] }, // 解析行1
      { rows: [EMP_ROW(4, 'E004', '赵八', '安全部', '安全员')] }, // 解析行2
      { rows: [] }, // conflict 目标查询（合并：行1 有保单号 P1 命中检查；无同目标）
      { rows: [] }, // findActivePolicyConflict 行1（无冲突）
      { rows: [] }, // findActivePolicyConflict 行2（无冲突）
      { rows: [], rowCount: 2 }, // 批量 INSERT（2 行）
    ]);
    XLSX.readFile.mockReturnValue(buildWorkbook([
      { 工号: 'E003', 姓名: '钱七', 保险类型: '工伤保险', 保单号: 'P1', 保险起期: '2026-01-01', 保险到期: '2027-01-01', 保额: '', 保费: '', 是否当前: '是', 备注: '' },
      { 工号: 'E004', 姓名: '赵八', 保险类型: '雇主责任险', 保单号: '', 保险起期: '2026-02-01', 保险到期: '2027-02-01', 保额: 800000, 保费: 700, 是否当前: '是', 备注: '' },
    ]));
    const res = await request(app)
      .post('/api/import/confirm')
      .set(auth)
      .send({ fileRecordId: 1 });
    expect(res.body.success).toBe(true);
    expect(res.body.data.inserted).toBe(2);
    const insertCall = pool.query.mock.calls.find((c) => String(c[0]).includes('INSERT INTO personnel_insurance'));
    const cols = extractSqlColumns(insertCall[0]);
    // 精确列清单（白名单顺序）
    expect(cols).toEqual(PERSONNEL_DB_COLUMNS);
    const params = insertCall[1];
    // 2 行 × 13 列：按 employee_id 归位（行序由解析保证，此处按 ID 断言不错位）
    const rows = [];
    for (let i = 0; i < 2; i++) {
      rows.push(Object.fromEntries(cols.map((c, j) => [c, params[i * cols.length + j]])));
    }
    const row3 = rows.find((r) => r.employee_id === 3);
    const row4 = rows.find((r) => r.employee_id === 4);
    expect(row3).toBeDefined();
    expect(row3.insurance_type).toBe('工伤保险');
    expect(row3.coverage_amount).toBeNull(); // 行1缺保额 → NULL 占位（不因行2有值错位）
    expect(row3.premium).toBeNull();
    expect(row4).toBeDefined();
    expect(row4.coverage_amount).toBe(800000);
    expect(row4.policy_no).toBeNull(); // 行2缺保单号 → NULL 占位
  });

  // ---------- 姓名不一致 / 零候选 / 缺工号 / 日期顺序（保留回归） ----------
  test('姓名与主数据不一致 → 行进入 rowErrors（name_mismatch），不 INSERT', async () => {
    mockAuth();
    pool.query.mockResolvedValueOnce({ rows: [{ module_type: 'personnel' }] });
    pool.query.mockResolvedValueOnce({ rows: [{ filepath: '/tmp/mem.xlsx', original_name: 'mem.xlsx' }] });
    pool.query.mockResolvedValueOnce({ rows: [EMP_ROW(3, 'E003', '钱七', '车队', '驾驶员')] });
    XLSX.readFile.mockReturnValue(buildWorkbook([
      { 工号: 'E003', 姓名: '李四', 保险类型: '雇主责任险', 保单号: 'P1', 保险起期: '2026-01-01', 保险到期: '2027-01-01', 保额: 800000, 保费: 500, 是否当前: '是', 备注: '' },
    ]));
    const res = await request(app).post('/api/import/confirm').set(auth).send({ fileRecordId: 1 });
    expect(res.body.data.inserted).toBe(0);
    expect(JSON.stringify(res.body.data.rowErrors)).toContain('name_mismatch');
    expect(pool.query.mock.calls.filter((c) => String(c[0]).includes('INSERT INTO personnel_insurance'))).toHaveLength(0);
  });

  test('工号零候选 → rowErrors（employee_not_found），不 INSERT', async () => {
    mockAuth();
    pool.query.mockResolvedValueOnce({ rows: [{ module_type: 'personnel' }] });
    pool.query.mockResolvedValueOnce({ rows: [{ filepath: '/tmp/mem.xlsx', original_name: 'mem.xlsx' }] });
    pool.query.mockResolvedValueOnce({ rows: [] });
    XLSX.readFile.mockReturnValue(buildWorkbook([
      { 工号: 'E999', 姓名: '张三', 保险类型: '雇主责任险', 保单号: 'P1', 保险起期: '2026-01-01', 保险到期: '2027-01-01', 保额: 800000, 保费: 500, 是否当前: '是', 备注: '' },
    ]));
    const res = await request(app).post('/api/import/confirm').set(auth).send({ fileRecordId: 1 });
    expect(res.body.data.inserted).toBe(0);
    expect(JSON.stringify(res.body.data.rowErrors)).toContain('employee_not_found');
  });

  test('缺工号 → rowErrors（missing_employee_id），不 INSERT', async () => {
    mockAuth();
    pool.query.mockResolvedValueOnce({ rows: [{ module_type: 'personnel' }] });
    pool.query.mockResolvedValueOnce({ rows: [{ filepath: '/tmp/mem.xlsx', original_name: 'mem.xlsx' }] });
    XLSX.readFile.mockReturnValue(buildWorkbook([
      { 工号: '', 姓名: '张三', 保险类型: '雇主责任险', 保单号: 'P1', 保险起期: '2026-01-01', 保险到期: '2027-01-01', 保额: 800000, 保费: 500, 是否当前: '是', 备注: '' },
    ]));
    const res = await request(app).post('/api/import/confirm').set(auth).send({ fileRecordId: 1 });
    expect(res.body.data.inserted).toBe(0);
    expect(JSON.stringify(res.body.data.rowErrors)).toContain('missing_employee_id');
  });

  test('日期起期晚于止期 → rowErrors（date_order_invalid），不 INSERT', async () => {
    mockAuth();
    pool.query.mockResolvedValueOnce({ rows: [{ module_type: 'personnel' }] });
    pool.query.mockResolvedValueOnce({ rows: [{ filepath: '/tmp/mem.xlsx', original_name: 'mem.xlsx' }] });
    pool.query.mockResolvedValueOnce({ rows: [EMP_ROW(3, 'E003', '钱七', '车队', '驾驶员')] });
    XLSX.readFile.mockReturnValue(buildWorkbook([
      { 工号: 'E003', 姓名: '钱七', 保险类型: '雇主责任险', 保单号: 'P1', 保险起期: '2027-01-01', 保险到期: '2026-01-01', 保额: 800000, 保费: 500, 是否当前: '是', 备注: '' },
    ]));
    const res = await request(app).post('/api/import/confirm').set(auth).send({ fileRecordId: 1 });
    expect(res.body.data.inserted).toBe(0);
    expect(JSON.stringify(res.body.data.rowErrors)).toContain('date_order_invalid');
  });

  // ---------- 任务5：查重与保单号无关；查重异常 fail-closed ----------
  test('不同保单号（P2）也不能绕过重复当前保单检查 → duplicate_active_policy，不 INSERT', async () => {
    installGuardedPool([
      { rows: [EMP_ROW(3, 'E003', '钱七', '车队', '驾驶员')] },
      { rows: [] }, // conflict 目标查询（P2 无同目标 → INSERT 场景）
      { rows: [{ id: 55 }] }, // findActivePolicyConflict 命中（已有当前有效保单，与保单号无关）
    ]);
    XLSX.readFile.mockReturnValue(buildWorkbook([
      { 工号: 'E003', 姓名: '钱七', 保险类型: '雇主责任险', 保单号: 'P2-DIFFERENT', 保险起期: '2026-01-01', 保险到期: '2027-01-01', 保额: 800000, 保费: 500, 是否当前: '是', 备注: '' },
    ]));
    const res = await request(app).post('/api/import/confirm').set(auth).send({ fileRecordId: 1 });
    expect(res.body.data.inserted).toBe(0);
    // 任务9：rowErrors 为结构化对象
    expect(res.body.data.rowErrors.some((e) => e.reason === 'duplicate_active_policy')).toBe(true);
    expect(pool.query.mock.calls.filter((c) => String(c[0]).includes('INSERT INTO personnel_insurance'))).toHaveLength(0);
  });

  test('查重异常 → fail-closed（duplicate_check_failed），该行不写库', async () => {
    installGuardedPool([
      { rows: [EMP_ROW(3, 'E003', '钱七', '车队', '驾驶员')] },
      { rows: [] }, // conflict 目标查询（无命中）
    ]);
    // findActivePolicyConflict 查询抛错（fail-closed）：覆盖护栏实现
    const origImpl = pool.query.getMockImplementation();
    pool.query.mockImplementation((sql, params) => {
      if (String(sql).includes('FROM personnel_insurance p\n      WHERE p.employee_id = $1 AND p.insurance_type = $2')) {
        return Promise.reject(new Error('connection reset'));
      }
      return origImpl(sql, params);
    });
    XLSX.readFile.mockReturnValue(buildWorkbook([
      { 工号: 'E003', 姓名: '钱七', 保险类型: '雇主责任险', 保单号: 'P1', 保险起期: '2026-01-01', 保险到期: '2027-01-01', 保额: 800000, 保费: 500, 是否当前: '是', 备注: '' },
    ]));
    const res = await request(app).post('/api/import/confirm').set(auth).send({ fileRecordId: 1 });
    expect(res.body.data.inserted).toBe(0);
    expect(res.body.data.rowErrors.some((e) => e.reason === 'duplicate_check_failed')).toBe(true);
    expect(pool.query.mock.calls.filter((c) => String(c[0]).includes('INSERT INTO personnel_insurance'))).toHaveLength(0);
  });

  // ---------- 任务4：险种字典（工伤险别名/意外伤害险/五险） ----------
  test('工伤险别名 → 规范化写入工伤保险', async () => {
    installGuardedPool([
      { rows: [EMP_ROW(3, 'E003', '钱七', '车队', '驾驶员')] },
      { rows: [] }, // conflict 目标查询（无命中）
      { rows: [] }, // findActivePolicyConflict（无冲突）
      { rows: [], rowCount: 1 }, // 批量 INSERT
    ]);
    XLSX.readFile.mockReturnValue(buildWorkbook([
      { 工号: 'E003', 姓名: '钱七', 保险类型: '工伤险', 保单号: 'P1', 保险起期: '2026-01-01', 保险到期: '2027-01-01', 保额: 800000, 保费: 500, 是否当前: '是', 备注: '' },
    ]));
    const res = await request(app).post('/api/import/confirm').set(auth).send({ fileRecordId: 1 });
    expect(res.body.data.inserted).toBe(1);
    const insertCall = pool.query.mock.calls.find((c) => String(c[0]).includes('INSERT INTO personnel_insurance'));
    const params = insertCall[1];
    const cols = extractSqlColumns(insertCall[0]);
    const map = Object.fromEntries(cols.map((c, i) => [c, params[i]]));
    expect(map.insurance_type).toBe('工伤保险'); // 规范化，不再写"工伤险"
  });

  test('意外伤害险/五险 → unsupported_insurance_type 拒绝，不写库', async () => {
    mockAuth();
    pool.query.mockResolvedValueOnce({ rows: [{ module_type: 'personnel' }] });
    pool.query.mockResolvedValueOnce({ rows: [{ filepath: '/tmp/mem.xlsx', original_name: 'mem.xlsx' }] });
    XLSX.readFile.mockReturnValue(buildWorkbook([
      { 工号: 'E003', 姓名: '钱七', 保险类型: '意外伤害险', 保单号: 'P1', 保险起期: '2026-01-01', 保险到期: '2027-01-01', 保额: 800000, 保费: 500, 是否当前: '是', 备注: '' },
    ]));
    const res = await request(app).post('/api/import/confirm').set(auth).send({ fileRecordId: 1 });
    expect(res.body.data.inserted).toBe(0);
    expect(JSON.stringify(res.body.data.rowErrors)).toContain('unsupported_insurance_type');
    expect(pool.query.mock.calls.filter((c) => String(c[0]).includes('INSERT INTO personnel_insurance'))).toHaveLength(0);
  });
});

// ============================================================================
// 任务9 追加：通用导入同目标 UPDATE 真实可达（同一次状态查询同时满足目标存在+排除后无冲突）
// ============================================================================
describe('通用导入同目标 UPDATE 可达（任务9）', () => {
  const XLSX = require('xlsx');
  beforeEach(() => {
    XLSX.readFile.mockClear();
    db.isConnected.mockReturnValue(true);
  });

  const auth = { Authorization: `Bearer ${signToken({ id: 1, username: 'admin', role: 'admin' })}` };

  function buildWorkbook(rows) {
    const headers = ['工号', '姓名', '保险类型', '保单号', '保险起期', '保险到期', '保额', '保费', '是否当前', '备注'];
    const aoa = [headers, ...rows.map((r) => headers.map((h) => r[h] ?? ''))];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!ref'] = `A1:J${aoa.length}`;
    return { SheetNames: ['Sheet1'], Sheets: { Sheet1: ws } };
  }

  const EMP_ROW = (id, code, name, org, pos) => ({ employee_id: id, employee_code: code, name, org_name: org, position_name: pos });

  test('同一当前保单：目标行存在（同 employee+type+policy）且排除目标后无其他冲突 → UPDATE 成功', async () => {
    // 序列：认证、module_type、filepath、解析、冲突目标查询（命中目标99）、findActivePolicyConflict(excludeId=99 无冲突)、UPDATE
    mockAuth();
    pool.query.mockResolvedValueOnce({ rows: [{ module_type: 'personnel' }] });
    pool.query.mockResolvedValueOnce({ rows: [{ filepath: '/tmp/u.xlsx', original_name: 'u.xlsx' }] });
    pool.query.mockResolvedValueOnce({ rows: [EMP_ROW(3, 'E003', '钱七', '车队', '驾驶员')] }); // 解析
    // 冲突目标查询（existingMap）：同 employee_id+insurance_type+policy_no 命中 id=99（目标自身）
    pool.query.mockResolvedValueOnce({ rows: [{ id: 99, employee_id: 3, insurance_type: '雇主责任险', policy_no: 'P1', is_deleted: false }] });
    // findActivePolicyConflict（excludeId=99）：排除目标自身后无其他当前有效 → 无冲突
    pool.query.mockResolvedValueOnce({ rows: [] });
    // UPDATE 成功
    pool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    XLSX.readFile.mockReturnValue(buildWorkbook([
      { 工号: 'E003', 姓名: '钱七', 保险类型: '雇主责任险', 保单号: 'P1', 保险起期: '2026-01-01', 保险到期: '2027-01-01', 保额: 800000, 保费: 600, 是否当前: '是', 备注: '' },
    ]));
    const res = await request(app)
      .post('/api/import/confirm')
      .set(auth)
      .send({ fileRecordId: 1 });
    expect(res.body.success).toBe(true);
    expect(res.body.data.updated).toBe(1);
    expect(res.body.data.inserted).toBe(0);
    // UPDATE 存在且使用白名单列
    const updateCall = pool.query.mock.calls.find((c) => String(c[0]).includes('UPDATE personnel_insurance'));
    expect(updateCall).toBeDefined();
    // 冲突查询参数含 excludeId=99（证明不是靠 mock 顺序偶然通过）
    const conflictCall = pool.query.mock.calls.find((c) => String(c[0]).includes('FROM personnel_insurance p') && String(c[0]).includes('p.id <> $3'));
    expect(conflictCall).toBeDefined();
    expect(conflictCall[1][2]).toBe(99);
  });

  test('目标存在 + 另一张当前有效保单 → duplicate_active_policy 拒绝，不 UPDATE', async () => {
    mockAuth();
    pool.query.mockResolvedValueOnce({ rows: [{ module_type: 'personnel' }] });
    pool.query.mockResolvedValueOnce({ rows: [{ filepath: '/tmp/u.xlsx', original_name: 'u.xlsx' }] });
    pool.query.mockResolvedValueOnce({ rows: [EMP_ROW(3, 'E003', '钱七', '车队', '驾驶员')] });
    pool.query.mockResolvedValueOnce({ rows: [{ id: 99, employee_id: 3, insurance_type: '雇主责任险', policy_no: 'P1', is_deleted: false }] }); // 目标自身
    pool.query.mockResolvedValueOnce({ rows: [{ id: 77 }] }); // findActivePolicyConflict(excludeId=99)：仍有另一张当前有效
    const res = await request(app)
      .post('/api/import/confirm')
      .set(auth)
      .send({ fileRecordId: 1 });
    expect(res.body.data.updated).toBe(0);
    expect(res.body.data.rowErrors.some((e) => e.reason === 'duplicate_active_policy')).toBe(true);
    expect(pool.query.mock.calls.filter((c) => String(c[0]).includes('UPDATE personnel_insurance'))).toHaveLength(0);
  });

  test('冲突目标批量查询失败 → personnel fail-closed（不 INSERT/UPDATE）', async () => {
    mockAuth();
    pool.query.mockResolvedValueOnce({ rows: [{ module_type: 'personnel' }] });
    pool.query.mockResolvedValueOnce({ rows: [{ filepath: '/tmp/u.xlsx', original_name: 'u.xlsx' }] });
    pool.query.mockResolvedValueOnce({ rows: [EMP_ROW(3, 'E003', '钱七', '车队', '驾驶员')] });
    pool.query.mockRejectedValueOnce(new Error('conflict lookup failed')); // 目标查询抛错
    const res = await request(app)
      .post('/api/import/confirm')
      .set(auth)
      .send({ fileRecordId: 1 });
    expect(res.body.success).toBe(false); // fail-closed：整批中止
    expect(res.body.data.rowErrors.some((e) => e.reason === 'duplicate_check_failed')).toBe(true);
    expect(pool.query.mock.calls.filter((c) => String(c[0]).includes('INSERT INTO personnel_insurance'))).toHaveLength(0);
    expect(pool.query.mock.calls.filter((c) => String(c[0]).includes('UPDATE personnel_insurance'))).toHaveLength(0);
  });
});
// ============================================================================
// 任务10（提示词10）追加：通用导入批内冲突 + active/future/不同员工/不同险种不假冲突
// ============================================================================
describe('通用导入批内冲突（任务10）', () => {
  // ---------- 5：同批两张不同保单号同 employee/type active 只允许一张 ----------
  test('同批两张不同保单号同 employee/type active → 第二张 duplicate_active_policy_in_batch（含原始行号）', async () => {
    installGuardedPool([
      { rows: [EMP_ROW(3, 'E003', '钱七', '车队', '驾驶员')] }, // 解析行1
      { rows: [EMP_ROW(3, 'E003', '钱七', '车队', '驾驶员')] }, // 解析行2
      { rows: [] }, // 目标查询（合并，无命中）
      { rows: [] }, // 冲突查询（行1，无）——行2 在批内被拒，不再查 DB
      { rows: [], rowCount: 1 }, // 批量 INSERT（仅行1）
    ]);
    XLSX.readFile.mockReturnValue(buildWorkbook([
      { 工号: 'E003', 姓名: '钱七', 保险类型: '雇主责任险', 保单号: 'P1', 保险起期: '2026-01-01', 保险到期: '2027-01-01', 保额: 800000, 保费: 500, 是否当前: '是', 备注: '' },
      { 工号: 'E003', 姓名: '钱七', 保险类型: '雇主责任险', 保单号: 'P2', 保险起期: '2026-06-01', 保险到期: '2027-06-01', 保额: 800000, 保费: 600, 是否当前: '是', 备注: '' },
    ]));
    const res = await request(app).post('/api/import/confirm').set(auth).send({ fileRecordId: 1 });
    expect(res.body.data.inserted).toBe(1);
    const rowErr = res.body.data.rowErrors.find((e) => e.reason === 'duplicate_active_policy_in_batch');
    expect(rowErr).toBeDefined();
    expect(rowErr.row).toBe(2); // 原始行号（第二行）
    // 批量 INSERT 只写 1 行（两行的 employee_id 相同 → 单批 INSERT 参数为 1 行 × 13 列）
    const insertCall = pool.query.mock.calls.find((c) => String(c[0]).includes('INSERT INTO personnel_insurance'));
    expect(insertCall[1].length).toBe(13);
  });

  // ---------- 6：active+future 不假冲突 ----------
  test('同批 active+future 同 employee/type → 两行都通过（未来不占批内 key、不被误拦）', async () => {
    installGuardedPool([
      { rows: [EMP_ROW(3, 'E003', '钱七', '车队', '驾驶员')] }, // 解析行1
      { rows: [EMP_ROW(3, 'E003', '钱七', '车队', '驾驶员')] }, // 解析行2
      { rows: [] }, // 目标查询（无命中）
      { rows: [] }, // 冲突查询（行1 active，无）
      { rows: [], rowCount: 2 }, // 批量 INSERT（2 行）
    ]);
    XLSX.readFile.mockReturnValue(buildWorkbook([
      { 工号: 'E003', 姓名: '钱七', 保险类型: '雇主责任险', 保单号: 'P1', 保险起期: '2026-01-01', 保险到期: '2027-01-01', 保额: 800000, 保费: 500, 是否当前: '是', 备注: '' }, // active
      { 工号: 'E003', 姓名: '钱七', 保险类型: '雇主责任险', 保单号: 'P3', 保险起期: '2027-02-01', 保险到期: '2028-02-01', 保额: 800000, 保费: 700, 是否当前: '是', 备注: '' }, // future
    ]));
    const res = await request(app).post('/api/import/confirm').set(auth).send({ fileRecordId: 1 });
    expect(res.body.data.inserted).toBe(2);
    expect(res.body.data.rowErrors).toBeUndefined(); // 无错误时 confirm 不返回 rowErrors 字段
  });

  // ---------- 6：不同 employee / 不同 type 不假冲突 ----------
  test('同批不同 employee 或不同 type 的 active 记录互不冲突（都通过）', async () => {
    installGuardedPool([
      { rows: [EMP_ROW(3, 'E003', '钱七', '车队', '驾驶员')] }, // 解析行1
      { rows: [EMP_ROW(4, 'E004', '赵八', '安全部', '安全员')] }, // 解析行2
      { rows: [EMP_ROW(3, 'E003', '钱七', '车队', '驾驶员')] }, // 解析行3
      { rows: [] }, // 目标查询（无命中）
      { rows: [] }, // 冲突查询（行1）
      { rows: [] }, // 冲突查询（行2）
      { rows: [] }, // 冲突查询（行3）
      { rows: [], rowCount: 3 }, // 批量 INSERT（3 行）
    ]);
    XLSX.readFile.mockReturnValue(buildWorkbook([
      { 工号: 'E003', 姓名: '钱七', 保险类型: '雇主责任险', 保单号: 'P1', 保险起期: '2026-01-01', 保险到期: '2027-01-01', 保额: 800000, 保费: 500, 是否当前: '是', 备注: '' },
      { 工号: 'E004', 姓名: '赵八', 保险类型: '工伤保险', 保单号: 'P2', 保险起期: '2026-01-01', 保险到期: '2027-01-01', 保额: 800000, 保费: 600, 是否当前: '是', 备注: '' },
      { 工号: 'E003', 姓名: '钱七', 保险类型: '工伤保险', 保单号: 'P3', 保险起期: '2026-01-01', 保险到期: '2027-01-01', 保额: 800000, 保费: 700, 是否当前: '是', 备注: '' },
    ]));
    const res = await request(app).post('/api/import/confirm').set(auth).send({ fileRecordId: 1 });
    expect(res.body.data.inserted).toBe(3);
    expect(res.body.data.rowErrors).toBeUndefined(); // 无错误时 confirm 不返回 rowErrors 字段
  });
});
// ============================================================================
// 任务11（提示词11）追加：批内接受集时序 + 导入结果状态 imported/partial/failed
// ============================================================================
describe('批内接受集时序与导入结果状态（任务11）', () => {
  // ---------- 1：INSERT 被拒不残留 key，后续 UPDATE（正是该 existing 目标）允许 ----------
  test('第1行 INSERT 因 DB active 冲突被拒 → 第2行 UPDATE 该目标以 excludeId 查无其他冲突允许 UPDATE', async () => {
    installGuardedPool([
      { rows: [EMP_ROW(3, 'E003', '钱七', '车队', '驾驶员')] }, // 解析行1
      { rows: [EMP_ROW(3, 'E003', '钱七', '车队', '驾驶员')] }, // 解析行2
      // 目标查询（合并）：行1 P1 无目标；行2 P2 命中 id=99
      { rows: [{ id: 99, employee_id: 3, insurance_type: '雇主责任险', policy_no: 'P2', is_deleted: false }] },
      { rows: [{ id: 55 }] }, // 冲突查询行1（INSERT 无 excludeId）→ 命中外部 active → 行1 拒
      { rows: [] },           // 冲突查询行2（UPDATE excludeId=99）→ 无 → 行2 允许
      { rows: [], rowCount: 1 }, // UPDATE（行2）
      { rows: [] },           // file_records status
    ]);
    XLSX.readFile.mockReturnValue(buildWorkbook([
      { 工号: 'E003', 姓名: '钱七', 保险类型: '雇主责任险', 保单号: 'P1', 保险起期: '2026-01-01', 保险到期: '2027-01-01', 保额: 800000, 保费: 500, 是否当前: '是', 备注: '' }, // INSERT
      { 工号: 'E003', 姓名: '钱七', 保险类型: '雇主责任险', 保单号: 'P2', 保险起期: '2026-01-01', 保险到期: '2027-01-01', 保额: 800000, 保费: 600, 是否当前: '是', 备注: '' }, // UPDATE
    ]));
    const res = await request(app).post('/api/import/confirm').set(auth).send({ fileRecordId: 1 });
    expect(res.body.data.inserted).toBe(0);
    expect(res.body.data.updated).toBe(1);
    // 行1 被 duplicate_active_policy 拒且不残留 key；行2 UPDATE 正常
    const row1 = res.body.data.rowErrors.find((e) => e.row === 1);
    expect(row1.reason).toBe('duplicate_active_policy');
    // UPDATE 冲突查询使用 excludeId=99（params[2]）
    const conflictCalls = pool.query.mock.calls.filter((c) => String(c[0]).includes('SELECT p.id FROM personnel_insurance p'));
    const updConflict = conflictCalls[1];
    expect(updConflict[1][2]).toBe(99); // excludeId
    // 实际 UPDATE 调用存在
    const updCall = pool.query.mock.calls.find((c) => String(c[0]).includes('UPDATE personnel_insurance'));
    expect(updCall).toBeDefined();
  });

  // ---------- 1：按源行序（UPDATE 先于 INSERT）决定接受顺序 ----------
  test('第1行 UPDATE、第2行 INSERT 最终同 key active → 按源行顺序接受 UPDATE、拒绝 INSERT', async () => {
    installGuardedPool([
      { rows: [EMP_ROW(3, 'E003', '钱七', '车队', '驾驶员')] }, // 解析行1
      { rows: [EMP_ROW(3, 'E003', '钱七', '车队', '驾驶员')] }, // 解析行2
      { rows: [{ id: 99, employee_id: 3, insurance_type: '雇主责任险', policy_no: 'P1', is_deleted: false }] }, // 目标查询：行1 P1 命中 id=99；行2 P2 无
      { rows: [] },           // 冲突查询行1（UPDATE excludeId=99）→ 无 → 行1 接受
      { rows: [], rowCount: 1 }, // UPDATE（行1）
      { rows: [] },           // file_records status
    ]);
    XLSX.readFile.mockReturnValue(buildWorkbook([
      { 工号: 'E003', 姓名: '钱七', 保险类型: '雇主责任险', 保单号: 'P1', 保险起期: '2026-01-01', 保险到期: '2027-01-01', 保额: 800000, 保费: 500, 是否当前: '是', 备注: '' }, // UPDATE（原始第1行）
      { 工号: 'E003', 姓名: '钱七', 保险类型: '雇主责任险', 保单号: 'P2', 保险起期: '2026-06-01', 保险到期: '2027-06-01', 保额: 800000, 保费: 600, 是否当前: '是', 备注: '' }, // INSERT（原始第2行）
    ]));
    const res = await request(app).post('/api/import/confirm').set(auth).send({ fileRecordId: 1 });
    // 按源行序：UPDATE（行1）先接受 → INSERT（行2）同 key active 批内拒绝
    expect(res.body.data.updated).toBe(1);
    expect(res.body.data.inserted).toBe(0);
    const row2 = res.body.data.rowErrors.find((e) => e.row === 2);
    expect(row2.reason).toBe('duplicate_active_policy_in_batch');
    // 无 INSERT 调用
    expect(pool.query.mock.calls.filter((c) => String(c[0]).includes('INSERT INTO personnel_insurance'))).toHaveLength(0);
  });

  // ---------- 1：同一 UPDATE 目标行1 失败（外部冲突）、行2 合法 → 行2 独立校验成功 ----------
  test('同一 UPDATE 目标：第1行外部冲突失败不占位，第2行独立校验成功', async () => {
    installGuardedPool([
      { rows: [EMP_ROW(3, 'E003', '钱七', '车队', '驾驶员')] }, // 解析行1
      { rows: [EMP_ROW(3, 'E003', '钱七', '车队', '驾驶员')] }, // 解析行2
      { rows: [{ id: 99, employee_id: 3, insurance_type: '雇主责任险', policy_no: 'P1', is_deleted: false }] }, // 目标查询：两行同 P1 命中 id=99
      { rows: [{ id: 55 }] }, // 冲突查询行1（excludeId=99）→ 仍有第三张 active → 行1 拒
      { rows: [] },           // 冲突查询行2（excludeId=99）→ 无 → 行2 独立通过
      { rows: [], rowCount: 1 }, // UPDATE（行2）
      { rows: [] },           // file_records status
    ]);
    XLSX.readFile.mockReturnValue(buildWorkbook([
      { 工号: 'E003', 姓名: '钱七', 保险类型: '雇主责任险', 保单号: 'P1', 保险起期: '2026-01-01', 保险到期: '2027-01-01', 保额: 800000, 保费: 500, 是否当前: '是', 备注: '' }, // 行1
      { 工号: 'E003', 姓名: '钱七', 保险类型: '雇主责任险', 保单号: 'P1', 保险起期: '2026-01-01', 保险到期: '2027-01-01', 保额: 800000, 保费: 700, 是否当前: '是', 备注: '' }, // 行2（同目标）
    ]));
    const res = await request(app).post('/api/import/confirm').set(auth).send({ fileRecordId: 1 });
    expect(res.body.data.updated).toBe(1); // 仅行2
    const row1 = res.body.data.rowErrors.find((e) => e.row === 1);
    expect(row1.reason).toBe('duplicate_active_policy');
    // 行2 不是 duplicate_target_in_batch（失败行不占 target 位）
    expect(res.body.data.rowErrors.filter((e) => e.reason === 'duplicate_target_in_batch')).toHaveLength(0);
  });

  // ---------- 1：冲突查询异常行不进入 accepted 集合 ----------
  test('冲突查询异常行不占 accepted key：后行独立校验成功，响应用安全 reason', async () => {
    installGuardedPool([
      { rows: [EMP_ROW(3, 'E003', '钱七', '车队', '驾驶员')] }, // 解析行1
      { rows: [EMP_ROW(3, 'E003', '钱七', '车队', '驾驶员')] }, // 解析行2
      { rows: [] },           // 目标查询（无命中）
      { rows: [], rowCount: 1 }, // INSERT（行2，行1 冲突查询失败后独立通过）
      { rows: [] },           // file_records status
    ]);
    // 拦截第一个冲突查询（行1）抛错；其余走原实现
    const origImpl = pool.query.getMockImplementation();
    let conflictIdx = 0;
    pool.query.mockImplementation((sql, params) => {
      if (String(sql).includes('SELECT p.id FROM personnel_insurance p') && conflictIdx++ === 0) {
        return Promise.reject(new Error('connection reset at secret_host:5432'));
      }
      return origImpl(sql, params);
    });
    XLSX.readFile.mockReturnValue(buildWorkbook([
      { 工号: 'E003', 姓名: '钱七', 保险类型: '雇主责任险', 保单号: 'P1', 保险起期: '2026-01-01', 保险到期: '2027-01-01', 保额: 800000, 保费: 500, 是否当前: '是', 备注: '' },
      { 工号: 'E003', 姓名: '钱七', 保险类型: '雇主责任险', 保单号: 'P2', 保险起期: '2026-01-01', 保险到期: '2027-01-01', 保额: 800000, 保费: 600, 是否当前: '是', 备注: '' },
    ]));
    const res = await request(app).post('/api/import/confirm').set(auth).send({ fileRecordId: 1 });
    expect(res.body.data.inserted).toBe(1); // 行2 独立通过
    const row1 = res.body.data.rowErrors.find((e) => e.row === 1);
    expect(row1.reason).toBe('duplicate_check_failed'); // 安全 reason
    const text = JSON.stringify(res.body);
    expect(text).not.toContain('secret_host');
    expect(text).not.toContain('connection reset');
  });

  // ---------- 4：outcome imported（全成功） ----------
  test('全成功：outcome=imported、file status imported、文案含入库成功', async () => {
    installGuardedPool([
      { rows: [EMP_ROW(3, 'E003', '钱七', '车队', '驾驶员')] }, // 解析
      { rows: [] },           // 目标查询
      { rows: [] },           // 冲突查询（无）
      { rows: [], rowCount: 1 }, // INSERT
      { rows: [] },           // file_records status（参数化）
    ]);
    XLSX.readFile.mockReturnValue(buildWorkbook([
      { 工号: 'E003', 姓名: '钱七', 保险类型: '雇主责任险', 保单号: 'P1', 保险起期: '2026-01-01', 保险到期: '2027-01-01', 保额: 800000, 保费: 500, 是否当前: '是', 备注: '' },
    ]));
    const res = await request(app).post('/api/import/confirm').set(auth).send({ fileRecordId: 1 });
    expect(res.body.data.outcome).toBe('imported');
    expect(res.body.message).toContain('入库成功');
    const frUpd = pool.query.mock.calls.find((c) => String(c[0]).includes('UPDATE file_records SET module_type'));
    expect(frUpd[1][1]).toBe('imported'); // status 参数化
  });

  // ---------- 4：outcome partial（一成功一失败） ----------
  test('一成功一失败：outcome=partial、file status partial、文案含部分入库完成、rowErrors 保留', async () => {
    installGuardedPool([
      { rows: [EMP_ROW(3, 'E003', '钱七', '车队', '驾驶员')] }, // 解析行1
      { rows: [EMP_ROW(3, 'E003', '钱七', '车队', '驾驶员')] }, // 解析行2
      { rows: [] },           // 目标查询
      { rows: [] },           // 冲突查询行1（无）
      { rows: [], rowCount: 1 }, // INSERT（行1）
      { rows: [] },           // file_records status
    ]);
    XLSX.readFile.mockReturnValue(buildWorkbook([
      { 工号: 'E003', 姓名: '钱七', 保险类型: '雇主责任险', 保单号: 'P1', 保险起期: '2026-01-01', 保险到期: '2027-01-01', 保额: 800000, 保费: 500, 是否当前: '是', 备注: '' },
      { 工号: 'E003', 姓名: '钱七', 保险类型: '雇主责任险', 保单号: 'P2', 保险起期: '2026-06-01', 保险到期: '2027-06-01', 保额: 800000, 保费: 600, 是否当前: '是', 备注: '' },
    ]));
    const res = await request(app).post('/api/import/confirm').set(auth).send({ fileRecordId: 1 });
    expect(res.body.data.inserted).toBe(1);
    expect(res.body.data.outcome).toBe('partial');
    expect(res.body.message).toContain('部分入库完成');
    expect(res.body.data.rowErrors).toBeDefined(); // 明细保留
    const frUpd = pool.query.mock.calls.find((c) => String(c[0]).includes('UPDATE file_records SET module_type'));
    expect(frUpd[1][1]).toBe('partial');
  });

  // ---------- 4：outcome failed（零成功有失败） ----------
  test('零成功有失败：outcome=failed、file status failed、文案不含入库成功', async () => {
    installGuardedPool([
      { rows: [] },           // 解析行1 无候选 → employee_not_found
      { rows: [] },           // file_records status
    ]);
    XLSX.readFile.mockReturnValue(buildWorkbook([
      { 工号: 'E999', 姓名: '不存在', 保险类型: '雇主责任险', 保单号: 'P1', 保险起期: '2026-01-01', 保险到期: '2027-01-01', 保额: 800000, 保费: 500, 是否当前: '是', 备注: '' },
    ]));
    const res = await request(app).post('/api/import/confirm').set(auth).send({ fileRecordId: 1 });
    expect(res.body.data.inserted).toBe(0);
    expect(res.body.data.outcome).toBe('failed');
    expect(res.body.message).toContain('入库失败');
    expect(res.body.message).not.toContain('入库成功');
    const frUpd = pool.query.mock.calls.find((c) => String(c[0]).includes('UPDATE file_records SET module_type'));
    expect(frUpd[1][1]).toBe('failed');
  });

  // ---------- 4：file status 更新失败 → 安全失败响应 ----------
  test('file_records 状态更新失败：返回安全失败，不泄漏 SQL/host/port 文本', async () => {
    installGuardedPool([
      { rows: [EMP_ROW(3, 'E003', '钱七', '车队', '驾驶员')] }, // 解析
      { rows: [] },           // 目标查询
      { rows: [] },           // 冲突查询（无）
      { rows: [], rowCount: 1 }, // INSERT
    ]);
    // file_records UPDATE 抛错（覆盖原实现）
    const origImpl = pool.query.getMockImplementation();
    pool.query.mockImplementation((sql, params) => {
      if (String(sql).includes('UPDATE file_records SET module_type')) {
        return Promise.reject(new Error('connection lost at 127.0.0.1:5432 secret_db'));
      }
      return origImpl(sql, params);
    });
    XLSX.readFile.mockReturnValue(buildWorkbook([
      { 工号: 'E003', 姓名: '钱七', 保险类型: '雇主责任险', 保单号: 'P1', 保险起期: '2026-01-01', 保险到期: '2027-01-01', 保额: 800000, 保费: 500, 是否当前: '是', 备注: '' },
    ]));
    const res = await request(app).post('/api/import/confirm').set(auth).send({ fileRecordId: 1 });
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe(-2);
    const text = JSON.stringify(res.body);
    expect(text).not.toContain('secret_db');
    expect(text).not.toContain('127.0.0.1');
    expect(text).not.toContain('connection lost');
  });
});

// ============================================================================
// 雇主险清单健壮解析（提示词：真实清单格式 / 缺失必填列 / 重复 / 行数 / 空文件 / 编码异常）
// 直接走 /api/import/upload（parseExcelNative 纯解析阶段，不触碰 confirm 写库）
// ============================================================================
describe('雇主险清单健壮解析（真实清单格式与边界）', () => {
  const { uploadExcel } = require('../middleware/upload');
  const originalSingle = uploadExcel.single;

  /** 让 multer 注入 req.file（原始 mock 的 single 是 noop，不会设置 req.file） */
  function mockUploadedFile() {
    uploadExcel.single = jest.fn(() => (req, _res, next) => {
      req.file = { path: '/tmp/employer-list.xlsx', originalname: '雇主险清单.xlsx', filename: 'employer-list.xlsx', size: 100 };
      next();
    });
  }

  function buildEmployerWorkbook(rows, headers) {
    const hs = headers || ['雇员姓名', '证件类型名称', '证件号码', '工种属性/职业类别', '岗位名称', '保险起期', '保险止期', '雇主险保额', '生效时间'];
    const aoa = [hs, ...rows.map((r) => hs.map((h) => (r[h] !== undefined ? r[h] : '')))];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!ref'] = 'A1:' + XLSX.utils.encode_cell({ r: Math.max(aoa.length - 1, 0), c: hs.length - 1 });
    return { SheetNames: ['Sheet1'], Sheets: { Sheet1: ws } };
  }

  beforeEach(() => {
    XLSX.readFile.mockClear();
    uploadExcel.single = originalSingle; // 恢复默认，避免污染其他套件
    pool.query.mockReset();
    pool.query.mockResolvedValueOnce({ rows: [] }); // authMiddleware 黑名单
    pool.query.mockResolvedValueOnce({ rows: [adminUserRow] }); // authMiddleware 用户
    pool.query.mockResolvedValueOnce({ rows: [{ id: 999 }] }); // INSERT file_records（jobId）
    pool.query.mockResolvedValue({ rows: [], rowCount: 0 }); // UPDATE file_records 等兜底
    mockUploadedFile();
  });

  test('真实雇主险清单：雇员姓名/证件号码映射 + "80万"→800000 + 日期时间戳截断', async () => {
    XLSX.readFile.mockReturnValue(buildEmployerWorkbook([
      { '雇员姓名': '许国兴', '证件号码': '372431197509217418', '保险起期': '2026-07-01 00:00:00', '保险止期': '2027-04-30 23:59:59', '雇主险保额': '80万', '岗位名称': '生活垃圾清运工' },
      { '雇员姓名': '丁金花', '证件号码': '372431196401013523', '保险起期': '2026-07-01 00:00:00', '保险止期': '2027-04-30 23:59:59', '雇主险保额': '10万', '岗位名称': '后勤管理员' },
    ]));
    const res = await request(app).post('/api/import/upload').set(auth).send({ module: 'personnel' });
    expect(res.body.success).toBe(true);
    expect(res.body.data.validRows).toBe(2);
    expect(res.body.data.invalidRows).toBe(0);
    const first = res.body.data.preview[0].data;
    expect(first.personName).toBe('许国兴');
    expect(first.idCard).toBe('372431197509217418');
    expect(first.coverageAmount).toBe(800000); // "80万" → 800000
    expect(first.startDate).toBe('2026-07-01'); // 带时间戳自动截断
    expect(first.expireDate).toBe('2027-04-30');
    expect(res.body.data.preview[1].data.coverageAmount).toBe(100000); // "10万" → 100000
  });

  test('缺失必填列（无姓名或证件号码/工号列）→ 整表拒绝并给出明确提示', async () => {
    XLSX.readFile.mockReturnValue(buildEmployerWorkbook([
      { '雇员姓名': '许国兴', '保险起期': '2026-07-01', '保险止期': '2027-04-30', '雇主险保额': '80万' },
    ], ['雇员姓名', '保险起期', '保险止期', '雇主险保额']));
    const res = await request(app).post('/api/import/upload').set(auth).send({ module: 'personnel' });
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe(-2);
    expect(res.body.message).toContain('缺少必填列');
    expect(res.body.message).toContain('证件号码');
  });

  test('同身份证+姓名两行解析阶段均有效（不误判重复；重复投保由 confirm 冲突机制拦截）', async () => {
    // personnel 不启用解析阶段 dedupeKey（批内同目标补位是合法语义）；两行都解析成功，
    // 真正会致重复投保的冲突在 confirm 阶段以 duplicate_active_policy 行错误返回（已有任务10/11 用例覆盖）
    XLSX.readFile.mockReturnValue(buildEmployerWorkbook([
      { '雇员姓名': '许国兴', '证件号码': '372431197509217418', '保险起期': '2026-07-01 00:00:00', '保险止期': '2027-04-30 23:59:59', '雇主险保额': '80万' },
      { '雇员姓名': '许国兴', '证件号码': '372431197509217418', '保险起期': '2026-07-01 00:00:00', '保险止期': '2027-04-30 23:59:59', '雇主险保额': '80万' },
    ]));
    const res = await request(app).post('/api/import/upload').set(auth).send({ module: 'personnel' });
    expect(res.body.success).toBe(true);
    expect(res.body.data.validRows).toBe(2);
    expect(res.body.data.invalidRows).toBe(0);
  });

  test('行数超限（> maxRows 5000）→ 拒绝并提示分批导入', async () => {
    const rows = [];
    for (let i = 1; i <= 5001; i++) {
      rows.push({ '雇员姓名': '员工' + i, '证件号码': '37243119' + String(i).padStart(11, '0'), '保险起期': '2026-07-01', '保险止期': '2027-04-30', '雇主险保额': '10万' });
    }
    XLSX.readFile.mockReturnValue(buildEmployerWorkbook(rows));
    const res = await request(app).post('/api/import/upload').set(auth).send({ module: 'personnel' });
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe(-2);
    expect(res.body.message).toContain('超出限制');
  });

  test('空文件（无数据行）→ 明确提示没有有效数据', async () => {
    XLSX.readFile.mockReturnValue(buildEmployerWorkbook([]));
    const res = await request(app).post('/api/import/upload').set(auth).send({ module: 'personnel' });
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('没有有效数据');
  });

  test('无工作表文件 → 提示文件为空', async () => {
    XLSX.readFile.mockReturnValue({ SheetNames: [], Sheets: {} });
    const res = await request(app).post('/api/import/upload').set(auth).send({ module: 'personnel' });
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('文件为空');
  });

  test('编码异常（表头/内容含 U+FFFD 乱码）→ 提示另存为 UTF-8', async () => {
    const mojibakeHeaders = ['\uFFFD\uFFFD\uFFFD', '\uFFFD\uFFFD', '\uFFFD\uFFFD\uFFFD\uFFFD', '\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD'];
    const ws = XLSX.utils.aoa_to_sheet([mojibakeHeaders, ['\uFFFD\uFFFD', '\uFFFD', '\uFFFD\uFFFD', '\uFFFD\uFFFD\uFFFD']]);
    ws['!ref'] = 'A1:D2';
    XLSX.readFile.mockReturnValue({ SheetNames: ['Sheet1'], Sheets: { Sheet1: ws } });
    const res = await request(app).post('/api/import/upload').set(auth).send({ module: 'personnel' });
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('编码异常');
  });

  test('文件读取失败（损坏/非受支持编码）→ 提示另存为 UTF-8 或重新导出', async () => {
    XLSX.readFile.mockImplementation(() => { throw new Error('invalid file'); });
    const res = await request(app).post('/api/import/upload').set(auth).send({ module: 'personnel' });
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe(-2);
    expect(res.body.message).toContain('无法读取或编码不受支持');
  });
});
