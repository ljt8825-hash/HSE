/* 排查：李先菊8月台账现状 + 确认哪条被删（id 空洞/日期缺失）+ 找恢复依据 */
const { testConnection, pool } = require('../config/db');
(async () => {
  await testConnection();
  // 李先菊8月全部 id 列表
  const r = await pool.query(
    `SELECT id, personnel_name, grid_id, grid_level, area_team, inspection_date, created_at
     FROM grid_inspection_records WHERE personnel_name='李先菊'
       AND inspection_date >= make_date(2026,8,1) AND inspection_date < make_date(2026,9,1)
     ORDER BY id`
  );
  console.log(`李先菊8月台账 ${r.rows.length} 条：`);
  r.rows.forEach((x) => console.log(`${x.id} | ${x.inspection_date.toISOString()} | grid=${x.grid_id} | ${x.grid_level} | ${x.area_team} | created=${x.created_at && x.created_at.toISOString()}`));

  // 同网格(29)其他人员8月同日记录样例，用于重建
  const s = await pool.query(
    `SELECT id, personnel_name, grid_id, grid_level, area_team, inspection_date,
            work_content, inspection_content, issues_found, is_rectified, rectified_by, remark, created_at
     FROM grid_inspection_records WHERE grid_id=29 AND personnel_name <> '李先菊'
       AND inspection_date >= make_date(2026,8,1) AND inspection_date < make_date(2026,9,1)
     ORDER BY id LIMIT 5`
  );
  console.log('=== 同网格(29)他人台账样例 ===');
  s.rows.forEach((x) => console.log(JSON.stringify(x)));
  await pool.end();
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
