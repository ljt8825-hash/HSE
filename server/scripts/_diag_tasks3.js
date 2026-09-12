/**
 * 诊断3：cyc46(2025-10) 张卫新/谢俊章 是否已有事故否决扣分；10月 accidents 记录
 * 以及 cyc46 张卫新/谢俊章 当前 auto/total 与三违/事故扣分全貌
 */
const { pool, testConnection } = require('../config/db');

(async () => {
  await testConnection();
  console.log('\n== cyc46(2025-10) 张卫新/谢俊章 全部扣分 ==');
  for (const name of ['张卫新', '谢俊章']) {
    let r = await pool.query(
      `SELECT t.employee_name, t.score_auto, t.score_total, d.source_table,
              d.source_detail->>'kind' AS kind, d.source_detail->>'summary' AS summary,
              d.source_detail->>'rawScore' AS raw, d.suggested_score, d.review_status, d.is_deleted
         FROM hse_assessment_target t
         LEFT JOIN hse_assessment_deduction d ON d.target_id=t.id AND d.cycle_id=t.cycle_id AND d.is_deleted=FALSE
        WHERE t.cycle_id=$1 AND t.employee_name=$2`,
      [46, name]);
    console.log(`  ---- ${name} (auto=${r.rows[0]?.score_auto} total=${r.rows[0]?.score_total}) ----`);
    r.rows.forEach(x => { if (x.kind) console.log(`    ${x.source_table}|${x.kind} ${(x.summary||'').slice(0,40)} score=${x.suggested_score} raw=${x.raw} status=${x.review_status}`); });
  }

  console.log('\n== 2025-10 accidents 记录 ==');
  let r = await pool.query(
    `SELECT id, accident_date, accident_category, accident_nature, involved_person,
            responsibility_team, party_dept, party_supervisor, is_deleted
       FROM accidents
      WHERE (accident_date AT TIME ZONE 'Asia/Shanghai')::date >= '2025-10-01'
        AND (accident_date AT TIME ZONE 'Asia/Shanghai')::date <  '2025-11-01'`);
  r.rows.forEach(x => console.log(`  #${x.id} ${String(x.accident_date).slice(0,10)} ${x.accident_category}/${x.accident_nature} 涉=${x.involved_person} 班组=${x.responsibility_team} 上级=${x.party_supervisor} del=${x.is_deleted}`));

  // 张卫新 所属作业中心与经理定位：杜集镇作业中心在 cyc45/46 的乡镇经理
  console.log('\n== 杜集镇作业中心 cyc45/46 乡镇作业中心经理 target ==');
  r = await pool.query(
    `SELECT t.cycle_id, t.employee_name, t.position, t.department
       FROM hse_assessment_target t
      WHERE t.cycle_id IN (45,46) AND t.position='乡镇作业中心经理'
        AND (t.department LIKE '%杜集%' OR t.employee_name IN ('张卫新','谢俊章'))
      ORDER BY t.cycle_id`);
  r.rows.forEach(x => console.log(`  cyc${x.cycle_id} ${x.employee_name} ${x.department}`));

  process.exit(0);
})().catch(e => { console.error('ERR', e); process.exit(1); });