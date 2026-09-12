/**
 * Prometheus 格式指标收集器（零外部依赖）
 *
 * 支持指标类型：
 *   - counter:   单调递增计数器（如请求总数）
 *   - gauge:     可增可减的仪表盘（如当前连接数）
 *   - histogram: 分桶直方图（如请求延迟分布）
 *
 * 导出方法：
 *   - getMetricsString()                    返回 Prometheus 文本格式指标
 *   - middleware()                           Express 中间件，自动收集 HTTP 请求指标
 *   - recordDbQuery(type, durationMs)        记录数据库查询指标
 *   - recordAiRequest(provider, type, status, durationMs)  记录 AI 请求指标
 */

'use strict';

// ============ 内部存储 ============

/** counter 存储: Map<metricName, Map<labelKey, Map<labelValue, number>>> */
const counters = new Map();

/** gauge 存储: Map<metricName, Map<labelKey, Map<labelValue, number>>> */
const gauges = new Map();

/** histogram 存储: Map<metricName, { help, buckets, data: Map<labelKey, Map<labelValue, { sum, count, buckets }>> }> */
const histograms = new Map();

/** process_cpu_usage 上一次采样时间（用于计算 CPU 使用率） */
let _lastCpuSample = { time: process.hrtime(), usage: process.cpuUsage() };

// ============ 标签工具函数 ============

/**
 * 将标签对象转为 Prometheus 格式字符串
 * @param {Object} labels - 标签键值对
 * @returns {string} - 如: method="GET",route="/api/health"
 */
function formatLabels(labels) {
  const keys = Object.keys(labels).sort();
  if (keys.length === 0) return '';
  return keys.map(k => `${k}="${String(labels[k]).replace(/"/g, '\\"')}"`).join(',');
}

/**
 * 获取标签 Map 的嵌套结构
 * @param {Map} parent - 父级 Map
 * @param {Object} labels - 标签键值对
 * @param {*} initialValue - 标签对应的初始值
 * @returns {*} - 标签对应的值
 */
function getLabelsEntry(parent, labels, initialValue) {
  const labelStr = formatLabels(labels);
  if (!parent.has(labelStr)) {
    parent.set(labelStr, initialValue);
  }
  return parent.get(labelStr);
}

// ============ Counter 操作 ============

/**
 * 增加 counter 值
 * @param {string} name - 指标名
 * @param {number} value - 增量（默认1）
 * @param {Object} labels - 标签
 */
function incCounter(name, value, labels) {
  value = value || 1;
  labels = labels || {};
  if (!counters.has(name)) {
    counters.set(name, new Map());
  }
  const labelMap = counters.get(name);
  const current = getLabelsEntry(labelMap, labels, 0);
  labelMap.set(formatLabels(labels), current + value);
}

// ============ Gauge 操作 ============

/**
 * 设置 gauge 值
 * @param {string} name - 指标名
 * @param {number} value - 目标值
 * @param {Object} labels - 标签
 */
function setGauge(name, value, labels) {
  labels = labels || {};
  if (!gauges.has(name)) {
    gauges.set(name, new Map());
  }
  gauges.get(name).set(formatLabels(labels), value);
}

/**
 * 增加 gauge 值
 * @param {string} name - 指标名
 * @param {number} value - 增量
 * @param {Object} labels - 标签
 */
function incGauge(name, value, labels) {
  value = value || 1;
  labels = labels || {};
  if (!gauges.has(name)) {
    gauges.set(name, new Map());
  }
  const labelMap = gauges.get(name);
  const current = getLabelsEntry(labelMap, labels, 0);
  labelMap.set(formatLabels(labels), current + value);
}

/**
 * 减少 gauge 值
 * @param {string} name - 指标名
 * @param {number} value - 减量
 * @param {Object} labels - 标签
 */
function decGauge(name, value, labels) {
  value = value || 1;
  incGauge(name, -value, labels);
}

// ============ Histogram 操作 ============

/** 默认 histogram 分桶边界（秒） */
const DEFAULT_BUCKETS = [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10];

