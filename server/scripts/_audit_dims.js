const path=require('path');const fs=require('fs');const XLSX=require('xlsx');
const { pool, testConnection } = require('../config/db');
const BASE='G:/safety_vault/04_现场管理/27、HSE月度考核';
function cs(v){return String(v==null?'':v).trim();}
function isBlank(n){return !n||n==='/'||n==='—'||n==='-';}
function findAdmin(y,m){const d=path.join(BASE,`${y}年`,`${m}月`);if(!fs.existsSync(d))return null;const f=fs.readdirSync(d).filter(n=>!String(n).startsWith('~$')).filter(n=>/\.(xlsx|xls)$/i.test(n)).filter(n=>/管理员/.test(n)&&!/乡镇作业中心经理|主管/.test(n));if(!f.length)return null;f.sort((a,b)=>(/^[\d月]+管理员月度考核结果/.test(a)?0:1)-(/^[\d月]+管理员月度考核结果/.test(b)?0:1));return path.join(d,f[0]);}
// sub 表头 → 维度
function classifyDim(h){
  const s=cs(h);
  if(/举报|表彰/.test(s))return '加分项';   // 三违举报/表彰属加分，需先于三违判断
  if(/指标|责任书|专项|职责|游园|主题活动/.test(s))return '目标职责';
  if(/培训|签字|覆盖面|教育|未全员/.test(s))return 'HSE教育培训';
  if(/三违|违章|操作规程/.test(s))return '三违';
  if(/事故|否决|死亡|次责|环境污染/.test(s))return '否决项';
  if(/加分|创新|举措/.test(s))return '加分项';
  if(/共计|结果|得分|合计/.test(s))return 'result';
  return 'meta';
}
function parseMainDims(p){
  const wb=XLSX.readFile(p);const sn=(wb.SheetNames||[]).find(n=>/管理员月度考核结果/.test(n))||wb.SheetNames[0];
  const rows=XLSX.utils.sheet_to_json(wb.Sheets[sn],{header:1,defval:''});
  let cat=-1;for(let i=0;i<rows.length;i++){if(cs(rows[i]&&rows[i][0]).includes('被考核人')){cat=i;break;}}
  if(cat<0)return null;
  const sub=rows[cat+1]||[];
  const dim=sub.map(classifyDim);
  let nameI=-1;sub.forEach((v,c)=>{if(cs(v)==='姓名'&&nameI<0)nameI=c;});
  if(nameI<0)return null;
  const out=[];
  for(let i=cat+2;i<rows.length;i++){
    const r=rows[i]||[];const name=cs(r[nameI]);if(isBlank(name))continue;
    const sums={目标职责:0,'HSE教育培训':0,'三违':0,'否决项':0,'加分项':0};
    for(let c=0;c<r.length;c++){const d=dim[c];if(d&&d in sums)sums[d]+=(Number(r[c])||0);}
    out.push({name,sums});
  }
  return out;
}
function dm(c){const m={目标职责:'目标职责','HSE教育培训':'HSE教育培训','三违管理':'三违','否决项':'否决项'};return m[c]||c;}
(async()=>{
  await testConnection();
  const cycR=await pool.query(`SELECT id,assessment_year,assessment_month FROM hse_assessment_cycle WHERE is_deleted=FALSE ORDER BY assessment_year,assessment_month`);
  const ym2id=new Map();for(const c of cycR.rows)ym2id.set(`${c.assessment_year}-${String(c.assessment_month).padStart(2,'0')}`,Number(c.id));
  const DIMMS=['目标职责','HSE教育培训','三违','否决项'];
  const months=[];for(let y=2025;y<=2026;y++){for(let m=1;m<=12;m++){const mon=`${y}-${String(m).padStart(2,'0')}`;if(mon>='2025-08'&&mon<='2026-07')months.push(mon);}}
  for(const mon of months){
    const cid=ym2id.get(mon);const [y,mm]=mon.split('-').map(Number);const file=findAdmin(y,mm);
    const excel=file?parseMainDims(file):null;
    if(!excel){console.log(`\n#### ${mon}: 无主表`);continue;}
    // 系统 per-category
    const s=await pool.query(
      `SELECT t.employee_name, d.source_detail->>'category' AS cat, SUM(d.suggested_score) AS pts
         FROM hse_assessment_target t LEFT JOIN hse_assessment_deduction d ON d.target_id=t.id AND d.is_deleted=FALSE
        WHERE t.cycle_id=$1 AND t.position='管理员' AND t.is_deleted=FALSE
        GROUP BY t.employee_name, d.source_detail->>'category'`,[cid]);
    const sys=new Map();
    for(const r of s.rows){if(!r.cat)continue;const k=r.employee_name;if(!sys.has(k))sys.set(k,{});sys.get(k)[dm(r.cat)]=(sys.get(k)[dm(r.cat)]||0)+Number(r.pts);}
    const diffs=[];
    for(const ex of excel){
      const sy=sys.get(ex.name);if(!sy)continue;
      for(const D of DIMMS){const ev=ex.sums[D]||0;const dv=sy[D]||0;if(Math.abs(ev-dv)>0.001)diffs.push(`${ex.name}[${D}] 系统${dv} vs Excel${ev} (Δ${Math.round((dv-ev)*100)/100})`);}
    }
    console.log(`\n#### ${mon} (cycle ${cid}${file?'':'无文件'})`);
    if(diffs.length){console.log('  维度差异:');for(const d of diffs)console.log('    '+d);}
    else console.log('  四个维度全部一致');
  }
  process.exit(0);
})().catch(e=>{console.error('ERR',e.message);process.exit(1);});