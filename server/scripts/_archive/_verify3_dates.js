/* 精确核查李先菊8月台账：是否存在、按北京日期分组、对比李忠胜 */
const { testConnection, pool } = require('../config/db');
(async () => {
  await testConnection();
  // 是否 5377
  const g = await pool.query(`SELECT id, inspection_date FROM grid_inspection_records WHERE id=5377`);
  console.log('id=5377:', g.rows.length ? g.rows[0].inspection_date.toISOString() : '不存在');

  // 李先菊8月按北京日期（UTC+8）分组
  const r = await pool.query(
    `SELECT (inspection_date AT TIME ZONE 'Asia/Shanghai')::date AS bj_date, count(*)::int AS c,
            string_agg(id::text, ',' ORDER BY id) AS ids
     FROM grid_inspection_records WHERE personnel_name='李先菊'
       AND inspection_date >= make_date(2026,8,1) AND inspection_date < make_date(2026,9,1)
     GROUP BY 1 ORDER BY 1`
  );
  console.log('=== 李先菊8月 按北京日期 ===');
  r.rows.forEach((x) => console.log(`${x.bj_date}: ${x.c} (${x.ids})`));

  // 李忠胜对照
  const r2 = await pool.query(
    `SELECT (inspection_date AT TIME ZONE 'Asia/Shanghai')::date AS bj_date, count(*)::int AS c
     FROM grid_inspection_records WHERE personnel_name='李忠胜'
       AND inspection_date >= make_date(2026,8,1) AND inspection_date < make_date(2026,9,1)
     GROUP BY 1 ORDER BY 1`
  );
  console.log('=== 李忠胜8月 按北京日期 ===');
  r2.rows.forEach((x) => console.log(`${x.bj_date}: ${x.c}`));
  await pool.end();
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
