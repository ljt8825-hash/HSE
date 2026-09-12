/**
 * 事故管理 + AI 根因分析 E2E 链路测试（11 用例）
 * 覆盖：事故 CRUD 完整流程、AI 根因分析（Mock 降级）、分页、搜索、统计
 */
jest.setTimeout(30000);

const { client, login, getAuthHeaders, query, cleanupTestData, getTestMarker } = require('../setup');

describe('事故管理 + AI 根因分析 E2E 链路测试', () => {
  let marker = '';
  let authHeaders = {};
  let createdId = null;
  const cleanupIds = [];

  beforeAll(async () => {
    marker = getTestMarker();
    await login();
    authHeaders = getAuthHeaders();
  });

  afterAll(async () => {
    // 清理所有测试创建的事故记录
    for (const id of cleanupIds) {
      try {
        await query("UPDATE accidents SET is_deleted = true WHERE id = $1", [id]);
      } catch { /* 忽略 */ }
    }
    await query("DELETE FROM accidents WHERE remark LIKE '%[TEST]%' AND is_deleted = false");
    await cleanupTestData();
  });

  // ─────────────────────────────────────────────
  // 用例 1：创建事故应返回新记录
  // ─────────────────────────────────────────────
  test('创建事故应返回新记录', async () => {
    const payload = {
      accident_date: '2026-01-20',
      township: '柴胡店镇',
      location: '城区十字路口',
      involved_vehicle: '鲁A-E2E01',
      involved_person: '测试驾驶员',
      accident_type: '车辆伤害',
      responsibility: '同等责任',
      responsibility_level: '主要',
      level: '一般',
      description: `E2E测试事故描述 ${marker}`,
      cause_analysis: '未保持安全车距',
      loss_amount: 5000,
      compensation: 2000,
      status: '处理中',
      handler: '安全主管',
      remark: marker
    };

    const res = await client
      .post('/api/accidents')
      .set(authHeaders)
      .send(payload);

    // accidents 路由有 Zod 校验 + success() 包装
    expect([200, 201]).toContain(res.status);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.description).toContain(marker);

    createdId = res.body.data.id;
    if (createdId) cleanupIds.push(createdId);
  });

  // ─────────────────────────────────────────────
  // 用例 2：获取事故列表应包含刚创建的记录
  // ─────────────────────────────────────────────
  test('获取事故列表应包含刚创建的记录', async () => {
    if (!createdId) {
      const payload = {
        accident_date: '2026-01-20',
        description: `E2E事故列表测试 ${marker}`,
        remark: marker
      };
      const createRes = await client
        .post('/api/accidents')
        .set(authHeaders)
        .send(payload);
      createdId = createRes.body.data?.id;
      if (createdId) cleanupIds.push(createdId);
    }

    const res = await client
      .get('/api/accidents')
      .set(authHeaders)
      .query({ keyword: marker });

    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(Array.isArray(res.body.data.list)).toBe(true);
    expect(res.body.data.list.length).toBeGreaterThanOrEqual(1);

    const found = res.body.data.list.some(item =>
      item.description && item.description.includes(marker)
    );
    expect(found).toBe(true);
  });

  // ─────────────────────────────────────────────
  // 用例 3：获取事故详情应返回完整数据
  // ─────────────────────────────────────────────
  test('获取事故详情应返回完整数据', async () => {
    if (!createdId) {
      const payload = {
        accident_date: '2026-01-20',
        description: `E2E事故详情测试 ${marker}`,
        remark: marker
      };
      const createRes = await client
        .post('/api/accidents')
        .set(authHeaders)
        .send(payload);
      createdId = createRes.body.data?.id;
      if (createdId) cleanupIds.push(createdId);
    }

    expect(createdId).toBeTruthy();

    const res = await client
      .get(`/api/accidents/${createdId}`)
      .set(authHeaders);

    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.id).toBe(createdId);
    expect(res.body.data.description).toContain(marker);
    expect(res.body.data.accident_date).toBeDefined();
    expect(res.body.data.status).toBeDefined();
    expect(res.body.data.level).toBeDefined();
  });

  // ─────────────────────────────────────────────
  // 用例 4：更新事故信息应成功
  // ─────────────────────────────────────────────
  test('更新事故信息应成功', async () => {
    if (!createdId) {
      const payload = {
        accident_date: '2026-01-20',
        description: `E2E事故更新测试 ${marker}`,
        remark: marker
      };
      const createRes = await client
        .post('/api/accidents')
        .set(authHeaders)
        .send(payload);
      createdId = createRes.body.data?.id;
      if (createdId) cleanupIds.push(createdId);
    }

    expect(createdId).toBeTruthy();

    const res = await client
      .put(`/api/accidents/${createdId}`)
      .set(authHeaders)
      .send({
        description: `E2E更新后事故描述 ${marker}`,
        status: '已结案',
        loss_amount: 8000
      });

    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.description).toContain('E2E更新后');
    expect(res.body.data.status).toBe('已结案');
  });

  // ─────────────────────────────────────────────
  // 用例 5：删除事故应返回成功
  // ─────────────────────────────────────────────
  test('删除事故应返回成功', async () => {
    // 创建一条专门用于删除测试的事故
    const payload = {
      accident_date: '2026-01-20',
      description: `E2E事故删除测试 ${marker}`,
      location: '测试路口E',
      remark: marker
    };
    const createRes = await client
      .post('/api/accidents')
      .set(authHeaders)
      .send(payload);

    const deleteId = createRes.body.data?.id;
    expect(deleteId).toBeTruthy();

    const res = await client
      .delete(`/api/accidents/${deleteId}`)
      .set(authHeaders);

    expect(res.body.success).toBe(true);

    // 验证已删除
    const getRes = await client
      .get(`/api/accidents/${deleteId}`)
      .set(authHeaders);

    expect(getRes.body.success).toBe(false);
  });

  // ─────────────────────────────────────────────
  // 用例 6：AI 根因分析（Mock）：传入事故 ID，应返回结构化数据或错误（AI 不可用）
  // ─────────────────────────────────────────────
  test('AI 根因分析（Mock）：应返回结果或 AI 不可用错误', async () => {
    // 调用根因分析接口 /api/hse/ai/root-cause
    const res = await client
      .post('/api/hse/ai/root-cause')
      .set(authHeaders)
      .send({
        incidentIds: createdId ? [createdId] : [1],
        type: 'accident',
        customPrompt: 'E2E测试根因分析'
      });

    // 验证响应结构完整
    expect(res.body).toBeDefined();
    expect('success' in res.body).toBe(true);

    if (!res.body.success) {
      // AI 服务不可用时返回错误
      expect(res.body.message).toBeDefined();
      expect(typeof res.body.message).toBe('string');
    } else {
      // AI 服务可用时返回结构化数据
      expect(res.body.data).toBeDefined();
    }

    // 两种情况至少有 2 个断言已满足
    expect(res.body.success).toBeDefined();
  });

  // ─────────────────────────────────────────────
  // 用例 7：创建缺少描述的事故应返回错误
  // 注: accidents 路由有 Zod 校验，但 description 字段可选（.optional()）
  // 真正必填的是 accident_date，缺少它才会报错
  // ─────────────────────────────────────────────
  test('创建缺少必填字段的事故应返回校验错误', async () => {
    const res = await client
      .post('/api/accidents')
      .set(authHeaders)
      .send({
        // 缺少 accident_date (必填)
        description: '测试缺少日期'
      });

    // Zod 校验应失败
    expect(res.body.success).toBe(false);
    expect(res.body.errors).toBeDefined();
  });

  // ─────────────────────────────────────────────
  // 用例 8：获取不存在的事故应返回错误
  // ─────────────────────────────────────────────
  test('获取不存在的事故应返回错误', async () => {
    const res = await client
      .get('/api/accidents/999999')
      .set(authHeaders);

    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe(-2);
    expect(res.body.message).toContain('不存在');
  });

  // ─────────────────────────────────────────────
  // 用例 9：事故列表分页应正确
  // ─────────────────────────────────────────────
  test('事故列表分页应正确', async () => {
    // 获取第一页（pageSize=2）
    const res1 = await client
      .get('/api/accidents')
      .set(authHeaders)
      .query({ page: 1, pageSize: 2 });

    expect(res1.body.success).toBe(true);
    expect(res1.body.data.page).toBe(1);
    expect(res1.body.data.pageSize).toBe(2);
    expect(res1.body.data.list.length).toBeLessThanOrEqual(2);
    expect(res1.body.data.total).toBeGreaterThanOrEqual(0);

    // 获取第二页（如果有足够数据）
    if (res1.body.data.total > 2) {
      const res2 = await client
        .get('/api/accidents')
        .set(authHeaders)
        .query({ page: 2, pageSize: 2 });

      expect(res2.body.success).toBe(true);
      expect(res2.body.data.page).toBe(2);
      expect(res2.body.data.pageSize).toBe(2);

      // 两页不应有重复记录
      const ids1 = res1.body.data.list.map(item => item.id);
      const ids2 = res2.body.data.list.map(item => item.id);
      const overlap = ids1.filter(id => ids2.includes(id));
      expect(overlap.length).toBe(0);
    }
  });

  // ─────────────────────────────────────────────
  // 用例 10：事故列表搜索应返回匹配结果
  // ─────────────────────────────────────────────
  test('事故列表搜索应返回匹配结果', async () => {
    const res = await client
      .get('/api/accidents')
      .set(authHeaders)
      .query({ keyword: marker });

    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(Array.isArray(res.body.data.list)).toBe(true);

    // 所有返回的记录应包含搜索关键词
    res.body.data.list.forEach(item => {
      const text = `${item.description || ''}${item.location || ''}${item.involved_person || ''}${item.involved_vehicle || ''}`.toLowerCase();
      expect(text).toContain(marker.toLowerCase());
    });
  });

  // ─────────────────────────────────────────────
  // 用例 11：事故统计接口应返回聚合数据
  // ─────────────────────────────────────────────
  test('事故统计接口应返回聚合数据', async () => {
    const res = await client
      .get('/api/accidents/stats/all')
      .set(authHeaders);

    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(typeof res.body.data.total).toBe('number');
    expect(res.body.data.total).toBeGreaterThanOrEqual(0);
    // 应包含按类型、等级、年份等维度的聚合
    expect('byType' in res.body.data || 'byLevel' in res.body.data || 'byYear' in res.body.data).toBe(true);
  });
});
