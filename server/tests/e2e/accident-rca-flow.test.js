/**
 * E2E 测试：事故管理 -> 5W1H 根因分析
 *
 * 覆盖场景：
 *  - 正常流：创建事故 -> 查询详情 -> 发起根因分析
 *  - 异常流：AI Provider 不可用、不存在的事故 ID、空 incidentIds
 */

const request = require('supertest');
const {
  app,
  pool,
  TEST_CONFIG,
  ensureTestUser,
  getE2EToken,
  authedRequest,
  cleanupAccidentTestData,
  cleanupAIRecordTestData,
  query,
  ensureDBReady,
  getTestMarker
} = require('./test-setup');

jest.setTimeout(30000);

/** 构建标准的事故测试数据 */
function buildAccidentPayload(marker = '') {
  const today = new Date().toISOString().slice(0, 10);
  return {
    no: `SG-${Date.now()}`,
    accident_date: today,
    township: '宁津街道',
    location: '中转站B区',
    involved_vehicle: '鲁N-S0001',
    involved_person: '王五',
    accident_type: '机械伤害',
    responsibility: '操作人员',
    responsibility_level: '主要责任',
    level: '一般',
    description: `E2E测试事故：清扫车绞伤事故 ${marker}`,
    cause_analysis: '操作人员未按规定操作清扫车绞盘',
    loss_amount: 5000,
    compensation: 2000,
    status: '处理中',
    handler: '赵六',
    remark: marker || '[E2E_TEST]'
  };
}

