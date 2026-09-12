const { pool } = require('../config/db');
const XLSX = require('xlsx');
(async () => {
  const r = await pool.query(
    `SELECT name, department, three_check_management, lamp_dirty, lamp_failure, safety_monitor, fire_management
       FROM driver_monthly WHERE month='2025-11' AND is_deleted=false LIMIT 20`
  );
  console.log('driver_monthly 2025-11 样本（driver子项counts）:');
  for (const x of r.rows) console.log(' ', JSON.stringify(x));

  // 11月 三检表 sheet 结构
  const f = 'G:/safety_vault/04_现场管理/27、HSE月度考核/2025年/11月/11月乡镇作业中心经理月度考核结果.xlsx';
  const wb = XLSX.readFile(f);
  const sn = wb.SheetNames.find((n) => /三检/.test(n));
  console.log('\n11月 三检表 sheet:', sn);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '' });
  for (let i = 0; i < Math.min(rows.length, 10); i++) console.log('R' + i + ':', JSON.stringify((rows[i] || []).slice(0, 10)));
  pool.end();
})();