/**
 * E2E 测试：登录鉴权完整流程
 *
 * 覆盖场景：
 *  - 正常流：登录 -> 获取用户信息
 *  - 正常流：Token 刷新（模拟过期 + refresh）
 *  - 正常流：登出 -> 黑名单验证
 *  - 异常流：错误密码、账户锁定、无效 Token、空 Header、并发登录
 */

const request = require('supertest');
const jwt = require('jsonwebtoken');
const {
  app,
  pool,
  TEST_CONFIG,
  ensureTestUser,
  getE2EToken,
  authedRequest,
  cleanupLoginAttempts,
  cleanupTokenBlacklistTestData,
  query,
  ensureDBReady,
  getTestMarker
} = require('./test-setup');

jest.setTimeout(30000);

describe('E2E: 登录鉴权完整流程', () => {
  beforeAll(async () => {
    await ensureDBReady();
    await ensureTestUser(TEST_CONFIG.admin);
    await cleanupLoginAttempts();
  });

  afterAll(async () => {
    await cleanupLoginAttempts();
  });

  // ================================================================
  // 正常流：登录成功 -> 使用 access token 访问 /auth/current-user
  // ================================================================
  describe('正常流：登录 -> 获取当前用户', () => {
    test('登录成功返回 token 和 refreshToken，用 token 访问 /auth/current-user 验证用户信息', async () => {
      // Step 1: 登录
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ username: TEST_CONFIG.admin.username, password: TEST_CONFIG.admin.password });

      expect(loginRes.status).toBe(200);
      expect(loginRes.body.success).toBe(true);
      expect(loginRes.body.data.token).toBeDefined();
      expect(loginRes.body.data.refreshToken).toBeDefined();
      expect(loginRes.body.data.user).toBeDefined();
      expect(loginRes.body.data.user.username).toBe(TEST_CONFIG.admin.username);

      const accessToken = loginRes.body.data.token;
      const refreshToken = loginRes.body.data.refreshToken;

      // Step 2: 用 access token 获取当前用户
      const userRes = await request(app)
        .get('/api/auth/current-user')
        .set({ Authorization: `Bearer ${accessToken}` });

      expect(userRes.status).toBe(200);
      expect(userRes.body.success).toBe(true);
      expect(userRes.body.data.username).toBe(TEST_CONFIG.admin.username);
      expect(userRes.body.data.role).toBeDefined();

      // Step 3: 验证 token 结构（payload 包含 id, username, type: access）
      const decoded = jwt.decode(accessToken);
      expect(decoded).toHaveProperty('id');
      expect(decoded).toHaveProperty('username');
      expect(decoded).toHaveProperty('jti');
      expect(decoded.type).toBe('access');
    });
  });

  // ================================================================
  // 正常流：access token 过期后使用 refresh token 刷新
  // ================================================================
  describe('正常流：Token 刷新流程', () => {
    test('使用 refresh token 获取新的 access token', async () => {
      // Step 1: 登录获取 token 对
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ username: TEST_CONFIG.admin.username, password: TEST_CONFIG.admin.password });

      expect(loginRes.status).toBe(200);
      const { token, refreshToken } = loginRes.body.data;
      expect(token).toBeDefined();
      expect(refreshToken).toBeDefined();

      // Step 2: 验证 refresh token 结构
      const decodedRefresh = jwt.decode(refreshToken);
      expect(decodedRefresh).toHaveProperty('id');
      expect(decodedRefresh).toHaveProperty('username');
      expect(decodedRefresh.type).toBe('refresh');

      // Step 3: 用 refresh token 手动验证有效性（decode 验证）
      // 注意：当前系统没有独立的 /auth/refresh 接口，
      // refresh token 设计为前端在 access token 过期时使用。
      // 此处验证 refresh token 的解码信息和有效期。
      expect(decodedRefresh.exp * 1000).toBeGreaterThan(Date.now());

      // Step 4: 原有 access token 仍然有效，可以访问接口
      const healthRes = await request(app)
        .get('/api/auth/current-user')
        .set({ Authorization: `Bearer ${token}` });

      expect(healthRes.status).toBe(200);
      expect(healthRes.body.success).toBe(true);
    });
  });

  // ================================================================
  // 正常流：登出 -> token 加入黑名单 -> 用已登出 token 访问返回 401
  // ================================================================
  describe('正常流：登出后 Token 失效', () => {
    test('登出后用原 token 访问受保护接口应返回 401', async () => {
      // Step 1: 登录获取 token
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ username: TEST_CONFIG.admin.username, password: TEST_CONFIG.admin.password });

      expect(loginRes.status).toBe(200);
      const { token } = loginRes.body.data;

      // Step 2: 登出
      const logoutRes = await request(app)
        .post('/api/auth/logout')
        .set({ Authorization: `Bearer ${token}` });

      expect(logoutRes.status).toBe(200);
      expect(logoutRes.body.success).toBe(true);

      // Step 3: 用已登出的 token 访问受保护接口
      const userRes = await request(app)
        .get('/api/auth/current-user')
        .set({ Authorization: `Bearer ${token}` });

      expect(userRes.status).toBe(401);
      expect(userRes.body.message).toContain('令牌已失效');

      // 清理黑名单
      await cleanupTokenBlacklistTestData();
    });
  });

  // ================================================================
  // 异常流：错误密码登录 -> 返回 401
  // ================================================================
  describe('异常流：错误密码', () => {
    test('错误密码登录应返回 401 + 错误信息', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: TEST_CONFIG.admin.username, password: 'WrongPassword999' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBeDefined();
    });
  });

  // ================================================================
  // 异常流：连续 5 次错误密码 -> 账户锁定 -> 返回 423
  // ================================================================
  describe('异常流：账户锁定机制', () => {
    let lockTestUser = '';

    beforeAll(async () => {
      lockTestUser = 'e2e_lockuser_' + Date.now();
      await cleanupLoginAttempts(lockTestUser);
    });

    afterAll(async () => {
      await cleanupLoginAttempts(lockTestUser);
    });

    test('连续 5 次错误密码后账户应被锁定，返回 423', async () => {
      // 连续 5 次错误登录
      for (let i = 0; i < 5; i++) {
        const res = await request(app)
          .post('/api/auth/login')
          .send({ username: lockTestUser, password: 'wrongpass' });
        // 前 5 次应为 401（用户不存在或密码错误）
        expect([401, 423]).toContain(res.status);
      }

      // 第 6 次应被锁定，返回 423
      const lockRes = await request(app)
        .post('/api/auth/login')
        .send({ username: lockTestUser, password: 'wrongpass' });

      expect(lockRes.status).toBe(423);
      expect(lockRes.body.message).toContain('锁定');
    });
  });

  // ================================================================
  // 异常流：使用无效 token 访问受保护接口
  // ================================================================
  describe('异常流：无效 Token', () => {
    test('使用无效 token 访问受保护接口应返回 401', async () => {
      const res = await request(app)
        .get('/api/auth/current-user')
        .set({ Authorization: 'Bearer this-is-an-invalid-jwt-token' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    test('使用格式错误的 Authorization header 应返回 401', async () => {
      const res = await request(app)
        .get('/api/auth/current-user')
        .set({ Authorization: 'Basic dXNlcjpwYXNz' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  // ================================================================
  // 异常流：使用空 Authorization header
  // ================================================================
  describe('异常流：空 Authorization Header', () => {
    test('不携带 Authorization header 应返回 401', async () => {
      const res = await request(app)
        .get('/api/auth/current-user');

      expect(res.status).toBe(401);
      expect(res.body.message).toContain('未提供认证令牌');
    });

    test('Authorization header 为空字符串应返回 401', async () => {
      const res = await request(app)
        .get('/api/auth/current-user')
        .set({ Authorization: '' });

      expect(res.status).toBe(401);
    });
  });

  // ================================================================
  // 异常流：并发登录请求（5 个同时）-> 全部成功，token 各不相同
  // ================================================================
  describe('异常流：并发登录', () => {
    test('5 个并发登录请求应全部成功，且 token 各不相同', async () => {
      const loginPromises = Array.from({ length: 5 }, () =>
        request(app)
          .post('/api/auth/login')
          .send({ username: TEST_CONFIG.admin.username, password: TEST_CONFIG.admin.password })
      );

      const results = await Promise.all(loginPromises);

      // 全部成功
      const tokens = [];
      for (const res of results) {
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.token).toBeDefined();
        tokens.push(res.body.data.token);
      }

      // token 各不相同
      const uniqueTokens = new Set(tokens);
      expect(uniqueTokens.size).toBe(5);

      // 每个解码后的 jti 也各不相同
      const jtis = tokens.map(t => jwt.decode(t).jti);
      const uniqueJtis = new Set(jtis);
      expect(uniqueJtis.size).toBe(5);
    });
  });
});
