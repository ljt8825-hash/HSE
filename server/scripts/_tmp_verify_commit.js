const { pool, testConnection } = require('../config/db');
(async()=>{
  await testConnection();
  const n=(await pool.query(`SELECT COUNT(*)::int c FROM hse_assessment_deduction WHERE source_table='excel_monthly_alignment'`)).rows[0].c;
  console.log('excel_monthly_alignment 记录数:',n);
  const r=(await pool.query(`SELECT id,target_id,cycle_id,suggested_score,source_detail->>'category' AS cat,is_deleted,created_at FROM hse_assessment_deduction WHERE source_table='excel_monthly_alignment' ORDER BY id LIMIT 50`)).rows;
  for(const x of r) console.log(`  id=${x.id} tgt=${x.target_id} cyc=${x.cycle_id} ${x.cat}=${x.suggested_score} del=${x.is_deleted} ${x.created_at}`);
  // 李振恒 cyc50(2026-03) 全查
  console.log('\n李振恒 cyc50 所有扣分(含已删):');
  const d=(await pool.query(`SELECT ded.id,ded.deduction_source,ded.source_table,ded.suggested_score,ded.source_detail->>'category' AS cat,ded.is_deleted FROM hse_assessment_deduction ded JOIN hse_assessment_target t ON t.id=ded.target_id WHERE t.cycle_id=50 AND t.employee_name='李振恒' ORDER BY ded.id`)).rows;
  for(const x of d) console.log(`  id=${x.id} ${x.source_table} ${x.cat}=${x.suggested_score} src=${x.deduction_source} del=${x.is_deleted}`);
  pool.end();
})().catch(e=>{console.error(e.message);process.exit(1);});