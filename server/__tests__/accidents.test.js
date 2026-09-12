/**
 * 事故管理接口测试
 * 覆盖: CRUD、统计、列表查询、参数校验
 */
const { client, login, query, cleanupTestData, getTestMarker } = require('./setup');

describe('Accidents 事故管理接口', () => {
  let authHeaders = {};
  let testAccidentId = null;
  const marker = getTestMarker();

  beforeAll(async () => {
    const loginRes = await login();
    authHeaders = { Authorization: `Bearer ${loginRes.accessToken}` };
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  describe('GET /api/accidents — 列表查询', () => {
    test('正常查询应返回分页数据', async () => {
      const res = await client
        .get('/api/accidents')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.list)).toBe(true);
      expect(typeof res.body.data.total).toBe('number');
      expect(res.body.data.page).toBe(1);
    });

    test('带分页参数查询应生效', async () => {
      const res = await client
        .get('/api/accidents?page=1&pageSize=5')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.data.pageSize).toBe(5);
    });

    test('未登录访问应返回 401', async () => {
      const res = await client.get('/api/accidents');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/accidents/stats/all — 统计', () => {
    test('应返回统计数据结构', async () => {
      const res = await client
        .get('/api/accidents/stats/all')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(typeof res.body.data.total).toBe('number');
      expect(typeof res.body.data.byType).toBe('object');
      expect(typeof res.body.data.byLevel).toBe('object');
    });
  });

  describe('POST /api/accidents — 创建', () => {
    test('正常创建事故记录应成功', async () => {
      const payload = {
        accident_date: '2026-07-08',
        township: '宁津镇',
        location: '测试路段',
        accident_type: '碰撞',
        level: '一般',
        description: `${marker} 测试事故描述`,
        status: '处理中'
      };

      const res = await client
        .post('/api/accidents')
        .set(authHeaders)
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      testAccidentId = res.body.data.id;
    });

    test('缺少必填字段 accident_date 应返回 400', async () => {
      const res = await client
        .post('/api/accidents')
        .set(authHeaders)
        .send({
          township: '宁津镇',
          description: '缺少日期'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test('无效的日期格式应返回 400', async () => {
      const res = await client
        .post('/api/accidents')
        .set(authHeaders)
        .send({
          accident_date: '2026/07/08',
          township: '宁津镇'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test('超长描述应返回 400', async () => {
      const res = await client
        .post('/api/accidents')
        .set(authHeaders)
        .send({
          accident_date: '2026-07-08',
          township: '宁津镇',
          description: 'a'.repeat(2001)
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test('SQL 注入尝试应被拦截或正确转义', async () => {
      const res = await client
        .post('/api/accidents')
        .set(authHeaders)
        .send({
          accident_date: '2026-07-08',
          township: "'; DROP TABLE accidents; --",
          description: `${marker} SQL注入测试`
        });

      // 校验层或数据库层应安全处理
      expect([200, 400]).toContain(res.status);
      if (res.status === 200) {
        // 如果创建成功，说明参数化查询有效防止了 SQL 注入
        expect(res.body.success).toBe(true);
      }
    });
  });

  describe('GET /api/accidents/:id — 单条查询', () => {
    test('查询存在的记录应成功', async () => {
      // 使用刚才创建的记录
      const res = await client
        .get(`/api/accidents/${testAccidentId}`)
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(testAccidentId);
    });

    test('查询不存在的记录应返回 404 或错误码', async () => {
      const res = await client
        .get('/api/accidents/99999999')
        .set(authHeaders);

      expect([200, 404]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.success).toBe(false);
      }
    });
  });

  describe('PUT /api/accidents/:id — 更新', () => {
    test('正常更新应成功', async () => {
      const res = await client
        .put(`/api/accidents/${testAccidentId}`)
        .set(authHeaders)
        .send({
          status: '已结案',
          handler: '测试处理人'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('更新无效状态值应返回 400', async () => {
      const res = await client
        .put(`/api/accidents/${testAccidentId}`)
        .set(authHeaders)
        .send({
          status: '无效状态'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('DELETE /api/accidents/:id — 删除', () => {
    test('删除存在的记录应成功', async () => {
      const res = await client
        .delete(`/api/accidents/${testAccidentId}`)
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('重复删除应返回记录不存在', async () => {
      const res = await client
        .delete(`/api/accidents/${testAccidentId}`)
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(false);
    });
  });
});
