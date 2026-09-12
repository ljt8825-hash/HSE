/**
 * 提示词-15 任务 C：重启后验证脚本（可重复、只读快照 + 幂等真实触发）
 *
 * 用法（仅限重启后、维护窗口 2026-09-01 ~ 2026-10-01 内执行）：
 *   node server/scripts/_ruleEngine/_post_restart_verify_20260831.js
 *
 * 行为：
 *   1. 快照 R000001 / VIOLATION003 的 last_run_*（cycle_id/at/summary/counts）+ cycle24 / cycle43 扣分表行数（before）
 *   2. 真实触发 runCycleAutoDeductions(24) 与 (43)（非 dryRun；观测守卫按其窗口决定写不写）
 *   3. 快照 after，输出对比表 + 守卫断言（按 now 是否∈窗口动态判定，避免硬编码日期假设）
 *
 * 守卫语义（提示词-14）：仅当 now ∈ [start_time, end_time] 才写 last_run_*；
 *   - 已结束周期（now 不在窗口）→ 真实触发也只补扣、不覆写 last_run_*（扣分 parity 不变）
 *   - 当月周期（now 在窗口）→ last_run_* 写入该周期
 * dryRun / 历史重跑同理不写。脚本本身零新增业务数据（真实触发只为验证守卫，affected 应为 0）。
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const { pool, testConnection, isConnected } = require('../../config/db');
const engine = require('../../services/ruleEngine/engine');

const SH = 'Asia/Shanghai';
const CYCLES = [
  { code: 'HSE-CYCLE-202608', label: 'cycle24(8月·重启后视为已结束)' },
  { code: 'HSE-CYCLE-202609', label: 'cycle43(9月·当月)' },
];
const RULES = ['R000001', 'VIOLATION003'];

async function q1(sql, params) {
  const r = await pool.query(sql, params || []);
  return r.rows;
}

async function snapshotRule(ruleCode) {
  const rows = await q1(
    `SELECT rule_code, last_run_cycle_id,
            to_char(last_run_at AT TIME ZONE '${SH}','YYYY-MM-DD HH24:MI:SS') AS last_run_at,
            last_run_summary, last_scanned_count, last_assessed_count, last_deducted_count
       FROM hse_assessment_rule WHERE rule_code=$1`,
    [ruleCode]
  );
  return rows[0] || null;
}

async function snapshotDeduction(cycleId) {
  const rows = await q1(
    `SELECT COUNT(*)::int AS n FROM hse_assessment_deduction WHERE cycle_id=$1 AND is_deleted=FALSE`,
    [cycleId]
  );
  return rows[0].n;
}

function nowInWindow(start, end) {
  const s = start instanceof Date ? start : new Date(start);
  const e = end instanceof Date ? end : new Date(end);
  const now = new Date();
  return now >= s && now <= e;
}

async function main() {
  await testConnection();
  if (!isConnected()) { console.error('[ERROR] 未连接数据库'); process.exit(2); }

  console.log('==============================================');
  console.log(' 提示词-15 · 重启后验证包');
  console.log(` 运行时刻(本地): ${new Date().toLocaleString('zh-CN', { timeZone: SH })}`);
  console.log('==============================================');

  const before = {};
  const cycleMeta = {};
  for (const cyc of CYCLES) {
    const meta = await q1(
      `SELECT id, cycle_code, status,
              start_time, end_time,
              to_char(start_time AT TIME ZONE '${SH}','YYYY-MM-DD HH24:MI:SS') AS st,
              to_char(end_time   AT TIME ZONE '${SH}','YYYY-MM-DD HH24:MI:SS') AS et
         FROM hse_assessment_cycle WHERE cycle_code=$1 AND is_deleted=FALSE`,
      [cyc.code]
    );
    if (!meta.length) { console.log(`[SKIP]  ${cyc.code} 不存在，跳过`); continue; }
    const m = meta[0];
    cycleMeta[cyc.code] = m;
    before[cyc.code] = {
      windowIn: nowInWindow(m.start_time, m.end_time),
      deductionRows: await snapshotDeduction(m.id),
      rules: {},
    };
    for (const rc of RULES) before[cyc.code].rules[rc] = await snapshotRule(rc);
    console.log(`[BEFORE] ${cyc.code} id=${m.id} 窗口 ${m.st}~${m.et} now∈窗口=${before[cyc.code].windowIn} 扣分表=${before[cyc.code].deductionRows}行`);
  }

  // 真实触发（非 dryRun）—— 守卫按其窗口决定写不写观测
  for (const cyc of CYCLES) {
    const m = cycleMeta[cyc.code];
    if (!m) continue;
    console.log(`----------------------------------------------`);
    console.log(`[TRIGGER] runCycleAutoDeductions(${m.id}) 真实运行（dryRun=false）`);
    const res = await engine.runCycleAutoDeductions(m.id, { dryRun: false });
    if (res && res.ok) {
      console.log(`[TRIGGER] ok scanned=${res.scanned} assessed=${res.assessed} affected=${res.affected}`);
      for (const a of res.adapters || []) console.log(`  适配器 ${a.key}: scanned=${a.scanned} assessed=${a.assessed} deducted=${a.deducted} affected=${a.affected}`);
    } else {
      console.log(`[TRIGGER] 未执行: ${res && (res.reason || 'unknown')}`);
    }
  }

  // after 快照 + 断言
  console.log('==============================================');
  console.log(' 守卫断言对比');
  console.log('==============================================');
  let allPass = true;
  for (const cyc of CYCLES) {
    const m = cycleMeta[cyc.code];
    if (!m) continue;
    const afterDeduction = await snapshotDeduction(m.id);
    const afterRules = {};
    for (const rc of RULES) afterRules[rc] = await snapshotRule(rc);

    const inWin = before[cyc.code].windowIn;
    for (const rc of RULES) {
      const b = before[cyc.code].rules[rc];
      const a = afterRules[rc];
      const bCycle = b ? b.last_run_cycle_id : null;
      const aCycle = a ? a.last_run_cycle_id : null;
      let verdict;
      if (inWin) {
        // 当月窗口内：应写入该周期
        verdict = aCycle === m.id ? 'PASS(写入当月)' : `FAIL(期望=${m.id} 实际=${aCycle})`;
      } else {
        // 已结束：不应覆写
        verdict = aCycle === bCycle ? 'PASS(未覆写)' : `FAIL(被覆写为 ${aCycle}，原 ${bCycle})`;
      }
      if (verdict.startsWith('FAIL')) allPass = false;
      console.log(`[${verdict}] ${cyc.code} 规则 ${rc}: before_cycle=${bCycle} after_cycle=${aCycle}`);
      if (b) console.log(`   before: ${b.last_run_summary} @ ${b.last_run_at}`);
      if (a) console.log(`   after : ${a.last_run_summary} @ ${a.last_run_at}`);
    }
    const parityOk = afterDeduction === before[cyc.code].deductionRows;
    if (!parityOk) allPass = false;
    console.log(`[${parityOk ? 'PASS' : 'FAIL'}] ${cyc.code} 扣分表 parity: ${before[cyc.code].deductionRows} → ${afterDeduction} 行`);
  }

  console.log('==============================================');
  console.log(` 守卫结论: ${allPass ? 'GREEN（全部符合预期）' : 'RED（存在异常，见上）'}`);
  console.log('==============================================');
  process.exit(allPass ? 0 : 2);
}

main().catch((e) => {
  console.error('[ERROR] 验证脚本异常:', e && e.stack || e);
  process.exit(2);
});
