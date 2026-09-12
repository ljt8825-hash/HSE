const { pool, testConnection } = require('../config/db');
(async()=>{
  await testConnection();
  const cols=(await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='accidents' ORDER BY ordinal_position`)).rows.map(r=>r.column_name);
  console.log('accidents 字段:', cols.join(', '));
  const r=(await pool.query(`SELECT * FROM accidents ORDER BY id DESC LIMIT 20`)).rows;
  console.log('\n最近 20 条事故:');
  for(const x of r){
    const pick={};for(const c of ['id','accident_name','accident_type','occurrence_date','location','description','identify_status','assessment_status','cycle_id','person_name','person_id']) if(c in x) pick[c]=x[c];
    console.log(JSON.stringify(pick));
  }
  pool.end();
})().catch(e=>{console.error(e.message);process.exit(1);});