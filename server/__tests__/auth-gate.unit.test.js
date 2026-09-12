/**
 * P0 鉴权边界回归测试（全部 mock 数据库，不产生真实连接）
 *
 * 覆盖（提示词 03 任务 9 + 提示词 04 任务 2/3/4/7）：
 *  1. 匿名不能访问 /api/user/info、权限码接口
 *  2. 无效/过期 Token 不会获得临时管理员 Token（开发管理员回退已移除）
 *  3. 合法普通用户不会得到 'all' 或管理员权限；权限码使用库中当前角色
 *  4. 匿名不能调用导入上传/确认/回滚/日志
 *  5. 普通查看者不能调用导入写/读操作（403）
 *  6. 允许角色可进入导入写操作的路由层（业务处理器 mock 阻断）
 *  7. /api/health 匿名/黑名单/禁用/删除 Token 只返回最小字段；有效用户才含认证详情
 *  8. /metrics、/api/postgres/status 矩阵：admin/system_admin 200、viewer 403、匿名 401
 *  9. 黑名单 Token 访问受保护接口 401；黑名单查询异常 fail-closed 503
 * 10. logout：无/伪造 Token 幂等成功；有效 Token 撤销；写入异常不伪装成功
 * 11. refresh：黑名单查询异常 fail-closed 503
 * 12. 保单文件接口：匿名 401 / viewer 403 / 非法名 400 / 不存在 404
 * 13. 公开清单外的接口默认 401
 */
jest.mock('../config/db', () => ({
  pool: { query: jest.fn() },
  isConnected: () => false,
  testConnection: jest.fn(),
}));

const request = require('supertest');
const jwt = require('jsonwebtoken');

const app = require('../app');
const { pool } = require('../config/db');

function signToken(payload, options = {}) {
  return jwt.sign({ type: 'access', ...payload }, process.env.JWT_SECRET, {
    expiresIn: '1h',
    jwtid: 'test-jti-' + Math.random().toString(36).slice(2),
    ...options,
  });
}

function signRefreshToken(payload) {
  return jwt.sign({ type: 'refresh', ...payload }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: '7d',
    jwtid: 'test-rjti-' + Math.random().toString(36).slice(2),
  });
}

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

/**
 * 为带合法 Token 的请求 mock 认证查询序列（authMiddleware）：
 *   1) 黑名单查询 → 空（不在黑名单）
 *   2) 当前用户查询 → 启用用户（checkUser）
 */
function mockAuthenticated(userRow = viewerUserRow) {
  pool.query.mockResolvedValueOnce({ rows: [] });
  pool.query.mockResolvedValueOnce({ rows: [userRow] });
}

