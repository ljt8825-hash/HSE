const { pool, testConnection } = require('../config/db');
async function q(sql, ...a) { const r = await pool.query(sql, a); return r.rows; }
(async () => {
  await testConnection();
  console.log('===== 考核周期 =====');
  const cycles = await q(`SELECT id, cycle_name, status FROM hse_assessment_cycle ORDER BY id`);
  for (const c of cycles) console.log('  id=' + c.id + ' ' + c.cycle_name + ' [' + c.status + ']');

  console.log('\n===== hse_assessment_deduction 结构 =====');
  const cols = await q(`SELECT column_name||':'||data_type c FROM information_schema.columns WHERE table_name='hse_assessment_deduction' ORDER BY ordinal_position`);
  console.log(' ' + cols.map((x) => x.c).join(', '));

  console.log('\n===== hse_assessment_target 结构 =====');
  const tcols = await q(`SELECT column_name FROM information_schema.columns WHERE table_name='hse_assessment_target' ORDER BY ordinal_position`);
  console.log(' ' + tcols.map((x) => x.column_name).join(', '));

  // 找2026年5月考核周期
  const mayCycle = cycles.find((c) => /2026.{0,2}5月|2026-05/.test(c.cycle_name)) || cycles.find((c) => String(c.cycle_name).includes('5月') && String(c.cycle_name).includes('2026'));
  console.log('\n===== 2026年5月周期 =====', JSON.stringify(mayCycle));

  process.exit(0);
})().catch((e) => { console.log('DB ERR', e.message); process.exit(1); });