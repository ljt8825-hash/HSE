/**
 * 风险管控接口测试套件
 * 覆盖: 列表筛选、统计、创建、详情、更新、删除、批量导入
 */
const { client, login, getAuthHeaders, query, cleanupTestData, getTestMarker } = require('./setup');

describe('风险管控接口', () => {
  let authHeaders = {};
  let marker = '';
  let createdId = null;

  beforeAll(async () => {
    await login();
    authHeaders = getAuthHeaders();
    marker = getTestMarker();
  });

  afterAll(async () => {
    // 清理测试创建的风险记录
    await query("DELETE FROM risk_sources WHERE name LIKE '%[TEST]%' AND is_deleted = false");
  });

  describe('GET /api/risk-control/ — 风险列表', () => {
    test('获取风险记录列表应返回数据', async () => {
      const res = await client
        .get('/api/risk-control/')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
    });

    test('按等级过滤 level 应正常工作', async () => {
      const res = await client
        .get('/api/risk-control/?level=四级')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('按类型过滤 type 应正常工作', async () => {
      const res = await client
        .get('/api/risk-control/?type=火灾')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('keyword 搜索应正常工作', async () => {
      const res = await client
        .get('/api/risk-control/?keyword=风险')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /api/risk-control/stats/all — 全部统计', () => {
    test('获取全部统计应返回 total/byLevel/byType/byArea', async () => {
      const res = await client
        .get('/api/risk-control/stats/all')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('total');
      expect(res.body.data).toHaveProperty('byLevel');
      expect(res.body.data).toHaveProperty('byType');
      expect(res.body.data).toHaveProperty('byArea');
    });
  });

  describe('GET /api/risk-control/stats/level — 按等级统计', () => {
    test('获取按等级统计应返回一级到四级', async () => {
      const res = await client
        .get('/api/risk-control/stats/level')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('一级');
      expect(res.body.data).toHaveProperty('二级');
      expect(res.body.data).toHaveProperty('三级');
      expect(res.body.data).toHaveProperty('四级');
    });
  });

  describe('GET /api/risk-control/stats/type — 按类型统计', () => {
    test('获取按类型统计应返回数据', async () => {
      const res = await client
        .get('/api/risk-control/stats/type')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /api/risk-control/ — 创建风险记录', () => {
    test('正常创建风险记录应返回数据', async () => {
      const res = await client
        .post('/api/risk-control/')
        .set(authHeaders)
        .send({
          name: `${marker} 测试风险源`,
          type: '机械伤害',
          category: '设备设施',
          location: '厂区A区',
          level: '三级',
          measures: '定期检修',
          emergency: '立即停机',
          area: '城区'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('id');
      createdId = res.body.data.id;
    });
  });

  describe('GET /api/risk-control/:id — 风险详情', () => {
    test('获取存在的记录应返回数据', async () => {
      if (!createdId) return;

      const res = await client
        .get(`/api/risk-control/${createdId}`)
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(createdId);
    });

    test('获取不存在的记录应返回错误', async () => {
      const res = await client
        .get('/api/risk-control/999999')
        .set(authHeaders);

      expect(res.body.success).toBe(false);
    });
  });

  describe('PUT /api/risk-control/:id — 更新风险记录', () => {
    test('更新风险等级应生效', async () => {
      if (!createdId) return;

      const res = await client
        .put(`/api/risk-control/${createdId}`)
        .set(authHeaders)
        .send({ level: '二级', measures: '更新后的措施' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('更新不存在的记录应返回错误', async () => {
      const res = await client
        .put('/api/risk-control/999999')
        .set(authHeaders)
        .send({ level: '一级' });

      expect(res.body.success).toBe(false);
    });
  });

  describe('DELETE /api/risk-control/:id — 删除风险记录', () => {
    test('软删除风险记录应成功', async () => {
      if (!createdId) return;

      const res = await client
        .delete(`/api/risk-control/${createdId}`)
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('删除不存在的记录应返回错误', async () => {
      const res = await client
        .delete('/api/risk-control/999999')
        .set(authHeaders);

      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/risk-control/import — 批量导入', () => {
    test('records 非数组应返回错误', async () => {
      const res = await client
        .post('/api/risk-control/import')
        .set(authHeaders)
        .send({ records: 'not_array' });

      expect(res.body.success).toBe(false);
    });

    test('空数组应返回 imported=0', async () => {
      const res = await client
        .post('/api/risk-control/import')
        .set(authHeaders)
        .send({ records: [] });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
