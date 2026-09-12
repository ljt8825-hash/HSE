/**
 * Jest 默认配置 — 单元测试（不连接数据库）
 *
 * 【测试隔离约定（2026-08-05 阶段3 收尾）】
 * 默认 `npm test` 只收集命名为 `*.unit.test.js` 的单元/mock 测试（结构性精确白名单）：
 *   - 任何普通 `*.test.js`（含未来新增的 routes/ 等目录）都不会被默认收集；
 *   - 新增单元测试必须显式命名 `xxx.unit.test.js` 并保持"确认不连库"原则；
 *   - 需要 PostgreSQL 的集成/E2E 测试保持 `*.test.js` 命名，通过
 *     `npm run test:integration`（fail-closed 门控 + globalSetup 二次校验）显式执行。
 *
 * 已迁移的单元测试（12 个）：
 *   middleware/{cache,queryLogger,response,validate}.unit.test.js
 *   __tests__/middleware/response.unit.test.js
 *   schemas/{auth,common}.unit.test.js
 *   routes/auth.unit.test.js
 *   __tests__/routes/{import,vehicles}.unit.test.js
 *   __tests__/utils/excel.unit.test.js
 *   services/aiService.unit.test.js
 */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/*.unit.test.js'],
  collectCoverageFrom: [
    'routes/**/*.js',
    'middleware/**/*.js',
    'schemas/**/*.js',
    'services/**/*.js',
    '!**/node_modules/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'html', 'json'],
  testPathIgnorePatterns: [
    '/node_modules/',
    // hse-employee.standalone.test.js 是独立执行脚本（node 直接运行，使用自定义
    // assert + supertest 连库验证），并非 Jest 用例。精确排除，避免被误收集。
    '/__tests__/hse-employee.standalone.test.js',
  ],
  setupFiles: ['<rootDir>/test/setup.js'],
  testTimeout: 10000,
  verbose: true,
};
