/* 查 hse_assessment_deduction 表结构 */
const { testConnection, pool } = require('../config/db');
(async () => {
  await testConnection();
  const r = await pool.query(
    `SELECT column_name, data_type, is_nullable, column_default
     FROM information_schema.columns WHERE table_name='hse_assessment_deduction' ORDER BY ordinal_position`
  );
  r.rows.forEach((c) => console.log(`${c.column_name} | ${c.data_type} | null=${c.is_nullable} | def=${c.column_default || ''}`));
  await pool.end();
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
