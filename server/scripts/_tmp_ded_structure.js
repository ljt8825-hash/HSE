const { pool, testConnection } = require('../config/db');
(async()=>{
  await testConnection();
  const cols=(await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='hse_assessment_deduction' ORDER BY ordinal_position`)).rows.map(r=>r.column_name);
  console.log('=== hse_assessment_deduction 字段 ===\n'+cols.join(', '));
  // 取一条现成的 安全文化建设 扣分记录（cyc28=2026-06 应有）
  const ex=await pool.query(
    `SELECT d.*, t.employee_name, t.cycle_id FROM hse_assessment_deduction d
       JOIN hse_assessment_target t ON t.id=d.target_id
      WHERE d.source_detail->>'category'='安全文化建设' AND d.is_deleted=FALSE AND t.position='乡镇作业中心经理'
      ORDER BY d.id DESC LIMIT 3`);
  console.log('\n=== 现存 安全文化建设 乡镇经理扣分记录 ===');
  for(const r of ex.rows){
    console.log(JSON.stringify({
      id:r.id,cycle_id:r.cycle_id,target_id:r.target_id,employee_name:r.employee_name,
      metric_id:r.metric_id,metric_code:r.metric_code,deduction_item:r.deduction_item,
      source_table:r.source_table,source_id:r.source_id,suggested_score:r.suggested_score,
      confirmed_score:r.confirmed_score,review_status:r.review_status,review_comment:r.review_comment,
      reviewer_id:r.reviewer_id,reviewed_at:r.reviewed_at,is_deleted:r.is_deleted,remark:r.remark,
      source_detail:r.source_detail
    },null,1));
  }
  // 文化类别上限（经理）
  const cap=await pool.query(`SELECT * FROM hse_assessment_category_limit WHERE category='安全文化建设'`);
  console.log('\n=== 安全文化建设 类别上限 ==='); console.log(JSON.stringify(cap.rows,null,1));
  pool.end();
})().catch(e=>{console.error('ERR',e.message);pool.end();});