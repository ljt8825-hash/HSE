const fs=require('fs');const path=require('path');const XLSX=require('xlsx');
const { pool, testConnection } = require('../config/db');
const BASE='G:/safety_vault/04_现场管理/27、HSE月度考核';
const YM={ '2025-08':44,'2025-09':45,'2025-10':46,'2025-11':47,'2025-12':48,
  '2026-01':49,'2026-02':50,'2026-03':51,'2026-04':52,'2026-05':53,'2026-06':28,'2026-07':27 };
function cs(v){return String(v==null?'':v).trim();}
function num(v){if(v===''||v==null)return 0;const n=Number(v);return Number.isFinite(n)?n:0;}
// 板块: key, sysCat(系统类别), src列偏移(nameCol+n)
const CATS=[
  {key:'culture',sys:'安全文化建设',col:1},
  {key:'training',sys:'HSE教育培训',col:[2,3]},
  {key:'driver',sys:'现场管理-驾驶员管理',col:4},
  {key:'transfer',sys:'现场管理-转运站管理',col:5},
  {key:'fire',sys:'__FIRE__',col:6},
  {key:'sanwei',sys:'三违管理',col:7},
  {key:'veto',sys:'否决项',col:8},
];
function pickFile(yd,md){
  const dir=path.join(BASE,`${yd}年`,md);if(!fs.existsSync(dir))return null;
  const files=fs.readdirSync(dir).filter(n=>!n.startsWith('~$')&&/\.(xlsx|xls)$/i.test(n));
  let a=files.filter(n=>/乡镇作业中心经理/.test(n));if(!a.length)a=files.filter(n=>/主管/.test(n));if(!a.length)return null;
  a.sort((x,y)=>(/（终）|终版|\(终\)/.test(x)?0:1)-(/（终）|终版|\(终\)/.test(y)?0:1));
  return path.join(dir,a[0]);
}
function parse(file){
  let wb;try{wb=XLSX.readFile(file);}catch(e){return null;}
  const rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,defval:''});
  let hdr=-1,nameCol=-1;for(let i=0;i<Math.min(rows.length,10);i++){const r=rows[i]||[];const j=r.findIndex(c=>cs(c)==='姓名');if(j>=0){hdr=i;nameCol=j;break;}}
  if(hdr<0||nameCol<0)return null;
  const hr=rows[hdr]||[];let scoreCol=-1;for(let c=0;c<hr.length;c++){if(/^得分$|^成绩$/.test(cs(hr[c]))&&scoreCol<0)scoreCol=c;}if(scoreCol<0)return null;
  const out={};
  for(let i=hdr+1;i<rows.length;i++){
    const r=rows[i]||[];const n=cs(r[nameCol]);if(!n||n==='/'||n==='—'||n==='-')continue;
    const v={};for(const c of CATS){v[c.key]=Array.isArray(c.col)?c.col.reduce((a,ci)=>a+num(r[nameCol+ci]),0):num(r[nameCol+c.col]);}
    v.score=num(r[scoreCol]);out[n]=v;
  }
  return out;
}
(async()=>{
  await testConnection();
  const plan=[];const recap={ADD:0,REMOVE:0,FIRE_UNMAPPED:0,VETO_SKIP:0,NONE:0};
  for(const [mon,cid] of Object.entries(YM)){
    const [yd,mdn]=mon.split('-');const mm=`${Number(mdn)}月`;
    const f=pickFile(yd,mm);if(!f)continue;
    const ex=parse(f);if(!ex)continue;
    const tgts=(await pool.query(`SELECT id,employee_name,score_total FROM hse_assessment_target WHERE cycle_id=$1 AND position='乡镇作业中心经理' AND is_deleted=FALSE`,[cid])).rows;
    const tMap={};for(const t of tgts)tMap[t.employee_name]=t;
    const ded=(await pool.query(`SELECT t.employee_name AS n,ded.id AS did,ded.source_detail->>'category' AS cat,ded.suggested_score AS s FROM hse_assessment_deduction ded JOIN hse_assessment_target t ON t.id=ded.target_id WHERE t.cycle_id=$1 AND t.position='乡镇作业中心经理' AND ded.is_deleted=FALSE`,[cid])).rows;
    const catSum={};const catRecs={};
    for(const r of ded){catSum[r.n]=catSum[r.n]||{};catSum[r.n][r.cat||'未分类']=(catSum[r.n][r.cat||'未分类']||0)+Number(r.s);
      catRecs[r.n]=catRecs[r.n]||{};catRecs[r.n][r.cat||'未分类']=catRecs[r.n][r.cat||'未分类']||[];catRecs[r.n][r.cat||'未分类'].push({id:r.did,s:Number(r.s)});}
    for(const n of Object.keys(ex)){
      if(!tMap[n])continue;
      for(const c of CATS){
        const E=ex[n][c.key];const S=catSum[n]?catSum[n][c.sys]||0:0;const delta=+(E-S).toFixed(2);
        const recs=(catRecs[n]&&catRecs[n][c.sys])||[];
        if(c.key==='veto'){recap.VETO_SKIP++;plan.push({cyc:mon,cid,name:n,target:tMap[n].id,block:c.key,excel:E,sys:S,delta,action:'VETO-SKIP'});continue;}
        if(c.key==='fire'){recap.FIRE_UNMAPPED++;plan.push({cyc:mon,cid,name:n,target:tMap[n].id,block:c.key,excel:E,sys:S,delta,action:'FIRE-UNMAPPED'});continue;}
        if(Math.abs(delta)<=0.001){recap.NONE++;continue;}
        const action=delta>0?'ADD':'REMOVE';recap[action]++;
        plan.push({cyc:mon,cid,name:n,target:tMap[n].id,block:c.key,excel:E,sys:S,delta:delta,action,recs});
      }
    }
  }
  fs.writeFileSync(__dirname+'/_align_plan.json',JSON.stringify(plan,null,1));
  console.log('=== 汇总 ===');console.log(JSON.stringify(recap));
  console.log('总计划条数:',plan.length);
  console.log('\n=== 按板块action统计 ===');
  const by={};for(const p of plan)(by[p.block]=(by[p.block]||[])).push(p);
  for(const b of Object.keys(by))console.log(b+': '+by[b].reduce((o,p)=>{o[p.action]=(o[p.action]||0)+1;return o;},{}));
  console.log('\n=== 样例(前40条，仅ADD/REMOVE) ===');
  for(const p of plan.filter(p=>p.action==='ADD'||p.action==='REMOVE').slice(0,40))console.log(`  [${p.cyc}] ${p.name} ${p.block} Excel${p.excel}/Sys${p.sys} Δ${p.delta>0?'+':''}${p.delta} ${p.action} recs=${JSON.stringify(p.recs)}`);
  if(!fs.existsSync(__dirname+'/_align_plan.txt')){}
  fs.writeFileSync(__dirname+'/_align_plan.txt', plan.filter(p=>p.action==='ADD'||p.action==='REMOVE').map(p=>`[${p.cyc}] ${p.name} ${p.block} Excel${p.excel}/Sys${p.sys} Δ${p.delta>0?'+':''}${p.delta} ${p.action} recs=${JSON.stringify(p.recs)}`).join('\n'));
  process.exit(0);
})().catch(e=>{console.error(e.message);process.exit(1);});