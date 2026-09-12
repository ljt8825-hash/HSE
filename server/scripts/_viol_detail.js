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
function excelViol(p){
  const wb = XLSX.readFile(p); const ws = wb.Sheets['管理员月度考核结果'];
  const data = XLSX.utils.sheet_to_json(ws,{header:1,defval:null});
  const is080 = data[2]&&String(data[2][2]).trim()==='姓名';
  const out={};
  for(let i=3;i<data.length;i++){const r=data[i];if(!r)continue;
    const name = is080?r[2]:r[4];
    if(!name||!String(name).trim()||String(name).trim()==='/')continue;
    const ix = is080?8:10;
    const v=r[ix];
    out[String(name).trim()] = v==null?0:(Number(v)||0);
  }
  return out;
}
(async () => {
  await testConnection();
  console.log('===== 三违管理 系统 vs Excel 逐月逐人明细（系统=扣分规则行口径，与自动评分页一致） =====\n');
  for (const pl of PLAN){
    const exc = excelViol(path.join(BASE,String(pl.y)+'年',String(pl.m)+'月',pl.f));
    const targets = await q(`SELECT id, employee_name FROM hse_assessment_target WHERE cycle_id=$1 AND position='管理员' AND is_deleted=FALSE`, pl.cid);
    const ids=targets.map(t=>t.id);
    const rows = ids.length?await q(`SELECT target_id, SUM(CASE WHEN review_status IN ('approved','adjusted') THEN COALESCE(confirmed_score,suggested_score) ELSE suggested_score END)::numeric tot
       FROM hse_assessment_deduction WHERE cycle_id=$1 AND target_id IN (${ids.join(',')}) AND is_deleted=FALSE AND review_status<>'rejected'
       AND deduction_type IN ('auto','chain_transmission','auto_deduction') AND source_detail->>'category' LIKE '%三违%' GROUP BY target_id`, pl.cid):[];
    const agg = {}; for(const r of rows) agg[String(r.target_id)]=Number(r.tot);
    const sys={}; for(const t of targets) sys[t.employee_name]=(agg[String(t.id)]||0);
    const mism=[];
    for(const n of Object.keys(exc)){ if(sys[n]!==undefined && Math.abs(sys[n]-exc[n])>0.001) mism.push([n, sys[n], exc[n]]); }
    console.log('▶ '+pl.y+'-'+String(pl.m).padStart(2,'0')+'  不一致 '+mism.length+' 人');
    if (mism.length){
      mism.sort((a,b)=>b[2]-a[2]||a[0].localeCompare(b[0]));
      for(const [n,s,e] of mism) console.log('    '+n.padEnd(6,' ')+' 系统='+s+'  Excel='+e+'  '+(e>s?'(系统低)':e<s?'(系统高)':''));
    }
    console.log('');
  }
  process.exit(0);
})().catch((e)=>{console.log('ERR',e.message);process.exit(1);});