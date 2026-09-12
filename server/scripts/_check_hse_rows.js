const { pool, testConnection } = require('../config/db');
async function q(sql, ...a) { const r = await pool.query(sql, a); return r.rows; }
(async () => {
  await testConnection();
  console.log('===== excel_monthly_backfill 行 =====');
  const rows = await q(`SELECT id, target_id, cycle_id, suggested_score, deduction_type, deduction_source, review_status, is_deleted, source_detail->>'category' cat, source_detail->>'deductKey' dk FROM hse_assessment_deduction WHERE source_table='excel_monthly_backfill' ORDER BY cycle_id, target_id LIMIT 40`);
  console.log('共'+rows.length);
  for (const r of rows) console.log(' id='+r.id+' c='+r.cycle_id+' t='+r.target_id+' score='+r.suggested_score+' del='+r.is_deleted+' st='+r.review_status+' [cat='+r.cat+'] dk='+(r.dk||'').slice(0,30));

  console.log('\n===== 2026-05 cycle53 一条 HSE教育培训 明细 =====');
  const d = await q(`SELECT d.id, t.employee_name, d.suggested_score, d.is_deleted, d.review_status, d.source_table, d.source_detail
    FROM hse_assessment_deduction d JOIN hse_assessment_target t ON t.id=d.target_id
    WHERE d.cycle_id=53 AND t.position='管理员' AND d.is_deleted=FALSE AND d.source_detail->>'category'='HSE教育培训' ORDER BY t.employee_name LIMIT 30`);
  for (const r of d) console.log(' '+r.employee_name+' score='+r.suggested_score+' del='+r.is_deleted+' st='+r.review_status+' src='+r.source_table+' detail='+JSON.stringify(r.source_detail));
  process.exit(0);
})().catch((e)=>{console.log('ERR',e.message);process.exit(1);});