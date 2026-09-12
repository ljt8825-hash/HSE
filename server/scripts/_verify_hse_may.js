const { pool, testConnection } = require('../config/db');
async function q(sql, ...a) { const r = await pool.query(sql, a); return r.rows; }
(async () => {
  await testConnection();
  console.log('===== 2026-05(cycle53) HSE教育培训 相关扣分行 =====');
  const rows = await q(`SELECT d.target_id, t.employee_name, d.suggested_score, d.confirmed_score, d.review_status, d.source_table, d.deduction_item, d.source_detail->>'category' cat, d.is_deleted
     FROM hse_assessment_deduction d JOIN hse_assessment_target t ON t.id=d.target_id
     WHERE d.cycle_id=53 AND t.position='管理员' AND d.is_deleted=FALSE
       AND (d.source_detail->>'category'='HSE教育培训' OR d.source_table LIKE '%training%' OR d.source_table LIKE '%ledger%')
     ORDER BY t.employee_name`);
  for (const r of rows) console.log(' '+r.employee_name+' score='+r.suggested_score+' del='+r.is_deleted+' [cat='+r.cat+'] src='+r.source_table+' item='+r.deduction_item);

  console.log('\n===== hse_training_ledger_monthly 2026-05 =====');
  const led = await q(`SELECT trainer_id, trainer_name, missing_count, incomplete_count, month FROM hse_training_ledger_monthly WHERE month LIKE '2026-05%' ORDER BY trainer_id`);
  for (const r of led) console.log(' trainer='+r.trainer_id.toString().padEnd(6)+' '+r.trainer_name+' missing='+r.missing_count+' incomplete='+r.incomplete_count);

  console.log('\n===== 对应 employee_id（管理员对象）=====');
  const t = await q(`SELECT id, employee_id, employee_name FROM hse_assessment_target WHERE cycle_id=53 AND position='管理员' AND employee_name IN ('康景英','高新民','李先菊')`);
  for (const r of t) console.log(' target='+r.id+' employee_id='+r.employee_id+' '+r.employee_name);

  console.log('\n===== 该周期 sumDeductionsByCategory 口径下的 HSE教育培训 =====');
  const agg = await q(`SELECT t.employee_name, SUM(CASE WHEN d.review_status IN ('approved','adjusted') THEN COALESCE(d.confirmed_score,d.suggested_score) ELSE d.suggested_score END)::numeric tot
     FROM hse_assessment_deduction d JOIN hse_assessment_target t ON t.id=d.target_id
     WHERE d.cycle_id=53 AND t.position='管理员' AND d.is_deleted=FALSE AND d.review_status<>'rejected'
       AND d.deduction_type IN ('auto','chain_transmission','auto_deduction')
       AND d.source_detail->>'category'='HSE教育培训'
       AND t.employee_name IN ('康景英','高新民','李先菊')
     GROUP BY t.employee_name`);
  for (const r of agg) console.log(' '+r.employee_name+' HSE教育培训合计='+r.tot);
  process.exit(0);
})().catch((e)=>{console.log('ERR',e.message);process.exit(1);});