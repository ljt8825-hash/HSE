const { pool } = require('../config/db');
(async () => {
  console.log('=== category_limit 是否含软删/外键 ===');
  const cols = await pool.query(
    `SELECT column_name, data_type FROM information_schema.columns
      WHERE table_name='hse_assessment_category_limit' ORDER BY ordinal_position`);
  console.log(cols.rows.map((c) => `${c.column_name}:${c.data_type}`).join(', '));
  const fks = await pool.query(
    `SELECT conrelid::regclass AS tbl, conname, pg_get_constraintdef(oid) AS def
       FROM pg_constraint WHERE contype='f' AND conrelid='hse_assessment_category_limit'::regclass`);
  if (!fks.rows.length) console.log('(无外键指向 category_limit)');
  fks.rows.forEach((f) => console.log(f.def));

  console.log('\n=== rule 表 FIRE001 ===');
  const r = await pool.query(
    `SELECT id, rule_code, rule_name, category, adapter_key, status, is_deleted
       FROM hse_assessment_rule WHERE rule_code='FIRE001'`);
  r.rows.forEach((x) => console.log(JSON.stringify(x)));
  const rcols = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name='hse_assessment_rule' AND column_name IN ('is_deleted','status')`);
  console.log('rule 可软删字段:', rcols.rows.map((c) => c.column_name).join(','));

  console.log('\n=== 类别 消防管理 关联检查 ===');
  const lim = await pool.query(
    `SELECT * FROM hse_assessment_category_limit WHERE category='现场管理-消防管理'`);
  lim.rows.forEach((x) => console.log(JSON.stringify(x)));

  console.log('\n=== 历史扣分引用消防(全周期, 含已删) ===');
  const d = await pool.query(
    `SELECT cycle_id, COUNT(*)::int c, SUM(suggested_score)::numeric s
       FROM hse_assessment_deduction
      WHERE metric_code='HSE-KPI-FIRE-001'
      GROUP BY cycle_id ORDER BY cycle_id`);
  if (!d.rows.length) console.log('(无任何扣分引用 HSE-KPI-FIRE-001)');
  d.rows.forEach((x) => console.log(`cycle=${x.cycle_id} c=${x.c} s=${x.s}`));
  await pool.end();
})().catch((e) => { console.error(e.message); process.exit(1); });