const { pool, testConnection } = require('../config/db');
async function q(sql, ...a) { const r = await pool.query(sql, a); return r.rows; }
(async () => {
  await testConnection();
  // 1) 培训台账表结构与 5 月数据
  console.log('===== hse_training_ledger_monthly 结构 =====');
  const cols = await q(`SELECT column_name||'('||data_type||')' c FROM information_schema.columns WHERE table_name='hse_training_ledger_monthly' ORDER BY ordinal_position`);
  console.log(' ' + cols.map((x) => x.c).join(', '));

  console.log('\n===== 该表 5 月(month) 记录概览 =====');
  const r1 = await q(`SELECT month, COUNT(*)::int n, COUNT(*) FILTER (WHERE month ILIKE '2026-05%') AS may
    FROM hse_training_ledger_monthly GROUP BY month ORDER BY month DESC LIMIT 12`);
  for (const x of r1) console.log('  month=' + x.month + ' n=' + x.n);

  console.log('\n===== 5月(2026-05)记录明细（含标注缺训的行）=====');
  const may = await q(`SELECT * FROM hse_training_ledger_monthly WHERE month ILIKE '2026-05%' ORDER BY id`);
  console.log('5月行数:', may.length);
  for (const r of may) {
    const keys = Object.keys(r).filter((k) => !['created_at','updated_at','is_deleted'].includes(k));
    console.log('  id=' + r.id + ' ' + keys.map((k) => (r[k]==null?'':`${k}=${JSON.stringify(r[k])}`)).filter(s=>s.includes('=')&&!s.endsWith('=')).join(' | '));
  }

  // 2) 违规记录5月管理员
  console.log('\n===== violation_records 5月记录（管理员相关）=====');
  const cols2 = await q(`SELECT column_name FROM information_schema.columns WHERE table_name='violation_records' ORDER BY ordinal_position`);
  console.log(' 列:', cols2.map((x) => x.column_name).join(', '));
  const viol = await q(`SELECT * FROM violation_records WHERE violation_date::text LIKE '2026-05%' ORDER BY id`);
  console.log('5月违规记录:', viol.length, '条');
  for (const v of viol) {
    console.log('  id=' + v.id + ' name=' + (v.employee_name||v.violator_name||v.person_name||'-') + ' date=' + v.violation_date + ' role=' + (v.involved_person_role||v.position||'-') + ' level=' + (v.violation_level||'-'));
  }
  process.exit(0);
})().catch((e) => { console.log('DB ERR', e.message); process.exit(1); });