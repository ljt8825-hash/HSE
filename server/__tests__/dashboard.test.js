/**
 * 仪表盘接口测试套件
 * 覆盖: 核心指标、趋势数据、告警列表、历史记录、导出、状态更新
 */
const { client, login, getAuthHeaders, query, cleanupTestData, getTestMarker } = require('./setup');

describe('仪表盘接口', () => {
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

  describe('GET /api/dashboard/metrics — 核心指标', () => {
    test('获取核心指标应返回 6 项指标数组', async () => {
      const res = await client
        .get('/api/dashboard/metrics')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBe(6);
    });

    test('每项指标应包含 key/name/value/unit/changeRate', async () => {
      const res = await client
        .get('/api/dashboard/metrics')
        .set(authHeaders);

      for (const m of res.body.data) {
        expect(m).toHaveProperty('key');
        expect(m).toHaveProperty('name');
        expect(m).toHaveProperty('value');
        expect(m).toHaveProperty('unit');
        expect(m).toHaveProperty('changeRate');
      }
    });

    test('period=week 应返回较上周变化率', async () => {
      const res = await client
        .get('/api/dashboard/metrics?period=week')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.data[0].period).toBe('较上周');
    });

    test('period=month 应返回较上月变化率', async () => {
      const res = await client
        .get('/api/dashboard/metrics?period=month')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.data[0].period).toBe('较上月');
    });
  });

  describe('GET /api/dashboard/trend — 趋势数据', () => {
    test('缺少 metricKey 应返回 400', async () => {
      const res = await client
        .get('/api/dashboard/trend')
        .set(authHeaders);

      expect(res.status).toBe(400);
    });

    test('有效的 metricKey 应返回数据和数组', async () => {
      const res = await client
        .get('/api/dashboard/trend?metricKey=hazards_total')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('metricName');
      expect(res.body.data).toHaveProperty('data');
      expect(Array.isArray(res.body.data.data)).toBe(true);
    });

    test('无效的 metricKey 应返回 400', async () => {
      const res = await client
        .get('/api/dashboard/trend?metricKey=invalid_key')
        .set(authHeaders);

      expect(res.status).toBe(400);
    });

    test('指定日期范围应正常工作', async () => {
      const res = await client
        .get('/api/dashboard/trend?metricKey=accidents_total&startDate=2026-01-01&endDate=2026-07-01')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /api/dashboard/alerts — 告警列表', () => {
    test('获取告警列表应返回分页数据', async () => {
      const res = await client
        .get('/api/dashboard/alerts')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('list');
      expect(res.body.data).toHaveProperty('total');
    });

    test('分页参数应生效', async () => {
      const res = await client
        .get('/api/dashboard/alerts?page=1&pageSize=5')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.data.list.length).toBeLessThanOrEqual(5);
    });
  });

  describe('GET /api/dashboard/history — 历史记录', () => {
    test('获取历史记录应返回分页数据', async () => {
      const res = await client
        .get('/api/dashboard/history')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('list');
      expect(res.body.data).toHaveProperty('total');
    });
  });

  describe('PATCH /api/dashboard/alerts/:id/status — 状态更新', () => {
    test('缺少 status 参数应返回 400', async () => {
      const res = await client
        .patch('/api/dashboard/alerts/1/status')
        .set(authHeaders)
        .send({});

      expect(res.status).toBe(400);
    });

    test('无效状态值应返回 400', async () => {
      const res = await client
        .patch('/api/dashboard/alerts/1/status')
        .set(authHeaders)
        .send({ status: '无效状态' });

      expect(res.status).toBe(400);
    });
  });
});
