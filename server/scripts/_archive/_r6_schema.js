const { Pool } = require('pg');
const p = new Pool({
  host: '127.0.0.1', port: 5432, user: 'hse_app',
  password: 't3OvksuXH3Sqhs9xtPZTQGXtorcKMyBM', database: 'safety_dashboard',
});
(async () => {
  const c1 = await p.query("SELECT column_name FROM information_schema.columns WHERE table_name='hse_assessment_target' ORDER BY ordinal_position");
  console.log('TARGET COLS:', c1.rows.map((x) => x.column_name).join(','));
  const c2 = await p.query("SELECT column_name FROM information_schema.columns WHERE table_name='hse_assessment_deduction' ORDER BY ordinal_position");
  console.log('DEDUCTION COLS:', c2.rows.map((x) => x.column_name).join(','));
  await p.end();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
