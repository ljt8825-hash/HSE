/* 排查残留：2026-08-15 台账 + 李先菊台账现状 */
const { testConnection, pool } = require('../config/db');
(async () => {
  await testConnection();
  const r1 = await pool.query(
    `SELECT id, personnel_name, grid_id, grid_level, area_team, inspection_date, created_at
     FROM grid_inspection_records
     WHERE inspection_date = '2026-08-15' AND personnel_name IN ('李忠胜','李先菊')
     ORDER BY id`
  );
  console.log('=== 2026-08-15 李忠胜/李先菊 台账 ===');
  r1.rows.forEach((x) => console.log(JSON.stringify(x)));

  // 李先菊8月台账总数与日期分布
  const r2 = await pool.query(
    `SELECT inspection_date, count(*)::int AS c
     FROM grid_inspection_records WHERE personnel_name='李先菊'
       AND inspection_date >= make_date(2026,8,1) AND inspection_date < make_date(2026,9,1)
     GROUP BY 1 ORDER BY 1`
  );
  console.log('=== 李先菊 8月台账日期分布 ===');
  r2.rows.forEach((x) => console.log(`${x.inspection_date}: ${x.c}`));

  // 李忠胜8月台账日期分布
  const r3 = await pool.query(
    `SELECT inspection_date, count(*)::int AS c
     FROM grid_inspection_records WHERE personnel_name='李忠胜'
       AND inspection_date >= make_date(2026,8,1) AND inspection_date < make_date(2026,9,1)
     GROUP BY 1 ORDER BY 1`
  );
  console.log('=== 李忠胜 8月台账日期分布 ===');
  r3.rows.forEach((x) => console.log(`${x.inspection_date}: ${x.c}`));
  await pool.end();
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
