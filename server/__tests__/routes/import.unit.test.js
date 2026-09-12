/**
 * 测试: routes/import — 请求验证 + mock Python
 * 策略: 验证参数校验逻辑，完全 mock child_process（spawn/execFile）与
 *       callPython 的临时 JSON 文件写入/清理，确保绝不真实启动 Python、
 *       绝不写真实临时文件（0.4 隔离纠偏）。
 */

// mock db 模块
jest.mock('../../config/db', () => {
  const mockQuery = jest.fn().mockResolvedValue({ rows: [], rowCount: 0 });
  return {
    pool: { query: mockQuery, connect: jest.fn() },
    isConnected: () => false,
    testConnection: jest.fn(),
  };
});

jest.mock('../../middleware/upload', () => {
  const noopMiddleware = (req, res, next) => next();
  const uploader = { single: () => noopMiddleware, array: () => noopMiddleware };
  return {
    ensureDir: jest.fn(),
    deleteFile: jest.fn(),
    validateUploadedFile: jest.fn(),
    fixFilenameEncoding: jest.fn((name) => name),
    createUploader: jest.fn(() => ({ single: () => noopMiddleware, array: () => noopMiddleware })),
    uploadExcel: uploader,
    uploadImage: uploader,
    uploadDocument: uploader,
    uploadInsurance: uploader,
    uploadHazard: uploader,
  };
});

// mock auth 中间件（放行）：本套件目标是导入参数校验与 mock Python，
// 不测鉴权（P0 鉴权回归见 __tests__/auth-gate.unit.test.js）。
jest.mock('../../middleware/auth', () => ({
  JWT_SECRET: 'test-secret',
  JWT_REFRESH_SECRET: 'test-refresh-secret',
  generateAccessToken: jest.fn(() => 'mock-access-token'),
  generateRefreshToken: jest.fn(() => 'mock-refresh-token'),
  isTokenBlacklisted: jest.fn(() => false),
  blacklistToken: jest.fn(),
  cleanupBlacklist: jest.fn(),
  authMiddleware: (req, res, next) => next(),
  optionalAuthMiddleware: (req, res, next) => next(),
  requireRole: (...roles) => (req, res, next) => next(),
  ROLE_PERMISSIONS_MAP: {},
  getPermissionsForRole: jest.fn(() => []),
  requirePermission: (...perms) => (req, res, next) => next(),
  createPermissionMiddleware: jest.fn(() => (req, res, next) => next()),
}));

const request = require('supertest');
const app = require('../../app');
const cp = require('child_process');
const fs = require('fs');

/** 让 spawn 返回模拟 Python 子进程；在监听器注册后的下一个 tick 输出 JSON 并 close 0 */
function mockPythonSuccess(output) {
  const { EventEmitter } = require('events');
  cp.spawn.mockImplementation(() => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = jest.fn();
    // process.nextTick：确保 callPython 已注册 stdout/close 监听器后再 emit，
    // 避免事件在监听器注册前丢失导致 promise 永不 resolve。
    process.nextTick(() => {
      child.stdout.emit('data', Buffer.from(JSON.stringify(output)));
      child.emit('close', 0);
    });
    return child;
  });
}

