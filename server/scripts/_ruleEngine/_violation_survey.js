// 只读调研：violation_records 字段分布 + VIOLATION001/002 口径候选（不写库）
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const { pool, testConnection, isConnected } = require('../../config/db');

const q = async (sql, params = []) => {
  const r = await pool.query(sql, params);
  return r.rows;
};

(async () => {
  await testConnection();
  if (!isConnected()) { console.error('DB 未连接'); process.exit(1); }

  const alive = (await q(`SELECT COUNT(*)::int n FROM violation_records WHERE is_deleted=FALSE`))[0].n;
  console.log('ALIVE_TOTAL:', alive);

  const statusDist = await q(`SELECT status, COUNT(*)::int c FROM violation_records WHERE is_deleted=FALSE GROUP BY status`);
  console.log('STATUS_DIST:', JSON.stringify(statusDist));

  const empties = await q(`
    SELECT
      COUNT(*) FILTER (WHERE violation_type IS NULL OR violation_type='') AS violation_type_empty,
      COUNT(*) FILTER (WHERE check_source IS NULL OR check_source='')   AS check_source_empty,
      COUNT(*) FILTER (WHERE description IS NULL OR description='')      AS description_empty,
      COUNT(*) FILTER (WHERE violator_name IS NULL OR violator_name='') AS violator_name_empty
    FROM violation_records WHERE is_deleted=FALSE`);
  console.log('EMPTY_COUNTS:', JSON.stringify(empties[0]));

  const needDist = await q(`SELECT need_rectification, COUNT(*)::int c FROM violation_records WHERE is_deleted=FALSE GROUP BY need_rectification ORDER BY c DESC`);
  console.log('NEED_RECTIFICATION_DIST:', JSON.stringify(needDist));

  const v002 = await q(`
    SELECT COUNT(*)::int c FROM violation_records
     WHERE is_deleted=FALSE AND need_rectification='是'
       AND (rectification IS NULL OR rectification='' OR rectification_time IS NULL)`);
  console.log('V002_CANDIDATE(need_rectif=是 AND 未整改完):', v002[0].c);

  const reportEmpty = await q(`SELECT COUNT(*)::int c FROM violation_records WHERE is_deleted=FALSE AND (report_status IS NULL OR report_status='')`);
  console.log('REPORT_STATUS_EMPTY:', reportEmpty[0].c);

  process.exit(0);
})().catch((e) => { console.error('SURVEY ERROR', e && e.stack || e); process.exit(2); });
