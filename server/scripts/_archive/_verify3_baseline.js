/* 第三轮验证：基线数据核查（只读，不写库） */
const { pool } = require('../config/db');

(async () => {
  try {
    // 1. 周期列表
    const cycles = await pool.query(
      `SELECT id, cycle_code, assessment_year, assessment_month, status,
              to_char(start_time,'YYYY-MM-DD') AS start_time, to_char(end_time,'YYYY-MM-DD') AS end_time
       FROM hse_assessment_cycle WHERE is_deleted=FALSE ORDER BY id`
    );
    console.log('=== 周期列表 ===');
    cycles.rows.forEach((r) => console.log(JSON.stringify(r)));

    // 2. 各周期目标分/扣分明细基线
    for (const c of cycles.rows) {
      const targets = await pool.query(
        `SELECT count(*)::int AS total,
                count(*) FILTER (WHERE score_auto=100)::int AS full,
                count(*) FILTER (WHERE score_auto IS NOT NULL AND score_auto<100)::int AS below,
                count(*) FILTER (WHERE score_auto IS NULL)::int AS null_score
         FROM hse_assessment_target WHERE cycle_id=$1 AND is_deleted=FALSE`, [c.id]
      );
      const ded = await pool.query(
        `SELECT count(*)::int AS cnt,
                count(*) FILTER (WHERE is_deleted)::int AS del,
                count(*) FILTER (WHERE source_detail->>'kind'='grid_unchecked_monthly')::int AS gu
         FROM hse_assessment_deduction WHERE cycle_id=$1`, [c.id]
      );
      console.log(`cycle ${c.id}(${c.cycle_code}): targets=${JSON.stringify(targets.rows[0])} deductions=${JSON.stringify(ded.rows[0])}`);
    }

    // 3. 各考核月台账条数（守卫口径）
    const months = [[2026,6],[2026,7],[2026,8]];
    console.log('=== 台账覆盖（守卫口径）===');
    for (const [y, m] of months) {
      const r = await pool.query(
        `SELECT COUNT(*)::int AS c FROM grid_inspection_records
         WHERE inspection_date >= make_date($1,$2,1)
           AND inspection_date <  make_date($1,$2,1) + INTERVAL '1 month'`,
        [y, m]
      );
      console.log(`${y}-${String(m).padStart(2,'0')}: ${r.rows[0].c} 条`);
    }

    // 4. 规则库「未检查」配置 + 类别上限
    const rule = await pool.query(
      `SELECT id, rule_name, category, metric_code, deduct_type, deduct_score, max_deduct, status
       FROM hse_assessment_rule WHERE is_deleted=FALSE AND category='三违管理' AND (rule_name LIKE '%未检%' OR rule_name LIKE '%未巡%')`
    );
    console.log('=== 规则库未检查配置 ===');
    rule.rows.forEach((r) => console.log(JSON.stringify(r)));
    const cap = await pool.query(`SELECT * FROM hse_assessment_category_limit WHERE category='三违管理'`);
    console.log('=== 三违管理上限 ===');
    cap.rows.forEach((r) => console.log(JSON.stringify(r)));
  } catch (e) {
    console.error('ERROR:', e.message);
  } finally {
    await pool.end();
  }
})();
