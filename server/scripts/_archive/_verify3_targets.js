/* 查 hse_assessment_target 结构与目标分数 */
const { testConnection, pool } = require('../config/db');
(async () => {
  await testConnection();
  const cols = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name='hse_assessment_target' ORDER BY ordinal_position`
  );
  console.log('=== 目标表列 ===');
  console.log(cols.rows.map((c) => c.column_name).join(', '));

  const t = await pool.query(
    `SELECT * FROM hse_assessment_target WHERE id IN (454, 468) ORDER BY id`
  );
  console.log('=== 目标 454/468 ===');
  t.rows.forEach((x) => console.log(JSON.stringify(x)));
  await pool.end();
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
