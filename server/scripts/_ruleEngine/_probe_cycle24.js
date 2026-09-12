// 回归探针：dryRun 验证 cycle24 网格 parity 不被新上限逻辑影响（不写库，保持三违基线）。
// 归属：server/scripts/_ruleEngine/（阶段2 收尾 A4 归档，require 路径已按新层级修正）
// 用法：node server/scripts/_ruleEngine/_probe_cycle24.js
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const { pool, testConnection, isConnected } = require('../../config/db');
const engine = require('../../services/ruleEngine/engine');

(async () => {
  await testConnection();
  if (!isConnected()) { console.error('DB 未连接'); process.exit(1); }
  engine.ensureAdaptersRegistered();

  // 运行前：cycle24 网格 parity（随日期自然演进，不做固定值断言）
  const before = await pool.query(
    `SELECT COUNT(*) AS n, COALESCE(SUM(suggested_score),0) AS s,
            SUM(CASE WHEN review_status<>'pending' THEN 1 ELSE 0 END) AS nonpending
       FROM hse_assessment_deduction
      WHERE cycle_id=24 AND source_detail->>'kind'='grid_unchecked_monthly' AND is_deleted=FALSE`);
  console.log('BEFORE grid: ', JSON.stringify(before.rows[0]));

  // 运行前：三违自身行为扣分基线
  const beforeV = await pool.query(
    `SELECT COUNT(*) AS n FROM hse_assessment_deduction
      WHERE cycle_id=24 AND source_detail->>'kind'='violation_event' AND is_deleted=FALSE`);
  console.log('BEFORE violation_event baseline: ', JSON.stringify(beforeV.rows[0]));

  // dryRun：只算不写
  const res = await engine.runCycleAutoDeductions(24, { dryRun: true });
  for (const a of res.adapters) {
    console.log(`DRYRUN adapter=${a.key} ok=${a.ok} reason=${a.reason} scanned=${a.scanned} assessed=${a.assessed} affected=${a.affected} deducted=${a.deducted}`);
  }

  // 运行后（dryRun 不写，应完全不变）
  const after = await pool.query(
    `SELECT COUNT(*) AS n, COALESCE(SUM(suggested_score),0) AS s,
            SUM(CASE WHEN review_status<>'pending' THEN 1 ELSE 0 END) AS nonpending
       FROM hse_assessment_deduction
      WHERE cycle_id=24 AND source_detail->>'kind'='grid_unchecked_monthly' AND is_deleted=FALSE`);
  console.log('AFTER  grid: ', JSON.stringify(after.rows[0]));
  const afterV = await pool.query(
    `SELECT COUNT(*) AS n FROM hse_assessment_deduction
      WHERE cycle_id=24 AND source_detail->>'kind'='violation_event' AND is_deleted=FALSE`);
  console.log('AFTER  violation_event baseline: ', JSON.stringify(afterV.rows[0]));

  const g0 = before.rows[0], g1 = after.rows[0];
  const parityOk = g0.n === g1.n && parseFloat(g0.s) === parseFloat(g1.s) && g0.nonpending === g1.nonpending;
  console.log('GRID PARITY PRESERVED: ', parityOk);
  process.exit(parityOk ? 0 : 1);
})().catch((e) => { console.error('PROBE ERROR', e && e.stack || e); process.exit(2); });
