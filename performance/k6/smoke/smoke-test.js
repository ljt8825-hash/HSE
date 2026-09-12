/**
 * 宁津环卫 HSE 安全管理系统 v4.1 - k6 冒烟测试
 *
 * 对每个核心 API 发送 1 个请求，验证 200 响应
 * 总时长约 5 分钟（含预热和冷却）
 *
 * 运行方式：
 *   k6 run -e ENV=local smoke/smoke-test.js
 *   k6 run -e ENV=staging smoke/smoke-test.js
 */

import http from 'k6/http';
import { check } from 'k6';
import { getEnvConfig } from '../config/environments.js';
import { SMOKE_TEST } from '../config/scenarios.js';
import { THRESHOLDS_P0 } from '../config/thresholds.js';
import { login, getAuthHeaders } from '../helpers/auth.js';
import { smokeTestSummary } from '../helpers/reporting.js';

// ============================================================
// 测试配置
// ============================================================

export const options = {
  scenarios: SMOKE_TEST,
  thresholds: THRESHOLDS_P0,
  noConnectionReuse: false,
  discardResponseBodies: true,
};

// ============================================================
// 测试数据
// ============================================================

/** 核心端点列表 */
const CORE_ENDPOINTS = [
  { name: '仪表盘', method: 'GET', path: '/api/dashboard', tag: 'dashboard' },
  { name: '隐患列表', method: 'GET', path: '/api/hazards', tag: 'hazards' },
  { name: '事故列表', method: 'GET', path: '/api/accidents', tag: 'accidents' },
  { name: '告警列表', method: 'GET', path: '/api/alerts', tag: 'alerts' },
  { name: '人员列表', method: 'GET', path: '/api/personnel', tag: 'personnel' },
  { name: 'BI 报表', method: 'GET', path: '/api/bi/summary', tag: 'bi' },
  { name: 'BI 隐患统计', method: 'GET', path: '/api/bi/hazards', tag: 'bi' },
  { name: '安全检查项', method: 'GET', path: '/api/inspections', tag: 'inspections' },
  { name: '培训记录', method: 'GET', path: '/api/trainings', tag: 'trainings' },
  { name: '设备列表', method: 'GET', path: '/api/equipment', tag: 'equipment' },
];

// ============================================================
// Setup - 登录获取 token
// ============================================================

/** 全局配置 */
let envConfig;

export function setup() {
  envConfig = getEnvConfig();
  console.log(`[冒烟测试] 环境: ${envConfig.name}`);
  console.log(`[冒烟测试] 地址: ${envConfig.baseUrl}`);
  console.log(`[冒烟测试] 核心端点: ${CORE_ENDPOINTS.length} 个`);

  // 预先登录，确保 token 可用
  try {
    const tokenEntry = login(envConfig);
    console.log(`[冒烟测试] 管理员登录成功，token 有效期至: ${new Date(tokenEntry.expiresAt).toISOString()}`);
    return { loginSuccess: true };
  } catch (e) {
    console.error(`[冒烟测试] 管理员登录失败: ${e.message}`);
    return { loginSuccess: false };
  }
}

// ============================================================
// 主测试逻辑
// ============================================================

export default function (data) {
  if (!data.loginSuccess) {
    // 登录失败则跳过后续测试
    check(0, {
      '冒烟测试-前置条件: 登录成功': () => false,
    });
    return;
  }

  // 验证登录状态
  check(1, {
    '冒烟测试-前置条件: 登录成功': () => true,
  });

  // ---- 1. 测试登录接口 ----
  testAuthLogin();

  // ---- 2. 逐个测试核心端点 ----
  for (const endpoint of CORE_ENDPOINTS) {
    testEndpoint(endpoint);
  }
}

/**
 * 测试认证登录接口
 */
function testAuthLogin() {
  const loginUrl = `${envConfig.baseUrl}/api/auth/login`;
  const payload = JSON.stringify({
    username: envConfig.adminUser.username,
    password: envConfig.adminUser.password,
  });

  const res = http.post(loginUrl, payload, {
    headers: { 'Content-Type': 'application/json' },
    tags: { endpoint: 'auth', operation: 'login' },
    timeout: envConfig.timeout.request,
  });

  check(res, {
    '[AUTH] 登录接口状态码 200': (r) => r.status === 200,
    '[AUTH] 登录响应包含 token': (r) => {
      try {
        const body = r.json();
        return !!(body.token || body.accessToken || body.data?.token);
      } catch {
        return false;
      }
    },
    '[AUTH] 登录响应时间 < 500ms': (r) => r.timings.duration < 500,
  });
}

/**
 * 测试单个端点
 * @param {object} endpoint - { name, method, path, tag }
 */
function testEndpoint(endpoint) {
  const authParams = getAuthHeaders(undefined, envConfig);
  const url = `${envConfig.baseUrl}${endpoint.path}`;

  let res;

  switch (endpoint.method) {
    case 'GET':
      res = http.get(url, {
        ...authParams,
        tags: { endpoint: endpoint.tag, operation: endpoint.name },
        timeout: envConfig.timeout.request,
      });
      break;
    case 'POST':
      res = http.post(
        url,
        JSON.stringify({}),
        {
          ...authParams,
          tags: { endpoint: endpoint.tag, operation: endpoint.name },
          timeout: envConfig.timeout.request,
        }
      );
      break;
    default:
      res = http.get(url, {
        ...authParams,
        tags: { endpoint: endpoint.tag, operation: endpoint.name },
        timeout: envConfig.timeout.request,
      });
  }

  // 允许 404（某些端点在空数据时可能返回 404 而非空 200）
  const isSuccess = res.status === 200 || res.status === 201;

  check(res, {
    [`[${endpoint.tag}] ${endpoint.name} 状态码 2xx`]: (r) => isSuccess,
    [`[${endpoint.tag}] ${endpoint.name} 响应时间 < 500ms`]: (r) => r.timings.duration < 500,
    [`[${endpoint.tag}] ${endpoint.name} 无服务端错误`]: (r) => r.status < 500,
  });

  // 如果失败，输出详细信息
  if (!isSuccess && res.status >= 500) {
    console.warn(
      `[WARNING] ${endpoint.name} (${endpoint.path}) 返回 ${res.status}: ${res.body.substring(0, 200)}`
    );
  }
}

// ============================================================
// 自定义摘要输出
// ============================================================

export function handleSummary(metrics) {
  return smokeTestSummary(metrics);
}
