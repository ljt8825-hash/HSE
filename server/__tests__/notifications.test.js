/**
 * 通知中心接口测试套件
 * 覆盖: 通知列表、未读数、标记已读、全部已读、删除通知
 */
const { client, login, getAuthHeaders, query, cleanupTestData, getTestMarker } = require('./setup');

describe('通知中心接口', () => {
  let authHeaders = {};
  let marker = '';

  beforeAll(async () => {
    await login();
    authHeaders = getAuthHeaders();
    marker = getTestMarker();
  });

  afterAll(async () => {
    // 清理测试创建的通知
    await query("DELETE FROM notifications WHERE title LIKE '%[TEST]%'");
  });

  describe('GET /api/notifications — 通知列表', () => {
    test('获取通知列表应返回分页数据和未读数', async () => {
      const res = await client
        .get('/api/notifications')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('list');
      expect(res.body.data).toHaveProperty('total');
      expect(res.body.data).toHaveProperty('unreadCount');
    });

    test('分页参数应生效', async () => {
      const res = await client
        .get('/api/notifications?page=1&pageSize=5')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.data.list.length).toBeLessThanOrEqual(5);
    });

    test('按已读状态过滤 isRead=true 应正常工作', async () => {
      const res = await client
        .get('/api/notifications?isRead=true')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('按类型过滤 type 应正常工作', async () => {
      const res = await client
        .get('/api/notifications?type=workflow')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /api/notifications/unread-count — 未读数', () => {
    test('获取未读数应返回 count', async () => {
      const res = await client
        .get('/api/notifications/unread-count')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('count');
      expect(typeof res.body.data.count).toBe('number');
    });
  });

  describe('PUT /api/notifications/:id/read — 标记已读', () => {
    test('标记不存在的通知应返回 404', async () => {
      const res = await client
        .put('/api/notifications/999999/read')
        .set(authHeaders);

      expect(res.status).toBe(404);
    });
  });

  describe('PUT /api/notifications/read-all — 全部已读', () => {
    test('全部标记已读应成功', async () => {
      const res = await client
        .put('/api/notifications/read-all')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('count');
    });
  });

  describe('DELETE /api/notifications/:id — 删除通知', () => {
    test('删除通知应成功（即使不存在也返回成功）', async () => {
      const res = await client
        .delete('/api/notifications/999999')
        .set(authHeaders);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('权限与边界', () => {
    test('未携带 Token 访问通知列表应返回 401', async () => {
      const res = await client.get('/api/notifications');
      expect(res.status).toBe(401);
    });

    test('未携带 Token 访问未读数应返回 401', async () => {
      const res = await client.get('/api/notifications/unread-count');
      expect(res.status).toBe(401);
    });
  });
});
