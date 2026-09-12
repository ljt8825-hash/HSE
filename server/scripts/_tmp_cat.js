const { pool, testConnection } = require('../config/db');
(async()=>{
  await testConnection();
  const r = await pool.query(
    `SELECT DISTINCT ded.source_detail->>'category' AS cat, COUNT(*) 
     FROM hse_assessment_deduction ded
     WHERE ded.is_deleted=FALSE GROUP BY 1 ORDER BY 1`);
  console.log('=== 系统扣分类别 ===');
  for(const x of r.rows) console.log((x.cat||'未分类')+'  ('+x.count+')');
  // 各适配器 source_table 有哪些
  const t = await pool.query(
    `SELECT ded.source_table, ded.metric_code, COUNT(*) FROM hse_assessment_deduction ded
     WHERE ded.is_deleted=FALSE GROUP BY 1,2 ORDER BY 1,2`);
  console.log('\n=== 来源表/指标码 ===');
  for(const x of t.rows) console.log(x.source_table+' | '+x.metric_code+' | '+x.count);
  pool.end();
})().catch(e=>{console.error(e.message);pool.end();});