/**
 * 注册一个 histogram 指标
 * @param {string} name - 指标名
 * @param {string} help - 帮助文本
 * @param {number[]} buckets - 分桶边界（秒）
 */
function registerHistogram(name, help, buckets) {
  if (histograms.has(name)) return;
  histograms.set(name, {
    help: help,
    buckets: buckets || DEFAULT_BUCKETS,
    data: new Map()
  });
}

/**
 * 记录 histogram 观测值
 * @param {string} name - 指标名
 * @param {number} valueSeconds - 观测值（秒）
 * @param {Object} labels - 标签
 */
function observeHistogram(name, valueSeconds, labels) {
  labels = labels || {};
  if (!histograms.has(name)) {
    registerHistogram(name, '', DEFAULT_BUCKETS);
  }
  const hist = histograms.get(name);
  const labelStr = formatLabels(labels);
  if (!hist.data.has(labelStr)) {
    hist.data.set(labelStr, { sum: 0, count: 0, buckets: {} });
    // 初始化所有桶为 0
    for (let i = 0; i < hist.buckets.length; i++) {
      hist.data.get(labelStr).buckets[hist.buckets[i]] = 0;
    }
    // +Inf 桶
    hist.data.get(labelStr).buckets['+Inf'] = 0;
  }
  const entry = hist.data.get(labelStr);
  entry.sum += valueSeconds;
  entry.count += 1;
  // 统计每个桶（桶值 <= 观测值 的都 +1）
  for (let i = 0; i < hist.buckets.length; i++) {
    if (valueSeconds <= hist.buckets[i]) {
      entry.buckets[hist.buckets[i]] += 1;
    }
  }
  // +Inf 桶总是 +1
  entry.buckets['+Inf'] += 1;
}

// ============ 注册预定义指标 ============

// 1. http_requests_total - counter
const HTTP_REQUESTS_TOTAL = 'http_requests_total';
const HTTP_REQUESTS_TOTAL_HELP = 'Total HTTP requests';

// 2. http_request_duration_seconds - histogram
const HTTP_REQ_DURATION = 'http_request_duration_seconds';
const HTTP_REQ_DURATION_HELP = 'HTTP request duration in seconds';
registerHistogram(HTTP_REQ_DURATION, HTTP_REQ_DURATION_HELP, [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10]);

// 3. db_pool_active_connections - gauge
const DB_POOL_ACTIVE = 'db_pool_active_connections';
const DB_POOL_ACTIVE_HELP = 'Number of active database connections';

// 4. db_pool_idle_connections - gauge
const DB_POOL_IDLE = 'db_pool_idle_connections';
const DB_POOL_IDLE_HELP = 'Number of idle database connections';

// 5. db_query_duration_seconds - histogram
const DB_QUERY_DURATION = 'db_query_duration_seconds';
const DB_QUERY_DURATION_HELP = 'Database query duration in seconds';
registerHistogram(DB_QUERY_DURATION, DB_QUERY_DURATION_HELP, [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10]);

// 6. ws_active_connections - gauge
const WS_ACTIVE_CONN = 'ws_active_connections';
const WS_ACTIVE_CONN_HELP = 'Number of active WebSocket connections';

// 7. process_cpu_usage - gauge
const PROCESS_CPU = 'process_cpu_usage';
const PROCESS_CPU_HELP = 'Process CPU usage percentage';

// 8. process_memory_bytes - gauge
const PROCESS_MEM = 'process_memory_bytes';
const PROCESS_MEM_HELP = 'Process memory usage in bytes';

// 9. cache_hit_rate - gauge
const CACHE_HIT_RATE = 'cache_hit_rate';
const CACHE_HIT_RATE_HELP = 'Cache hit rate (0-1)';

// 10. ai_requests_total - counter
const AI_REQUESTS_TOTAL = 'ai_requests_total';
const AI_REQUESTS_TOTAL_HELP = 'Total AI requests';

// 11. ai_response_duration_seconds - histogram
const AI_RESP_DURATION = 'ai_response_duration_seconds';
const AI_RESP_DURATION_HELP = 'AI response duration in seconds';
registerHistogram(AI_RESP_DURATION, AI_RESP_DURATION_HELP, [0.5, 1, 2, 5, 10, 30, 60]);

