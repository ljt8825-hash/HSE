/**
 * ============================================================
 * 06-bi-dashboard.js — BI 大屏并发压测 (P1)
 * ============================================================
 *
 * 测试目标：
 *   模拟 100 用户同时打开 BI 大屏，5 个接口并发请求
 *   验证缓存命中 vs 失效的性能差异（30s TTL）
 *   确保 5 接口并发总耗时 < 2s，缓存命中 < 50ms，缓存失效 < 1.5s
 *
 * BI 接口：
 *   GET /api/hse/bi/overview      — 安全概览
 *   GET /api/hse/bi/trend         — 趋势数据
 *   GET /api/hse/bi/distribution  — 分布数据
 *   GET /api/hse/bi/ranking       — 排名数据
 *   GET /api/hse/bi/alerts        — 告警统计
 *
 * 用法：
 *   k6 run --env env=local tests/06-bi-dashboard.js
 *   k6 run --env env=staging tests/06-bi-dashboard.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter, Gauge } from 'k6/metrics';
import { scenarios, thresholds } from '../config/thresholds.js';
import { getToken } from '../helpers/auth.js';

// ============================================================
// 自定义指标
// ============================================================
const biOverviewDuration = new Trend('bi_overview_duration', true);
const biTrendDuration = new Trend('bi_trend_duration', true);
const biDistributionDuration = new Trend('bi_distribution_duration', true);
const biRankingDuration = new Trend('bi_ranking_duration', true);
const biAlertsDuration = new Trend('bi_alerts_duration', true);
const biTotalLoadDuration = new Trend('bi_total_load_duration', true);

const cacheHitRate = new Rate('bi_cache_hit_rate');
const cacheHitDuration = new Trend('bi_cache_hit_duration', true);
const cacheMissDuration = new Trend('bi_cache_miss_duration', true);

const biErrorRate = new Rate('bi_error_rate');
const biRequestCount = new Counter('bi_request_count');

// ============================================================
// 测试配置
// ============================================================
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const VU_COUNT = parseInt(__ENV.VU_COUNT || '100', 10);
const RAMP_DURATION = __ENV.RAMP_DURATION || '30s';
const HOLD_DURATION = __ENV.HOLD_DURATION || '2m';

// BI 接口定义
const BI_ENDPOINTS = [
    { name: 'overview',     path: '/api/hse/bi/overview',     metric: biOverviewDuration },
    { name: 'trend',        path: '/api/hse/bi/trend',        metric: biTrendDuration },
    { name: 'distribution', path: '/api/hse/bi/distribution', metric: biDistributionDuration },
    { name: 'ranking',      path: '/api/hse/bi/ranking',      metric: biRankingDuration },
    { name: 'alerts',       path: '/api/hse/bi/alerts',       metric: biAlertsDuration },
];

export const options = {
    scenarios: {
        // 场景1：稳态大屏并发 — 100 用户同时看大屏
        bi_dashboard_steady: {
            executor: 'constant-vus',
            vus: VU_COUNT,
            duration: HOLD_DURATION,
            startTime: RAMP_DURATION,
            exec: 'biDashboardSteady',
            tags: { scenario: 'bi_dashboard_steady' },
        },
        // 场景2：缓存预热 + 失效对比 — 先预热缓存，再验证 TTL 过期后的性能
        cache_ttl_test: {
            executor: 'ramping-vus',
            startVUs: 1,
            stages: [
                { duration: '5s',  target: 1 },   // 单用户预热缓存
                { duration: '30s', target: 1 },   // 等待缓存 TTL 接近过期（30s）
                { duration: '10s', target: 50 },  // 缓存过期瞬间大量请求
                { duration: '5s',  target: 0 },   // 冷却
            ],
            exec: 'cacheTTLTest',
            tags: { scenario: 'cache_ttl_test' },
        },
        // 场景3：突发加载 — 模拟大屏首次加载
        burst_load: {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
                { duration: '10s', target: 100 }, // 快速爬升到 100 并发
                { duration: '30s', target: 100 }, // 持续高压
                { duration: '10s', target: 200 }, // 二次爬升
                { duration: '20s', target: 200 }, // 持续最高压
                { duration: '10s', target: 0 },   // 降压
            ],
            exec: 'burstLoad',
            tags: { scenario: 'burst_load' },
        },
    },
    thresholds: {
        // 使用 standard 阈值 + BI 专属阈值
        ...thresholds.standard,
        // 5 接口并发总耗时
        'bi_total_load_duration': ['p(95)<2000'],
        // 单接口缓存命中性能
        'bi_cache_hit_duration': ['p(95)<50'],
        // 单接口缓存失效性能
        'bi_cache_miss_duration': ['p(95)<1500'],
        // 各 BI 接口 P95 < 800ms
        'bi_overview_duration':    ['p(95)<800'],
        'bi_trend_duration':        ['p(95)<800'],
        'bi_distribution_duration':['p(95)<800'],
        'bi_ranking_duration':      ['p(95)<800'],
        'bi_alerts_duration':       ['p(95)<800'],
        // 错误率 < 1%
        'bi_error_rate':           ['rate<0.01'],
    },
};

// ============================================================
// Setup — 获取认证 token
// ============================================================
export function setup() {
    const token = getToken(BASE_URL);

    if (!token) {
        throw new Error('Failed to obtain auth token during setup');
    }

    return {
        baseUrl: BASE_URL,
        token,
        // 记录首次请求时间，用于判断缓存命中/失效
        firstRequestTime: Date.now(),
    };
}

// ============================================================
// 场景1：稳态大屏并发
// ============================================================
export function biDashboardSteady(data) {
    const params = buildAuthHeaders(data.token, { scenario: 'bi_dashboard_steady' });
    const totalStart = Date.now();

    // 5 个 BI 接口并发请求（模拟大屏一次性加载所有面板）
    const requests = BI_ENDPOINTS.map((endpoint) => {
        const res = http.get(`${data.baseUrl}${endpoint.path}`, {
            headers: params.headers,
            tags: { endpoint: endpoint.name, ...params.tags },
        });

        // 记录各接口耗时
        endpoint.metric.add(res.timings.duration);

        // 判断缓存命中 vs 失效
        classifyCacheResponse(res, endpoint.name);

        // 错误率统计
        biErrorRate.add(res.status !== 200);
        biRequestCount.add(1);

        return res;
    });

    const totalDuration = Date.now() - totalStart;
    biTotalLoadDuration.add(totalDuration);

    // 验证所有接口都成功
    const allSuccess = check(null, {
        'BI: 所有接口返回 200': () => requests.every((r) => r.status === 200),
        'BI: 大屏总加载时间 < 2s': () => totalDuration < 2000,
        'BI: 所有接口响应 < 800ms': () =>
            requests.every((r) => r.timings.duration < 800),
    });

    // 模拟用户查看大屏后的停留时间
    sleep(Math.random() * 5 + 3);
}

// ============================================================
// 场景2：缓存 TTL 对比测试
// ============================================================
export function cacheTTLTest(data) {
    const params = buildAuthHeaders(data.token, { scenario: 'cache_ttl_test' });
    const elapsed = Date.now() - data.firstRequestTime;
    const isLikelyCacheHit = elapsed < 25000; // 30s TTL 内
    const isLikelyCacheMiss = elapsed >= 25000;

    for (const endpoint of BI_ENDPOINTS) {
        const res = http.get(`${data.baseUrl}${endpoint.path}`, {
            headers: params.headers,
            tags: {
                endpoint: endpoint.name,
                cache_phase: isLikelyCacheHit ? 'hit' : 'miss',
                ...params.tags,
            },
        });

        endpoint.metric.add(res.timings.duration);
        biErrorRate.add(res.status !== 200);
        biRequestCount.add(1);

        // 根据响应头 X-Cache 或响应时间判断缓存状态
        const cacheStatus = determineCacheStatus(res);
        if (cacheStatus === 'HIT') {
            cacheHitRate.add(true);
            cacheHitDuration.add(res.timings.duration);
        } else {
            cacheHitRate.add(false);
            cacheMissDuration.add(res.timings.duration);
        }

        check(res, {
            [`BI Cache [${endpoint.name}]: 状态码 200`]: (r) => r.status === 200,
        });
    }

    sleep(1);
}

// ============================================================
// 场景3：突发加载测试
// ============================================================
export function burstLoad(data) {
    const params = buildAuthHeaders(data.token, { scenario: 'burst_load' });
    const totalStart = Date.now();

    // 并发请求 5 个 BI 接口
    const responses = BI_ENDPOINTS.map((endpoint) => {
        const res = http.get(`${data.baseUrl}${endpoint.path}`, {
            headers: params.headers,
            tags: { endpoint: endpoint.name, ...params.tags },
        });

        endpoint.metric.add(res.timings.duration);
        classifyCacheResponse(res, endpoint.name);
        biErrorRate.add(res.status !== 200);
        biRequestCount.add(1);

        return res;
    });

    const totalDuration = Date.now() - totalStart;
    biTotalLoadDuration.add(totalDuration);

    check(null, {
        'BI Burst: 所有接口返回 200': () => responses.every((r) => r.status === 200),
        'BI Burst: 突发加载总耗时 < 2s': () => totalDuration < 2000,
    });

    sleep(Math.random() * 3 + 1);
}

// ============================================================
// Teardown — 输出汇总
// ============================================================
export function teardown(data) {
    if (data && data.token) {
        console.log('--- BI Dashboard 压测完成 ---');
        console.log(`  Base URL: ${data.baseUrl}`);
        console.log(`  测试时长: ${((Date.now() - data.firstRequestTime) / 1000).toFixed(1)}s`);
    }
}

// ============================================================
// 工具函数
// ============================================================

/**
 * 构建带认证的请求头
 */
function buildAuthHeaders(token, extraTags = {}) {
    return {
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
        },
        tags: extraTags,
    };
}

/**
 * 根据响应头或响应时间判断缓存状态
 * 优先检查 X-Cache 响应头；若无该头，则根据响应时间启发式判断
 */
function determineCacheStatus(res) {
    // 优先检查 X-Cache 响应头
    const cacheHeader = res.headers['X-Cache'] || res.headers['x-cache'];
    if (cacheHeader) {
        return cacheHeader.toUpperCase().includes('HIT') ? 'HIT' : 'MISS';
    }

    // 启发式判断：缓存命中通常 < 50ms
    return res.timings.duration < 50 ? 'HIT' : 'MISS';
}

/**
 * 分类缓存响应并记录指标
 */
function classifyCacheResponse(res, endpointName) {
    const cacheStatus = determineCacheStatus(res);

    if (cacheStatus === 'HIT') {
        cacheHitRate.add(true);
        cacheHitDuration.add(res.timings.duration);
    } else {
        cacheHitRate.add(false);
        cacheMissDuration.add(res.timings.duration);
    }
}
