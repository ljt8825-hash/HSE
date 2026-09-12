/**
 * 数据导入接口测试套件
 * 覆盖: 解析、确认入库、回滚、导入日志、字段映射配置、导入统计
 */
const { client, login, getAuthHeaders, query, cleanupTestData, getTestMarker } = require('./setup');

describe('数据导入接口', () => {
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

  describe('POST /api/import/parse — 解析文件', () => {
    test('缺少 filePath 应返回错误', async () => {
      const res = await client
        .post('/api/import/parse')
        .set(authHeaders)
        .send({ fileName: 'test.xlsx' });

      expect(res.body.success).toBe(false);
    });

    test('缺少 fileName 应返回错误', async () => {
      const res = await client
        .post('/api/import/parse')
        .set(authHeaders)
        .send({ filePath: '/tmp/test.xlsx' });

      expect(res.body.success).toBe(false);
    });

    test('缺少全部参数应返回错误', async () => {
      const res = await client
        .post('/api/import/parse')
        .set(authHeaders)
        .send({});

      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/import/confirm — 确认入库', () => {
    test('缺少 fileRecordId 应返回错误', async () => {
      const res = await client
        .post('/api/import/confirm')
        .set(authHeaders)
        .send({});

      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/import/rollback — 回滚', () => {
    test('缺少 jobId 应返回错误', async () => {
      const res = await client
        .post('/api/import/rollback')
        .set(authHeaders)
        .send({});

      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/import/logs — 导入日志', () => {
    test('获取导入日志应返回分页数据', async () => {
      const res = await client
        .get('/api/import/logs')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('logs');
      expect(res.body.data).toHaveProperty('total');
    });

    test('分页参数应生效', async () => {
      const res = await client
        .get('/api/import/logs?page=1&limit=5')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.data.limit).toBe(5);
    });

    test('按模块类型过滤 moduleType 应正常工作', async () => {
      const res = await client
        .get('/api/import/logs?moduleType=hazards')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('按状态过滤 status 应正常工作', async () => {
      const res = await client
        .get('/api/import/logs?status=completed')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /api/import/config — 字段映射配置', () => {
    test('获取配置应返回配置列表', async () => {
      const res = await client
        .get('/api/import/config')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('configs');
      expect(res.body.data).toHaveProperty('total');
    });

    test('按模块类型过滤应正常工作', async () => {
      const res = await client
        .get('/api/import/config?moduleType=hazards')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /api/import/stats — 导入统计', () => {
    test('获取导入统计应返回 byModule/recent/totals', async () => {
      const res = await client
        .get('/api/import/stats')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('byModule');
      expect(res.body.data).toHaveProperty('recent');
      expect(res.body.data).toHaveProperty('totals');
    });
  });
});
