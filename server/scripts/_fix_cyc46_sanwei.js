/**
 * 2025-10(cyc46) 撤销 谢俊章 target 892 的 sanwei_excel 1分扣分（ded id=612）
 * 使三违合计从 7 → 6（100 - 6 = 94）
 */
const { pool } = require('../config/db');

async function run() {
  const targetId = 892;  // cyc46 谢俊章
  const dedId = 612;     // hse_sanwei_excel 1分

  // 1) 软删该扣分行
  const up = await pool.query(
    `UPDATE hse_assessment_deduction SET is_deleted=TRUE, updated_at=NOW() WHERE id=$1 RETURNING id, source_table, suggested_score, is_deleted`,
    [dedId]
  );
  console.log('软删结果:', up.rows);

  // 2) getEffectiveDeductionTotal 不含 manual，只有 auto/chain。sanwei_excel 是 auto → 重算生效
  const rec = await pool.query(
    `SELECT t.id, t.employee_name, t.score_auto, t.score_total, t.grade
     FROM hse_assessment_target t WHERE t.id=$1`,
    [targetId]
  );
  console.log('重算前:', JSON.stringify(rec.rows[0]));

  // 用评分引擎重算
  const engine = require('../services/assessmentScoringEngine');
  const r = await engine.recalculateTarget(46, targetId);
  console.log('重算结果 ok=', r.ok, 'scoreAuto=', r.scoreAuto, 'totalDeduction=', r.totalDeduction, 'scoreTotal=', r.scoreTotal);

  // 3) 确认该 target 现存生效扣分
  const d = await pool.query(
    `SELECT id, source_table, suggested_score, is_deleted FROM hse_assessment_deduction WHERE target_id=$1 AND is_deleted=FALSE`,
    [targetId]
  );
  console.log('剩余生效扣分:', d.rows);
}
run().finally(() => pool.end());