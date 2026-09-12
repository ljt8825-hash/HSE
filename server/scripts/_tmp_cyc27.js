const { pool, testConnection } = require('../config/db');
const CID=27; // 2026-07
(async()=>{
  await testConnection();
  const t=(await pool.query(`SELECT id,employee_name,department,score_auto,score_total FROM hse_assessment_target WHERE cycle_id=$1 AND position='乡镇作业中心经理' AND is_deleted=FALSE ORDER BY department`,[CID])).rows;
  console.log('=== cyc'+CID+'('+1970+') 乡镇经理 target ===');
  for(const x of t) console.log(`  id=${x.id} ${x.employee_name} ${x.department} auto=${x.score_auto} total=${x.score_total}`);
  const d=(await pool.query(
    `SELECT t.id AS tid,t.employee_name,ded.metric_code,ded.deduction_item,ded.source_table,ded.source_detail->>'category' AS cat,ded.suggested_score AS s,ded.review_status,ded.is_deleted
       FROM hse_assessment_deduction ded JOIN hse_assessment_target t ON t.id=ded.target_id
      WHERE t.cycle_id=$1 AND t.position='乡镇作业中心经理' ORDER BY t.employee_name,ded.metric_code`,[CID])).rows;
  console.log('\n=== cyc'+CID+' 现存扣分(含已删) ===');
  const byName={};
  for(const x of d){byName[x.employee_name]=byName[x.employee_name]||[];byName[x.employee_name].push(`${x.metric_code}[${x.cat}](${x.source_table})=${x.s} sts=${x.review_status} del=${x.is_deleted}`);}
  for(const k of Object.keys(byName)) console.log('  '+k+': '+byName[k].join(' ; '));
  pool.end();
})().catch(e=>{console.error(e.message);process.exit(1);});