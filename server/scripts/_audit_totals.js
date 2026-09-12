const { pool, testConnection } = require('../config/db');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const BASE = 'G:/safety_vault/04_现场管理/27、HSE月度考核';
function cs(v){return String(v==null?'':v).trim();}
function isBlank(n){return !n||n==='/'||n==='—'||n==='-';}

// 找每月《管理员月度考核结果》文件（与 sanweiAdminRoster.findAdminFile 一致）
function findAdmin(year, mon){
  const dir=path.join(BASE,`${year}年`,`${mon}月`);
  if(!fs.existsSync(dir))return null;
  const files=fs.readdirSync(dir)
    .filter(n=>!String(n).startsWith('~$'))
    .filter(n=>/\.(xlsx|xls)$/i.test(n))
    .filter(n=>/管理员/.test(n)&&!/乡镇作业中心经理|主管/.test(n));
  if(!files.length)return null;
  files.sort((a,b)=>(/^[\d月]+管理员月度考核结果/.test(a)?0:1)-(/^[\d月]+管理员月度考核结果/.test(b)?0:1));
  return path.join(dir,files[0]);
}

// 解析主表：每人 {name, total}（total=扣分共计）
function parseMainTotal(p){
  const wb=XLSX.readFile(p);
  const sn=(wb.SheetNames||[]).find(n=>/管理员月度考核结果/.test(n))||wb.SheetNames[0];
  const rows=XLSX.utils.sheet_to_json(wb.Sheets[sn],{header:1,defval:''});
  let cat=-1;for(let i=0;i<rows.length;i++){if(cs(rows[i]&&rows[i][0]).includes('被考核人')){cat=i;break;}}
  if(cat<0)return null;
  const sub=rows[cat+1]||[];
  let nameI=-1,posI=-1,totalI=-1;
  // total 列：表头含 扣分共计/扣分合计/总计/合计
  sub.forEach((v,c)=>{const s=cs(v);if(s==='姓名'&&nameI<0)nameI=c;else if(s==='职务'&&posI<0)posI=c;});
  // 从被考核人信息里定位 total（可能在 cat 行或其上一行）
  for(let r=cat;r>=0;r--){
    const rr=rows[r]||[];
    for(let c=0;c<rr.length;c++){if(/扣分共计|合计|总计|扣分合计|结果/.test(cs(rr[c]))){totalI=c;break;}}
    if(totalI>=0)break;
  }
  if(nameI<0||totalI<0)return {rows:null, totalI, nameI, sub};
  const out=[];
  for(let i=cat+2;i<rows.length;i++){
    const r=rows[i]||[];const name=cs(r[nameI]);if(isBlank(name))continue;
    const pos=posI>=0?cs(r[posI]):'';
    if(posI>=0&&pos!=='管理员')continue;
    out.push({name,total:Number(r[totalI])||0});
  }
  return {rows:out,nameI,totalI,cat,sub};
}

(async()=>{
  await testConnection();
  const cycR=await pool.query(`SELECT id,assessment_year,assessment_month FROM hse_assessment_cycle WHERE is_deleted=FALSE ORDER BY assessment_year,assessment_month`);
  const cycById=new Map();const cycByYm=new Map();
  for(const c of cycR.rows){const m=`${c.assessment_year}-${String(c.assessment_month).padStart(2,'0')}`;cycById.set(Number(c.id),c);cycByYm.set(m,Number(c.id));}

  const months=[];for(let y=2025;y<=2026;y++){const mm = y===2025?8:1;for(let m=mm;m<=12;m++){const mon=`${y}-${String(m).padStart(2,'0')}`;if(mon<='2026-07'&&mon>='2025-08')months.push(mon);}}

  for(const mon of months){
    const cid=cycByYm.get(mon);const [y,mm]=mon.split('-').map(Number);
    const file=findAdmin(y,mm);
    let excel=null;if(file){const p=parseMainTotal(file);excel=p&&p.rows?p.rows:null;}
    // 系统
    let sysMap=new Map();
    if(cid!=null){
      const s=await pool.query(
        `SELECT t.employee_name, COALESCE(SUM(d.suggested_score) FILTER (WHERE d.is_deleted=FALSE),0) AS ded
           FROM hse_assessment_target t
           LEFT JOIN hse_assessment_deduction d ON d.target_id=t.id
          WHERE t.cycle_id=$1 AND t.position='管理员' AND t.is_deleted=FALSE
          GROUP BY t.employee_name`,[cid]);
      sysMap=new Map(s.rows.map(r=>[r.employee_name,Number(r.ded)]));
    }
    const exNames=excel?excel.reduce((m,x)=>m.set(x.name,x.total),new Map()):null;
    const sysNames=new Set(sysMap.keys());
    const exNameSet=excel?new Set(excel.map(x=>x.name)):new Set();

    const onlySys=[...sysNames].filter(n=>!exNameSet.has(n));
    const onlyEx=excel?[...exNameSet].filter(n=>!sysNames.has(n)):[];
    // 差值
    let diffs=[];
    for(const n of sysNames){
      const s=sysMap.get(n)||0;const e=excel&&exNames?exNames.get(n):null;
      if(e==null)continue;
      if(Math.abs(s-e)>0.001)diffs.push({n,s,e,diff:Math.round((s-e)*100)/100});
    }
    console.log(`\n===== ${mon} (cycle ${cid==null?'N/A':cid}) ${file?'':'[无管理员表]'} =====`);
    console.log('  系统人数='+sysNames.size+' Excel人数='+(excel?excel.length:'-'));
    console.log('  仅系统(不在Excel):'+ (onlySys.length?onlySys.join(','):'无'));
    console.log('  仅Excel(不在系统):'+ (onlyEx.length?onlyEx.join(','):'无'));
    if(diffs.length){
      console.log('  系统≠Excel 差值:');
      for(const d of diffs)console.log('    '+d.n+': 系统'+d.s+' vs Excel'+d.e+' (Δ'+(d.diff>0?'+':'')+d.diff+')');
    } else console.log('  系统与Excel 全部一致');
  }
  process.exit(0);
})().catch(e=>{console.error('ERR',e.message);process.exit(1);});