const { Pool } = require('pg');
const p = new Pool({
  host: '127.0.0.1', port: 5432, user: 'hse_app',
  password: 't3OvksuXH3Sqhs9xtPZTQGXtorcKMyBM', database: 'safety_dashboard',
});
(async () => {
  const r1 = await p.query("SELECT COUNT(*)::int AS c FROM grid_inspection_records WHERE personnel_name='张忠华' AND inspection_date >= '2026-08-01' AND inspection_date < '2026-09-01'");
  console.log('张忠华 8月台账条数(导入后):', JSON.stringify(r1.rows));

  const r2 = await p.query("SELECT id, review_status, suggested_score, is_deleted, source_detail->>'actual' AS actual, source_detail->>'missing' AS missing FROM hse_assessment_deduction WHERE cycle_id=24 AND target_id=(SELECT id FROM hse_assessment_target WHERE employee_name='张忠华' AND cycle_id=24) AND source_detail->>'kind'='grid_unchecked_monthly' ORDER BY id");
  console.log('张忠华 未检查扣分(导入后):', JSON.stringify(r2.rows, null, 1));

  const r3 = await p.query("SELECT id, employee_name, score_auto, score_total FROM hse_assessment_target WHERE cycle_id=24 AND employee_name='张忠华'");
  console.log('张忠华 target(导入后):', JSON.stringify(r3.rows));

  // 确认新插入的台账记录
  const r4 = await p.query("SELECT id, personnel_name, inspection_date, upload_time, violation_behavior, violator_name, created_at FROM grid_inspection_records WHERE personnel_name='张忠华' AND upload_time='2026/08/30 08:00'");
  console.log('新插入记录:', JSON.stringify(r4.rows, null, 1));

  await p.end();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
