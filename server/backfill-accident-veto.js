/**
 * 历史回填 + 旧数据清理 —— 事故否决项（交通/生产安全责任，一票否决）
 *
 * 背景（2026-09-05 口径变更）：
 *   旧逻辑：事故创建/删除事件对「当事人本人」扣 100 分（legacy 回填 + 旧事件路）。
 *   新逻辑：由规则引擎适配器 accident_veto 按事故类别/性质自动匹配
 *           「当事人直接上级 + 乡镇作业中心经理」扣 100 分（一票否决）。
 *
 * 本脚本两步：
 *   1) 清理旧事故否决扣分（source_table='accidents' 且非 kind='accident_veto' 的 auto 行，
 *      即旧「本人否决」行），硬删除后对受影响对象重算。
 *   2) 对 2025-08 至今的所有考核周期运行 accident_veto 适配器（真实执行），
 *      生成新的否决扣分明细并重算对象分数（幂等，可重复跑）。
 *
 * 运行：
 *   node backfill-accident-veto.js dryRun   # 只预览（默认）
 *   node backfill-accident-veto.js apply    # 真实执行：清理旧数据 + 回填新否决扣分
 */
require('dotenv').config({ path: 'g:/hse-dashboard/server/.env' });
const db = require('g:/hse-dashboard/server/config/db');
const { pool } = db;
const ruleEngine = require('g:/hse-dashboard/server/services/ruleEngine/engine');

const START_YEAR = 2025;
const START_MONTH = 8;

// 旧事故否决扣分明细（被新适配器淘汰的本人否决行）
const OLD_VETO_WHERE = `
  source_table = 'accidents'
  AND deduction_source = 'auto'
  AND (source_detail ->> 'kind' IS NULL OR source_detail ->> 'kind' IS DISTINCT FROM 'accident_veto')
`;

async function selectCycles() {
  const r = await pool.query(
    `SELECT id, assessment_year, assessment_month, status,
            TO_CHAR(start_time,'YYYY-MM-DD') AS start_dt, TO_CHAR(end_time,'YYYY-MM-DD') AS end_dt
       FROM hse_assessment_cycle
      WHERE is_deleted = FALSE
        AND (assessment_year > $1 OR (assessment_year = $1 AND assessment_month >= $2))
      ORDER BY assessment_year ASC, assessment_month ASC`,
    [START_YEAR, START_MONTH]
  );
  return r.rows;
}

async function previewOldVeto() {
  const cnt = await pool.query(
    `SELECT COUNT(*) AS n
       FROM hse_assessment_deduction WHERE ${OLD_VETO_WHERE} AND is_deleted = FALSE`
  );
  const samples = await pool.query(
    `SELECT d.id, d.target_id, d.source_id, d.metric_code, d.suggested_score,
            t.employee_name AS emp_name, d.cycle_id, d.source_detail
       FROM hse_assessment_deduction d
       LEFT JOIN hse_assessment_target t ON t.id = d.target_id
      WHERE ${OLD_VETO_WHERE} AND d.is_deleted = FALSE
      ORDER BY d.id DESC LIMIT 20`
  );
  return { count: Number(cnt.rows[0].n), samples: samples.rows };
}

async function deleteOldVeto() {
  const sel = await pool.query(
    `SELECT DISTINCT target_id, cycle_id FROM hse_assessment_deduction
      WHERE ${OLD_VETO_WHERE} AND is_deleted = FALSE`
  );
  const targeted = sel.rows;
  const del = await pool.query(
    `DELETE FROM hse_assessment_deduction WHERE ${OLD_VETO_WHERE} AND is_deleted = FALSE`
  );
  // 对受影响对象重算分数
  for (const row of targeted) {
    try {
      await require('g:/hse-dashboard/server/services/assessmentScoringEngine').recalculateTarget(row.cycle_id, row.target_id);
    } catch (e) {
      console.warn(`  [recalc] cycle=${row.cycle_id} target=${row.target_id} 失败:`, e.message);
    }
  }
  return { deleted: del.rowCount, targets: targeted.length };
}

(async () => {
  const mode = process.argv[2] || 'dryRun';
  const isApply = mode === 'apply';
  await db.testConnection(); // 置位 dbConnected，供规则引擎 isConnected() 放行
  console.log(`[mode] ${isApply ? 'apply（真实执行）' : 'dryRun（预览）'}`);

  // ---- 1) 旧数据 ----
  const old = await previewOldVeto();
  console.log(`\n=== 旧事故否决自动扣分明细（待清理/预览）===`);
  console.log(`数量: ${old.count}`);
  for (const s of old.samples) {
    console.log(`  [${s.cycle_id}] ${s.emp_name || s.target_id} metric=${s.metric_code} score=${s.suggested_score} accident#=${s.source_id}`);
  }
  if (isApply) {
    const res = await deleteOldVeto();
    console.log(`\n[清理] 已硬删除 ${res.deleted} 行，重算 ${res.targets} 个对象。`);
  }

  // ---- 2) 历史回填 ----
  const cycles = await selectCycles();
  console.log(`\n=== 需回填周期（${START_YEAR}-${String(START_MONTH).padStart(2,'0')} 至今）共 ${cycles.length} 个 ===`);
  let totAffected = 0, totAssessed = 0, totScanned = 0, skippedCycles = 0;
  const failures = [];

  for (const c of cycles) {
    const label = `${c.assessment_year}-${String(c.assessment_month).padStart(2,'0')}`;
    if (c.status === 'frozen' || c.status === 'not_started') {
      console.log(`  [${label}] 跳过（status=${c.status}）`);
      skippedCycles++;
      continue;
    }
    try {
      const res = await ruleEngine.runCycleAdapters(c.id, { adapterKeys: ['accident_veto'], dryRun: !isApply });
      if (!res.ok) {
        console.log(`  [${label}] 跳过（${res.reason || 'error'}）`);
        skippedCycles++;
        continue;
      }
      totScanned += res.scanned || 0;
      totAssessed += res.assessed || 0;
      totAffected += res.affected || 0;
      const veto = (res.adapters || []).find((a) => a.key === 'accident_veto');
      console.log(
        `  [${label}] ${isApply?'写入':'预览'}：扫描事故 ${res.scanned||0}，意图 ${res.assessed||0}，变更 ${res.affected||0}` +
        (veto && veto.reason ? `（${veto.reason}）` : '')
      );
      // dryRun 输出明细意图
      if (!isApply) {
        for (const d of (res.details || [])) {
          const a = d.accident;
          console.log(`       ${d.action || d.type || ''} → ${d.employeeName} [${a && a.category}·${a && a.nature}] accident#${a ? a.id : d.accidentId || d.sourceId} score=${d.cappedScore ?? d.rawScore}`);
        }
      }
    } catch (e) {
      failures.push(label);
      console.warn(`  [${label}] 失败:`, e.message);
    }
  }

  console.log(`\n=== 汇总 ===`);
  console.log(`周期 ${cycles.length}（跳过 ${skippedCycles}，失败 ${failures.length}）扫描事故 ${totScanned}，意图 ${totAssessed}，变更/回填 ${totAffected}`);
  if (failures.length) console.log(`失败周期: ${failures.join(', ')}`);
  if (!isApply) {
    console.log(`\n预览完成，未写库。确认真实执行：node backfill-accident-veto.js apply`);
  } else {
    console.log(`\n真实执行完成。`);
  }
  process.exit(0);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });