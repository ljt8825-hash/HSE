/**
 * 测试前置配置
 * 创建测试用户、获取认证 Token、建立数据库连接
 */
const request = require('supertest');
const app = require('../app');
const { pool } = require('../config/db');

// 测试配置
const TEST_CONFIG = {
  admin: {
    username: 'admin',
    password: 'admin123'
  },
  baseUrl: '/api'
};

// 全局测试客户端
const client = request(app);

// 存储认证令牌
let accessToken = null;
let refreshToken = null;

/**
 * 执行登录获取 Token
 */
async function login() {
  const res = await client
    .post(`${TEST_CONFIG.baseUrl}/auth/login`)
    .send({
      username: TEST_CONFIG.admin.username,
      password: TEST_CONFIG.admin.password
    });

  if (res.status !== 200 || !res.body.data || !res.body.data.token) {
    throw new Error(`登录失败: ${res.body.message || '未知错误'} (状态码: ${res.status})`);
  }

  accessToken = res.body.data.token;
  refreshToken = res.body.data.refreshToken;
  return { accessToken, refreshToken, user: res.body.data.user };
}

/**
 * 获取带认证的请求头
 */
function getAuthHeaders() {
  if (!accessToken) {
    throw new Error('未获取到 accessToken，请先调用 login()');
  }
  return {
    Authorization: `Bearer ${accessToken}`
  };
}

/**
 * 执行原生 SQL（用于数据清理和验证）
 */
async function query(sql, params = []) {
  const result = await pool.query(sql, params);
  return result;
}

/**
 * 清理测试数据
 */
async function cleanupTestData() {
  // 清理测试创建的事故记录（通过标记识别）
  await pool.query(
    "DELETE FROM accidents WHERE description LIKE '%[TEST]%' AND is_deleted = false"
  );
  // 清理测试创建的车辆保险
  await pool.query(
    "DELETE FROM vehicles WHERE remark LIKE '%[TEST]%' AND is_deleted = false"
  );
  // 清理测试创建的人员保险
  await pool.query(
    "DELETE FROM personnel_insurance WHERE remark LIKE '%[TEST]%' AND is_deleted = false"
  );
  // 清理测试创建的登录尝试记录
  await pool.query(
    "DELETE FROM login_attempts WHERE username LIKE 'test_%'"
  );
}

/**
 * 生成唯一测试标记
 */
function getTestMarker() {
  return `[TEST-${Date.now()}-${Math.random().toString(36).slice(2, 8)}]`;
}

module.exports = {
  client,
  app,
  pool,
  TEST_CONFIG,
  login,
  getAuthHeaders,
  query,
  cleanupTestData,
  getTestMarker
};
