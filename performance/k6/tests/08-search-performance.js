/**
 * ============================================================
 * 08-search-performance.js — 全文搜索压测 (P1)
 * ============================================================
 *
 * 测试目标：
 *   - 隐患标题/描述全文搜索 (GET /api/hazards?keyword=xxx)
 *   - 事故多字段组合搜索 (GET /api/accidents?type=xxx&level=xxx&dateRange=xxx)
 *   - 人员姓名模糊搜索 (GET /api/personnel?name=xxx)
 *   - 搜索结果分页性能
 *   - 空结果搜索快速返回验证
 *
 * 关键指标：
 *   搜索 P95 < 500ms，模糊搜索 < 800ms，空结果 < 200ms
 *
 * 用法：
 *   k6 run --env env=local tests/08-search-performance.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter, Gauge } from 'k6/metrics';
import { thresholds } from '../config/thresholds.js';
import { getToken } from '../helpers/auth.js';

// ============================================================
// 自定义指标
// ============================================================

// 隐患搜索
const searchHazardsDuration = new Trend('search_hazards_duration', true);
const searchHazardsResultsCount = new Gauge('search_hazards_results_count');

// 事故搜索
const searchAccidentsDuration = new Trend('search_accidents_duration', true);
const searchAccidentsResultsCount = new Gauge('search_accidents_results_count');

// 人员搜索
const searchPersonnelDuration = new Trend('search_personnel_duration', true);
const searchPersonnelResultsCount = new Gauge('search_personnel_results_count');

// 空结果搜索
const emptySearchDuration = new Trend('empty_search_duration', true);

// 分页搜索
const paginationSearchDuration = new Trend('pagination_search_duration', true);

// 质量指标
const searchErrorRate = new Rate('search_error_rate');
const searchTotalCount = new Counter('search_total_count');
const searchResultsConsistency = new Rate('search_results_consistency');

export const options = {
    scenarios: {
        // 场景1：全文搜索混合负载
        search_mixed: {
            executor: 'constant-vus',
            vus: 30,
            duration: '3m',
            exec: 'mixedSearch',
            tags: { scenario: 'search_mixed' },
        },
        // 场景2：高并发搜索压力
        search_stress: {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
                { duration: '20s', target: 50 },
                { duration: '1m',  target: 100 },
                { duration: '30s', target: 150 },
                { duration: '1m',  target: 150 },
                { duration: '20s', target: 0 },
            ],
            exec: 'mixedSearch',
            tags: { scenario: 'search_stress' },
        },
        // 场景3：分页遍历搜索
        pagination_test: {
            executor: 'constant-vus',
            vus: 20,
            duration: '2m',
            exec: 'paginationSearch',
            tags: { scenario: 'pagination_test' },
        },
        // 场景4：空结果搜索专项
        empty_search_test: {
            executor: 'constant-vus',
            vus: 10,
            duration: '1m',
            exec: 'emptySearch',
            tags: { scenario: 'empty_search_test' },
        },
    },
    thresholds: {
        // 使用 standard 阈值
        ...thresholds.standard,
        // 搜索性能指标
        'search_hazards_duration':    ['p(95)<500',  'p(99)<800'],
        'search_accidents_duration':   ['p(95)<500',  'p(99)<800'],
        'search_personnel_duration':    ['p(95)<800',  'p(99)<1200'], // 模糊搜索允许更慢
        'empty_search_duration':        ['p(95)<200',  'p(99)<400'],
        'pagination_search_duration':   ['p(95)<400',  'p(99)<600'],
        // 搜索错误率 < 1%
        'search_error_rate':            ['rate<0.01'],
    },
};

// ============================================================
// 测试数据
// ============================================================
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// 隐患搜索关键词
const HAZARD_KEYWORDS = [
    '电气', '火灾', '高处作业', '机械伤害', '化学品泄漏',
    '防护栏缺失', '安全标识', '通风不良', '粉尘', '噪音超标',
    '脚手架', '起重设备', '临时用电', '动火作业', '受限空间',
];

// 事故搜索组合
const ACCIDENT_TYPES = ['fire', 'mechanical', 'chemical', 'electrical', 'fall', 'vehicle'];
const ACCIDENT_LEVELS = ['minor', 'moderate', 'major', 'critical'];
const DATE_RANGES = [
    { start: '2024-01-01', end: '2024-06-30' },
    { start: '2024-07-01', end: '2024-12-31' },
    { start: '2025-01-01', end: '2025-06-30' },
];

// 人员搜索关键词
const PERSONNEL_NAMES = [
    '张', '李', '王', '刘', '陈', '杨', '赵', '黄', '周', '吴',
    '张伟', '王芳', '李强', '刘洋', '陈明', '杨华', '赵军',
];

// 空结果搜索关键词（极不可能匹配到结果）
const EMPTY_KEYWORDS = [
    'xyz_nonexistent_hazard_abc',
    '量子纠缠安全隐患',
    '火星施工安全',
    '海底隧道通风',
    '外太空辐射防护',
    'abcdefg123456789',
    'zzzzzzzz_nonexist',
];

// ============================================================
// Setup
// ============================================================
export function setup() {
    const token = getToken(BASE_URL);

    if (!token) {
        throw new Error('无法获取认证 token');
    }

    return { baseUrl: BASE_URL, token };
}

// ============================================================
// 场景1 & 2：混合搜索
// ============================================================
export function mixedSearch(data) {
    const action = selectSearchAction();

    switch (action) {
        case 'hazards':
            doHazardsSearch(data);
            break;
        case 'accidents':
            doAccidentsSearch(data);
            break;
        case 'personnel':
            doPersonnelSearch(data);
            break;
        default:
            doHazardsSearch(data);
    }

    sleep(Math.random() * 2 + 0.5);
}

// ============================================================
// 场景3：分页遍历搜索
// ============================================================
export function paginationSearch(data) {
    // 固定搜索条件，遍历前 10 页
    const keyword = HAZARD_KEYWORDS[Math.floor(Math.random() * HAZARD_KEYWORDS.length)];
    const totalPages = 10;
    const pageSize = 20;

    for (let page = 1; page <= totalPages; page++) {
        const start = Date.now();
        const res = http.get(
            `${data.baseUrl}/api/hazards?keyword=${encodeURIComponent(keyword)}&page=${page}&pageSize=${pageSize}`,
            {
                headers: authHeaders(data.token),
                tags: {
                    action: 'pagination_search',
                    page,
                    keyword,
                },
            }
        );

        paginationSearchDuration.add(res.timings.duration);
        searchErrorRate.add(res.status !== 200);
        searchTotalCount.add(1);

        check(res, {
            '分页搜索: 状态码 200': (r) => r.status === 200,
            '分页搜索: 响应时间 < 500ms': (r) => r.timings.duration < 500,
        });
    }

    sleep(1);
}

// ============================================================
// 场景4：空结果搜索
// ============================================================
export function emptySearch(data) {
    doEmptySearch(data);
    sleep(Math.random() * 0.5 + 0.3);
}

// ============================================================
// Teardown
// ============================================================
export function teardown(data) {
    console.log('--- 全文搜索压测完成 ---');
}

// ============================================================
// 搜索操作实现
// ============================================================

/**
 * 隐患全文搜索
 */
