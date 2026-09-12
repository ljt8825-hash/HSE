/**
 * 工作流引擎接口测试套件
 * 覆盖: 流程定义 CRUD、流程实例发起/查询、任务审批/拒绝、我的待办
 */
const { client, login, getAuthHeaders, query, cleanupTestData, getTestMarker } = require('./setup');

describe('工作流引擎接口', () => {
  let authHeaders = {};
  let marker = '';
  let createdDefId = null;

  beforeAll(async () => {
    await login();
    authHeaders = getAuthHeaders();
    marker = getTestMarker();
  });

  afterAll(async () => {
    // 清理测试创建的工作流定义
    await query("DELETE FROM workflows WHERE name LIKE '%[TEST]%'");
    await query("DELETE FROM workflow_instances WHERE workflow_name LIKE '%[TEST]%'");
  });

  describe('GET /api/workflow/definitions — 流程定义列表', () => {
    test('获取流程定义列表应返回分页数据', async () => {
      const res = await client
        .get('/api/workflow/definitions')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('list');
      expect(res.body.data).toHaveProperty('total');
    });

    test('keyword 搜索应正常工作', async () => {
      const res = await client
        .get('/api/workflow/definitions?keyword=审批')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /api/workflow/definitions — 创建流程定义', () => {
    test('正常创建流程定义应返回数据', async () => {
      const res = await client
        .post('/api/workflow/definitions')
        .set(authHeaders)
        .send({
          code: `TEST_${marker}`,
          name: `${marker} 测试审批流程`,
          description: '测试用流程定义',
          definition: JSON.stringify({
            nodes: [
              { code: 'submit', name: '提交申请', type: 'start' },
              { code: 'approve', name: '部门审批', type: 'approval' },
              { code: 'end', name: '结束', type: 'end' }
            ],
            edges: [
              { from: 'submit', to: 'approve' },
              { from: 'approve', to: 'end' }
            ]
          }),
          sortOrder: 0,
          isActive: true
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('id');
      createdDefId = res.body.data.id;
    });

    test('缺少 code 和 name 应返回 400', async () => {
      const res = await client
        .post('/api/workflow/definitions')
        .set(authHeaders)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/workflow/definitions/:id — 流程定义详情', () => {
    test('获取存在的流程定义应返回数据', async () => {
      if (!createdDefId) return;

      const res = await client
        .get(`/api/workflow/definitions/${createdDefId}`)
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(createdDefId);
    });

    test('获取不存在的流程定义应返回 404', async () => {
      const res = await client
        .get('/api/workflow/definitions/999999')
        .set(authHeaders);

      expect(res.status).toBe(404);
    });
  });

  describe('PUT /api/workflow/definitions/:id — 更新流程定义', () => {
    test('更新流程定义名称应生效', async () => {
      if (!createdDefId) return;

      const res = await client
        .put(`/api/workflow/definitions/${createdDefId}`)
        .set(authHeaders)
        .send({ name: `${marker} 更新后名称`, description: '更新后描述' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('没有可更新字段应返回 400', async () => {
      if (!createdDefId) return;

      const res = await client
        .put(`/api/workflow/definitions/${createdDefId}`)
        .set(authHeaders)
        .send({});

      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/workflow/definitions/:id — 删除流程定义', () => {
    test('删除存在的流程定义应成功', async () => {
      if (!createdDefId) return;

      const res = await client
        .delete(`/api/workflow/definitions/${createdDefId}`)
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('删除不存在的流程定义应返回 404', async () => {
      const res = await client
        .delete('/api/workflow/definitions/999999')
        .set(authHeaders);

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/workflow/instances — 流程实例列表', () => {
    test('获取流程实例列表应返回分页数据', async () => {
      const res = await client
        .get('/api/workflow/instances')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('list');
      expect(res.body.data).toHaveProperty('total');
    });

    test('按状态过滤 status 应正常工作', async () => {
      const res = await client
        .get('/api/workflow/instances?status=running')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /api/workflow/instances — 发起流程', () => {
    test('缺少必填参数应返回 400', async () => {
      const res = await client
        .post('/api/workflow/instances')
        .set(authHeaders)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/workflow/tasks — 任务列表', () => {
    test('获取任务列表应返回数据', async () => {
      const res = await client
        .get('/api/workflow/tasks')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('list');
    });
  });

  describe('GET /api/workflow/my-tasks — 我的待办', () => {
    test('获取我的待办列表应返回数据', async () => {
      const res = await client
        .get('/api/workflow/my-tasks')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('list');
      expect(res.body.data).toHaveProperty('total');
    });
  });

  describe('POST /api/workflow/tasks/:id/action — 任务操作', () => {
    test('无效操作类型应返回 400', async () => {
      const res = await client
        .post('/api/workflow/tasks/999999/action')
        .set(authHeaders)
        .send({ action: 'invalid_action' });

      expect(res.status).toBe(400);
    });

    test('缺少 action 参数应返回 400', async () => {
      const res = await client
        .post('/api/workflow/tasks/999999/action')
        .set(authHeaders)
        .send({});

      expect(res.status).toBe(400);
    });
  });
});
