const { pool } = require('../config/db');
(async () => {
  const r = await pool.query(
    `SELECT tgname, pg_get_triggerdef(t.oid) AS def
     FROM pg_trigger t
     WHERE tgrelid='hse_deduction_adjustment'::regclass AND NOT tgisinternal`
  );
  console.log(JSON.stringify(r.rows, null, 2));
  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
