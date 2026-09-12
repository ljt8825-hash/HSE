/**
 * 聚焦 3 周期（cyc45/46/47 = 2025-09/10/11）对比报告数据构建。
 * 差异化显示：Δ≠0 才报告；admin/manager 双岗位。
 * 口径调整：
 *   - cyc47(2025-11) 乡镇作业中心经理：安全文化建设不计入考核 → 系统得分 = score_total + 安全文化建设扣分合计
 *   - 其余周期/岗位：系统得分 = score_total
 */
const fs=require('fs');const path=require('path');const XLSX=require('xlsx');
const { pool, testConnection } = require('../config/db');
const BASE='G:/safety_vault/04_现场管理/27、HSE月度考核';
const CYCLES={ '2025-09':45,'2025-10':46,'2025-11':47 };
const CULTURE_ADJ_CYCLE='2025-11'; // 仅此周期经理调整

function cs(v){return String(v==null?'':v).trim();}
function isBlank(n){return !n||n==='/'||n==='—'||n==='-';}
function pickFile(yd, md, kind){
  const dir=path.join(BASE,`${yd}年`,md);
  if(!fs.existsSync(dir))return null;
  const files=fs.readdirSync(dir).filter(n=>!String(n).startsWith('~$')&&/\.(xlsx|xls)$/i.test(n));
  if(kind==='admin'){
    const a=files.filter(n=>/管理员/.test(n));
    a.sort((x,y)=>(/^[\d月]+管理员(月度)?考核结果/.test(x)?0:1)-(/^[\d月]+管理员(月度)?考核结果/.test(y)?0:1));
    return a[0]?path.join(dir,a[0]):null;
  } else {
    let a=files.filter(n=>/乡镇作业中心经理/.test(n));
    if(!a.length)a=files.filter(n=>/主管/.test(n));
    if(!a.length)return null;
    a.sort((x,y)=>(/（终）|终版|\(终\)/.test(x)?0:1)-(/（终）|终版|\(终\)/.test(y)?0:1));
    return path.join(dir,a[0]);
  }
}
function parseScores(file){
  let wb;try{wb=XLSX.readFile(file);}catch(e){return {ok:false,err:'read:'+e.message};}
  const sn=wb.SheetNames[0];
  const data=XLSX.utils.sheet_to_json(wb.Sheets[sn],{header:1,defval:''});
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
    const v=r[scoreI];const num = v===''||v==null ? null : Number(v);
    out[n]=Number.isNaN(num)? (cs(v)||null):num;
  }
  return {ok:true, scores:out};
}

(async()=>{
  await testConnection();
  const result={};
  const fileLog=[];
  for(const [mon,cid] of Object.entries(CYCLES)){
    const [yd,mdn]=mon.split('-');const mm=`${Number(mdn)}月`;
    result[mon]={cid,admin:{},manager:{}};
    for(const [kind,pos] of [['admin','管理员'],['manager','乡镇作业中心经理']]){
      const f=pickFile(yd,mm,kind);
      const p=parseScores(f);
      // 系统得分（默认 score_total）；cyc47 经理 = score_total + 安全文化建设扣分
      const sys=await pool.query(
        `SELECT t.employee_name,
                ROUND(COALESCE(t.score_total,0)::numeric,2) AS total,
                ROUND(COALESCE(t.score_auto,0)::numeric,2) AS auto,
                COALESCE((SELECT ROUND(SUM(
                    CASE WHEN d.review_status IN ('approved','adjusted')
                         THEN COALESCE(d.confirmed_score,d.suggested_score) ELSE d.suggested_score END
                  )::numeric,2)
                   FROM hse_assessment_deduction d
                  WHERE d.target_id=t.id AND d.is_deleted=FALSE AND d.review_status<>'rejected'
                    AND d.source_table='hse_safety_culture_monthly'),0) AS culture
           FROM hse_assessment_target t WHERE t.cycle_id=$1 AND position=$2 AND is_deleted=FALSE`,[cid,pos]);
      const sysMap={};
      for(const r of sys.rows){
        let score=Number(r.total);
        if(kind==='manager' && CULTURE_ADJ_CYCLE===mon) score = Math.round((score + Number(r.culture))*100)/100;
        sysMap[r.employee_name]={total:score, rawTotal:Number(r.total), culture:Number(r.culture), auto:Number(r.auto)};
      }
      const R={file:f?path.basename(f):null,excelErr:null,sys:{},excel:{},diff:[],sysOnly:[],exOnly:[],matches:0,ok:true,sysMap,sysRaw:Object.fromEntries(Object.entries(sysMap).map(([k,v])=>[k,v.rawTotal]))};
      if(!f){R.excelErr='无文件';R.ok=false;}
      else if(!p.ok){R.excelErr=p.err;R.ok=false;}
      else{
        R.excel=p.scores;
        const names=new Set([...Object.keys(p.scores),...Object.keys(sysMap)]);
        for(const n of names){
          const ex=p.scores[n], sy=sysMap[n];
          if(ex!=null&&sy){const d=+((ex)-(sy.total)).toFixed(2);R.matches++;if(Math.abs(d)>0.005)R.diff.push({n,ex,sy:sy.total,d,raw:sy.rawTotal,culture:sy.culture});}
          else if(ex!=null&&!sy)R.exOnly.push(n);
          else if(!ex&&sy)R.sysOnly.push(n);
        }
      }
      R.sys=Object.fromEntries(Object.entries(sysMap).map(([k,v])=>[k,v.total]));
      result[mon][kind]=R;
      fileLog.push(`${mon} ${kind}: file=${path.basename(f||'')} ${R.excelErr||''} match=${R.matches} diff=${R.diff.length} exOnly=[${R.exOnly.join(',')}] sysOnly=[${R.sysOnly.join(',')}] diffDetail=[${R.diff.map(x=>`${x.n}:ex${x.ex}sys${x.sy}`).join(', ')}]`);
    }
  }
  console.log('== 文件与差异概览 ==');
  fileLog.forEach(x=>console.log('  '+x));
  fs.writeFileSync(__dirname+'/_report3_data.json', JSON.stringify(result,null,1));
  process.exit(0);
})().catch(e=>{console.error('ERR',e.message);process.exit(1);});