/**
 * E2E 链路测试共享工具
 * 扩展 setup.js，提供隐患/事故/通知创建辅助、轮询等待等 E2E 专用功能
 *
 * 使用方式：
 *   const { client, login, getAuthHeaders, createHazard, createAccident, ... } = require('./test-setup-e2e');
 */

// 复用 setup.js 的所有工具
const {
  client,
  app,
  pool,
  TEST_CONFIG,
  login,
  getAuthHeaders: getAuthHeadersBase,
  query,
  cleanupTestData,
  getTestMarker
} = require('../setup');

// ============================================================
// 获取带认证的请求头（兼容 E2E 风格，支持传入自定义 token）
// ============================================================
function getAuthHeaders(token) {
  if (token) {
    return { Authorization: `Bearer ${token}` };
  }
  return getAuthHeadersBase();
}

// ============================================================
// createHazard - 创建测试隐患的辅助函数
// ============================================================
async function createHazard(token, marker) {
  const headers = getAuthHeaders(token);
  const payload = {
    hazard_date: new Date().toISOString().slice(0, 10),
    township: '测试乡镇',
    category: '环境卫生',
    level: '一般',
    description: `E2E测试隐患 ${marker}`,
    location: '测试路段A',
    measure: '立即整改',
    deadline: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    checker: '张三',
    responsible_dept: '安全部',
    fixer: '李四',
    status: '未完成',
    remark: marker
  };

  const res = await client
    .post('/api/hazards')
    .set(headers)
    .send(payload);

  return { res, payload, marker };
}

// ============================================================
// createAccident - 创建测试事故的辅助函数
// ============================================================
async function createAccident(token, marker) {
  const headers = getAuthHeaders(token);
  const payload = {
    accident_date: new Date().toISOString().slice(0, 10),
    township: '测试乡镇',
    location: '测试路段B',
    involved_vehicle: '鲁A12345',
    involved_person: '王五',
    accident_type: '车辆伤害',
    responsibility: '全部责任',
    responsibility_level: '次要',
    level: '一般',
    description: `E2E测试事故 ${marker}`,
    cause_analysis: '操作不当',
    loss_amount: 1000,
    compensation: 500,
    status: '处理中',
    handler: '赵六',
    remark: marker
  };

  const res = await client
    .post('/api/accidents')
    .set(headers)
    .send(payload);

  return { res, payload, marker };
}

// ============================================================
// createNotification - 创建测试通知的辅助函数
// ============================================================
async function createNotification(token, marker) {
  const headers = getAuthHeaders(token);

  // 通过数据库直接插入测试通知（通知通常由系统自动生成）
  // 先获取用户ID
  const userRes = await client
    .get('/api/auth/current-user')
    .set(headers);

  const userId = userRes.body?.data?.id || 1;

  const insertResult = await pool.query(
    `INSERT INTO notifications (user_id, title, content, type, is_read)
     VALUES ($1, $2, $3, $4, false)
     RETURNING *`,
    [userId, `E2E测试通知 ${marker}`, `通知内容 ${marker}，用于E2E链路测试`, 'system']
  );

  return insertResult.rows[0];
}

// ============================================================
// waitForCondition - 轮询等待条件满足
// ============================================================
async function waitForCondition(fn, timeoutMs = 10000, intervalMs = 500) {
  const startTime = Date.now();
  let lastError = null;

  while (Date.now() - startTime < timeoutMs) {
    try {
      const result = await fn();
      if (result) return result;
    } catch (err) {
      lastError = err;
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  throw lastError || new Error(`waitForCondition 超时 (${timeoutMs}ms)`);
}

// ============================================================
// cleanupE2EHazardData - 清理 E2E 测试隐患数据
// ============================================================
async function cleanupE2EHazardData(marker) {
  if (marker) {
    await pool.query("DELETE FROM hazards WHERE remark LIKE $1 AND is_deleted = false", [`%${marker}%`]);
  }
  await pool.query("DELETE FROM hazards WHERE remark LIKE '%[E2E_TEST]%' AND is_deleted = false");
}

// ============================================================
// cleanupE2EAccidentData - 清理 E2E 测试事故数据
// ============================================================
async function cleanupE2EAccidentData(marker) {
  if (marker) {
    await pool.query("DELETE FROM accidents WHERE remark LIKE $1 AND is_deleted = false", [`%${marker}%`]);
  }
  await pool.query("DELETE FROM accidents WHERE remark LIKE '%[E2E_TEST]%' AND is_deleted = false");
}

// ============================================================
// cleanupE2ENotificationData - 清理 E2E 测试通知数据
// ============================================================
async function cleanupE2ENotificationData(marker) {
  if (marker) {
    await pool.query("DELETE FROM notifications WHERE title LIKE $1", [`%${marker}%`]);
  }
  await pool.query("DELETE FROM notifications WHERE title LIKE '%E2E测试通知%'");
}

module.exports = {
  // 复用 setup.js 的工具
  client,
  app,
  pool,
  TEST_CONFIG,
  login,
  getAuthHeaders,
  query,
  cleanupTestData,
  getTestMarker,
  // E2E 扩展工具
  createHazard,
  createAccident,
  createNotification,
  waitForCondition,
  cleanupE2EHazardData,
  cleanupE2EAccidentData,
  cleanupE2ENotificationData
};
