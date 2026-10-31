/**
 * A-02e.5-C1 · V1 花名册导入（POST /employees/import/excel）终态防复活闸门 —— 单元测试
 *
 * 被测真实入口：routes/hse-employee/import.js:29 → controllers/hse-import.js:82
 *              → services/employeeImportService.js `importExcelFile()`
 * 本文件只覆盖 V1；V2 由 employee-import-v2-terminal-guard.unit.test.js 独立覆盖，
 * 两入口用**不同 mock 装配**，不允许合并成一套无法区分入口的替身。
 *
 * 性质：纯单元测试。mock 掉 config/db、xlsx、_shared、employeeAssignmentService，
 *      不建立任何数据库连接、不读真实文件。断言「控制流 + 下发的 SQL 形态 + 零副作用」，
 *      **不等于**数据库执行结果；真实库验证属 DB-INT（需单独授权）。
 */

jest.mock('xlsx', () => ({
  readFile: jest.fn(),
  utils: { sheet_to_json: jest.fn() },
  SSF: { parse_date_code: jest.fn(() => null) },
}));

jest.mock('../config/db', () => ({
  pool: { query: jest.fn(), connect: jest.fn() },
  isConnected: jest.fn(() => true),
}));

jest.mock('../routes/hse-employee/_shared', () => ({
  secureEncode: (v) => ({ cipher: v ? `enc:${v}` : null, hash: v ? `hash:${v}` : null }),
}));

jest.mock('../services/employeeAssignmentService', () => ({
  resolveOrgUnitId: jest.fn(async () => ({ orgUnitId: 5, orgPath: '/城区作业中心' })),
}));

const XLSX = require('xlsx');
const { pool } = require('../config/db');
const { isTerminalRelation } = require('../services/employeeStatusDict');
const importService = require('../services/employeeImportService');

// ------------------------------------------------------------
// 装配
// ------------------------------------------------------------

const WRITE_RE = /^\s*(INSERT|UPDATE|DELETE)\b/i;

/** 造一条 Excel 原始行（中文表头）；默认走「所属部门」分支，必然触发任职段写入 */
function makeRow(over = {}) {
  return {
    工号: 'E900',
    姓名: '新员工',
    身份证号: '110101199001011234',
    手机号: '13800000001',
    性别: '男',
    所属部门: '城区作业中心',
    入职日期: '2026-01-05',
    ...over,
  };
}

/**
 * 事务 client 替身：按 SQL 文本分派，记录全部语句。
 * @param {Object} opts
 * @param {Object} [opts.existingByCode] - 工号 → employee 行（含 employment_relation 原值）
 */
function makeClient({ existingByCode = {} } = {}) {
  const calls = [];
  let nextId = 101;
  const query = jest.fn(async (sql, params = []) => {
    const text = String(sql).replace(/\s+/g, ' ').trim();
    calls.push({ text, params });

    if (/^(BEGIN|COMMIT|ROLLBACK|SAVEPOINT|ROLLBACK TO SAVEPOINT|RELEASE SAVEPOINT)/i.test(text)) {
      return { rows: [], rowCount: 0 };
    }
    if (text.includes('FROM employee WHERE employee_code')) {
      const row = existingByCode[params[0]];
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }
    if (text.includes('FROM employee WHERE id_card_hash')) return { rows: [], rowCount: 0 };
    if (text.includes('FROM employee WHERE phone_hash')) return { rows: [], rowCount: 0 };
    if (text.includes('INSERT INTO employee (')) return { rows: [{ id: nextId++ }], rowCount: 1 };
    if (text.includes('UPDATE employee SET')) return { rows: [], rowCount: 1 };
    if (text.includes('FROM hse_org_unit WHERE org_name = $1')) return { rows: [{ id: 5 }], rowCount: 1 };
    // M1-02：writeSegment 要求 INSERT 返回行；curSegRes 读取当前段需返回代表性当前段（B 场景）
    if (text.includes('FROM employee_assignment')) return { rows: [{ id: 7001, employee_id: 7, org_unit_id: 5, position_id: 3, status: 'active' }], rowCount: 1 };
    if (text.includes('UPDATE employee_assignment')) return { rows: [], rowCount: 1 };
    if (text.includes('INSERT INTO employee_assignment')) return { rows: [{ id: 9001 }], rowCount: 1 };
    if (text.includes('INSERT INTO employee_history')) return { rows: [], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  });
  return { query, release: jest.fn(), calls };
}

/** 跑一次导入，返回 { result, calls, writes } */
async function runImport(rows, { existingByCode = {} } = {}) {
  XLSX.readFile.mockReturnValue({ SheetNames: ['Sheet1'], Sheets: { Sheet1: {} } });
  XLSX.utils.sheet_to_json.mockReturnValue(rows);
  const client = makeClient({ existingByCode });
  pool.connect.mockResolvedValue(client);

  const result = await importService.importExcelFile({ tmpFile: 'fake.xlsx', userId: 1 });
  return {
    result,
    calls: client.calls,
    writes: client.calls.filter((c) => WRITE_RE.test(c.text)),
    released: client.release.mock.calls.length,
  };
}

const terminalMessage = (result) => ((result.errors && result.errors[0]) || {}).message || '';

beforeEach(() => {
  jest.clearAllMocks();
  pool.connect.mockReset();
});

// ------------------------------------------------------------
// T1~T3 明确终态 ⇒ 拒绝
// ------------------------------------------------------------

describe('V1 · 明确终态人员（权威关系字段）⇒ 拒绝且零写入', () => {
  const cases = [
    ['辞职', 'T1'],
    ['死亡', 'T2'],
    ['退休', 'T3'],
  ];

  it.each(cases)('关系=%s 的已有员工 → 导入被拒（%s）', async (relation) => {
    const existing = { id: 7, name: '张三', employee_code: 'E001', employment_relation: relation };
    const { result, calls, writes } = await runImport(
      [makeRow({ 工号: 'E001', 姓名: '张三' })],
      { existingByCode: { E001: existing } },
    );

    expect(result.success).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.total).toBe(1);
    expect(terminalMessage(result)).toContain('终态');
    expect(terminalMessage(result)).toContain(relation);

    // 零副作用：无任何 INSERT/UPDATE/DELETE（关旧段、建新段、改员工主表都未发生）
    expect(writes).toEqual([]);
    expect(calls.some((c) => c.text.includes('INSERT INTO employee_assignment'))).toBe(false);
    expect(calls.some((c) => c.text.includes('UPDATE employee_assignment'))).toBe(false);
    // 兜底事务语义：本行 ROLLBACK
    expect(calls.some((c) => c.text === 'ROLLBACK')).toBe(true);
  });

  it('T3-b 判定不依赖任职段状态：终态拒绝时未查询 employee_assignment', async () => {
    const existing = { id: 7, name: '张三', employee_code: 'E001', employment_relation: '退休' };
    const { calls } = await runImport([makeRow({ 工号: 'E001' })], { existingByCode: { E001: existing } });

    expect(calls.some((c) => c.text.includes('FROM employee_assignment'))).toBe(false);
  });

  it('T3-c 关系值首尾空白（"  退休  "）同样识别为终态', async () => {
    const existing = { id: 7, name: '张三', employee_code: 'E001', employment_relation: '  退休  ' };
    const { result, writes } = await runImport([makeRow({ 工号: 'E001' })], { existingByCode: { E001: existing } });

    expect(result.failed).toBe(1);
    expect(writes).toEqual([]);
  });
});

