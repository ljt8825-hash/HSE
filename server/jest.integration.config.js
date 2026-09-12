/**
 * Jest 集成测试配置 — 需要 PostgreSQL 的集成/E2E 测试
 *
 * ⚠️ 本配置不得通过默认 `npm test` 触发，必须显式执行：
 *   npm run test:integration
 * 且需通过 server/scripts/integration-gate.js 的 fail-closed 门控
 * （ALLOW_INTEGRATION_TESTS=true + NODE_ENV=test + 数据库名以 test_/_test 开头
 *   且不是 safety_dashboard），否则在 Jest 启动前即终止，不会建立任何连接。
 *
 * 双重校验：npm 脚本前置 CLI 门控 + 本配置 globalSetup（防止直接运行
 * `jest --config jest.integration.config.js` 绕过 npm 脚本门控）。
 *
 * 收集范围：__tests__ 顶层连库套件、__tests__/e2e、tests/ 目录。
 * 单元测试白名单见 jest.config.js（默认配置，*.unit.test.js 约定）。
 */
module.exports = {
  testEnvironment: 'node',
  globalSetup: '<rootDir>/scripts/jest-integration-gate-setup.cjs',
  testMatch: [
    '**/__tests__/*.test.js',
    '**/__tests__/e2e/*.test.js',
    '**/tests/**/*.test.js',
  ],
  collectCoverageFrom: [
    'routes/**/*.js',
    'middleware/**/*.js',
    'schemas/**/*.js',
    'services/**/*.js',
    '!**/node_modules/**',
  ],
  coverageDirectory: 'coverage-integration',
  coverageReporters: ['text', 'html', 'json'],
  testPathIgnorePatterns: [
    '/node_modules/',
    // 独立执行脚本，非集成测试用例
    '/__tests__/hse-employee.standalone.test.js',
  ],
  testTimeout: 30000,
  verbose: true,
};