describe('E2E: 事故管理 -> 5W1H 根因分析', () => {
  let token = '';
  let marker = '';
  let createdAccidentId = null;

  beforeAll(async () => {
    await ensureDBReady();
    await ensureTestUser(TEST_CONFIG.admin);
    token = await getE2EToken(TEST_CONFIG.admin);
    marker = getTestMarker();
    await cleanupAccidentTestData();
    await cleanupAIRecordTestData();
  });

  afterAll(async () => {
    await cleanupAccidentTestData();
    await cleanupAIRecordTestData();
  });

  // ================================================================
  // 正常流：创建事故记录
  // ================================================================
  describe('正常流：创建事故记录', () => {
    test('POST /api/accidents 创建事故应返回成功，包含事故 ID', async () => {
      const payload = buildAccidentPayload(marker);
      const res = await authedRequest(token)
        .post('/api/accidents')
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.accident_type).toBe('机械伤害');
      expect(res.body.data.status).toBe('处理中');
      expect(res.body.data.description).toContain('E2E测试事故');

      createdAccidentId = res.body.data.id;
    });
  });

  // ================================================================
  // 正常流：查询事故详情
  // ================================================================
  describe('正常流：查询事故详情', () => {
    test('GET /api/accidents/:id 应返回完整事故信息', async () => {
      // 确保有事故数据
      if (!createdAccidentId) {
        const payload = buildAccidentPayload(marker);
        const createRes = await authedRequest(token)
          .post('/api/accidents')
          .send(payload);
        createdAccidentId = createRes.body.data.id;
      }

      const res = await authedRequest(token)
        .get(`/api/accidents/${createdAccidentId}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(createdAccidentId);
      expect(res.body.data.location).toBe('中转站B区');
      expect(res.body.data.accident_type).toBe('机械伤害');
      expect(res.body.data.loss_amount).toBe(5000);
      expect(res.body.data.status).toBeDefined();
    });

    test('GET /api/accidents 列表查询应包含刚创建的事故', async () => {
      const res = await authedRequest(token)
        .get('/api/accidents')
        .query({ keyword: 'E2E测试事故', pageSize: 50 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.total).toBeGreaterThanOrEqual(1);
    });
  });

  // ================================================================
  // 正常流：发起根因分析（5W1H）
  // ================================================================
  describe('正常流：根因分析', () => {
    test('POST /api/hse/ai/root-cause 发起根因分析应返回结构化 RCA 数据', async () => {
      // 确保有事故数据
      if (!createdAccidentId) {
        const payload = buildAccidentPayload(marker);
        const createRes = await authedRequest(token)
          .post('/api/accidents')
          .send(payload);
        createdAccidentId = createRes.body.data.id;
      }

      const res = await authedRequest(token)
        .post('/api/hse/ai/root-cause')
        .send({
          incidentIds: [createdAccidentId],
          type: 'accident',
          customPrompt: '请从人、机、料、法、环五个维度进行根因分析'
        });

      // AI 服务可能不可用，验证返回结构
      if (res.body.success) {
        // AI 服务可用时
        expect(res.body.data).toBeDefined();
        expect(res.body.data.analyzedIncidents).toBeDefined();
        expect(res.body.data.content).toBeDefined();
        expect(res.body.data.provider).toBeDefined();
        expect(typeof res.body.data.content).toBe('string');
        expect(res.body.data.content.length).toBeGreaterThan(0);
      } else {
        // AI 服务不可用时返回降级提示
        expect(res.body.message).toBeDefined();
        expect(res.body.success).toBe(false);
      }
    });
  });

  // ================================================================
  // 异常流：AI Provider 不可用时发起 RCA
  // ================================================================
  describe('异常流：AI Provider 不可用', () => {
    test('AI 服务不可用时应返回错误 + 降级提示', async () => {
      // 先检查 AI provider 状态
      const statusRes = await authedRequest(token)
        .post('/api/hse/ai/provider/status');

      if (statusRes.status === 200 && statusRes.body.data && !statusRes.body.data.available) {
        // AI 不可用时，发起 RCA 应返回错误
        const rcaRes = await authedRequest(token)
          .post('/api/hse/ai/root-cause')
          .send({
            incidentIds: [createdAccidentId || 999999],
            type: 'accident'
          });

        expect(rcaRes.body.success).toBe(false);
        expect(rcaRes.body.message).toContain('不可用');
      } else {
        // AI 可用时跳过此测试（无法模拟不可用状态）
        console.log('[E2E] AI 服务当前可用，跳过不可用场景测试');
      }
    });
  });

  // ================================================================
  // 异常流：传入不存在的事故 ID
  // ================================================================
  describe('异常流：不存在的事故 ID', () => {
    test('传入不存在的事故 ID 发起 RCA 应返回错误', async () => {
      const res = await authedRequest(token)
        .post('/api/hse/ai/root-cause')
        .send({
          incidentIds: [9999999],
          type: 'accident'
        });

      expect(res.body.success).toBe(false);
      expect(res.body.message).toBeDefined();
      // 可能返回 "未找到匹配的事故/隐患记录" 或 "AI 服务不可用"
    });

    test('GET /api/accidents/999999 应返回记录不存在', async () => {
      const res = await authedRequest(token)
        .get('/api/accidents/999999');

      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe(-2);
      expect(res.body.message).toContain('记录不存在');
    });
  });

  // ================================================================
  // 异常流：空 incidentIds 数组
  // ================================================================
  describe('异常流：空 incidentIds 数组', () => {
    test('传入空数组应返回错误', async () => {
      const res = await authedRequest(token)
        .post('/api/hse/ai/root-cause')
        .send({
          incidentIds: [],
          type: 'accident'
        });

      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('至少一个');
    });

    test('不传 incidentIds 字段应返回错误', async () => {
      const res = await authedRequest(token)
        .post('/api/hse/ai/root-cause')
        .send({
          type: 'accident'
        });

      expect(res.body.success).toBe(false);
    });

    test('incidentIds 为 null 应返回错误', async () => {
      const res = await authedRequest(token)
        .post('/api/hse/ai/root-cause')
        .send({
          incidentIds: null,
          type: 'accident'
        });

      expect(res.body.success).toBe(false);
    });

    test('incidentIds 传入非数组类型应返回错误', async () => {
      const res = await authedRequest(token)
        .post('/api/hse/ai/root-cause')
        .send({
          incidentIds: 'not-an-array',
          type: 'accident'
        });

      expect(res.body.success).toBe(false);
    });
  });

  // ================================================================
  // 补充：事故统计接口验证
  // ================================================================
  describe('补充：事故统计接口', () => {
    test('GET /api/accidents/stats/all 应返回统计数据', async () => {
      const res = await authedRequest(token)
        .get('/api/accidents/stats/all');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.total).toBeDefined();
      expect(res.body.data.byType).toBeDefined();
      expect(res.body.data.byLevel).toBeDefined();
    });
  });
});
