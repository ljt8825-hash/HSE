/**
 * P2-B1-E-08-04-R4-FIX-SYNC-EMPLOYMENT-GATE 自动化回归测试（DEV：safety_dashboard_dev）
 *
 * 覆盖（SYNC-EMPLOYMENT-GATE 规格 §六/§七/§八）：
 *   A  正式员工 → eligible=true
 *   B  辞职 → eligible=false（且前置证明其 relation_status 仍='active'，仅被本门禁拦截）
 *   C  死亡 → eligible=false
 *   D  NULL → eligible=false
 *   E  6702（确认责任人 sole_target）→ 仍进入（confirmed 分支未被本门禁破坏）
 *   F  津城 16 名 confirmed subordinate → 不外溢进入
 *   G  生产同构场景：辞职管理员/辞职经理/正式员工管理员/正式员工经理 + 死亡/NULL/其他值
 *   §七 同步前后差异 + 不重复创建 + 重复执行幂等
 *   §八 scheduler sync = manual syncTargets = startCycle 三入口资格一致性
 *   §九 历史数据保护：核心业务表行数快照，仅本脚本自建数据可变
 *
 * 运行：node scripts/p2b1e0804syncgate_tests.cjs
 * 清理：脚本结束自动清理全部自建数据（employee/assignment/cycle/target/audit）。
 */
process.env.DB_NAME = 'safety_dashboard_dev';
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

const db = require('../config/db');
const { pool } = db;
const scheduler = require('../services/assessmentScheduler');
const targetService = require('../services/assessmentMonthlyTargetService');
const cycleService = require('../services/assessmentMonthlyCycleService');
const { TABLES } = require('../services/assessmentMonthlyShared');

const MARK = 'SYNC-GATE-TEST';
const YEAR = 2026, MONTH = 9;

