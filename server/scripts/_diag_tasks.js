/**
 * 诊断：任务涉及周期(2025-09/10/11)的底层数据
 *  - 1. 事故否决扣分（张卫新/谢俊章 2025-09）
 *  - 2a. 谢俊章 2025-10 三违相关扣分明细
 *  - 2b. driver_monthly / 月度考核数据覆盖（2025-08~10）
 *  - 3a. 安全文化建设 cyc47(2025-11) 乡镇经理扣分
 */
const { pool, testConnection } = require('../config/db');
const cyc = { '2025-09': 45, '2025-10': 46, '2025-11': 47 };

(async () => {
  await testConnection();

  console.log('\n===== 1. 事故否决扣分 cyc45(2025-09) 张卫新/谢俊章 =====');
  let r = await pool.query(
    `SELECT t.employee_name, d.source_id, d.suggested_score, d.source_detail, d.review_status, d.is_deleted
       FROM hse_assessment_deduction d JOIN hse_assessment_target t ON d.target_id=t.id
      WHERE d.cycle_id=$1 AND d.source_table='accidents' AND t.employee_name IN ('张卫新','谢俊章')`,
    [cyc['2025-09']]);
  r.rows.forEach(x => console.log(`  ${x.employee_name} | src=${x.source_id} score=${x.suggested_score} status=${x.review_status} del=${x.is_deleted}`));
  console.log('\n  -- 2025-09 全部事故记录 --');
  r = await pool.query(
    `SELECT id, accident_date, accident_category, accident_nature, involved_person,
            responsibility_team, party_dept, party_supervisor, is_deleted
       FROM accidents
      WHERE (accident_date AT TIME ZONE 'Asia/Shanghai')::date >= '2025-09-01'
        AND (accident_date AT TIME ZONE 'Asia/Shanghai')::date <  '2025-10-01'`);
  r.rows.forEach(x => console.log(`  #${x.id} ${String(x.accident_date).slice(0,10)} ${x.accident_category}/${x.accident_nature} 涉=${x.involved_person} 班组=${x.responsibility_team} 上级=${x.party_supervisor} del=${x.is_deleted}`));

  console.log('\n===== 2a. 谢俊章 2025-10(cyc46) 三违/全部 auto 扣分 =====');
  r = await pool.query(
    `SELECT t.employee_name, d.source_table, d.source_detail->>'kind' AS kind, d.source_detail->>'deductKey' AS dk,
            d.source_detail->>'summary' AS summary, d.suggested_score, d.review_status, d.is_deleted
       FROM hse_assessment_deduction d JOIN hse_assessment_target t ON d.target_id=t.id
      WHERE d.cycle_id=$1 AND t.employee_name='谢俊章' AND d.deduction_source='auto'`,
    [cyc['2025-10']]);
  r.rows.forEach(x => console.log(`  ${x.source_table} | ${x.kind} | ${x.dk} | ${(x.summary||'').slice(0,40)} | score=${x.suggested_score} status=${x.review_status} del=${x.is_deleted}`));

  console.log('\n===== 2b. driver_monthly 数据覆盖(2025-08~10) =====');
  r = await pool.query(`SELECT month, COUNT(*)::int c FROM driver_monthly GROUP BY month ORDER BY month`);
  r.rows.forEach(x => console.log(`  ${x.month}: ${x.c}`));

  console.log('\n===== 3a. 安全文化建设 cyc47(2025-11) 全部扣分 =====');
  r = await pool.query(
    `SELECT t.employee_name, t.position, d.suggested_score, d.source_detail->>'summary' AS summary,
            d.review_status, d.is_deleted
       FROM hse_assessment_deduction d JOIN hse_assessment_target t ON d.target_id=t.id
      WHERE d.cycle_id=$1 AND d.source_detail->>'kind'='safety_culture_monthly'`,
    [cyc['2025-11']]);
  r.rows.forEach(x => console.log(`  ${x.position} ${x.employee_name} | ${(x.summary||'').slice(0,30)} | score=${x.suggested_score} status=${x.review_status} del=${x.is_deleted}`));

  console.log('\n===== 谢俊章 2025-10 目标卡片(三违考核列) =====');
  r = await pool.query(
    `SELECT employee_name, position, score_auto, score_total, score_manual
       FROM hse_assessment_target WHERE cycle_id=$1 AND employee_name='谢俊章'`,
    [cyc['2025-10']]);
  r.rows.forEach(x => console.log(`  ${x.position}: auto=${x.score_auto} total=${x.score_total} manual=${x.score_manual}`));

  process.exit(0);
})().catch(e => { console.error('ERR', e); process.exit(1); });