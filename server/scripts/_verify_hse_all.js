const { pool, testConnection } = require('../config/db');
const path = require('path');
const XLSX = require('xlsx');
const BASE = 'G:/safety_vault/04_现场管理/27、HSE月度考核';
async function q(sql, ...a) { const r = await pool.query(sql, a); return r.rows; }
const PLAN = [
  { y:2025, m:8, f:'8月管理员考核结果.xlsx', cid:44 }, { y:2025, m:9, f:'9月管理员月度考核结果.xlsx', cid:45 },
  { y:2025, m:10, f:'10月管理员月度考核结果.xlsx', cid:46 }, { y:2025, m:11, f:'11月管理员月度考核结果(1).xlsx', cid:47 },
  { y:2025, m:12, f:'12月管理员月度考核结果.xlsx', cid:48 }, { y:2026, m:1, f:'1月管理员月度考核结果(1).xlsx', cid:49 },
  { y:2026, m:2, f:'2月管理员月度考核结果(1).xlsx', cid:50 }, { y:2026, m:3, f:'3月管理员月度考核结果(1).xlsx', cid:51 },
  { y:2026, m:4, f:'4月管理员月度考核结果.xlsx', cid:52 }, { y:2026, m:5, f:'5月管理员月度考核结果.xlsx', cid:53 },
];
function excelHse(p){
  const wb = XLSX.readFile(p); const ws = wb.Sheets['管理员月度考核结果'];
  const data = XLSX.utils.sheet_to_json(ws,{header:1,defval:null});
  const is080 = data[2]&&String(data[2][2]).trim()==='姓名';
  const out={};
  for(let i=3;i<data.length;i++){const r=data[i];if(!r)continue;
    const name = is080?r[2]:r[4];
    if(!name||!String(name).trim()||String(name).trim()==='/')continue;
    const idxs = is080?[5,6,7]:[7,8,9];
    let s=0;for(const ix of idxs){const v=r[ix];s+=v==null?0:(Number(v)||0);}
    out[String(name).trim()]=Math.round(s*100)/100;
  }
  return out;
}
(async () => {
  await testConnection();
  let totalBad = 0;
  for (const pl of PLAN){
    const exc = excelHse(path.join(BASE,String(pl.y)+'年',String(pl.m)+'月',pl.f));
    const targets = await q(`SELECT id, employee_name, score_total, score_auto FROM hse_assessment_target WHERE cycle_id=$1 AND position='管理员' AND is_deleted=FALSE`, pl.cid);
    const agg = {};
    const rows = await q(`SELECT target_id, SUM(CASE WHEN review_status IN ('approved','adjusted') THEN COALESCE(confirmed_score,suggested_score) ELSE suggested_score END)::numeric tot
       FROM hse_assessment_deduction WHERE cycle_id=$1 AND target_id IN (${targets.map(t=>t.id).join(',')}) AND is_deleted=FALSE AND review_status<>'rejected'
       AND deduction_type IN ('auto','chain_transmission','auto_deduction') AND source_detail->>'category'='HSE教育培训' GROUP BY target_id`, pl.cid);
    for (const r of rows) agg[String(r.target_id)] = Number(r.tot);
    const bad = [];
    for (const t of targets){ const s = agg[String(t.id)]||0, e = exc[t.employee_name]||0; if (Math.abs(s-e)>0.001) bad.push(`${t.employee_name}(sys=${s},exc=${e})`); }
    totalBad += bad.length;
    console.log(pl.y+'-'+String(pl.m).padStart(2,'0')+' 总管理员='+targets.length+' HSE教育培训剩余差异='+bad.length+(bad.length?(' :: '+bad.join('; ')):''));
  }
  console.log('\n总剩余差异 = '+totalBad);
  process.exit(0);
})().catch((e)=>{console.log('ERR',e.message);process.exit(1);});