function doHazardsSearch(data) {
    const keyword = HAZARD_KEYWORDS[Math.floor(Math.random() * HAZARD_KEYWORDS.length)];
    const res = http.get(
        `${data.baseUrl}/api/hazards?keyword=${encodeURIComponent(keyword)}&pageSize=20`,
        {
            headers: authHeaders(data.token),
            tags: { action: 'search_hazards', keyword },
        }
    );

    searchHazardsDuration.add(res.timings.duration);
    searchErrorRate.add(res.status !== 200);
    searchTotalCount.add(1);

    if (res.status === 200) {
        try {
            const body = res.json();
            const results = body.data || body.items || body.list || [];
            searchHazardsResultsCount.add(results.length || 0);
        } catch (e) {
            searchHazardsResultsCount.add(0);
        }
    }

    check(res, {
        '隐患搜索: 状态码 200': (r) => r.status === 200,
        '隐患搜索: 响应 < 500ms': (r) => r.timings.duration < 500,
        '隐患搜索: 返回有效 JSON': (r) => {
            try { r.json(); return true; } catch { return false; }
        },
    });
}

/**
 * 事故多字段组合搜索
 */
function doAccidentsSearch(data) {
    const type = ACCIDENT_TYPES[Math.floor(Math.random() * ACCIDENT_TYPES.length)];
    const level = ACCIDENT_LEVELS[Math.floor(Math.random() * ACCIDENT_LEVELS.length)];
    const dateRange = DATE_RANGES[Math.floor(Math.random() * DATE_RANGES.length)];

    const queryParams = new URLSearchParams({
        type,
        level,
        startDate: dateRange.start,
        endDate: dateRange.end,
        pageSize: '20',
    });

    const res = http.get(
        `${data.baseUrl}/api/accidents?${queryParams.toString()}`,
        {
            headers: authHeaders(data.token),
            tags: { action: 'search_accidents', type, level },
        }
    );

    searchAccidentsDuration.add(res.timings.duration);
    searchErrorRate.add(res.status !== 200);
    searchTotalCount.add(1);

    if (res.status === 200) {
        try {
            const body = res.json();
            const results = body.data || body.items || body.list || [];
            searchAccidentsResultsCount.add(results.length || 0);
        } catch (e) {
            searchAccidentsResultsCount.add(0);
        }
    }

    check(res, {
        '事故搜索: 状态码 200': (r) => r.status === 200,
        '事故搜索: 响应 < 500ms': (r) => r.timings.duration < 500,
    });
}

