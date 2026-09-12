const { Pool } = require('pg');
const p = new Pool({
  host: '127.0.0.1', port: 5432, user: 'hse_app',
  password: 't3OvksuXH3Sqhs9xtPZTQGXtorcKMyBM', database: 'safety_dashboard',
});
(async () => {
  // 0) 表结构
  const r0 = await p.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='hse_assessment_target' ORDER BY ordinal_position");
  console.log('target columns:', r0.rows.map(x => x.column_name).join(', '));

  // 1) cycle24 冻结对象（周期级）
  const r1 = await p.query("SELECT id, cycle_code, status, frozen_count FROM hse_assessment_cycle WHERE id=24");
  console.log('cycle24 frozen:', JSON.stringify(r1.rows));

  // 2) 张忠华 8月巡查台账
  const r2 = await p.query("SELECT id, inspection_date, grid_leader, inspector_name, area_name, violation_type FROM hse_grid_inspection_records WHERE inspector_name LIKE '%张忠华%' AND inspection_date >= '2026-08-01' AND inspection_date < '2026-09-01' ORDER BY inspection_date");
  console.log('张忠华 Aug records:', r2.rowCount, JSON.stringify(r2.rows.slice(0, 10), null, 1));

  // 3) 8月台账总量与每人次数分布（用于构造补传）
  const r3 = await p.query("SELECT inspector_name, COUNT(*) AS n FROM hse_grid_inspection_records WHERE inspection_date >= '2026-08-01' AND inspection_date < '2026-09-01' AND is_deleted=FALSE GROUP BY inspector_name ORDER BY n DESC LIMIT 12");
  console.log('Aug 每人巡查次数TOP12:', JSON.stringify(r3.rows, null, 1));

  // 4) 张忠华 target 信息
  const r4 = await p.query("SELECT t.id, t.employee_name, t.score_auto FROM hse_assessment_target t WHERE t.cycle_id=24 AND t.employee_name LIKE '%张忠华%'");
  console.log('张忠华 target:', JSON.stringify(r4.rows));

  // 5) cycle24 未检查扣分列表（看每个人缺次）
  const r5 = await p.query("SELECT d.id, t.employee_name AS person, d.suggested_score, d.source_detail->>'missing' AS missing, d.source_detail->>'actual' AS actual, d.source_detail->>'expected' AS expected, d.review_status FROM hse_assessment_deduction d LEFT JOIN hse_assessment_target t ON t.id=d.target_id WHERE d.cycle_id=24 AND d.source_detail->>'kind'='grid_unchecked_monthly' AND d.is_deleted=FALSE AND d.review_status='pending' ORDER BY d.suggested_score DESC LIMIT 12");
  console.log('cycle24 未检查 pending 缺次明细:', JSON.stringify(r5.rows, null, 1));

  await p.end();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
