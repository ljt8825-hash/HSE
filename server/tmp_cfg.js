require('dotenv').config({ path: './.env' });
const { pool } = require('./config/db');
(async () => {
  const c = (await pool.query(
    `SELECT id,assessment_year,assessment_month FROM hse_assessment_cycle WHERE is_deleted=FALSE ORDER BY assessment_year DESC,assessment_month DESC LIMIT 1`,
  )).rows[0];
  console.log('cycle', c.id);
  const cols = (await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name='hse_sanwei_ledger_config' ORDER BY ordinal_position`,
  )).rows.map((r) => r.column_name);
  console.log('ledger_config cols:', cols.join(', '));
  const t = (await pool.query(
    `SELECT id,employee_name,township FROM hse_assessment_target WHERE cycle_id=$1 AND position=$2 AND is_deleted=FALSE ORDER BY township,employee_name`,
    [c.id, '管理员'],
  )).rows;
  const idName = new Map(t.map((x) => [String(x.id), `${x.employee_name}(${x.township})`]));
  const r = (await pool.query(
    `SELECT * FROM hse_sanwei_ledger_config WHERE cycle_id=$1 AND position=$2`,
    [c.id, '管理员'],
  )).rows;
  console.log('ledger_config rows:', r.length);
  for (const x of r) {
    console.log('\n=== row ===');
    console.log(JSON.stringify(x, null, 2).slice(0, 3000));
  }
  await pool.end();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });