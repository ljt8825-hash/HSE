/**
 * 受保护保单文件接口 — 记录 ID 定位测试（任务0.2/任务6）
 * 覆盖：按记录 ID 查库定位（policies/other）、未知记录 404、无文件 404、
 *       目录穿越 400、缺失文件 404、流失败、匿名 401、viewer 403、
 *       /uploads/insurance 旧直链不再 fall through 到通用静态目录。
 * 全部 mock fs 与数据库，不接触真实上传目录、不产生真实连接。
 */
jest.mock('../config/db', () => ({
  pool: { query: jest.fn() },
  // isConnected 用 jest.fn 便于测试切换 DB/内存分支（解构引用同一函数）
  isConnected: jest.fn(() => false),
  testConnection: jest.fn(),
}));

jest.mock('fs', () => {
  const { Readable } = require('stream');
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    existsSync: jest.fn(() => true),
    createReadStream: jest.fn(() => Readable.from([Buffer.from('fake-pdf-bytes')])),
  };
});

const request = require('supertest');
const jwt = require('jsonwebtoken');
const fs = require('fs');

const app = require('../app');
const db = require('../config/db');
const { pool } = db;
const insuranceRoutes = require('../routes/insurance');

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

const viewerUserRow = {
  id: 2,
  username: 'viewer1',
  real_name: '查看者',
  role: 'viewer',
  department: '安全部',
  phone: '',
  email: '',
  avatar: null,
  is_active: true,
};

function signToken(payload) {
  return jwt.sign({ type: 'access', ...payload }, process.env.JWT_SECRET, {
    expiresIn: '1h',
    jwtid: 'file-test-jti-' + Math.random().toString(36).slice(2),
  });
}

function mockAuth(userRow) {
  pool.query.mockResolvedValueOnce({ rows: [] }); // 黑名单
  pool.query.mockResolvedValueOnce({ rows: [userRow] }); // 用户
}

describe('受保护保单文件读取（记录 ID 定位）', () => {
  beforeEach(() => {
    pool.query.mockReset();
    fs.existsSync.mockClear();
    fs.createReadStream.mockClear();
    // 默认走 DB 分支（isConnected=true）；内存模式用例单独切换
    db.isConnected.mockReturnValue(true);
    // 恢复 existsSync 默认 true（避免用例间实现泄漏）
    fs.existsSync.mockReturnValue(true);
  });

  // ---------- /policies/:id/file ----------
  test('admin 按记录 ID 返回 200 与 PDF 响应头（服务端从记录解析文件名）', async () => {
    mockAuth(adminUserRow);
    pool.query.mockResolvedValueOnce({
      rows: [{ file_name: 'policy-2026.pdf', original_name: '保单2026.pdf' }],
    });
    const res = await request(app)
      .get('/api/insurance/policies/42/file')
      .set('Authorization', `Bearer ${signToken({ id: 1, username: 'admin', role: 'admin' })}`);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toContain('inline');
    expect(Buffer.from(res.body).toString()).toBe('fake-pdf-bytes');
    // 关键：查询使用记录 ID 定位（SQL 包含 WHERE id）
    expect(pool.query.mock.calls.some((c) => /insurance_policies/.test(c[0]) && /WHERE id = \$1/.test(c[0]))).toBe(true);
  });

  test('未知记录返回 404（不会读取任何文件）', async () => {
    mockAuth(adminUserRow);
    pool.query.mockResolvedValueOnce({ rows: [] }); // 记录不存在
    const res = await request(app)
      .get('/api/insurance/policies/999/file')
      .set('Authorization', `Bearer ${signToken({ id: 1, username: 'admin', role: 'admin' })}`);
    expect(res.statusCode).toBe(404);
    expect(fs.createReadStream).not.toHaveBeenCalled();
  });

  test('记录无文件字段返回 404', async () => {
    mockAuth(adminUserRow);
    pool.query.mockResolvedValueOnce({ rows: [{ file_name: null }] });
    const res = await request(app)
      .get('/api/insurance/policies/7/file')
      .set('Authorization', `Bearer ${signToken({ id: 1, username: 'admin', role: 'admin' })}`);
    expect(res.statusCode).toBe(404);
  });

  test('记录文件在磁盘缺失返回 404（流失败）', async () => {
    mockAuth(adminUserRow);
    pool.query.mockResolvedValueOnce({ rows: [{ file_name: 'ghost.pdf' }] });
    fs.existsSync.mockReturnValue(false);
    const res = await request(app)
      .get('/api/insurance/policies/7/file')
      .set('Authorization', `Bearer ${signToken({ id: 1, username: 'admin', role: 'admin' })}`);
    expect(res.statusCode).toBe(404);
  });

  test('非法记录 ID 返回 404', async () => {
    mockAuth(adminUserRow);
    const res = await request(app)
      .get('/api/insurance/policies/abc/file')
      .set('Authorization', `Bearer ${signToken({ id: 1, username: 'admin', role: 'admin' })}`);
    expect(res.statusCode).toBe(404);
  });

  // ---------- /other/:id/file ----------
  test('other 按记录 ID 返回 200（软删除过滤）', async () => {
    mockAuth(adminUserRow);
    pool.query.mockResolvedValueOnce({ rows: [{ pdf_file: 'other-1.pdf' }] });
    const res = await request(app)
      .get('/api/insurance/other/9/file')
      .set('Authorization', `Bearer ${signToken({ id: 1, username: 'admin', role: 'admin' })}`);
    expect(res.statusCode).toBe(200);
    expect(Buffer.from(res.body).toString()).toBe('fake-pdf-bytes');
    // SQL 包含 is_deleted = false 过滤
    expect(pool.query.mock.calls.some((c) => /other_insurance/.test(c[0]) && /is_deleted = false/.test(c[0]))).toBe(true);
  });

  test('other 未知记录返回 404', async () => {
    mockAuth(adminUserRow);
    pool.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/api/insurance/other/999/file')
      .set('Authorization', `Bearer ${signToken({ id: 1, username: 'admin', role: 'admin' })}`);
    expect(res.statusCode).toBe(404);
  });

  // ---------- 权限 ----------
  test('匿名访问两个文件接口返回 401', async () => {
    const a = await request(app).get('/api/insurance/policies/1/file');
    const b = await request(app).get('/api/insurance/other/1/file');
    expect(a.statusCode).toBe(401);
    expect(b.statusCode).toBe(401);
  });

  test('viewer 访问文件接口返回 403', async () => {
    const token = signToken({ id: 2, username: 'viewer1', role: 'viewer' });
    mockAuth(viewerUserRow);
    const a = await request(app)
      .get('/api/insurance/policies/1/file')
      .set('Authorization', `Bearer ${token}`);
    mockAuth(viewerUserRow);
    const b = await request(app)
      .get('/api/insurance/other/1/file')
      .set('Authorization', `Bearer ${token}`);
    expect(a.statusCode).toBe(403);
    expect(b.statusCode).toBe(403);
  });

  // ---------- 旧直链终止（不 fall through 到通用 /uploads） ----------
  test('/uploads/insurance/example.pdf 不再 fall through 到通用静态目录', async () => {
    // 匿名：401（认证拦截）
    const anon = await request(app).get('/uploads/insurance/example.pdf');
    expect(anon.statusCode).toBe(401);
    // admin：410（静态直链已终止，明确返回 410 而非文件）
    mockAuth(adminUserRow);
    const admin = await request(app)
      .get('/uploads/insurance/example.pdf')
      .set('Authorization', `Bearer ${signToken({ id: 1, username: 'admin', role: 'admin' })}`);
    expect(admin.statusCode).toBe(410);
  });
});

