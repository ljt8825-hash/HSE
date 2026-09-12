const fs=require('fs');const path=require('path');const XLSX=require('xlsx');
const { pool, testConnection } = require('../config/db');
const engine=require('../services/assessmentScoringEngine');
const BASE='G:/safety_vault/04_现场管理/27、HSE月度考核';
const YM={ '2025-08':44,'2025-09':45,'2025-10':46,'2025-11':47,'2025-12':48,
  '2026-01':49,'2026-02':50,'2026-03':51,'2026-04':52,'2026-05':53,'2026-06':28,'2026-07':27 };
function cs(v){return String(v==null?'':v).trim();}
function num(v){if(v===''||v==null)return 0;const n=Number(v);return Number.isFinite(n)?n:0;}
const CATS=[
  {key:'culture',sys:'安全文化建设',col:1,metric:'HSE-KPI-ACT-001'},
  {key:'training',sys:'HSE教育培训',col:[2,3],metric:'HSE-KPI-TRN-003'},
  {key:'driver',sys:'现场管理-驾驶员管理',col:4,metric:'HSE-KPI-DRV-003'},
  {key:'transfer',sys:'现场管理-转运站管理',col:5,metric:'HSE-KPI-TRF-003'},
  {key:'fire',sys:'__FIRE__',col:6,metric:null},
  {key:'sanwei',sys:'三违管理',col:7,metric:'HSE-KPI-SAF-001'},
  {key:'veto',sys:'否决项',col:8,metric:'HSE-KPI-NEG-004'},
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
    const v={score:num(r[scoreCol])};for(const c of CATS){v[c.key]=Array.isArray(c.col)?c.col.reduce((a,ci)=>a+num(r[nameCol+ci]),0):num(r[nameCol+c.col]);}
    out[n]=v;
  }
  return out;
}
(async()=>{
  await testConnection();
  const m=(await pool.query(`SELECT id,metric_code FROM hse_assessment_metric WHERE metric_code IN ('HSE-KPI-ACT-001','HSE-KPI-TRN-003','HSE-KPI-DRV-003','HSE-KPI-TRF-003','HSE-KPI-SAF-001')`)).rows;
  const METRIC={};for(const x of m)METRIC[x.metric_code]=x.id;

  // 1) 计算 ADD 清单
  const adds=[];const skips=[];
  for(const [mon,cid] of Object.entries(YM)){
    const [yd,mdn]=mon.split('-');const mm=`${Number(mdn)}月`;
    const f=pickFile(yd,mm);if(!f)continue;
    const ex=parse(f);if(!ex)continue;
    const tgts=(await pool.query(`SELECT id,employee_name FROM hse_assessment_target WHERE cycle_id=$1 AND position='乡镇作业中心经理' AND is_deleted=FALSE`,[cid])).rows;
    const tMap={};for(const t of tgts)tMap[t.employee_name]=t;
    const sums={};
    const ded=(await pool.query(`SELECT t.employee_name AS n,ded.source_detail->>'category' AS cat,ded.suggested_score AS s FROM hse_assessment_deduction ded JOIN hse_assessment_target t ON t.id=ded.target_id WHERE t.cycle_id=$1 AND t.position='乡镇作业中心经理' AND ded.is_deleted=FALSE`,[cid])).rows;
    for(const r of ded){sums[r.n]=sums[r.n]||{};sums[r.n][r.cat||'未分类']=(sums[r.n][r.cat||'未分类']||0)+Number(r.s);}
    for(const n of Object.keys(ex)){
      if(!tMap[n])continue;
      for(const c of CATS){
        if(c.key==='veto'||c.key==='fire')continue;                    // veto/fire 不做
        if(c.key==='culture'&&mon==='2025-11')continue;                // cyc47 文化不计分，跳过
        const E=ex[n][c.key];const S=sums[n]?sums[n][c.sys]||0:0;const delta=+(E-S).toFixed(2);
        if(delta>0.001)adds.push({mon,cid,name:n,target:tMap[n].id,block:c.key,sys:c.sys,E,S,delta,metric:c.metric,metricId:METRIC[c.metric]});
        else if(delta<-0.001)skips.push({mon,cid,name:n,block:c.key,E,S,delta}); // REMOVE 不自动做
      }
    }
  }
  fs.writeFileSync(__dirname+'/_align_remove_list.txt', skips.map(p=>`[${p.mon}] ${p.name} ${p.block} Excel${p.E}/Sys${p.S} Δ${p.delta} (REMOVE,待定)`).join('\n'));
  console.log('ADD 待执行:',adds.length,'  REMOVE 已列清单:',skips.length,'  ');

  // 2) 执行 ADD（事务内插入，全部插入后逐个重算）
  const client=await pool.connect();
  const inserted=[];
  try{
    await client.query('BEGIN');
    for(const a of adds){
      const dup2=await client.query(`SELECT id FROM hse_assessment_deduction WHERE target_id=$1 AND cycle_id=$2 AND is_deleted=FALSE AND source_table='excel_monthly_alignment' AND source_detail->>'category'=$3 LIMIT 1`,[a.target,a.cid,a.sys]);
      if(dup2.rows.length){ console.log(`跳过(已补) [${a.mon}] ${a.name} ${a.block}`); continue; }
      const scoreId=await engine.ensureTargetScoreRecord(a.target,a.cid);
      const detail={kind:'excel_align',deductKey:`excel-align:${a.cid}:${a.target}:${a.block}`,category:a.sys,month:a.mon,excelValue:a.E,sysBefore:a.S,source:'Excel考核总结直映射补录',summary:`Excel直映射补录 ${a.sys} 扣${a.delta}分`,remark:'ADD-直映射'};
      const ins=await client.query(
        `INSERT INTO hse_assessment_deduction(score_id,target_id,cycle_id,metric_id,metric_code,deduction_item,deduction_type,deduction_source,source_table,source_id,source_detail,suggested_score,current_version,review_status,is_transmission,is_deleted,remark)
         VALUES($1,$2,$3,$4,$5,$6,'auto_deduction','auto','excel_monthly_alignment',NULL,$7,$8,1,'pending',FALSE,FALSE,$9) RETURNING id`,
        [scoreId,a.target,a.cid,a.metricId,a.metric,'Excel月度考核直映射补录',JSON.stringify(detail),a.delta,`【直映射ADD】${a.sys} 补扣${a.delta}（Excel ${a.E}）`]);
      console.log(`插入 id=${ins.rows[0].id} [${a.mon}] ${a.name} ${a.sys} +${a.delta}`);
      inserted.push(a);
    }
    await client.query('COMMIT');
  }catch(e){await client.query('ROLLBACK');console.error('ERR',e.message);process.exit(1);}
  finally{client.release();}

  // 3) 重算受影响 target
  const seen={};
  for(const a of inserted){const k=`${a.cid}:${a.target}`;if(seen[k])continue;seen[k]=1;
    const res=await engine.recalculateTarget(a.cid,a.target);
    console.log(`recalc [${a.mon}] ${a.name} → scoreTotal=${res.scoreTotal}`);}

  // 4) 验证：ADD 对象分类别是否达到 Excel
  console.log('\n===== 验证 ADD 后分类别合计 vs Excel =====');
  for(const a of inserted){
    const sum=(await pool.query(`SELECT COALESCE(SUM(d.suggested_score),0)::float AS s FROM hse_assessment_deduction d WHERE d.target_id=$1 AND d.cycle_id=$2 AND d.is_deleted=FALSE AND d.source_detail->>'category'=$3 AND d.review_status<>'rejected'`,[a.target,a.cid,a.sys])).rows[0].s;
    const ok=Math.abs(sum-a.E)<=0.101;
    console.log(`  [${a.mon}] ${a.name} ${a.sys}: 系统${sum} vs Excel${a.E} ${ok?'✓':'Δ'+ (a.E-sum).toFixed(1)}`);
  }
  fs.writeFileSync(__dirname+'/_align_add_result.txt', inserted.map(a=>`[${a.mon}] ${a.name} ${a.sys} +${a.delta}`).join('\n'));
  process.exit(0);
})().catch(e=>{console.error('ERR',e.message);process.exit(1);});