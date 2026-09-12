/**
 * 告警管理接口测试套件
 * 覆盖: 告警列表、统计、详情、处理、解决、导出
 */
const { client, login, getAuthHeaders, query, cleanupTestData, getTestMarker } = require('./setup');

describe('告警管理接口', () => {
  let authHeaders = {};
  let marker = '';

  beforeAll(async () => {
    await login();
    authHeaders = getAuthHeaders();
    marker = getTestMarker();
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  describe('GET /api/alerts — 告警列表', () => {
    test('获取告警列表应返回分页数据', async () => {
      const res = await client
        .get('/api/alerts')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('list');
      expect(res.body.data).toHaveProperty('total');
    });

    test('分页参数应生效', async () => {
      const res = await client
        .get('/api/alerts?page=1&pageSize=5')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.data.list.length).toBeLessThanOrEqual(5);
    });

    test('按级别过滤 level=critical 应正常工作', async () => {
      const res = await client
        .get('/api/alerts?level=critical')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('按状态过滤 status=new 应正常工作', async () => {
      const res = await client
        .get('/api/alerts?status=new')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('keyword 搜索应正常工作', async () => {
      const res = await client
        .get('/api/alerts?keyword=安全')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /api/alerts/stats — 告警统计', () => {
    test('获取告警统计应返回各维度计数', async () => {
      const res = await client
        .get('/api/alerts/stats')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('totalCount');
      expect(res.body.data).toHaveProperty('criticalCount');
      expect(res.body.data).toHaveProperty('warningCount');
      expect(res.body.data).toHaveProperty('infoCount');
      expect(res.body.data).toHaveProperty('processingCount');
      expect(res.body.data).toHaveProperty('resolvedCount');
    });
  });

  describe('GET /api/alerts/:id — 告警详情', () => {
    test('获取不存在的告警应返回 404', async () => {
      const res = await client
        .get('/api/alerts/999999')
        .set(authHeaders);

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/alerts/:id/process — 处理告警', () => {
    test('处理不存在的告警应返回 404', async () => {
      const res = await client
        .post('/api/alerts/999999/process')
        .set(authHeaders)
        .send({ remark: '测试处理' });

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/alerts/:id/resolve — 解决告警', () => {
    test('解决不存在的告警应返回 404', async () => {
      const res = await client
        .post('/api/alerts/999999/resolve')
        .set(authHeaders)
        .send({ remark: '测试解决' });

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/alerts/export — 导出告警', () => {
    test('导出告警应返回 CSV 格式', async () => {
      const res = await client
        .get('/api/alerts/export')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
    });
  });

  describe('搜索与过滤', () => {
    test('日期范围过滤应正常工作', async () => {
      const res = await client
        .get('/api/alerts?startDate=2026-01-01&endDate=2026-12-31')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('多条件组合过滤应正常工作', async () => {
      const res = await client
        .get('/api/alerts?level=warning&status=processing&keyword=隐患')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
