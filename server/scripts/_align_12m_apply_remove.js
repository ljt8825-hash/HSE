const fs=require('fs');const path=require('path');const XLSX=require('xlsx');
const { pool, testConnection } = require('../config/db');
const engine=require('../services/assessmentScoringEngine');
const BASE='G:/safety_vault/04_现场管理/27、HSE月度考核';
const YM={ '2025-08':44,'2025-09':45,'2025-10':46,'2025-11':47,'2025-12':48,
  '2026-01':49,'2026-02':50,'2026-03':51,'2026-04':52,'2026-05':53,'2026-06':28,'2026-07':27 };
function cs(v){return String(v==null?'':v).trim();}function num(v){if(v===''||v==null)return 0;const n=Number(v);return Number.isFinite(n)?n:0;}
const CATS=[
  {key:'culture',sys:'安全文化建设',col:1},
  {key:'training',sys:'HSE教育培训',col:[2,3]},
  {key:'driver',sys:'现场管理-驾驶员管理',col:4},
  {key:'transfer',sys:'现场管理-转运站管理',col:5},
  {key:'fire',sys:'__FIRE__',col:6},
  {key:'sanwei',sys:'三违管理',col:7},
  {key:'veto',sys:'否决项',col:8},
];
function pickFile(yd,md){const dir=path.join(BASE,`${yd}年`,md);if(!fs.existsSync(dir))return null;const files=fs.readdirSync(dir).filter(n=>!n.startsWith('~$')&&/\.(xlsx|xls)$/i.test(n));let a=files.filter(n=>/乡镇作业中心经理/.test(n));if(!a.length)a=files.filter(n=>/主管/.test(n));if(!a.length)return null;a.sort((x,y)=>(/（终）|终版|\(终\)/.test(x)?0:1)-(/（终）|终版|\(终\)/.test(y)?0:1));return path.join(dir,a[0]);}
function parse(file){let wb;try{wb=XLSX.readFile(file);}catch(e){return null;}const rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,defval:''});let hdr=-1,nameCol=-1;for(let i=0;i<Math.min(rows.length,10);i++){const r=rows[i]||[];const j=r.findIndex(c=>cs(c)==='姓名');if(j>=0){hdr=i;nameCol=j;break;}}if(hdr<0||nameCol<0)return null;const hr=rows[hdr]||[];let sc=-1;for(let c=0;c<hr.length;c++){if(/^得分$|^成绩$/.test(cs(hr[c]))&&sc<0)sc=c;}if(sc<0)return null;const out={};for(let i=hdr+1;i<rows.length;i++){const r=rows[i]||[];const n=cs(r[nameCol]);if(!n||n==='/'||n==='—'||n==='-')continue;const v={};for(const c of CATS)v[c.key]=Array.isArray(c.col)?c.col.reduce((a,ci)=>a+num(r[nameCol+ci]),0):num(r[nameCol+c.col]);out[n]=v;}return out;}
(async()=>{
  await testConnection();
  // 1) 计算 REMOVE 清单（post-ADD 状态）
  const removes=[];const R=Math.round;
  for(const [mon,cid] of Object.entries(YM)){
    const [yd,mdn]=mon.split('-');const mm=`${Number(mdn)}月`;
    const f=pickFile(yd,mm);const ex=parse(f);if(!ex)continue;
    const tgts=(await pool.query(`SELECT id,employee_name FROM hse_assessment_target WHERE cycle_id=$1 AND position='乡镇作业中心经理' AND is_deleted=FALSE`,[cid])).rows;
    const tMap={};for(const t of tgts)tMap[t.employee_name]=t;
    const ded=(await pool.query(`SELECT t.employee_name AS n,ded.id AS did,ded.source_detail->>'category' AS cat,ded.suggested_score AS s FROM hse_assessment_deduction ded JOIN hse_assessment_target t ON t.id=ded.target_id WHERE t.cycle_id=$1 AND t.position='乡镇作业中心经理' AND ded.is_deleted=FALSE`,[cid])).rows;
    const catRecs={};for(const r of ded){catRecs[r.n]=catRecs[r.n]||{};catRecs[r.n][r.cat||'未分类']=catRecs[r.n][r.cat||'未分类']||[];catRecs[r.n][r.cat||'未分类'].push({id:r.did,s:Number(r.s)});}
    const catSum={};for(const r of ded){catSum[r.n]=catSum[r.n]||{};catSum[r.n][r.cat||'未分类']=(catSum[r.n][r.cat||'未分类']||0)+Number(r.s);}
    for(const n of Object.keys(ex)){
      if(!tMap[n])continue;
      for(const c of CATS){
        if(c.key==='veto'||c.key==='fire')continue;
        if(c.key==='culture'&&mon==='2025-11')continue; // cyc47 文化不计分
        const E=ex[n][c.key];const S=catSum[n]?catSum[n][c.sys]||0:0;const delta=+(E-S).toFixed(2);
        if(delta<-0.001)removes.push({mon,cid,name:n,target:tMap[n].id,block:c.key,sys:c.sys,E,S,delta,recs:catRecs[n]?catRecs[n][c.sys]||[]:[]});
      }
    }
  }
  console.log('REMOVE 待执行:',removes.length);
  fs.writeFileSync(__dirname+'/_align_remove_list.txt',removes.map(p=>`[${p.mon}] ${p.name} ${p.sys} Excel${p.E}/Sys${p.S} Δ${p.delta} recs=${JSON.stringify(p.recs)}`).join('\n'));

  // 2) 执行：逐板块把合计降到 Excel（软删/缩分）
  const client=await pool.connect();const touched=[];
  try{
    await client.query('BEGIN');
    for(const rm of removes){
      let rem=Math.round(Math.abs(rm.delta)*100)/100;
      for(const rec of rm.recs){
        if(rm.E===0&&rm.recs.length===0)break;
        if(rem<=0.0001)break;
        const s=rec.s;
        if(s<=rem+0.0001){
          const up=await client.query(`UPDATE hse_assessment_deduction SET is_deleted=TRUE, remark=COALESCE(remark,'')||'【直映射REMOVE】${rm.sys}减扣${s}分(Excel对齐)', updated_at=NOW() WHERE id=$1 AND is_deleted=FALSE RETURNING id`,[rec.id]);
          if(up.rows.length){rem=Math.round((rem-s)*100)/100;touched.push(`[${rm.mon}] ${rm.name} ${rm.sys} 软删ded${rec.id}(${s})`);}
        }else{
          const newS=Math.round((s-rem)*100)/100;
          const up=await client.query(`UPDATE hse_assessment_deduction SET suggested_score=$2, remark=COALESCE(remark,'')||'【直映射REMOVE】${rm.sys}:${s}→${newS}分(Excel对齐)', updated_at=NOW() WHERE id=$1 AND is_deleted=FALSE RETURNING id`,[rec.id,newS]);
          if(up.rows.length){touched.push(`[${rm.mon}] ${rm.name} ${rm.sys} ded${rec.id} ${s}→${newS}`);rem=0;}
        }
      }
    }
    await client.query('COMMIT');
  }catch(e){await client.query('ROLLBACK');console.error('ERR',e.message);process.exit(1);}
  finally{client.release();}

  // 3) 重算受影响 target
  const seen={};
  for(const t of touched){const m=t.match(/\[(.+?)\] (.+?) /);}
  const targets=[...new Set(removes.map(r=>`${r.cid}:${r.target}:${r.name}:${r.mon}`))];
  for(const k of targets){const [cid,tid,nm,mon]=k.split(':');const res=await engine.recalculateTarget(+cid,+tid);console.log(`recalc [${mon}] ${nm} → scoreTotal=${res.scoreTotal}`);}

  // 4) 验证：REMOVE 后分类别合计 vs Excel
  console.log('\n===== 验证 REMOVE 后分类别合计 vs Excel =====');
  let ok=0,no=0;
  for(const rm of removes){
    const sum=(await pool.query(`SELECT COALESCE(SUM(suggested_score),0)::float s FROM hse_assessment_deduction WHERE target_id=$1 AND cycle_id=$2 AND is_deleted=FALSE AND source_detail->>'category'=$3 AND review_status<>'rejected'`,[rm.target,rm.cid,rm.sys])).rows[0].s;
    const good=Math.abs(sum-rm.E)<=0.501;
    if(good)ok++;else{no++;
      const cur=(await pool.query(`SELECT id,suggested_score,is_deleted FROM hse_assessment_deduction WHERE target_id=$1 AND cycle_id=$2 AND source_detail->>'category'=$3 ORDER BY id`,[rm.target,rm.cid,rm.sys])).rows;
      console.log(`  ✗ [${rm.mon}] ${rm.name} ${rm.sys}: 现${sum} vs Excel${rm.E} (recs=${JSON.stringify(cur)})`);
    }
  }
  console.log(`\nREMOVE 验证: 通过 ${ok} / 存疑 ${no} / 总数 ${removes.length}`);
  process.exit(0);
})().catch(e=>{console.error('ERR',e.message);process.exit(1);});