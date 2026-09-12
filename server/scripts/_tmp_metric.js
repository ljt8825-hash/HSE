const { pool, testConnection } = require('../config/db');
(async()=>{
  await testConnection();
  const r=await pool.query(`SELECT id,metric_code FROM hse_assessment_metric WHERE metric_code IN ('HSE-KPI-ACT-001','HSE-KPI-TRN-003','HSE-KPI-DRV-003','HSE-KPI-TRF-003','HSE-KPI-SAF-001')`);
  console.log(r.rows.map(x=>`${x.metric_code}=id${x.id}`).join('\n'));
  // 各类别上限(经理)
  const c=await pool.query(`SELECT category,max_deduct,target_role FROM hse_assessment_category_limit WHERE target_role IN ('manager')`);
  console.log('\n类别上限:'); for(const x of c.rows) console.log(`  ${x.category}: ${x.max_deduct} (${x.target_role})`);
  pool.end();
})().catch(e=>{console.error(e.message);process.exit(1);});