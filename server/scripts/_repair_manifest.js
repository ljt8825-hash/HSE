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
  let a=files.filter(n=>/乡镇作业中心经理/.test(n));if(!a.length)a=files.filter(n=>/主管/.test(n));if(!a.length)return null;
  a.sort((x,y)=>(/（终）|终版|\(终\)/.test(x)?0:1)-(/（终）|终版|\(终\)/.test(y)?0:1));
  return path.join(dir,a[0]);
}
function parse(file){
  const wb=XLSX.readFile(file);const rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,defval:''});
  let hdr=-1,nameCol=-1;for(let i=0;i<Math.min(rows.length,10);i++){const r=rows[i]||[];const j=r.findIndex(c=>cs(c)==='姓名');if(j>=0){hdr=i;nameCol=j;break;}}
  if(hdr<0||nameCol<0)return null;
  const hr=rows[hdr]||[];let scoreCol=-1;for(let c=0;c<hr.length;c++){if(/^得分$|^成绩$/.test(cs(hr[c]))&&scoreCol<0)scoreCol=c;}if(scoreCol<0)return null;
  const out={};
  for(let i=hdr+1;i<rows.length;i++){
    const r=rows[i]||[];const n=cs(r[nameCol]);if(!n||n==='/'||n==='—'||n==='-')continue;
    out[n]={culture:num(r[nameCol+1]),morning:num(r[nameCol+2]),record:num(r[nameCol+3]),
      driver:num(r[nameCol+4]),transfer:num(r[nameCol+5]),fire:num(r[nameCol+6]),
      sanwei:num(r[nameCol+7]),veto:num(r[nameCol+8])};
    out[n].training=out[n].morning+out[n].record;out[n].score=num(r[scoreCol]);
  }
  return out;
}
(async()=>{
  await testConnection();
  const MT=[['文化','culture','安全文化建设'],['培训','training','HSE教育培训'],['驾驶','driver','现场管理-驾驶员管理'],
    ['转运','transfer','现场管理-转运站管理'],['消防','fire','(消防)'],['三违','sanwei','三违管理'],['否决','veto','否决项']];
  const MANIFEST=[];
  const MISSREC=[]; // detail of existing system records for persons with a category gap
  for(const [mon,cid] of Object.entries(YM)){
    const [yd,mdn]=mon.split('-');const mm=`${Number(mdn)}月`;
    const f=pickFile(yd,mm);if(!f)continue;
    const ex=parse(f);if(!ex)continue;
    const sys=await pool.query(`SELECT id,employee_name,score_total FROM hse_assessment_target t WHERE t.cycle_id=$1 AND position='乡镇作业中心经理' AND t.is_deleted=FALSE`,[cid]);
    const sysMap={};for(const r of sys.rows)sysMap[r.employee_name]=r.id;
    const ded=await pool.query(`SELECT t.employee_name AS n,ded.metric_code,ded.deduction_item,ded.source_table,ded.source_detail->>'category' AS cat,ded.suggested_score AS s FROM hse_assessment_deduction ded JOIN hse_assessment_target t ON t.id=ded.target_id WHERE t.cycle_id=$1 AND t.position='乡镇作业中心经理' AND ded.is_deleted=FALSE ORDER BY t.employee_name`,[cid]);
    const catSum={};const items={};
    for(const r of ded.rows){const k=r.n;catSum[k]=catSum[k]||{};catSum[k][r.cat||'未分类']=(catSum[k][r.cat||'未分类']||0)+Number(r.s);
      items[k]=items[k]||[];items[k].push({cat:r.cat||'未分类',code:r.metric_code,item:r.deduction_item,tab:r.source_table,s:Number(r.s)});}
    for(const n of Object.keys(ex)){
      if(!sysMap[n])continue;
      for(const [mn,en,cat] of MT){
        const es=ex[n][en]||0;const ss=catSum[n]?catSum[n][cat]||0:0;
        if(es>ss+0.001){
          MANIFEST.push(`[${mon}] ${n} | ${cat} 缺扣 ${+(es-ss).toFixed(2)}（Excel ${es}/系统 ${ss}）`);
          if(items[n])for(const it of items[n].filter(x=>x.cat===cat))MISSREC.push(`    - 现存: ${it.code}|${it.item}|${it.tab}|${it.s}`);
        }
      }
    }
  }
  const out=['# 乡镇作业中心经理分数差异·缺失扣分修复清单','',...MANIFEST];
  fs.writeFileSync(__dirname+'/_repair_manifest.md',out.join('\n'));
  fs.writeFileSync(__dirname+'/_repair_missrec.txt',MISSREC.join('\n'));
  console.log('缺失扣分条目数: '+MANIFEST.length);
  console.log(MANIFEST.slice(0,60).join('\n'));
  process.exit(0);
})().catch(e=>{console.error(e.message);process.exit(1);});