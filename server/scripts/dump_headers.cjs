const XLSX = require('xlsx');
const path = require('path');
const DIR = 'G:/safety_vault/08_保险及人员管理/花名册';
const targets = ['2024.10.8.xlsx','2025.1.2.xlsx','2025.3.4.xlsx','2025.10.9.xlsx','20260721090748.xlsx'];
for (const f of targets) {
  const wb = XLSX.readFile(path.join(DIR, f));
  console.log(`\n===== ${f}  sheets=${wb.SheetNames.join(',')} =====`);
  for (const sn of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { defval:'', header:1 });
    const hdrRow = rows.find(r => r.some(c => /姓名/.test(String(c??'').trim())));
    if (!hdrRow) { console.log(`  [${sn}] 无姓名列`); continue; }
    console.log(`  [${sn}] rows=${rows.length} hdr=${hdrRow.map(c=>String(c??'').trim()).join('|')}`);
  }
}