/**
 * 提示词-10 任务 A：应急补建 2026-09 考核周期（真实业务数据，唯一允许的业务写入）
 *
 * 行为：
 *   1. 调 scheduler.autoCreateAndSyncCycle(2026, 9)（幂等；重复执行安全）。
 *   2. 连库验证：周期行（code/status/窗口/target_count）、targets 数与 target_count 一致、
 *      与 8 月周期（HSE-CYCLE-202608）对象做差异比对（新增/减少人员）。
 *   3. 证明 9 月周期扣分/得分均为 0（今日 8/31 不对 9 月窗口跑引擎，仅做 SELECT 核验）。
 *   全程不调用引擎、不写入任何扣分/得分。
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const { pool, testConnection, isConnected } = require('../../config/db');
const scheduler = require('../../services/assessmentScheduler');

const YEAR = 2026;
const MONTH = 9;
const SEPT_CODE = `HSE-CYCLE-${YEAR}${String(MONTH).padStart(2, '0')}`;
const AUG_CODE = 'HSE-CYCLE-202608'; // 8 月周期（基线，target_count=56）

function pj(o) { return JSON.stringify(o); }

async function getCycle(code) {
  const r = await pool.query(
    `SELECT id, cycle_code, cycle_name, status, assessment_year, assessment_month,
            start_time, end_time, target_count, created_by_name, remark, is_deleted
       FROM hse_assessment_cycle WHERE cycle_code=$1`,
    [code]
  );
  return r.rows[0] || null;
}

async function getTargets(cycleId) {
  const r = await pool.query(
    `SELECT employee_id, employee_name, position, township, department
       FROM hse_assessment_target WHERE cycle_id=$1 AND is_deleted=FALSE`,
    [cycleId]
  );
  return r.rows;
}

(async () => {
  await testConnection();
  if (!isConnected()) { console.error('DB 未连接，退出'); process.exit(1); }

  console.log('===== 1) 创建/同步 2026-09 周期（幂等）=====');
  const created = await scheduler.autoCreateAndSyncCycle(YEAR, MONTH);
  console.log('  autoCreateAndSyncCycle 返回:', pj(created));

  const sept = await getCycle(SEPT_CODE);
  if (!sept) { console.error('  创建后仍未查到 9 月周期，异常'); process.exit(2); }
  console.log('  周期行:', pj({
    id: sept.id, code: sept.cycle_code, status: sept.status,
    window: [sept.start_time, sept.end_time],
    target_count: sept.target_count, created_by: sept.created_by_name,
  }));

  console.log('\n===== 2) target 数一致性 + 与 8 月对象差异 =====');
  const septTargets = await getTargets(sept.id);
  console.log(`  9 月 targets 行数=${septTargets.length}  vs 周期 target_count=${sept.target_count}  → ${septTargets.length === sept.target_count ? '一致✅' : '不一致⚠️'}`);

  const aug = await getCycle(AUG_CODE);
  if (aug) {
    const augTargets = await getTargets(aug.id);
    const septMap = new Map(septTargets.map((t) => [t.employee_id, t]));
    const augMap = new Map(augTargets.map((t) => [t.employee_id, t]));
    const added = septTargets.filter((t) => !augMap.has(t.employee_id));
    const removed = augTargets.filter((t) => !septMap.has(t.employee_id));
    console.log(`  8 月周期 id=${aug.id} targets=${augTargets.length}`);
    console.log(`  新增人员(${added.length}):`, added.map((t) => `${t.employee_name}(${t.employee_id}/${t.position})`).join('; ') || '无');
    console.log(`  减少人员(${removed.length}):`, removed.map((t) => `${t.employee_name}(${t.employee_id}/${t.position})`).join('; ') || '无');
    if (added.length || removed.length) {
      console.log('  （属人员正常变动则说明；若差异异常请人工复核白名单）');
    }
  } else {
    console.log('  未找到 8 月周期，跳过差异比对');
  }

  console.log('\n===== 3) 9 月周期扣分/得分均为 0 证明 =====');
  const ded = await pool.query(
    `SELECT COUNT(*)::int AS n, COALESCE(SUM(suggested_score),0) AS score
       FROM hse_assessment_deduction WHERE cycle_id=$1 AND is_deleted=FALSE`,
    [sept.id]
  );
  const dedRow = ded.rows[0];
  const score = await pool.query(
    `SELECT COUNT(*)::int AS n_nonzero
       FROM hse_assessment_target WHERE cycle_id=$1 AND is_deleted=FALSE
         AND COALESCE(score_total,0) <> 0`,
    [sept.id]
  );
  console.log(`  hse_assessment_deduction(9月): 行数=${dedRow.n} 扣分合计=${dedRow.score}  → ${Number(dedRow.n) === 0 ? '零扣分✅' : '存在扣分⚠️'}`);
  console.log(`  hse_assessment_target(9月) 非零分对象数=${score.rows[0].n_nonzero}  → ${Number(score.rows[0].n_nonzero) === 0 ? '零得分✅' : '存在得分⚠️'}`);

  console.log('\n===== SUMMARY =====');
  console.log(pj({
    septCycleId: sept.id,
    septCode: SEPT_CODE,
    status: sept.status,
    window: [String(sept.start_time), String(sept.end_time)],
    targetCount: sept.target_count,
    targetsMatch: septTargets.length === sept.target_count,
    deductionCount: Number(dedRow.n),
    zeroScoreTargets: Number(score.rows[0].n_nonzero),
    idempotent: created.skipped === 'cycle-exists' || created.ok === true,
  }));

  process.exit(0);
})().catch((e) => { console.error('CREATE ERROR', e && e.stack || e); process.exit(2); });
