/**
 * E2E 测试共享工具
 * 提供测试用户创建、Token 获取、数据清理、通用请求封装
 *
 * 使用方式：在每个测试文件顶部引入
 *   const { getE2EToken, authedRequest, cleanupHazardTestData, ... } = require('./test-setup');
 */

const request = require('supertest');
const app = require('../../app');
const { pool, testConnection } = require('../../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// ============================================================
// 测试配置
// ============================================================
const TEST_CONFIG = {
  admin: {
    username: 'e2e_admin',
    password: 'E2eAdmin@2026',
    realName: 'E2E管理员',
    role: 'admin',
    department: '安全管理部',
    email: 'e2e-admin@test.local',
    phone: '13800001111'
  },
  viewer: {
    username: 'e2e_viewer',
    password: 'E2eViewer@2026',
    realName: 'E2E观察员',
    role: 'viewer',
    department: '综合办公室',
    email: 'e2e-viewer@test.local',
    phone: '13800002222'
  },
  // JWT 密钥（与 app 启动时 .env 或默认值保持一致）
  jwtSecret: process.env.JWT_SECRET || 'test-jwt-secret-e2e-only-do-not-use-in-prod',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'test-jwt-refresh-e2e-only-do-not-use-in-prod'
};

// ============================================================
// 模块级缓存（避免重复登录）
// ============================================================
let _tokenCache = {};

// ============================================================
// 创建测试用 admin 用户（如果不存在）
// ============================================================
async function ensureTestUser(config = TEST_CONFIG.admin) {
  const existing = await pool.query(
    'SELECT id, username FROM users WHERE username = $1',
    [config.username]
  );

  if (existing.rows.length > 0) {
    return existing.rows[0];
  }

  const passwordHash = await bcrypt.hash(config.password, 10);
  const result = await pool.query(
    `INSERT INTO users (username, password_hash, real_name, role, department, phone, email, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, true)
     ON CONFLICT (username) DO UPDATE SET is_active = true
     RETURNING id, username`,
    [config.username, passwordHash, config.realName, config.role, config.department, config.phone, config.email]
  );

  console.log(`[E2E Setup] 创建测试用户: ${config.username} (id=${result.rows[0].id})`);
  return result.rows[0];
}

// ============================================================
// 获取 admin token（带缓存，同一 suite 内复用）
// ============================================================
async function getE2EToken(config = TEST_CONFIG.admin) {
  const cacheKey = config.username;
  if (_tokenCache[cacheKey]) {
    // 验证缓存的 token 是否仍然有效
    try {
      const decoded = jwt.verify(_tokenCache[cacheKey], TEST_CONFIG.jwtSecret);
      if (decoded.exp * 1000 > Date.now() + 5000) {
        return _tokenCache[cacheKey];
      }
    } catch {
      // token 过期，重新获取
    }
  }

  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: config.username, password: config.password });

  if (res.status !== 200 || !res.body.data || !res.body.data.token) {
    throw new Error(`[E2E Setup] 登录失败: ${res.body.message || '未知错误'} (status=${res.status})`);
  }

  const accessToken = res.body.data.token;
  _tokenCache[cacheKey] = accessToken;
  return accessToken;
}

// ============================================================
// 通用请求封装（自动附加 token）
// ============================================================
function authedRequest(token) {
  return request(app).set({ Authorization: `Bearer ${token}` });
}

// ============================================================
// 生成带 Token 的 headers 对象（用于手动构造请求）
// ============================================================
function getAuthHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

// ============================================================
// 清理测试数据辅助函数
// ============================================================

/** 清理隐患测试数据 */
async function cleanupHazardTestData() {
  await pool.query("DELETE FROM hazards WHERE remark LIKE '%[E2E_TEST]%' AND is_deleted = false");
}

/** 清理事故测试数据 */
async function cleanupAccidentTestData() {
  await pool.query("DELETE FROM accidents WHERE remark LIKE '%[E2E_TEST]%' AND is_deleted = false");
}

/** 清理 AI 生成记录测试数据 */
async function cleanupAIRecordTestData() {
  await pool.query("DELETE FROM ai_generation_records WHERE title LIKE '%[E2E_TEST]%'");
}

/** 清理导入日志测试数据 */
async function cleanupImportLogTestData() {
  await pool.query("DELETE FROM import_logs WHERE operator LIKE 'e2e_%'");
}

/** 清理登录尝试记录（测试遗留） */
async function cleanupLoginAttempts(usernamePrefix = 'e2e_') {
  await pool.query("DELETE FROM login_attempts WHERE username LIKE $1", [usernamePrefix + '%']);
}

/** 清理 Token 黑名单测试数据 */
async function cleanupTokenBlacklistTestData() {
  await pool.query(
    "DELETE FROM token_blacklist WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'e2e_%')"
  );
}

/** 一键清理所有 E2E 测试数据 */
async function cleanupAllE2EData() {
  await cleanupHazardTestData();
  await cleanupAccidentTestData();
  await cleanupAIRecordTestData();
  await cleanupImportLogTestData();
  await cleanupLoginAttempts();
  await cleanupTokenBlacklistTestData();
}

// ============================================================
// 生成唯一测试标记（用于标识测试创建的数据）
// ============================================================
function getTestMarker() {
  return `[E2E_TEST-${Date.now()}-${Math.random().toString(36).slice(2, 8)}]`;
}

// ============================================================
// 直接执行 SQL 查询（供断言用）
// ============================================================
async function query(sql, params = []) {
  return pool.query(sql, params);
}

// ============================================================
// 等待数据库连接就绪
// ============================================================
async function ensureDBReady() {
  try {
    await testConnection();
  } catch {
    // testConnection 在内部处理了异常，这里只是确保调用
  }
  // 简单 ping 测试
  const result = await pool.query('SELECT 1 AS ok');
  if (result.rows[0].ok !== 1) {
    throw new Error('[E2E Setup] 数据库连接失败');
  }
}

// ============================================================
// 导出
// ============================================================
module.exports = {
  app,
  request,
  pool,
  TEST_CONFIG,
  ensureTestUser,
  getE2EToken,
  authedRequest,
  getAuthHeaders,
  cleanupHazardTestData,
  cleanupAccidentTestData,
  cleanupAIRecordTestData,
  cleanupImportLogTestData,
  cleanupLoginAttempts,
  cleanupTokenBlacklistTestData,
  cleanupAllE2EData,
  getTestMarker,
  query,
  ensureDBReady
};
