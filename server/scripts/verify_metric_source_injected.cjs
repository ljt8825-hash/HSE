// ============================================================================
// 指标取数配置化改造 · 受控注入零漂移验证（DEV ONLY，幂等可重跑）
// 护栏：只跑 safety_dashboard_dev，require config/db 前硬设 DB_NAME，连接后断言。
// 因 dev 克隆库对考核对象无任何“不合格培训/事故”记录，注入受控测试数据
// （1 条不合格培训 + 3 种事故类型）真实驱动回填，验证配置驱动版与原硬编码版的
// 生成结果完全一致（尤其事故类型→否决指标映射）。结尾硬删测试业务行 + 扣分明细，
// dev 还原；运行前也会清理上次可能遗留的【验证注入】标记数据，保证可重跑。
// ============================================================================

process.env.DB_NAME = 'safety_dashboard_dev';
process.env.SCHEDULER_ENABLED = 'false';
process.env.LEGACY_ACCIDENT_VETO = 'true';
process.env.LEGACY_TRAINING_FILL = 'true';

const db = require('../config/db');
const engine = require('../services/assessmentScoringEngine');

const CYCLE_ID = 43;
const TEST_TRAIN_DATE = '2026-09-15T09:30:00Z';
const TEST_ACCIDENT_DATE = '2026-09-20';
const ACC_TYPES = ['交通事故', '环境污染事故', '其它生产事故'];

const cleanupTestData = async () => {
  const tr = await db.pool.query("SELECT id FROM training_records WHERE name LIKE '【验证注入】%'");
  const ac = await db.pool.query("SELECT id FROM accidents WHERE description LIKE '【验证注入】%'");
  const trIds = tr.rows.map((r) => r.id), acIds = ac.rows.map((r) => r.id);
  if (trIds.length || acIds.length) {
    if (trIds.length) await db.pool.query("UPDATE hse_assessment_deduction SET is_deleted=TRUE WHERE source_detail->>'backfill'='true' AND source_table='training_records' AND source_id=ANY($1)", [trIds]);
    if (acIds.length) await db.pool.query("UPDATE hse_assessment_deduction SET is_deleted=TRUE WHERE source_detail->>'backfill'='true' AND source_table='accidents' AND source_id=ANY($1)", [acIds]);
    if (trIds.length) await db.pool.query('DELETE FROM training_records WHERE id=ANY($1)', [trIds]);
    if (acIds.length) await db.pool.query('DELETE FROM accidents WHERE id=ANY($1)', [acIds]);
  }
  return { trIds, acIds };
};

