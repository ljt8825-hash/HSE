const { Pool } = require('pg');
const p = new Pool({
  host: '127.0.0.1', port: 5432, user: 'hse_app',
  password: 't3OvksuXH3Sqhs9xtPZTQGXtorcKMyBM', database: 'safety_dashboard',
});
(async () => {
  const r1 = await p.query("SELECT t.id, t.employee_name, t.score_auto, t.score_total FROM hse_assessment_target t WHERE t.cycle_id=24 AND t.employee_name='张忠华'");
  console.log('张忠华 target(cycle24):', JSON.stringify(r1.rows));

  const r2 = await p.query("SELECT d.id, d.review_status, d.suggested_score, d.source_detail->>'actual' AS actual, d.source_detail->>'missing' AS missing FROM hse_assessment_deduction d WHERE d.cycle_id=24 AND d.target_id=$1 AND d.source_detail->>'kind'='grid_unchecked_monthly'", [r1.rows[0]?.id || 0]);
  console.log('张忠华 未检查扣分(cycle24):', JSON.stringify(r2.rows));

  const r3 = await p.query("SELECT COUNT(*)::int AS c FROM grid_inspection_records WHERE personnel_name='张忠华' AND inspection_date >= '2026-08-01' AND inspection_date < '2026-09-01'");
  console.log('张忠华 8月台账条数:', JSON.stringify(r3.rows));

  // 6月(28)/7月(27) 分数分布与未检查扣分
  for (const cyc of [28, 27]) {
    const rd = await p.query("SELECT score_auto, COUNT(*)::int AS n FROM hse_assessment_target WHERE cycle_id=$1 AND is_deleted=FALSE GROUP BY score_auto ORDER BY score_auto::numeric", [cyc]);
    const ru = await p.query("SELECT COUNT(*)::int AS n FROM hse_assessment_deduction WHERE cycle_id=$1 AND source_detail->>'kind'='grid_unchecked_monthly' AND is_deleted=FALSE", [cyc]);
    console.log(`cycle${cyc} 分数分布:`, JSON.stringify(rd.rows), ' 未检查扣分:', JSON.stringify(ru.rows));
  }

  await p.end();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
