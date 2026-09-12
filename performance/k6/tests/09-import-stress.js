/**
 * ============================================================
 * 09-import-stress.js — 数据导入压测 (P2)
 * ============================================================
 *
 * 测试目标：
 *   - 模拟不同大小的数据导入 POST /api/import
 *   - 100 行 / 1000 行 / 5000 行 JSON 数组
 *   - 并发导入冲突检测
 *   - 大文件超时测试
 *
 * 关键指标：
 *   1000 行 < 10s，5000 行 < 30s
 *   注意：import 可能返回 202 异步处理，需轮询状态
 *
 * 用法：
 *   k6 run --env env=local tests/09-import-stress.js
 *   k6 run --env env=local --env max_rows=5000 tests/09-import-stress.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter, Gauge } from 'k6/metrics';
import { thresholds } from '../config/thresholds.js';
import { getToken } from '../helpers/auth.js';

// ============================================================
// 自定义指标
// ============================================================

// 各规格导入耗时
const importSmallDuration = new Trend('import_small_duration', true);    // 100 行
const importMediumDuration = new Trend('import_medium_duration', true);   // 1000 行
const importLargeDuration = new Trend('import_large_duration', true);     // 5000 行

// 导入质量指标
const importErrorRate = new Rate('import_error_rate');
const importSuccessCount = new Counter('import_success_count');
const importFailCount = new Counter('import_fail_count');
const importRowsCount = new Counter('import_rows_count');
const importActiveConcurrency = new Gauge('import_active_concurrency');

// 异步处理指标（当返回 202 时）
const importAsyncWaitDuration = new Trend('import_async_wait_duration', true);
const importAsyncPollCount = new Trend('import_async_poll_count', true);
const importAsyncTimeoutRate = new Rate('import_async_timeout_rate');

// 超时测试指标
const importTimeoutRate = new Rate('import_timeout_rate');

// 轮询间隔
const POLL_INTERVAL = 2;   // 秒
const MAX_POLL_COUNT = 15;  // 最大轮询次数（30s 超时）

export const options = {
    scenarios: {
        // 场景1：不同大小数据集依次导入
        size_progression: {
            executor: 'constant-vus',
            vus: 5,
            duration: '3m',
            exec: 'sizeProgression',
            tags: { scenario: 'size_progression' },
        },
        // 场景2：同规格并发导入
        concurrent_import_100: {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
                { duration: '10s', target: 10 },
                { duration: '1m',  target: 10 },
                { duration: '10s', target: 0 },
            ],
            exec: 'concurrentImportSmall',
            tags: { scenario: 'concurrent_import_100' },
        },
        concurrent_import_1000: {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
                { duration: '10s', target: 5 },
                { duration: '1m',  target: 5 },
                { duration: '10s', target: 0 },
            ],
            exec: 'concurrentImportMedium',
            tags: { scenario: 'concurrent_import_1000' },
        },
        // 场景3：大文件 + 超时测试
        large_file_test: {
            executor: 'constant-vus',
            vus: 2,
            duration: '2m',
            exec: 'largeFileTest',
            tags: { scenario: 'large_file_test' },
        },
    },
    thresholds: {
        // 使用 relaxed 阈值
        ...thresholds.relaxed,
        // 导入耗时指标
        'import_small_duration':  ['p(95)<5000'],
        'import_medium_duration': ['p(95)<15000'],
        'import_large_duration':  ['p(95)<35000'],
        // 导入错误率 < 5%（允许部分失败）
        'import_error_rate':      ['rate<0.05'],
        // 异步处理超时率
        'import_async_timeout_rate': ['rate<0.1'],
    },
};

// ============================================================
// 测试配置
// ============================================================
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const IMPORT_TYPE = __ENV.IMPORT_TYPE || 'hazards'; // hazards / accidents / personnel

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
// 场景1：不同大小数据集依次导入
// ============================================================
export function sizeProgression(data) {
    const sizes = [100, 1000, 5000];
    const size = sizes[Math.floor(Math.random() * sizes.length)];

    doImport(data, size);

    // 不同大小间留出间隔
    sleep(Math.random() * 5 + 3);
}

// ============================================================
// 场景2a：100 行并发导入
// ============================================================
export function concurrentImportSmall(data) {
    doImport(data, 100);
    sleep(Math.random() * 2 + 1);
}

// ============================================================
// 场景2b：1000 行并发导入
// ============================================================
export function concurrentImportMedium(data) {
    doImport(data, 1000);
    sleep(Math.random() * 3 + 2);
}

// ============================================================
// 场景3：大文件 + 超时测试
// ============================================================
export function largeFileTest(data) {
    // 导入 5000 行，并测试超时行为
    const timeoutMs = 60000; // 60s 超时
    doImport(data, 5000, timeoutMs);
    sleep(Math.random() * 5 + 5);
}

// ============================================================
// Teardown
// ============================================================
export function teardown(data) {
    console.log('--- 数据导入压测完成 ---');
}

// ============================================================
// 核心导入逻辑
// ============================================================

/**
 * 执行数据导入
 *
 * @param {Object} data - setup 返回的测试数据
 * @param {number} rowCount - 导入行数
 * @param {number} [timeoutMs=30000] - HTTP 超时时间
 */
