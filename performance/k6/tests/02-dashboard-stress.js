/**
 * 02-dashboard-stress.js — 仪表盘压测 (P0)
 *
 * 测试场景：
 *   1. GET /api/dashboard 不同 dateRange 参数 (today/week/month/quarter)
 *   2. 缓存命中 vs 失效对比测试
 *   3. 先发大量请求填充缓存，再测量缓存命中延迟
 *
 * 关键指标：
 *   - 首次请求 < 800ms
 *   - 缓存命中 < 100ms
 *   - HTTP 错误率 < 1%
 *
 * 用法：k6 run 02-dashboard-stress.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter, Gauge } from 'k6/metrics';
import { textSummary } from 'k6';
import { env } from '../config/environments.js';
import { thresholds } from '../config/thresholds.js';
import { scenarios } from '../config/scenarios.js';
import { getToken } from '../helpers/auth.js';
import { handleSummary } from '../helpers/reporting.js';

// ─── 自定义指标 ────────────────────────────────────────────────
const dashboard_duration = new Trend('dashboard_duration', true);       // 仪表盘请求总耗时
const cache_hit_duration = new Trend('cache_hit_duration', true);       // 缓存命中耗时
const cache_miss_duration = new Trend('cache_miss_duration', true);     // 缓存失效耗时
const cache_hit_rate = new Rate('cache_hit_rate');                     // 缓存命中率
const dashboard_error_rate = new Rate('dashboard_error_rate');         // 仪表盘错误率
const dashboard_requests = new Counter('dashboard_requests');           // 仪表盘总请求数
const date_range_counter = new Counter('date_range_counter', false);   // 各 dateRange 请求计数（按 tag 分）

// ─── dateRange 参数矩阵 ────────────────────────────────────────
const DATE_RANGES = ['today', 'week', 'month', 'quarter'];
const DATE_RANGE_LABELS = {
  today: '今日',
  week: '本周',
  month: '本月',
  quarter: '本季度',
};

// ─── K6 配置 ──────────────────────────────────────────────────
export const options = {
  scenarios: {
    // 阶段 1：缓存填充 — 发送大量请求让服务端建立缓存
    cacheWarmup: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 20 },   // 快速 ramp 到 20 VU
        { duration: '20s', target: 20 },   // 持续请求填充缓存
      ],
      exec: 'warmupCache',
      tags: { phase: 'cache_warmup' },
    },
    // 阶段 2：缓存命中测量 — 稳态负载，期望大部分命中缓存
    cacheHitMeasure: {
      executor: 'constant-vus',
      vus: 30,
      duration: '30s',
      startTime: '35s',                     // 在预热完成后开始
      exec: 'measureCacheHit',
      tags: { phase: 'cache_hit_measure' },
    },
    // 阶段 3：压力测试 — 高并发下仪表盘性能
    stressTest: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '15s', target: 50 },
        { duration: '30s', target: 100 },
        { duration: '15s', target: 0 },
      ],
      startTime: '70s',
      exec: 'stressDashboard',
      tags: { phase: 'stress' },
    },
  },
  thresholds: {
    ...thresholds.critical,
    // 首次请求（缓存失效）< 800ms
    'cache_miss_duration': ['p(95)<800', 'p(99)<1500'],
    // 缓存命中 < 100ms
    'cache_hit_duration': ['p(95)<100', 'p(99)<200'],
    // 仪表盘整体延迟
    'dashboard_duration': ['p(95)<500', 'p(99)<1000'],
    // 缓存命中率 > 80%（稳态阶段）
    'cache_hit_rate': ['rate>0.8'],
    // HTTP 错误率
    'http_req_failed': ['rate<0.01'],
    // 仪表盘自身错误率
    'dashboard_error_rate': ['rate<0.01'],
  },
};

// ─── 共用请求函数 ─────────────────────────────────────────────
function requestDashboard(baseUrl, token, dateRange, extraTags = {}) {
  const params = dateRange ? `?dateRange=${dateRange}` : '';
  const fullUrl = `${baseUrl}/api/dashboard${params}`;

  const startTime = Date.now();

  const res = http.get(fullUrl, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json',
    },
    tags: { name: 'dashboard_get', dateRange: dateRange || 'none', ...extraTags },
  });

  const duration = Date.now() - startTime;
  dashboard_requests.add(1);

  // 判断是否缓存命中（基于响应时间启发式判断 + 响应头）
  const isCacheHit =
    res.headers['X-Cache'] === 'HIT' ||
    res.headers['X-Cache-Status'] === 'HIT' ||
    res.headers['x-cache'] === 'HIT' ||
    duration < 150;  // 启发式：如果响应时间 < 150ms，大概率命中缓存

  const isError = res.status !== 200;

  check(res, {
    '仪表盘状态码 200': (r) => r.status === 200,
    '返回 JSON 格式': (r) => r.json() && typeof r.json() === 'object',
    '包含统计数据': (r) => {
      const body = r.json();
      return body && (
        body.stats !== undefined ||
        body.data !== undefined ||
        body.overview !== undefined ||
        Array.isArray(body) ||
        Object.keys(body).length > 0
      );
    },
  });

  return { duration, isCacheHit, isError, status: res.status };
}

// ─── Setup ─────────────────────────────────────────────────────
export function setup() {
  const baseUrl = env.BASE_URL || 'http://localhost:3000';
  const token = getToken();

  console.log('[SETUP] Dashboard 压测准备完成');
  return { baseUrl, token };
}

// ─── 阶段 1：缓存填充 ────────────────────────────────────────
export function warmupCache(data) {
  const dateRange = DATE_RANGES[Math.floor(Math.random() * DATE_RANGES.length)];

  const { duration, isCacheHit, isError, status } = requestDashboard(
    data.baseUrl, data.token, dateRange
  );

  dashboard_duration.add(duration);

  if (isError) {
    dashboard_error_rate.add(1);
  } else {
    dashboard_error_rate.add(0);
  }

  // 预热阶段大部分是缓存失效
  if (isCacheHit) {
    cache_hit_rate.add(1);
    cache_hit_duration.add(duration);
  } else {
    cache_hit_rate.add(0);
    cache_miss_duration.add(duration);
  }

  sleep(Math.random() * 0.5 + 0.3);
}

// ─── 阶段 2：缓存命中测量 ─────────────────────────────────────
export function measureCacheHit(data) {
  const dateRange = DATE_RANGES[Math.floor(Math.random() * DATE_RANGES.length)];

  const { duration, isCacheHit, isError, status } = requestDashboard(
    data.baseUrl, data.token, dateRange, { measure: 'cache_hit' }
  );

  dashboard_duration.add(duration);

  if (isError) {
    dashboard_error_rate.add(1);
  } else {
    dashboard_error_rate.add(0);
  }

  if (isCacheHit) {
    cache_hit_rate.add(1);
    cache_hit_duration.add(duration);
  } else {
    cache_hit_rate.add(0);
    cache_miss_duration.add(duration);
  }

  sleep(Math.random() * 0.3 + 0.2);
}

// ─── 阶段 3：压力测试 ─────────────────────────────────────────
export function stressDashboard(data) {
  // 随机选择 dateRange 或不带参数
  const useDateRange = Math.random() < 0.8; // 80% 带 dateRange
  const dateRange = useDateRange
    ? DATE_RANGES[Math.floor(Math.random() * DATE_RANGES.length)]
    : null;

  const { duration, isCacheHit, isError, status } = requestDashboard(
    data.baseUrl, data.token, dateRange, { measure: 'stress' }
  );

  dashboard_duration.add(duration);

  if (isError) {
    dashboard_error_rate.add(1);
  } else {
    dashboard_error_rate.add(0);
  }

  if (isCacheHit) {
    cache_hit_rate.add(1);
    cache_hit_duration.add(duration);
  } else {
    cache_hit_rate.add(0);
    cache_miss_duration.add(duration);
  }

  sleep(Math.random() * 0.5 + 0.5);
}

// ─── 默认函数 ─────────────────────────────────────────────────
export default function (data) {
  // 由场景 exec 指定，此函数不直接执行
}

// ─── Teardown ──────────────────────────────────────────────────
export function teardown(data) {
  console.log('[TEARDOWN] 仪表盘压测完成');
}

// ─── 自定义 Summary ────────────────────────────────────────────
export function handleSummary(data) {
  const cacheHitP95 = data.metrics.cache_hit_duration?.values['p(95)'] || 0;
  const cacheMissP95 = data.metrics.cache_miss_duration?.values['p(95)'] || 0;
  const hitRate = data.metrics.cache_hit_rate?.values['rate'] || 0;
  const totalReqs = data.metrics.dashboard_requests?.values['count'] || 0;
  const errorRate = data.metrics.dashboard_error_rate?.values['rate'] || 0;

  return {
    stdout: textSummary(data, { indent: ' ', enableColors: true }) + '\n\n' +
      `═══ 仪表盘压测摘要 ═══\n` +
      `  总请求数:     ${totalReqs}\n` +
      `  缓存命中率:   ${(hitRate * 100).toFixed(1)}%\n` +
      `  缓存命中 P95: ${cacheHitP95.toFixed(1)} ms (目标 < 100ms)\n` +
      `  缓存失效 P95: ${cacheMissP95.toFixed(1)} ms (目标 < 800ms)\n` +
      `  错误率:       ${(errorRate * 100).toFixed(2)}%\n`,
    'summary.json': JSON.stringify(data),
    'dashboard_metrics.json': JSON.stringify({
      total_requests: totalReqs,
      cache_hit_rate: hitRate,
      cache_hit_p95: cacheHitP95,
      cache_miss_p95: cacheMissP95,
      dashboard_p95: data.metrics.dashboard_duration?.values['p(95)'],
      dashboard_p99: data.metrics.dashboard_duration?.values['p(99)'],
      error_rate: errorRate,
    }, null, 2),
  };
}
