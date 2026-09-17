const { pool } = require('../config/db');
(async () => {
  const del = await pool.query('DELETE FROM ai_analysis_tasks WHERE id IN (25,26,27,28,29)');
  console.log('deleted:', del.rowCount);
  const r = await pool.query('SELECT id, status, created_by FROM ai_analysis_tasks ORDER BY id DESC LIMIT 5');
  console.table(r.rows);
  await pool.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
