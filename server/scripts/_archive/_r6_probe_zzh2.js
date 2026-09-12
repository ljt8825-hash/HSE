const { Pool } = require('pg');
const p = new Pool({
  host: '127.0.0.1', port: 5432, user: 'hse_app',
  password: 't3OvksuXH3Sqhs9xtPZTQGXtorcKMyBM', database: 'safety_dashboard',
});
(async () => {
  const r = await p.query(
    `SELECT COUNT(*)::int AS aug_cnt FROM grid_inspection_records
     WHERE personnel_name='张忠华' AND inspection_date >= '2026-08-01' AND inspection_date < '2026-09-01'`
  );
  console.log('张忠华 8月台账条数:', JSON.stringify(r.rows));

  const r2 = await p.query(
    `SELECT COUNT(*)::int AS aug_cnt, MIN(inspection_date) AS mn, MAX(inspection_date) AS mx
     FROM grid_inspection_records
     WHERE personnel_name='张忠华' AND inspection_date >= '2026-08-01' AND inspection_date < '2026-09-01'`
  );
  console.log('张忠华 8月日期范围:', JSON.stringify(r2.rows));

  const r3 = await p.query(
    `SELECT id, inspection_date, upload_time, violator_name, violation_behavior, serial_no
     FROM grid_inspection_records
     WHERE personnel_name='张忠华' AND inspection_date >= '2026-08-01' AND inspection_date < '2026-09-01'
     ORDER BY inspection_date DESC LIMIT 3`
  );
  console.log('张忠华 8月最后3条:', JSON.stringify(r3.rows, null, 1));

  const r4 = await p.query(
    `SELECT source_detail->>'actual' AS actual, source_detail->>'expected' AS expected, source_detail->>'missing' AS missing, review_status, id
     FROM hse_assessment_deduction WHERE cycle_id=24 AND target_id IN (SELECT id FROM hse_assessment_target WHERE employee_name='张忠华' AND cycle_id=24) AND source_detail->>'kind'='grid_unchecked_monthly'`
  );
  console.log('张忠华 未检查扣分当前:', JSON.stringify(r4.rows, null, 1));

  await p.end();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
