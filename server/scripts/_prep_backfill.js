const { pool, testConnection } = require('../config/db');
async function q(sql, ...a) { const r = await pool.query(sql, a); return r.rows; }
(async () => {
  await testConnection();
  console.log('===== hse_assessment_deduction 字段 =====');
  const cols = await q(`SELECT column_name||':'||data_type||':'||(SELECT is_nullable FROM information_schema.columns c2 WHERE c2.table_name='hse_assessment_deduction' AND c2.column_name=c.column_name) c FROM information_schema.columns c WHERE table_name='hse_assessment_deduction' ORDER BY ordinal_position`);
  console.log(cols.map(x=>x.c).join('\n'));

  console.log('\n===== 目标对象（cycle 44/45/46）=====');
  const t = await q(`SELECT id, cycle_id, employee_name, position FROM hse_assessment_target WHERE cycle_id IN (44,45,46) AND employee_name IN ('傅学武','谢洪胜','李新国','李怀英','孙建栋') ORDER BY cycle_id, employee_name`);
  for (const r of t) console.log(' target_id='+r.id+' cycle='+r.cycle_id+' '+r.employee_name+'['+r.position+']');

  console.log('\n===== 相关规则（目标职责/否决项）=====');
  const rules = await q(`SELECT id, rule_code, rule_name, category, adapter_key FROM hse_assessment_rule WHERE is_deleted=FALSE AND (category LIKE '%目标职责%' OR category LIKE '%否决%' OR rule_name LIKE '%目标职责%' OR rule_name LIKE '%否决%') ORDER BY category`);
  for (const r of rules) console.log(' rule_id='+r.id+' code='+r.rule_code+' ['+r.category+'] '+r.rule_name+' adapter='+r.adapter_key);

  console.log('\n===== cycle 44 现有 目标职责/否决项 扣分样例（取1条）=====');
  const s = await q(`SELECT target_id, rule_name, deduction_item, category, source_detail, suggested_score, confirmed_score, review_status, deduction_type, created_by FROM hse_assessment_deduction WHERE cycle_id IN (44,45,46) AND is_deleted=FALSE ORDER BY id DESC LIMIT 5`);
  for (const r of s) console.log(JSON.stringify(r));
  process.exit(0);
})().catch((e)=>{console.log('ERR',e.message);process.exit(1);});