/**
 * 集成测试安全门控 — 共享实现（CLI 前置校验与 Jest globalSetup 二次校验共用）
 *
 * fail-closed：任一条件不满足即拒绝，确保在建立任何数据库连接之前终止：
 *   1. ALLOW_INTEGRATION_TESTS === 'true'（显式授权）
 *   2. NODE_ENV === 'test'
 *   3. DB_NAME / DB_DATABASE 存在且匹配 ^test_ 或 _test$（专用测试库命名规则）
 *   4. 数据库名不得是 safety_dashboard（生产/开发库）
 *
 * 使用方：
 *   - CLI:  node scripts/check-integration-gate.cjs（npm run test:integration 前置）
 *   - Jest: scripts/jest-integration-gate-setup.cjs（jest.integration.config.js globalSetup，
 *     防止直接运行 `jest --config jest.integration.config.js` 绕过 npm 脚本门控）
 */
'use strict';

/**
 * 校验集成测试环境（不退出进程，供 CLI/测试复用）
 * @param {NodeJS.ProcessEnv} env 环境变量（默认 process.env）
 * @returns {{ ok: boolean; reason?: string }}
 */
function checkIntegrationGate(env = process.env) {
  if (env.ALLOW_INTEGRATION_TESTS !== 'true') {
    return { ok: false, reason: 'ALLOW_INTEGRATION_TESTS 未设置为 "true"（需要显式授权）' };
  }
  if (env.NODE_ENV !== 'test') {
    return { ok: false, reason: `NODE_ENV 必须为 "test"（当前: ${env.NODE_ENV}）` };
  }
  const dbName = env.DB_NAME || env.DB_DATABASE || '';
  if (!dbName) {
    return { ok: false, reason: '未设置 DB_NAME / DB_DATABASE，无法确认目标数据库' };
  }
  if (!/^(test_.*|.*_test)$/.test(dbName)) {
    return {
      ok: false,
      reason: `数据库名不符合专用测试库命名规则（须以 test_ 开头或以 _test 结尾），当前: ${dbName}`,
    };
  }
  if (dbName === 'safety_dashboard') {
    return { ok: false, reason: '数据库名不得为 safety_dashboard（开发/生产库）' };
  }
  return { ok: true };
}

/**
 * 断言门控通过；不通过时输出并 process.exit(1)
 * @param {NodeJS.ProcessEnv} env
 */
function assertIntegrationGate(env = process.env) {
  const result = checkIntegrationGate(env);
  if (!result.ok) {
    console.error('[integration-gate] REJECTED: ' + result.reason);
    console.error('[integration-gate] 集成测试已阻止，未建立任何数据库连接。');
    process.exit(1);
  }
  console.log('[integration-gate] OK: 数据库门控通过');
  return result;
}

module.exports = { checkIntegrationGate, assertIntegrationGate };
