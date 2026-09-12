const { pool, testConnection } = require('../config/db');
(async()=>{
  await testConnection();
  for(const [cid,label,names] of [[50,'2026-03(cyc50)',['李振恒']],[51,'2026-04(cyc51)',['谢俊章']]]){
    console.log('\n===== '+label+' =====');
    for(const nm of names){
      const t=(await pool.query(`SELECT id,employee_name,score_auto,score_total FROM hse_assessment_target WHERE cycle_id=$1 AND employee_name=$2 AND position='乡镇作业中心经理'`,[cid,nm])).rows[0];
      if(!t){console.log('  无target '+nm);continue;}
      console.log(`  ${nm}(id=${t.id}) auto=${t.score_auto} total=${t.score_total}`);
      const d=(await pool.query(`SELECT ded.metric_code,ded.deduction_item,ded.source_table,ded.source_detail->>'category' AS cat,ded.suggested_score AS s,ded.review_status FROM hse_assessment_deduction ded WHERE ded.target_id=$1 AND ded.is_deleted=FALSE ORDER BY cat`,[t.id])).rows;
      for(const x of d) console.log(`    ${x.cat}|${x.metric_code}|${x.source_table}|${x.deduction_item}=${x.s} [${x.review_status}]`);
    }
  }
  pool.end();
})().catch(e=>{console.error(e.message);process.exit(1);});