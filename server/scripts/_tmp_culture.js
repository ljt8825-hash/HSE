const { pool, testConnection } = require('../config/db');
(async()=>{
  await testConnection();
  for(const [mon,cid] of [['2025-08',44],['2026-04',52]]){
    console.log('\n===== 扣分记录 '+mon+' (cyc'+cid+') 安全文化建设 =====');
    const r=await pool.query(
      `SELECT t.employee_name, ded.suggested_score, ded.confirmed_score, ded.review_status, ded.is_deleted, ded.source_detail->>'category' AS cat
         FROM hse_assessment_deduction ded JOIN hse_assessment_target t ON t.id=ded.target_id
        WHERE t.cycle_id=$1 AND t.position='乡镇作业中心经理' AND ded.source_table='hse_safety_culture_monthly' ORDER BY t.employee_name`,[cid]);
    for(const x of r.rows) console.log(JSON.stringify({name:x.employee_name,sug:x.suggested_score,conf:x.confirmed_score,sts:x.review_status,del:x.is_deleted}));
    if(!r.rows.length) console.log('  (无任何文化扣分记录)');
  }
  // 检查 2026-04 这几人的文化扣分（可能未删但score=0）
  console.log('\n===== 2026-04 全部文化相关 =====');
  const all=await pool.query(
    `SELECT t.employee_name, ded.metric_code, ded.deduction_item, ded.suggested_score, ded.review_status, ded.is_deleted
       FROM hse_assessment_deduction ded JOIN hse_assessment_target t ON t.id=ded.target_id
      WHERE t.cycle_id=52 AND t.employee_name IN ('孙建栋','王臣祥','杨清华') AND ded.source_table='hse_safety_culture_monthly'`);
  console.log(JSON.stringify(all.rows,null,1));
  pool.end();
})().catch(e=>{console.error(e.message);pool.end();});