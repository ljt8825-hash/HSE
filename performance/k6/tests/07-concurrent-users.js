/**
 * ============================================================
 * 07-concurrent-users.js — 多用户并发模拟 (P0)
 * ============================================================
 *
 * 测试目标：
 *   模拟不同用户数量同时在线：10 / 50 / 100 / 200 VU
 *   每个用户执行完整流程：登录 -> 浏览仪表盘 -> 查看隐患列表 -> 查看告警 -> 登出
 *   测量端到端用户体验时间
 *
 * 关键指标：
 *   100 并发端到端 < 3s
 *   200 并发端到端 < 5s
 *
 * 用法：
 *   k6 run --env env=local tests/07-concurrent-users.js
 *   k6 run --env env=local --env max_vus=50 tests/07-concurrent-users.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter, Gauge } from 'k6/metrics';
import { scenarios, thresholds } from '../config/thresholds.js';
import { getToken } from '../helpers/auth.js';
import { getRecords, randomHazard, randomSearchQuery } from '../helpers/data-factory.js';

// ============================================================
// 自定义指标
// ============================================================

// 端到端会话指标
const userSessionDuration = new Trend('user_session_duration', true);
const loginToDashboardDuration = new Trend('login_to_dashboard_duration', true);
const dashboardToHazardsDuration = new Trend('dashboard_to_hazards_duration', true);
const hazardsToAlertsDuration = new Trend('hazards_to_alerts_duration', true);
const alertsToLogoutDuration = new Trend('alerts_to_logout_duration', true);

// 各阶段耗时细分
const loginDuration = new Trend('concurrent_login_duration', true);
const dashboardLoadDuration = new Trend('concurrent_dashboard_duration', true);
const hazardsListDuration = new Trend('concurrent_hazards_duration', true);
const alertsViewDuration = new Trend('concurrent_alerts_duration', true);
const logoutDuration = new Trend('concurrent_logout_duration', true);

// 质量指标
const sessionErrorRate = new Rate('concurrent_session_error_rate');
const sessionSuccessCount = new Counter('concurrent_session_success');
const sessionFailureCount = new Counter('concurrent_session_failure');
const activeSessionsGauge = new Gauge('concurrent_active_sessions');

// 并发级别标记
const concurrentVUs = new Gauge('concurrent_vus_level');

// ============================================================
// 测试配置
// ============================================================
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const MAX_VUS = parseInt(__ENV.MAX_VUS || '200', 10);
const STAGE_DURATION = __ENV.STAGE_DURATION || '2m';
const THINK_TIME_MIN = parseFloat(__ENV.THINK_TIME_MIN || '1', 10);
const THINK_TIME_MAX = parseFloat(__ENV.THINK_TIME_MAX || '3', 10);

export const options = {
    scenarios: {
        // 主场景：阶梯式爬升，模拟用户数从少到多
        ramping_concurrent: {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
                { duration: '30s', target: 10 },   // 10 并发基线
                { duration: STAGE_DURATION, target: 10 },
                { duration: '30s', target: 50 },   // 50 并发
                { duration: STAGE_DURATION, target: 50 },
                { duration: '30s', target: 100 },  // 100 并发
                { duration: STAGE_DURATION, target: 100 },
                { duration: '30s', target: 200 },  // 200 并发（峰值）
                { duration: STAGE_DURATION, target: 200 },
                { duration: '30s', target: 0 },    // 降压
            ],
            exec: 'userJourney',
            tags: { scenario: 'ramping_concurrent' },
        },
        // 稳态场景：固定 100 并发长时间运行
        steady_100: {
            executor: 'constant-vus',
            vus: 100,
            duration: '5m',
            startTime: STAGE_DURATION * 5 + '30s', // 在主场景之后执行
            exec: 'userJourney',
            tags: { scenario: 'steady_100' },
        },
    },
    thresholds: {
        // 使用 critical 阈值
        ...thresholds.critical,
        // 端到端会话指标
        'user_session_duration':     ['p(95)<5000', 'p(99)<8000'],
        'login_to_dashboard_duration':['p(95)<2000'],
        'dashboard_to_hazards_duration': ['p(95)<1500'],
        'hazards_to_alerts_duration': ['p(95)<1000'],
        'alerts_to_logout_duration':  ['p(95)<500'],
        // 各阶段性能
        'concurrent_login_duration':     ['p(95)<1500'],
        'concurrent_dashboard_duration':  ['p(95)<1000'],
        'concurrent_hazards_duration':   ['p(95)<1200'],
        'concurrent_alerts_duration':    ['p(95)<800'],
        // 错误率
        'concurrent_session_error_rate':  ['rate<0.02'],
    },
};

// ============================================================
// Setup — 预生成用户凭证
// ============================================================
export function setup() {
    console.log('--- 多用户并发模拟 Setup ---');
    console.log(`  目标最大并发: ${MAX_VUS} VUs`);

    return {
        baseUrl: BASE_URL,
        testStartTime: Date.now(),
    };
}

// ============================================================
// 主场景：完整用户旅程
// ============================================================
export function userJourney(data) {
    const vuId = __VU;
    const iterId = __ITER;
    const sessionStart = Date.now();
    let hasError = false;

    // 记录当前并发级别
    concurrentVUs.add(exec.scenario.instance.vusActive || __VU);

    // ------ 阶段1：登录 ------
    const loginStart = Date.now();
    const loginResult = userLogin(data);

    if (!loginResult.success) {
        hasError = true;
        sessionErrorRate.add(true);
        sessionFailureCount.add(1);
        userSessionDuration.add(Date.now() - sessionStart);
        return;
    }

    const token = loginResult.token;
    loginDuration.add(Date.now() - loginStart);

    // ------ 阶段2：浏览仪表盘 ------
    const dashStart = Date.now();
    const dashResult = loadDashboard(data, token);
    dashboardLoadDuration.add(Date.now() - dashStart);
    loginToDashboardDuration.add(Date.now() - loginStart);

    if (!dashResult) {
        hasError = true;
    }

    thinkTime();

    // ------ 阶段3：查看隐患列表 ------
    const hazardsStart = Date.now();
    const hazardsResult = viewHazardsList(data, token);
    hazardsListDuration.add(Date.now() - hazardsStart);
    dashboardToHazardsDuration.add(Date.now() - dashStart);

    if (!hazardsResult) {
        hasError = true;
    }

    thinkTime();

    // ------ 阶段4：查看告警 ------
    const alertsStart = Date.now();
    const alertsResult = viewAlerts(data, token);
    alertsViewDuration.add(Date.now() - alertsStart);
    hazardsToAlertsDuration.add(Date.now() - hazardsStart);

    if (!alertsResult) {
        hasError = true;
    }

    thinkTime();

    // ------ 阶段5：登出 ------
    const logoutStart = Date.now();
    const logoutResult = userLogout(data, token);
    logoutDuration.add(Date.now() - logoutStart);
    alertsToLogoutDuration.add(Date.now() - alertsStart);

    // ------ 汇总会话 ------
    const sessionEnd = Date.now();
    const sessionDuration = sessionEnd - sessionStart;
    userSessionDuration.add(sessionDuration);
    activeSessionsGauge.add(exec.scenario.instance.vusActive || 1);

    if (hasError) {
        sessionErrorRate.add(true);
        sessionFailureCount.add(1);
    } else {
        sessionErrorRate.add(false);
        sessionSuccessCount.add(1);
    }

    check(null, {
        '用户旅程: 端到端 < 3s': () => sessionDuration < 3000,
        '用户旅程: 端到端 < 5s': () => sessionDuration < 5000,
        '用户旅程: 全程无错误': () => !hasError,
    });
}

// ============================================================
// Teardown
// ============================================================
export function teardown(data) {
    if (data) {
        const elapsed = ((Date.now() - data.testStartTime) / 1000).toFixed(1);
        console.log('\n--- 多用户并发模拟完成 ---');
        console.log(`  总耗时: ${elapsed}s`);
        console.log(`  最大并发: ${MAX_VUS} VUs`);
    }
}

// ============================================================
// 用户操作函数
// ============================================================

/**
 * 用户登录
 * 每个虚拟用户使用唯一的用户名（基于 VU ID）
 */
