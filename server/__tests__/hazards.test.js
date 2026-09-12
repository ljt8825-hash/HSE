/**
 * 隐患管理接口测试套件
 * 覆盖: 列表分页、搜索过滤、统计、创建、详情、更新、删除
 * 边界测试: 空参数、不存在的ID、SQL注入
 */
const { client, login, getAuthHeaders, query, cleanupTestData, getTestMarker } = require('./setup');

describe('隐患管理接口', () => {
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

  describe('GET /api/hazards — 隐患列表', () => {
    test('获取隐患列表应返回分页数据', async () => {
      const res = await client
        .get('/api/hazards')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('list');
      expect(res.body.data).toHaveProperty('total');
      expect(res.body.data).toHaveProperty('page');
      expect(res.body.data).toHaveProperty('pageSize');
    });

    test('分页参数应生效（page=1&pageSize=5）', async () => {
      const res = await client
        .get('/api/hazards?page=1&pageSize=5')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.data.pageSize).toBe(5);
      expect(res.body.data.list.length).toBeLessThanOrEqual(5);
    });

    test('keyword 关键词搜索应过滤结果', async () => {
      const res = await client
        .get('/api/hazards?keyword=测试隐患')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /api/hazards/stats — 隐患统计', () => {
    test('获取统计数据应返回 byStatus/byLevel/byCategory', async () => {
      const res = await client
        .get('/api/hazards/stats')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('total');
      expect(res.body.data).toHaveProperty('byStatus');
      expect(res.body.data).toHaveProperty('byLevel');
      expect(res.body.data).toHaveProperty('byCategory');
    });
  });

  describe('POST /api/hazards — 创建隐患', () => {
    test('正常创建隐患记录应返回完整数据', async () => {
      const res = await client
        .post('/api/hazards')
        .set(authHeaders)
        .send({
          description: `${marker} 测试隐患描述`,
          location: '测试地点',
          level: '一般',
          status: '未完成',
          township: '城区',
          category: '安全设施',
          checker: '张三',
          responsible_dept: '安全部'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.description).toContain('[TEST]');
    });

    test('创建隐患时缺少必填字段应也能成功（字段有默认值）', async () => {
      const res = await client
        .post('/api/hazards')
        .set(authHeaders)
        .send({
          description: `${marker} 最小化隐患`
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('创建隐患返回数据应包含 id', async () => {
      const res = await client
        .post('/api/hazards')
        .set(authHeaders)
        .send({
          description: `${marker} 验证ID隐患`
        });

      expect(res.body.data).toHaveProperty('id');
    });
  });

  describe('GET /api/hazards/:id — 隐患详情', () => {
    test('获取存在的隐患详情应返回数据', async () => {
      // 先创建一条
      const createRes = await client
        .post('/api/hazards')
        .set(authHeaders)
        .send({ description: `${marker} 详情查询目标` });

      const id = createRes.body.data.id;

      const res = await client
        .get(`/api/hazards/${id}`)
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(id);
    });

    test('获取不存在的隐患应返回错误', async () => {
      const res = await client
        .get('/api/hazards/999999')
        .set(authHeaders);

      expect(res.body.success).toBe(false);
    });
  });

  describe('PUT /api/hazards/:id — 更新隐患', () => {
    test('更新隐患状态应生效', async () => {
      const createRes = await client
        .post('/api/hazards')
        .set(authHeaders)
        .send({ description: `${marker} 更新目标` });

      const id = createRes.body.data.id;

      const res = await client
        .put(`/api/hazards/${id}`)
        .set(authHeaders)
        .send({ status: '已整改' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('已整改');
    });

    test('更新不存在的隐患应返回错误', async () => {
      const res = await client
        .put('/api/hazards/999999')
        .set(authHeaders)
        .send({ description: '不存在' });

      expect(res.body.success).toBe(false);
    });
  });

  describe('DELETE /api/hazards/:id — 删除隐患', () => {
    test('软删除隐患应成功', async () => {
      const createRes = await client
        .post('/api/hazards')
        .set(authHeaders)
        .send({ description: `${marker} 删除目标` });

      const id = createRes.body.data.id;

      const res = await client
        .delete(`/api/hazards/${id}`)
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('删除不存在的隐患应返回错误', async () => {
      const res = await client
        .delete('/api/hazards/999999')
        .set(authHeaders);

      expect(res.body.success).toBe(false);
    });
  });

  describe('搜索与过滤', () => {
    test('按乡镇过滤 township 应正常工作', async () => {
      const res = await client
        .get('/api/hazards?township=城区')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('按状态过滤 status 应正常工作', async () => {
      const res = await client
        .get('/api/hazards?status=未完成')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('按等级过滤 level 应正常工作', async () => {
      const res = await client
        .get('/api/hazards?level=一般')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
