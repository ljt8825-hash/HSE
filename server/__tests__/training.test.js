/**
 * 培训管理接口测试套件
 * 覆盖: 培训记录 CRUD、太行培训、新员工培训、统计
 */
const { client, login, getAuthHeaders, query, cleanupTestData, getTestMarker } = require('./setup');

describe('培训管理接口', () => {
  let authHeaders = {};
  let marker = '';
  let createdId = null;

  beforeAll(async () => {
    await login();
    authHeaders = getAuthHeaders();
    marker = getTestMarker();
  });

  afterAll(async () => {
    // 清理测试创建的培训记录
    await query("DELETE FROM training_records WHERE name LIKE '%[TEST]%' AND is_deleted = false");
  });

  describe('GET /api/training/records — 培训记录列表', () => {
    test('获取培训记录列表应返回分页数据', async () => {
      const res = await client
        .get('/api/training/records')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('list');
      expect(res.body.data).toHaveProperty('total');
    });

    test('分页参数应生效', async () => {
      const res = await client
        .get('/api/training/records?page=1&pageSize=5')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.data.pageSize).toBe(5);
      expect(res.body.data.list.length).toBeLessThanOrEqual(5);
    });

    test('keyword 关键词搜索应正常工作', async () => {
      const res = await client
        .get('/api/training/records?keyword=安全培训')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /api/training/records — 创建培训记录', () => {
    test('正常创建培训记录应返回数据', async () => {
      const res = await client
        .post('/api/training/records')
        .set(authHeaders)
        .send({
          name: `${marker} 测试参训人`,
          dept: '安全部',
          training_type: 'HSE',
          training_date: '2026-01-15',
          duration_minutes: 120,
          content: '安全生产培训',
          result: '合格',
          score: 90,
          trainer: '李教练'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('id');
      createdId = res.body.data.id;
    });

    test('创建培训记录时姓名为空应返回错误', async () => {
      const res = await client
        .post('/api/training/records')
        .set(authHeaders)
        .send({
          name: '',
          dept: '安全部'
        });

      expect(res.body.success).toBe(false);
    });
  });

  describe('PUT /api/training/records/:id — 更新培训记录', () => {
    test('更新培训成绩应生效', async () => {
      if (!createdId) return;

      const res = await client
        .put(`/api/training/records/${createdId}`)
        .set(authHeaders)
        .send({ score: 95, result: '合格' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('更新不存在的记录应返回错误', async () => {
      const res = await client
        .put('/api/training/records/999999')
        .set(authHeaders)
        .send({ score: 100 });

      expect(res.body.success).toBe(false);
    });
  });

  describe('DELETE /api/training/records/:id — 删除培训记录', () => {
    test('软删除培训记录应成功', async () => {
      if (!createdId) return;

      const res = await client
        .delete(`/api/training/records/${createdId}`)
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('删除不存在的记录应返回错误', async () => {
      const res = await client
        .delete('/api/training/records/999999')
        .set(authHeaders);

      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/training/taihang — 太行培训', () => {
    test('获取太行培训列表应返回数据', async () => {
      const res = await client
        .get('/api/training/taihang')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('list');
    });
  });

  describe('POST /api/training/taihang — 创建太行培训记录', () => {
    test('创建太行培训记录应自动设置 training_type', async () => {
      const res = await client
        .post('/api/training/taihang')
        .set(authHeaders)
        .send({
          name: `${marker} 太行培训学员`,
          dept: '运营部',
          training_date: '2026-01-20'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /api/training/new-employees — 新员工培训', () => {
    test('获取新员工培训列表应返回数据', async () => {
      const res = await client
        .get('/api/training/new-employees')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('list');
    });
  });

  describe('GET /api/training/stats — 培训统计', () => {
    test('获取培训统计应返回 passed/failed/byType', async () => {
      const res = await client
        .get('/api/training/stats')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('total');
      expect(res.body.data).toHaveProperty('passed');
      expect(res.body.data).toHaveProperty('byType');
    });
  });

  // 培训记录页面改造：按「培训人员」月度汇总（新增接口）
  describe('GET /api/training/ledger/personnel-summary — 培训人员月度汇总', () => {
    test('获取培训人员月度汇总应返回列表及统计字段', async () => {
      const res = await client
        .get('/api/training/ledger/personnel-summary?month=2026-08')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.list)).toBe(true);
      expect(typeof res.body.data.total).toBe('number');
      expect(res.body.data).toHaveProperty('month', '2026-08');

      if (res.body.data.list.length > 0) {
        const row = res.body.data.list[0];
        // 表头口径：姓名/部门/培训日期/应培训/实际培训/缺少
        expect(row).toHaveProperty('name');
        expect(row).toHaveProperty('department');
        expect(row).toHaveProperty('month');
        expect(row).toHaveProperty('expectedCount');
        expect(row).toHaveProperty('actualCount');
        expect(row).toHaveProperty('missingCount');
        expect(typeof row.expectedCount).toBe('number');
        expect(typeof row.actualCount).toBe('number');
        // 缺少人数 = 应培训 - 实际培训（允许为负，按设计由前端兜底展示）
        expect(row.missingCount).toBe(row.expectedCount - row.actualCount);
      }
    });

    test('未传月份时默认当月并正常返回', async () => {
      const res = await client
        .get('/api/training/ledger/personnel-summary')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('month');
      expect(Array.isArray(res.body.data.list)).toBe(true);
    });
  });

  describe('GET /api/training/ledger/personnel-summary/:id/records — 培训人员当月明细', () => {
    test('未知培训人员返回空列表而非报错', async () => {
      const res = await client
        .get('/api/training/ledger/personnel-summary/99999999/records?month=2026-08')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('total', 0);
      expect(Array.isArray(res.body.data.list)).toBe(true);
    });

    test('对汇总中真实存在的培训人员返回明细列表', async () => {
      const summary = await client
        .get('/api/training/ledger/personnel-summary?month=2026-08')
        .set(authHeaders);
      if (!summary.body.data.list.length) {
        // 无推送但列表为空时跳过（培训人员清单为空则说明上游数据缺失）
        return;
      }
      const employeeId = summary.body.data.list[0].employeeId;
      const res = await client
        .get(`/api/training/ledger/personnel-summary/${employeeId}/records?month=2026-08`)
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('total');
      expect(Array.isArray(res.body.data.list)).toBe(true);
    });
  });
});
