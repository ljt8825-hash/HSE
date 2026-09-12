const { pool } = require('../config/db');
(async () => {
  const r = await pool.query(`
    SELECT d.review_status, COUNT(*) AS cnt
    FROM hse_assessment_deduction d
    WHERE d.cycle_id=24 AND NOT d.is_deleted AND d.source_detail->>'kind'='grid_unchecked_monthly'
    GROUP BY d.review_status ORDER BY d.review_status
  `);
  console.log('cycle24 未检查扣分(有效):', JSON.stringify(r.rows));

  const z = await pool.query(`
    SELECT t.employee_name, t.score_auto, t.score_total, d.id AS ded_id, d.review_status, d.is_deleted, d.current_version, d.suggested_score
    FROM hse_assessment_target t
    LEFT JOIN hse_assessment_deduction d ON d.target_id=t.id AND d.cycle_id=24 AND d.source_detail->>'kind'='grid_unchecked_monthly'
    WHERE t.cycle_id=24 AND t.employee_name LIKE '%张忠华%'
  `);
  console.log('张忠华最终:', JSON.stringify(z.rows, null, 1));

  const dist = await pool.query(`
    SELECT score_total, COUNT(*) AS cnt FROM hse_assessment_target
    WHERE cycle_id=24 AND NOT is_deleted GROUP BY score_total ORDER BY score_total DESC
  `);
  console.log('cycle24 分数分布:', JSON.stringify(dist.rows));

  const adj = await pool.query(`SELECT COUNT(*)::int AS c FROM hse_deduction_adjustment WHERE deduction_id=119`);
  console.log('119 调整记录残留:', adj.rows[0].c);

  const led = await pool.query(`SELECT COUNT(*)::int AS c FROM grid_inspection_records WHERE id=6611`);
  console.log('台账 6611 残留:', led.rows[0].c);

  const fr = await pool.query(`SELECT COUNT(*)::int AS c FROM file_records WHERE original_name LIKE '%_r6_%'`);
  console.log('file_records r6 残留:', fr.rows[0].c);

  const trig = await pool.query(`SELECT tgenabled FROM pg_trigger WHERE tgname='trg_prevent_adjustment_update'`);
  console.log('触发器状态:', JSON.stringify(trig.rows));

  await pool.end();
})().catch(e => { console.error(e.message); process.exit(1); });
