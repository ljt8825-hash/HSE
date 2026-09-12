const { pool } = require('../config/db');
async function main() {
  const rules = await pool.query(
    `SELECT rule_code, rule_name, category, adapter_key, deduct_score, trigger_type, status
       FROM hse_assessment_rule
      WHERE rule_code IN ('TRAINING001','DRIVER001','TRANSFER001')`
  );
  console.log('=== 接线后的规则 ===');
  for (const r of rules.rows) console.log(`[${r.rule_code}] ${r.rule_name} | cat=${r.category} | adapter=${r.adapter_key} | score=${r.deduct_score} | ${r.trigger_type}/${r.status}`);

  console.log('\n=== 考核周期 ===');
  const cyc = await pool.query(
    `SELECT id, assessment_year, assessment_month, start_time, status
       FROM hse_assessment_cycle ORDER BY id DESC LIMIT 8`
  );
  for (const c of cyc.rows) console.log(`#${c.id} ${c.assessment_year}-${String(c.assessment_month).padStart(2, '0')} start=${c.start_time} status=${c.status}`);

  console.log('\n=== 数据源每月记录数 ===');
  const t = await pool.query(`SELECT month, COUNT(*)::int c FROM hse_training_ledger_monthly GROUP BY month ORDER BY month`);
  console.log('train ledger:', t.rows.map((r) => `${r.month}:${r.c}`).join(' | ') || '(空)');
  const d = await pool.query(`SELECT month, COUNT(*)::int c FROM driver_monthly WHERE is_deleted=FALSE GROUP BY month ORDER BY month`);
  console.log('driver:', d.rows.map((r) => `${r.month}:${r.c}`).join(' | ') || '(空)');
  const tr = await pool.query(
    `SELECT SUBSTRING(check_date,1,7) AS m, COUNT(*)::int c FROM transfer_station_check WHERE is_deleted=FALSE GROUP BY 1 ORDER BY 1`
  );
  console.log('transfer:', tr.rows.map((r) => `${r.m}:${r.c}`).join(' | ') || '(空)');
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });