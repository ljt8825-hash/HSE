// 第四轮 P1：查看全部 hse_deduction_adjustment 记录
const { pool } = require('../config/db');

(async () => {
  const all = (
    await pool.query(
      `SELECT id, deduction_id, version_no, old_score, new_score, operation_type,
              adjustment_reason, is_current, adjusted_at
       FROM hse_deduction_adjustment
       ORDER BY id`
    )
  ).rows;

  console.log('=== 全部调整记录 ===');
  console.table(all.map((r) => ({
    id: r.id, deduction_id: r.deduction_id, version: r.version_no,
    old: r.old_score, new: r.new_score, op: r.operation_type,
    reason: r.adjustment_reason, current: r.is_current, at: r.adjusted_at,
  })));

  // 关联明细当前状态
  const detailIds = [...new Set(all.map((r) => r.deduction_id))];
  const details = (
    await pool.query(
      `SELECT id, cycle_id, target_id, review_status, suggested_score, confirmed_score,
              current_version, source_detail, deduction_item
       FROM hse_assessment_deduction
       WHERE id = ANY($1)
       ORDER BY id`,
      [detailIds]
    )
  ).rows;
  console.log('=== 关联明细当前状态 ===');
  console.table(details.map((d) => ({
    id: d.id, cycle_id: d.cycle_id, target_id: d.target_id,
    status: d.review_status, suggested: d.suggested_score, confirmed: d.confirmed_score,
    version: d.current_version, kind: d.source_detail?.kind || '-',
  })));

  await pool.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