let pass = 0, fail = 0;
const fails = [];
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✔ ${name}`); }
  else { fail++; fails.push(name + (extra ? ` :: ${extra}` : '')); console.log(`  ✘ ${name}${extra ? ' :: ' + extra : ''}`); }
}
const q = (sql, params) => pool.query(sql, params);

const state = { empIds: [], assignIds: [], cycleIds: [], targetIds: [] };

async function boot() {
  await db.testConnection();
  if (!db.isConnected()) throw new Error('DEV 数据库连接失败');
  console.log('DEV 库已连接:', process.env.DB_NAME);
}

async function countOf(table, where = 'TRUE') {
  const r = await q(`SELECT count(*)::int AS n FROM ${table} WHERE ${where}`);
  return r.rows[0].n;
}

// ---------- 测试数据构造 ----------

async function createTestEmployee(label, employmentRelation, positionName, orgId, positionId) {
  const r = await q(
    `INSERT INTO employee (employee_code, name, employment_relation, is_deleted)
     VALUES ($1, $2, $3, FALSE) RETURNING id`,
    [`TSTGATE-${label}`, `${MARK}-${label}`, employmentRelation]
  );
  const empId = Number(r.rows[0].id);
  state.empIds.push(empId);
  const a = await q(
    `INSERT INTO employee_assignment
       (employee_id, org_unit_id, position_id, is_current, status, is_primary,
        start_date, end_date, is_deleted, dept_name, remark)
     VALUES ($1, $2, $3, TRUE, 'active', TRUE, '2026-01-01', NULL, FALSE, $4, $5)
     RETURNING id`,
    [empId, orgId, positionId, `${MARK}组织`, `${MARK} 指派`]
  );
  state.assignIds.push(Number(a.rows[0].id));
  return empId;
}

async function setup() {
  // 前置 P1：6702 在 DEV 为正式员工且有现职指派（confirmed 分支可用性）
  const yxn = await q(
    `SELECT e.employment_relation, v.relation_status
       FROM employee e LEFT JOIN v_employee_org_full v ON v.employee_id = e.id
      WHERE e.id = 6702 AND e.is_deleted = FALSE LIMIT 1`);
  check('前置: 6702 存在且为正式员工', yxn.rows.length === 1 && yxn.rows[0].employment_relation === '正式员工',
    JSON.stringify(yxn.rows[0] || null));

  // 前置 P2：confirmed_relations 配置含 6702
  const cfg = await q(
    `SELECT setting_value FROM system_settings WHERE setting_key = 'assessment.confirmed_responsibility_targets' LIMIT 1`);
  let has6702 = false;
  try {
    const j = JSON.parse(cfg.rows[0].setting_value);
    has6702 = (j.confirmed_relations || []).some((r) => Number(r.responsible_employee_id) === 6702);
  } catch (e) { /* fail below */ }
  check('前置: confirmed_relations 配置含 6702', has6702);

  // 前置 P3：组织/岗位锚点
  const org = await q(
    `SELECT id FROM hse_org_unit WHERE org_type='town_center' AND is_deleted=FALSE ORDER BY id LIMIT 1`);
  check('前置: town_center 组织存在', org.rows.length === 1);
  const orgId = Number(org.rows[0].id);
  const posMgr = await q(`SELECT id FROM position WHERE name='乡镇作业中心经理' AND is_deleted=FALSE ORDER BY id LIMIT 1`);
  const posAdmin = await q(`SELECT id FROM position WHERE name='管理员' AND is_deleted=FALSE ORDER BY id LIMIT 1`);
  check('前置: 岗位锚点存在(经理/管理员)', posMgr.rows.length === 1 && posAdmin.rows.length === 1);

  // 16 名确认下属清单（用于隔离验证 F）
  const subs = await q(
    `SELECT (rel->>'subordinate_employee_ids') AS ids
       FROM system_settings s,
            jsonb_array_elements((s.setting_value::jsonb)->'confirmed_relations') rel
      WHERE s.setting_key='assessment.confirmed_responsibility_targets'
        AND (rel->>'responsible_employee_id')='6702' LIMIT 1`);
  const subIds = subs.rows.length ? JSON.parse(subs.rows[0].ids).map(Number) : [];
  check('前置: 6702 下属清单非空', subIds.length === 16, `n=${subIds.length}`);

  // 基线快照（历史数据保护 §九）
  state.baseline = {
    employee: await countOf('employee'),
    assignment: await countOf('employee_assignment'),
    vr: await countOf('violation_records'),
    deduction: await countOf('hse_assessment_deduction'),
    targetAll: await countOf('hse_assessment_target'),
    cycleAll: await countOf('hse_assessment_cycle'),
  };

  // 生产同构场景 G：7 名测试人员（含 A-G 资格矩阵）
  state.eFormalMgr = await createTestEmployee('FORMAL-MGR', '正式员工', '乡镇作业中心经理', orgId, Number(posMgr.rows[0].id));
  state.eResignedMgr = await createTestEmployee('RESIGN-MGR', '辞职', '乡镇作业中心经理', orgId, Number(posMgr.rows[0].id));
  state.eDeceasedMgr = await createTestEmployee('DECEASE-MGR', '死亡', '乡镇作业中心经理', orgId, Number(posMgr.rows[0].id));
  state.eFormalAdm = await createTestEmployee('FORMAL-ADM', '正式员工', '管理员', orgId, Number(posAdmin.rows[0].id));
  state.eResignedAdm = await createTestEmployee('RESIGN-ADM', '辞职', '管理员', orgId, Number(posAdmin.rows[0].id));
  state.eNullAdm = await createTestEmployee('NULL-ADM', null, '管理员', orgId, Number(posAdmin.rows[0].id));
  state.eOtherAdm = await createTestEmployee('OTHER-ADM', '劳务派遣', '管理员', orgId, Number(posAdmin.rows[0].id));

  // 三个测试周期：A=scheduler 路径 / B=手工 syncTargets 路径 / C=startCycle 路径
  for (const [tag, status] of [['A', 'in_progress'], ['B', 'in_progress'], ['C', 'not_started']]) {
    const c = await q(
      `INSERT INTO hse_assessment_cycle
         (cycle_code, cycle_name, cycle_type, assessment_year, assessment_month,
          start_time, end_time, status, created_by_name, remark)
       VALUES ($1, $2, 'monthly', $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [`HSE-CYCLE-TSTGATE-${tag}-${Date.now()}`, `${MARK} 周期${tag}`, YEAR, MONTH,
       new Date(YEAR, MONTH - 1, 1), new Date(YEAR, MONTH, 0, 23, 59, 59, 999), status, MARK, MARK]
    );
    state.cycleIds.push({ tag, id: Number(c.rows[0].id) });
  }

  // 前置证明（事故场景还原）：辞职人员的视图 relation_status 仍为 'active'
  for (const [label, id] of [['辞职经理', state.eResignedMgr], ['辞职管理员', state.eResignedAdm]]) {
    const v = await q(
      `SELECT relation_status FROM v_employee_org_full WHERE employee_id=$1 AND is_current=TRUE LIMIT 1`, [id]);
    check(`事故场景还原: ${label} 视图 relation_status='active'（修复前会被纳入）`,
      v.rows.length === 1 && v.rows[0].relation_status === 'active', JSON.stringify(v.rows[0] || null));
  }
}

