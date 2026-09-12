// 提示词-07 任务 C.2：在 cycle 24 真实运行一次 runCycleAutoDeductions(24)（幂等刷新观测文案）
// 预期 affected=0（网格 54 行/103.00/全 pending 不变；三违来源 0 行），VIOLATION003 文案刷新为「人次」。
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const { pool, testConnection, isConnected } = require('../../config/db');
const engine = require('../../services/ruleEngine/engine');

(async () => {
  await testConnection();
  if (!isConnected()) { console.error('DB 未连接'); process.exit(1); }
  engine.ensureAdaptersRegistered();

  // 运行前快照：VIOLATION003 / R000001 旧文案
  const before = await pool.query(
    `SELECT rule_code, last_run_summary FROM hse_assessment_rule WHERE rule_code IN ('VIOLATION003','R000001')`);
  console.log('BEFORE:', JSON.stringify(before.rows));

  // 真实运行（幂等刷新）
  const res = await engine.runCycleAutoDeductions(24);
  console.log('RUN ok=%s dryRun=%s affected=%s', res.ok, res.dryRun, res.affected);
  for (const a of res.adapters) {
    console.log(`adapter=${a.key} ok=${a.ok} reason=${a.reason} scanned=${a.scanned} assessed=${a.assessed} affected=${a.affected} deducted=${a.deducted}`);
  }

  // 运行后：规则观测文案
  const after = await pool.query(
    `SELECT rule_code, last_run_summary FROM hse_assessment_rule WHERE rule_code IN ('VIOLATION003','R000001')`);
  console.log('AFTER:', JSON.stringify(after.rows));

  // 网格 parity（应不变）
  const grid = await pool.query(
    `SELECT COUNT(*)::int n, COALESCE(SUM(suggested_score),0) s,
            SUM(CASE WHEN review_status<>'pending' THEN 1 ELSE 0 END)::int nonpending
       FROM hse_assessment_deduction
      WHERE cycle_id=24 AND source_detail->>'kind'='grid_unchecked_monthly' AND is_deleted=FALSE`);
  console.log('GRID_PARITY:', JSON.stringify(grid.rows[0]));

  // 三违来源 0 行
  const v = await pool.query(
    `SELECT COUNT(*)::int n FROM hse_assessment_deduction
      WHERE cycle_id=24 AND source_detail->>'kind'='violation_event' AND is_deleted=FALSE`);
  console.log('VIOLATION_EVENT_ROWS:', JSON.stringify(v.rows[0]));

  const g = grid.rows[0];
  const parityOk = g.n === 54 && parseFloat(g.s) === 103.0 && g.nonpending === 0 && v.rows[0].n === 0 && res.affected === 0;
  console.log('CYCLE24_REFRESH_PARITY_OK:', parityOk);
  process.exit(parityOk ? 0 : 2);
})().catch((e) => { console.error('REFRESH ERROR', e && e.stack || e); process.exit(2); });
