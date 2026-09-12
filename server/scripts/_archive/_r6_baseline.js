const { Pool } = require('pg');
const p = new Pool({
  host: '127.0.0.1', port: 5432, user: 'hse_app',
  password: 't3OvksuXH3Sqhs9xtPZTQGXtorcKMyBM', database: 'safety_dashboard',
});
(async () => {
  const r = await p.query("SELECT review_status, count(*) AS n FROM hse_assessment_deduction WHERE cycle_id=24 GROUP BY review_status ORDER BY review_status");
  console.log('cycle24 by review_status:', JSON.stringify(r.rows));

  const r2 = await p.query(
    "SELECT deduction_item, review_status, count(*) AS n, min(suggested_score) AS mn, max(suggested_score) AS mx " +
    "FROM hse_assessment_deduction WHERE cycle_id=24 GROUP BY deduction_item, review_status ORDER BY deduction_item, review_status"
  );
  console.log('by item/status:', JSON.stringify(r2.rows, null, 1));

  const r3 = await p.query(
    "SELECT count(*) AS total, count(*) FILTER (WHERE status='frozen') AS frozen, " +
    "min(score_total) AS mn, max(score_total) AS mx " +
    "FROM hse_assessment_target WHERE cycle_id=24"
  );
  console.log('targets cycle24:', JSON.stringify(r3.rows));

  const r4 = await p.query(
    "SELECT d.id, d.target_id, t.employee_name AS person, d.deduction_item, d.deduction_source, d.suggested_score, d.review_status, d.source_detail " +
    "FROM hse_assessment_deduction d LEFT JOIN hse_assessment_target t ON t.id=d.target_id " +
    "WHERE d.cycle_id=24 AND d.review_status='pending' ORDER BY d.id LIMIT 8"
  );
  console.log('pending sample:', JSON.stringify(r4.rows, null, 1));

  const r5 = await p.query("SELECT adjustment_reason, count(*) AS n FROM hse_deduction_adjustment GROUP BY adjustment_reason ORDER BY n DESC");
  console.log('adjustment reasons:', JSON.stringify(r5.rows));

  await p.end();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
