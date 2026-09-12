/**
 * 导入功能 E2E 链路测试（6 用例）
 * 覆盖：导入状态、日志列表、参数校验、模块类型、统计、配置
 */
jest.setTimeout(30000);

const { client, login, getAuthHeaders, query, cleanupTestData, getTestMarker } = require('../setup');

describe('导入功能 E2E 链路测试', () => {
  let marker = '';
  let authHeaders = {};

  beforeAll(async () => {
    marker = getTestMarker();
    await login();
    authHeaders = getAuthHeaders();
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  // ─────────────────────────────────────────────
  // 用例 1：导入接口应存在（GET /api/import/logs 返回配置）
  // 注: import 路由未使用 authMiddleware（检查 app.js 路由注册位置）
  // 但在 authMiddleware 之后注册，所以需要认证
  // ─────────────────────────────────────────────
  test('导入日志接口应存在并可访问', async () => {
    const res = await client
      .get('/api/import/logs')
      .set(authHeaders);

    // 验证接口存在且返回正确结构
    expect(res.body).toBeDefined();
    expect('success' in res.body).toBe(true);
    expect(res.body.data).toBeDefined();
    expect('logs' in res.body.data).toBe(true);
    expect('total' in res.body.data).toBe(true);
  });

  // ─────────────────────────────────────────────
  // 用例 2：导入日志列表应返回数组
  // ─────────────────────────────────────────────
  test('导入日志列表应返回数组', async () => {
    const res = await client
      .get('/api/import/logs')
      .set(authHeaders)
      .query({ page: 1, limit: 10 });

    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(Array.isArray(res.body.data.logs)).toBe(true);
    expect(typeof res.body.data.total).toBe('number');
    expect(typeof res.body.data.page).toBe('number');
    expect(typeof res.body.data.limit).toBe('number');
  });

  // ─────────────────────────────────────────────
  // 用例 3：缺少必要参数时应返回错误
  // 测试 POST /api/import/parse 缺少 filePath 和 fileName
  // ─────────────────────────────────────────────
  test('导入解析缺少必要参数时应返回错误', async () => {
    const res = await client
      .post('/api/import/parse')
      .set(authHeaders)
      .send({});

    expect(res.body.success).toBe(false);
    expect(res.body.message).toBeDefined();
    expect(res.body.message).toContain('缺少必要参数');
  });

  // ─────────────────────────────────────────────
  // 用例 4：不存在的模块类型应返回错误或空结果
  // 测试 GET /api/import/config?moduleType=nonexistent_module
  // ─────────────────────────────────────────────
  test('不存在的模块类型应返回空配置', async () => {
    const res = await client
      .get('/api/import/config')
      .set(authHeaders)
      .query({ moduleType: 'nonexistent_module_e2e_test' });

    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(Array.isArray(res.body.data.configs)).toBe(true);
    // 不存在的模块应返回空配置列表
    expect(res.body.data.configs.length).toBe(0);
    expect(res.body.data.total).toBe(0);
  });

  // ─────────────────────────────────────────────
  // 用例 5：导入统计接口应返回数据
  // ─────────────────────────────────────────────
  test('导入统计接口应返回聚合数据', async () => {
    const res = await client
      .get('/api/import/stats')
      .set(authHeaders);

    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    // 应包含 byModule, recent, totals 等字段
    expect('byModule' in res.body.data).toBe(true);
    expect('recent' in res.body.data).toBe(true);
    expect('totals' in res.body.data).toBe(true);
    expect(Array.isArray(res.body.data.byModule)).toBe(true);
  });

  // ─────────────────────────────────────────────
  // 用例 6：导入配置接口应返回配置项
  // ─────────────────────────────────────────────
  test('导入配置接口应返回配置项', async () => {
    const res = await client
      .get('/api/import/config')
      .set(authHeaders);

    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(Array.isArray(res.body.data.configs)).toBe(true);
    expect(typeof res.body.data.total).toBe('number');
    // 至少返回 total 字段
    expect(res.body.data.total).toBeGreaterThanOrEqual(0);
  });
});
