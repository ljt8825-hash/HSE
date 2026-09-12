/**
 * 05-personnel-query.js — 人员管理大数据量查询压测 (P1)
 *
 * 测试场景：
 *   1. 分页查询（pageSize=20/50/100，不同页码）
 *   2. 按姓名/部门/岗位搜索
 *   3. 保险状态筛选
 *   4. 全量导出（如果 API 支持）
 *
 * 关键指标：
 *   - 分页 P95 < 300ms
 *   - 搜索 P95 < 500ms
 *   - 导出 < 5s
 *
 * 用法：k6 run 05-personnel-query.js
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
  getRecords,
  searchRecords,
} from '../helpers/crud.js';
import {
  randomPersonnel,
  randomSearchQuery,
} from '../helpers/data-factory.js';
import { handleSummary } from '../helpers/reporting.js';

// ─── 自定义指标 ────────────────────────────────────────────────
const query_duration = new Trend('query_duration', true);             // 分页查询耗时
const search_duration = new Trend('search_duration', true);          // 搜索耗时
const export_duration = new Trend('export_duration', true);          // 导出耗时
const query_error_rate = new Rate('query_error_rate');                // 查询错误率
const export_error_rate = new Rate('export_error_rate');               // 导出错误率
const query_total = new Counter('query_total');                       // 总查询数
const export_total = new Counter('export_total');                     // 总导出数
const page_size_counter = new Counter('page_size_counter');           // 各 pageSize 请求数（按 tag）
const result_size = new Trend('result_size', true);                   // 返回结果集大小（字节）

// ─── 测试常量 ──────────────────────────────────────────────────
const API_BASE = '/api/personnel';
const PAGE_SIZES = [20, 50, 100];
const DEPARTMENTS = ['清扫一队', '清扫二队', '垃圾清运队', '设施维护队', '质检组', '办公室', '车队'];
const POSITIONS = ['驾驶员', '清扫工', '班长', '队长', '安全员', '质检员', '维修工', '管理员'];
const INSURANCE_STATUSES = ['insured', 'expired', 'uninsured', 'pending'];

// ─── 模拟姓名库（用于模糊搜索） ─────────────────────────────────
const SAMPLE_NAMES = [
  '张', '王', '李', '赵', '刘', '陈', '杨', '黄', '周', '吴',
  '徐', '孙', '马', '胡', '朱', '郭', '何', '林', '罗', '高',
  '伟', '芳', '娜', '秀英', '敏', '静', '丽', '强', '磊', '洋',
  '勇', '艳', '杰', '涛', '明', '超', '秀兰', '霞', '平', '刚',
];

// ─── K6 配置 ──────────────────────────────────────────────────
export const options = {
  scenarios: {
    // 主场景：分页查询负载
    loadTest: {
      ...scenarios.loadTest,
      exec: 'paginationQuery',
      tags: { scenario: 'loadTest', type: 'pagination' },
    },
    // 辅助场景：搜索 + 保险筛选
    searchTest: {
      executor: 'constant-vus',
      vus: 10,
      duration: '30s',
      exec: 'searchAndFilter',
      startTime: '10s',
      tags: { scenario: 'searchTest', type: 'search' },
    },
    // 辅助场景：导出（低并发，长耗时）
    exportTest: {
      executor: 'constant-vus',
      vus: 3,
      iterations: 15,
      exec: 'exportPersonnel',
      startTime: '45s',
      tags: { scenario: 'exportTest', type: 'export' },
    },
  },
  thresholds: {
    ...thresholds.standard,
    // 分页查询 P95 < 300ms
    'query_duration': ['p(95)<300', 'p(99)<600'],
    // 搜索 P95 < 500ms
    'search_duration': ['p(95)<500', 'p(99)<1000'],
    // 导出 P95 < 5000ms (5s)
    'export_duration': ['p(95)<5000', 'p(99)<10000'],
    // 查询错误率
    'query_error_rate': ['rate<0.02'],
    // 导出错误率
    'export_error_rate': ['rate<0.05'],
    // HTTP 错误率
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

  // 预检：获取人员总数用于验证分页
  const preRes = http.get(
    `${baseUrl}${API_BASE}?page=1&pageSize=1`,
    { headers: authHeaders(token) }
  );
  if (preRes.status === 200) {
    const body = preRes.json();
    const total = body.total || body.data?.total || body.pagination?.total || '未知';
    console.log(`[SETUP] 人员总数: ${total}`);
  } else {
    console.warn(`[SETUP] 预检失败: status=${preRes.status}`);
  }

  console.log('[SETUP] 人员管理压测准备完成');
  return { baseUrl, token };
}

// ─── 场景 1：分页查询 ──────────────────────────────────────────
export function paginationQuery(data) {
  // 随机选择 pageSize
  const pageSize = PAGE_SIZES[Math.floor(Math.random() * PAGE_SIZES.length)];

  // 随机选择页码：80% 前几页，20% 深页
  let page;
  if (Math.random() < 0.8) {
    page = Math.floor(Math.random() * 5) + 1; // 1~5
  } else {
    page = Math.floor(Math.random() * 100) + 1; // 1~100
  }

  const queryStart = Date.now();
  const res = http.get(
    `${data.baseUrl}${API_BASE}?page=${page}&pageSize=${pageSize}`,
    {
      headers: authHeaders(data.token),
      tags: { name: 'personnel_pagination', pageSize, page },
    }
  );
  const duration = Date.now() - queryStart;
  query_duration.add(duration);
  query_total.add(1);
  result_size.add(res.body ? res.body.length : 0);

  const isOk = check(res, {
    '分页查询 200': (r) => r.status === 200,
    '返回分页结构': (r) => {
      const body = r.json();
      return body && (
        Array.isArray(body) ||
        Array.isArray(body.data) ||
        body.items !== undefined ||
        body.pagination !== undefined
      );
    },
    '分页数量 <= pageSize': (r) => {
      const body = r.json();
      const items = body.data || body.items || body || [];
      if (!Array.isArray(items)) return true;
      return items.length <= pageSize;
    },
    '分页 P95<300ms': (r) => r.timings.duration < 300,
  });

  if (!isOk) {
    query_error_rate.add(1);
  } else {
    query_error_rate.add(0);
  }

  sleep(Math.random() * 0.3 + 0.3);
}

// ─── 场景 2：搜索 + 保险筛选 ────────────────────────────────────
export function searchAndFilter(data) {
  const action = Math.random();

  if (action < 0.25) {
    // ── 按姓名搜索（模糊） ──
    const surname = SAMPLE_NAMES[Math.floor(Math.random() * SAMPLE_NAMES.length)];

    const searchStart = Date.now();
    const res = http.get(
      `${data.baseUrl}${API_BASE}?name=${encodeURIComponent(surname)}`,
      {
        headers: authHeaders(data.token),
        tags: { name: 'personnel_search_name', searchType: 'name' },
      }
    );
    search_duration.add(Date.now() - searchStart);
    query_total.add(1);

    check(res, {
      '姓名搜索 200': (r) => r.status === 200,
      '姓名搜索返回结果': (r) => r.json() !== null,
      '姓名搜索 P95<500ms': (r) => r.timings.duration < 500,
    });

    sleep(0.3);

  } else if (action < 0.50) {
    // ── 按部门搜索 ──
    const dept = DEPARTMENTS[Math.floor(Math.random() * DEPARTMENTS.length)];

    const searchStart = Date.now();
    const res = http.get(
      `${data.baseUrl}${API_BASE}?department=${encodeURIComponent(dept)}`,
      {
        headers: authHeaders(data.token),
        tags: { name: 'personnel_search_dept', searchType: 'department' },
      }
    );
    search_duration.add(Date.now() - searchStart);
    query_total.add(1);

    check(res, {
      '部门搜索 200': (r) => r.status === 200,
      '部门搜索返回结果': (r) => r.json() !== null,
      '部门搜索 P95<500ms': (r) => r.timings.duration < 500,
    });

    sleep(0.3);

  } else if (action < 0.75) {
    // ── 按岗位搜索 ──
    const position = POSITIONS[Math.floor(Math.random() * POSITIONS.length)];

    const searchStart = Date.now();
    const res = http.get(
      `${data.baseUrl}${API_BASE}?position=${encodeURIComponent(position)}`,
      {
        headers: authHeaders(data.token),
        tags: { name: 'personnel_search_position', searchType: 'position' },
      }
    );
    search_duration.add(Date.now() - searchStart);
    query_total.add(1);

    check(res, {
      '岗位搜索 200': (r) => r.status === 200,
      '岗位搜索返回结果': (r) => r.json() !== null,
      '岗位搜索 P95<500ms': (r) => r.timings.duration < 500,
    });

    sleep(0.3);

  } else {
    // ── 按保险状态筛选 ──
    const insuranceStatus = INSURANCE_STATUSES[Math.floor(Math.random() * INSURANCE_STATUSES.length)];

    const searchStart = Date.now();
    const res = http.get(
      `${data.baseUrl}${API_BASE}?insuranceStatus=${insuranceStatus}`,
      {
        headers: authHeaders(data.token),
        tags: { name: 'personnel_filter_insurance', filterType: 'insurance' },
      }
    );
    search_duration.add(Date.now() - searchStart);
    query_total.add(1);

    check(res, {
      '保险筛选 200': (r) => r.status === 200,
      '保险筛选返回结果': (r) => r.json() !== null,
      '保险筛选 P95<500ms': (r) => r.timings.duration < 500,
    });

    // 额外验证：结果中人员保险状态匹配
    if (res.status === 200) {
      const body = res.json();
      const items = body.data || body.items || body || [];
      if (Array.isArray(items) && items.length > 0) {
        check(items[0], {
          '返回数据包含保险字段': (item) =>
            item.insuranceStatus !== undefined ||
            item.insurance_status !== undefined ||
            item.insured !== undefined,
        });
      }
    }

    sleep(0.3);
  }
}

// ─── 场景 3：全量导出 ─────────────────────────────────────────
export function exportPersonnel(data) {
  const exportFormats = ['csv', 'xlsx', 'json'];
  const format = exportFormats[Math.floor(Math.random() * exportFormats.length)];

  const exportStart = Date.now();
  const res = http.get(
    `${data.baseUrl}${API_BASE}/export?format=${format}`,
    {
      headers: {
        'Authorization': `Bearer ${data.token}`,
        'Accept': format === 'csv' ? 'text/csv' : format === 'xlsx'
          ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          : 'application/json',
      },
      tags: { name: 'personnel_export', format },
      timeout: '30s', // 导出可能较慢
    }
  );
  const duration = Date.now() - exportStart;
  export_duration.add(duration);
  export_total.add(1);

  // 导出可能返回 200 或 202（异步任务）
  const isOk = check(res, {
    '导出 200/202': (r) => r.status === 200 || r.status === 202,
    '导出时间 < 5s': (r) => r.timings.duration < 5000,
  });

  if (isOk) {
    export_error_rate.add(0);

    // 如果是同步导出，验证返回内容
    if (res.status === 200) {
      check(res, {
        '导出返回非空内容': (r) => r.body && r.body.length > 0,
        'CSV 包含标题行': (r) => {
          if (format !== 'csv') return true;
          return r.body.includes('姓名') || r.body.includes('name') || r.body.includes('部门');
        },
      });
    }
  } else {
    export_error_rate.add(1);
    // 404 表示不支持导出接口，仅记录不影响测试
    if (res.status === 404) {
      console.warn(`[EXPORT] 导出接口不可用 (404)，format=${format}`);
    }
  }

  sleep(2);
}

// ─── 默认函数 ─────────────────────────────────────────────────
export default function (data) {
  // 由场景 exec 指定
}

// ─── Teardown ──────────────────────────────────────────────────
export function teardown(data) {
  // 人员查询测试仅读取，无需清理数据
  console.log(`[TEARDOWN] 人员管理压测完成，总查询 ${data.query_total || 'N/A'}`);
}

// ─── 自定义 Summary ─────────────────────────────────────────────
export function handleSummary(data) {
  const queryP95 = data.metrics.query_duration?.values['p(95)'] || 0;
  const searchP95 = data.metrics.search_duration?.values['p(95)'] || 0;
  const exportP95 = data.metrics.export_duration?.values['p(95)'] || 0;
  const queryErrorRate = data.metrics.query_error_rate?.values['rate'] || 0;
  const exportErrorRate = data.metrics.export_error_rate?.values['rate'] || 0;
  const totalQueries = data.metrics.query_total?.values['count'] || 0;
  const totalExports = data.metrics.export_total?.values['count'] || 0;
  const avgResultSize = data.metrics.result_size?.values['avg'] || 0;

  return {
    stdout: textSummary(data, { indent: ' ', enableColors: true }) + '\n\n' +
      `═══ 人员管理查询压测摘要 ═══\n` +
      `  分页查询 P95: ${queryP95.toFixed(1)} ms (目标 < 300ms)\n` +
      `  搜索 P95:     ${searchP95.toFixed(1)} ms (目标 < 500ms)\n` +
      `  导出 P95:     ${exportP95.toFixed(1)} ms (目标 < 5000ms)\n` +
      `  查询错误率:   ${(queryErrorRate * 100).toFixed(2)}%\n` +
      `  导出错误率:   ${(exportErrorRate * 100).toFixed(2)}%\n` +
      `  总查询数:     ${totalQueries}\n` +
      `  总导出数:     ${totalExports}\n` +
      `  平均响应大小: ${(avgResultSize / 1024).toFixed(1)} KB\n`,
    'summary.json': JSON.stringify(data),
    'personnel_metrics.json': JSON.stringify({
      query_p95: queryP95,
      query_p99: data.metrics.query_duration?.values['p(99)'],
      search_p95: searchP95,
      search_p99: data.metrics.search_duration?.values['p(99)'],
      export_p95: exportP95,
      export_p99: data.metrics.export_duration?.values['p(99)'],
      query_error_rate: queryErrorRate,
      export_error_rate: exportErrorRate,
      total_queries: totalQueries,
      total_exports: totalExports,
      avg_result_size_bytes: avgResultSize,
    }, null, 2),
  };
}
