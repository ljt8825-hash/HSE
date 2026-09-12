/**
 * 撤销 张福梅(target 813) 在 cyc45 的事故否决扣分：
 * 驾驶员(于传峰, 事故118)的直接上级是乡镇作业中心经理(张卫新)，非管理员(张福梅)→ 张福梅不参与否决。
 * 操作：软删该 veto 行，重算 score → 恢复 100。
 */
const { pool, testConnection } = require('../config/db');
const engine = require('../services/assessmentScoringEngine');

async function run() {
  await testConnection();
  // 定位 张福梅 cyc45 的事故否决扣分行（事故118）
  const d = await pool.query(
    `SELECT d.id, d.target_id, d.source_id, d.suggested_score, d.is_deleted
       FROM hse_assessment_deduction d
       JOIN hse_assessment_target t ON d.target_id=t.id
      WHERE t.cycle_id=45 AND t.employee_name='张福梅'
        AND d.source_table='accidents' AND d.is_deleted=FALSE`
  );
  console.log('张福梅 cyc45 否决扣分行:');
  for (const r of d.rows) console.log('  ', JSON.stringify(r));

  for (const r of d.rows) {
    await pool.query('UPDATE hse_assessment_deduction SET is_deleted=TRUE, updated_at=NOW() WHERE id=$1', [r.id]);
    console.log('软删 ded id=', r.id);
  }

  // 重算 张福梅 目标（813）
  const t = await pool.query('SELECT id FROM hse_assessment_target WHERE cycle_id=45 AND employee_name=\'张福梅\'' );
  for (const row of t.rows) {
    const res = await engine.recalculateTarget(45, row.id);
    console.log('重算 target', row.id, 'ok=', res.ok, 'scoreAuto=', res.scoreAuto, 'totalDeduction=', res.totalDeduction, 'scoreTotal=', res.scoreTotal);
  }

  // 确认 cyc45 三个目标最终状态
  const chk = await pool.query(
    `SELECT employee_name, score_auto, score_total, grade FROM hse_assessment_target
      WHERE cycle_id=45 AND employee_name IN ('张卫新','谢俊章','张福梅') ORDER BY employee_name`
  );
  console.log('\ncyc45 最终状态:');
  for (const r of chk.rows) console.log('  ', JSON.stringify(r));
}
run().finally(() => process.exit(0));