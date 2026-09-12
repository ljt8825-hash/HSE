const { pool } = require('../config/db');
(async () => {
  const d = await pool.query(`
    SELECT id, target_id, suggested_score, confirmed_score, review_status, current_version, is_deleted,
           source_detail->>'missing' AS missing, source_detail->>'actual' AS actual, updated_at, created_at
    FROM hse_assessment_deduction WHERE id=119
  `);
  console.log('deduction 119 完整状态:', JSON.stringify(d.rows, null, 1));
  const adj = await pool.query(`
    SELECT * FROM hse_deduction_adjustment WHERE deduction_id=119 ORDER BY id
  `);
  console.log('119 调整历史:', JSON.stringify(adj.rows, null, 1));
  // 导入文件记录表是否存在
  const tbl = await pool.query(`
    SELECT table_name FROM information_schema.tables WHERE table_name LIKE '%file_record%' OR table_name LIKE '%import%log%'
  `);
  console.log('导入记录相关表:', JSON.stringify(tbl.rows.map(r=>r.table_name)));
  // 若存在 file_record 表，查今日记录
  for (const t of tbl.rows) {
    try {
      const r = await pool.query(`SELECT id, file_name, module_type, status, created_at FROM ${t.table_name} ORDER BY id DESC LIMIT 10`);
      console.log(`${t.table_name} 最近记录:`, JSON.stringify(r.rows, null, 1));
    } catch (e) { /* 表结构不同则跳过 */ }
  }
  await pool.end();
})().catch(e => { console.error(e.message); process.exit(1); });
