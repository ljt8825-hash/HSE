const { pool } = require('../config/db');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
(async () => {
  const r = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='driver_monthly' ORDER BY ordinal_position");
  console.log('driver_monthly cols:', r.rows.map((x) => x.column_name).join(', '));
  const c = await pool.query("SELECT COUNT(*)::int AS c FROM driver_monthly WHERE month='2025-10'");
  console.log('2025-10 rows:', c.rows[0].c);
  const m = await pool.query('SELECT DISTINCT month FROM driver_monthly ORDER BY month');
  console.log('months:', m.rows.map((x) => x.month).join(', '));

  // 检查 10月 文件 sheet
  const f = 'G:/safety_vault/04_现场管理/27、HSE月度考核/2025年/10月/10月乡镇作业中心经理月度考核.xlsx';
  const wb = XLSX.readFile(f);
  console.log('\n10月 sheets:', wb.SheetNames);
  const sn = wb.SheetNames.find((n) => /\u5b89\u5168\u751f\u4ea7\u68c0\u67e5\u8868/.test(n));
  console.log('月度安全生产检查表 sheet:', sn);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '' });
  console.log('总行数:', rows.length);
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    console.log('R' + i + ':', JSON.stringify((rows[i] || []).slice(0, 14)));
  }
  pool.end();
})();