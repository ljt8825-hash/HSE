/**
 * 宁津环卫 HSE 安全管理系统 v4.1 - k6 测试场景配置
 *
 * 4 种预设场景：
 *   loadTest   - 负载测试：模拟日常业务流量
 *   stressTest - 压力测试：逐步加压到极限
 *   soakTest   - 浸泡测试：长时间低负载运行
 *   spikeTest  - 峰值测试：瞬时高并发
 *
 * 用法：k6 run --execution-segment-override '{ "scenarios": { "loadTest": ... } }' test.js
 *   或在脚本中 import 后按需选用
 */

/**
 * loadTest - 负载测试
 * 模拟日常业务流量的渐进加压
 * 总时长 3 分钟，最大 100 VU
 */
const LOAD_TEST = {
  loadTest: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '30s', target: 10 },    // 预热阶段
      { duration: '1m', target: 50 },     // 正常负载
      { duration: '30s', target: 100 },    // 峰值负载
      { duration: '30s', target: 50 },     // 降压
      { duration: '30s', target: 0 },      // 冷却
    ],
    gracefulRampDown: '10s',
    tags: { scenario: 'loadTest' },
  },
};

/**
 * stressTest - 压力测试
 * 逐步加大压力直到系统出现瓶颈
 * 总时长 6 分钟，最大 500 VU
 */
const STRESS_TEST = {
  stressTest: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '1m', target: 100 },     // 初始阶段
      { duration: '2m', target: 200 },     // 中等压力
      { duration: '2m', target: 500 },     // 极限压力
      { duration: '1m', target: 0 },       // 突然释放
    ],
    gracefulRampDown: '15s',
    tags: { scenario: 'stressTest' },
  },
};

/**
 * soakTest - 浸泡测试
 * 长时间低负载运行，检测内存泄漏和资源耗尽
 * 总时长 30 分钟，恒定 50 VU
 */
const SOAK_TEST = {
  soakTest: {
    executor: 'constant-vus',
    vus: 50,
    duration: '30m',
    gracefulStop: '30s',
    tags: { scenario: 'soakTest' },
  },
};

/**
 * spikeTest - 峰值测试
 * 模拟瞬时突发流量，检测系统恢复能力
 * 总时长约 35 秒，瞬间跳至 300 VU
 */
const SPIKE_TEST = {
  spikeTest: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '1s', target: 300 },    // 瞬间加压
      { duration: '30s', target: 300 },     // 维持峰值
      { duration: '1s', target: 0 },       // 瞬间释放
    ],
    gracefulRampDown: '5s',
    tags: { scenario: 'spikeTest' },
  },
};

/**
 * smokeTest - 冒烟测试（轻量）
 * 验证基本功能可用性
 */
const SMOKE_TEST = {
  smokeTest: {
    executor: 'ramping-vus',
    startVUs: 1,
    stages: [
      { duration: '10s', target: 1 },
      { duration: '4m40s', target: 1 },
      { duration: '10s', target: 0 },
    ],
    gracefulRampDown: '5s',
    tags: { scenario: 'smokeTest' },
  },
};

/**
 * 获取场景配置
 * @param {string} scenarioName - 场景名称
 * @returns {object} k6 scenarios 配置
 */
export function getScenario(scenarioName) {
  const scenarioMap = {
    loadTest: LOAD_TEST,
    stressTest: STRESS_TEST,
    soakTest: SOAK_TEST,
    spikeTest: SPIKE_TEST,
    smokeTest: SMOKE_TEST,
  };

  const scenario = scenarioMap[scenarioName];
  if (!scenario) {
    throw new Error(
      `未知场景: "${scenarioName}"，可选值: ${Object.keys(scenarioMap).join(', ')}`
    );
  }

  return scenario;
}

/**
 * 获取场景配置（通过环境变量）
 * 用法：k6 run -e SCENARIO=loadTest test.js
 */
export function getScenarioFromEnv() {
  const scenarioName = __ENV.SCENARIO || 'loadTest';
  return getScenario(scenarioName);
}

/**
 * 获取所有场景的合并配置
 * 用于同时运行多个场景
 */
export function getAllScenarios() {
  return {
    ...LOAD_TEST,
    ...STRESS_TEST,
    ...SOAK_TEST,
    ...SPIKE_TEST,
  };
}

export {
  LOAD_TEST,
  STRESS_TEST,
  SOAK_TEST,
  SPIKE_TEST,
  SMOKE_TEST,
};
