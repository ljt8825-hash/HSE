/**
 * 提示词-16 任务 C.5：修正版重启后验证脚本（可重复、只读快照 + 幂等真实触发）
 *
 * 相对 _post_restart_verify_20260831.js 的关键修正：
 *   旧脚本先触发两个周期、最后才快照断言 —— 在 9/1 场景下 runCycleAutoDeductions(43)
 *   会合法地把全部规则观测写成 43，使 cycle24 的「未覆写」断言假阳性 FAIL。
 *   本脚本改为「每触发一个周期立即快照并断言」：
 *     1. S0 快照（规则观测 + 两周期扣分行数）
 *     2. 真实触发 runCycleAutoDeductions(24) → 立即 S1 快照并断言（守卫阻止覆写）
 *     3. 真实触发 runCycleAutoDeductions(43) → 立即 S2 快照并断言（守卫写入当月）
 *   断言对窗口做动态判定：now∈窗口→期望写入该周期；now∉窗口→期望不覆写。
 *   因此无论 9/1 还是 8/31 执行都能给出正确结论，无假阳性。
 *
 * 用法（仅限重启后、维护窗口 2026-09-01 ~ 2026-10-01 内执行）：
 *   node server/scripts/_ruleEngine/_post_restart_verify_20260901.js
 *
 * 守卫语义（提示词-14）：仅当 now ∈ [start_time, end_time] 才写 last_run_*。
 *   - 已结束周期（now 不在窗口）→ 真实触发也只补扣、不覆写 last_run_*（扣分 parity 不变）
 *   - 当月周期（now 在窗口）→ last_run_* 写入该周期
 * dryRun / 历史重跑同理不写。脚本本身零新增业务数据（真实触发只为验证守卫，affected 应为 0）。
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const { pool, testConnection, isConnected } = require('../../config/db');
const engine = require('../../services/ruleEngine/engine');

const SH = 'Asia/Shanghai';
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

function nowInWindow(m) {
  const s = m.start_time instanceof Date ? m.start_time : new Date(m.start_time);
  const e = m.end_time instanceof Date ? m.end_time : new Date(m.end_time);
  const now = new Date();
  return now >= s && now <= e;
}

async function snapRules() {
  const out = {};
  for (const rc of RULES) out[rc] = await snapshotRule(rc);
  return out;
}

function verdictPass(label) { return `PASS(${label})`; }
function verdictFail(msg) { return `FAIL(${msg})`; }

async function main() {
  await testConnection();
  if (!isConnected()) { console.error('[ERROR] 未连接数据库'); process.exit(2); }

  console.log('==============================================');
  console.log(' 提示词-16 · 修正版重启后验证包');
  console.log(` 运行时刻(本地): ${new Date().toLocaleString('zh-CN', { timeZone: SH })}`);
  console.log('==============================================');

  // 周期元信息
  const metaRows = await q1(
    `SELECT id, cycle_code, status,
            to_char(start_time AT TIME ZONE '${SH}','YYYY-MM-DD HH24:MI:SS') AS st,
            to_char(end_time   AT TIME ZONE '${SH}','YYYY-MM-DD HH24:MI:SS') AS et,
            start_time, end_time
       FROM hse_assessment_cycle
      WHERE cycle_code IN ('HSE-CYCLE-202608','HSE-CYCLE-202609') AND is_deleted=FALSE`
  );
  const meta = {};
  for (const m of metaRows) meta[m.cycle_code] = m;
  if (!meta['HSE-CYCLE-202608'] || !meta['HSE-CYCLE-202609']) {
    console.error('[ERROR] 未找到 HSE-CYCLE-202608 / HSE-CYCLE-202609，退出');
    process.exit(2);
  }
  const c24 = meta['HSE-CYCLE-202608'];
  const c43 = meta['HSE-CYCLE-202609'];
  const in24 = nowInWindow(c24);
  const in43 = nowInWindow(c43);
  console.log(`[META] cycle24 id=${c24.id} 窗口 ${c24.st}~${c24.et} now∈窗口=${in24}`);
  console.log(`[META] cycle43 id=${c43.id} 窗口 ${c43.st}~${c43.et} now∈窗口=${in43}`);

  // ---- S0：触发前快照 ----
  const S0rules = await snapRules();
  const S0 = {
    c24ded: await snapshotDeduction(c24.id),
    c43ded: await snapshotDeduction(c43.id),
  };
  console.log(`[S0] cycle24 扣分=${S0.c24ded}行  cycle43 扣分=${S0.c43ded}行`);
  for (const rc of RULES) {
    const r = S0rules[rc];
    console.log(`[S0] 规则 ${rc}: cycle=${r && r.last_run_cycle_id} ${r ? '@' + r.last_run_at : ''} ${r ? r.last_run_summary : ''}`);
  }

  let allPass = true;

  // ---- 触发 cycle24（宽限补跑场景）→ 立即 S1 并断言 ----
  console.log('----------------------------------------------');
  console.log(`[TRIGGER] runCycleAutoDeductions(${c24.id}) 真实运行（dryRun=false）`);
  const res24 = await engine.runCycleAutoDeductions(c24.id, { dryRun: false });
  if (res24 && res24.ok) {
    console.log(`[TRIGGER] ok scanned=${res24.scanned} assessed=${res24.assessed} affected=${res24.affected}`);
    for (const a of res24.adapters || []) console.log(`   适配器 ${a.key}: scanned=${a.scanned} assessed=${a.assessed} deducted=${a.deducted} affected=${a.affected}`);
  } else {
    console.log(`[TRIGGER] 未执行: ${res24 && (res24.reason || 'unknown')}`);
  }
  const S1rules = await snapRules();
  const S1 = { c24ded: await snapshotDeduction(c24.id), c43ded: await snapshotDeduction(c43.id) };
  console.log('--- 守卫断言：cycle24（宽限补跑，期望不覆写当月观测） ---');
  for (const rc of RULES) {
    const b = S0rules[rc], a = S1rules[rc];
    const bCycle = b ? b.last_run_cycle_id : null;
    const aCycle = a ? a.last_run_cycle_id : null;
    let verdict;
    if (!in24) {
      verdict = aCycle === bCycle ? verdictPass('守卫阻止覆写') : verdictFail(`被覆写为 ${aCycle}（原 ${bCycle}）`);
    } else {
      // 窗口内：期望写入该周期，且 last_run_at 刷新。
      // 补强原因：8/31 执行时 S0 的 cycle_id 本就是 24，只比 cycle_id 是 24→24 恒真（假阳性）；
      // 加 last_run_at 变化断言后，可区分「守卫放行并写入」与「守卫误拦截」，使该分支在任意日期均为强断言。
      const atChanged = !!(a && b) && a.last_run_at !== b.last_run_at;
      verdict = aCycle !== c24.id
        ? verdictFail(`期望 ${c24.id} 实 ${aCycle}`)
        : (atChanged
            ? verdictPass('窗口内写入')
            : verdictFail(`窗口内应写入但 last_run_at 未刷新（仍 ${b && b.last_run_at}），疑守卫误拦截`));
    }
    if (verdict.startsWith('FAIL')) allPass = false;
    console.log(`[${verdict}] 规则 ${rc}: S0_cycle=${bCycle} → S1_cycle=${aCycle}`);
    if (a) console.log(`   S1: ${a.last_run_summary} @ ${a.last_run_at}`);
  }
  const parity24 = S1.c24ded === S0.c24ded;
  if (!parity24) allPass = false;
  console.log(`[${parity24 ? 'PASS' : 'FAIL'}] cycle24 扣分表 parity: ${S0.c24ded} → ${S1.c24ded} 行`);

  // ---- 触发 cycle43（当月周期场景）→ 立即 S2 并断言 ----
  console.log('----------------------------------------------');
  console.log(`[TRIGGER] runCycleAutoDeductions(${c43.id}) 真实运行（dryRun=false）`);
  const res43 = await engine.runCycleAutoDeductions(c43.id, { dryRun: false });
  if (res43 && res43.ok) {
    console.log(`[TRIGGER] ok scanned=${res43.scanned} assessed=${res43.assessed} affected=${res43.affected}`);
    for (const a of res43.adapters || []) console.log(`   适配器 ${a.key}: scanned=${a.scanned} assessed=${a.assessed} deducted=${a.deducted} affected=${a.affected}`);
  } else {
    console.log(`[TRIGGER] 未执行: ${res43 && (res43.reason || 'unknown')}`);
  }
  const S2rules = await snapRules();
  const S2 = { c24ded: await snapshotDeduction(c24.id), c43ded: await snapshotDeduction(c43.id) };
  console.log('--- 守卫断言：cycle43（当月周期，期望写入当月观测） ---');
  for (const rc of RULES) {
    const a = S2rules[rc];
    const aCycle = a ? a.last_run_cycle_id : null;
    const prevCycle = S1rules[rc] ? S1rules[rc].last_run_cycle_id : null;
    let verdict;
    if (in43) {
      // 同 cycle24：加 last_run_at 刷新断言，避免「刚好本就是该周期」造成的假阳性
      const atChanged = !!(a && S1rules[rc]) && a.last_run_at !== S1rules[rc].last_run_at;
      verdict = aCycle !== c43.id
        ? verdictFail(`期望 ${c43.id} 实 ${aCycle}`)
        : (atChanged
            ? verdictPass('守卫写入当月')
            : verdictFail(`窗口内应写入但 last_run_at 未刷新（仍 ${S1rules[rc] && S1rules[rc].last_run_at}），疑守卫误拦截`));
    } else {
      // 窗口外：期望完全不写 —— cycle_id 不变 且 last_run_at 不刷新
      const atChanged = !!(a && S1rules[rc]) && a.last_run_at !== S1rules[rc].last_run_at;
      verdict = (aCycle === prevCycle && !atChanged)
        ? verdictPass('窗口外未覆写')
        : verdictFail(atChanged
            ? `守卫未拦截：last_run_at 由 ${S1rules[rc] && S1rules[rc].last_run_at} 刷新为 ${a && a.last_run_at}`
            : `被覆写为 ${aCycle}（前 ${prevCycle}）`);
    }
    if (verdict.startsWith('FAIL')) allPass = false;
    console.log(`[${verdict}] 规则 ${rc}: S1_cycle=${prevCycle} → S2_cycle=${aCycle}`);
    if (a) console.log(`   S2: ${a.last_run_summary} @ ${a.last_run_at}`);
  }
  const parity43 = S2.c43ded === S0.c43ded;
  if (!parity43) allPass = false;
  console.log(`[${parity43 ? 'PASS' : 'FAIL'}] cycle43 扣分表 parity: ${S0.c43ded} → ${S2.c43ded} 行`);

  console.log('==============================================');
  console.log(` 守卫结论: ${allPass ? 'GREEN（全部符合预期）' : 'RED（存在异常，见上）'}`);
  console.log('==============================================');
  process.exit(allPass ? 0 : 2);
}

main().catch((e) => {
  console.error('[ERROR] 验证脚本异常:', e && e.stack || e);
  process.exit(2);
});