// ------------------------------------------------------------
// T4 NULL 关系不得推断为终态
// ------------------------------------------------------------

describe('V1 · NULL / 空关系不得推断为终态', () => {
  it.each([null, undefined, '', '   '])('关系=%p 的已有员工（旧段已关闭）→ 允许导入，不回填关系字段', async (relation) => {
    const existing = { id: 7, name: '张三', employee_code: 'E001', employment_relation: relation };
    const { result, calls, writes } = await runImport(
      [makeRow({ 工号: 'E001', 姓名: '张三' })],
      { existingByCode: { E001: existing } },
    );

    expect(result.success).toBe(1);
    expect(result.failed).toBe(0);
    // 既有流程未被改变：关旧段 → 建新段
    // M1-02：关段已统一经 writeSegment(ASSIGN)，end_date 改为参数化（$2）而非历史 CASE 表达式
    expect(calls.some((c) => /UPDATE\s+employee_assignment\s+SET\s+is_current\s*=\s*false,\s*end_date\s*=\s*\$2/.test(c.text))).toBe(true);
    expect(calls.some((c) => c.text.includes('INSERT INTO employee_assignment'))).toBe(true);
    // 不补值：没有任何语句写 employment_relation
    expect(writes.some((c) => c.text.includes('employment_relation'))).toBe(false);
  });
});

// ------------------------------------------------------------
// T5 中间状态不得误封
// ------------------------------------------------------------

describe('V1 · 中间状态 / 历史兼容值不得被误判为终态', () => {
  it.each(['待岗', '借调', '停薪留职', '正式员工', '未知历史值'])('关系=%s → 允许导入', async (relation) => {
    const existing = { id: 7, name: '张三', employee_code: 'E001', employment_relation: relation };
    const { result, calls } = await runImport([makeRow({ 工号: 'E001' })], { existingByCode: { E001: existing } });

    expect(result.success).toBe(1);
    expect(result.failed).toBe(0);
    expect(calls.some((c) => c.text.includes('INSERT INTO employee_assignment'))).toBe(true);
  });
});

// ------------------------------------------------------------
// T6 正常流程不变
// ------------------------------------------------------------

