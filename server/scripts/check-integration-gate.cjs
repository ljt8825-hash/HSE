/**
 * 集成测试安全门控 — CLI 入口（npm run test:integration 前置校验）
 * 复用 scripts/integration-gate.js 的共享实现，避免规则漂移。
 */
'use strict';

const { assertIntegrationGate } = require('./integration-gate');
assertIntegrationGate();
