/**
 * 宁津环卫 HSE 安全管理系统 v4.1 - k6 环境配置
 *
 * 通过环境变量 ENV 选择环境：
 *   ENV=local  -> 本地开发环境
 *   ENV=staging -> 预发布环境
 *   ENV=prod   -> 生产环境
 *
 * 用法：k6 run -e ENV=local smoke/smoke-test.js
 */

const ENVIRONMENTS = {
  local: {
    name: '本地开发环境',
    baseUrl: 'http://localhost:3000',
    frontendUrl: 'http://localhost:5666',
    wsUrl: 'ws://localhost:3000/ws',
    adminUser: {
      username: 'admin',
      password: 'admin123',
    },
    db: {
      host: 'localhost',
      port: 5432,
      dbName: 'safety_dashboard',
      user: 'postgres',
      password: 'postgres',
    },
    rateLimits: {
      global: { max: 500, window: '15m' },
      bi: { max: 1000, window: '15m' },
      iot: { max: 2000, window: '15m' },
    },
    timeout: {
      connect: '5s',
      request: '30s',
      wsHandshake: '10s',
    },
  },

  staging: {
    name: '预发布环境',
    baseUrl: 'https://staging.example.com',
    frontendUrl: 'https://staging.example.com:5666',
    wsUrl: 'wss://staging.example.com/ws',
    adminUser: {
      username: __ENV.STG_ADMIN_USER || 'admin',
      password: __ENV.STG_ADMIN_PASS || 'changeme',
    },
    db: {
      host: 'staging-db.example.com',
      port: 5432,
      dbName: 'safety_dashboard_staging',
      user: __ENV.STG_DB_USER || 'postgres',
      password: __ENV.STG_DB_PASS || 'changeme',
    },
    rateLimits: {
      global: { max: 500, window: '15m' },
      bi: { max: 1000, window: '15m' },
      iot: { max: 2000, window: '15m' },
    },
    timeout: {
      connect: '10s',
      request: '30s',
      wsHandshake: '15s',
    },
  },

  prod: {
    name: '生产环境',
    baseUrl: 'https://hse.example.com',
    frontendUrl: 'https://hse.example.com:5666',
    wsUrl: 'wss://hse.example.com/ws',
    adminUser: {
      username: __ENV.PROD_ADMIN_USER || 'admin',
      password: __ENV.PROD_ADMIN_PASS || 'changeme',
    },
    db: {
      host: 'prod-db.example.com',
      port: 5432,
      dbName: 'safety_dashboard',
      user: __ENV.PROD_DB_USER || 'postgres',
      password: __ENV.PROD_DB_PASS || 'changeme',
    },
    rateLimits: {
      global: { max: 500, window: '15m' },
      bi: { max: 1000, window: '15m' },
      iot: { max: 2000, window: '15m' },
    },
    timeout: {
      connect: '10s',
      request: '30s',
      wsHandshake: '15s',
    },
  },
};

/**
 * 获取当前环境配置
 * 默认使用 local 环境
 */
export function getEnvConfig() {
  const envName = __ENV.ENV || 'local';
  const config = ENVIRONMENTS[envName];

  if (!config) {
    throw new Error(
      `未知环境: "${envName}"，可选值: ${Object.keys(ENVIRONMENTS).join(', ')}`
    );
  }

  // 允许通过环境变量覆盖 baseUrl
  if (__ENV.BASE_URL) {
    config.baseUrl = __ENV.BASE_URL;
  }
  if (__ENV.FRONTEND_URL) {
    config.frontendUrl = __ENV.FRONTEND_URL;
  }

  return config;
}

export { ENVIRONMENTS };
