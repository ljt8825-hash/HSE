const fs=require('fs');const path=require('path');const XLSX=require('xlsx');
const BASE='G:/safety_vault/04_现场管理/27、HSE月度考核';
const MONTHS=['2025-08','2025-09','2025-10','2025-11','2025-12','2026-01','2026-02','2026-03','2026-04','2026-05','2026-06','2026-07'];
function pickFile(yd,md){
  const dir=path.join(BASE,`${yd}年`,md);if(!fs.existsSync(dir))return null;
  const files=fs.readdirSync(dir).filter(n=>!n.startsWith('~$')&&/\.(xlsx|xls)$/i.test(n));
  let a=files.filter(n=>/乡镇作业中心经理/.test(n));
  if(!a.length)a=files.filter(n=>/主管/.test(n));if(!a.length)return null;
  a.sort((x,y)=>(/（终）|终版|\(终\)/.test(x)?0:1)-(/（终）|终版|\(终\)/.test(y)?0:1));
  return path.join(dir,a[0]);
}
for(const m of MONTHS){
  const [yd,mdn]=m.split('-');const mm=`${Number(mdn)}月`;
  const f=pickFile(yd,mm);
  if(!f){console.log('\n===== '+m+' ===== NO FILE');continue;}
  const wb=XLSX.readFile(f);const rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,defval:''});
  let hdr=-1;
  for(let i=0;i<Math.min(rows.length,10);i++){const r=rows[i]||[];if(r.some(c=>String(c).trim()==='姓名')){hdr=i;break;}}
  console.log('\n===== '+m+' ('+f.split('/').slice(-2).join('/')+') ===== 表头R'+hdr);
  if(hdr<0)continue;
  const r=rows[hdr]||[];
  r.forEach((c,i)=>{ if(String(c||'').trim()!=='') console.log(`  [${i}] ${String(c).trim().replace(/\n/g,'\\n').slice(0,40)}`); });
  // 前2个数据行
  for(let j=hdr+1;j<Math.min(rows.length,hdr+3);j++){
    const rr=rows[j]||[];
    const hasName=rr.some(c=>String(c||'').trim()==='姓名');
    if(!hasName&&rr.some(c=>String(c||'').trim()!=='')) console.log('  数据:'+JSON.stringify(rr.slice(0,20)));
  }
}