// ============ 渲染函数 ============

/**
 * 渲染 counter 指标为 Prometheus 文本格式
 */
function renderCounter(name, help) {
  let output = '';
  if (help) {
    output += `# HELP ${name} ${help}\n`;
  }
  output += `# TYPE ${name} counter\n`;
  if (!counters.has(name)) return output;
  const labelMap = counters.get(name);
  for (const [labelStr, value] of labelMap) {
    if (labelStr) {
      output += `${name}{${labelStr}} ${value}\n`;
    } else {
      output += `${name} ${value}\n`;
    }
  }
  return output;
}

/**
 * 渲染 gauge 指标为 Prometheus 文本格式
 */
function renderGauge(name, help) {
  let output = '';
  if (help) {
    output += `# HELP ${name} ${help}\n`;
  }
  output += `# TYPE ${name} gauge\n`;
  if (!gauges.has(name)) return output;
  const labelMap = gauges.get(name);
  for (const [labelStr, value] of labelMap) {
    if (labelStr) {
      output += `${name}{${labelStr}} ${value}\n`;
    } else {
      output += `${name} ${value}\n`;
    }
  }
  return output;
}

/**
 * 渲染 histogram 指标为 Prometheus 文本格式
 */
function renderHistogram(name) {
  if (!histograms.has(name)) return '';
  const hist = histograms.get(name);
  let output = '';
  if (hist.help) {
    output += `# HELP ${name} ${hist.help}\n`;
  }
  output += `# TYPE ${name} histogram\n`;

  for (const [labelStr, entry] of hist.data) {
    // bucket 行（含 +Inf）
    const sortedBuckets = hist.buckets.slice().sort((a, b) => a - b);
    // 计算累积值
    let cumulative = 0;
    for (const le of sortedBuckets) {
      cumulative += entry.buckets[le] || 0;
      if (labelStr) {
        output += `${name}_bucket{${labelStr},le="${le}"} ${cumulative}\n`;
      } else {
        output += `${name}_bucket{le="${le}"} ${cumulative}\n`;
      }
    }
    // +Inf 行（count）
    if (labelStr) {
      output += `${name}_bucket{${labelStr},le="+Inf"} ${entry.count}\n`;
    } else {
      output += `${name}_bucket{le="+Inf"} ${entry.count}\n`;
    }
    // _count 和 _sum
    if (labelStr) {
      output += `${name}_count{${labelStr}} ${entry.count}\n`;
      output += `${name}_sum{${labelStr}} ${entry.sum}\n`;
    } else {
      output += `${name}_count ${entry.count}\n`;
      output += `${name}_sum ${entry.sum}\n`;
    }
  }
  return output;
}

// ============ 公开 API ============

/**
 * 返回所有指标的 Prometheus 文本格式字符串
 * @returns {string}
 */
