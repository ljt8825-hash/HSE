/* 查看 grid_inspection_records 完整列 + 5378/5377 邻域内容用于重建 */
const { testConnection, pool } = require('../config/db');
(async () => {
  await testConnection();
  const cols = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name='grid_inspection_records' ORDER BY ordinal_position`
  );
  console.log('=== 列名 ===');
  console.log(cols.rows.map((c) => c.column_name).join(', '));

  // 取 5378（同批、北京8-03）作为重建模板
  const t = await pool.query(`SELECT * FROM grid_inspection_records WHERE id=5378`);
  console.log('=== id=5378 全量 ===');
  console.log(JSON.stringify(t.rows[0], (k, v) => (v instanceof Date ? v.toISOString() : v)));

  // 确认 5377 是否真的不存在
  const gone = await pool.query(`SELECT count(*)::int AS c FROM grid_inspection_records WHERE id=5377`);
  console.log('id=5377 存在数:', gone.rows[0].c);
  await pool.end();
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
