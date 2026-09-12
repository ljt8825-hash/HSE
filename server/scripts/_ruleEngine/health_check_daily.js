/**
 * 提示词-11 任务 C：每日健康检查脚本（只读、可重复执行、零写入）
 *
 * 输出一份健康报告，退出码：
 *   0 = 全绿；1 = 有 WARN；2 = 有 ERROR
 *
 * 检查项：
 *   1. 当月周期存在性 + 窗口本地边界（发现 UTC 偏移报 WARN）
 *   2. 当月 targets 行数与周期 target_count 一致性
 *   3. 对当月周期 dryRun 跑 runCycleAutoDeductions，打印各适配器 scanned/assessed/intents/revocations，
 *      并断言 dryRun 前后扣分表 count 快照一致（零写入）
 *   4. 规则观测：R000001 / VIOLATION003 最近执行周期/摘要/时间，提示"今天是否已跑过"
 *
 * 用法（运维）：
 *   node server/scripts/_ruleEngine/health_check_daily.js        # 用退出码驱动告警
 *   node server/scripts/_ruleEngine/health_check_daily.js || echo "健康异常"
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const { pool, testConnection, isConnected } = require('../../config/db');
const engine = require('../../services/ruleEngine/engine');

const SH = 'Asia/Shanghai';
let exitCode = 0;
function warn(msg) { exitCode = Math.max(exitCode, 1); console.log(`[WARN]  ${msg}`); }
function err(msg) { exitCode = Math.max(exitCode, 2); console.log(`[ERROR] ${msg}`); }
function ok(msg) { console.log(`[OK]    ${msg}`); }
function info(msg) { console.log(`[INFO]  ${msg}`); }

async function q1(sql, params) {
  const r = await pool.query(sql, params || []);
  return r.rows;
}

async function main() {
  await testConnection();
  if (!isConnected()) { err('未连接数据库（memory-mode）'); process.exit(2); }

  console.log('==============================================');
  console.log(' HSE 考核引擎 · 每日健康检查');
  console.log(` 运行时刻(本地): ${new Date().toLocaleString('zh-CN', { timeZone: SH })}`);
  console.log('==============================================');

  // 1) 当月周期（按 Asia/Shanghai 当前 YYYYMM 定位）
  const ymRow = await q1(`SELECT to_char(NOW() AT TIME ZONE '${SH}','YYYYMM') AS ym`);
  const ym = ymRow[0].ym;
  const cycleCode = `HSE-CYCLE-${ym}`;
  info(`定位当月周期 code = ${cycleCode}`);

  const cyc = await q1(
    `SELECT id, cycle_code, status, target_count,
            to_char(start_time AT TIME ZONE '${SH}','YYYY-MM-DD HH24:MI:SS') AS st,
            to_char(end_time   AT TIME ZONE '${SH}','YYYY-MM-DD HH24:MI:SS') AS et,
            to_char(start_time AT TIME ZONE '${SH}','HH24:MI:SS') AS st_t,
            to_char(end_time   AT TIME ZONE '${SH}','HH24:MI:SS') AS et_t
       FROM hse_assessment_cycle WHERE cycle_code=$1 AND is_deleted=FALSE`,
    [cycleCode]
  );

  let cycleId = null;
  if (!cyc.length) {
    warn(`当月周期 ${cycleCode} 不存在（调度将于每月1日 00:30 自动确保；停机/未跑时用 _create_cycle_YYYYMM.js 手工补建）`);
  } else {
    const c = cyc[0];
    cycleId = c.id;
    ok(`当月周期存在: id=${c.id} ${c.cycle_code} status=${c.status} target_count=${c.target_count}`);
    ok(`窗口: ${c.st} ~ ${c.et}`);
    if (c.st_t !== '00:00:00' || c.et_t !== '23:59:59') {
      warn(`窗口边界非本地午夜（st=${c.st_t} et=${c.et_t}），疑似 UTC 偏移缺陷 —— 见执行报告-11`);
    } else {
      ok('窗口边界为本地 00:00:00 ~ 23:59:59（无 UTC 偏移）');
    }

    // 2) targets 一致性
    const t = await q1(`SELECT COUNT(*)::int AS n FROM hse_assessment_target WHERE cycle_id=$1 AND is_deleted=FALSE`, [c.id]);
    const n = t[0].n;
    if (n !== Number(c.target_count)) {
      warn(`targets 行数(${n}) 与周期 target_count(${c.target_count}) 不一致`);
    } else {
      ok(`targets 行数(${n}) 与 target_count 一致`);
    }
  }

  // 3) 当月周期 dryRun 扣分演练（零写入断言）
  if (cycleId != null) {
    const before = await q1(
      `SELECT COUNT(*)::int AS n FROM hse_assessment_deduction WHERE cycle_id=$1 AND is_deleted=FALSE`,
      [cycleId]
    );
    const beforeN = before[0].n;
    info(`dryRun 前扣分表快照: ${beforeN} 行`);
    const res = await engine.runCycleAutoDeductions(cycleId, { dryRun: true });
    if (!res.ok) {
      warn(`dryRun 未执行: ${res.reason || 'unknown'}（不影响库内数据）`);
    } else {
      for (const a of res.adapters || []) {
        ok(`适配器 ${a.key}: scanned=${a.scanned} assessed=${a.assessed} deducted=${a.deducted} affected=${a.affected}`);
      }
      // 明细 action：inserted=扣分意图落地、removed=撤销意图落地（明细不带 key，按全局统计）
      const intents = (res.details || []).filter((d) => d.action === 'inserted').length;
      const revokes = (res.details || []).filter((d) => d.action === 'removed').length;
      const cappedOut = (res.details || []).filter((d) => d.action === 'capped-out').length;
      info(`dryRun 汇总: scanned=${res.scanned} assessed=${res.assessed} affected=${res.affected} | 意图落地(intents)=${intents} 撤销(revocations)=${revokes} 钳制归零(capped-out)=${cappedOut}（不落库）`);
    }
    const after = await q1(
      `SELECT COUNT(*)::int AS n FROM hse_assessment_deduction WHERE cycle_id=$1 AND is_deleted=FALSE`,
      [cycleId]
    );
    const afterN = after[0].n;
    if (beforeN !== afterN) {
      err(`dryRun 违反零写入！扣分表 ${beforeN} → ${afterN}`);
    } else {
      ok(`dryRun 零写入断言通过：扣分表快照 ${beforeN} 行前后一致`);
    }
  } else {
    warn('无当月周期，跳过 dryRun 演练');
  }

  // 4) 规则观测
  const rules = await q1(
    `SELECT rule_code, last_run_cycle_id, last_run_summary,
            to_char(last_run_at AT TIME ZONE '${SH}','YYYY-MM-DD HH24:MI:SS') AS last_run_at,
            to_char(last_run_at AT TIME ZONE '${SH}','YYYY-MM-DD') AS last_run_date
       FROM hse_assessment_rule WHERE rule_code IN ('R000001','VIOLATION003') ORDER BY rule_code`
  );
  const today = ym.slice(0, 4) + '-' + ym.slice(4, 6) + '-' + new Date().toLocaleString('en-US', { timeZone: SH }).slice(8, 10);
  // 用 DB 取今天日期更稳妥：
  const todayRow = await q1(`SELECT to_char(NOW() AT TIME ZONE '${SH}','YYYY-MM-DD') AS d`);
  const todayStr = todayRow[0].d;
  for (const r of rules) {
    const ranToday = r.last_run_date === todayStr;
    const mark = r.last_run_at ? (ranToday ? '✅今日已跑' : '⚠️今日未跑') : '⚠️从未跑过';
    info(`规则 ${r.rule_code}: 最近周期=${r.last_run_cycle_id || '—'} 摘要=${r.last_run_summary || '—'} 时间=${r.last_run_at || '—'} ${mark}`);
    if (r.last_run_at && !ranToday) warn(`规则 ${r.rule_code} 今日尚未运行（last_run_at=${r.last_run_at}）`);
  }
  if (!rules.length) err('未查到 R000001 / VIOLATION003 规则观测行');

  console.log('==============================================');
  const verdict = exitCode === 0 ? '全绿 GREEN' : exitCode === 1 ? '有 WARN' : '有 ERROR';
  console.log(` 结论: ${verdict}（退出码 ${exitCode}）`);
  console.log('==============================================');
  process.exit(exitCode);
}

main().catch((e) => {
  console.error('[ERROR] 健康检查异常:', e && e.stack || e);
  process.exit(2);
});
