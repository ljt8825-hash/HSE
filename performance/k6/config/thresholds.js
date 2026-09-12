/**
 * 宁津环卫 HSE 安全管理系统 v4.1 - k6 性能阈值配置
 *
 * 三级阈值，通过环境变量 THRESHOLD_LEVEL 选择：
 *   THRESHOLD_LEVEL=P0  -> critical（关键业务接口）
 *   THRESHOLD_LEVEL=P1  -> standard（常规测试，默认）
 *   THRESHOLD_LEVEL=P2  -> relaxed（压力/浸泡测试）
 */

import { check } from 'k6';

/**
 * P0 - Critical 关键阈值
 * 适用于核心业务接口（登录、仪表盘、告警）
 */
const THRESHOLDS_P0 = {
  http_req_duration: [
    'p(95)<500',   // 95% 请求在 500ms 内完成
    'p(99)<1000',  // 99% 请求在 1000ms 内完成
  ],
  http_req_failed: ['rate<0.01'],  // 错误率 < 1%
  http_req_waiting: [
    'p(95)<450',   // 等待时间（不含 TLS 握手）
    'p(99)<900',
  ],
};

/**
 * P1 - Standard 标准阈值（默认）
 * 适用于一般业务接口
 */
const THRESHOLDS_P1 = {
  http_req_duration: [
    'p(95)<1000',  // 95% 请求在 1000ms 内完成
    'p(99)<2000',  // 99% 请求在 2000ms 内完成
  ],
  http_req_failed: ['rate<0.02'],  // 错误率 < 2%
  http_req_waiting: [
    'p(95)<900',
    'p(99)<1800',
  ],
};

/**
 * P2 - Relaxed 宽松阈值
 * 适用于压力测试、浸泡测试等场景
 */
const THRESHOLDS_P2 = {
  http_req_duration: [
    'p(95)<2000',  // 95% 请求在 2000ms 内完成
    'p(99)<5000',  // 99% 请求在 5000ms 内完成
  ],
  http_req_failed: ['rate<0.05'],  // 错误率 < 5%
  http_req_waiting: [
    'p(95)<1800',
    'p(99)<4500',
  ],
};

/**
 * 按接口类型的专用阈值
 * 可在测试中按 tag 组合使用
 */
const ENDPOINT_THRESHOLDS = {
  // 认证接口 - 严格要求
  auth: {
    'http_req_duration{endpoint:auth}': ['p(95)<300', 'p(99)<600'],
  },
  // 仪表盘 - 首页加载
  dashboard: {
    'http_req_duration{endpoint:dashboard}': ['p(95)<800', 'p(99)<1500'],
  },
  // BI 报表 - 允许稍慢
  bi: {
    'http_req_duration{endpoint:bi}': ['p(95)<2000', 'p(99)<5000'],
  },
  // IoT 实时数据 - 严格要求
  iot: {
    'http_req_duration{endpoint:iot}': ['p(95)<200', 'p(99)<500'],
  },
};

/**
 * 根据环境变量获取阈值配置
 * @param {string} level - 阈值级别 P0/P1/P2
 * @returns {object} k6 thresholds 配置
 */
export function getThresholds(level) {
  const thresholdLevel = level || __ENV.THRESHOLD_LEVEL || 'P1';

  const thresholdMap = {
    P0: THRESHOLDS_P0,
    P1: THRESHOLDS_P1,
    P2: THRESHOLDS_P2,
  };

  const thresholds = thresholdMap[thresholdLevel];
  if (!thresholds) {
    throw new Error(
      `未知阈值级别: "${thresholdLevel}"，可选值: P0, P1, P2`
    );
  }

  return thresholds;
}

/**
 * 合并通用阈值和按接口类型的专用阈值
 * @param {string} level - 阈值级别
 * @param {string[]} endpoints - 需要启用专用阈值的端点类型
 * @returns {object} 合并后的 thresholds
 */
export function getThresholdsWithEndpoints(level, endpoints) {
  const baseThresholds = getThresholds(level);
  const merged = { ...baseThresholds };

  if (endpoints && endpoints.length > 0) {
    for (const endpoint of endpoints) {
      const endpointThreshold = ENDPOINT_THRESHOLDS[endpoint];
      if (endpointThreshold) {
        Object.assign(merged, endpointThreshold);
      }
    }
  }

  return merged;
}

/**
 * 快速校验单个响应是否符合 P0 标准
 * 用于冒烟测试中的断言
 */
export function assertCritical(response) {
  return check(response, {
    'P0: 状态码 200/201': (r) => r.status >= 200 && r.status < 300,
    'P0: 响应时间 < 500ms': (r) => r.timings.duration < 500,
    'P0: 无错误': (r) => r.error === null || r.error === undefined,
  });
}

/**
 * 快速校验单个响应是否符合 P1 标准
 */
export function assertStandard(response) {
  return check(response, {
    'P1: 状态码 200/201': (r) => r.status >= 200 && r.status < 300,
    'P1: 响应时间 < 1000ms': (r) => r.timings.duration < 1000,
  });
}

export {
  THRESHOLDS_P0,
  THRESHOLDS_P1,
  THRESHOLDS_P2,
  ENDPOINT_THRESHOLDS,
};
