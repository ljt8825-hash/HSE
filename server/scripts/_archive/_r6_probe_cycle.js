const { Pool } = require('pg');
const p = new Pool({
  host: '127.0.0.1', port: 5432, user: 'hse_app',
  password: 't3OvksuXH3Sqhs9xtPZTQGXtorcKMyBM', database: 'safety_dashboard',
});
(async () => {
  const r1 = await p.query("SELECT id, cycle_code, cycle_name, status, frozen_count, target_count, scored_count, reviewed_count FROM hse_assessment_cycle ORDER BY id");
  console.log('cycles:', JSON.stringify(r1.rows, null, 1));

  const r2 = await p.query("SELECT column_name FROM information_schema.columns WHERE table_name='hse_assessment_cycle' AND column_name LIKE '%frozen%'");
  console.log('cycle frozen cols:', JSON.stringify(r2.rows));

  await p.end();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
