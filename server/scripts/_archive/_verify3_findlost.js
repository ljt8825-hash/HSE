/* 精确定位：执行与脚本完全相同的 s2 查询 + 检查 audit 是否记录 + 找序列号规律 */
const { testConnection, pool } = require('../config/db');
(async () => {
  await testConnection();
  // 与脚本完全一致的查询
  const s2 = await pool.query(
    `SELECT id FROM grid_inspection_records WHERE personnel_name='李先菊' AND inspection_date >= make_date(2026,8,1)
     ORDER BY id LIMIT 1`
  );
  console.log('s2 查询结果（最小id）:', JSON.stringify(s2.rows[0] || null));

  // 李先菊8月条数
  const cnt = await pool.query(
    `SELECT count(*)::int AS c FROM grid_inspection_records WHERE personnel_name='李先菊'
       AND inspection_date >= make_date(2026,8,1) AND inspection_date < make_date(2026,9,1)`
  );
  console.log('李先菊8月条数:', cnt.rows[0].c);

  // 李先菊 id 序列连续性（看是否有空洞——即被删记录留下的 gap）
  const ids = await pool.query(
    `SELECT id FROM grid_inspection_records WHERE personnel_name='李先菊'
       AND inspection_date >= make_date(2026,8,1) AND inspection_date < make_date(2026,9,1)
     ORDER BY id`
  );
  console.log('id 列表:', ids.rows.map((x) => x.id).join(','));

  // serial_no 是否唯一连续（导入批次的标识）
  const ser = await pool.query(
    `SELECT serial_no, count(*)::int AS c FROM grid_inspection_records WHERE personnel_name='李先菊'
       AND inspection_date >= make_date(2026,8,1) AND inspection_date < make_date(2026,9,1)
     GROUP BY 1 ORDER BY serial_no`
  );
  console.log('=== serial_no ===');
  ser.rows.forEach((x) => console.log(x.serial_no, x.c));

  // 该批次（backfill_run）里李先菊应有记录数 —— 查 uploads 文件目录对照
  const img = await pool.query(
    `SELECT DISTINCT image_content FROM grid_inspection_records WHERE personnel_name='李先菊'
       AND inspection_date >= make_date(2026,8,1) AND inspection_date < make_date(2026,9,1)`
  );
  console.log('=== image_content 路径（看批次）===');
  img.rows.forEach((x) => console.log(x.image_content));
  await pool.end();
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
