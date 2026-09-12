const { pool, testConnection } = require('../config/db');
(async()=>{
  await testConnection();
  for(const [cid,nm] of [[51,'李振恒'],[47,'李振恒'],[47,'杨清华'],[48,'靳洪刚']]){
    const t=(await pool.query(`SELECT id,employee_name,score_auto,score_total FROM hse_assessment_target WHERE cycle_id=$1 AND employee_name=$2 AND position='乡镇作业中心经理'`,[cid,nm])).rows[0];
    if(!t){console.log(`[cyc${cid}] ${nm}: 无target`);continue;}
    console.log(`\n[cyc${cid}] ${nm}(id=${t.id}) auto=${t.score_auto} total=${t.score_total}`);
    const d=(await pool.query(`SELECT ded.id,ded.metric_code,ded.source_table,ded.source_detail->>'category' AS cat,ded.suggested_score AS s,ded.review_status FROM hse_assessment_deduction ded WHERE ded.target_id=$1 AND ded.is_deleted=FALSE ORDER BY cat`,[t.id])).rows;
    for(const x of d) console.log(`   ${x.cat}|${x.metric_code}|${x.source_table}=${x.s} [${x.review_status}]`);
  }
  pool.end();
})().catch(e=>{console.error(e.message);process.exit(1);});