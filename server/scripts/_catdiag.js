const fs=require('fs');const path=require('path');const XLSX=require('xlsx');
const { pool, testConnection } = require('../config/db');
const BASE='G:/safety_vault/04_现场管理/27、HSE月度考核';
const YM={ '2025-08':44,'2025-09':45,'2025-10':46,'2025-11':47,'2025-12':48,
  '2026-01':49,'2026-02':50,'2026-03':51,'2026-04':52,'2026-05':53,'2026-06':28,'2026-07':27 };
function cs(v){return String(v==null?'':v).trim();}
function num(v){if(v===''||v==null)return 0;const n=Number(v);return Number.isFinite(n)?n:0;}
function pickFile(yd,md){
  const dir=path.join(BASE,`${yd}年`,md);if(!fs.existsSync(dir))return null;
  const files=fs.readdirSync(dir).filter(n=>!n.startsWith('~$')&&/\.(xlsx|xls)$/i.test(n));
  let a=files.filter(n=>/乡镇作业中心经理/.test(n));
  if(!a.length)a=files.filter(n=>/主管/.test(n));if(!a.length)return null;
  a.sort((x,y)=>(/（终）|终版|\(终\)/.test(x)?0:1)-(/（终）|终版|\(终\)/.test(y)?0:1));
  return path.join(dir,a[0]);
}
function parse(file){
  const wb=XLSX.readFile(file);const rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,defval:''});
  let hdr=-1,nameCol=-1;for(let i=0;i<Math.min(rows.length,10);i++){
    const r=rows[i]||[];const j=r.findIndex(c=>cs(c)==='姓名');if(j>=0){hdr=i;nameCol=j;break;}}
  if(hdr<0||nameCol<0)return null;
  const hr=rows[hdr]||[];
  // 得分列：表头为 得分/成绩；共计列：表头含 共计
  let scoreCol=-1,totalCol=-1;
  for(let c=0;c<hr.length;c++){const s=cs(hr[c]);if(/^得分$|^成绩$/.test(s)&&scoreCol<0)scoreCol=c;if(/共计/.test(s)&&totalCol<0)totalCol=c;}
  if(scoreCol<0)return null;
  const out={};
  for(let i=hdr+1;i<rows.length;i++){
    const r=rows[i]||[];const n=cs(r[nameCol]);if(!n||n==='/'||n==='—'||n==='-')continue;
    // 类别列固定为 姓名列+1..+8：文化/晨会/记录/驾驶/转运/消防/三违/否决
    out[n]={culture:num(r[nameCol+1]),morning:num(r[nameCol+2]),record:num(r[nameCol+3]),
      driver:num(r[nameCol+4]),transfer:num(r[nameCol+5]),fire:num(r[nameCol+6]),
      sanwei:num(r[nameCol+7]),veto:num(r[nameCol+8])};
    out[n].training=out[n].morning+out[n].record;
    out[n].total=totalCol>=0?num(r[totalCol]):null;
    out[n].score=num(r[scoreCol]);
  }
  return out;
}
(async()=>{
  await testConnection();
  const L=[];
  const agg={}; // 类别 -> {excelTot, sysTot, 缺实例数}
  for(const [mon,cid] of Object.entries(YM)){
    const [yd,mdn]=mon.split('-');const mm=`${Number(mdn)}月`;
    const f=pickFile(yd,mm);if(!f)continue;
    const ex=parse(f);if(!ex)continue;
    const sys=await pool.query(
      `SELECT t.employee_name, t.score_total FROM hse_assessment_target t
        WHERE t.cycle_id=$1 AND position='乡镇作业中心经理' AND t.is_deleted=FALSE`,[cid]);
    const sysIds=sys.rows.map(r=>r.employee_name);
    const ded=await pool.query(
      `SELECT t.employee_name AS n, ded.source_detail->>'category' AS cat, ded.suggested_score AS s
         FROM hse_assessment_deduction ded JOIN hse_assessment_target t ON t.id=ded.target_id
        WHERE t.cycle_id=$1 AND t.position='乡镇作业中心经理' AND ded.is_deleted=FALSE`,[cid]);
    const catSum={};for(const r of ded.rows){const k=r.n;catSum[k]=catSum[k]||{};catSum[k][r.cat||'未分类']=(catSum[k][r.cat||'未分类']||0)+Number(r.s);}
    const names=new Set([...Object.keys(ex),...sysIds]);
    for(const n of names){
      const e=ex[n];const t=sys.rows.find(r=>r.employee_name===n);
      if(!e||!t)continue;
      const sysTotal=Number(t.score_total);
      const d=+(e.score-sysTotal).toFixed(2);
      if(Math.abs(d)<=0.005)continue;
      const sysCat=catSum[n]||{};
      const defs=[['文化','culture','安全文化建设'],['培训','training','HSE教育培训'],
        ['驾驶','driver','现场管理-驾驶员管理'],['转运','transfer','现场管理-转运站管理'],
        ['消防','fire','(无消防类别)'],['三违','sanwei','三违管理'],['否决','veto','否决项']];
      const gaps=[];
      for(const [lab,key,cat] of defs){const es=e[key];const ss=sysCat[cat]||0;const g=+(es-ss).toFixed(2);gaps.push([lab,es,ss,g]);}
      const line=`${mon} ${n} | Excel${e.score} vs 系统${sysTotal} (Δ${d}) | `+
        gaps.map(([lab,es,ss,g])=>`${lab}:E${es}/S${ss}(${g>0?'缺'+g:g<0?'多'+(-g):'对'})`).join(' ');
      L.push(line);
    }
  }
  console.log(L.join('\n'));
  fs.writeFileSync(__dirname+'/_catdiag.txt',L.join('\n'));
  process.exit(0);
})().catch(e=>{console.error(e.message);process.exit(1);});