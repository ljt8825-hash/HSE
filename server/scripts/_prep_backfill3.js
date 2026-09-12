const { pool, testConnection } = require('../config/db');
async function q(sql, ...a) { const r = await pool.query(sql, a); return r.rows; }
(async () => {
  await testConnection();
  console.log('===== hse_assessment_rule 字段 =====');
  const rc = await q(`SELECT column_name FROM information_schema.columns WHERE table_name='hse_assessment_rule' ORDER BY ordinal_position`);
  console.log(rc.map(x=>x.column_name).join(', '));
  console.log('\n===== hse_assessment_metric 字段 =====');
  const mc = await q(`SELECT column_name FROM information_schema.columns WHERE table_name='hse_assessment_metric' ORDER BY ordinal_position`);
  console.log(mc.map(x=>x.column_name).join(', '));

  console.log('\n===== 目标职责/否决项 规则 =====');
  const rules = await q(`SELECT * FROM hse_assessment_rule WHERE is_deleted=FALSE AND category IN ('目标职责','否决项') ORDER BY category`);
  for (const r of rules) console.log(JSON.stringify(r));

  console.log('\n===== target 现状 =====');
  const t = await q(`SELECT id, cycle_id, employee_name, position, score_total, review_status FROM hse_assessment_target WHERE id IN (769,770,771,845,904)`);
  for (const r of t) console.log(' target='+r.id+' cycle='+r.cycle_id+' '+r.employee_name+'['+r.position+'] score='+r.score_total+' review='+r.review_status);

  console.log('\n===== 这些 target 现有 deduction 行 =====');
  const d = await q(`SELECT id, target_id, cycle_id, metric_code, deduction_item, suggested_score, confirmed_score, review_status, deduction_type, source_table, source_detail FROM hse_assessment_deduction WHERE target_id IN (769,770,771,845,904) AND is_deleted=FALSE`);
  for (const r of d) console.log(' did='+r.id+' c='+r.cycle_id+' t='+r.target_id+' item='+r.deduction_item+' score='+r.suggested_score+' st='+r.review_status+' src='+(r.source_table||'')+' detail='+JSON.stringify(r.source_detail));
  process.exit(0);
})().catch((e)=>{console.log('ERR',e.message);process.exit(1);});