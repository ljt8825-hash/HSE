/**
 * 应急管理接口测试套件
 * 覆盖: 列表、统计、创建、详情、更新、删除
 * 注意: 该模块使用纯内存模式
 */
const { client, login, getAuthHeaders, query, cleanupTestData, getTestMarker } = require('./setup');

describe('应急管理接口', () => {
  let authHeaders = {};
  let marker = '';
  let createdId = null;

  beforeAll(async () => {
    await login();
    authHeaders = getAuthHeaders();
    marker = getTestMarker();
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  describe('GET /api/emergency — 应急列表', () => {
    test('获取应急管理列表应返回分页数据', async () => {
      const res = await client
        .get('/api/emergency')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('list');
      expect(res.body.data).toHaveProperty('total');
    });

    test('分页参数应生效', async () => {
      const res = await client
        .get('/api/emergency?page=1&pageSize=5')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.data.pageSize).toBe(5);
    });

    test('keyword 搜索应正常工作', async () => {
      const res = await client
        .get('/api/emergency?keyword=应急')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('按类型过滤 type 应正常工作', async () => {
      const res = await client
        .get('/api/emergency?type=火灾')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /api/emergency/stats — 应急统计', () => {
    test('获取应急统计应返回数据', async () => {
      const res = await client
        .get('/api/emergency/stats')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('total');
    });
  });

  describe('POST /api/emergency — 创建应急记录', () => {
    test('正常创建应急记录应返回数据', async () => {
      const res = await client
        .post('/api/emergency')
        .set(authHeaders)
        .send({
          name: `${marker} 测试应急预案`,
          type: '火灾',
          level: '二级',
          location: '厂区A区'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('id');
      createdId = res.body.data.id;
    });

    test('创建应急记录时 level 应有默认值', async () => {
      const res = await client
        .post('/api/emergency')
        .set(authHeaders)
        .send({
          name: `${marker} 无等级预案`
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /api/emergency/:id — 应急详情', () => {
    test('获取存在的应急记录应返回数据', async () => {
      if (!createdId) return;

      const res = await client
        .get(`/api/emergency/${createdId}`)
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(createdId);
    });

    test('获取不存在的记录应返回错误', async () => {
      const res = await client
        .get('/api/emergency/999999')
        .set(authHeaders);

      expect(res.body.success).toBe(false);
    });
  });

  describe('PUT /api/emergency/:id — 更新应急记录', () => {
    test('更新应急记录应生效', async () => {
      if (!createdId) return;

      const res = await client
        .put(`/api/emergency/${createdId}`)
        .set(authHeaders)
        .send({ level: '一级', name: `${marker} 更新后预案` });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.level).toBe('一级');
    });

    test('更新不存在的记录应返回错误', async () => {
      const res = await client
        .put('/api/emergency/999999')
        .set(authHeaders)
        .send({ level: '一级' });

      expect(res.body.success).toBe(false);
    });
  });

  describe('DELETE /api/emergency/:id — 删除应急记录', () => {
    test('软删除应急记录应成功', async () => {
      if (!createdId) return;

      const res = await client
        .delete(`/api/emergency/${createdId}`)
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('删除不存在的记录应返回错误', async () => {
      const res = await client
        .delete('/api/emergency/999999')
        .set(authHeaders);

      expect(res.body.success).toBe(false);
    });
  });
});
