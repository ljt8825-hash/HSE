const fs=require('fs');const XLSX=require('xlsx');
const FILE='G:/safety_vault/04_现场管理/27、HSE月度考核/2025年/12月/12月乡镇作业中心经理月度考核结果(2).xlsx';
const wb=XLSX.readFile(FILE);
const sn=wb.SheetNames[0];
const rows=XLSX.utils.sheet_to_json(wb.Sheets[sn],{header:1,defval:''});
for(let i=0;i<Math.min(rows.length,16);i++){
  const r=rows[i];
  // 只打印前 14 列，展示类别结构
  console.log(`R${i}:`, JSON.stringify(r.slice(0,16)));
}