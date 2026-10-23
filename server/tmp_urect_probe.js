const { pool } = require('./config/db');
function regionBase(s) {
  const v = String(s || '').replace(/乡镇/g, '').trim();
  if (!v) return '';
  if (v.endsWith('片区')) return v.slice(0, -2);
  if (v.endsWith('作业中心')) return v.slice(0, -4);
  if (v.endsWith('中心')) return v.slice(0, -2);
  return v;
}
(async () => {
  try {
    const rd = await pool.query(
      `SELECT area_team, COUNT(*)::int AS cnt,
              array_agg(DISTINCT violator_name) AS names
         FROM grid_inspection_records
        WHERE to_char(inspection_date, 'YYYY-MM') = '2026-09'
          AND trim(violation_behavior) <> '无三违行为'
          AND (rectified_photo IS NULL OR trim(rectified_photo) = '' OR trim(rectified_photo) IN ('--','-','无'))
        GROUP BY area_team ORDER BY area_team`,
    );
    console.log('==== 2026-09 未按时整改 按 area_team 分组 ====');
    let hitTown = 0, miss = 0;
    for (const r of rd.rows) {
      const base = regionBase(r.area_team);
      const isTown = base.match(/镇$|乡$|街道$/);
      if (isTown) hitTown++; else miss++;
      console.log(`area_team="${r.area_team}" | regionBase="${base}" | n=${r.cnt} | [${r.names.join(', ')}]`);
    }
    console.log(`\nregionBase 落成"镇/乡/街道" 的组=${hitTown}，未落成town的组=${miss} ← 这些组现有 rectifiedByTown 会 key 成非town，lookup townBase 会 MISS`);
  } catch (e) { console.error('ERR', e.message); } finally { await pool.end(); }
})();