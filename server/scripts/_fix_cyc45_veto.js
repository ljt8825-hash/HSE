/**
 * 2025-09(cyc45) 事故否决：张卫新(事故118)、谢俊章(事故143)、张福梅(事故118 直接上级)
 * 都将按「一票否决」扣100分 → score_auto 归0；10月不再考核。
 *
 * 通过事故否决适配器真实写库（仅 accident_veto 一个适配器），再重算受影响对象。
 */
const db = require('../config/db');
const { pool } = db;

async function run() {
  await db.testConnection(); // 置 dbConnected=true，使引擎 guards 通过

  // 前置确认：cyc45 这三个目标
  const pre = await pool.query(
    `SELECT t.id, t.employee_name, t.position, t.score_auto, t.score_total
     FROM hse_assessment_target t WHERE t.cycle_id=45
       AND t.employee_name IN ('张卫新','谢俊章','张福梅') ORDER BY t.employee_name`
  );
  console.log('cyc45 目标(写库前):');
  for (const r of pre.rows) console.log('  ', JSON.stringify(r));

  const { runCycleAdapters } = require('../services/ruleEngine/engine');
  const res = await runCycleAdapters(45, { adapterKeys: ['accident_veto'], dryRun: false });
  console.log('\nrun ok=', res.ok, 'assessed=', res.assessed, 'affected=', res.affected);
  for (const d of (res.details || [])) console.log('  detail:', JSON.stringify(d));
  for (const a of (res.adapters || [])) console.log('  adapter:', JSON.stringify(a));

  // 写库后确认
  const post = await pool.query(
    `SELECT t.employee_name, t.score_auto, t.score_total, t.grade,
            (SELECT COALESCE(SUM(d.suggested_score),0) FROM hse_assessment_deduction d
              WHERE d.target_id=t.id AND d.is_deleted=FALSE AND d.review_status<>'rejected') AS total_ded
     FROM hse_assessment_target t WHERE t.cycle_id=45
       AND t.employee_name IN ('张卫新','谢俊章','张福梅') ORDER BY t.employee_name`
  );
  console.log('\ncyc45 目标(写库后):');
  for (const r of post.rows) console.log('  ', JSON.stringify(r));

  // 确认 cyc46 不受影响
  const c46 = await pool.query(
    `SELECT count(*) AS cnt FROM hse_assessment_deduction d
      JOIN hse_assessment_target t ON d.target_id=t.id
     WHERE d.cycle_id=46 AND d.source_table='accidents' AND d.is_deleted=FALSE`
  );
  console.log('\ncyc46 事故否决扣分行数:', c46.rows[0].cnt);
}
run().finally(() => process.exit(0));