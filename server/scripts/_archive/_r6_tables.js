const { Pool } = require('pg');
const p = new Pool({
  host: '127.0.0.1', port: 5432, user: 'hse_app',
  password: 't3OvksuXH3Sqhs9xtPZTQGXtorcKMyBM', database: 'safety_dashboard',
});
(async () => {
  const r = await p.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public' " +
    "AND (table_name LIKE '%deduction%' OR table_name LIKE '%assessment%' OR table_name LIKE '%target%' OR table_name LIKE '%cycle%') ORDER BY table_name"
  );
  console.log('TABLES:\n' + r.rows.map((x) => x.table_name).join('\n'));
  await p.end();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
