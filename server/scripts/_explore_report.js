const path=require('path');const XLSX=require('xlsx');
const BASE='G:/safety_vault/04_现场管理/27、HSE月度考核';
function cs(v){return String(v==null?'':v).trim();}
function dump(f,label){
  console.log(`\n===== ${label} : ${f} =====`);
  const wb=XLSX.readFile(f);
  console.log('sheets: '+wb.SheetNames.join(' | '));
  const sn=wb.SheetNames[0];
  const data=XLSX.utils.sheet_to_json(wb.Sheets[sn],{header:1,defval:''});
  console.log(`sheet1 rows=${data.length}`);
  for(let i=0;i<Math.min(data.length,6);i++)console.log(`R${i}: `+JSON.stringify((data[i]||[]).slice(0,20)));
  // 找含 得分/成绩/结果/姓名 的列
  console.log('-- 表头关键字定位 --');
  for(let i=0;i<Math.min(data.length,8);i++){const r=data[i]||[];r.forEach((v,c)=>{const s=cs(v);if(/得分|成绩|结果|姓名|职务|被考核|考核分|总分/.test(s))console.log(`  R${i} col${c} = ${s.slice(0,24)}`);});}
}
dump(path.join(BASE,'2026年','6月','6月管理员月度考核结果.xlsx'),'管理员');
dump(path.join(BASE,'2026年','6月','6月乡镇作业中心经理月度考核结果.xlsx'),'乡镇经理');