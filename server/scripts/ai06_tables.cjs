/** AI-06 审计临时脚本：hazards 真实数据最小只读分布（脱敏，无个人字段明细） */
const { pool } = require('../config/db');
(async () => {
  const r = await pool.query(`
    SELECT
      count(*) AS total,
      count(*) FILTER (WHERE is_demo = true) AS demo,
      count(*) FILTER (WHERE is_demo IS NOT TRUE) AS real_data,
      count(*) FILTER (WHERE status = '待整改') AS pending,
      count(*) FILTER (WHERE status = '已整改') AS fixed,
      count(*) FILTER (WHERE is_deleted = true) AS deleted,
      min(hazard_date) AS min_date, max(hazard_date) AS max_date,
      count(DISTINCT township) AS townships,
      count(DISTINCT category) AS categories,
      count(DISTINCT hazard_type) AS hazard_types
    FROM hazards`);
  console.log('DIST:', JSON.stringify(r.rows[0], null, 1));

  const st = await pool.query(`SELECT status, count(*) c FROM hazards GROUP BY status ORDER BY c DESC`);
  console.log('STATUS:', JSON.stringify(st.rows));

  const src = await pool.query(`SELECT hazard_source, count(*) c FROM hazards WHERE is_demo IS NOT TRUE GROUP BY hazard_source ORDER BY c DESC LIMIT 10`);
  console.log('SOURCE(real):', JSON.stringify(src.rows));

  const demo = await pool.query(`SELECT is_demo, status, count(*) c FROM hazards GROUP BY is_demo, status ORDER BY is_demo, c DESC LIMIT 20`);
  console.log('DEMO_X_STATUS:', JSON.stringify(demo.rows));
  await pool.end();
})();
