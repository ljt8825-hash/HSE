/**
 * 现场管理接口测试套件
 * 覆盖: 危险作业/三违管理/消防设备/网格管理/汇总统计
 */
const { client, login, getAuthHeaders, query, cleanupTestData, getTestMarker } = require('./setup');

describe('现场管理接口', () => {
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

  describe('危险作业 /api/site-mgmt/hazardous-work', () => {
    test('获取危险作业列表应返回分页数据', async () => {
      const res = await client
        .get('/api/site-mgmt/hazardous-work')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('list');
    });

    test('创建危险作业应返回数据', async () => {
      const res = await client
        .post('/api/site-mgmt/hazardous-work')
        .set(authHeaders)
        .send({ name: `${marker} 吊装作业`, type: '高处作业', level: '二级' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('id');
    });

    test('获取不存在的危险作业应返回错误', async () => {
      const res = await client
        .get('/api/site-mgmt/hazardous-work/999999')
        .set(authHeaders);

      expect(res.body.success).toBe(false);
    });

    test('更新危险作业应成功', async () => {
      const createRes = await client
        .post('/api/site-mgmt/hazardous-work')
        .set(authHeaders)
        .send({ name: `${marker} 更新目标作业` });

      const res = await client
        .put(`/api/site-mgmt/hazardous-work/${createRes.body.data.id}`)
        .set(authHeaders)
        .send({ status: '已完成' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('删除危险作业应成功', async () => {
      const createRes = await client
        .post('/api/site-mgmt/hazardous-work')
        .set(authHeaders)
        .send({ name: `${marker} 删除目标作业` });

      const res = await client
        .delete(`/api/site-mgmt/hazardous-work/${createRes.body.data.id}`)
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('三违管理 /api/site-mgmt/violations', () => {
    test('获取三违列表应返回数据', async () => {
      const res = await client
        .get('/api/site-mgmt/violations')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('list');
    });

    test('创建三违记录应返回数据', async () => {
      const res = await client
        .post('/api/site-mgmt/violations')
        .set(authHeaders)
        .send({ type: '违章指挥', content: `${marker} 测试三违`, person: '张三' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('消防设备 /api/site-mgmt/fire-equipment', () => {
    test('获取消防设备列表应返回数据', async () => {
      const res = await client
        .get('/api/site-mgmt/fire-equipment')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('list');
    });

    test('创建消防设备应返回数据', async () => {
      const res = await client
        .post('/api/site-mgmt/fire-equipment')
        .set(authHeaders)
        .send({ name: `${marker} 灭火器A`, location: '厂区B区', status: '正常' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('网格管理 /api/site-mgmt/grid-areas', () => {
    test('获取网格列表应返回分页数据', async () => {
      const res = await client
        .get('/api/site-mgmt/grid-areas')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('list');
      expect(res.body.data).toHaveProperty('total');
    });

    test('获取不存在的网格应返回错误', async () => {
      const res = await client
        .get('/api/site-mgmt/grid-areas/999999')
        .set(authHeaders);

      expect(res.body.success).toBe(false);
    });

    test('keyword 搜索网格应正常工作', async () => {
      const res = await client
        .get('/api/site-mgmt/grid-areas?keyword=城区')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('汇总统计 /api/site-mgmt/summary', () => {
    test('获取汇总统计应返回四个维度数据', async () => {
      const res = await client
        .get('/api/site-mgmt/summary')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('hazardousWork');
      expect(res.body.data).toHaveProperty('violations');
      expect(res.body.data).toHaveProperty('fireEquipment');
      expect(res.body.data).toHaveProperty('gridAreas');
    });
  });
});
