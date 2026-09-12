/**
 * 诊断2：重点确认
 *  - cyc45 张卫新/谢俊章 完整 auto 扣分明细 + 目标总分
 *  - 谢俊章 cyc46 sanwei_score 6分来源(hse_sanwei_score_monthly) 与 sanwei_excel 1分来源
 *  - cyc47 安全文化建设 经理目标总分(auto/total)
 */
const { pool, testConnection } = require('../config/db');
const cyc = { '2025-09': 45, '2025-10': 46, '2025-11': 47 };

(async () => {
  await testConnection();

  console.log('\n===== cyc45(2025-09) 张卫新/谢俊章 完整扣分明细 =====');
  let r = await pool.query(
    `SELECT t.employee_name, t.score_auto, t.score_total, d.source_table,
            d.source_detail->>'kind' AS kind, d.source_detail->>'summary' AS summary,
            d.source_detail->>'rawScore' AS raw, d.suggested_score, d.review_status, d.is_deleted
       FROM hse_assessment_deduction d JOIN hse_assessment_target t ON d.target_id=t.id
      WHERE d.cycle_id=$1 AND t.employee_name IN ('张卫新','谢俊章')`,
    [cyc['2025-09']]);
  r.rows.forEach(x => console.log(`  ${x.employee_name} [auto=${x.score_auto} total=${x.score_total}] ${x.source_table}|${x.kind} summary=${(x.summary||'').slice(0,50)} score=${x.suggested_score} raw=${x.raw} status=${x.review_status} del=${x.is_deleted}`));
  if(!r.rows.length) console.log('  (无任何扣分记录)');

  console.log('\n===== 谢俊章 cyc46 sanwei_score 6分来源(hse_sanwei_score_monthly) =====');
  r = await pool.query(
    `SELECT s.* FROM hse_sanwei_score_monthly s
       JOIN hse_assessment_target t ON s.employee_id = t.employee_id AND t.cycle_id=$1
      WHERE t.employee_name='谢俊章'`,
    [cyc['2025-10']]);
  r.rows.forEach(x => console.log('  ', JSON.stringify(x).slice(0,400)));

  console.log('\n===== 谢俊章 cyc46 sanwei_excel 1分来源(找Excel) =====');
  // 看 sanwei_excel 这行的 source_detail 全貌
  r = await pool.query(
    `SELECT d.source_detail
       FROM hse_assessment_deduction d JOIN hse_assessment_target t ON d.target_id=t.id
      WHERE d.cycle_id=$1 AND t.employee_name='谢俊章' AND d.source_table='hse_sanwei_excel'`,
    [cyc['2025-10']]);
  r.rows.forEach(x => console.log('  detail=', JSON.stringify(x.source_detail)));

  console.log('\n===== cyc47(2025-11) 安全文化建设 经理 目标总分 =====');
  r = await pool.query(
    `SELECT t.employee_name, t.position, t.score_auto, t.score_total
       FROM hse_assessment_target t
      WHERE t.cycle_id=$1 AND t.position='乡镇作业中心经理'`,
    [cyc['2025-11']]);
  r.rows.forEach(x => console.log(`  ${x.employee_name}: auto=${x.score_auto} total=${x.score_total}`));

  process.exit(0);
})().catch(e => { console.error('ERR', e); process.exit(1); });