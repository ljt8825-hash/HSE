const { Pool } = require('pg');
const p = new Pool({
  host: '127.0.0.1', port: 5432, user: 'hse_app',
  password: 't3OvksuXH3Sqhs9xtPZTQGXtorcKMyBM', database: 'safety_dashboard',
});
(async () => {
  const r = await p.query(
    "SELECT d.id, t.employee_name AS person, d.deduction_item, d.suggested_score, d.confirmed_score, d.review_status " +
    "FROM hse_assessment_deduction d LEFT JOIN hse_assessment_target t ON t.id=d.target_id " +
    "WHERE d.cycle_id=24 AND d.review_status <> 'pending' ORDER BY d.id"
  );
  console.log('non-pending cycle24:', JSON.stringify(r.rows, null, 1));
  const r2 = await p.query("SELECT count(*) AS n FROM hse_deduction_adjustment");
  console.log('adjustment table rows:', JSON.stringify(r2.rows));
  await p.end();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
