const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const BASE = process.env.SAFETY_CULTURE_SOURCE_DIR || 'F:/宁津北控/27、HSE月度考核';

function dump(dir, label) {
  if (!fs.existsSync(dir)) { console.log(label, '-> 目录不存在:', dir); return; }
  const files = fs.readdirSync(dir).filter((n) => !n.startsWith('~$') && /\.(xlsx|xls)$/i.test(n) && n.includes('乡镇作业中心经理'));
  if (!files.length) { console.log(label, '-> 无目标文件'); return; }
  const wb = XLSX.readFile(path.join(dir, files[0]));
  const sheetName = (wb.SheetNames || []).find((n) => n.includes('专项活动台'));
  console.log('\n====', label, '| file:', files[0], '| sheet:', sheetName);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '', raw: true });
  // 打印前 4 行 + 合并单元格信息
  for (let i = 0; i < Math.min(4, rows.length); i++) {
    console.log('row' + i + ':', JSON.stringify(rows[i].map((c) => String(c).trim())));
  }
  const merges = (wb.Sheets[sheetName]['!merges'] || []).filter((m) => m.s.r <= 2);
  console.log('merges(upto row2):', JSON.stringify(merges.map((m) => `r${m.s.r}-${m.e.r} c${m.s.c}-${m.e.c}`)));
}

dump(path.join(BASE, '2026年', '6月'), '2026-06');
dump(path.join(BASE, '2026年', '7月'), '2026-07');
dump(path.join(BASE, '2026年', '2月'), '2026-02');
dump(path.join(BASE, '2025年', '11月'), '2025-11');