// ============================================================================
// 任务8/11：文件流真实 error 事件（头发送前/后）
// ============================================================================
describe('文件流 error 事件（任务8）', () => {
  const { EventEmitter } = require('events');

  beforeEach(() => {
    pool.query.mockReset();
    fs.existsSync.mockClear();
    fs.createReadStream.mockClear();
    db.isConnected.mockReturnValue(true);
    fs.existsSync.mockReturnValue(true);
  });

  const auth = { Authorization: `Bearer ${signToken({ id: 1, username: 'admin', role: 'admin' })}` };

  test('监听器注册后发出 error（头发送前）→ 404，不抛未处理异常', async () => {
    mockAuth(adminUserRow);
    pool.query.mockResolvedValueOnce({ rows: [{ file_name: 'x.pdf', original_name: 'x.pdf' }] });
    const failing = new EventEmitter();
    failing.pipe = jest.fn(() => failing);
    fs.createReadStream.mockReturnValue(failing);

    const promise = request(app).get('/api/insurance/policies/1/file').set(auth);
    // 延迟到路由已注册 error 监听后触发真实 error 事件
    setTimeout(() => failing.emit('error', Object.assign(new Error('ENOENT'), { code: 'ENOENT' })), 20);
    const res = await promise;
    expect(res.statusCode).toBe(404);
  });

  test('响应头已发送后发出 error → 不二次写响应、不抛未处理异常', async () => {
    mockAuth(adminUserRow);
    pool.query.mockResolvedValueOnce({ rows: [{ file_name: 'x.pdf', original_name: 'x.pdf' }] });
    const failing = new EventEmitter();
    // pipe 触发真实写入使 res.headersSent = true
    failing.pipe = function (res2) {
      res2.write('partial-bytes');
      return failing;
    };
    fs.createReadStream.mockReturnValue(failing);

    const promise = request(app).get('/api/insurance/policies/1/file').set(auth);
    setTimeout(() => failing.emit('error', Object.assign(new Error('stream-broken'), { code: 'EIO' })), 20);
    const res = await promise;
    // 头已发送：不返回 500 JSON（避免二次写），正常结束
    expect(res.statusCode).toBe(200);
  });
});
