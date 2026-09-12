const fs=require('fs');const path=require('path');const XLSX=require('xlsx');
const { pool, testConnection } = require('../config/db');
const BASE='G:/safety_vault/04_现场管理/27、HSE月度考核';
const YM={ '2025-08':44,'2025-09':45,'2025-10':46,'2025-11':47,'2025-12':48,
  '2026-01':49,'2026-02':50,'2026-03':51,'2026-04':52,'2026-05':53,'2026-06':28,'2026-07':27 };
function cs(v){return String(v==null?'':v).trim();}function num(v){if(v===''||v==null)return 0;const n=Number(v);return Number.isFinite(n)?n:0;}
function pickFile(yd,md){
  const dir=path.join(BASE,`${yd}年`,md);if(!fs.existsSync(dir))return null;
  const files=fs.readdirSync(dir).filter(n=>!n.startsWith('~$')&&/\.(xlsx|xls)$/i.test(n));
  let a=files.filter(n=>/乡镇作业中心经理/.test(n));if(!a.length)a=files.filter(n=>/主管/.test(n));if(!a.length)return null;
  a.sort((x,y)=>(/（终）|终版|\(终\)/.test(x)?0:1)-(/（终）|终版|\(终\)/.test(y)?0:1));
  return path.join(dir,a[0]);
}
function parseScore(file){
  if(!file)return null;let wb;try{wb=XLSX.readFile(file);}catch(e){return null;}
  const rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,defval:''});
  let hdr=-1,nameCol=-1;for(let i=0;i<Math.min(rows.length,10);i++){const r=rows[i]||[];const j=r.findIndex(c=>cs(c)==='姓名');if(j>=0){hdr=i;nameCol=j;break;}}
  if(hdr<0||nameCol<0)return null;const hr=rows[hdr]||[];let sc=-1;for(let c=0;c<hr.length;c++){if(/^得分$|^成绩$/.test(cs(hr[c]))&&sc<0)sc=c;}if(sc<0)return null;
  const out={};for(let i=hdr+1;i<rows.length;i++){const r=rows[i]||[];const n=cs(r[nameCol]);if(!n||n==='/'||n==='—'||n==='-')continue;out[n]=num(r[sc]);}return out;
}
(async()=>{
  await testConnection();
  const rows=[['周期','姓名','系统分','Excel分','Δ','原因'],['--','--','--','--','--','--']];
  let aligned=0, vetoPend=0, removePend=0;
  for(const [mon,cid] of Object.entries(YM)){
    const [yd,mdn]=mon.split('-');const mm=`${Number(mdn)}月`;
    const f=pickFile(yd,mm);const ex=parseScore(f);if(!ex)continue;
    const t=(await pool.query(`SELECT t.id,t.employee_name,t.score_total FROM hse_assessment_target t WHERE t.cycle_id=$1 AND t.position='乡镇作业中心经理' AND t.is_deleted=FALSE`,[cid])).rows;
    for(const x of t){
      if(ex[x.employee_name]===undefined)continue;
      const d=+(ex[x.employee_name]-x.score_total).toFixed(2);
      if(Math.abs(d)<=0.051){aligned++;continue;}
      // 原因判定
      const veto=(await pool.query(`SELECT COUNT(*)::int c FROM hse_assessment_deduction WHERE target_id=$1 AND is_deleted=FALSE AND source_detail->>'category'='否决项'`,[x.id])).rows[0].c;
      const reason = veto? (d<0?'系统已否决(缺事故待核)':'否决待事故') : 'REMOVE/其它待定';
      if(reason.startsWith('否决')||reason.includes('否决'))vetoPend++;else removePend++;
      rows.push([mon,x.employee_name,x.score_total,ex[x.employee_name],d,reason]);
    }
  }
  console.log(`对齐:${aligned}  否决待处理(缺事故/已否决待核):${vetoPend}  其它REMOVE待定:${removePend}`);
  console.log('\n=== 仍不一致明细 ===');
  for(const r of rows) if(r[0]!=='--') console.log(r.join(' | '));
  fs.writeFileSync(__dirname+'/_align_final_status.txt', rows.filter(r=>r[0]!=='--').join('\n'));
  process.exit(0);
})().catch(e=>{console.error(e.message);process.exit(1);});