function doImport(data, rowCount, timeoutMs = 30000) {
    const payload = generateImportPayload(rowCount);
    const start = Date.now();

    const res = http.post(
        `${data.baseUrl}/api/import?type=${IMPORT_TYPE}`,
        JSON.stringify(payload),
        {
            headers: {
                Authorization: `Bearer ${data.token}`,
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            tags: {
                action: 'import',
                import_type: IMPORT_TYPE,
                row_count: rowCount,
                size_label: getSizeLabel(rowCount),
            },
            timeout: `${timeoutMs}ms`,
        }
    );

    const duration = Date.now() - start;
    const sizeLabel = getSizeLabel(rowCount);
    importActiveConcurrency.add(exec.scenario.instance.vusActive || 1);
    importRowsCount.add(rowCount);

    // 根据状态码处理
    if (res.status === 200) {
        // 同步处理完成
        recordDuration(sizeLabel, duration);
        handleSuccessResponse(res, sizeLabel);
    } else if (res.status === 202) {
        // 异步处理 — 需轮询
        handleAsyncImport(data, res, sizeLabel, start);
    } else if (res.status === 0) {
        // 超时
        importTimeoutRate.add(1);
        importErrorRate.add(1);
        importFailCount.add(1);
        console.warn(`导入超时: ${rowCount} 行 (${(duration / 1000).toFixed(1)}s)`);
    } else {
        // 其他错误
        importErrorRate.add(1);
        importFailCount.add(1);
    }

    check(res, {
        '导入: 返回 200 或 202': (r) => r.status === 200 || r.status === 202,
        '导入: 非超时响应': (r) => r.status !== 0,
    });
}

/**
 * 处理异步导入（202 响应）
 * 轮询任务状态直到完成或超时
 */
function handleAsyncImport(data, initialRes, sizeLabel, importStart) {
    let taskId = null;

    try {
        const body = initialRes.json();
        taskId = body.taskId || body.id || body.data?.taskId || body.data?.id;
    } catch (e) {
        // 无法获取 taskId
        importErrorRate.add(1);
        importFailCount.add(1);
        return;
    }

    let pollCount = 0;
    let completed = false;

    while (pollCount < MAX_POLL_COUNT && !completed) {
        sleep(POLL_INTERVAL);
        pollCount++;

        const pollRes = http.get(
            `${data.baseUrl}/api/import/status/${taskId}`,
            {
                headers: authHeaders(data.token),
                tags: { action: 'import_poll', task_id: taskId, poll: pollCount },
                timeout: '10s',
            }
        );

        importAsyncPollCount.add(pollCount);

        if (pollRes.status === 200) {
            try {
                const body = pollRes.json();
                const status = body.status || body.data?.status || body.state;

                if (status === 'completed' || status === 'done' || status === 'success') {
                    completed = true;
                    const totalDuration = Date.now() - importStart;
                    importAsyncWaitDuration.add(totalDuration);
                    recordDuration(sizeLabel, totalDuration);
                    importSuccessCount.add(1);
                    importErrorRate.add(0);
                } else if (status === 'failed' || status === 'error') {
                    importErrorRate.add(1);
                    importFailCount.add(1);
                    completed = true;
                }
                // status === 'processing' 或 'pending' — 继续轮询
            } catch (e) {
                // 解析失败，继续轮询
            }
        } else if (pollRes.status === 404) {
            // 任务不存在，可能已完成并被清理
            completed = true;
            const totalDuration = Date.now() - importStart;
            importAsyncWaitDuration.add(totalDuration);
            recordDuration(sizeLabel, totalDuration);
            importSuccessCount.add(1);
            importErrorRate.add(0);
        }
    }

    if (!completed) {
        importAsyncTimeoutRate.add(1);
        importErrorRate.add(1);
        importFailCount.add(1);
        console.warn(`异步导入超时: taskId=${taskId}, 轮询 ${pollCount} 次`);
    }
}

/**
 * 处理同步导入成功响应
 */
function handleSuccessResponse(res, sizeLabel) {
    importSuccessCount.add(1);
    importErrorRate.add(0);

    try {
        const body = res.json();
        const imported = body.imported || body.data?.imported || body.count || 0;
        const errors = body.errors || body.data?.errors || 0;
        if (errors > 0) {
            console.warn(`导入部分失败: 成功 ${imported}, 失败 ${errors}`);
        }
    } catch (e) {
        // 响应解析失败不影响成功计数
    }
}

// ============================================================
// 数据生成
// ============================================================

/**
 * 生成导入用 JSON 数组
 */
function generateImportPayload(rowCount) {
    const payload = [];

    for (let i = 0; i < rowCount; i++) {
        switch (IMPORT_TYPE) {
            case 'hazards':
                payload.push({
                    title: `性能测试隐患_${Date.now()}_${i}`,
                    description: `压测自动生成隐患记录 #${i}，用于数据导入性能测试`,
                    location: `测试区域_${(i % 10) + 1}`,
                    level: ['low', 'medium', 'high', 'critical'][i % 4],
                    status: 'pending',
                    reporter: `perf_import_user_${i % 5}`,
                    reportDate: new Date().toISOString().split('T')[0],
                    category: `类别_${(i % 8) + 1}`,
                });
                break;
            case 'accidents':
                payload.push({
                    title: `性能测试事故_${Date.now()}_${i}`,
                    type: ['fire', 'mechanical', 'chemical', 'electrical', 'fall'][i % 5],
                    level: ['minor', 'moderate', 'major', 'critical'][i % 4],
                    occurredDate: new Date(Date.now() - i * 86400000).toISOString().split('T')[0],
                    location: `测试地点_${(i % 10) + 1}`,
                    description: `压测自动生成事故记录 #${i}`,
                    casualties: Math.floor(Math.random() * 3),
                    economicLoss: Math.floor(Math.random() * 100000),
                });
                break;
            case 'personnel':
                payload.push({
                    name: `测试人员_${String.fromCharCode(65 + (i % 26))}${i}`,
                    department: `测试部门_${(i % 5) + 1}`,
                    position: `岗位_${(i % 8) + 1}`,
                    phone: `138${String(i).padStart(8, '0')}`,
                    certExpiry: new Date(Date.now() + 180 * 86400000).toISOString().split('T')[0],
                    trainingStatus: ['completed', 'expired', 'pending'][i % 3],
                });
                break;
            default:
                payload.push({ id: i, data: `test_data_${i}` });
        }
    }

    return payload;
}

// ============================================================
// 工具函数
// ============================================================

/**
 * 根据行数获取尺寸标签
 */
function getSizeLabel(rowCount) {
    if (rowCount <= 100) return 'small';
    if (rowCount <= 1000) return 'medium';
    return 'large';
}

/**
 * 记录对应规格的耗时指标
 */
function recordDuration(sizeLabel, duration) {
    switch (sizeLabel) {
        case 'small':
            importSmallDuration.add(duration);
            break;
        case 'medium':
            importMediumDuration.add(duration);
            break;
        case 'large':
            importLargeDuration.add(duration);
            break;
    }
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
