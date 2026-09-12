const fs=require('fs');const path=require('path');const XLSX=require('xlsx');
const { pool, testConnection } = require('../config/db');
const BASE='G:/safety_vault/04_现场管理/27、HSE月度考核';
function cs(v){return String(v==null?'':v).trim();}
function isBlank(n){return !n||n==='/'||n==='—'||n==='-';}

// 在指定目录下挑选目标文件
function pickFile(yd, md, kind){
  const dir=path.join(BASE,`${yd}年`,md);
  if(!fs.existsSync(dir))return null;
  const files=fs.readdirSync(dir).filter(n=>!String(n).startsWith('~$')&&/\.(xlsx|xls)$/i.test(n));
  if(kind==='admin'){ // 管理员：不含 乡镇/主管
    const a=files.filter(n=>/管理员/.test(n));
    a.sort((x,y)=>(/^[\d月]+管理员(月度)?考核结果/.test(x)?0:1)-(/^[\d月]+管理员(月度)?考核结果/.test(y)?0:1));
    return a[0]?path.join(dir,a[0]):null;
  } else { // 乡镇作业中心经理：优先 乡镇，否则 主管(2025-08)
    let a=files.filter(n=>/乡镇作业中心经理/.test(n));
    if(!a.length)a=files.filter(n=>/主管/.test(n));
    if(!a.length)return null;
    // 终版优先
    a.sort((x,y)=>(/（终）|终版|\(终\)/.test(x)?0:1)-(/（终）|终版|\(终\)/.test(y)?0:1));
    return path.join(dir,a[0]);
  }
}

// 解析 sheet1 的 (姓名 -> 得分)
function parseScores(file){
  let wb;try{wb=XLSX.readFile(file);}catch(e){return {ok:false,err:'read:'+e.message};}
  const sn=wb.SheetNames[0];
  const data=XLSX.utils.sheet_to_json(wb.Sheets[sn],{header:1,defval:''});
  // 找同时含「姓名」和「得分/成绩」的表头行
  let nameI=-1,scoreI=-1,hdr=-1;
  for(let i=0;i<Math.min(data.length,10);i++){
    const r=data[i]||[];let ni=-1,si=-1;
    for(let c=0;c<r.length;c++){const s=cs(r[c]);if(s==='姓名'&&ni<0)ni=c;if(s==='得分'&&si<0)si=c;}
    if(si<0){for(let c=0;c<r.length;c++){const s=cs(r[c]);if(/^成绩$/.test(s)&&si<0)si=c;}}
    if(ni>=0&&si>=0){nameI=ni;scoreI=si;hdr=i;break;}
  }
  if(hdr<0)return {ok:false,err:'no-header(姓名/得分)'};
  const out={};
  for(let i=hdr+1;i<data.length;i++){
    const r=data[i]||[];const n=cs(r[nameI]);if(isBlank(n))continue;
    const v=r[scoreI];
    const num = v===''||v==null ? null : Number(v);
    out[n]=Number.isNaN(num)? (cs(v)||null):num;
  }
  return {ok:true, scores:out};
}

const ymid={ '2025-08':'2025-08','2025-09':'2025-09','2025-10':'2025-10','2025-11':'2025-11','2025-12':'2025-12',
  '2026-01':'2026-01','2026-02':'2026-02','2026-03':'2026-03','2026-04':'2026-04','2026-05':'2026-05','2026-06':'2026-06','2026-07':'2026-07'};
const fileLog=[];
(async()=>{
  await testConnection();
  const cycR=await pool.query(`SELECT id,assessment_year,assessment_month FROM hse_assessment_cycle WHERE is_deleted=FALSE`);
  const ym=new Map();cycR.rows.forEach(c=>ym.set(`${c.assessment_year}-${String(c.assessment_month).padStart(2,'0')}`,Number(c.id)));

  const result={};
  for(const mon of Object.keys(ymid)){
    const [yd,mdn]=mon.split('-');const mm=`${Number(mdn)}月`;
    const cid=ym.get(mon);
    result[mon]={ cid, admin:{}, manager:{} };
    for(const [kind,pos] of [['admin','管理员'],['manager','乡镇作业中心经理']]){
      const f=pickFile(yd,mm,kind);
      const p=parseScores(f);
      // 系统
      const sys=await pool.query(
        `SELECT employee_name, ROUND(COALESCE(score_total,0)::numeric,2) AS total, ROUND(COALESCE(score_auto,0)::numeric,2) AS auto
           FROM hse_assessment_target WHERE cycle_id=$1 AND position=$2 AND is_deleted=FALSE`,[cid,pos]);
      const sysMap={};sys.rows.forEach(r=>sysMap[r.employee_name]={total:Number(r.total),auto:Number(r.auto)});
      const R={ file:f?path.basename(f):null, excelErr:null, sys:{}, excel:{}, diff:[], sysOnly:[], exOnly:[], matches:0, ok:true };
      if(!f){R.excelErr='无文件';R.ok=false;}
      else if(!p.ok){R.excelErr=p.err;R.ok=false;}
      else{
        R.excel=p.scores;
        const names=new Set([...Object.keys(p.scores),...Object.keys(sysMap)]);
        for(const n of names){
          const ex=p.scores[n], sy=sysMap[n];
          if(ex!=null&&sy){const d=+( (ex)-(sy.total) ).toFixed(2);R.matches++;if(Math.abs(d)>0.005)R.diff.push({n,ex,sy:sy.total,d});}
          else if(ex!=null&&!sy)R.exOnly.push(n);
          else if(!ex&&sy)R.sysOnly.push(n);
        }
      }
      R.sys=Object.fromEntries(Object.entries(sysMap).map(([k,v])=>[k,v.total]));
      result[mon][kind]=R;
      fileLog.push(`${mon} ${kind}: file=${path.basename(f)} ${R.excelErr||''} excel=${Object.keys(R.excel).length} sys=${Object.keys(R.sys).length} diff=${R.diff.length} exOnly=${R.exOnly.join(',')} sysOnly=${R.sysOnly.join(',')}`);
    }
  }
  // 控制台小结算
  console.log('== 文件与解析概览 ==');
  fileLog.forEach(x=>console.log('  '+x));
  console.log('\n== 各月分岗位差异人数 ==');
  for(const mon of Object.keys(result)){
    const a=result[mon].admin, m=result[mon].manager;
    console.log(`  ${mon}: 管理员 match=${a.matches} diff=${a.diff.length} | 乡镇 match=${m.matches} diff=${m.diff.length} ${m.excelErr||''}`);
  }
  // 存中间结果供第二步生成报告
  fs.writeFileSync(__dirname+'/_report_data.json', JSON.stringify(result,null,1));
  process.exit(0);
})().catch(e=>{console.error('ERR',e.message);process.exit(1);});