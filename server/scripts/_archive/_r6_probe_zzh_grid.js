const { pool } = require('../config/db');
(async () => {
  const r = await pool.query(`
    SELECT id, employee_id, employee_name, score_auto, score_total
    FROM hse_assessment_target WHERE cycle_id=24 AND employee_name LIKE '%张忠华%'
  `);
  console.log('张忠华 target:', JSON.stringify(r.rows));
  // 模拟评分页筛选 SQL：二级/三级网格长
  const q = await pool.query(`
    SELECT t.id, t.employee_id, t.employee_name, t.score_auto, t.score_total,
           (SELECT ga.grid_level FROM grid_areas ga
            WHERE ga.personnel_id = t.employee_id
              AND COALESCE(ga.is_deleted, FALSE) = FALSE
              AND COALESCE(ga.grid_level, '') <> ''
            ORDER BY ga.id LIMIT 1) AS grid_level
    FROM hse_assessment_target t
    WHERE t.is_deleted = FALSE AND t.cycle_id = 24
      AND t.employee_id IN (
        SELECT ga.personnel_id FROM grid_areas ga
        WHERE ga.personnel_id IS NOT NULL
          AND COALESCE(ga.is_deleted, FALSE) = FALSE
          AND ga.grid_level IN ('二级网格长','三级网格长')
      )
    ORDER BY t.score_total DESC
  `);
  const z = q.rows.filter(x => String(x.employee_name).includes('张忠华'));
  console.log('模拟评分页SQL 张忠华命中:', JSON.stringify(z));
  console.log('模拟评分页SQL 总条数:', q.rows.length);
  await pool.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
