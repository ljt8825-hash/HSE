/* 验证 id=5377 已恢复且内容完整，对比同批 5378 */
const { testConnection, pool } = require('../config/db');
(async () => {
  await testConnection();
  const a = await pool.query(`SELECT * FROM grid_inspection_records WHERE id=5377`);
  const b = await pool.query(`SELECT * FROM grid_inspection_records WHERE id=5378`);
  const fmt = (v) => (v instanceof Date ? v.toISOString() : v);
  console.log('=== id=5377 全量 ===');
  console.log(JSON.stringify(a.rows[0], (k, v) => fmt(v)));
  console.log('=== id=5378 全量 ===');
  console.log(JSON.stringify(b.rows[0], (k, v) => fmt(v)));
  // 逐列对比（日期/时间类除外）
  const skip = new Set(['id', 'created_at', 'updated_at']);
  const diffs = [];
  for (const k of Object.keys(a.rows[0] || {})) {
    if (skip.has(k)) continue;
    if (JSON.stringify(fmt(a.rows[0][k])) !== JSON.stringify(fmt(b.rows[0][k]))) {
      diffs.push(`${k}: ${JSON.stringify(fmt(a.rows[0][k]))} vs ${JSON.stringify(fmt(b.rows[0][k]))}`);
    }
  }
  console.log('=== 与5378差异列 ===');
  console.log(diffs.length ? diffs.join('\n') : '(完全一致)');
  await pool.end();
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
