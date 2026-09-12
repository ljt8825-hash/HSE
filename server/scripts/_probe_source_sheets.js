const path = require('path');
const XLSX = require('xlsx');
const BASE = 'G:/safety_vault/04_现场管理/27、HSE月度考核';
const targets = [
  { y:2026, m:5, f:'5月管理员月度考核结果.xlsx' },
  { y:2025, m:8, f:'8月管理员考核结果.xlsx' },
  { y:2026, m:2, f:'2月管理员月度考核结果(1).xlsx' },
  { y:2026, m:7, f:'7月管理员月度考核结果.xlsx' },
];
function show(p, sheet) {
  const wb = XLSX.readFile(p);
  const ws = wb.Sheets[sheet];
  if (!ws) { console.log('  [无此sheet]'); return; }
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  const max = Math.min(8, data.length);
  for (let r = 0; r < max; r++) {
    const row = data[r] || [];
    const cells = row.slice(0, 14).map((v, i) => v==null?`[${i}∅]`:`[${i}${String(v).slice(0,12)}]`).join('');
    console.log('  R'+r+': '+cells);
  }
}
for (const t of targets) {
  const p = path.join(BASE, String(t.y)+'年', String(t.m)+'月', t.f);
  const wb = XLSX.readFile(p);
  console.log('\n########## '+t.y+'-'+String(t.m).padStart(2,'0')+' ['+t.f+'] sheets: '+wb.SheetNames.join(', ')+' ##########');
  for (const s of wb.SheetNames) {
    if (s === '管理员月度考核结果') continue;
    console.log('\n--- sheet「'+s+'」---');
    try { show(p, s); } catch (e) { console.log('  读取失败: '+e.message); }
  }
}
process.exit(0);