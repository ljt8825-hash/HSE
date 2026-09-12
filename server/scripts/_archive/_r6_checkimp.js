const { pool } = require('../config/db');
(async () => {
  const r = await pool.query(`SELECT id, original_name, filename, filepath, status, created_at FROM file_records WHERE original_name LIKE '%_r6_%' OR filename LIKE '%_r6_%'`);
  console.log('r6 残留 file_records:', JSON.stringify(r.rows, null, 1));
  const all = await pool.query(`SELECT id, original_name, status, created_at FROM file_records ORDER BY id DESC LIMIT 8`);
  console.log('最近8条:', JSON.stringify(all.rows, null, 1));
  await pool.end();
})().catch(e => { console.error(e.message); process.exit(1); });
