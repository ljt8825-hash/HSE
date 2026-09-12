require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { pool, testConnection } = require('../config/db');
const engine = require('../services/ruleEngine/engine');

async function snap(cycleId, label){
  const rows=(await pool.query(
    `SELECT t.employee_name, ded.metric_code, ded.deduction_item, ded.suggested_score, ded.review_status, ded.source_detail->>'category' AS cat
       FROM hse_assessment_deduction ded JOIN hse_assessment_target t ON t.id=ded.target_id
      WHERE t.cycle_id=$1 AND t.position='乡镇作业中心经理' AND ded.is_deleted=FALSE
      ORDER BY t.employee_name, ded.metric_code`,[cycleId])).rows;
  const byName={};
  for(const r of rows){byName[r.employee_name]=byName[r.employee_name]||[];
    byName[r.employee_name].push(`${r.metric_code}(${r.cat})${r.deduction_item?':'+r.deduction_item:''}=${r.suggested_score}[${r.review_status}]`);}
  console.log(`\n[${label}] 乡镇经理现存扣分:`);
  for(const k of Object.keys(byName)) console.log('  '+k+': '+byName[k].join(', '));
  const tgts=(await pool.query(`SELECT employee_name,score_total,score_auto FROM hse_assessment_target WHERE cycle_id=$1 AND position='乡镇作业中心经理' AND is_deleted=FALSE`,[cycleId])).rows;
  console.log(`[${label}] score_total: `+tgts.map(t=>`${t.employee_name}:${t.score_total}`).join(' '));
}
(async()=>{
  await testConnection();
  engine.ensureAdaptersRegistered();
  const cid=52;
  await snap(cid,'重跑前');
  const res=await engine.runCycleAutoDeductions(cid,{dryRun:true});
  console.log('\n=== DRY-RUN 结果 ===');
  console.log('affected:',res.affected,'scanned:',res.scanned,'assessed:',res.assessed);
  for(const a of (res.adapters||[])){
    console.log(`  adapter=${a.key} ok=${a.ok} generated=${a.generated} revoked=${a.revoked} skipped=${a.skippedCount}`);
    if(a.dryRun && a.dryRun.length) for(const d of a.dryRun.slice(0,20)) console.log('     intent:', JSON.stringify(d));
  }
  await snap(cid,'重跑后(DRY=不应变化)');
  pool.end();
})().catch(e=>{console.error(e.message);process.exit(1);});