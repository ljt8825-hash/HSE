/**
 * 提示词-09 任务 B：9 月新周期 dryRun 演练（零写入）
 *
 * 行为：
 *   1. 连库，列出全部周期，确认 2026-09 周期是否已存在（及创建方式）。
 *   2. 对 cycle24 跑 runCycleAutoDeductions(dryRun) 证无回归（快照前后 deduction 计数 + 规则观测值）。
 *   3. 若 2026-09 周期存在：同样 dryRun + 零写入快照对比。
 *   4. 若 2026-09 周期不存在：不创建任何正式/演练周期；仅做 9 月窗口只读 COUNT 探针
 *      （grid_inspection_records / violation_records 落在 2026-09 的当前行数），证明 dryRun 预期输出
 *      （grid noLedger / violation 命中 0）；并把"首日复核"交由 Runbook。
 *   全程不执行任何写入（dryRun 由引擎保证；9 月窗口 COUNT 为纯 SELECT）。
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const { pool, testConnection, isConnected } = require('../../config/db');
const engine = require('../../services/ruleEngine/engine');

const SEPT_YEAR = 2026;
const SEPT_MONTH = 9;
const SEPT_CODE = `HSE-CYCLE-${SEPT_YEAR}${String(SEPT_MONTH).padStart(2, '0')}`;

function pj(o) { return JSON.stringify(o); }

async function snapshotDeductions(cycleId) {
  const r = await pool.query(
    `SELECT
        COUNT(*) FILTER (WHERE source_detail->>'kind'='grid_unchecked_monthly') AS grid_n,
        COALESCE(SUM(suggested_score) FILTER (WHERE source_detail->>'kind'='grid_unchecked_monthly'),0) AS grid_score,
        COUNT(*) FILTER (WHERE source_detail->>'kind'='violation_event') AS viol_n
       FROM hse_assessment_deduction
      WHERE cycle_id=$1 AND is_deleted=FALSE`,
    [cycleId]
  );
  return r.rows[0];
}

async function snapshotRuleRun(ruleCode) {
  const r = await pool.query(
    `SELECT rule_code, last_run_at, last_run_cycle_id, last_scanned_count, last_assessed_count, last_deducted_count, last_run_summary
       FROM hse_assessment_rule WHERE rule_code=$1`,
    [ruleCode]
  );
  return r.rows[0] || null;
}

async function dryRunCycle(cycleId, label) {
  console.log(`\n===== DRYRUN ${label} cycle=${cycleId} =====`);
  const before = await snapshotDeductions(cycleId);
  const beforeRule = {
    R000001: await snapshotRuleRun('R000001'),
    VIOLATION003: await snapshotRuleRun('VIOLATION003'),
  };
  console.log(`BEFORE ded: ${pj(before)}`);

  const res = await engine.runCycleAutoDeductions(cycleId, { dryRun: true });
  if (!res.ok) {
    console.log(`DRYRUN skipped: ok=${res.ok} reason=${res.reason}`);
    return { ok: res.ok, reason: res.reason, before, after: before, beforeRule, afterRule: beforeRule };
  }
  for (const a of res.adapters) {
    console.log(`  adapter=${a.key} ok=${a.ok} reason=${a.reason} scanned=${a.scanned} assessed=${a.assessed} affected=${a.affected} deducted=${a.deducted}`);
  }
  const after = await snapshotDeductions(cycleId);
  const afterRule = {
    R000001: await snapshotRuleRun('R000001'),
    VIOLATION003: await snapshotRuleRun('VIOLATION003'),
  };
  console.log(`AFTER  ded: ${pj(after)}`);

  const parity =
    before.grid_n === after.grid_n &&
    parseFloat(before.grid_score) === parseFloat(after.grid_score) &&
    before.viol_n === after.viol_n &&
    pj(beforeRule) === pj(afterRule);
  console.log(`ZERO-WRITE PARITY: ${parity}`);
  return { ok: true, reason: null, before, after, beforeRule, afterRule, parity, adapters: res.adapters };
}

async function countSeptWindow() {
  const gridR = await pool.query(
    `SELECT COUNT(*)::int AS c FROM grid_inspection_records
      WHERE inspection_date >= make_date($1,$2,1)
        AND inspection_date <  make_date($1,$2,1) + INTERVAL '1 month'`,
    [SEPT_YEAR, SEPT_MONTH]
  );
  const violR = await pool.query(
    `SELECT COUNT(*)::int AS c FROM violation_records
      WHERE is_deleted=FALSE AND violator_id IS NOT NULL
        AND violation_date >= make_date($1,$2,1)
        AND violation_date <  make_date($1,$2,1) + INTERVAL '1 month'`,
    [SEPT_YEAR, SEPT_MONTH]
  );
  return { gridInspectionInSept: gridR.rows[0].c, violationsWithKeyInSept: violR.rows[0].c };
}

(async () => {
  await testConnection();
  if (!isConnected()) { console.error('DB 未连接'); process.exit(1); }
  engine.ensureAdaptersRegistered();

  // 0) 全周期清单
  const cycles = await pool.query(
    `SELECT id, cycle_code, cycle_name, status, assessment_year, assessment_month,
            start_time, end_time, target_count, created_by_name, remark
       FROM hse_assessment_cycle WHERE is_deleted=FALSE ORDER BY id DESC LIMIT 12`
  );
  console.log('===== CYCLES (recent) =====');
  for (const c of cycles.rows) {
    console.log(`  id=${c.id} code=${c.cycle_code} status=${c.status} ym=${c.assessment_year}-${c.assessment_month} targets=${c.target_count} by=${c.created_by_name} start=${c.start_time} end=${c.end_time}`);
  }

  const sept = cycles.rows.find((c) => c.cycle_code === SEPT_CODE);
  console.log(`\n===== SEPT CYCLE (${SEPT_CODE}) EXISTS: ${!!sept} =====`);
  if (sept) {
    console.log(`  id=${sept.id} status=${sept.status} targets=${sept.target_count} by=${sept.created_by_name} remark=${sept.remark}`);
  }

  // 1) cycle24 无回归 dryRun
  const cyc24 = cycles.rows.find((c) => c.cycle_code === 'HSE-CYCLE-202608');
  console.log(`\n===== CYCLE24 (HSE-CYCLE-202608) EXISTS: ${!!cyc24} id=${cyc24 ? cyc24.id : '-'} =====`);
  let r24 = null;
  if (cyc24) {
    r24 = await dryRunCycle(cyc24.id, 'CYCLE24');
  }

  // 2) 9 月周期 dryRun / 窗口探针
  let rSept = null;
  if (sept) {
    rSept = await dryRunCycle(sept.id, 'SEPT2026');
  } else {
    console.log('\n===== SEPT CYCLE ABSENT → 只读窗口 COUNT 探针（不创建任何周期） =====');
    const w = await countSeptWindow();
    console.log(`  grid_inspection_records(2026-09): ${w.gridInspectionInSept}  → 适配器预期 noLedger=true (scanned=0)`);
    console.log(`  violation_records violator_id 非空且落在 2026-09: ${w.violationsWithKeyInSept}  → 适配器预期命中 0`);
    rSept = { absent: true, window: w };
  }

  // 3) 规则库清单（支撑任务 C：四态标签 / 最近执行结果 / 软删不可见）
  console.log('\n===== RULES (integration_status / soft-delete / last_run_summary) =====');
  const rules = await pool.query(
    `SELECT rule_code, rule_name, integration_status, status, is_deleted,
            last_run_summary, last_run_at
       FROM hse_assessment_rule ORDER BY id ASC`
  );
  for (const r of rules.rows) {
    console.log(`  code=${r.rule_code} status=${r.status} integ=${r.integration_status} deleted=${r.is_deleted} summary=${r.last_run_summary || '—'} at=${r.last_run_at || ''}`);
  }

  // 输出结构化结论
  console.log('\n===== SUMMARY =====');
  console.log(`septExists=${!!sept}`);
  if (r24) console.log(`cycle24 zeroWriteParity=${r24.parity === undefined ? 'n/a(skipped)' : r24.parity} reason=${r24.reason || 'ok'}`);
  if (rSept && !rSept.absent) console.log(`sept zeroWriteParity=${rSept.parity} reason=${rSept.reason || 'ok'}`);
  if (rSept && rSept.absent) console.log(`sept window=${pj(rSept.window)}`);

  process.exit(0);
})().catch((e) => { console.error('PROBE ERROR', e && e.stack || e); process.exit(2); });
