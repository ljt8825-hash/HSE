/* 检查周期24 软删扣分明细详情（判断是否为测试残留） */
const { testConnection, pool } = require('../config/db');
(async () => {
  await testConnection();
  const r = await pool.query(
    `SELECT id, target_id, deduction_item, deduction_source, source_detail->>'kind' AS kind,
            suggested_score, review_status, is_deleted, source_table, source_id,
            (SELECT employee_name FROM hse_assessment_target t WHERE t.id=d.target_id) AS emp,
            created_at
     FROM hse_assessment_deduction d WHERE cycle_id=24 AND is_deleted=TRUE ORDER BY id`
  );
  console.log(`周期24 软删扣分明细 ${r.rows.length} 条:`);
  r.rows.forEach((x) => console.log(JSON.stringify(x)));
  await pool.end();
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
