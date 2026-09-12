/**
 * 总览统计接口测试
 * 覆盖: 首页统计数据、健康检查
 */
const { client, login, query } = require('./setup');

describe('Overview 总览统计接口', () => {
  let authHeaders = {};

  beforeAll(async () => {
    const loginRes = await login();
    authHeaders = { Authorization: `Bearer ${loginRes.accessToken}` };
  });

  describe('GET /api/overview — 总览数据', () => {
    test('应返回首页统计结构', async () => {
      const res = await client
        .get('/api/overview/summary')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      // 总览数据结构较为灵活，仅验证基本结构
      expect(typeof res.body.data).toBe('object');
    });

    test('未登录访问应返回 401', async () => {
      const res = await client.get('/api/overview/summary');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/health — 健康检查', () => {
    test('应返回服务正常状态', async () => {
      const res = await client.get('/api/health');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.ping).toBe(1);
    });
  });

  describe('GET /api/postgres/status — 数据库状态', () => {
    test('应返回 PostgreSQL 连接状态', async () => {
      const res = await client
        .get('/api/postgres/status')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(typeof res.body.data.online).toBe('boolean');
      if (res.body.data.online) {
        expect(res.body.data.version).toBeDefined();
        expect(res.body.data.tableCount).toBeGreaterThan(0);
      }
    });
  });
});
