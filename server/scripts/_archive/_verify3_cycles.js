/* 查看考核周期列表（id/周期/状态/起止） */
const { testConnection, pool } = require('../config/db');
(async () => {
  await testConnection();
  const r = await pool.query(
    `SELECT id, cycle_code, cycle_name, status, start_time, end_time, is_deleted
     FROM hse_assessment_cycle ORDER BY id DESC LIMIT 12`
  );
  r.rows.forEach((x) => console.log(JSON.stringify(x)));
  await pool.end();
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
