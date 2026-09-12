/**
 * 宁津环卫 HSE 安全管理系统 v4.1 - k6 自定义报告 Helper
 *
 * 功能：
 *   - handleSummary() - 输出摘要到 console 和 JSON 文件
 *   - 按端点分组统计
 *   - 包含：总请求数、成功率、P50/P95/P99 延迟、吞吐量
 *
 * 使用方式：
 *   import { handleSummary } from './helpers/reporting.js';
 *   export { handleSummary };
 */

import { textSummary } from 'k6';

// ============================================================
// 自定义摘要处理
// ============================================================

/**
 * 生成按端点分组的统计数据
 * @param {object} metrics - k6 metrics 对象
 * @returns {object}
 */
function buildEndpointStats(metrics) {
  const endpointGroups = {};

  // 从 http_req 的 tags 中提取按 endpoint 分组的数据
  if (metrics.http_req_duration && metrics.http_req_duration.values) {
    // k6 不直接提供按 tag 分组的聚合，这里返回整体统计
    // 具体 per-endpoint 分析需依赖 k6 --out json + 后处理
  }

  return endpointGroups;
}

/**
 * 格式化延迟统计
 * @param {object} values - metric values
 * @returns {object}
 */
function formatTimingStats(values) {
  return {
    min: values.min !== undefined ? `${Math.round(values.min)}ms` : 'N/A',
    avg: values.avg !== undefined ? `${Math.round(values.avg)}ms` : 'N/A',
    med: values.med !== undefined ? `${Math.round(values.med)}ms` : 'N/A',
    'p(90)': values['p(90)'] !== undefined ? `${Math.round(values['p(90)'])}ms` : 'N/A',
    'p(95)': values['p(95)'] !== undefined ? `${Math.round(values['p(95)'])}ms` : 'N/A',
    'p(99)': values['p(99)'] !== undefined ? `${Math.round(values['p(99)'])}ms` : 'N/A',
    max: values.max !== undefined ? `${Math.round(values.max)}ms` : 'N/A',
  };
}

/**
 * 自定义 handleSummary
 * 输出到 console 和 JSON 文件
 *
 * @param {object} metrics - k6 结束时传入的 metrics 对象
 * @returns {object} k6 summary 处理器返回格式
 */
export function handleSummary(metrics) {
  const duration = metrics.http_req_duration?.values || {};
  const waiting = metrics.http_req_waiting?.values || {};
  const errors = metrics.http_req_failed?.values || {};
  const requests = metrics.http_reqs?.values || {};
  const iterations = metrics.iterations?.values || {};

  // 计算核心指标
  const totalRequests = requests.count || 0;
  const failedRequests = errors.count || 0;
  const errorRate = totalRequests > 0 ? (failedRequests / totalRequests * 100) : 0;
  const successRate = 100 - errorRate;

  // 吞吐量
  const testDuration = metrics.test_duration?.value || 0; // 秒
  const throughput = testDuration > 0 ? (totalRequests / testDuration) : 0;

  // 构建摘要数据
  const summaryData = {
    testInfo: {
      environment: __ENV.ENV || 'local',
      thresholdLevel: __ENV.THRESHOLD_LEVEL || 'P1',
      scenario: __ENV.SCENARIO || 'default',
      timestamp: new Date().toISOString(),
    },
    overview: {
      totalRequests: totalRequests,
      successfulRequests: totalRequests - failedRequests,
      failedRequests: failedRequests,
      successRate: `${successRate.toFixed(2)}%`,
      errorRate: `${errorRate.toFixed(2)}%`,
      testDuration: `${testDuration.toFixed(2)}s`,
      throughput: `${throughput.toFixed(2)} req/s`,
      iterations: iterations.count || 0,
    },
    responseTime: {
      total: formatTimingStats(duration),
      waiting: formatTimingStats(waiting),
    },
    checks: {},
    thresholds: {},
  };

  // 添加 checks 统计
  if (metrics.checks) {
    for (const [name, metric] of Object.entries(metrics.checks)) {
      if (metric.values) {
        summaryData.checks[name] = {
          passes: metric.values.passes || 0,
          fails: metric.values.fails || 0,
          passRate: metric.values.rate !== undefined
            ? `${(metric.values.rate * 100).toFixed(2)}%`
            : 'N/A',
        };
      }
    }
  }

  // 添加 thresholds 结果
  for (const [name, metric] of Object.entries(metrics)) {
    if (name.startsWith('thresholds') && metric.values) {
      summaryData.thresholds[name] = metric.values;
    }
  }

  // 控制台输出摘要
  const consoleText = buildConsoleSummary(summaryData);

  return {
    'stdout': consoleText,
    'performance-summary.json': JSON.stringify(summaryData, null, 2),
    // 使用 k6 内置的 textSummary 作为 fallback
    ...textSummary(metrics, { indent: '  ' }),
  };
}

