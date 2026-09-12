const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const BASE = process.env.SAFETY_CULTURE_SOURCE_DIR || 'F:/宁津北控/27、HSE月度考核';

const META = /^(序号|编号|所属乡镇|乡镇|单位|区域|班组|岗位|职务|姓名|扣分|实际扣分|备注|总成绩|总扣分|得分|评价|意见|签字)$/;
const norm = (s) => String(s == null ? '' : s).replace(/[\s　]+/g, '').replace(/["“”‘’`'，,。；;:：]/g, '').replace(/[（）()【】[\]{}]/g, '');
const isTick = (v) => { const s = String(v == null ? '' : v).trim(); return s === '√' || s === '✓' || s === '是' || s === 'Y' || s === 'y' || s === '1'; };

function scan(dir) {
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter((n) => !n.startsWith('~$') && /\.(xlsx|xls)$/i.test(n) && n.includes('乡镇作业中心经理'));
  const out = [];
  for (const fn of files) {
    const wb = XLSX.readFile(path.join(dir, fn));
    const sheetName = (wb.SheetNames || []).find((n) => n.includes('专项活动台'));
    if (!sheetName) continue;
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '', raw: true });
    let headIdx = -1;
    for (let i = 0; i < rows.length; i++) if (rows[i].join(',').includes('姓名')) { headIdx = i; break; }
    if (headIdx < 0) continue;
    const subRow = rows[headIdx + 1] || [];
    // 副表头行叶子候选：非数据行（姓名列为空）且在活动列位置有非空非勾选非元数据值
    const nameCol = rows[headIdx].findIndex((h) => norm(h).includes('姓名'));
    if (nameCol >= 0 && String(subRow[nameCol] || '').trim()) continue; // 数据行, 无副表头
    const leaves = [];
    subRow.forEach((h, c) => {
      const v = String(h || '').trim();
      if (!v || isTick(v)) return;
      const k = norm(v);
      if (k && !META.test(k)) leaves.push(`${v}@c${c}`);
    });
    if (leaves.length) out.push({ file: fn, sheet: sheetName, headIdx, leaves });
  }
  return out;
}

const years = [2025, 2026];
for (const y of years) {
  const yDir = path.join(BASE, `${y}年`);
  if (!fs.existsSync(yDir)) continue;
  const months = fs.readdirSync(yDir).filter((n) => { try { return fs.statSync(path.join(yDir, n)).isDirectory(); } catch { return false; } }).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  for (const m of months) {
    const hits = scan(path.join(yDir, m));
    if (hits.length) {
      console.log(`\n${y}年${m}月 → 有副表头(likely分组):`);
      for (const h of hits) console.log('  ', h.file, '| headIdx=' + h.headIdx, '| leaves:', h.leaves.join(', '));
    } else {
      console.log(`${y}年${m}月 → 无分组（或目录缺失/无文件）`);
    }
  }
}