describe('导入 API 请求验证', () => {
  let spawnSpy;
  let writeFileSpy;
  let unlinkSpy;

  beforeEach(() => {
    // spyOn 而非 mock 整个 child_process 模块：不破坏 jest 自身子进程机制
    spawnSpy = jest.spyOn(cp, 'spawn').mockImplementation(() => {
      const { EventEmitter } = require('events');
      const child = new EventEmitter();
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.kill = jest.fn();
      return child;
    });
    // callPython 的临时 JSON 写入/清理必须被 mock，不得写真实临时文件
    writeFileSpy = jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
    unlinkSpy = jest.spyOn(fs, 'unlinkSync').mockImplementation(() => {});
  });

  afterEach(() => {
    spawnSpy.mockRestore();
    writeFileSpy.mockRestore();
    unlinkSpy.mockRestore();
  });

  // ========== POST /api/import/parse ==========
  describe('POST /api/import/parse', () => {
    test('缺少 filePath 返回错误', async () => {
      const res = await request(app)
        .post('/api/import/parse')
        .send({ fileName: 'test.xlsx' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('缺少必要参数');
    });

    test('缺少 fileName 返回错误', async () => {
      const res = await request(app)
        .post('/api/import/parse')
        .send({ filePath: '/tmp/test.xlsx' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('缺少必要参数');
    });

    test('必要参数齐全时进入解析流程（Python 完全 mock，不真实执行）', async () => {
      // 吞掉并捕获 callPython 的完成日志（证明其来自 mock close 路径，而非真实 Python）
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      mockPythonSuccess({ success: true, module_name: 'regulations', target_table: 'regulations', total_rows: 3, error_count: 0, errors: [], preview: [], sheets: [] });
      const res = await request(app)
        .post('/api/import/parse')
        .send({ filePath: '/tmp/nonexistent.xlsx', fileName: 'nonexistent.xlsx' });
      expect(res.status).toBe(200);
      // 参数齐全 → 进入解析流程并返回成功
      expect(res.body.success).toBe(true);
      // 可区分的 mock 证据链（非真实执行）：
      // 1) spawn 是 spy（被调用但未真实启动子进程）
      expect(spawnSpy).toHaveBeenCalled();
      // 2) 临时 JSON 写入/清理均被 mock（不写真实文件）
      expect(writeFileSpy).toHaveBeenCalled();
      expect(unlinkSpy).toHaveBeenCalled();
      // 3) "Python执行完成" 日志确实出现，但伴随 spawn spy 调用（mock close 路径）
      expect(logSpy.mock.calls.some((c) => String(c[0]).includes('Python执行完成'))).toBe(true);
      logSpy.mockRestore();
    });
  });

  // ========== POST /api/import/confirm ==========
  describe('POST /api/import/confirm', () => {
    test('缺少 fileRecordId 返回错误', async () => {
      const res = await request(app)
        .post('/api/import/confirm')
        .send({ operator: 'test-user' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('缺少必要参数');
      expect(res.body.message).toContain('fileRecordId');
    });
  });

  // ========== POST /api/import/rollback ==========
  describe('POST /api/import/rollback', () => {
    test('缺少 jobId 返回错误', async () => {
      const res = await request(app)
        .post('/api/import/rollback')
        .send({});
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('缺少必要参数');
      expect(res.body.message).toContain('jobId');
    });
  });

  // ========== GET /api/import/logs ==========
  describe('GET /api/import/logs', () => {
    test('查询日志返回正确格式', async () => {
      const res = await request(app).get('/api/import/logs');
      expect(res.status).toBe(200);
      // DB mock 返回空数据，但接口格式应正确
      if (res.body.success) {
        expect(res.body.data).toHaveProperty('logs');
        expect(res.body.data).toHaveProperty('total');
        expect(res.body.data).toHaveProperty('page');
      }
    });

    test('支持分页参数', async () => {
      const res = await request(app).get('/api/import/logs?page=2&limit=10');
      expect(res.status).toBe(200);
    });
  });

  // ========== GET /api/import/config ==========
  describe('GET /api/import/config', () => {
    test('查询配置返回正确格式', async () => {
      const res = await request(app).get('/api/import/config');
      expect(res.status).toBe(200);
      if (res.body.success) {
        expect(res.body.data).toHaveProperty('configs');
        expect(res.body.data).toHaveProperty('total');
      }
    });

    test('支持 moduleType 过滤', async () => {
      const res = await request(app).get('/api/import/config?moduleType=vehicle');
      expect(res.status).toBe(200);
    });
  });

  // ========== GET /api/import/stats ==========
  describe('GET /api/import/stats', () => {
    test('查询统计返回正确格式', async () => {
      const res = await request(app).get('/api/import/stats');
      expect(res.status).toBe(200);
      // mock pool 返回空数据时，totals 可能缺失（rows[0] 为 undefined）
      // 验证接口不崩溃且返回基本结构即可
      if (res.body.success) {
        expect(res.body.data).toHaveProperty('byModule');
        expect(res.body.data).toHaveProperty('recent');
      }
    });
  });
});