function getMetricsString() {
  // 采样进程级指标
  const mem = process.memoryUsage();
  setGauge(PROCESS_MEM + '_rss', mem.rss);
  setGauge(PROCESS_MEM + '_heap_used', mem.heapUsed);
  setGauge(PROCESS_MEM + '_heap_total', mem.heapTotal);
  setGauge(PROCESS_MEM + '_external', mem.external);

  // 计算 CPU 使用率（自上次采样以来的增量）
  const now = process.hrtime();
  const cpuUsage = process.cpuUsage();
  const elapsedMs = (now[0] - _lastCpuSample.time[0]) * 1000
    + (now[1] - _lastCpuSample.time[1]) / 1e6;
  const userMs = cpuUsage.user - _lastCpuSample.usage.user;
  const sysMs = cpuUsage.system - _lastCpuSample.usage.system;
  if (elapsedMs > 0) {
    const cpuPercent = ((userMs + sysMs) / (elapsedMs * 1000)) * 100;
    setGauge(PROCESS_CPU, Math.round(cpuPercent * 100) / 100);
  }
  _lastCpuSample = { time: now, usage: cpuUsage };

  // 数据库连接池指标
  try {
    const { pool } = require('./config/db');
    if (pool && pool.totalCount !== undefined) {
      setGauge(DB_POOL_ACTIVE, pool.totalCount - pool.idleCount);
      setGauge(DB_POOL_IDLE, pool.idleCount);
    }
  } catch (e) { /* 数据库配置模块未加载 */ }

  // 组装输出
  let output = '';

  // 进程指标
  output += renderGauge(PROCESS_CPU, PROCESS_CPU_HELP);
  output += '# HELP ' + PROCESS_MEM + ' ' + PROCESS_MEM_HELP + '\n';
  output += '# TYPE ' + PROCESS_MEM + ' gauge\n';
  output += renderGauge(PROCESS_MEM + '_rss', '');
  output += renderGauge(PROCESS_MEM + '_heap_used', '');
  output += renderGauge(PROCESS_MEM + '_heap_total', '');
  output += renderGauge(PROCESS_MEM + '_external', '');

  // HTTP 请求指标
  output += renderCounter(HTTP_REQUESTS_TOTAL, HTTP_REQUESTS_TOTAL_HELP);
  output += renderHistogram(HTTP_REQ_DURATION);

  // 数据库连接池指标
  output += renderGauge(DB_POOL_ACTIVE, DB_POOL_ACTIVE_HELP);
  output += renderGauge(DB_POOL_IDLE, DB_POOL_IDLE_HELP);
  output += renderHistogram(DB_QUERY_DURATION);

  // WebSocket 指标
  output += renderGauge(WS_ACTIVE_CONN, WS_ACTIVE_CONN_HELP);

  // 缓存指标
  output += renderGauge(CACHE_HIT_RATE, CACHE_HIT_RATE_HELP);

  // AI 指标
  output += renderCounter(AI_REQUESTS_TOTAL, AI_REQUESTS_TOTAL_HELP);
  output += renderHistogram(AI_RESP_DURATION);

  return output;
}

/**
 * Express 中间件：自动收集 HTTP 请求指标
 * - 记录每个请求的 method、route、status_code
 * - 记录请求耗时（histogram）
 */
function middleware() {
  return function (req, res, next) {
    const startTime = Date.now();

    // 在响应结束时采集指标
    res.on('finish', () => {
      const durationMs = Date.now() - startTime;
      const durationSec = durationMs / 1000;
      const route = req.route ? req.route.path : (req.baseUrl + req.path);

      // 计数器：按 method、route、status_code 标签
      incCounter(HTTP_REQUESTS_TOTAL, 1, {
        method: req.method,
        route: route,
        status_code: String(res.statusCode)
      });

      // 直方图：请求耗时
      observeHistogram(HTTP_REQ_DURATION, durationSec, {
        method: req.method,
        route: route
      });
    });

    next();
  };
}

/**
 * 记录数据库查询指标
 * @param {string} type - 查询类型（如 'select', 'insert', 'update', 'delete', 'other'）
 * @param {number} durationMs - 查询耗时（毫秒）
 */
function recordDbQuery(type, durationMs) {
  const durationSec = durationMs / 1000;
  observeHistogram(DB_QUERY_DURATION, durationSec, { query_type: type });
}

/**
 * 记录 AI 请求指标
 * @param {string} provider - AI 提供商（如 'grok', 'ollama'）
 * @param {string} type - 请求类型（如 'chat', 'chat_stream', 'report'）
 * @param {string} status - 请求状态（如 'success', 'error', 'timeout'）
 * @param {number} durationMs - 请求耗时（毫秒）
 */
function recordAiRequest(provider, type, status, durationMs) {
  // 计数器
  incCounter(AI_REQUESTS_TOTAL, 1, {
    provider: provider,
    type: type,
    status: status
  });

  // 直方图
  const durationSec = durationMs / 1000;
  observeHistogram(AI_RESP_DURATION, durationSec, {
    provider: provider,
    type: type
  });
}

// ============ 模块导出 ============
module.exports = {
  getMetricsString,
  middleware,
  recordDbQuery,
  recordAiRequest,
  // 以下供高级用户直接操作
  incCounter,
  setGauge,
  incGauge,
  decGauge,
  observeHistogram
};
