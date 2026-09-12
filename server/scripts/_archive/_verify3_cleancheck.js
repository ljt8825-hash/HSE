/* 综合清理检查：扣分明细状态 + 目标分数 + 临时测试痕迹 */
const { testConnection, pool } = require('../config/db');
(async () => {
  await testConnection();

  // 1. 扣分明细 96/97 状态（应 pending、未删除）
  const d = await pool.query(
    `SELECT id, target_id, deduction_item, deduction_source, source_detail->>'kind' AS kind,
            suggested_score, confirmed_score, review_status, is_deleted, source_table, source_id
     FROM hse_assessment_deduction WHERE id IN (96,97) ORDER BY id`
  );
  console.log('=== 扣分明细 96/97 ===');
  d.rows.forEach((x) => console.log(JSON.stringify(x)));

  // 2. 测试痕迹：manual_test kind
  const m = await pool.query(
    `SELECT id, deduction_item, source_detail->>'kind' AS kind, review_status, is_deleted
     FROM hse_assessment_deduction WHERE source_detail->>'kind' = 'manual_test'`
  );
  console.log('=== manual_test 测试痕迹（应为0条）===');
  console.log('条数:', m.rows.length);
  m.rows.forEach((x) => console.log(JSON.stringify(x)));

  // 3. 目标分数（454 李忠胜 / 李先菊目标）
  const t = await pool.query(
    `SELECT id, name, score_auto, score_total FROM hse_assessment_target WHERE id IN (454, 455) OR name IN ('李忠胜','李先菊') ORDER BY id`
  );
  console.log('=== 目标分数 ===');
  t.rows.forEach((x) => console.log(JSON.stringify(x)));

  // 4. 扣分周期24 全部 auto 明细数（确认无异常堆积）
  const c = await pool.query(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE is_deleted) AS deleted,
            count(*) FILTER (WHERE review_status='pending') AS pending,
            count(*) FILTER (WHERE review_status='approved') AS approved,
            count(*) FILTER (WHERE review_status='adjusted') AS adjusted,
            count(*) FILTER (WHERE review_status='rejected') AS rejected
     FROM hse_assessment_deduction WHERE cycle_id=24`
  );
  console.log('=== 周期24 扣分明细统计 ===');
  console.log(JSON.stringify(c.rows[0]));

  await pool.end();
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
