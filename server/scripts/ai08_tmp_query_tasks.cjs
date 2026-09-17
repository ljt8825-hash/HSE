const { pool } = require('../config/db');
(async () => {
  const r = await pool.query(
    'SELECT id, status, error_code, error_message, provider, model, started_at, completed_at FROM ai_analysis_tasks WHERE id = 29'
  );
  console.table(r.rows);
  await pool.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
