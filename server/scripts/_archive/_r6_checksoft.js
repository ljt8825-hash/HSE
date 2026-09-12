const { pool } = require('../config/db');
(async () => {
  const r = await pool.query(`
    SELECT d.id, t.employee_name, d.deduction_item, d.suggested_score, d.review_status, d.is_deleted,
           d.source_detail->>'kind' AS kind, d.created_at, d.updated_at
    FROM hse_assessment_deduction d JOIN hse_assessment_target t ON t.id=d.target_id
    WHERE d.cycle_id=24 AND d.is_deleted=TRUE
    ORDER BY d.id
  `);
  console.log('cycle24 软删明细:', JSON.stringify(r.rows, null, 1));
  await pool.end();
})().catch(e => { console.error(e.message); process.exit(1); });
