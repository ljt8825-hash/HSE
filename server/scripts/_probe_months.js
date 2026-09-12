const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const BASE = 'G:/safety_vault/04_现场管理/27、HSE月度考核';
(async () => {
  if (!fs.existsSync(BASE)) { console.log('目录不存在:', BASE); process.exit(0); }
  const years = fs.readdirSync(BASE).filter((n) => /^\d{4}年$/.test(n)).sort((a,b)=>a.localeCompare(b));
  for (const y of years) {
    const year = Number(y.replace('年',''));
    if (year < 2025) continue;
    const ydir = path.join(BASE, y);
    if (!fs.existsSync(ydir)) continue;
    const months = fs.readdirSync(ydir).filter((n) => /^\d{1,2}月$/.test(n)).sort((a,b)=>Number(a)-Number(b));
    for (const m of months) {
      const mm = Number(m.replace('月',''));
      // 关注 2025-08 ~ 2026-07
      if (year===2025 && mm<8) continue;
      if (year===2026 && mm>7) continue;
      const mdir = path.join(ydir, m);
      let files;
      try { files = fs.readdirSync(mdir).filter((f) => /\.xlsx$/i.test(f)); } catch { continue; }
      const adminFile = files.find((f) => f.includes('管理员'));
      console.log('\n=== ' + year + '-' + String(mm).padStart(2,'0') + ' (' + m + ') 共' + files.length + '个xlsx ===');
      if (!adminFile) { console.log('  未找到含「管理员」的Excel，文件列表:', files.join(', ')); continue; }
      console.log('  使用文件:', adminFile);
      let wb;
      try { wb = XLSX.readFile(path.join(mdir, adminFile)); } catch (e) { console.log('  读取失败:', e.message); continue; }
      console.log('  sheets:', wb.SheetNames.join(', '));
    }
  }
  process.exit(0);
})().catch((e) => { console.log('ERR', e.message); process.exit(1); });