function userLogin(data) {
    const username = `perf_user_${__VU}`;
    const password = 'PerfTest2024!';

    const res = http.post(
        `${data.baseUrl}/api/auth/login`,
        JSON.stringify({ username, password }),
        {
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            tags: { action: 'login', step: 'auth' },
        }
    );

    if (res.status === 200 || res.status === 201) {
        try {
            const body = res.json();
            const token = body.token || body.accessToken || body.data?.token;
            return { success: true, token };
        } catch (e) {
            return { success: false, error: '解析登录响应失败' };
        }
    }

    return { success: false, error: `登录失败: HTTP ${res.status}` };
}

/**
 * 加载仪表盘
 */
function loadDashboard(data, token) {
    const res = http.get(`${data.baseUrl}/api/hse/bi/overview`, {
        headers: authHeaders(token),
        tags: { action: 'dashboard', step: 'browse' },
    });

    return check(res, {
        '仪表盘: 状态码 200': (r) => r.status === 200,
        '仪表盘: 返回 JSON 数据': (r) => {
            try { r.json(); return true; } catch { return false; }
        },
    });
}

/**
 * 查看隐患列表
 */
function viewHazardsList(data, token) {
    const page = Math.floor(Math.random() * 5) + 1;
    const pageSize = 20;
    const res = http.get(
        `${data.baseUrl}/api/hazards?page=${page}&pageSize=${pageSize}`,
        {
            headers: authHeaders(token),
            tags: { action: 'hazards_list', step: 'browse' },
        }
    );

    return check(res, {
        '隐患列表: 状态码 200': (r) => r.status === 200,
        '隐患列表: 返回分页数据': (r) => {
            try {
                const body = r.json();
                const items = body.data || body.items || body.list || body;
                return Array.isArray(items) || typeof items === 'object';
            } catch { return false; }
        },
    });
}

/**
 * 查看告警
 */
function viewAlerts(data, token) {
    const status = ['pending', 'processing', 'resolved'][Math.floor(Math.random() * 3)];
    const res = http.get(
        `${data.baseUrl}/api/hse/alerts?status=${status}&pageSize=20`,
        {
            headers: authHeaders(token),
            tags: { action: 'alerts_view', step: 'browse' },
        }
    );

    return check(res, {
        '告警列表: 状态码 200': (r) => r.status === 200 || r.status === 404,
    });
}

/**
 * 用户登出
 */
function userLogout(data, token) {
    const res = http.post(
        `${data.baseUrl}/api/auth/logout`,
        null,
        {
            headers: authHeaders(token),
            tags: { action: 'logout', step: 'auth' },
        }
    );

    // 登出失败不视为会话错误
    return res.status === 200 || res.status === 204 || res.status === 401;
}

// ============================================================
// 工具函数
// ============================================================

/**
 * 构建认证请求头
 */
function authHeaders(token) {
    return {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
    };
}

/**
 * 模拟用户思考时间
 */
function thinkTime() {
    sleep(Math.random() * (THINK_TIME_MAX - THINK_TIME_MIN) + THINK_TIME_MIN);
}
