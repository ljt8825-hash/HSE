/* 第三轮验证：grid_unchecked 明细分布核查（只读） */
const { pool } = require('../config/db');

(async () => {
  try {
    // 1. 所有 grid_unchecked 明细按周期/删除/状态分布
    const dist = await pool.query(
      `SELECT cycle_id, is_deleted, review_status,
              count(*)::int AS cnt, coalesce(sum(confirmed_score),0)::numeric AS cf,
              coalesce(sum(suggested_score),0)::numeric AS sug
       FROM hse_assessment_deduction
       WHERE source_detail->>'kind'='grid_unchecked_monthly'
       GROUP BY 1,2,3 ORDER BY 1,2,3`
    );
    console.log('=== grid_unchecked 明细分布 ===');
    dist.rows.forEach((r) => console.log(JSON.stringify(r)));

    // 2. cycle24 明细全量（含 summary）
    const c24 = await pool.query(
      `SELECT id, target_id, deduction_item, suggested_score, confirmed_score,
              review_status, is_deleted, deduction_source, source_detail->>'summary' AS summary,
              source_detail->>'deductKey' AS deductKey,
              (SELECT employee_name FROM hse_assessment_target t WHERE t.id=d.target_id) AS employee_name
       FROM hse_assessment_deduction d
       WHERE d.cycle_id=24 AND d.source_detail->>'kind'='grid_unchecked_monthly'
       ORDER BY d.id`
    );
    console.log('=== cycle24 明细 ===');
    c24.rows.forEach((r) => console.log(JSON.stringify(r)));

    // 3. 全库还有多少 kind=grid_unchecked_monthly 的行（含软删）
    const all = await pool.query(
      `SELECT count(*)::int AS total, count(*) FILTER (WHERE is_deleted)::int AS del
       FROM hse_assessment_deduction WHERE source_detail->>'kind'='grid_unchecked_monthly'`
    );
    console.log('=== 全库 grid_unchecked 行 ===', JSON.stringify(all.rows[0]));
  } catch (e) {
    console.error('ERROR:', e.message);
  } finally {
    await pool.end();
  }
})();