/**
 * 构建控制台摘要文本
 * @param {object} data
 * @returns {string}
 */
function buildConsoleSummary(data) {
  const lines = [];
  const separator = '='.repeat(60);

  lines.push(separator);
  lines.push('  宁津环卫 HSE 安全管理系统 v4.1 - 性能测试报告');
  lines.push(`  环境: ${data.testInfo.environment} | 场景: ${data.testInfo.scenario}`);
  lines.push(`  时间: ${data.testInfo.timestamp}`);
  lines.push(separator);
  lines.push('');

  // 概览
  lines.push('【概览】');
  lines.push(`  总请求数:     ${data.overview.totalRequests}`);
  lines.push(`  成功请求:     ${data.overview.successfulRequests}`);
  lines.push(`  失败请求:     ${data.overview.failedRequests}`);
  lines.push(`  成功率:       ${data.overview.successRate}`);
  lines.push(`  测试时长:     ${data.overview.testDuration}`);
  lines.push(`  吞吐量:       ${data.overview.throughput}`);
  lines.push('');

  // 响应时间
  lines.push('【响应时间 (Total)】');
  const rt = data.responseTime.total;
  lines.push(`  Min: ${rt.min}  |  Avg: ${rt.avg}  |  Med: ${rt.med}`);
  lines.push(`  P90: ${rt['p(90)']}  |  P95: ${rt['p(95)']}  |  P99: ${rt['p(99)']}`);
  lines.push(`  Max: ${rt.max}`);
  lines.push('');

  // 等待时间
  lines.push('【等待时间 (Waiting)】');
  const wt = data.responseTime.waiting;
  lines.push(`  Min: ${wt.min}  |  Avg: ${wt.avg}  |  Med: ${wt.med}`);
  lines.push(`  P90: ${wt['p(90)']}  |  P95: ${wt['p(95)']}  |  P99: ${wt['p(99)']}`);
  lines.push('');

  // 检查点
  if (Object.keys(data.checks).length > 0) {
    lines.push('【检查点 (Checks)】');
    for (const [name, result] of Object.entries(data.checks)) {
      const icon = result.fails === 0 ? '[PASS]' : '[FAIL]';
      lines.push(`  ${icon} ${name}: ${result.passRate} (${result.passes}/${result.passes + result.fails})`);
    }
    lines.push('');
  }

  // 阈值结果
  if (Object.keys(data.thresholds).length > 0) {
    lines.push('【阈值 (Thresholds)】');
    for (const [name, result] of Object.entries(data.thresholds)) {
      const passed = result.ok === 1 || result.ok === true;
      lines.push(`  ${passed ? '[PASS]' : '[FAIL]'} ${name}`);
    }
    lines.push('');
  }

  lines.push(separator);
  lines.push('  JSON 详细报告已保存至: performance-summary.json');
  lines.push(separator);

  return lines.join('\n');
}

/**
 * 简化版报告，用于冒烟测试
 * @param {object} metrics
 * @returns {string}
 */
export function smokeTestSummary(metrics) {
  const duration = metrics.http_req_duration?.values || {};
  const errors = metrics.http_req_failed?.values || {};
  const total = metrics.http_reqs?.values?.count || 0;
  const failed = errors.count || 0;

  const lines = [];
  lines.push('='.repeat(50));
  lines.push('  冒烟测试结果');
  lines.push('='.repeat(50));
  lines.push(`  总请求: ${total}  |  失败: ${failed}  |  成功率: ${total > 0 ? ((1 - failed / total) * 100).toFixed(1) : 100}%`);
  lines.push(`  P95: ${duration['p(95)'] !== undefined ? Math.round(duration['p(95)']) + 'ms' : 'N/A'}`);
  lines.push(`  P99: ${duration['p(99)'] !== undefined ? Math.round(duration['p(99)']) + 'ms' : 'N/A'}`);
  lines.push('');

  // checks 结果
  if (metrics.checks) {
    let allPassed = true;
    for (const [name, metric] of Object.entries(metrics.checks)) {
      const passes = metric.values?.passes || 0;
      const fails = metric.values?.fails || 0;
      const status = fails === 0 ? 'PASS' : 'FAIL';
      if (fails > 0) allPassed = false;
      lines.push(`  [${status}] ${name}`);
    }
    lines.push('');
    lines.push(`  总体结果: ${allPassed ? 'ALL PASSED' : 'SOME FAILED'}`);
  }

  lines.push('='.repeat(50));

  return {
    'stdout': lines.join('\n'),
  };
}
