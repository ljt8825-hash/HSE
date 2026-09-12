const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const BASE = process.env.SAFETY_CULTURE_SOURCE_DIR || 'F:/宁津北控/27、HSE月度考核';
const { pool, testConnection } = require('../config/db');

async function main() {
  await testConnection();
  // Excel 2025-11 manual c13
  const dir = path.join(BASE, '2025年', '11月');
  const fn = fs.readdirSync(dir).filter((n) => n.includes('乡镇作业中心经理') && !n.startsWith('~$'))[0];
  const wb = XLSX.readFile(path.join(dir, fn));
  const sheet = (wb.SheetNames || []).find((n) => n.includes('专项活动台'));
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, defval: '', raw: true });
  console.log('== 2025-11 扣分列(c13) ==');
  for (let i = 3; i < rows.length; i++) {
    const name = String(rows[i][3] || '').trim();
    const manual = String(rows[i][13] || '').trim();
    const leaves = [rows[i][10], rows[i][11], rows[i][12]].map((v) => String(v || '').trim());
    if (name) console.log(`  ${name}: 扣分=${manual} | 转运站横幅=${leaves[0]} 转发通知群警示教育视频=${leaves[1]} 消防演练=${leaves[2]}`);
  }
  // DB
  const db = await pool.query(
    `SELECT dept, name, manual_deduct, has_manual_col, activities FROM hse_safety_culture_monthly
      WHERE month='2025-11' AND is_deleted=FALSE ORDER BY dept`
  );
  console.log('\n== DB 2025-11 ==');
  for (const r of db.rows) console.log(`  ${r.dept} ${r.name}: manual=${r.manual_deduct} hasManual=${r.has_manual_col} acts=${JSON.stringify(r.activities)}`);
  await pool.end();
}
main().catch((e) => { console.error(e.message); process.exit(1); });