async function targetsOf(cycleId) {
  const r = await q(
    `SELECT employee_id::int AS eid, employee_name, position FROM hse_assessment_target
      WHERE cycle_id=$1 AND is_deleted=FALSE ORDER BY employee_id`, [cycleId]);
  return r.rows;
}

// ---------- 主测试 ----------

async function runTests() {
  const cyA = state.cycleIds.find((c) => c.tag === 'A').id;
  const cyB = state.cycleIds.find((c) => c.tag === 'B').id;
  const cyC = state.cycleIds.find((c) => c.tag === 'C').id;

  // ===== §六 A/B/C/D + §八 scheduler 路径 =====
  console.log('\n[SCHEDULER_GATE] scheduler.syncAssessmentTargets（CY-A）');
  const r1 = await scheduler.syncAssessmentTargets(cyA);
  check('scheduler 同步执行成功', typeof r1.inserted === 'number' && r1.inserted > 0, JSON.stringify(r1));

  const tA = await targetsOf(cyA);
  const idsA = new Set(tA.map((t) => t.eid));

  check('A 正式员工经理 → 进入', idsA.has(state.eFormalMgr));
  check('A 正式员工管理员 → 进入', idsA.has(state.eFormalAdm));
  check('B 辞职经理 → 阻断', !idsA.has(state.eResignedMgr));
  check('B 辞职管理员 → 阻断', !idsA.has(state.eResignedAdm));
  check('C 死亡经理 → 阻断', !idsA.has(state.eDeceasedMgr));
  check('D NULL employment_relation → 阻断', !idsA.has(state.eNullAdm));
  check('D 其他非正式员工值(劳务派遣) → 阻断', !idsA.has(state.eOtherAdm));

  // 白名单本身不回归：真实在册经理/管理员/网格长仍可进入（总量合理性）
  check('白名单不回归: 同步结果含真实在册白名单人员（总数>测试人员数）',
    tA.length > 7, `total=${tA.length}`);

  // ===== §六 E/F =====
  console.log('\n[CONFIRMED_GATE] 6702 与 16 名下属隔离');
  check('E 6702 确认责任人(mode=sole_target) → 进入', idsA.has(6702));
  const yxnRow = tA.find((t) => t.eid === 6702);
  if (yxnRow) {
    check('E 6702 进入路径非岗位白名单（确认责任关系资格）',
      yxnRow.position !== '乡镇作业中心经理' && !(yxnRow.position === '管理员'), `position=${yxnRow.position}`);
  }
  const subHit = [];
  const subs = await q(
    `SELECT (rel->>'subordinate_employee_ids') AS ids
       FROM system_settings s,
            jsonb_array_elements((s.setting_value::jsonb)->'confirmed_relations') rel
      WHERE s.setting_key='assessment.confirmed_responsibility_targets'
        AND (rel->>'responsible_employee_id')='6702' LIMIT 1`);
  const subIds = subs.rows.length ? JSON.parse(subs.rows[0].ids).map(Number) : [];
  for (const sid of subIds) if (idsA.has(sid)) subHit.push(sid);
  check('F 16 名 confirmed subordinate 零外溢', subHit.length === 0, `leaked=${JSON.stringify(subHit)}`);

  // ===== §七 差异 + 幂等 =====
  console.log('\n[IDEMPOTENCY] 重复执行幂等');
  const countAfterFirst = tA.length;
  const r2 = await scheduler.syncAssessmentTargets(cyA);
  const tA2 = await targetsOf(cyA);
  check('第二次同步 inserted=0 且 removed=0', r2.inserted === 0 && r2.removed === 0, JSON.stringify(r2));
  check('第二次同步后对象数不变（无重复创建）', tA2.length === countAfterFirst,
    `${countAfterFirst} -> ${tA2.length}`);
  const dupCheck = await q(
    `SELECT employee_id, count(*)::int AS n FROM hse_assessment_target
      WHERE cycle_id=$1 AND is_deleted=FALSE GROUP BY employee_id HAVING count(*) > 1 LIMIT 1`, [cyA]);
  check('无同周期重复对象行', dupCheck.rows.length === 0);

  // ===== §八 三入口一致性 =====
  console.log('\n[SCHEDULER_GATE vs MANUAL_SYNC] 手工 syncTargets（CY-B）');
  const user = { id: null, name: MARK, role: 'tester', ip: '127.0.0.1' };
  const rB = await targetService.syncTargets(user, cyB);
  check('手工 syncTargets 执行成功', rB.__t === 'json', JSON.stringify(rB).slice(0, 200));
  const tB = await targetsOf(cyB);
  const idsB = new Set(tB.map((t) => t.eid));
  const sameAB = idsA.size === idsB.size && [...idsA].every((x) => idsB.has(x));
  check('§八 scheduler sync = manual syncTargets（对象集合一致）', sameAB,
    `A=${idsA.size} B=${idsB.size}`);
  check('§八 手工路径同样阻断辞职/死亡/NULL',
    !idsB.has(state.eResignedMgr) && !idsB.has(state.eResignedAdm) &&
    !idsB.has(state.eDeceasedMgr) && !idsB.has(state.eNullAdm) && !idsB.has(state.eOtherAdm));

  console.log('\n[SCHEDULER_GATE vs START_CYCLE] startCycle（CY-C）');
  const rC = await cycleService.startCycle(user, cyC);
  check('startCycle 执行成功', rC.__t === 'json', JSON.stringify(rC).slice(0, 200));
  const tC = await targetsOf(cyC);
  const idsC = new Set(tC.map((t) => t.eid));
  const sameAC = idsA.size === idsC.size && [...idsA].every((x) => idsC.has(x));
  check('§八 scheduler sync = startCycle（对象集合一致）', sameAC,
    `A=${idsA.size} C=${idsC.size}`);

  // ===== addTargets（手动添加入口）门禁 =====
  console.log('\n[MANUAL_ADD_GATE] addTargets 手动添加');
  // 新建一名正式管理员（同步已跑完，故不在 CY-B 现有对象中）
  const org = await q(`SELECT id FROM hse_org_unit WHERE org_type='town_center' AND is_deleted=FALSE ORDER BY id LIMIT 1`);
  const posAdmin = await q(`SELECT id FROM position WHERE name='管理员' AND is_deleted=FALSE ORDER BY id LIMIT 1`);
  const eNew = await createTestEmployee('FORMAL-ADM2', '正式员工', '管理员', Number(org.rows[0].id), Number(posAdmin.rows[0].id));
  const rAdd = await targetService.addTargets(user, cyB, { employee_ids: [state.eResignedAdm, eNew] });
  check('addTargets 执行成功', rAdd.__t === 'json', JSON.stringify(rAdd).slice(0, 200));
  const added = rAdd.payload ? (rAdd.payload.added ?? JSON.parse(JSON.stringify(rAdd.payload)).added) : null;
  check('addTargets: 辞职人员被阻断、正式员工可加入（added=1）', added === 1, `added=${added}`);
  const afterAdd = await targetsOf(cyB);
  const idsAfterAdd = new Set(afterAdd.map((t) => t.eid));
  check('addTargets: 辞职管理员未进入 CY-B', !idsAfterAdd.has(state.eResignedAdm));
  check('addTargets: 新正式管理员进入 CY-B', idsAfterAdd.has(eNew));

  // ===== §九 历史数据保护 =====
  console.log('\n[HISTORY_PROTECTION] 核心表行数快照对比');
  const b = state.baseline;
  const post = {
    employee: await countOf('employee'),
    assignment: await countOf('employee_assignment'),
    vr: await countOf('violation_records'),
    deduction: await countOf('hse_assessment_deduction'),
  };
  check('violation_records 零变化', post.vr === b.vr, `${b.vr} -> ${post.vr}`);
  check('hse_assessment_deduction 零变化', post.deduction === b.deduction, `${b.deduction} -> ${post.deduction}`);
  check('employee 增量恰为自建测试人员(8)', post.employee - b.employee === 8, `${b.employee} -> ${post.employee}`);
  check('employee_assignment 增量恰为自建指派(8)', post.assignment - b.assignment === 8, `${b.assignment} -> ${post.assignment}`);
}

