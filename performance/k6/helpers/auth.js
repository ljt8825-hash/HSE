/**
 * 宁津环卫 HSE 安全管理系统 v4.1 - k6 认证 Helper
 *
 * 功能：
 *   - login() / loginAs(user) - 登录获取 JWT token
 *   - refreshTokens() - 刷新 token
 *   - Token 池管理 - 多 VU 并发时复用 token
 *   - Token 失效自动重新登录
 */

import http from 'k6/http';
import { getEnvConfig } from '../config/environments.js';

// ============================================================
// Token 池 - 全局共享（k6 单进程内多 VU 复用）
// ============================================================

/**
 * Token 池结构
 * @typedef {object} TokenEntry
 * @property {string} token - JWT access token
 * @property {string} refreshToken - JWT refresh token
 * @property {number} expiresAt - 过期时间戳 (ms)
 */

/** @type {Map<string, TokenEntry>} */
const tokenPool = new Map();

/** token 默认过期缓冲时间（提前 30 秒认为过期） */
const EXPIRY_BUFFER_MS = 30000;

// ============================================================
// 内部工具函数
// ============================================================

/**
 * 判断 token 是否过期
 * @param {TokenEntry} entry
 * @returns {boolean}
 */
function isTokenExpired(entry) {
  return Date.now() >= entry.expiresAt - EXPIRY_BUFFER_MS;
}

/**
 * 生成 token 池的 key
 * @param {string} username
 * @param {string} baseUrl
 * @returns {string}
 */
function poolKey(username, baseUrl) {
  return `${baseUrl}:${username}`;
}

/**
 * 解析 JWT token 的过期时间
 * JWT payload 的 exp 字段为秒级时间戳
 * @param {string} token
 * @returns {number} 毫秒级过期时间戳
 */
function parseJwtExpiry(token) {
  try {
    const payload = token.split('.')[1];
    // k6 中使用 atob 进行 base64 解码
    const decoded = atob(payload);
    const data = JSON.parse(decoded);
    return data.exp * 1000; // 转为毫秒
  } catch (e) {
    // 解析失败，设置较短的有效期
    return Date.now() + 300000; // 5 分钟
  }
}

// ============================================================
// 公开 API
// ============================================================

/**
 * 使用管理员账号登录
 * @param {object} [config] - 环境配置（可选，默认读取当前环境）
 * @returns {TokenEntry}
 */
export function login(config) {
  const envConfig = config || getEnvConfig();
  const { username, password } = envConfig.adminUser;
  return loginAs(username, password, envConfig);
}

/**
 * 使用指定账号密码登录
 * @param {string} username
 * @param {string} password
 * @param {object} [config] - 环境配置
 * @returns {TokenEntry}
 */
export function loginAs(username, password, config) {
  const envConfig = config || getEnvConfig();
  const loginUrl = `${envConfig.baseUrl}/api/auth/login`;

  const payload = JSON.stringify({
    username: username,
    password: password,
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
    },
    tags: { endpoint: 'auth', operation: 'login' },
    timeout: envConfig.timeout.request,
  };

  const response = http.post(loginUrl, payload, params);

  if (response.status !== 200) {
    throw new Error(
      `登录失败 [${response.status}]: ${response.body} ` +
      `(user: ${username}, url: ${loginUrl})`
    );
  }

  let data;
  try {
    data = response.json();
  } catch (e) {
    throw new Error(`登录响应 JSON 解析失败: ${response.body}`);
  }

  const token = data.token || data.accessToken || data.data?.token;
  const refreshToken = data.refreshToken || data.data?.refreshToken;

  if (!token) {
    throw new Error(`登录响应中未找到 token 字段: ${JSON.stringify(data)}`);
  }

  const entry = {
    token: token,
    refreshToken: refreshToken || '',
    expiresAt: parseJwtExpiry(token),
  };

  // 存入 token 池
  const key = poolKey(username, envConfig.baseUrl);
  tokenPool.set(key, entry);

  return entry;
}

/**
 * 刷新 token
 * @param {string} refreshToken
 * @param {object} [config] - 环境配置
 * @returns {TokenEntry}
 */
export function refreshTokens(refreshToken, config) {
  const envConfig = config || getEnvConfig();
  const refreshUrl = `${envConfig.baseUrl}/api/auth/refresh`;

  const payload = JSON.stringify({
    refreshToken: refreshToken,
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
    },
    tags: { endpoint: 'auth', operation: 'refresh' },
    timeout: envConfig.timeout.request,
  };

  const response = http.post(refreshUrl, payload, params);

  if (response.status !== 200) {
    throw new Error(
      `Token 刷新失败 [${response.status}]: ${response.body}`
    );
  }

  const data = response.json();
  const token = data.token || data.accessToken || data.data?.token;
  const newRefreshToken = data.refreshToken || data.data?.refreshToken || refreshToken;

  if (!token) {
    throw new Error(`刷新响应中未找到 token 字段`);
  }

  return {
    token: token,
    refreshToken: newRefreshToken,
    expiresAt: parseJwtExpiry(token),
  };
}

/**
 * 获取有效的 token（自动管理 token 池和过期刷新）
 * 优先级：token 池 > 刷新 > 重新登录
 *
 * @param {string} [username] - 用户名（默认使用 admin）
 * @param {object} [config] - 环境配置
 * @returns {TokenEntry}
 */
export function getValidToken(username, config) {
  const envConfig = config || getEnvConfig();
  const user = username || envConfig.adminUser.username;
  const key = poolKey(user, envConfig.baseUrl);

  // 1. 从 token 池获取
  if (tokenPool.has(key)) {
    const entry = tokenPool.get(key);

    // 2. 检查是否过期
    if (!isTokenExpired(entry)) {
      return entry;
    }

    // 3. 尝试刷新
    if (entry.refreshToken) {
      try {
        const refreshed = refreshTokens(entry.refreshToken, envConfig);
        tokenPool.set(key, refreshed);
        return refreshed;
      } catch (e) {
        // 刷新失败，走重新登录
      }
    }
  }

  // 4. 重新登录
  if (user === envConfig.adminUser.username) {
    return login(envConfig);
  }

  // 非管理员需要提供密码
  throw new Error(
    `Token 过期且无法自动刷新，用户 "${user}" 需要重新提供密码`
  );
}

/**
 * 构建带 Authorization header 的参数对象
 * 自动获取/刷新 token
 *
 * @param {string} [username]
 * @param {object} [config]
 * @returns {object} 可直接传入 http.get/post 等的 params
 */
export function getAuthHeaders(username, config) {
  const entry = getValidToken(username, config);
  return {
    headers: {
      Authorization: `Bearer ${entry.token}`,
      'Content-Type': 'application/json',
    },
    tags: { authenticated: 'true' },
  };
}

/**
 * 清空 token 池
 * 用于测试 setup/teardown 或切换用户场景
 */
export function clearTokenPool() {
  tokenPool.clear();
}

/**
 * 获取 token 池统计信息（用于报告）
 * @returns {object}
 */
export function getTokenPoolStats() {
  let valid = 0;
  let expired = 0;

  for (const [, entry] of tokenPool) {
    if (isTokenExpired(entry)) {
      expired++;
    } else {
      valid++;
    }
  }

  return {
    total: tokenPool.size,
    valid: valid,
    expired: expired,
  };
}
