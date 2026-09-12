const XLSX=require('xlsx');
const F=['G:/safety_vault/04_现场管理/27、HSE月度考核/2026年/7月/7月乡镇作业中心经理月度考核结果.xlsx',
         'G:/safety_vault/04_现场管理/27、HSE月度考核/2026年/7月/7月乡镇作业中心经理月度考核结果(终).xlsx'];
for(const f of F){
  const wb=XLSX.readFile(f);
  const rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,defval:''});
  console.log('\n======== '+f.split('/').slice(-1)[0]+' | sheet='+wb.SheetNames[0]+' | 行数='+rows.length+' ========');
  // 打印前 20 行的非空单元格（标注行号），聚焦头部与"考核总结"
  for(let i=0;i<Math.min(rows.length,22);i++){
    const r=rows[i]||[];
    const cells=r.map((c,ci)=>String(c).trim()!==''?`[${ci}]${String(c).trim().replace(/\n/g,'\\n')}`:null).filter(Boolean);
    if(cells.length) console.log('R'+i+': '+cells.join(' | '));
  }
  // 找到"考核总结"块
  console.log('--- 含"考核总结"的行 ---');
  for(let i=0;i<rows.length;i++){const r=rows[i]||[];if(r.some(c=>String(c).includes('考核总结'))) console.log('R'+i+': '+r.map((c,ci)=>String(c).trim()!==''?`[${ci}]${String(c).trim().replace(/\n/g,'\\n')}`:null).filter(Boolean).join(' | '));}
}