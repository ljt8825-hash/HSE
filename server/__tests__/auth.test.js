/**
 * 认证接口测试套件
 * 覆盖: 登录、登出、获取用户信息、修改密码、个人信息更新
 * 边界测试: 空参数、超长字符串、SQL注入、登录锁定
 */
const { client, login, getAuthHeaders, query, cleanupTestData, getTestMarker } = require('./setup');

describe('Auth 认证接口', () => {
  let authHeaders = {};
  let testUsername = '';

  beforeAll(async () => {
    await login();
    authHeaders = getAuthHeaders();
  });

  afterAll(async () => {
    // 清理测试产生的登录失败记录
    await query("DELETE FROM login_attempts WHERE username = $1", [testUsername]);
  });

  describe('POST /api/auth/login — 登录', () => {
    test('正常登录应返回 Token 和用户信息', async () => {
      const res = await client
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'admin123' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();
      expect(res.body.data.user.username).toBe('admin');
    });

    test('空用户名应返回 400', async () => {
      const res = await client
        .post('/api/auth/login')
        .send({ username: '', password: 'admin123' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test('空密码应返回 400', async () => {
      const res = await client
        .post('/api/auth/login')
        .send({ username: 'admin', password: '' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test('超长用户名（>50字符）应返回 400', async () => {
      const res = await client
        .post('/api/auth/login')
        .send({ username: 'a'.repeat(51), password: 'admin123' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test('SQL 注入字符串应返回 401（不会被当成有效用户）', async () => {
      const res = await client
        .post('/api/auth/login')
        .send({ username: "' OR 1=1 --", password: "' OR 1=1 --" });

      expect([401, 400]).toContain(res.status);
      expect(res.body.success).toBe(false);
    });

    test('不存在的用户名应返回 401', async () => {
      testUsername = 'test_nonexistent_' + Date.now();
      const res = await client
        .post('/api/auth/login')
        .send({ username: testUsername, password: 'wrongpass' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    test('正确用户名 + 错误密码应返回 401', async () => {
      const res = await client
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'wrongpassword123' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    test('连续 5 次错误后账户应被锁定 15 分钟', async () => {
      const lockTestUser = 'test_lock_' + Date.now();
      // 连续产生 5 次失败记录
      for (let i = 0; i < 5; i++) {
        const res = await client
          .post('/api/auth/login')
          .send({ username: lockTestUser, password: 'wrong' });
        // 前5次应返回 401（用户不存在），如果某次返回 423 说明已锁定
        expect([401, 423]).toContain(res.status);
      }

      // 查询当前失败次数
      const countRes = await query(
        "SELECT COUNT(*) as c FROM login_attempts WHERE username = $1 AND success = false AND attempt_time > NOW() - INTERVAL '15 minutes'",
        [lockTestUser]
      );
      const failedCount = parseInt(countRes.rows[0].c);

      // 如果失败次数 >= 5，则下一次应被锁定
      if (failedCount >= 5) {
        const res = await client
          .post('/api/auth/login')
          .send({ username: lockTestUser, password: 'wrong' });
        expect(res.status).toBe(423);
        expect(res.body.message).toContain('锁定');
      }

      // 清理
      await query("DELETE FROM login_attempts WHERE username = $1", [lockTestUser]);
    });
  });

  describe('POST /api/auth/logout — 登出', () => {
    test('正常登出应成功', async () => {
      const res = await client
        .post('/api/auth/logout')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('无 Token 登出应返回 401（需认证）', async () => {
      const res = await client.post('/api/auth/logout');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/auth/current-user — 获取当前用户', () => {
    test('携带有效 Token 应返回用户信息', async () => {
      // 重新登录获取新 token（因为可能已被登出测试加入黑名单）
      const loginRes = await login();
      const headers = { Authorization: `Bearer ${loginRes.accessToken}` };

      const res = await client
        .get('/api/auth/current-user')
        .set(headers);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.username).toBe('admin');
      expect(res.body.data.role).toBeDefined();
    });

    test('未携带 Token 应返回 401', async () => {
      const res = await client.get('/api/auth/current-user');
      expect(res.status).toBe(401);
    });

    test('携带无效 Token 应返回 401', async () => {
      const res = await client
        .get('/api/auth/current-user')
        .set({ Authorization: 'Bearer invalid_token_xyz' });

      expect(res.status).toBe(401);
    });
  });

  describe('PUT /api/auth/change-password — 修改密码', () => {
    test('旧密码错误应返回 400', async () => {
      const loginRes = await login();
      const headers = { Authorization: `Bearer ${loginRes.accessToken}` };

      const res = await client
        .put('/api/auth/change-password')
        .set(headers)
        .send({ oldPassword: 'wrongpass', newPassword: 'NewPass123' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('旧密码');
    });

    test('新密码少于 8 位应返回 400', async () => {
      const loginRes = await login();
      const headers = { Authorization: `Bearer ${loginRes.accessToken}` };

      const res = await client
        .put('/api/auth/change-password')
        .set(headers)
        .send({ oldPassword: 'admin123', newPassword: 'Short1' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      // Zod 校验中间件返回统一错误消息，详细错误在 errors 数组中
      expect(res.body.errors).toBeDefined();
    });

    test('新密码不包含大小写字母和数字应返回 400', async () => {
      const loginRes = await login();
      const headers = { Authorization: `Bearer ${loginRes.accessToken}` };

      const res = await client
        .put('/api/auth/change-password')
        .set(headers)
        .send({ oldPassword: 'admin123', newPassword: 'lowercaseonly' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('PUT /api/auth/profile — 更新个人信息', () => {
    test('空请求体应返回 400', async () => {
      const loginRes = await login();
      const headers = { Authorization: `Bearer ${loginRes.accessToken}` };

      const res = await client
        .put('/api/auth/profile')
        .set(headers)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.errors).toBeDefined();
    });

    test('更新邮箱为无效格式应返回 400', async () => {
      const loginRes = await login();
      const headers = { Authorization: `Bearer ${loginRes.accessToken}` };

      const res = await client
        .put('/api/auth/profile')
        .set(headers)
        .send({ email: 'not-an-email' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test('正常更新个人信息应成功', async () => {
      const loginRes = await login();
      const headers = { Authorization: `Bearer ${loginRes.accessToken}` };

      const res = await client
        .put('/api/auth/profile')
        .set(headers)
        .send({
          realName: '管理员',
          department: '安全部',
          phone: '13800138000'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.realName).toBe('管理员');
    });
  });
});