// ---------- 清理 ----------
// 注意：hse_assessment_audit_log 为 INSERT-only（触发器禁止 UPDATE/DELETE），
// 测试产生的审计行（operator_name=SYNC-GATE-TEST）按设计留存，作为可追溯记录，不做清理。

async function deleteCycleData(cycleId) {
  await q(`DELETE FROM hse_assessment_deduction WHERE cycle_id=$1`, [cycleId]);
  await q(`DELETE FROM hse_assessment_target WHERE cycle_id=$1`, [cycleId]);
  await q(`DELETE FROM hse_assessment_cycle WHERE id=$1`, [cycleId]);
}

/** 清扫历次运行残留（幂等）：仅精确匹配本脚本标记的数据 */
async function cleanupResidual() {
  const cycles = await q(`SELECT id FROM hse_assessment_cycle WHERE remark=$1`, [MARK]);
  for (const c of cycles.rows) await deleteCycleData(Number(c.id));
  await q(`DELETE FROM employee_assignment WHERE employee_id IN (SELECT id FROM employee WHERE employee_code LIKE 'TSTGATE-%')`);
  await q(`DELETE FROM employee WHERE employee_code LIKE 'TSTGATE-%'`);
}

async function cleanup() {
  console.log('\n[CLEANUP] 清理自建测试数据');
  for (const c of state.cycleIds) await deleteCycleData(c.id);
  await q(`DELETE FROM employee_assignment WHERE employee_id = ANY($1::bigint[])`, [state.empIds]);
  await q(`DELETE FROM employee WHERE id = ANY($1::bigint[])`, [state.empIds]);
  // 复核
  const left1 = await q(`SELECT count(*)::int AS n FROM employee WHERE employee_code LIKE 'TSTGATE-%'`);
  const left2 = await q(`SELECT count(*)::int AS n FROM hse_assessment_cycle WHERE remark=$1`, [MARK]);
  console.log(`  残留检查: 测试员工=${left1.rows[0].n} 测试周期=${left2.rows[0].n}`);
  return left1.rows[0].n === 0 && left2.rows[0].n === 0;
}

// ---------- 入口 ----------

(async () => {
  let cleanOk = false;
  try {
    await boot();
    await cleanupResidual();
    await setup();
    await runTests();
  } catch (e) {
    fail++; fails.push(`FATAL: ${e.message}`);
    console.error('FATAL:', e);
  } finally {
    try { cleanOk = await cleanup(); } catch (e) { console.error('CLEANUP ERROR:', e.message); }
  }
  console.log('\n========== 结果 ==========');
  console.log(`PASS=${pass} FAIL=${fail} CLEANUP=${cleanOk ? 'OK' : 'INCOMPLETE'}`);
  if (fails.length) console.log('失败项:\n - ' + fails.join('\n - '));
  await pool.end();
  process.exit(fail === 0 && cleanOk ? 0 : 1);
})();
