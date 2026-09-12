const { Pool } = require('pg');
const p = new Pool({
  host: '127.0.0.1', port: 5432, user: 'hse_app',
  password: 't3OvksuXH3Sqhs9xtPZTQGXtorcKMyBM', database: 'safety_dashboard',
});
(async () => {
  const r0 = await p.query("SELECT table_name FROM information_schema.tables WHERE table_name LIKE '%grid%' OR table_name LIKE '%inspection%' ORDER BY table_name");
  console.log('grid/inspection tables:', JSON.stringify(r0.rows));

  const r1 = await p.query("SELECT COUNT(*)::int AS c FROM grid_inspection_records WHERE inspection_date >= '2026-08-01' AND inspection_date < '2026-09-01'");
  console.log('grid_inspection_records Aug total:', JSON.stringify(r1.rows));

  const r2 = await p.query("SELECT column_name FROM information_schema.columns WHERE table_name='grid_inspection_records' ORDER BY ordinal_position");
  console.log('grid_inspection_records cols:', r2.rows.map(x => x.column_name).join(', '));

  const r3 = await p.query("SELECT * FROM grid_inspection_records WHERE inspection_date >= '2026-08-01' AND inspection_date < '2026-09-01' LIMIT 2");
  console.log('Aug sample:', JSON.stringify(r3.rows, null, 1));

  const r4 = await p.query("SELECT inspection_person, inspector_name, COUNT(*) AS n FROM grid_inspection_records WHERE inspection_date >= '2026-08-01' AND inspection_date < '2026-09-01' GROUP BY inspection_person, inspector_name ORDER BY n DESC LIMIT 15");
  console.log('Aug 每人次数:', JSON.stringify(r4.rows, null, 1));

  await p.end();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
