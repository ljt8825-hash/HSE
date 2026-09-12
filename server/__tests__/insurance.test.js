/**
 * 保险管理接口测试
 * 覆盖: 车辆保险、人员保险、超龄人员的 CRUD 和统计
 */
const { client, login, query, cleanupTestData, getTestMarker } = require('./setup');

describe('Insurance 保险管理接口', () => {
  let authHeaders = {};
  let testVehicleId = null;
  let testPersonnelId = null;
  const marker = getTestMarker();

  beforeAll(async () => {
    const loginRes = await login();
    authHeaders = { Authorization: `Bearer ${loginRes.accessToken}` };
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  // ==================== 车辆保险 ====================
  describe('GET /api/insurance/vehicle — 车辆保险列表', () => {
    test('正常查询应返回分页数据', async () => {
      const res = await client
        .get('/api/insurance/vehicle')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.list)).toBe(true);
    });

    test('未登录访问应返回 401', async () => {
      const res = await client.get('/api/insurance/vehicle');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/insurance/vehicle/stats — 车辆保险统计', () => {
    test('应返回统计结构', async () => {
      const res = await client
        .get('/api/insurance/vehicle/stats')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(typeof res.body.data.stats).toBe('object');
      expect(typeof res.body.data.stats.total).toBe('number');
    });
  });

  describe('POST /api/insurance/vehicle — 创建车辆保险', () => {
    test('正常创建应成功', async () => {
      const payload = {
        plate: `鲁N${Math.floor(Math.random() * 90000) + 10000}`,
        model: '测试车型',
        owner: '测试车主',
        insurance_type: '交强险',
        insurance_start: '2026-01-01',
        insurance_end: '2026-12-31',
        premium: 1200.50,
        vehicle_type: '洒水车',
        status: '在用',
        remark: `${marker} 车辆保险测试`
      };

      const res = await client
        .post('/api/insurance/vehicle')
        .set(authHeaders)
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      testVehicleId = res.body.data.id;
    });

    test('空车牌号应返回 400', async () => {
      const res = await client
        .post('/api/insurance/vehicle')
        .set(authHeaders)
        .send({
          plate: '',
          insurance_start: '2026-01-01',
          insurance_end: '2026-12-31'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test('无效状态枚举应返回 400', async () => {
      const res = await client
        .post('/api/insurance/vehicle')
        .set(authHeaders)
        .send({
          plate: '鲁NTEST01',
          status: '无效状态',
          insurance_start: '2026-01-01',
          insurance_end: '2026-12-31'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('PUT /api/insurance/vehicle/:id — 更新车辆保险', () => {
    test('正常更新应成功', async () => {
      const res = await client
        .put(`/api/insurance/vehicle/${testVehicleId}`)
        .set(authHeaders)
        .send({
          premium: 1500.00,
          remark: `${marker} 已更新`
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('DELETE /api/insurance/vehicle/:id — 删除车辆保险', () => {
    test('删除应成功', async () => {
      const res = await client
        .delete(`/api/insurance/vehicle/${testVehicleId}`)
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ==================== 人员保险 ====================
  describe('GET /api/insurance/personnel — 人员保险列表', () => {
    test('正常查询应返回分页数据', async () => {
      const res = await client
        .get('/api/insurance/personnel')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.list)).toBe(true);
    });
  });

  describe('GET /api/insurance/personnel/stats — 人员保险统计', () => {
    test('应返回统计结构', async () => {
      const res = await client
        .get('/api/insurance/personnel/stats')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(typeof res.body.data.stats).toBe('object');
    });
  });

  describe('POST /api/insurance/personnel — 创建人员保险', () => {
    test('正常创建应成功', async () => {
      const payload = {
        person_name: '测试人员',
        insurance_type: '工伤保险',
        coverage_amount: 500000,
        premium: 500,
        start_date: '2026-01-01',
        expire_date: '2026-12-31',
        is_current: true,
        remark: `${marker} 人员保险测试`
      };

      const res = await client
        .post('/api/insurance/personnel')
        .set(authHeaders)
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      testPersonnelId = res.body.data.id;
    });

    test('空姓名应返回 400', async () => {
      const res = await client
        .post('/api/insurance/personnel')
        .set(authHeaders)
        .send({
          person_name: '',
          start_date: '2026-01-01',
          expire_date: '2026-12-31'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/insurance/personnel/batch-delete — 批量删除', () => {
    test('正常批量删除应成功', async () => {
      const res = await client
        .post('/api/insurance/personnel/batch-delete')
        .set(authHeaders)
        .send({ ids: [testPersonnelId] });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.deleted).toBeGreaterThanOrEqual(1);
    });

    test('空 ids 数组应返回 400', async () => {
      const res = await client
        .post('/api/insurance/personnel/batch-delete')
        .set(authHeaders)
        .send({ ids: [] });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  // ==================== 超龄人员 ====================
  describe('GET /api/insurance/overage — 超龄人员列表', () => {
    test('正常查询应返回数据', async () => {
      const res = await client
        .get('/api/insurance/overage')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /api/insurance/overage — 创建超龄人员', () => {
    test('正常创建应成功', async () => {
      const payload = {
        name: '测试超龄人员',
        id_card: '370000195001011234',
        gender: '男',
        birth_date: '1950-01-01',
        age: 76,
        dept: '保洁部',
        position: '保洁员',
        hire_date: '2020-01-01',
        control_type: '高危岗位',
        optimize_status: '待处理',
        remark: `${marker} 超龄人员测试`
      };

      const res = await client
        .post('/api/insurance/overage')
        .set(authHeaders)
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('空姓名应返回 400', async () => {
      const res = await client
        .post('/api/insurance/overage')
        .set(authHeaders)
        .send({
          name: ''
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });
});
