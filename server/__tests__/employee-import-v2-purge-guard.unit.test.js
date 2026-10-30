/**
 * B02-DEC-03.30 · P0-1 数据删除风险隔离 —— 单元测试
 *
 * 被测对象：services/employeeImportV2Service.js 的 clearAll() / clearAllCascade()
 *          以及 routes/hse-employee-import-v2/main.js 的路由绑定。
 *
 * 测试目标（不止于「接口返回错误」）：
 *   1. 两个全量删除函数在**建立数据库连接之前**就被短路 ⇒ 断言 pool.connect 零调用；
 *   2. 拒绝路径**不产生任何 SQL**（含 DELETE / ALTER TABLE DISABLE TRIGGER / BEGIN）
 *      ⇒ 以真实 SQL 记录器为证，而非仅看响应体；
 *   3. 隔离范围精确：只读的 clearAllPreview、软删的 deleteBatch、正常导入端点不受影响；
 *   4. 路由层无别名/变体旁路：写方法中名含 clear 的路径有且仅有两条；
 *   5. 无环境变量覆盖通道：注入疑似启用类 env 后仍被隔离。
 *
 * 性质：纯单元测试。mock config/db、routes/audit、utils/encryption、middleware/upload，
 *      不建连、不读库、不写库、不执行任何真实 SQL。真实库行为验证属 DB-INT，需单独授权。
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

const fs = require('fs');
const path = require('path');

const { pool } = require('../config/db');
const importV2 = require('../services/employeeImportV2Service');

const SERVICE_PATH = path.join(__dirname, '..', 'services', 'employeeImportV2Service.js');
const ROUTE_PATH = path.join(__dirname, '..', 'routes', 'hse-employee-import-v2', 'main.js');
const WRAPPER_PATH = path.join(__dirname, '..', 'routes', 'hse-employee-import-v2.js');
const CONTROLLER_PATH = path.join(__dirname, '..', 'controllers', 'employeeImportV2Controller.js');

const readSrc = (p) => fs.readFileSync(p, 'utf8');

/** 本轮所有「若被真的执行到」就会落进来的 SQL（用于证明执行路径未触达删除逻辑） */
let sqlLog = [];

