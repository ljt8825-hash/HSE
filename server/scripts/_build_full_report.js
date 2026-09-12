/**
 * 全月对比报告：2025-08 ~ 2026-07 管理员/乡镇作业中心经理
 * 系统(自动评分 score_total) vs Excel 各月「管理员月度考核结果」「乡镇作业中心经理月度考核结果」sheet1「得分」
 * 差异化显示：Δ≠0 才列；仅报告有差异的记录。
 * 口径：cyc47(2025-11) 乡镇作业中心经理「安全文化建设不计入考核」→ 系统得分 = score_total + 安全文化建设扣分
 */
const fs=require('fs');const path=require('path');const XLSX=require('xlsx');
const { pool, testConnection } = require('../config/db');
const BASE='G:/safety_vault/04_现场管理/27、HSE月度考核';
const YM={ '2025-08':44,'2025-09':45,'2025-10':46,'2025-11':47,'2025-12':48,
  '2026-01':49,'2026-02':50,'2026-03':51,'2026-04':52,'2026-05':53,'2026-06':28,'2026-07':27 };
const CULTURE_ADJ='2025-11';

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
  for(const [mon,cid] of Object.entries(YM)){
    const [yd,mdn]=mon.split('-');const mm=`${Number(mdn)}月`;
    result[mon]={cid,admin:{},manager:{}};
    for(const [kind,pos] of [['admin','管理员'],['manager','乡镇作业中心经理']]){
      const f=pickFile(yd,mm,kind);
      const p=parseScores(f);
      const sys=await pool.query(
        `SELECT t.employee_name,
                ROUND(COALESCE(t.score_total,0)::numeric,2) AS total,
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
        if(kind==='manager' && CULTURE_ADJ===mon) score = Math.round((score + Number(r.culture))*100)/100;
        sysMap[r.employee_name]={total:score, rawTotal:Number(r.total), culture:Number(r.culture)};
      }
      const R={file:f?path.basename(f):null,excelErr:null,sys:{},excel:{},diff:[],sysOnly:[],exOnly:[],matches:0,ok:true};
      if(!f){R.excelErr='无文件';R.ok=false;}
      else if(!p.ok){R.excelErr=p.err;R.ok=false;}
      else{
        R.excel=p.scores;
        const names=new Set([...Object.keys(p.scores),...Object.keys(sysMap)]);
        for(const n of names){
          const ex=p.scores[n], sy=sysMap[n];
          if((ex==null||ex===''||ex==='—') && (sy==null)) continue;
          if(ex!=null&&sy){const d=+((ex)-(sy.total)).toFixed(2);R.matches++;if(Math.abs(d)>0.005)R.diff.push({n,ex,sy:sy.total,d,culture:sy.culture});}
          else if(ex!=null&&!sy)R.exOnly.push(n);
          else if(!ex&&sy)R.sysOnly.push(n);
        }
      }
      R.sys=Object.fromEntries(Object.entries(sysMap).map(([k,v])=>[k,v.total]));
      result[mon][kind]=R;
      const diffList=R.diff.map(x=>`${x.n}${x.ex}<>${x.sy}`).join(',');
      fileLog.push(`${mon} ${kind}: ${R.excelErr?'['+R.excelErr+'] ':''}diff=${R.diff.length} exOnly=[${R.exOnly.join(',')}] sysOnly=[${R.sysOnly.join(',')}] ${diffList}`);
    }
  }

  // ===== 生成报告 =====
  const L=[];const put=(x)=>L.push(x);
  const fmt=(x)=>x==null?'—':Number(x).toFixed(1);
  put('# 「月度安全履职考核·自动评分」系统得分 与 Excel月度考核结果 差异化对比报告');
  put('');
  put('## 一、范围与方法');
  put('- **对比期间**：2025-08～2026-07（共 12 个考核周期）。');
  put('- **岗位**：管理员、乡镇作业中心经理。');
  put('- **系统得分**：`hse_assessment_target.score_total`；其中 **2025-11 乡镇作业中心经理**按口径「安全文化建设不计入考核」，系统得分 = score_total + 安全文化建设扣分（该列仅展示）。');
  put('- **Excel 得分**：对应月份《管理员月度考核结果》《乡镇作业中心经理月度考核结果》sheet1「得分/成绩」列。');
  put('- **差异口径**：Δ = Excel得分 − 系统得分；**Δ=0 不列入**，仅报告差异化（含“仅在表/仅系统”人员差异）。');
  put('');
  put('## 二、逐月汇总');
  put('| 月份(周期) | 岗位 | 分数不一致(人) | 仅在表 | 仅系统 |');
  put('|---|---|---|---|---|');
  for(const [mon,cid] of Object.entries(YM)){
    for(const [kind,lab] of [['admin','管理员'],['manager','乡镇作业中心经理']]){
      const r=result[mon][kind];
      put(`| ${mon}(cyc${cid}) | ${lab} | ${r.diff.length>0?`**${r.diff.length}**`:'0'} | ${r.exOnly.length} | ${r.sysOnly.length} |`);
    }
  }
  put('');

  for(const [mon,cid] of Object.entries(YM)){
    put('---');
    put(`## ${mon}（周期 cyc${cid}）`);
    for(const [kind,lab] of [['admin','管理员'],['manager','乡镇作业中心经理']]){
      const r=result[mon][kind];
      put(`### ${lab}`);
      if(!r.ok){put(`Excel 解析失败：${r.excelErr||'无文件'}。`);put('');continue;}
      const hasScore=r.diff.length>0;
      if(hasScore){
        put(`**分数不一致 ${r.diff.length} 人**：`);
        put('| 姓名 | Excel得分 | 系统得分 | 差值(Δ) |');
        put('|---|---|---|---|');
        for(const x of r.diff) put(`| ${x.n} | ${fmt(x.ex)} | ${fmt(x.sy)} | **${x.d}** |`);
        put('');
      }
      if(kind==='manager'&&mon===CULTURE_ADJ&&r.diff.some(x=>x.culture>0)){
        put(`> 说明：上表系统得分已按「安全文化建设不计入考核」回加该列扣分（仅 2025-11 经理）。若按原始 score_total 比较，还需另扣除文化列${r.diff.find(x=>x.culture>0).culture}分。`);
        put('');
      }
      const notes=[];
      if(r.exOnly.length) notes.push(`仅在表（Excel有/系统无）：${r.exOnly.join('、')}`);
      if(r.sysOnly.length) notes.push(`仅系统（Excel无/系统有）：${r.sysOnly.join('、')}`);
      if(notes.length){notes.forEach(n=>put(`- ${n}`));put('');}
      if(!hasScore&&!notes.length)put('（无差异）');
    }
  }
  const outPath='G:/hse-dashboard/自动评分考核对比报告_2025-2026_差异化.md';
  fs.writeFileSync(outPath, L.join('\n'));
  fs.writeFileSync(__dirname+'/_full_report_data.json', JSON.stringify(result,null,1));
  console.log('== 概览 ==');fileLog.forEach(x=>console.log('  '+x));
  console.log('\n报告已生成: '+outPath+' ('+L.length+' 行)');
  process.exit(0);
})().catch(e=>{console.error('ERR',e.message);process.exit(1);});