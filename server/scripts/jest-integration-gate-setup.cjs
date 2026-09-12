/**
 * Jest 集成测试 globalSetup — 门控二次校验
 *
 * 直接运行 `jest --config jest.integration.config.js`（绕过 npm 脚本）时，
 * globalSetup 在任何测试套件加载/任何连接建立之前执行，复用共享门控实现
 * （scripts/integration-gate.js），条件不满足即 process.exit(1)。
 */
'use strict';

const { assertIntegrationGate } = require('./integration-gate');

module.exports = async function integrationGateSetup() {
  assertIntegrationGate();
};
