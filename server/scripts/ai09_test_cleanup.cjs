/**
 * AI-09 测试环境清理（开发库 safety_dashboard）：
 *  1) 删除临时 safety_manager 用户 ai09_test_sm
 *  2) 删除 hazards 临时截断测试数据（hazard_source='AI09_TEST'，description 带 [AI09截断测试] 标记）
 * 幂等：目标不存在则跳过；只按标记删除，不触碰任何既有业务记录。
 */
const { pool } = require('../config/db');

const TEST_USERNAME = 'ai09_test_sm';
const HAZ_SOURCE = 'AI09_TEST';

async function main() {
  // 1) 删除临时用户（不触碰该用户已创建的任务，仅删除用户本身）
  const u = await pool.query('SELECT id FROM users WHERE username = $1', [TEST_USERNAME]);
  if (u.rows.length > 0) {
    await pool.query('DELETE FROM users WHERE username = $1', [TEST_USERNAME]);
    console.log(`SM_USER_DELETED: id=${u.rows[0].id}`);
  } else {
    console.log('SM_USER_NOT_FOUND: skip');
  }

  // 2) 删除 AI09_TEST 测试数据
  const h = await pool.query('DELETE FROM hazards WHERE hazard_source = $1', [HAZ_SOURCE]);
  console.log(`HAZ_DELETED: ${h.rowCount} 条`);

  // 3) 校验残留
  const left = await pool.query('SELECT COUNT(*)::int c FROM hazards WHERE hazard_source = $1', [HAZ_SOURCE]);
  console.log(`HAZ_REMAIN: ${left.rows[0].c}`);
}

main()
  .then(() => pool.end())
  .catch(async (e) => {
    console.error('CLEAN_ERR:', e.message);
    await pool.end();
    process.exitCode = 1;
  });