describe('V1 · 正常人员既有导入行为保持不变', () => {
  it('正式员工：更新员工主表 → 关旧段 → 建新段；已有员工不重复写 employee_history', async () => {
    const existing = { id: 7, name: '张三', employee_code: 'E001', employment_relation: '正式员工' };
    const { result, calls } = await runImport(
      [makeRow({ 工号: 'E001', 姓名: '张三' })],
      { existingByCode: { E001: existing } },
    );

    expect(result.success).toBe(1);
    const order = calls.map((c) => c.text);
    const iUpdateEmp = order.findIndex((t) => t.includes('UPDATE employee SET'));
    const iCloseSeg = order.findIndex((t) => /UPDATE\s+employee_assignment\s+SET\s+is_current\s*=\s*false/.test(t));
    const iInsertSeg = order.findIndex((t) => t.includes('INSERT INTO employee_assignment'));
    expect(iUpdateEmp).toBeGreaterThan(-1);
    expect(iCloseSeg).toBeGreaterThan(iUpdateEmp);
    expect(iInsertSeg).toBeGreaterThan(iCloseSeg);
    expect(order.some((t) => t.includes('INSERT INTO employee_history'))).toBe(false);
    expect(order.some((t) => t === 'COMMIT')).toBe(true);
    expect(order.some((t) => t === 'ROLLBACK')).toBe(false);
  });

  it('新员工（无匹配）：新增 employee + 建段 + 写入职历史', async () => {
    const { result, calls } = await runImport([makeRow({ 工号: 'E777' })]);

    expect(result.success).toBe(1);
    expect(result.failed).toBe(0);
    const order = calls.map((t) => t.text);
    expect(order.some((t) => t.includes('INSERT INTO employee ('))).toBe(true);
    expect(order.some((t) => t.includes('INSERT INTO employee_assignment'))).toBe(true);
    expect(order.some((t) => t.includes('INSERT INTO employee_history'))).toBe(true);
  });
});

// ------------------------------------------------------------
// T7 混合批次：逐行事务语义不变
// ------------------------------------------------------------

describe('V1 · 混合批次（正常 + 终态）', () => {
  it('逐行事务：终态行失败不影响其它行，结果计数与错误索引正确', async () => {
    const existingByCode = {
      E001: { id: 7, name: '正常甲', employee_code: 'E001', employment_relation: '正式员工' },
      E002: { id: 8, name: '退休乙', employee_code: 'E002', employment_relation: '退休' },
    };
    const { result, calls } = await runImport(
      [
        makeRow({ 工号: 'E001', 姓名: '正常甲' }),
        makeRow({ 工号: 'E002', 姓名: '退休乙', 身份证号: '110101199001011242', 手机号: '13800000002' }),
        makeRow({ 工号: 'E003', 姓名: '新丙', 身份证号: '110101199001011259', 手机号: '13800000003' }),
      ],
      { existingByCode },
    );

    expect(result.total).toBe(3);
    expect(result.success).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].index).toBe(3); // Excel 行号：第 3 条数据行 = 第 4 行
    expect(result.errors[0].message).toContain('终态');

    // 只有 2 次建段（正常甲 + 新丙），终态乙没有建段
    const segInserts = calls.filter((c) => c.text.includes('INSERT INTO employee_assignment'));
    expect(segInserts).toHaveLength(2);
    // 终态乙（id=8）从未出现在任何写语句的参数里
    const writesOnTerminal = calls
      .filter((c) => WRITE_RE.test(c.text))
      .filter((c) => (c.params || []).includes(8));
    expect(writesOnTerminal).toEqual([]);
  });
});

// ------------------------------------------------------------
// T8 重复导入：现有语义（未被本轮改变）
// ------------------------------------------------------------

describe('V1 · 重复导入（现有语义回归锁）', () => {
  it('同一正常员工二次导入：每次关旧段并新建段（既有行为，本轮未改），不因闸门产生额外拒绝', async () => {
    const existingByCode = {
      E001: { id: 7, name: '张三', employee_code: 'E001', employment_relation: '正式员工' },
    };
    const first = await runImport([makeRow({ 工号: 'E001' })], { existingByCode });
    const second = await runImport([makeRow({ 工号: 'E001' })], { existingByCode });

    expect(first.result.success).toBe(1);
    expect(second.result.success).toBe(1);
    expect(first.writes.length).toBe(second.writes.length);
  });

  it('终态员工重复导入：每次都被拒绝且每次零写入（幂等拒绝）', async () => {
    const existingByCode = {
      E001: { id: 7, name: '张三', employee_code: 'E001', employment_relation: '辞职' },
    };
    const first = await runImport([makeRow({ 工号: 'E001' })], { existingByCode });
    const second = await runImport([makeRow({ 工号: 'E001' })], { existingByCode });

    expect(first.result.failed).toBe(1);
    expect(second.result.failed).toBe(1);
    expect(first.writes).toEqual([]);
    expect(second.writes).toEqual([]);
  });
});

// ------------------------------------------------------------
// 判定函数本身（共享出口）
// ------------------------------------------------------------

describe('isTerminalRelation 判定边界', () => {
  it.each([
    ['辞职', true], ['死亡', true], ['退休', true], [' 退休 ', true],
    [null, false], [undefined, false], ['', false], ['   ', false],
    ['待岗', false], ['借调', false], ['停薪留职', false], ['正式员工', false], ['在职', false],
  ])('%p → %p', (input, expected) => {
    expect(isTerminalRelation(input)).toBe(expected);
  });
});
