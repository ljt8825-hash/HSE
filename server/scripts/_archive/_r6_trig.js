const { pool } = require('../config/db');
(async () => {
  const t = await pool.query(`
    SELECT tg.tgname, tg.tgenabled, p.proname
    FROM pg_trigger tg
    JOIN pg_proc p ON p.oid = tg.tgfoid
    WHERE tg.tgrelid = 'hse_deduction_adjustment'::regclass
  `);
  console.log('调整表触发器:', JSON.stringify(t.rows));
  const f = await pool.query(`
    SELECT prosrc FROM pg_proc WHERE proname='prevent_adjustment_modify'
  `);
  console.log('触发器函数源码:', f.rows.length ? f.rows[0].prosrc : '无');
  await pool.end();
})().catch(e => { console.error(e.message); process.exit(1); });
