// ============================================================================
// 指标取数配置化改造 · 零漂移验证脚本（DEV ONLY）
// ----------------------------------------------------------------------------
// 护栏：本脚本只准跑 safety_dashboard_dev。在 require('../config/db') 之前硬设
//       DB_NAME，并在连接后断言 current_database() === 'safety_dashboard_dev'，
//       否则立即 exit(2)。严禁对 safety_dashboard（生产库）执行。
//
// 做法：
//   1) 在 dev 库建 hse_assessment_metric_source 配置表 + seed（幂等）
//   2) 以“活跃周期 43（2026年9月）”的 61 个考核对象为样本：
//      MODE A = 配置驱动 fillMissingDeductionsForTarget
//      MODE B = 原硬编码   fillMissingDeductionsLegacy
//      两者均真实 INSERT 进 hse_assessment_deduction，捕获后逐行比对
//      (target_id|source_table|source_id|metric_code) 的 suggested_score/item/扣分项
//   3) 比对零漂移后清理测试行，再以“生产等价态”(事故否决旧路 OFF) 重跑配置驱动
//      + recalculateCycle 收尾，使 dev 处于可演示状态。
//
// 注（2026-10-13 A 方案口径清理后）：事故否决已彻底移出 config/legacy 路径（归规则引擎 NEG-004），
//     本脚本不再注入/校验事故；仅以 training 验证配置驱动 vs 原硬编码零漂移。
// ============================================================================

// —— 护栏：必须在 require config/db 之前硬设 ——
process.env.DB_NAME = 'safety_dashboard_dev';
process.env.SCHEDULER_ENABLED = 'false';
process.env.LEGACY_TRAINING_FILL = 'true';

const fs = require('fs');
const path = require('path');