/**
 * 人员姓名模糊搜索
 */
function doPersonnelSearch(data) {
    const name = PERSONNEL_NAMES[Math.floor(Math.random() * PERSONNEL_NAMES.length)];
    const res = http.get(
        `${data.baseUrl}/api/personnel?name=${encodeURIComponent(name)}&pageSize=20`,
        {
            headers: authHeaders(data.token),
            tags: { action: 'search_personnel', name },
        }
    );

    searchPersonnelDuration.add(res.timings.duration);
    searchErrorRate.add(res.status !== 200);
    searchTotalCount.add(1);

    if (res.status === 200) {
        try {
            const body = res.json();
            const results = body.data || body.items || body.list || [];
            searchPersonnelResultsCount.add(results.length || 0);
        } catch (e) {
            searchPersonnelResultsCount.add(0);
        }
    }

    check(res, {
        '人员搜索: 状态码 200': (r) => r.status === 200,
        '人员搜索: 模糊响应 < 800ms': (r) => r.timings.duration < 800,
    });
}

/**
 * 空结果搜索（验证快速返回）
 */
function doEmptySearch(data) {
    const keyword = EMPTY_KEYWORDS[Math.floor(Math.random() * EMPTY_KEYWORDS.length)];

    // 对隐患、事故、人员都搜索一遍空结果
    const endpoints = [
        { path: '/api/hazards',   param: 'keyword', label: 'hazards_empty' },
        { path: '/api/personnel', param: 'name',    label: 'personnel_empty' },
    ];

    for (const ep of endpoints) {
        const res = http.get(
            `${data.baseUrl}${ep.path}?${ep.param}=${encodeURIComponent(keyword)}&pageSize=20`,
            {
                headers: authHeaders(data.token),
                tags: { action: ep.label, keyword },
            }
        );

        emptySearchDuration.add(res.timings.duration);
        searchErrorRate.add(res.status !== 200 && res.status !== 404);
        searchTotalCount.add(1);

        check(res, {
            [`${ep.label}: 快速返回 < 200ms`]: (r) => r.timings.duration < 200,
            [`${ep.label}: 状态码 200/404`]: (r) => r.status === 200 || r.status === 404,
        });
    }
}

// ============================================================
// 工具函数
// ============================================================

/**
 * 随机选择搜索动作类型（按权重分布）
 * 隐患搜索频率最高，人员搜索次之
 */
function selectSearchAction() {
    const rand = Math.random();
    if (rand < 0.4) return 'hazards';   // 40%
    if (rand < 0.7) return 'accidents';  // 30%
    if (rand < 0.9) return 'personnel';  // 20%
    return 'hazards';                    // 10% 额外隐患搜索
}

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
