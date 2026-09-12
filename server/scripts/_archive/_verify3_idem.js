/* 第三轮验证：正式执行幂等性 + 统一生效分口径（getEffectiveDeductionTotal）
 * 1) 正式 sync(24) → affected 应=0（24条已存在，全 noop），无重复行
 * 2) getEffectiveDeductionTotal 对 李忠胜(454)/李先菊(468) 返回生效分
 * 3) 软删一条 grid_unchecked 行 → 重扫应「复活」而非新增 → 清理复原
 */
const { testConnection, pool } = require('../config/db');
const svc = require('../services/gridUncheckedDeductionService');
const engine = require('../services/assessmentScoringEngine');

(async () => {
  await testConnection();
  const cycleId = 24;

  // 1. 正式执行幂等
  const before = await pool.query(
    `SELECT count(*)::int AS c FROM hse_assessment_deduction
     WHERE cycle_id=$1 AND source_detail->>'kind'='grid_unchecked_monthly' AND is_deleted=FALSE`, [cycleId]
  );
  const r = await svc.syncGridUncheckedDeductions(cycleId);
  const after = await pool.query(
    `SELECT count(*)::int AS c FROM hse_assessment_deduction
     WHERE cycle_id=$1 AND source_detail->>'kind'='grid_unchecked_monthly' AND is_deleted=FALSE`, [cycleId]
  );
  const noop = r.details.filter((d) => d.action === 'noop').length;
  console.log('=== 正式执行幂等性 ===');
  console.log(`before=${before.rows[0].c} after=${after.rows[0].c} affected=${r.affected} noop=${noop} scanned=${r.scanned}`);
  console.log('幂等通过:', r.affected === 0 && before.rows[0].c === after.rows[0].c ? 'YES' : 'NO');

  // 2. 统一生效分（引擎 getEffectiveDeductionTotal，approved/adjusted 用 confirmed_score）
  const t454 = await engine.getEffectiveDeductionTotal(454, cycleId);
  const t468 = await engine.getEffectiveDeductionTotal(468, cycleId);
  console.log('=== 统一生效分 ===');
  console.log('李忠胜(454) 生效分:', t454, '(应=1)');
  console.log('李先菊(468) 生效分:', t468, '(应=2)');

  // 3. 软删复活验证（用 傅学武 id=117，验证后原样复原）
  console.log('=== 软删复活验证 ===');
  const r117 = await pool.query(`SELECT id, is_deleted, suggested_score, review_status FROM hse_assessment_deduction WHERE id=117`);
  console.log('复活前 id=117:', JSON.stringify(r117.rows[0]));
  // 软删
  await pool.query(`UPDATE hse_assessment_deduction SET is_deleted=TRUE WHERE id=117`);
  const s1 = await svc.syncGridUncheckedDeductions(cycleId);
  const me117 = s1.details.find((d) => d.employeeName === '傅学武');
  console.log('软删后重扫 傅学武 action:', me117.action, 'affected:', s1.affected);
  const r117b = await pool.query(`SELECT id, is_deleted, suggested_score, review_status FROM hse_assessment_deduction WHERE id=117`);
  console.log('重扫后 id=117:', JSON.stringify(r117b.rows[0]), '→ 应 is_deleted=FALSE (复活)');

  // 复原清理：id=117 已复活，无需额外清理；确认行数
  const finalCnt = await pool.query(
    `SELECT count(*)::int AS c FROM hse_assessment_deduction
     WHERE cycle_id=$1 AND source_detail->>'kind'='grid_unchecked_monthly' AND is_deleted=FALSE`, [cycleId]
  );
  console.log('最终有效行数:', finalCnt.rows[0].c, '(应=24)');

  await pool.end();
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
