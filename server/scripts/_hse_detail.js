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
  console.log('===== HSE教育培训 系统 vs Excel 逐月逐人明细 =====\n');
  for (const pl of PLAN){
    const exc = excelHse(path.join(BASE,String(pl.y)+'年',String(pl.m)+'月',pl.f));
    const mon = `${pl.y}-${String(pl.m).padStart(2,'0')}`;
    const ledger = await q(`SELECT trainer_id, COALESCE(missing_count,0)+COALESCE(incomplete_count,0) score FROM hse_training_ledger_monthly WHERE month=$1`,[mon]);
    const sys = {};
    const agg={};
    if(pl.cid){
      const targets = await q(`SELECT id, employee_id, employee_name, score_total FROM hse_assessment_target WHERE cycle_id=$1 AND position='管理员' AND is_deleted=FALSE`,pl.cid);
      const ids=targets.map(t=>t.id);
      const ded = ids.length?await q(`SELECT target_id, source_detail, suggested_score FROM hse_assessment_deduction WHERE cycle_id=$1 AND target_id IN (${ids.join(',')}) AND is_deleted=FALSE AND review_status<>'rejected' AND deduction_type IN ('auto','chain_transmission','auto_deduction')`,pl.cid):[];
      for(const d of ded){const cat=d.source_detail&&d.source_detail.category; if(cat&&cat==='HSE教育培训'){agg[d.target_id]=(agg[d.target_id]||0)+(Number(d.suggested_score)||0);}}
      const le = new Map(ledger.map((l) => [String(l.trainer_id), Number(l.score)]));
      // 页面口径 = 扣分规则行(category='HSE教育培训')合计，不做台账表覆盖
      for (const t of targets) {
        sys[t.employee_name] = (agg[t.id] || 0);
        void le;
      }
    }
    const mism=[];
    for(const n of Object.keys(exc)){ if(sys[n]!==undefined && Math.abs(sys[n]-exc[n])>0.001) mism.push([n, sys[n], exc[n]]); }
    console.log('▶ '+mon+'  不一致 '+mism.length+' 人'+(pl.cid?'':'（系统无管理员对象）'));
    // 按Excel扣分降序
    mism.sort((a,b)=>b[2]-a[2]||a[0].localeCompare(b[0]));
    for(const [n,s,e] of mism) console.log('    '+n.padEnd(6,' ')+' 系统='+s+'  Excel='+e+'  '+(e>s?'(系统低)':e<s?'(系统高)':''));
    console.log('');
  }
  process.exit(0);
})().catch((e)=>{console.log('ERR',e.message);process.exit(1);});