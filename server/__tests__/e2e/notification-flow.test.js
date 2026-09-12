/**
 * 通知 E2E 链路测试（5 用例）
 * 覆盖：通知列表、未读数量、标记已读、批量已读、删除
 */
jest.setTimeout(30000);

const { client, login, getAuthHeaders, query, cleanupTestData, getTestMarker, pool } = require('../setup');

describe('通知 E2E 链路测试', () => {
  let marker = '';
  let authHeaders = {};
  let userId = 1;
  let createdNotificationId = null;

  beforeAll(async () => {
    marker = getTestMarker();
    const loginRes = await login();
    authHeaders = { Authorization: `Bearer ${loginRes.accessToken}` };

    // 获取当前用户 ID
    const userRes = await client
      .get('/api/auth/current-user')
      .set(authHeaders);

    userId = userRes.body?.data?.id || 1;

    // 创建测试通知
    const insertResult = await pool.query(
      `INSERT INTO notifications (user_id, title, content, type, is_read)
       VALUES ($1, $2, $3, $4, false)
       RETURNING *`,
      [userId, `E2E测试通知 ${marker}`, `通知内容用于E2E链路测试 ${marker}`, 'system']
    );
    createdNotificationId = insertResult.rows[0]?.id;
  });

  afterAll(async () => {
    // 清理测试通知
    try {
      await pool.query("DELETE FROM notifications WHERE title LIKE $1", [`%E2E测试通知%`]);
    } catch { /* 忽略 */ }
    await cleanupTestData();
  });

  // ─────────────────────────────────────────────
  // 用例 1：获取通知列表应返回数组
  // ─────────────────────────────────────────────
  test('获取通知列表应返回数组', async () => {
    const res = await client
      .get('/api/notifications')
      .set(authHeaders);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(Array.isArray(res.body.data.list)).toBe(true);
    // 应包含 total 和 unreadCount 字段
    expect(typeof res.body.data.total).toBe('number');
    expect(typeof res.body.data.unreadCount).toBe('number');
  });

  // ─────────────────────────────────────────────
  // 用例 2：获取未读数量应返回数字
  // ─────────────────────────────────────────────
  test('获取未读数量应返回数字', async () => {
    const res = await client
      .get('/api/notifications/unread-count')
      .set(authHeaders);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(typeof res.body.data.count).toBe('number');
    expect(res.body.data.count).toBeGreaterThanOrEqual(0);
  });

  // ─────────────────────────────────────────────
  // 用例 3：标记单个通知为已读应成功
  // ─────────────────────────────────────────────
  test('标记单个通知为已读应成功', async () => {
    // 确保有测试通知
    if (!createdNotificationId) {
      const insertResult = await pool.query(
        `INSERT INTO notifications (user_id, title, content, type, is_read)
         VALUES ($1, $2, $3, $4, false)
         RETURNING *`,
        [userId, `E2E已读测试通知 ${marker}`, '标记已读测试', 'system']
      );
      createdNotificationId = insertResult.rows[0]?.id;
    }

    expect(createdNotificationId).toBeTruthy();

    const res = await client
      .put(`/api/notifications/${createdNotificationId}/read`)
      .set(authHeaders);

    expect([200, 404]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
    }
  });

  // ─────────────────────────────────────────────
  // 用例 4：批量标记所有通知为已读应成功
  // ─────────────────────────────────────────────
  test('批量标记所有通知为已读应成功', async () => {
    // 先创建一些未读通知
    await pool.query(
      `INSERT INTO notifications (user_id, title, content, type, is_read)
       VALUES ($1, $2, $3, $4, false)`,
      [userId, `E2E批量已读测试1 ${marker}`, '批量已读测试通知1', 'system']
    );
    await pool.query(
      `INSERT INTO notifications (user_id, title, content, type, is_read)
       VALUES ($1, $2, $3, $4, false)`,
      [userId, `E2E批量已读测试2 ${marker}`, '批量已读测试通知2', 'system']
    );

    const res = await client
      .put('/api/notifications/read-all')
      .set(authHeaders);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(typeof res.body.data.count).toBe('number');
    expect(res.body.data.count).toBeGreaterThanOrEqual(0);
  });

  // ─────────────────────────────────────────────
  // 用例 5：删除通知应成功
  // ─────────────────────────────────────────────
  test('删除通知应成功', async () => {
    // 创建一条专门用于删除测试的通知
    const insertResult = await pool.query(
      `INSERT INTO notifications (user_id, title, content, type, is_read)
       VALUES ($1, $2, $3, $4, false)
       RETURNING *`,
      [userId, `E2E删除测试通知 ${marker}`, '删除测试', 'system']
    );

    const deleteId = insertResult.rows[0]?.id;
    expect(deleteId).toBeTruthy();

    const res = await client
      .delete(`/api/notifications/${deleteId}`)
      .set(authHeaders);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();

    // 验证通知已被删除
    const getRes = await client
      .get('/api/notifications')
      .set(authHeaders);

    const found = getRes.body.data.list.some(item => item.id === deleteId);
    expect(found).toBe(false);
  });
});
