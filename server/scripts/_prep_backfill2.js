const { pool, testConnection } = require('../config/db');
async function q(sql, ...a) { const r = await pool.query(sql, a); return r.rows; }
(async () => {
  await testConnection();
  console.log('===== cycle 44/45/46 管理员现存扣分样例（目标职责/否决项）=====');
  const s = await q(`SELECT target_id, cycle_id, metric_id, metric_code, deduction_item, deduction_type, suggested_score, confirmed_score, review_status, source_table, source_id, source_detail, is_transmission, is_deleted FROM hse_assessment_deduction WHERE cycle_id IN (44,45,46) AND is_deleted=FALSE AND source_detail->>'category' IN ('目标职责','否决项') ORDER BY id DESC LIMIT 8`);
  for (const r of s) console.log(' cycle='+r.cycle_id+' target='+r.target_id+' metric='+(r.metric_code||r.metric_id)+' item='+r.deduction_item+' score='+r.suggested_score+' st='+r.review_status+' src='+(r.source_table||'')+' idx='+(r.source_id||'')+' detail='+JSON.stringify(r.source_detail));

  console.log('\n===== hse_assessment_metric 相关指标 =====');
  const m = await q(`SELECT id, code, name, parent_id FROM hse_assessment_metric WHERE is_deleted=FALSE AND (name LIKE '%目标职责%' OR name LIKE '%否决%' OR code LIKE '%ACCIDENT%' OR code LIKE '%SAFE%') ORDER BY id`);
  for (const r of m) console.log(' metric_id='+r.id+' code='+r.code+' name='+r.name+' parent='+r.parent_id);

  console.log('\n===== 规则所需 metric 映射（admin 目标职责/否决项）=====');
  const rules = await q(`SELECT id, rule_code, rule_name, category, metric_id, metric_code FROM hse_assessment_rule WHERE is_deleted=FALSE AND category IN ('目标职责','否决项') AND adapter_key IN ('safety_culture','accident_veto') ORDER BY category`);
  for (const r of rules) console.log(' rule_id='+r.id+' cat=['+r.category+'] code='+r.rule_code+' metric_id='+r.metric_id+' metric_code='+r.metric_code+' name='+r.rule_name);

  console.log('\n===== 这些 target 的现状 score_total / review =====');
  const t = await q(`SELECT id, cycle_id, employee_name, position, score_total, review_status FROM hse_assessment_target WHERE id IN (769,770,771,845,904)`);
  for (const r of t) console.log(' target='+r.id+' cycle='+r.cycle_id+' '+r.employee_name+'['+r.position+'] score='+r.score_total+' review='+r.review_status);
  process.exit(0);
})().catch((e)=>{console.log('ERR',e.message);process.exit(1);});