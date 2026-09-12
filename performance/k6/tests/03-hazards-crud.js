/**
 * 03-hazards-crud.js — 隐患 CRUD 全链路压测 (P0)
 *
 * 测试场景：
 *   1. 完整闭环：创建 -> 查询列表 -> 获取详情 -> 搜索 -> 更新 -> 删除
 *   2. 并发创建同一部门隐患（冲突检测）
 *   3. 分页查询 deep pagination (page=9999)
 *   4. 高级搜索（多条件组合）
 *
 * 关键指标：
 *   - 各操作 P95 < 500ms
 *   - 搜索 P95 < 800ms
 *   - 完整闭环 P95 < 2000ms
 *
 * 用法：k6 run 03-hazards-crud.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { textSummary } from 'k6';
import { env } from '../config/environments.js';
import { thresholds } from '../config/thresholds.js';
import { scenarios } from '../config/scenarios.js';
import { getToken } from '../helpers/auth.js';
import {
  createRecord,
  getRecords,
  getRecordById,
  updateRecord,
  deleteRecord,
  searchRecords,
} from '../helpers/crud.js';
import {
  randomHazard,
  randomSearchQuery,
  batchHazards,
} from '../helpers/data-factory.js';
import { handleSummary } from '../helpers/reporting.js';

// ─── 自定义指标 ────────────────────────────────────────────────
const create_duration = new Trend('create_duration', true);         // 创建隐患耗时
const read_duration = new Trend('read_duration', true);             // 查询列表耗时
const read_detail_duration = new Trend('read_detail_duration', true); // 获取详情耗时
const search_duration = new Trend('search_duration', true);        // 搜索耗时
const update_duration = new Trend('update_duration', true);         // 更新耗时
const delete_duration = new Trend('delete_duration', true);         // 删除耗时
const full_cycle_duration = new Trend('full_cycle_duration', true); // 完整闭环耗时
const crud_error_rate = new Rate('crud_error_rate');                 // CRUD 错误率
const conflict_rate = new Rate('conflict_rate');                     // 冲突率
const crud_total = new Counter('crud_total');                       // CRUD 总操作数
const created_ids = [];                                               // 记录创建的 ID 用于清理

// ─── 测试常量 ──────────────────────────────────────────────────
const API_BASE = '/api/hazards';
const DEPARTMENTS = ['清扫一队', '清扫二队', '垃圾清运队', '设施维护队', '质检组'];
const LEVELS = ['major', 'serious', 'general', 'hidden'];

// ─── K6 配置 ──────────────────────────────────────────────────
export const options = {
  scenarios: {
    // 主场景：完整 CRUD 闭环
    loadTest: {
      ...scenarios.loadTest,
      exec: 'fullCrudCycle',
      tags: { scenario: 'loadTest', type: 'full_crud' },
    },
    // 辅助场景：并发冲突检测
    conflictTest: {
      executor: 'constant-vus',
      vus: 10,
      duration: '20s',
      exec: 'concurrentCreate',
      startTime: '15s',
      tags: { scenario: 'conflictTest', type: 'conflict' },
    },
    // 辅助场景：深度分页 + 高级搜索
    queryTest: {
      executor: 'constant-vus',
      vus: 5,
      duration: '25s',
      exec: 'deepPaginationAndSearch',
      startTime: '40s',
      tags: { scenario: 'queryTest', type: 'query' },
    },
  },
  thresholds: {
    ...thresholds.critical,
    // 创建 P95 < 500ms
    'create_duration': ['p(95)<500', 'p(99)<1000'],
    // 查询列表 P95 < 500ms
    'read_duration': ['p(95)<500', 'p(99)<1000'],
    // 查询详情 P95 < 500ms
    'read_detail_duration': ['p(95)<500', 'p(99)<1000'],
    // 搜索 P95 < 800ms
    'search_duration': ['p(95)<800', 'p(99)<1500'],
    // 更新 P95 < 500ms
    'update_duration': ['p(95)<500', 'p(99)<1000'],
    // 删除 P95 < 500ms
    'delete_duration': ['p(95)<500', 'p(99)<1000'],
    // 完整闭环 P95 < 2000ms
    'full_cycle_duration': ['p(95)<2000', 'p(99)<4000'],
    // 错误率
    'crud_error_rate': ['rate<0.05'],
    'http_req_failed': ['rate<0.01'],
  },
};

// ─── 通用请求头 ────────────────────────────────────────────────
function authHeaders(token) {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/json',
  };
}

// ─── Setup ─────────────────────────────────────────────────────
export function setup() {
  const baseUrl = env.BASE_URL || 'http://localhost:3000';
  const token = getToken();

  console.log('[SETUP] 隐患 CRUD 压测准备完成');
  return { baseUrl, token };
}

// ─── 场景 1：完整 CRUD 闭环 ────────────────────────────────────
export function fullCrudCycle(data) {
  const cycleStart = Date.now();

  // Step 1: 创建隐患
  const hazardData = randomHazard();
  hazardData.title = `[PERF-TEST] ${hazardData.title}_${Date.now()}_${__VU}`;

  const createStart = Date.now();
  const createRes = http.post(
    `${data.baseUrl}${API_BASE}`,
    JSON.stringify(hazardData),
    { headers: authHeaders(data.token), tags: { name: 'hazard_create' } }
  );
  create_duration.add(Date.now() - createStart);
  crud_total.add(1);

  const createOk = check(createRes, {
    '创建隐患 201/200': (r) => r.status === 201 || r.status === 200,
    '返回隐患 ID': (r) => {
      const body = r.json();
      return body && (body.id || body.data?.id);
    },
  });

  if (!createOk) {
    crud_error_rate.add(1);
    return; // 创建失败，终止此闭环
  }
  crud_error_rate.add(0);

  const createdBody = createRes.json();
  const hazardId = createdBody.id || createdBody.data?.id;
  created_ids.push(hazardId);

  sleep(0.2);

  // Step 2: 查询列表
  const readStart = Date.now();
  const listRes = http.get(
    `${data.baseUrl}${API_BASE}?page=1&pageSize=20`,
    { headers: authHeaders(data.token), tags: { name: 'hazard_list' } }
  );
  read_duration.add(Date.now() - readStart);
  crud_total.add(1);

  check(listRes, {
    '列表查询 200': (r) => r.status === 200,
    '返回列表数据': (r) => {
      const body = r.json();
      return body && (Array.isArray(body) || Array.isArray(body.data) || body.items);
    },
  });

  sleep(0.15);

  // Step 3: 获取详情
  const detailStart = Date.now();
  const detailRes = http.get(
    `${data.baseUrl}${API_BASE}/${hazardId}`,
    { headers: authHeaders(data.token), tags: { name: 'hazard_detail' } }
  );
  read_detail_duration.add(Date.now() - detailStart);
  crud_total.add(1);

  check(detailRes, {
    '获取详情 200': (r) => r.status === 200,
    '详情包含标题': (r) => {
      const body = r.json();
      const data = body.data || body;
      return data && data.title;
    },
  });

  sleep(0.15);

  // Step 4: 搜索
  const searchQuery = randomSearchQuery();
  const searchStart = Date.now();
  const searchRes = http.get(
    `${data.baseUrl}${API_BASE}?keyword=${encodeURIComponent(searchQuery.keyword)}&level=${searchQuery.level || ''}&department=${encodeURIComponent(searchQuery.department || '')}`,
    { headers: authHeaders(data.token), tags: { name: 'hazard_search' } }
  );
  search_duration.add(Date.now() - searchStart);
  crud_total.add(1);

  check(searchRes, {
    '搜索 200': (r) => r.status === 200,
    '搜索返回结果': (r) => {
      const body = r.json();
      return body !== null;
    },
  });

  sleep(0.15);

  // Step 5: 更新
  const updateData = {
    status: 'processing',
    description: `[PERF-TEST] Updated at ${new Date().toISOString()}`,
    handler: 'auto_perf_test',
  };
  const updateStart = Date.now();
  const updateRes = http.put(
    `${data.baseUrl}${API_BASE}/${hazardId}`,
    JSON.stringify(updateData),
    { headers: authHeaders(data.token), tags: { name: 'hazard_update' } }
  );
  update_duration.add(Date.now() - updateStart);
  crud_total.add(1);

  check(updateRes, {
    '更新 200': (r) => r.status === 200,
    '更新状态变更': (r) => {
      const body = r.json();
      const data = body.data || body;
      return data && data.status === 'processing';
    },
  });

  sleep(0.15);

  // Step 6: 删除
  const deleteStart = Date.now();
  const deleteRes = http.del(
    `${data.baseUrl}${API_BASE}/${hazardId}`,
    null,
    { headers: authHeaders(data.token), tags: { name: 'hazard_delete' } }
  );
  delete_duration.add(Date.now() - deleteStart);
  crud_total.add(1);

  check(deleteRes, {
    '删除 200/204': (r) => r.status === 200 || r.status === 204,
  });

  // 记录完整闭环耗时
  full_cycle_duration.add(Date.now() - cycleStart);

  // 移除已删除的 ID
  const idx = created_ids.indexOf(hazardId);
  if (idx > -1) created_ids.splice(idx, 1);

  sleep(Math.random() * 0.5 + 0.5);
}

// ─── 场景 2：并发冲突检测（同部门同标题创建） ──────────────────
export function concurrentCreate(data) {
  // 所有 VU 同时向同一部门创建隐患（模拟冲突场景）
  const department = DEPARTMENTS[__VU % DEPARTMENTS.length];
  const conflictTitle = `[PERF-TEST] CONFLICT ${department}_${Math.floor(Date.now() / 1000)}`;

  const hazardData = randomHazard();
  hazardData.title = conflictTitle;
  hazardData.department = department;

  const createStart = Date.now();
  const createRes = http.post(
    `${data.baseUrl}${API_BASE}`,
    JSON.stringify(hazardData),
    { headers: authHeaders(data.token), tags: { name: 'hazard_conflict_create' } }
  );
  create_duration.add(Date.now() - createStart);
  crud_total.add(1);

  const isConflict = createRes.status === 409;
  const isCreated = createRes.status === 201 || createRes.status === 200;

  check(createRes, {
    '冲突创建不返回 500': (r) => r.status !== 500,
    '冲突创建返回 201 或 409': (r) => isCreated || isConflict,
  });

  if (isConflict) {
    conflict_rate.add(1);
  } else {
    conflict_rate.add(0);
    // 记录 ID 用于清理
    if (isCreated) {
      const body = createRes.json();
      const id = body.id || body.data?.id;
      if (id) created_ids.push(id);
    }
  }

  sleep(Math.random() * 0.3 + 0.2);
}

// ─── 场景 3：深度分页 + 高级搜索 ──────────────────────────────
export function deepPaginationAndSearch(data) {
  // 随机选择：深度分页 或 高级搜索
  if (Math.random() < 0.5) {
    // ── 深度分页测试 ──
    const pageNum = Math.floor(Math.random() * 10000) + 1; // 1~10000
    const pageSize = [20, 50, 100][Math.floor(Math.random() * 3)];

    const readStart = Date.now();
    const res = http.get(
      `${data.baseUrl}${API_BASE}?page=${pageNum}&pageSize=${pageSize}`,
      { headers: authHeaders(data.token), tags: { name: 'hazard_deep_pagination' } }
    );
    read_duration.add(Date.now() - readStart);
    crud_total.add(1);

    check(res, {
      '深度分页 200': (r) => r.status === 200,
      '深度分页返回有效结构': (r) => {
        const body = r.json();
        return body !== null && typeof body === 'object';
      },
      '深度分页 P95<500ms': (r) => r.timings.duration < 500,
    });

    sleep(0.5);
  } else {
    // ── 高级搜索（多条件组合） ──
    const conditions = [];
    const level = LEVELS[Math.floor(Math.random() * LEVELS.length)];
    const dept = DEPARTMENTS[Math.floor(Math.random() * DEPARTMENTS.length)];
    const statuses = ['pending', 'processing', 'resolved', 'closed'];
    const status = statuses[Math.floor(Math.random() * statuses.length)];

    conditions.push(`level=${level}`);
    conditions.push(`department=${encodeURIComponent(dept)}`);
    conditions.push(`status=${status}`);

    // 随机添加日期范围
    if (Math.random() < 0.5) {
      const startDate = '2026-01-01';
      const endDate = '2026-07-11';
      conditions.push(`startDate=${startDate}`);
      conditions.push(`endDate=${endDate}`);
    }

    const queryString = conditions.join('&');

    const searchStart = Date.now();
    const res = http.get(
      `${data.baseUrl}${API_BASE}?${queryString}`,
      { headers: authHeaders(data.token), tags: { name: 'hazard_advanced_search' } }
    );
    search_duration.add(Date.now() - searchStart);
    crud_total.add(1);

    check(res, {
      '高级搜索 200': (r) => r.status === 200,
      '高级搜索返回有效结构': (r) => {
        const body = r.json();
        return body !== null && typeof body === 'object';
      },
      '高级搜索 P95<800ms': (r) => r.timings.duration < 800,
    });

    sleep(0.5);
  }
}

// ─── 默认函数 ─────────────────────────────────────────────────
export default function (data) {
  // 由场景 exec 指定
}

// ─── Teardown：清理所有 [PERF-TEST] 数据 ──────────────────────
export function teardown(data) {
  console.log(`[TEARDOWN] 开始清理 ${created_ids.length} 条测试隐患...`);

  const headers = authHeaders(data.token);
  let cleaned = 0;
  let failed = 0;

  for (const id of created_ids) {
    if (!id) continue;
    const res = http.del(
      `${data.baseUrl}${API_BASE}/${id}`,
      null,
      { headers }
    );
    if (res.status === 200 || res.status === 204 || res.status === 404) {
      cleaned++;
    } else {
      failed++;
      console.warn(`[TEARDOWN] 清理失败 id=${id}, status=${res.status}`);
    }
  }

  console.log(`[TEARDOWN] 清理完成：成功 ${cleaned}，失败 ${failed}`);
  created_ids.length = 0;
}

// ─── 自定义 Summary ─────────────────────────────────────────────
export function handleSummary(data) {
  return {
    stdout: textSummary(data, { indent: ' ', enableColors: true }) + '\n\n' +
      `═══ 隐患 CRUD 全链路压测摘要 ═══\n` +
      `  创建 P95:     ${data.metrics.create_duration?.values['p(95)']?.toFixed(1) || 'N/A'} ms\n` +
      `  查询列表 P95: ${data.metrics.read_duration?.values['p(95)']?.toFixed(1) || 'N/A'} ms\n` +
      `  查询详情 P95: ${data.metrics.read_detail_duration?.values['p(95)']?.toFixed(1) || 'N/A'} ms\n` +
      `  搜索 P95:     ${data.metrics.search_duration?.values['p(95)']?.toFixed(1) || 'N/A'} ms\n` +
      `  更新 P95:     ${data.metrics.update_duration?.values['p(95)']?.toFixed(1) || 'N/A'} ms\n` +
      `  删除 P95:     ${data.metrics.delete_duration?.values['p(95)']?.toFixed(1) || 'N/A'} ms\n` +
      `  完整闭环 P95: ${data.metrics.full_cycle_duration?.values['p(95)']?.toFixed(1) || 'N/A'} ms\n` +
      `  错误率:       ${(data.metrics.crud_error_rate?.values['rate'] * 100 || 0).toFixed(2)}%\n` +
      `  冲突率:       ${(data.metrics.conflict_rate?.values['rate'] * 100 || 0).toFixed(2)}%\n` +
      `  总操作数:     ${data.metrics.crud_total?.values['count'] || 0}\n`,
    'summary.json': JSON.stringify(data),
    'hazards_metrics.json': JSON.stringify({
      create_p95: data.metrics.create_duration?.values['p(95)'],
      read_p95: data.metrics.read_duration?.values['p(95)'],
      read_detail_p95: data.metrics.read_detail_duration?.values['p(95)'],
      search_p95: data.metrics.search_duration?.values['p(95)'],
      update_p95: data.metrics.update_duration?.values['p(95)'],
      delete_p95: data.metrics.delete_duration?.values['p(95)'],
      full_cycle_p95: data.metrics.full_cycle_duration?.values['p(95)'],
      error_rate: data.metrics.crud_error_rate?.values['rate'],
      conflict_rate: data.metrics.conflict_rate?.values['rate'],
      total_operations: data.metrics.crud_total?.values['count'],
    }, null, 2),
  };
}
