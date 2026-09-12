const { pool } = require('../config/db');
(async () => {
  const d = await pool.query(`
    SELECT review_status, COUNT(*) AS cnt FROM hse_assessment_deduction
    WHERE cycle_id=24 AND NOT is_deleted GROUP BY review_status ORDER BY review_status
  `);
  console.log('cycle24 有效扣分按状态:', JSON.stringify(d.rows));
  const d2 = await pool.query(`
    SELECT review_status, COUNT(*) AS cnt FROM hse_assessment_deduction
    WHERE cycle_id=24 GROUP BY review_status ORDER BY review_status
  `);
  console.log('cycle24 全部(含软删)按状态:', JSON.stringify(d2.rows));
  const adj = await pool.query(`
    SELECT a.id, a.deduction_id, a.operation_type, a.adjustment_reason, a.new_score, a.adjusted_by_name, a.adjusted_at, a.is_current
    FROM hse_deduction_adjustment a ORDER BY a.id DESC LIMIT 20
  `);
  console.log('最近调整记录:', JSON.stringify(adj.rows, null, 1));
  // 已审批/已调整的自动未检查明细（看有无 r6 测试残留需复位）
  const ap = await pool.query(`
    SELECT d.id, t.employee_name, d.deduction_item, d.review_status, d.suggested_score, d.confirmed_score,
           d.source_detail->>'kind' AS kind, d.updated_at
    FROM hse_assessment_deduction d JOIN hse_assessment_target t ON t.id=d.target_id
    WHERE d.cycle_id=24 AND NOT d.is_deleted AND d.review_status IN ('approved','adjusted')
    ORDER BY d.id
  `);
  console.log('cycle24 已锁定明细:', JSON.stringify(ap.rows, null, 1));
  await pool.end();
})().catch(e => { console.error(e.message); process.exit(1); });
