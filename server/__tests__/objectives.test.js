/**
 * 目标职责接口测试套件
 * 覆盖: 安全合同/组织人员/安全责任制/安全投入 四个子模块 CRUD
 */
const { client, login, getAuthHeaders, query, cleanupTestData, getTestMarker } = require('./setup');

describe('目标职责接口', () => {
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

  describe('安全合同 /api/objectives/contract', () => {
    test('获取合同列表应返回分页数据', async () => {
      const res = await client
        .get('/api/objectives/contract')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('list');
      expect(res.body.data).toHaveProperty('total');
    });

    test('创建合同应返回数据', async () => {
      const res = await client
        .post('/api/objectives/contract')
        .set(authHeaders)
        .send({ title: `${marker} 测试安全合同`, party: '甲方' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('id');
    });

    test('获取不存在的合同应返回错误', async () => {
      const res = await client
        .get('/api/objectives/contract/999999')
        .set(authHeaders);

      expect(res.body.success).toBe(false);
    });

    test('更新合同应成功', async () => {
      // 先创建
      const createRes = await client
        .post('/api/objectives/contract')
        .set(authHeaders)
        .send({ title: `${marker} 更新合同目标` });

      const id = createRes.body.data.id;

      const res = await client
        .put(`/api/objectives/contract/${id}`)
        .set(authHeaders)
        .send({ title: `${marker} 更新后合同`, party: '乙方' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('删除合同应成功', async () => {
      const createRes = await client
        .post('/api/objectives/contract')
        .set(authHeaders)
        .send({ title: `${marker} 删除合同目标` });

      const id = createRes.body.data.id;

      const res = await client
        .delete(`/api/objectives/contract/${id}`)
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('组织人员 /api/objectives/org-personnel', () => {
    test('获取组织人员列表应返回数据', async () => {
      const res = await client
        .get('/api/objectives/org-personnel')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('创建组织人员应返回数据', async () => {
      const res = await client
        .post('/api/objectives/org-personnel')
        .set(authHeaders)
        .send({ name: `${marker} 测试人员`, department: '安全部' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('id');
    });

    test('获取不存在的组织人员应返回错误', async () => {
      const res = await client
        .get('/api/objectives/org-personnel/999999')
        .set(authHeaders);

      expect(res.body.success).toBe(false);
    });

    test('更新组织人员应成功', async () => {
      const createRes = await client
        .post('/api/objectives/org-personnel')
        .set(authHeaders)
        .send({ name: `${marker} 更新人员目标` });

      const res = await client
        .put(`/api/objectives/org-personnel/${createRes.body.data.id}`)
        .set(authHeaders)
        .send({ position: '安全管理员' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('删除组织人员应成功', async () => {
      const createRes = await client
        .post('/api/objectives/org-personnel')
        .set(authHeaders)
        .send({ name: `${marker} 删除人员目标` });

      const res = await client
        .delete(`/api/objectives/org-personnel/${createRes.body.data.id}`)
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('安全责任制 /api/objectives/responsibility', () => {
    test('获取责任制列表应返回数据', async () => {
      const res = await client
        .get('/api/objectives/responsibility')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('创建责任制应返回数据', async () => {
      const res = await client
        .post('/api/objectives/responsibility')
        .set(authHeaders)
        .send({ title: `${marker} 安全责任制`, duty: '落实安全责任' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('安全投入 /api/objectives/safety-budget', () => {
    test('获取安全投入列表应返回数据', async () => {
      const res = await client
        .get('/api/objectives/safety-budget')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('创建安全投入应返回数据', async () => {
      const res = await client
        .post('/api/objectives/safety-budget')
        .set(authHeaders)
        .send({ item: `${marker} 安全培训投入`, amount: 50000 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('keyword 搜索应正常工作', async () => {
      const res = await client
        .get('/api/objectives/safety-budget?keyword=培训')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