(async () => {
  const db = require('../config/db');
  const engine = require('../services/assessmentScoringEngine');

  // —— 护栏断言 ——
  const cur = await db.pool.query('SELECT current_database() AS db');
  const dbName = cur.rows[0].db;
  console.log('[GUARD] connected to:', dbName);
  if (dbName !== 'safety_dashboard_dev') {
    console.error('[GUARD] 非 dev 库，拒绝执行！');
    await db.pool.end();
    process.exit(2);
  }

  const CYCLE_ID = 43;

  // ---------------------------------------------------------------
  // 步骤 1：建表 + seed（幂等）
  // ---------------------------------------------------------------
  const sqlPath = path.join(__dirname, '..', 'sql', 'assessment_metric_source_config.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const stmts = sql.split(';').map((s) => s.trim()).filter((s) => s.length > 0);
  for (const st of stmts) {
    await db.pool.query(st);
  }
  const cfgNow = await db.pool.query(
    'SELECT source_name, enabled, is_deleted FROM hse_assessment_metric_source ORDER BY source_name'
  );
  console.log('[STEP1] 配置表现状:', JSON.stringify(cfgNow.rows));

  // 确保 seed 行启用（测试需要；accident 源已不 seed，仅 training）
  await db.pool.query(
    "UPDATE hse_assessment_metric_source SET enabled = TRUE WHERE source_name = 'training'"
  );

  // ---------------------------------------------------------------
  // 取样本：周期 + 考核对象
  // ---------------------------------------------------------------
  const cycle = (await db.pool.query('SELECT * FROM hse_assessment_cycle WHERE id = $1', [CYCLE_ID])).rows[0];
  if (!cycle) { console.error('周期不存在'); await db.pool.end(); process.exit(1); }
  const targets = (await db.pool.query(
    'SELECT id, employee_id FROM hse_assessment_target WHERE cycle_id = $1 AND is_deleted = FALSE',
    [CYCLE_ID]
  )).rows;
  console.log('[SAMPLE] 周期:', cycle.cycle_name, '| 考核对象数:', targets.length);

  const captureNew = async (since) => {
    const r = await db.pool.query(
      `SELECT id, target_id, cycle_id, metric_code, source_table, source_id,
              suggested_score, deduction_item, source_detail
       FROM hse_assessment_deduction
       WHERE is_deleted = FALSE
         AND source_table IN ('training_records','accidents')
         AND source_detail->>'backfill' = 'true'
         AND created_at >= $1
       ORDER BY target_id, source_table, source_id`,
      [since]
    );
    return r.rows;
  };

  const norm = (rows) => {
    const m = new Map();
    for (const row of rows) {
      const key = `${row.target_id}|${row.source_table}|${row.source_id}|${row.metric_code}`;
      m.set(key, {
        suggested_score: Number(row.suggested_score),
        deduction_item: row.deduction_item,
        item: row.source_detail ? row.source_detail.item || null : null,
      });
    }
    return m;
  };

  // ---------------------------------------------------------------
  // MODE A：配置驱动
  // ---------------------------------------------------------------
  const t0 = new Date();
  for (const t of targets) {
    await engine.fillMissingDeductionsForTarget(cycle, t);
  }
  const fileA = await captureNew(t0);
  console.log('[MODE A][config-driven] 生成 backfill 行:', fileA.length);
  if (fileA.length) {
    console.log('  样本:', JSON.stringify(fileA.slice(0, 5).map((r) => ({
      target: r.target_id, tbl: r.source_table, src: r.source_id, code: r.metric_code, score: r.suggested_score, item: r.deduction_item,
    }))));
  }

  // ---------------------------------------------------------------
  // MODE B：原硬编码（先清掉 A 的行，保证 B 从干净基线生成）
  // ---------------------------------------------------------------
  if (fileA.length) {
    await db.pool.query('UPDATE hse_assessment_deduction SET is_deleted = TRUE WHERE id = ANY($1)', [fileA.map((r) => r.id)]);
  }
  const t1 = new Date();
  for (const t of targets) {
    await engine.fillMissingDeductionsLegacy(cycle, t);
  }
  const fileB = await captureNew(t1);
  console.log('[MODE B][legacy-hardcoded] 生成 backfill 行:', fileB.length);

  // ---------------------------------------------------------------
  // 比对
  // ---------------------------------------------------------------
  const mA = norm(fileA);
  const mB = norm(fileB);
  const keysA = new Set(mA.keys());
  const keysB = new Set(mB.keys());
  const onlyA = [...keysA].filter((k) => !keysB.has(k));
  const onlyB = [...keysB].filter((k) => !keysA.has(k));
  const mism = [];
  for (const k of keysA) {
    if (!keysB.has(k)) continue;
    const a = mA.get(k), b = mB.get(k);
    if (a.suggested_score !== b.suggested_score || a.deduction_item !== b.deduction_item) {
      mism.push({ key: k, a, b });
    }
  }
  const matched = [...keysA].filter((k) => keysB.has(k) && !(mism.find((m) => m.key === k))).length;

  console.log('\n========== 零漂移比对结果 ==========');
  console.log('MODE A 行数:', fileA.length, '| MODE B 行数:', fileB.length);
  console.log('完全匹配(键+分值+扣分项):', matched);
  console.log('仅 A 有 (config 多生成):', onlyA.length);
  console.log('仅 B 有 (legacy 多生成):', onlyB.length);
  console.log('同键但值不一致:', mism.length);
  if (onlyA.length) console.log('  onlyA:', JSON.stringify(onlyA.slice(0, 10)));
  if (onlyB.length) console.log('  onlyB:', JSON.stringify(onlyB.slice(0, 10)));
  if (mism.length) console.log('  mism:', JSON.stringify(mism.slice(0, 10)));
  const zeroDrift = onlyA.length === 0 && onlyB.length === 0 && mism.length === 0 && fileA.length === fileB.length;
  console.log('零漂移判定:', zeroDrift ? 'PASS ✅' : 'FAIL ❌');
  console.log('===================================\n');

  // ---------------------------------------------------------------
  // 清理测试行 → 还原干净基线
  // ---------------------------------------------------------------
  if (fileB.length) {
    await db.pool.query('UPDATE hse_assessment_deduction SET is_deleted = TRUE WHERE id = ANY($1)', [fileB.map((r) => r.id)]);
  }

  // ---------------------------------------------------------------
  // 收尾：以“生产等价态”重跑配置驱动 + recalculateCycle
  // 注（A 方案后）：事故否决已归规则引擎 NEG-004，config/legacy 路径不再生成 accidents 行，
  //     故收尾仅会留下 training 类 backfill，accIds 恒为空（保留兜底逻辑无害）。
  // ---------------------------------------------------------------
  const t2 = new Date();
  for (const t of targets) {
    await engine.fillMissingDeductionsForTarget(cycle, t);
  }
  const afterCfg = await captureNew(t2);
  // 兜底：剔除任何 accidents 类 backfill（A 方案后不应再有）
  const accIds = afterCfg.filter((r) => r.source_table === 'accidents').map((r) => r.id);
  if (accIds.length) {
    await db.pool.query('UPDATE hse_assessment_deduction SET is_deleted = TRUE WHERE id = ANY($1)', [accIds]);
  }
  const finalBackfill = afterCfg.filter((r) => r.source_table === 'training_records');
  console.log('[FINAL] 配置驱动生成(生产等价:仅 training):', finalBackfill.length, '| 已剔除 accidents 行:', accIds.length);

  // recalculateCycle 收尾（重算分数，证明链路在生产等价态可用）
  const before = (await db.pool.query(
    'SELECT count(*) n, avg(score_auto) avg FROM hse_assessment_target WHERE cycle_id=$1 AND is_deleted=FALSE',
    [CYCLE_ID]
  )).rows[0];
  const recalc = await engine.recalculateCycle(CYCLE_ID);
  const okCount = recalc.filter((r) => r.ok).length;
  const failCount = recalc.filter((r) => !r.ok).length;
  const after = (await db.pool.query(
    'SELECT count(*) n, avg(score_auto) avg FROM hse_assessment_target WHERE cycle_id=$1 AND is_deleted=FALSE',
    [CYCLE_ID]
  )).rows[0];
  console.log('[FINAL] recalculateCycle: 成功', okCount, '失败', failCount);
  console.log('[FINAL] score_auto 均值 before/after:', Number(before.avg).toFixed(2), '->', Number(after.avg).toFixed(2));

  await db.pool.end();

  // 退出码反映零漂移结论
  process.exit(zeroDrift ? 0 : 3);
})().catch(async (e) => {
  console.error('[FATAL]', e);
  process.exit(1);
});
