const { pool } = require('../config/db');
(async () => {
  const c = await pool.query(`SELECT COUNT(*) AS cnt FROM grid_inspection_records`);
  console.log('总条数:', JSON.stringify(c.rows));
  const l = await pool.query(`
    SELECT to_char(inspection_date, 'YYYY-MM') AS ym, COUNT(*) AS cnt
    FROM grid_inspection_records
    WHERE inspection_date >= '2026-06-01' AND inspection_date < '2026-09-01'
    GROUP BY 1 ORDER BY 1
  `);
  console.log('网格台账按月分布(6-8月):', JSON.stringify(l.rows));
  await pool.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
