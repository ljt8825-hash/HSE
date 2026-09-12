const { Pool } = require('pg');
const p = new Pool({
  host: '127.0.0.1', port: 5432, user: 'hse_app',
  password: 't3OvksuXH3Sqhs9xtPZTQGXtorcKMyBM', database: 'safety_dashboard',
});
(async () => {
  const c1 = await p.query("SELECT column_name FROM information_schema.columns WHERE table_name='users' ORDER BY ordinal_position");
  console.log('USERS COLS:', c1.rows.map((x) => x.column_name).join(','));
  const r = await p.query("SELECT * FROM users LIMIT 5");
  console.log('users sample:', JSON.stringify(r.rows, null, 1));
  await p.end();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
