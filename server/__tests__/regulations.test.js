/**
 * 规章制度接口测试套件
 * 覆盖: 列表、统计、详情、创建、更新、删除
 */
const { client, login, getAuthHeaders, query, cleanupTestData, getTestMarker } = require('./setup');

describe('规章制度接口', () => {
  let authHeaders = {};
  let marker = '';
  let createdId = null;

  beforeAll(async () => {
    await login();
    authHeaders = getAuthHeaders();
    marker = getTestMarker();
  });

  afterAll(async () => {
    await query("DELETE FROM regulations WHERE name LIKE '%[TEST]%' AND is_deleted = false");
  });

  describe('GET /api/regulations — 规章制度列表', () => {
    test('获取列表应返回分页数据', async () => {
      const res = await client
        .get('/api/regulations')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('list');
      expect(res.body.data).toHaveProperty('total');
    });

    test('分页参数应生效', async () => {
      const res = await client
        .get('/api/regulations?page=1&pageSize=5')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.data.list.length).toBeLessThanOrEqual(5);
    });

    test('keyword 搜索应正常工作', async () => {
      const res = await client
        .get('/api/regulations?keyword=安全')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('按状态过滤 status 应正常工作', async () => {
      const res = await client
        .get('/api/regulations?status=有效')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /api/regulations/stats — 制度统计', () => {
    test('获取统计应返回 total/byStatus/byCategory', async () => {
      const res = await client
        .get('/api/regulations/stats')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('total');
      expect(res.body.data).toHaveProperty('byStatus');
      expect(res.body.data).toHaveProperty('byCategory');
    });
  });

  describe('POST /api/regulations — 创建制度', () => {
    test('正常创建制度应返回数据', async () => {
      const res = await client
        .post('/api/regulations')
        .set(authHeaders)
        .send({
          name: `${marker} 测试制度`,
          category: '安全管理制度',
          version: 'v1.0',
          status: '有效',
          department: '安全部',
          remark: '测试备注'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('id');
      createdId = res.body.data.id;
    });

    test('制度名称为空应返回错误', async () => {
      const res = await client
        .post('/api/regulations')
        .set(authHeaders)
        .send({ name: '' });

      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/regulations/:id — 制度详情', () => {
    test('获取存在的制度应返回数据', async () => {
      if (!createdId) return;

      const res = await client
        .get(`/api/regulations/${createdId}`)
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(createdId);
    });

    test('获取不存在的制度应返回错误', async () => {
      const res = await client
        .get('/api/regulations/999999')
        .set(authHeaders);

      expect(res.body.success).toBe(false);
    });
  });

  describe('PUT /api/regulations/:id — 更新制度', () => {
    test('更新制度版本应生效', async () => {
      if (!createdId) return;

      const res = await client
        .put(`/api/regulations/${createdId}`)
        .set(authHeaders)
        .send({ version: 'v2.0', status: '修订中' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('更新不存在的制度应返回错误', async () => {
      const res = await client
        .put('/api/regulations/999999')
        .set(authHeaders)
        .send({ version: 'v3.0' });

      expect(res.body.success).toBe(false);
    });
  });

  describe('DELETE /api/regulations/:id — 删除制度', () => {
    test('软删除制度应成功', async () => {
      if (!createdId) return;

      const res = await client
        .delete(`/api/regulations/${createdId}`)
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('删除不存在的制度应返回错误', async () => {
      const res = await client
        .delete('/api/regulations/999999')
        .set(authHeaders);

      expect(res.body.success).toBe(false);
    });
  });
});
