const { pool, testConnection } = require('../config/db');
const path = require('path');
const XLSX = require('xlsx');
const BASE = 'G:/safety_vault/04_现场管理/27、HSE月度考核';
async function q(sql, ...a) { const r = await pool.query(sql, a); return r.rows; }
(async () => {
  await testConnection();
  console.log('===== 2025-08 Excel 三违值（张东霞/李春福 所在行） =====');
  const wb = XLSX.readFile(path.join(BASE,'2025年','8月','8月管理员考核结果.xlsx'));
  const data = XLSX.utils.sheet_to_json(wb.Sheets['管理员月度考核结果'],{header:1,defval:null});
  for(let i=3;i<data.length;i++){const r=data[i];const n=r&&r[2];if(n&&/张东霞|李春福/.test(String(n)))console.log(' R'+i+' 姓名='+n+' 三违[8]='+r[8]+' [3,4]目标职责='+r[3]+','+r[4]+' [5-7]HSE='+r[5]+','+r[6]+','+r[7]);}

  console.log('\n===== hse_assessment_target 全部列 =====');
  const cols = await q("SELECT column_name FROM information_schema.columns WHERE table_name='hse_assessment_target' ORDER BY ordinal_position");
  console.log(cols.map(c=>c.column_name).join(', '));
  const cset = new Set(cols.map(c=>c.column_name));

  console.log('\n===== 这两人 cycle44 是否存在 + 全部扣分行 =====');
  const sel = ['id','employee_id','position','employee_name','score_total'].filter(c=>cset.has(c)).join(',');
  const t = await q(`SELECT ${sel} FROM hse_assessment_target WHERE cycle_id=$1 AND is_deleted=FALSE AND employee_name IN ('张东霞','李春福')`, 44);
  for (const r of t){
    console.log(' target='+r.id+' pos='+r.position+' name='+r.employee_name+' score='+r.score_total);
    const d = await q(`SELECT id, deduction_item, suggested_score, confirmed_score, review_status, source_table, source_detail->>'category' cat, source_detail FROM hse_assessment_deduction WHERE target_id=$1 AND is_deleted=FALSE`, r.id);
    for (const x of d) console.log('    did='+x.id+' ['+x.cat+'] score='+x.suggested_score+' src='+x.source_table+' item='+x.deduction_item);
  }

  console.log('\n===== hse_sanwei_score_monthly 列 =====');
  const scols = await q("SELECT column_name FROM information_schema.columns WHERE table_name='hse_sanwei_score_monthly' ORDER BY ordinal_position");
  console.log(scols.map(c=>c.column_name).join(', '));
  const sset = new Set(scols.map(c=>c.column_name));
  console.log('\n===== 按可能的姓名/月份列查询 2025-08 两人 =====');
  const nameCols = scols.map(c=>c.column_name).filter(c=>/name|person|employee|admin|manager|姓名/.test(c));
  const s = await q(`SELECT * FROM hse_sanwei_score_monthly WHERE month LIKE '2025-08%' LIMIT 5`);
  if (s.length) console.log('sample:', JSON.stringify(s[0]));
  for (const r of s){
    const hit = nameCols.some(c=>{const v=r[c];return v!=null&&/张东霞|李春福/.test(String(v));});
    if (hit) console.log(JSON.stringify(r));
  }

  console.log('\n===== 2025-08 Excel 全表头 + 张东霞/李春福 整行 =====');
  for(let i=0;i<5;i++){const r=data[i];console.log('H'+i+' => '+JSON.stringify(r&&r.slice(0,14)));}
  for(let i=3;i<data.length;i++){const r=data[i];const n=r&&r[2];if(n&&/张东霞|李春福/.test(String(n)))console.log('R'+i+' => '+JSON.stringify(r&&r.slice(0,14)));}
  process.exit(0);
})().catch((e)=>{console.log('ERR',e.message);process.exit(1);});