describe('P0 鉴权收口', () => {
  beforeEach(() => {
    pool.query.mockReset();
  });

  // ========== 1. 匿名不能访问用户信息与权限码接口 ==========
  test('匿名 GET /api/user/info 应返回 401', async () => {
    const res = await request(app).get('/api/user/info');
    expect(res.statusCode).toBe(401);
  });

  test('匿名 GET /api/access/codes 应返回 401', async () => {
    const res = await request(app).get('/api/access/codes');
    expect(res.statusCode).toBe(401);
  });

  test('匿名 GET /api/auth/codes 应返回 401', async () => {
    const res = await request(app).get('/api/auth/codes');
    expect(res.statusCode).toBe(401);
  });

  // ========== 2. 无效/过期 Token 不获得临时管理员 Token ==========
  test('无效 Token GET /api/user/info 应返回 401，不回退管理员', async () => {
    const res = await request(app)
      .get('/api/user/info')
      .set('Authorization', 'Bearer invalid-token');
    expect(res.statusCode).toBe(401);
  });

  test('过期 Token GET /api/user/info 应返回 401，不回退管理员', async () => {
    const token = signToken({ id: 1, username: 'admin', role: 'admin' }, { expiresIn: '-1s' });
    const res = await request(app)
      .get('/api/user/info')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(401);
  });

  // ========== 3. 合法普通用户不会得到 'all' 或管理员权限 ==========
  test('普通用户 GET /api/user/info 权限不含 all 且角色为 viewer', async () => {
    mockAuthenticated(viewerUserRow); // authMiddleware（黑名单 + 用户）
    pool.query.mockResolvedValueOnce({ rows: [viewerUserRow] }); // vben-compat 用户查询
    const token = signToken({ id: 2, username: 'viewer1', role: 'viewer' });
    const res = await request(app)
      .get('/api/user/info')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.roles).toEqual(['viewer']);
    expect(res.body.data.permissions).toBeDefined();
    expect(res.body.data.permissions).not.toContain('all');
    expect(res.body.data.permissions).not.toContain('*');
  });

  test('普通用户 GET /api/auth/codes 应返回自身角色码而非 admin', async () => {
    mockAuthenticated(viewerUserRow);
    const token = signToken({ id: 2, username: 'viewer1', role: 'viewer' });
    const res = await request(app)
      .get('/api/auth/codes')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toEqual(['viewer']);
  });

  // 权限码使用库中当前角色（Token 中的旧角色不生效）
  test('库中角色已变更（viewer→safety_manager）的 Token 请求 codes 返回当前角色', async () => {
    mockAuthenticated({ ...viewerUserRow, role: 'safety_manager' });
    const token = signToken({ id: 2, username: 'viewer1', role: 'viewer' }); // 旧角色声明
    const res = await request(app)
      .get('/api/auth/codes')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toEqual(['safety_manager']);
  });

  // ========== 4. 匿名不能调用导入接口 ==========
  test('匿名 POST /api/import/upload 应返回 401', async () => {
    const res = await request(app).post('/api/import/upload');
    expect(res.statusCode).toBe(401);
  });

  test('匿名 POST /api/import/parse 应返回 401', async () => {
    const res = await request(app).post('/api/import/parse');
    expect(res.statusCode).toBe(401);
  });

  test('匿名 POST /api/import/confirm 应返回 401', async () => {
    const res = await request(app)
      .post('/api/import/confirm')
      .send({ fileRecordId: 1 });
    expect(res.statusCode).toBe(401);
  });

  test('匿名 POST /api/import/rollback 应返回 401', async () => {
    const res = await request(app)
      .post('/api/import/rollback')
      .send({ jobId: 'job-1' });
    expect(res.statusCode).toBe(401);
  });

  test('匿名 GET /api/import/logs 应返回 401', async () => {
    const res = await request(app).get('/api/import/logs');
    expect(res.statusCode).toBe(401);
  });

  test('匿名 GET /api/import/config 应返回 401', async () => {
    const res = await request(app).get('/api/import/config');
    expect(res.statusCode).toBe(401);
  });

  test('匿名 GET /api/import/stats 应返回 401', async () => {
    const res = await request(app).get('/api/import/stats');
    expect(res.statusCode).toBe(401);
  });

  // ========== 5. 普通查看者不能调用导入操作（读/写均 403） ==========
  test('viewer POST /api/import/confirm 应返回 403', async () => {
    mockAuthenticated(viewerUserRow);
    const token = signToken({ id: 2, username: 'viewer1', role: 'viewer' });
    const res = await request(app)
      .post('/api/import/confirm')
      .set('Authorization', `Bearer ${token}`)
      .send({ fileRecordId: 1 });
    expect(res.statusCode).toBe(403);
  });

  test('viewer GET /api/import/logs 应返回 403', async () => {
    mockAuthenticated(viewerUserRow);
    const token = signToken({ id: 2, username: 'viewer1', role: 'viewer' });
    const res = await request(app)
      .get('/api/import/logs')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(403);
  });

  // ========== 6. 允许角色可进入导入写操作的路由层 ==========
  test('admin POST /api/import/confirm 可进入路由层（非 401/403）', async () => {
    mockAuthenticated(adminUserRow);
    const token = signToken({ id: 1, username: 'admin', role: 'admin' });
    const res = await request(app)
      .post('/api/import/confirm')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    // 缺 fileRecordId → 处理器返回参数错误（200），证明 requireRole 已放行
    expect(res.statusCode).not.toBe(401);
    expect(res.statusCode).not.toBe(403);
  });

  // ========== 7. /api/health 匿名/异常 Token 最小化；有效用户含认证详情 ==========
  test('匿名 GET /api/health 返回 200 且不含 database/memory/ai', async () => {
    const res = await request(app).get('/api/health');
    expect(res.statusCode).toBe(200);
    expect(res.body.data.status).toBe('ok');
    expect(res.body.data).not.toHaveProperty('database');
    expect(res.body.data).not.toHaveProperty('memory');
    expect(res.body.data).not.toHaveProperty('ai');
  });

  test('黑名单 Token GET /api/health 只返回匿名最小字段', async () => {
    const token = signToken({ id: 1, username: 'admin', role: 'admin' });
    pool.query.mockResolvedValueOnce({ rows: [{ jti: 'x' }] }); // 黑名单命中
    const res = await request(app)
      .get('/api/health')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.data).not.toHaveProperty('database');
    expect(res.body.data).not.toHaveProperty('memory');
    expect(res.body.data).not.toHaveProperty('ai');
  });

  test('禁用用户 Token GET /api/health 只返回匿名最小字段', async () => {
    const token = signToken({ id: 9, username: 'disabled', role: 'admin' });
    pool.query.mockResolvedValueOnce({ rows: [] }); // 不在黑名单
    pool.query.mockResolvedValueOnce({ rows: [{ id: 9, username: 'disabled', role: 'admin', real_name: 'x', is_active: false }] }); // 用户已禁用
    const res = await request(app)
      .get('/api/health')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.data).not.toHaveProperty('database');
  });

  test('已删除用户 Token GET /api/health 只返回匿名最小字段', async () => {
    const token = signToken({ id: 999, username: 'ghost', role: 'viewer' });
    pool.query.mockResolvedValueOnce({ rows: [] }); // 不在黑名单
    pool.query.mockResolvedValueOnce({ rows: [] }); // 用户不存在
    const res = await request(app)
      .get('/api/health')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.data).not.toHaveProperty('database');
  });

  test('有效用户 Token GET /api/health 才含认证详情（database/memory/ai 全 mock）', async () => {
    mockAuthenticated(adminUserRow); // 黑名单 + 用户
    pool.query.mockResolvedValueOnce({ rows: [{ now: new Date() }] }); // health 的 SELECT NOW()
    const token = signToken({ id: 1, username: 'admin', role: 'admin' });
    const res = await request(app)
      .get('/api/health')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveProperty('database');
    expect(res.body.data.database.status).toBe('connected');
    expect(res.body.data).toHaveProperty('memory');
    expect(res.body.data).toHaveProperty('ai');
  });

  // ========== 8. /metrics 与 /api/postgres/status 矩阵 ==========
  test('匿名 GET /metrics 应返回 401', async () => {
    const res = await request(app).get('/metrics');
    expect(res.statusCode).toBe(401);
  });

  test('viewer GET /metrics 应返回 403', async () => {
    mockAuthenticated(viewerUserRow);
    const token = signToken({ id: 2, username: 'viewer1', role: 'viewer' });
    const res = await request(app)
      .get('/metrics')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(403);
  });

  test('admin GET /metrics 返回 200 且为 Prometheus 文本', async () => {
    mockAuthenticated(adminUserRow);
    const token = signToken({ id: 1, username: 'admin', role: 'admin' });
    const res = await request(app)
      .get('/metrics')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
  });

  test('system_admin GET /metrics 返回 200', async () => {
    mockAuthenticated({ ...adminUserRow, role: 'system_admin' });
    const token = signToken({ id: 1, username: 'sys', role: 'system_admin' });
    const res = await request(app)
      .get('/metrics')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
  });

  test('匿名 GET /api/postgres/status 应返回 401', async () => {
    const res = await request(app).get('/api/postgres/status');
    expect(res.statusCode).toBe(401);
  });

  test('viewer GET /api/postgres/status 应返回 403', async () => {
    mockAuthenticated(viewerUserRow);
    const token = signToken({ id: 2, username: 'viewer1', role: 'viewer' });
    const res = await request(app)
      .get('/api/postgres/status')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(403);
  });

  test('admin GET /api/postgres/status 返回 200（DB 处理器 mock）', async () => {
    mockAuthenticated(adminUserRow);
    pool.query.mockResolvedValueOnce({
      rows: [{
        version: 'PostgreSQL 17.0 on x86_64',
        current_database: 'test_database',
        pg_postmaster_start_time: new Date(),
        db_size: '1048576',
        table_count: 5,
      }],
    });
    const token = signToken({ id: 1, username: 'admin', role: 'admin' });
    const res = await request(app)
      .get('/api/postgres/status')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.online).toBe(true);
  });

  test('system_admin GET /api/postgres/status 返回 200', async () => {
    mockAuthenticated({ ...adminUserRow, role: 'system_admin' });
    pool.query.mockResolvedValueOnce({
      rows: [{
        version: 'PostgreSQL 17.0 on x86_64',
        current_database: 'test_database',
        pg_postmaster_start_time: new Date(),
        db_size: '1048576',
        table_count: 5,
      }],
    });
    const token = signToken({ id: 1, username: 'sys', role: 'system_admin' });
    const res = await request(app)
      .get('/api/postgres/status')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.online).toBe(true);
  });

  // ========== 9. 黑名单 Token / 黑名单查询异常 ==========
  test('黑名单 Token 访问受保护接口返回 401', async () => {
    const token = signToken({ id: 1, username: 'admin', role: 'admin' });
    pool.query.mockResolvedValueOnce({ rows: [{ jti: 'x' }] }); // 黑名单命中
    const res = await request(app)
      .get('/api/user/info')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(401);
  });

  test('黑名单查询异常时受保护接口 fail-closed 返回 503', async () => {
    const token = signToken({ id: 1, username: 'admin', role: 'admin' });
    pool.query.mockRejectedValueOnce(new Error('db down')); // 黑名单查询异常
    const res = await request(app)
      .get('/api/user/info')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(503);
  });

  // ========== 10. logout 语义 ==========
  test('无 Token 登出幂等成功', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('有效 Token 登出写入黑名单并返回 200', async () => {
    const token = signToken({ id: 1, username: 'admin', role: 'admin' });
    pool.query.mockResolvedValueOnce({ rows: [] }); // authMiddleware 黑名单
    pool.query.mockResolvedValueOnce({ rows: [adminUserRow] }); // authMiddleware 用户
    pool.query.mockResolvedValueOnce({ rows: [] }); // blacklistToken INSERT
    pool.query.mockResolvedValueOnce({ rows: [] }); // auditLog INSERT
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('伪造 Token 登出幂等成功（不写黑名单、不写审计）', async () => {
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', 'Bearer forged.token.value');
    expect(res.statusCode).toBe(200);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('黑名单写入异常时登出返回 500（不伪装成功）', async () => {
    const token = signToken({ id: 1, username: 'admin', role: 'admin' });
    // 认证路径（公开路径可选认证）先消费：黑名单查询 + 用户查询
    pool.query.mockResolvedValueOnce({ rows: [] }); // authMiddleware 黑名单
    pool.query.mockResolvedValueOnce({ rows: [adminUserRow] }); // authMiddleware 用户
    pool.query.mockRejectedValueOnce(new Error('insert failed')); // blacklistToken INSERT 失败
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(500);
    expect(res.body.success).toBe(false);
  });

  // ========== 11. refresh 黑名单查询异常 fail-closed ==========
  test('refresh 黑名单查询异常返回 503', async () => {
    const refreshToken = signRefreshToken({ id: 1, username: 'admin', role: 'admin' });
    pool.query.mockRejectedValueOnce(new Error('db down'));
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken });
    expect(res.statusCode).toBe(503);
  });

  // ========== 12. 保单文件接口（记录 ID 定位；完整矩阵见 insurance-file.unit.test.js） ==========
  test('匿名 GET /api/insurance/policies/1/file 应返回 401', async () => {
    const res = await request(app).get('/api/insurance/policies/1/file');
    expect(res.statusCode).toBe(401);
  });

  test('匿名 GET /api/insurance/other/1/file 应返回 401', async () => {
    const res = await request(app).get('/api/insurance/other/1/file');
    expect(res.statusCode).toBe(401);
  });

  // ========== 13. 公开清单外的接口默认 401 ==========
  test('匿名 POST /api/auth/register 应返回 401（不开放匿名注册）', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'x', password: 'Xx123456', confirmPassword: 'Xx123456' });
    expect(res.statusCode).toBe(401);
  });

  test('匿名 POST /api/auth/debug-login 应返回 401', async () => {
    const res = await request(app)
      .post('/api/auth/debug-login')
      .send({ username: 'admin', password: 'admin123' });
    expect(res.statusCode).toBe(401);
  });

  // ========== 14. /uploads/insurance 静态直链受保护 ==========
  test('匿名 GET /uploads/insurance/xxx.pdf 应返回 401', async () => {
    const res = await request(app).get('/uploads/insurance/example.pdf');
    expect(res.statusCode).toBe(401);
  });
});
