const { pool, testConnection } = require('../config/db');
(async()=>{
  await testConnection();
  // 张和祥 cyc27 三违扣分明细
  const d1=(await pool.query(
    `SELECT ded.id,ded.deduction_item,ded.source_detail,ded.source_table,ded.deduction_source,ded.is_deleted,ded.created_at,ded.updated_at
       FROM hse_assessment_deduction ded JOIN hse_assessment_target t ON t.id=ded.target_id
      WHERE t.cycle_id=27 AND t.employee_name='张和祥' AND ded.source_table='hse_sanwei_score_monthly'`)).rows;
  console.log('=== 张和祥 cyc27 三违扣分('+d1.length+') ===');
  for(const x of d1) console.log(JSON.stringify({id:x.id,item:x.deduction_item,src:x.deduction_source,del:x.is_deleted,detail:x.source_detail},null,1));
  // 事故表中 谢俊章/张华平 相关
  console.log('\n=== 事故相关表名 ===');
  const tabs=(await pool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name ILIKE '%accident%' OR table_name ILIKE '%veto%'`)).rows;
  console.log(tabs.map(r=>r.table_name).join(', '));
  console.log('\n=== 否决项扣分记录 ===');
  const d2=(await pool.query(
    `SELECT ded.id,ded.target_id,ded.cycle_id,ded.deduction_item,ded.source_table,ded.suggested_score,ded.source_detail->>'category' AS cat,ded.is_deleted,ded.created_at
       FROM hse_assessment_deduction ded
      WHERE ded.cycle_id=27 AND ded.source_detail->>'category'='否决项' AND ded.is_deleted=FALSE`)).rows;
  for(const x of d2) console.log(JSON.stringify({id:x.id,target:x.target_id,item:x.deduction_item,table:x.source_table,s:x.suggested_score,cat:x.cat,del:x.is_deleted}));
  pool.end();
})().catch(e=>{console.error(e.message);process.exit(1);});