function makeClient() {
  return {
    query: jest.fn(async (sql) => {
      sqlLog.push(String(sql).replace(/\s+/g, ' ').trim());
      if (/COUNT\(\*\)/i.test(sql)) return { rows: [{ c: '0' }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    }),
    release: jest.fn(),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  sqlLog = [];
  pool.connect.mockResolvedValue(makeClient());
  pool.query.mockResolvedValue({ rows: [], rowCount: 0 });
});

// ============================================================
// A. POST /clear-all：隔离后不可达
// ============================================================
describe('A. clearAll() —— 全量物理清空已被 fail-closed 隔离', () => {
  test('A1 返回错误描述符：__t=json 且 error.code=-1', async () => {
    const r = await importV2.clearAll();
    expect(r.__t).toBe('json');
    expect(r.error).toBeDefined();
    expect(r.error.code).toBe(-1);
  });

  test('A2 提示文案明确声明「已暂停」并说明原因是数据删除风险隔离', async () => {
    const r = await importV2.clearAll();
    expect(typeof r.error.message).toBe('string');
    expect(r.error.message).toContain('已暂停');
    expect(r.error.message).toContain('数据删除风险隔离');
  });

  test('A3 【核心】不建立数据库连接：pool.connect 零调用', async () => {
    await importV2.clearAll();
    expect(pool.connect).not.toHaveBeenCalled();
  });

  test('A4 【核心】不产生任何 SQL：DELETE / BEGIN / 任何语句均未下发', async () => {
    await importV2.clearAll();
    expect(sqlLog).toHaveLength(0);
    expect(pool.query).not.toHaveBeenCalled();
    expect(sqlLog.filter((s) => /^\s*DELETE\b/i.test(s))).toHaveLength(0);
  });

  test('A5 绝不返回成功描述符（防止把拒绝误判为完成清空）', async () => {
    const r = await importV2.clearAll();
    expect(r.payload).toBeUndefined();
    expect(r.message).toBeUndefined();
  });

  test('A6 隔离位于 isConnected() 之前：该函数根本不会被调用', async () => {
    const { isConnected } = require('../config/db');
    isConnected.mockClear();
    const r = await importV2.clearAll();
    // 若隔离在 isConnected 之后，这里会先触发一次 isConnected 调用
    expect(isConnected).not.toHaveBeenCalled();
    expect(r.error.message).toContain('已暂停');
  });
});

// ============================================================
// B. POST /clear-all-cascade：隔离后不可达
// ============================================================
describe('B. clearAllCascade() —— 级联物理清空已被 fail-closed 隔离', () => {
  test('B1 返回错误描述符：error.code=-1', async () => {
    const r = await importV2.clearAllCascade();
    expect(r.__t).toBe('json');
    expect(r.error.code).toBe(-1);
  });

  test('B2 提示文案明确声明已暂停', async () => {
    const r = await importV2.clearAllCascade();
    expect(r.error.message).toContain('已暂停');
  });

  test('B3 【核心】不建立数据库连接：pool.connect 零调用', async () => {
    await importV2.clearAllCascade();
    expect(pool.connect).not.toHaveBeenCalled();
  });

  test('B4 【核心】未执行 ALTER TABLE ... DISABLE TRIGGER USER（级联清空特有副作用）', async () => {
    await importV2.clearAllCascade();
    expect(sqlLog).toHaveLength(0);
    expect(sqlLog.filter((s) => /DISABLE\s+TRIGGER/i.test(s))).toHaveLength(0);
  });

  test('B5 【核心】未按 pg_constraint 枚举子表、未 DELETE 任何表', async () => {
    await importV2.clearAllCascade();
    expect(sqlLog.filter((s) => /pg_constraint/i.test(s))).toHaveLength(0);
    expect(sqlLog.filter((s) => /^\s*DELETE\s+FROM\b/i.test(s))).toHaveLength(0);
  });

  test('B6 未进入「备份表校验」分支（该分支本会先执行一次 COUNT 查询）', async () => {
    await importV2.clearAllCascade();
    expect(sqlLog.filter((s) => /backup_9[78]_/.test(s))).toHaveLength(0);
  });
});

// ============================================================
// C. 隔离范围精确：只读预览未被误伤
// ============================================================
describe('C. 隔离范围精确性', () => {
  test('C1 clearAllPreview 仍会连接数据库（只读端点未被打瘫）', async () => {
    await importV2.clearAllPreview();
    expect(pool.connect).toHaveBeenCalledTimes(1);
  });

  test('C2 clearAllPreview 只下发 SELECT/COUNT，绝不下发 DELETE', async () => {
    await importV2.clearAllPreview();
    expect(sqlLog.length).toBeGreaterThan(0);
    expect(sqlLog.filter((s) => /^\s*DELETE\b/i.test(s))).toHaveLength(0);
    expect(sqlLog.filter((s) => /\b(pg_constraint|COUNT)\b/i.test(s)).length).toBeGreaterThan(0);
  });

  test('C3 clearAllPreview 返回成功描述符（未被隔离开关波及）', async () => {
    const r = await importV2.clearAllPreview();
    expect(r.__t).toBe('json');
    expect(r.error).toBeUndefined();
    expect(r.payload).toBeDefined();
  });
});

// ============================================================
// D. 路由层：无别名、无变体旁路
// ============================================================
describe('D. 路由绑定层不可绕过', () => {
  /** 抽取 main.js 中所有 router.<method>('<path>') 绑定 */
  function extractBindings(src) {
    const re = /router\.(get|post|put|patch|delete)\(\s*'([^']+)'/g;
    const out = [];
    let m;
    while ((m = re.exec(src)) !== null) out.push({ method: m[1].toUpperCase(), path: m[2] });
    return out;
  }

  test('D1 写方法中名含 clear 的路径有且仅有 /clear-all 与 /clear-all-cascade', () => {
    const bindings = extractBindings(readSrc(ROUTE_PATH));
    const writeClear = bindings.filter(
      (b) => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(b.method) && /clear/i.test(b.path)
    );
    expect(writeClear.map((b) => `${b.method} ${b.path}`).sort()).toEqual([
      'POST /clear-all',
      'POST /clear-all-cascade',
    ]);
  });

  test('D2 不存在 /clearAll、/clear_all、/purge 等别名或大小写变体', () => {
    const bindings = extractBindings(readSrc(ROUTE_PATH));
    const paths = bindings.map((b) => b.path);
    expect(paths).not.toContain('/clearAll');
    expect(paths).not.toContain('/clear_all');
    expect(paths).not.toContain('/purge');
    expect(paths.filter((p) => /purge|truncate|wipe/i.test(p))).toHaveLength(0);
  });

  test('D3 两条危险路由均只绑定 requireRole(admin)，未放宽为 safety_manager', () => {
    const src = readSrc(ROUTE_PATH);
    const line1 = src.split('\n').find((l) => l.includes("'/clear-all'"));
    const line2 = src.split('\n').find((l) => l.includes("'/clear-all-cascade'"));
    expect(line1).toBeDefined();
    expect(line2).toBeDefined();
    expect(line1).toContain("requireRole('admin')");
    expect(line1).not.toContain('safety_manager');
    expect(line2).toContain("requireRole('admin')");
    expect(line2).not.toContain('safety_manager');
  });

  test('D4 聚合入口仅做 router.use 挂载，未额外注册任何路由', () => {
    const src = readSrc(WRAPPER_PATH);
    expect(src).toContain("router.use('/', require('./hse-employee-import-v2/main'))");
    expect(src).not.toMatch(/router\.(get|post|put|patch|delete)\(/);
  });

  test('D5 控制器三个清空 handler 均为薄转发，无内联 SQL / 旁路分支', () => {
    const src = readSrc(CONTROLLER_PATH);
    expect(src).toContain('service.clearAll()');
    expect(src).toContain('service.clearAllCascade()');
    expect(src).toContain('service.clearAllPreview()');
    expect(src).not.toMatch(/DELETE\s+FROM/i);
  });
});

// ============================================================
// E. 相邻功能未被破坏（回归）
// ============================================================
describe('E. 正常导入与相邻功能回归', () => {
  test('E1 service 仍完整导出 12 个端点函数（未因隔离删减接口）', () => {
    const expected = [
      'upload', 'batches', 'batchPreview', 'batchPending', 'pendingResolve',
      'batchImport', 'deleteBatch', 'clearAll', 'clearAllPreview', 'clearAllCascade',
      'sourceFiles', 'sourceImport',
    ];
    for (const name of expected) {
      expect(typeof importV2[name]).toBe('function');
    }
    expect(Object.keys(importV2).length).toBe(expected.length);
  });

  test('E2 批次删除仍是软删（SET is_deleted = true），未变成物理删除', async () => {
    await importV2.deleteBatch('B001');
    const sql = sqlLog.join(' | ');
    expect(sql).toMatch(/UPDATE\s+employee_import_batch\s+SET\s+is_deleted\s*=\s*true/i);
    expect(sqlLog.filter((s) => /^\s*DELETE\s+FROM\b/i.test(s))).toHaveLength(0);
  });

  test('E3 批次删除的参数校验分支仍生效（空 batchId 返回 -2，未被隔离开关吞掉）', async () => {
    const r = await importV2.deleteBatch('');
    expect(r.error.code).toBe(-2);
  });

  test('E4 只读批次列表仍会真正连库查询（service 未被整体短路）', async () => {
    pool.query.mockResolvedValue({ rows: [], rowCount: 0 });
    await importV2.batches({});
    expect(pool.query).toHaveBeenCalled();
  });
});

// ============================================================
// F. 无环境变量 / 配置覆盖通道
// ============================================================
describe('F. 隔离不可通过环境变量绕过', () => {
  test('F1 开关为字面量 true，源码中不读取任何 process.env', () => {
    const src = readSrc(SERVICE_PATH);
    expect(src).toContain('const PURGE_ALL_PERMANENTLY_DISABLED = true;');
    // 该常量声明附近不得出现 process.env（避免「配置化开放」）
    const idx = src.indexOf('const PURGE_ALL_PERMANENTLY_DISABLED');
    const around = src.slice(Math.max(0, idx - 1200), idx + 200);
    expect(around).not.toContain('process.env');
    expect(around).not.toMatch(/require\(['"]dotenv['"]\)/);
  });

  test('F2 注入疑似启用类 env 后重新加载模块，仍返回已暂停', async () => {
    const guesses = {
      ALLOW_CLEAR_ALL: 'true',
      ENABLE_PURGE: '1',
      PURGE_ALL_DISABLED: 'false',
      HSE_ALLOW_PURGE_ALL: 'true',
      CLEAR_ALL_ENABLED: 'true',
    };
    const backup = {};
    for (const k of Object.keys(guesses)) {
      backup[k] = process.env[k];
      process.env[k] = guesses[k];
    }

    let isolatedPool = null;
    let promise = null;
    jest.isolateModules(() => {
      const svc = require('../services/employeeImportV2Service');
      const db = require('../config/db');
      isolatedPool = db.pool;
      isolatedPool.connect.mockResolvedValue(makeClient());
      isolatedPool.query.mockResolvedValue({ rows: [], rowCount: 0 });
      promise = Promise.all([svc.clearAll(), svc.clearAllCascade()]);
    });
    const [r1, r2] = await promise;

    for (const k of Object.keys(guesses)) {
      if (backup[k] === undefined) delete process.env[k];
      else process.env[k] = backup[k];
    }

    expect(r1.error.code).toBe(-1);
    expect(r1.error.message).toContain('已暂停');
    expect(r2.error.code).toBe(-1);
    expect(r2.error.message).toContain('已暂停');
    expect(isolatedPool.connect).not.toHaveBeenCalled();
  });

  test('F3 两个函数体内仍保留原删除实现（未删代码，仅前置短路）', () => {
    const src = readSrc(SERVICE_PATH);
    expect(src).toContain("'DELETE FROM employee_assignment'");
    expect(src).toContain("'DELETE FROM employee'");
    expect(src).toContain('DISABLE TRIGGER USER');
  });
});
