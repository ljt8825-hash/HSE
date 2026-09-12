const { Pool } = require('pg');
const p = new Pool({
  host: '127.0.0.1', port: 5432, user: 'hse_app',
  password: 't3OvksuXH3Sqhs9xtPZTQGXtorcKMyBM', database: 'safety_dashboard',
});
(async () => {
  const r0 = await p.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='hse_grid_inspection_records' ORDER BY ordinal_position");
  console.log('grid records cols:', r0.rows.map(x => x.column_name).join(', '));

  const r1 = await p.query("SELECT * FROM hse_grid_inspection_records WHERE inspector_name LIKE '%张忠华%' AND inspection_date >= '2026-08-01' AND inspection_date < '2026-09-01' LIMIT 3");
  console.log('张忠华 Aug sample:', JSON.stringify(r1.rows, null, 1));

  const r2 = await p.query("SELECT COUNT(*) AS n FROM hse_grid_inspection_records WHERE inspection_date >= '2026-08-01' AND inspection_date < '2026-09-01' AND is_deleted=FALSE");
  console.log('Aug ledger total:', JSON.stringify(r2.rows));

  await p.end();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