(async () => {
  const cur = await db.pool.query('SELECT current_database() AS db');
  if (cur.rows[0].db !== 'safety_dashboard_dev') {
    console.error('[GUARD] 非 dev 库，拒绝执行！'); await db.pool.end(); process.exit(2);
  }
  console.log('[GUARD] connected to:', cur.rows[0].db);

  // —— 运行前自清理（幂等）——
  const pre = await cleanupTestData();
  if (pre.trIds.length || pre.acIds.length) console.log('[SELF-CLEAN] 清理上次遗留测试数据:', JSON.stringify(pre));

  const cycle = (await db.pool.query('SELECT * FROM hse_assessment_cycle WHERE id=$1', [CYCLE_ID])).rows[0];
  const targets = (await db.pool.query('SELECT id, employee_id FROM hse_assessment_target WHERE cycle_id=$1 AND is_deleted=FALSE', [CYCLE_ID])).rows;
  const testTarget = targets[0];
  console.log('[SETUP] 测试考核对象:', testTarget.id, 'employee_id:', testTarget.employee_id, '| 总对象数:', targets.length);

  // —— 受控注入 ——
  const tr = await db.pool.query(
    `INSERT INTO training_records (name, employee_id, result, training_date, is_deleted)
     VALUES ($1, $2, '不合格', $3, FALSE) RETURNING id`,
    ['【验证注入】培训', testTarget.employee_id, TEST_TRAIN_DATE]
  );
  const trId = tr.rows[0].id;
  const accIds = [];
  for (const type of ACC_TYPES) {
    const r = await db.pool.query(
      `INSERT INTO accidents (accident_date, description, personnel_id, accident_type, is_deleted)
       VALUES ($1, $2, $3, $4, FALSE) RETURNING id`,
      [TEST_ACCIDENT_DATE, '【验证注入】事故', testTarget.employee_id, type]
    );
    accIds.push(r.rows[0].id);
  }
  console.log('[SETUP] 注入 培训行', trId, '| 事故行', JSON.stringify(accIds));
  const expected = 1 + ACC_TYPES.length;

  const captureNew = async (since) => (await db.pool.query(
    `SELECT id, target_id, metric_code, source_table, source_id, suggested_score, deduction_item, source_detail
     FROM hse_assessment_deduction
     WHERE is_deleted=FALSE AND source_table IN ('training_records','accidents')
       AND source_detail->>'backfill'='true' AND created_at >= $1
     ORDER BY source_table, source_id`, [since]
  )).rows;

  // —— MODE A：配置驱动 ——
  const t0 = new Date();
  await engine.fillMissingDeductionsForTarget(cycle, testTarget);
  const fileA = await captureNew(t0);
  console.log('\n[MODE A][config-driven] 生成:', fileA.length, '行 (期望', expected, ')');

  // 清理 A
  if (fileA.length) await db.pool.query('UPDATE hse_assessment_deduction SET is_deleted=TRUE WHERE id=ANY($1)', [fileA.map((r) => r.id)]);

  // —— MODE B：原硬编码 ——
  const t1 = new Date();
  await engine.fillMissingDeductionsLegacy(cycle, testTarget);
  const fileB = await captureNew(t1);
  console.log('[MODE B][legacy-hardcoded] 生成:', fileB.length, '行 (期望', expected, ')');

  // —— 比对 ——
  const keyOf = (r) => `${r.source_table}|${r.source_id}|${r.metric_code}`;
  const mA = new Map(fileA.map((r) => [keyOf(r), r]));
  const mB = new Map(fileB.map((r) => [keyOf(r), r]));
  const onlyA = [...mA.keys()].filter((k) => !mB.has(k));
  const onlyB = [...mB.keys()].filter((k) => !mA.has(k));
  const mism = [];
  for (const k of mA.keys()) {
    if (!mB.has(k)) continue;
    const a = mA.get(k), b = mB.get(k);
    if (Number(a.suggested_score) !== Number(b.suggested_score) || a.deduction_item !== b.deduction_item) {
      mism.push({ k, a: { score: a.suggested_score, item: a.deduction_item }, b: { score: b.suggested_score, item: b.deduction_item } });
    }
  }
  console.log('\n[MODE A 明细]');
  console.table(fileA.map((r) => ({ src: r.source_table, sid: r.source_id, code: r.metric_code, score: r.suggested_score, item: r.deduction_item })));
  console.log('[MODE B 明细]');
  console.table(fileB.map((r) => ({ src: r.source_table, sid: r.source_id, code: r.metric_code, score: r.suggested_score, item: r.deduction_item })));

  const zeroDrift = onlyA.length === 0 && onlyB.length === 0 && mism.length === 0
    && fileA.length === fileB.length && fileA.length === expected;
  console.log('\n========== 零漂移比对 ==========');
  console.log('行数 A/B:', fileA.length, '/', fileB.length, '| 期望:', expected);
  console.log('仅 A:', onlyA.length, '| 仅 B:', onlyB.length, '| 值不一致:', mism.length);
  if (mism.length) console.log('  mism:', JSON.stringify(mism));
  if (onlyA.length) console.log('  onlyA:', JSON.stringify(onlyA));
  if (onlyB.length) console.log('  onlyB:', JSON.stringify(onlyB));
  console.log('零漂移判定:', zeroDrift ? 'PASS ✅' : 'FAIL ❌');
  console.log('================================\n');

  // —— 清理：删测试业务行 + 生成明细，dev 还原 ——
  if (fileB.length) await db.pool.query('UPDATE hse_assessment_deduction SET is_deleted=TRUE WHERE id=ANY($1)', [fileB.map((r) => r.id)]);
  await db.pool.query('DELETE FROM training_records WHERE id=$1', [trId]);
  await db.pool.query('DELETE FROM accidents WHERE id=ANY($1)', [accIds]);
  const remain = (await db.pool.query(
    "SELECT count(*) n FROM hse_assessment_deduction WHERE is_deleted=FALSE AND source_detail->>'backfill'='true' AND source_table IN ('training_records','accidents')"
  )).rows[0].n;
  console.log('[CLEANUP] 已删除注入业务行 + 测试明细。剩余 backfill(培训/事故):', remain);

  await db.pool.end();
  process.exit(zeroDrift ? 0 : 3);
})().catch(async (e) => { console.error('[FATAL]', e); try { await db.pool.end(); } catch {} process.exit(1); });
