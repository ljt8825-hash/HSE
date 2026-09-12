/**
 * 测试后置清理
 * Jest globalTeardown 配置或测试套件 afterAll 使用
 */
const { pool, cleanupTestData } = require('./setup');

async function globalTeardown() {
  console.log('[TEST] 执行全局测试数据清理...');
  try {
    await cleanupTestData();
    await pool.end();
    console.log('[TEST] 数据库连接已关闭');
  } catch (err) {
    console.error('[TEST] 清理失败:', err.message);
  }
}

module.exports = globalTeardown;
