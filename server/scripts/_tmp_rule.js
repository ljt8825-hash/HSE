const { pool, testConnection } = require('../config/db');
(async()=>{
  await testConnection();
  const r=await pool.query(`SELECT rule_code,adapter_key,rule_name,deduct_score,category,trigger_type,integration_status,metric_code FROM hse_assessment_rule WHERE adapter_key IN ('safety_culture','training_ledger','driver_monthly') OR rule_code IN ('SAFE_AUTO') ORDER BY adapter_key`);
  for(const x of r.rows) console.log(JSON.stringify(x));
  pool.end();
})().catch(e=>{console.error(e.message);pool.end();});