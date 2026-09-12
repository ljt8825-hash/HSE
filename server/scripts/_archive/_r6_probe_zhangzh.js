const { Pool } = require('pg');
const p = new Pool({
  host: '127.0.0.1', port: 5432, user: 'hse_app',
  password: 't3OvksuXH3Sqhs9xtPZTQGXtorcKMyBM', database: 'safety_dashboard',
});
(async () => {
  // 张忠华 在 grid_areas 中的网格
  const r1 = await p.query("SELECT id, name, personnel_id, grid_level, patrol_frequency FROM grid_areas WHERE name LIKE '%张忠华%' OR personnel_id IN (SELECT id FROM employee WHERE name LIKE '%张忠华%')");
  console.log('张忠华 grids:', JSON.stringify(r1.rows, null, 1));

  // 张忠华 8月台账记录（构造补传用，避免去重冲突）
  const r2 = await p.query("SELECT id, area_team, upload_time, inspection_date, personnel_name, grid_level, position, violator_name, violation_behavior, serial_no FROM grid_inspection_records WHERE personnel_name LIKE '%张忠华%' AND inspection_date >= '2026-08-01' AND inspection_date < '2026-09-01' ORDER BY inspection_date LIMIT 10");
  console.log('张忠华 Aug ledger:', JSON.stringify(r2.rows, null, 1));
  console.log('张忠华 Aug count:', r2.rowCount);

  // 检查该网格下其他人员名（确认 grid_areas.name 与台账 personnel_name 匹配方式）
  const r3 = await p.query("SELECT id, name, grid_level, patrol_frequency FROM grid_areas WHERE is_deleted=FALSE AND name LIKE '%相衙%' OR name LIKE '%宁城%' LIMIT 8");
  console.log('sample grids:', JSON.stringify(r3.rows, null, 1));

  await p.end();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
