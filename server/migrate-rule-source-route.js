/**
 * 迁移：为 hse_assessment_rule 增加 source_route（手动链接选中的菜单路由，可空）。
 * 幂等。用法：node migrate-rule-source-route.js
 */
const { pool } = require('./config/db');

async function main() {
  const client = await pool.connect();
  try {
    const res = await client.query(
      `ALTER TABLE hse_assessment_rule
       ADD COLUMN IF NOT EXISTS source_route VARCHAR(255)`
    );
    const col = await client.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name='hse_assessment_rule' AND column_name='source_route'`
    );
    console.log(`source_route 列${col.rows.length ? '已就绪' : '未创建'}`, res.command);
  } catch (e) {
    console.error('迁移失败：', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    pool.end();
  }
}
main();