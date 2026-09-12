/* 第三轮验证：类别上限钳制 + 锁定行按 confirmed_score 参与上限（临时数据，结束清理） */
const { testConnection, pool } = require('../config/db');
const engine = require('../services/assessmentScoringEngine');
const svc = require('../services/gridUncheckedDeductionService');

(async () => {
  await testConnection();
  const cycleId = 24;
  const targetId = 445; // 傅学武 缺6次 → raw 6
  let tempDedId = null;

  try {
    // 0. 基线：本通路该人建议分
    const base = await svc.syncGridUncheckedDeductions(cycleId, { dryRun: true });
    const baseRow = base.details.find((d) => d.employeeName === '傅学武');
    console.log('=== 基线（无其它三违扣分）===');
    console.log('傅学武:', JSON.stringify({ missing: baseRow.missing, rawScore: baseRow.rawScore, cappedScore: baseRow.cappedScore, action: baseRow.action }));

    // 1. 插入一条「其它三违扣分」12 分（pending，模拟规则「信息不完整」类别=三违管理）
    const scoreId = await engine.ensureTargetScoreRecord(targetId, cycleId);
    const rule = await svc.loadRuleConfig();
    const metric = await svc.ensureMetric(rule.metricCode);
    const ins = await pool.query(
      `INSERT INTO hse_assessment_deduction
        (score_id, target_id, cycle_id, metric_id, metric_code, deduction_item,
         deduction_type, deduction_source, source_table, source_id, source_detail,
         suggested_score, current_version, review_status, is_transmission, is_deleted)
       VALUES ($1,$2,$3,$4,$5,'信息不完整','auto_deduction','auto','manual_test',NULL,
               $6::jsonb,$7,1,'pending',FALSE,FALSE)
       RETURNING id`,
      [scoreId, targetId, cycleId, metric.id, metric.code,
       JSON.stringify({ kind: 'manual_test', ruleName: '信息不完整', category: '三违管理' }), 12]
    );
    tempDedId = ins.rows[0].id;
    console.log('=== 已插入其它三违扣分 12 分 (id=' + tempDedId + ') ===');

    // 2. dryRun：傅学武 other=12, allowed=15-12=3, capped=min(6,3)=3
    const r1 = await svc.syncGridUncheckedDeductions(cycleId, { dryRun: true });
    const row1 = r1.details.find((d) => d.employeeName === '傅学武');
    console.log('pending 12分时:', JSON.stringify({ raw: row1.rawScore, capped: row1.cappedScore, cappedOut: !!row1.cappedOut }));

    // 3. 把该临时行改为已调整 confirmed=12（锁定），dryRun 验证仍按 12 参与 → capped=3
    await pool.query(
      `UPDATE hse_assessment_deduction SET review_status='adjusted', confirmed_score=12 WHERE id=$1`, [tempDedId]
    );
    const r2 = await svc.syncGridUncheckedDeductions(cycleId, { dryRun: true });
    const row2 = r2.details.find((d) => d.employeeName === '傅学武');
    console.log('adjusted confirmed=12 时:', JSON.stringify({ raw: row2.rawScore, capped: row2.cappedScore, cappedOut: !!row2.cappedOut }));

    // 4. 把该临时行改为 confirmed=20（超过上限），dryRun 验证 allowed=0 → capped-out
    await pool.query(
      `UPDATE hse_assessment_deduction SET confirmed_score=20 WHERE id=$1`, [tempDedId]
    );
    const r3 = await svc.syncGridUncheckedDeductions(cycleId, { dryRun: true });
    const row3 = r3.details.find((d) => d.employeeName === '傅学武');
    console.log('adjusted confirmed=20 时:', JSON.stringify({ raw: row3.rawScore, capped: row3.cappedScore, cappedOut: !!row3.cappedOut, action: row3.action }));
  } catch (e) {
    console.error('ERROR:', e.message);
  } finally {
    // 清理临时数据
    if (tempDedId) {
      await pool.query(`DELETE FROM hse_assessment_deduction WHERE id=$1`, [tempDedId]);
      console.log('=== 已清理临时扣分行 ===');
    }
    // 确认傅学武明细数量恢复
    const check = await pool.query(
      `SELECT count(*)::int AS c FROM hse_assessment_deduction
       WHERE target_id=445 AND cycle_id=24 AND is_deleted=FALSE AND source_detail->>'kind'='grid_unchecked_monthly'`
    );
    console.log('傅学武本通路有效行数:', check.rows[0].c, '(应为1)');
    await pool.end();
  }
})().catch((e) => { console.error('ERROR:', e); process.exit(1); });
