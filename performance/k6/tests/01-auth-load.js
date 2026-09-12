/**
 * 01-auth-load.js — 认证接口压测 (P0)
 *
 * 测试场景：
 *   1. 并发登录（多用户 loadTest 场景）
 *   2. Token 刷新
 *   3. 登录失败（错误密码）
 *   4. 登出
 *
 * 关键指标：
 *   - 登录 P95 < 300ms
 *   - Token 刷新 P95 < 200ms
 *   - 错误率 < 0.1%
 *
 * 用法：k6 run 01-auth-load.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { textSummary } from 'k6';
import { env } from '../config/environments.js';
import { thresholds } from '../config/thresholds.js';
import { scenarios } from '../config/scenarios.js';
import { getToken, refreshTokens } from '../helpers/auth.js';
import { handleSummary } from '../helpers/reporting.js';

// ─── 自定义指标 ────────────────────────────────────────────────
const login_duration = new Trend('login_duration', true);        // 成功登录耗时
const login_fail_rate = new Rate('login_fail_rate');            // 登录失败率
const refresh_duration = new Trend('refresh_duration', true);   // Token 刷新耗时
const logout_duration = new Trend('logout_duration', true);     // 登出耗时
const auth_total = new Counter('auth_total');                   // 总认证请求数
const auth_errors = new Counter('auth_errors');                 // 认证错误计数

// ─── 压测用户池（模拟多用户并发登录） ──────────────────────────
const TEST_USERS = [
  { username: 'admin', password: 'admin123' },
  { username: 'safety_officer', password: 'safety123' },
  { username: 'inspector_01', password: 'inspector123' },
  { username: 'manager_wang', password: 'manager123' },
  { username: 'operator_li', password: 'operator123' },
];

// ─── K6 配置 ──────────────────────────────────────────────────
export const options = {
  scenarios: {
    // 主场景：并发登录负载
    loadTest: {
      ...scenarios.loadTest,
      exec: 'concurrentLogin',
      tags: { scenario: 'loadTest' },
    },
    // 辅助场景：Token 刷新
    refreshTest: {
      executor: 'constant-vus',
      vus: 5,
      duration: '30s',
      exec: 'refreshToken',
      startTime: '10s',
      tags: { scenario: 'refreshTest' },
    },
    // 辅助场景：错误密码登录
    failLoginTest: {
      executor: 'constant-vus',
      vus: 10,
      iterations: 50,
      exec: 'failLogin',
      startTime: '20s',
      tags: { scenario: 'failLoginTest' },
    },
  },
  thresholds: {
    ...thresholds.critical,
    // 登录 P95 < 300ms
    'login_duration': ['p(95)<300', 'p(99)<600'],
    // Token 刷新 P95 < 200ms
    'refresh_duration': ['p(95)<200', 'p(99)<400'],
    // 错误率 < 0.1%（仅针对正常登录流程）
    'login_fail_rate': ['rate<0.001'],
    // HTTP 错误率
    'http_req_failed': ['rate<0.01'],
  },
};

// ─── Setup：预热：用一个合法账号获取初始 token ───────────────
export function setup() {
  const baseUrl = env.BASE_URL || 'http://localhost:3000';
  const token = getToken();

  console.log(`[SETUP] 预热完成，base token 已获取`);
  return { baseUrl, token };
}

// ─── 场景 1：并发登录 ─────────────────────────────────────────
export function concurrentLogin(data) {
  const user = TEST_USERS[Math.floor(Math.random() * TEST_USERS.length)];
  const startTime = Date.now();

  const res = http.post(
    `${data.baseUrl}/api/auth/login`,
    JSON.stringify({ username: user.username, password: user.password }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { name: 'auth_login' },
    }
  );

  const duration = Date.now() - startTime;
  auth_total.add(1);

  const isOk = check(res, {
    '登录状态码 200': (r) => r.status === 200,
    '返回 token 字段': (r) => {
      const body = r.json();
      return body && (body.token || body.accessToken || body.data?.token);
    },
    '响应时间 < 300ms': (r) => r.timings.duration < 300,
  });

  if (isOk) {
    login_duration.add(duration);
    login_fail_rate.add(0);
  } else {
    login_fail_rate.add(1);
    auth_errors.add(1);
    login_duration.add(duration); // 失败也记录，便于分析
  }

  sleep(Math.random() * 0.5 + 0.5); // 0.5~1s 思考时间
}

// ─── 场景 2：Token 刷新 ──────────────────────────────────────
export function refreshToken(data) {
  if (!data.token) {
    console.warn('[REFRESH] 无可用 token，跳过');
    return;
  }

  const startTime = Date.now();

  const res = http.post(
    `${data.baseUrl}/api/auth/refresh`,
    JSON.stringify({ token: data.token }),
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${data.token}`,
      },
      tags: { name: 'auth_refresh' },
    }
  );

  const duration = Date.now() - startTime;
  auth_total.add(1);

  const isOk = check(res, {
    '刷新状态码 200/201': (r) => r.status === 200 || r.status === 201,
    '返回新 token': (r) => {
      const body = r.json();
      return body && (body.token || body.accessToken || body.data?.token);
    },
    '刷新时间 < 200ms': (r) => r.timings.duration < 200,
  });

  refresh_duration.add(duration);

  if (!isOk) {
    auth_errors.add(1);
  }

  sleep(1);
}

// ─── 场景 3：登录失败（错误密码） ─────────────────────────────
export function failLogin(data) {
  const user = TEST_USERS[Math.floor(Math.random() * TEST_USERS.length)];
  const startTime = Date.now();

  const res = http.post(
    `${data.baseUrl}/api/auth/login`,
    JSON.stringify({ username: user.username, password: 'WRONG_PASSWORD_' + Date.now() }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { name: 'auth_login_fail' },
    }
  );

  auth_total.add(1);

  check(res, {
    '错误登录返回 401': (r) => r.status === 401 || r.status === 400,
    '错误响应包含 message': (r) => {
      const body = r.json();
      return body && (body.message || body.error || body.msg);
    },
    '错误登录不泄露敏感信息': (r) => {
      const body = r.json();
      const text = JSON.stringify(body).toLowerCase();
      return !text.includes('password') && !text.includes('密码');
    },
    '错误登录响应时间 < 500ms': (r) => r.timings.duration < 500,
  });

  sleep(Math.random() * 0.3 + 0.2);
}

// ─── 场景 4：登出（在 default 中按概率执行） ─────────────────
export function defaultFunction(data) {
  if (!data.token) return;

  // 30% 概率执行登出
  if (Math.random() < 0.3) {
    const startTime = Date.now();

    const res = http.post(
      `${data.baseUrl}/api/auth/logout`,
      null,
      {
        headers: {
          'Authorization': `Bearer ${data.token}`,
        },
        tags: { name: 'auth_logout' },
      }
    );

    auth_total.add(1);
    logout_duration.add(Date.now() - startTime);

    check(res, {
      '登出状态码 200': (r) => r.status === 200 || r.status === 204,
    });
  }

  sleep(1);
}

// ─── 默认函数（兜底，实际场景由 exec 指定） ─────────────────
export default function (data) {
  // 此函数不会被执行，因为所有场景都指定了 exec
}

// ─── Teardown：清理测试数据（如有必要） ───────────────────────
export function teardown(data) {
  // 认证测试一般无需清理数据
  console.log(`[TEARDOWN] 认证压测完成，总请求数由指标 auth_total 记录`);
}

// ─── 自定义 Summary 输出 ──────────────────────────────────────
export function handleSummary(data) {
  return {
    stdout: textSummary(data, { indent: ' ', enableColors: true }) + '\n\n' +
      `═══ 认证压测摘要 ═══\n` +
      `  登录 P95:  ${data.metrics.login_duration?.values['p(95)']?.toFixed(1) || 'N/A'} ms\n` +
      `  登录 P99:  ${data.metrics.login_duration?.values['p(99)']?.toFixed(1) || 'N/A'} ms\n` +
      `  登录失败率: ${(data.metrics.login_fail_rate?.values['rate'] * 100 || 0).toFixed(3)}%\n` +
      `  刷新 P95:  ${data.metrics.refresh_duration?.values['p(95)']?.toFixed(1) || 'N/A'} ms\n` +
      `  认证总请求: ${data.metrics.auth_total?.values['count'] || 0}\n` +
      `  认证错误数: ${data.metrics.auth_errors?.values['count'] || 0}\n`,
    'summary.json': JSON.stringify(data),
    'auth_metrics.json': JSON.stringify({
      login_p95: data.metrics.login_duration?.values['p(95)'],
      login_p99: data.metrics.login_duration?.values['p(99)'],
      login_fail_rate: data.metrics.login_fail_rate?.values['rate'],
      refresh_p95: data.metrics.refresh_duration?.values['p(95)'],
      total_requests: data.metrics.auth_total?.values['count'],
      total_errors: data.metrics.auth_errors?.values['count'],
    }, null, 2),
  };
}
