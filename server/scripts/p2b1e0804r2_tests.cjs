/**
 * P2-B1-E-08-04-R2 自动化测试（DEV：safety_dashboard_dev）
 *
 * 覆盖（规格 §十一 21 用例 A-U）：
 *   A  单管理员（supervisor 唯一）            K  经理 → 仅本人
 *   B  多管理员 + supervisor 唯一匹配          L  LIVE + 规则有效期
 *   C  多管理员 + 无法唯一 → fail-closed       M  HISTORICAL_BACKFILL + 历史业务日期
 *   D  多经理 + 离职过滤后唯一匹配             N  scheduler 不得自动进入 backfill
 *   E  多经理 + supervisor 唯一匹配            O  pending deduction revoke → 即时恢复
 *   F  多经理 + 仍无法唯一 → fail-closed       P  approved deduction revoke → 即时恢复
 *   G  supervisor 指向无效人员                 Q  adjusted deduction revoke → 即时恢复
 *   H  跨组织 supervisor                       R  frozen cycle revoke → 当前得分立即正确
 *   I  保洁员 → 管理员+经理两目标              S  not_started cycle revoke → 当前得分立即正确
 *   J  管理员 → 管理员本人+经理                T  revoke 幂等 / U  revoke 并发安全
 *
 * 方法：resolver 级（直调 resolveTransmissionTargets，真实 DEV 数据动态取案例）
 *       + 引擎级（runCycleAdapters / revokeConfirmation，造数精确清理）。
 * 边界：零生产触碰；临时改 supervisor_id / 周期状态的造数在 finally 精确恢复。
 *
 * P2-B1-E-08-04-R4 语义更新（2026-09-14）：①有效口径=employment_relation='正式员工'；
 * ②经理直管=正式责任关系（RESOLVED，双身份去重单目标）；③跨组织有效 supervisor
 * （管理员槽位）= RESOLVED + crossOrg 证据（R4 §四 业务确认）；④G 用例改构造式
 * （R4 已修正全部 29 条同名错配，真实无效 supervisor 案例清零）。
 *
 * 运行：node scripts/p2b1e0804r2_tests.cjs
 */
process.env.DB_NAME = 'safety_dashboard_dev';
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

const db = require('../config/db');
const { pool } = db;
const fs = require('fs');
const path = require('path');
const { resolveTransmissionTargets } = require('../services/ruleEngine/violationTargetResolver');
const scoringEngine = require('../services/assessmentScoringEngine');
const candidateService = require('../services/gridViolationCandidateService');

const CYCLE_ID = 53; // 2026-05（历史周期：LIVE 应被规则有效期拦截，BACKFILL 放行）
const TEST_DATE = '2026-05-10';
const MARK = 'E0804R2测试';
let pass = 0, fail = 0;
const fails = [];
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✔ ${name}`); }
  else { fail++; fails.push(name + (extra ? ` :: ${extra}` : '')); console.log(`  ✘ ${name}${extra ? ' :: ' + extra : ''}`); }
}
const q = (sql, params) => pool.query(sql, params);
// R4 冻结口径（2026-09-14）：有效 ⇔ employment_relation='正式员工'（leave_date 不参与）
const VALID = `e.employment_relation = '正式员工'`;

const state = {
  vrIds: [], gvcIds: [], highWater: 0, auditBase: 0,
  rulesBefore: {}, conflictIds: [], targetIds: [], targetsBefore: {},
  supOverrides: [], cycleStatusBefore: null, createdTargetIds: [],
};

async function boot() {
  await db.testConnection();
  if (!db.isConnected()) throw new Error('DEV 数据库连接失败');
}

// ---------------- 案例查找（真实 DEV 数据，只读） ----------------

/** 链完整保洁员：保洁员→有效管理员(同组织,有target)→有效经理(同组织,有target) */
async function findChainCleaner() {
  const r = await q(
    `SELECT v.employee_id AS cleaner_id, v.name AS cleaner_name, v.org_name,
            a.employee_id AS admin_id, a.name AS admin_name,
            m.employee_id AS mgr_id, m.name AS mgr_name
       FROM v_employee_org_full v
       JOIN v_employee_org_full a ON a.employee_id = v.supervisor_id
        AND a.is_current=TRUE AND a.relation_status='active' AND a.is_deleted=FALSE
        AND a.position_name='管理员' AND a.org_name=v.org_name
       JOIN v_employee_org_full m ON m.employee_id = a.supervisor_id
        AND m.is_current=TRUE AND m.relation_status='active' AND m.is_deleted=FALSE
        AND m.position_name='乡镇作业中心经理' AND m.org_name=v.org_name
       JOIN employee e ON e.id=v.employee_id
       JOIN employee ea ON ea.id=a.employee_id
       JOIN employee em ON em.id=m.employee_id
       JOIN hse_assessment_target t1 ON t1.employee_id=a.employee_id AND t1.cycle_id=$1 AND t1.is_deleted=FALSE
       JOIN hse_assessment_target t2 ON t2.employee_id=m.employee_id AND t2.cycle_id=$1 AND t2.is_deleted=FALSE
      WHERE v.is_current=TRUE AND v.relation_status='active' AND v.is_deleted=FALSE
        AND v.position_name LIKE '%保洁%' AND ${VALID}
        AND ea.employment_relation = '正式员工'
        AND em.employment_relation = '正式员工'
      ORDER BY v.org_name LIMIT 1`, [CYCLE_ID]);
  return r.rows[0] || null;
}

/** 多管理员组织（有效口径 ≥2 管理员）里的链完整保洁员 → 用例 B */
async function findMultiAdminChainCleaner() {
  const r = await q(
    `WITH org_admins AS (
       SELECT v.org_name, COUNT(*)::int AS n
         FROM v_employee_org_full v JOIN employee e ON e.id=v.employee_id
        WHERE v.position_name='管理员' AND v.is_current=TRUE AND v.relation_status='active'
          AND v.is_deleted=FALSE AND ${VALID} GROUP BY v.org_name)
     SELECT x.*, (SELECT n FROM org_admins o WHERE o.org_name=x.org_name) AS admin_cnt
       FROM (
         SELECT v.org_name, v.employee_id AS cleaner_id, v.name AS cleaner_name,
                a.employee_id AS admin_id, m.employee_id AS mgr_id
           FROM v_employee_org_full v
           JOIN v_employee_org_full a ON a.employee_id=v.supervisor_id
            AND a.is_current=TRUE AND a.relation_status='active' AND a.is_deleted=FALSE
            AND a.position_name='管理员' AND a.org_name=v.org_name
           JOIN v_employee_org_full m ON m.employee_id=a.supervisor_id
            AND m.is_current=TRUE AND m.relation_status='active' AND m.is_deleted=FALSE
            AND m.position_name='乡镇作业中心经理' AND m.org_name=v.org_name
           JOIN employee e ON e.id=v.employee_id
           JOIN employee ea ON ea.id=a.employee_id
           JOIN employee em ON em.id=m.employee_id
          WHERE v.is_current=TRUE AND v.relation_status='active' AND v.is_deleted=FALSE
            AND v.position_name LIKE '%保洁%' AND ${VALID}
            AND ea.employment_relation = '正式员工'
            AND em.employment_relation = '正式员工'
       ) x
      WHERE (SELECT n FROM org_admins o WHERE o.org_name=x.org_name) >= 2
      LIMIT 1`, []);
  return r.rows[0] || null;
}

/** 单管理员组织的链完整保洁员 → 用例 A */
async function findSingleAdminChainCleaner() {
  const r = await q(
    `WITH org_admins AS (
       SELECT v.org_name, COUNT(*)::int AS n
         FROM v_employee_org_full v JOIN employee e ON e.id=v.employee_id
        WHERE v.position_name='管理员' AND v.is_current=TRUE AND v.relation_status='active'
          AND v.is_deleted=FALSE AND ${VALID} GROUP BY v.org_name)
     SELECT x.*, (SELECT n FROM org_admins o WHERE o.org_name=x.org_name) AS admin_cnt
       FROM (
         SELECT v.org_name, v.employee_id AS cleaner_id, a.employee_id AS admin_id, m.employee_id AS mgr_id
           FROM v_employee_org_full v
           JOIN v_employee_org_full a ON a.employee_id=v.supervisor_id
            AND a.is_current=TRUE AND a.relation_status='active' AND a.is_deleted=FALSE
            AND a.position_name='管理员' AND a.org_name=v.org_name
           JOIN v_employee_org_full m ON m.employee_id=a.supervisor_id
            AND m.is_current=TRUE AND m.relation_status='active' AND m.is_deleted=FALSE
            AND m.position_name='乡镇作业中心经理' AND m.org_name=v.org_name
           JOIN employee e ON e.id=v.employee_id
           JOIN employee ea ON ea.id=a.employee_id
           JOIN employee em ON em.id=m.employee_id
          WHERE v.is_current=TRUE AND v.relation_status='active' AND v.is_deleted=FALSE
            AND v.position_name LIKE '%保洁%' AND ${VALID}
            AND ea.employment_relation = '正式员工'
            AND em.employment_relation = '正式员工'
       ) x
      WHERE (SELECT n FROM org_admins o WHERE o.org_name=x.org_name) = 1
      LIMIT 1`, []);
  return r.rows[0] || null;
}

/** supervisor 有效但非管理员/非经理的保洁员 → 用例 C（管理员层 fail-closed） */
async function findNonAdminSupCleaner() {
  const r = await q(
    `SELECT v.employee_id AS cleaner_id, v.name AS cleaner_name, v.org_name,
            s.employee_id AS sup_id, s.name AS sup_name, s.position_name AS sup_pos
       FROM v_employee_org_full v
       JOIN v_employee_org_full s ON s.employee_id=v.supervisor_id
        AND s.is_current=TRUE AND s.relation_status='active' AND s.is_deleted=FALSE
       JOIN employee e ON e.id=v.employee_id
       JOIN employee e2 ON e2.id=v.supervisor_id
      WHERE v.is_current=TRUE AND v.relation_status='active' AND v.is_deleted=FALSE
        AND v.position_name LIKE '%保洁%' AND ${VALID}
        AND e2.employment_relation = '正式员工'
        AND s.position_name NOT IN ('管理员','乡镇作业中心经理')
      LIMIT 1`, []);
  return r.rows[0] || null;
}

/** supervisor 指向无效人员（辞职/死亡/有 leave_date）的保洁员 → 用例 G */
async function findInvalidSupCleaner() {
  const r = await q(
    `SELECT v.employee_id AS cleaner_id, v.name AS cleaner_name, v.org_name,
            s.name AS sup_name, e2.employment_relation AS sup_rel
       FROM v_employee_org_full v
       JOIN v_employee_org_full s ON s.employee_id=v.supervisor_id
        AND s.is_current=TRUE AND s.relation_status='active' AND s.is_deleted=FALSE
       JOIN employee e ON e.id=v.employee_id
       JOIN employee e2 ON e2.id=v.supervisor_id
      WHERE v.is_current=TRUE AND v.relation_status='active' AND v.is_deleted=FALSE
        AND v.position_name LIKE '%保洁%' AND ${VALID}
        AND NOT (e2.employment_relation = '正式员工')
      LIMIT 1`, []);
  return r.rows[0] || null;
}

/** 「有效经理恰 1 人」的组织 → 用例 D（链断回退 org-unique） */
async function findOrgWithUniqueValidManager() {
  const r = await q(
    `SELECT org_name, COUNT(*)::int AS n FROM (
       SELECT v.org_name FROM v_employee_org_full v JOIN employee e ON e.id=v.employee_id
        WHERE v.position_name='乡镇作业中心经理' AND v.is_current=TRUE
          AND v.relation_status='active' AND v.is_deleted=FALSE AND ${VALID}) t
      GROUP BY org_name HAVING COUNT(*)=1 AND COUNT(*) FILTER (WHERE org_name LIKE '%作业中心%')=1
      ORDER BY org_name LIMIT 1`, []);
  return r.rows[0] || null;
}

/** 多有效经理组织（环卫作业中心，2 人）→ 用例 F（链断回退 → AMBIGUOUS） */
async function findOrgWithMultipleValidManagers() {
  const r = await q(
    `SELECT v.org_name, COUNT(*)::int AS n, string_agg(v.name, ',') AS names
       FROM v_employee_org_full v JOIN employee e ON e.id=v.employee_id
      WHERE v.position_name='乡镇作业中心经理' AND v.is_current=TRUE
        AND v.relation_status='active' AND v.is_deleted=FALSE AND ${VALID}
      GROUP BY v.org_name HAVING COUNT(*) >= 2 ORDER BY v.org_name LIMIT 1`, []);
  return r.rows[0] || null;
}

// ---------------- supervisor 临时覆盖（造数，finally 恢复） ----------------
async function overrideSupervisor(employeeId, newSupId) {
  const cur = await q(
    `SELECT id, supervisor_id FROM employee_assignment
      WHERE employee_id=$1 AND is_current=TRUE AND is_deleted=FALSE ORDER BY id LIMIT 1`, [employeeId]);
  if (!cur.rows.length) throw new Error(`employee ${employeeId} 无 current assignment，无法覆盖 supervisor`);
  state.supOverrides.push({ id: cur.rows[0].id, old: cur.rows[0].supervisor_id });
  await q(`UPDATE employee_assignment SET supervisor_id=$2, updated_at=NOW() WHERE id=$1`, [cur.rows[0].id, newSupId]);
}
async function restoreSupervisors() {
  for (const o of state.supOverrides) {
    await q(`UPDATE employee_assignment SET supervisor_id=$2, updated_at=NOW() WHERE id=$1`, [o.id, o.old]);
  }
  state.supOverrides = [];
}

// ---------------- 临时考核对象（造数，finally 删除） ----------------
// R4 背景：考核对象白名单=经理/管理员(town_center)/网格长，跨组织直接上级（如于鑫宁）
// 天然不在白名单内；测试需临时建 target 才能验证 RESOLVED 解析语义。结束精确删除。
async function ensureTarget(cycleId, employeeId) {
  const ex = await q(
    `SELECT id FROM hse_assessment_target WHERE cycle_id=$1 AND employee_id=$2 AND is_deleted=FALSE LIMIT 1`,
    [cycleId, employeeId]);
  if (ex.rows.length) return { created: false, id: Number(ex.rows[0].id) };
  const emp = await q(
    `SELECT employee_code, name, position_name, COALESCE(org_name,'') AS org
       FROM v_employee_org_full
      WHERE employee_id=$1 AND is_current=TRUE AND relation_status='active' AND is_deleted=FALSE LIMIT 1`,
    [employeeId]);
  const e = emp.rows[0];
  if (!e) throw new Error(`ensureTarget: employee ${employeeId} 不在现职视图`);
  const r = await q(
    `INSERT INTO hse_assessment_target
       (cycle_id, employee_id, employee_code, employee_name, position, township, department)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [cycleId, employeeId, e.employee_code, e.name, e.position_name, e.org, e.org]);
  const id = Number(r.rows[0].id);
  state.createdTargetIds.push(id);
  return { created: true, id };
}

async function removeCreatedTargets() {
  // 仅删除本测试新建的 target（既有 target 不动）；新建 target 上的扣分只可能是测试产物
  for (const id of state.createdTargetIds) {
    await q(`DELETE FROM hse_assessment_deduction WHERE target_id=$1`, [id]);
    await q(`DELETE FROM hse_assessment_target WHERE id=$1`, [id]);
  }
  state.createdTargetIds = [];
}

// ---------------- 引擎级造数助手 ----------------
async function insertVr({ violatorId, name, checkSource, sourceType, candidateId }) {
  const r = await q(
    `INSERT INTO violation_records
       (violator_id, violator_name, violation_behavior, check_source, violation_date, source_type, candidate_id, is_deleted)
     VALUES ($1,$2,$3,$4,$5,$6,$7,FALSE) RETURNING id`,
    [violatorId, name || `${MARK}-${violatorId}`, `${MARK} 三违行为`, checkSource || null, TEST_DATE, sourceType || null, candidateId || null]);
  const id = Number(r.rows[0].id);
  state.vrIds.push(id);
  return id;
}

async function insertGvc(vrId, seq) {
  const gir = await q('SELECT id FROM grid_inspection_records ORDER BY id DESC LIMIT 1');
  const gridRecordId = Number(gir.rows[0].id);
  if (!state.dictIds) {
    const d = await q(`SELECT id FROM sanwei_behavior_dict WHERE is_deleted=FALSE AND enabled=TRUE ORDER BY id`);
    state.dictIds = d.rows.map((r) => Number(r.id));
  }
  if (!state.dictIds.length) throw new Error('行为字典为空');
  const behaviorId = state.dictIds[seq % state.dictIds.length];
  const r = await q(
    `INSERT INTO grid_violation_candidates
       (grid_record_id, behavior_id, behavior_text, raw_violation_behavior,
        candidate_type, candidate_reason, inspection_source,
        suggested_score, candidate_status, confirmed_violation_id, confirmed_by, confirmed_at)
     VALUES ($1,$2,$3,$4,'E0804R2','E0804R2','company',5,'confirmed',$5,1,NOW())
     RETURNING id`, [gridRecordId, behaviorId, `${MARK} 三违行为`, `${MARK} 三违行为`, vrId]);
  const id = Number(r.rows[0].id);
  state.gvcIds.push(id);
  return id;
}

async function createdDeductions() {
  const r = await q(
    `SELECT d.id, d.source_id, d.suggested_score, d.is_transmission, d.is_deleted, d.review_status, d.source_detail,
            t.employee_id, t.position
       FROM hse_assessment_deduction d
       JOIN hse_assessment_target t ON t.id=d.target_id
      WHERE d.id > $1 AND d.source_table='violation_records' ORDER BY d.id`, [state.highWater]);
  return r.rows;
}

async function recalcTargets() {
  for (const tid of state.targetIds) {
    try { await scoringEngine.recalculateTarget(CYCLE_ID, tid); } catch (_) {}
  }
}

async function snapshot(targetsEmployees) {
  const hw = await q('SELECT COALESCE(MAX(id),0) m FROM hse_assessment_deduction');
  state.highWater = Number(hw.rows[0].m);
  state.auditBase = Number((await q('SELECT COALESCE(MAX(id),0) m FROM audit_record')).rows[0].m);
  const rb = await q(`SELECT rule_code, valid_from, valid_to FROM hse_assessment_rule WHERE rule_code IN ('GRIDVIOL001','VIOLATION003') AND is_deleted=FALSE`);
  for (const r of rb.rows) state.rulesBefore[r.rule_code] = { validFrom: r.valid_from, validTo: r.valid_to };
  const tb = await q(
    `SELECT id, employee_id, score_auto, score_total FROM hse_assessment_target
      WHERE cycle_id=$1 AND employee_id = ANY($2) AND is_deleted=FALSE`, [CYCLE_ID, targetsEmployees]);
  for (const r of tb.rows) state.targetsBefore[Number(r.employee_id)] = r;
  state.targetIds = tb.rows.map((r) => Number(r.id));
  state.cycleStatusBefore = (await q('SELECT status FROM hse_assessment_cycle WHERE id=$1', [CYCLE_ID])).rows[0].status;
  // 暂避存量三违管理扣分（避免 capped-out 干扰；结束恢复）
  const conflicts = await q(
    `SELECT d.id FROM hse_assessment_deduction d
       JOIN hse_assessment_target t ON t.id=d.target_id AND t.cycle_id=$1
      WHERE t.employee_id = ANY($2) AND d.is_deleted=FALSE AND d.review_status <> 'rejected'
        AND d.deduction_source IN ('auto','chain_transmission')
        AND (d.source_detail->>'category') = '三违管理'`, [CYCLE_ID, targetsEmployees]);
  state.conflictIds = conflicts.rows.map((r) => Number(r.id));
  if (state.conflictIds.length) {
    await q(`UPDATE hse_assessment_deduction SET is_deleted=TRUE, updated_at=NOW() WHERE id=ANY($1)`, [state.conflictIds]);
    console.log(`  （暂避存量三违管理扣分 ${state.conflictIds.length} 行，结束恢复）`);
  }
  await recalcTargets();
}

async function cleanupEngineData() {
  if (state.vrIds.length) {
    await q(`DELETE FROM hse_assessment_deduction WHERE source_table='violation_records' AND source_id=ANY($1::bigint[])`, [state.vrIds]);
    await q(`DELETE FROM grid_violation_candidates WHERE id = ANY($1)`, [state.gvcIds.length ? state.gvcIds : [-1]]);
    await q(`DELETE FROM audit_record WHERE id > $1 AND table_name='grid_violation_candidates' AND record_id = ANY($2)`,
      [state.auditBase, state.gvcIds.length ? state.gvcIds : [-1]]);
    await q(`DELETE FROM violation_records WHERE id = ANY($1)`, [state.vrIds]);
    state.vrIds = []; state.gvcIds = [];
  }
  if (state.targetIds.length) await recalcTargets();
}

async function restoreRules() {
  for (const [code, v] of Object.entries(state.rulesBefore)) {
    await q(`UPDATE hse_assessment_rule SET valid_from=$2, valid_to=$3, updated_at=NOW() WHERE rule_code=$1 AND is_deleted=FALSE`,
      [code, v.validFrom, v.validTo]);
  }
}

function expectedSet(...emps) { return new Set(emps.map((x) => String(x))); }
function setEq(a, b) { return a.size === b.size && [...a].every((x) => b.has(x)); }
function targetEmployeeIds(res) { return new Set((res.targets || []).map((t) => String(t.employeeId))); }

// ============================== 测试体 ==============================
(async () => {
  await boot();
  console.log('== R2 测试（DEV / resolver 真实案例 + 引擎造数） ==');

  // 找链完整案例（B/E/I/J/K 与引擎测试共用）
  const chain = await findChainCleaner();
  check('PRE 链完整真实案例存在（保洁员→管理员→经理且均有考核对象）', !!chain, JSON.stringify(chain));
  if (!chain) throw new Error('缺少链完整真实案例，无法继续引擎级测试');
  console.log(`  案例：${chain.org_name} 保洁员${chain.cleaner_name} → 管理员${chain.admin_name} → 经理${chain.mgr_name}`);

  const violatorOf = (who) => who; // helper 名

  // ================= Phase A-K：resolver 级 =================
  console.log('\n== Phase R-A：resolver 唯一责任人解析（真实数据） ==');
  const TCFG = { only_check_source: 'company', by_violator_position: {
    '保洁员': ['管理员', '乡镇作业中心经理'],
    '管理员': ['管理员', '乡镇作业中心经理'],
    '乡镇作业中心经理': ['乡镇作业中心经理'],
  } };

  { // A 单管理员
    const c = await findSingleAdminChainCleaner();
    check('A-pre 单管理员组织链完整案例存在', !!c, JSON.stringify(c));
    if (c) {
      const res = await resolveTransmissionTargets({ cycleId: CYCLE_ID, violatorId: c.cleaner_id, checkSource: 'company', transmissionConfig: TCFG });
      check('A1 单管理员 → RESOLVED', res.mode === 'transmitted' && res.status === 'RESOLVED', JSON.stringify(res.status));
      check('A2 单管理员 → 恰 [该管理员, 经理]', setEq(targetEmployeeIds(res), expectedSet(c.admin_id, c.mgr_id)), JSON.stringify([...targetEmployeeIds(res)]));
    }
  }
  { // B 多管理员 + supervisor 唯一
    const c = await findMultiAdminChainCleaner();
    check('B-pre 多管理员组织链完整案例存在（有效管理员≥2）', !!c, JSON.stringify(c));
    if (c) {
      const res = await resolveTransmissionTargets({ cycleId: CYCLE_ID, violatorId: c.cleaner_id, checkSource: 'company', transmissionConfig: TCFG });
      check('B1 多管理员组织 → RESOLVED（非全量）', res.mode === 'transmitted' && res.status === 'RESOLVED', JSON.stringify({ status: res.status, reason: res.reason }));
      check('B2 恰 [直接上级管理员, 经理] 2 人', setEq(targetEmployeeIds(res), expectedSet(c.admin_id, c.mgr_id)), JSON.stringify([...targetEmployeeIds(res)]));
      const adminT = (res.targets || []).find((t) => String(t.employeeId) === String(c.admin_id));
      check('B3 管理员 evidence.method=supervisor-chain', !!adminT && !!res.evidence.positions.find((p) => p.wantedPosition === '管理员' && p.evidence.method === 'supervisor-chain'), JSON.stringify(res.evidence.positions));
    }
  }
  { // C supervisor 有效非管理员/非经理 → fail-closed（R2-FIX：跨组织=终态 UNRESOLVED；同组织=org-unique 兜底三态）
    const c = await findNonAdminSupCleaner();
    check('C-pre supervisor 有效非管理员的保洁员案例存在', !!c, JSON.stringify(c));
    if (c) {
      const supOrg = (await q(`SELECT org_name FROM v_employee_org_full WHERE employee_id=$1 AND is_current=TRUE AND relation_status='active' AND is_deleted=FALSE LIMIT 1`, [c.sup_id])).rows[0]?.org_name;
      const tg = await ensureTarget(CYCLE_ID, c.sup_id);
      try {
      const res = await resolveTransmissionTargets({ cycleId: CYCLE_ID, violatorId: c.cleaner_id, checkSource: 'company', transmissionConfig: TCFG });
      const adminPos = (res.evidence.positions || []).find((p) => p.wantedPosition === '管理员');
      if (res.evidence.evidenceSource === 'confirmed-responsibility/primary') {
        // R4-FIX（2026-09-14）：该直接上级 ∈ 确认责任人名单（system_settings）→
        // 确认分支优先于默认模板 → 单一目标 RESOLVED（target_count=1）。
        check('C1 确认责任人分支优先（sup ∈ 确认名单 → 单一目标 RESOLVED，R4-FIX §4.5）',
          res.status === 'RESOLVED' && (res.targets || []).length === 1
          && String(res.targets[0].employeeId) === String(c.sup_id),
          JSON.stringify({ status: res.status, targets: (res.targets || []).map((t) => t.employeeId) }));
      } else if (supOrg !== c.org_name) {
        // R4 §四（2026-09-14 业务确认）：直接上级为有效人员的跨组织正式 supervisor 关系
        // （津城街道 16 名保洁员 → 于鑫宁）→ 管理员槽位按正式 supervisor_id 解析，
        // evidence 显式标记 crossOrg；经理槽位仍要求同组织。
        check('C1 supervisor 跨组织（有效人员）→ 管理员槽位 RESOLVED（crossOrg 证据留痕，R4 §四）',
          adminPos && adminPos.status === 'RESOLVED' && adminPos.evidence.crossOrg === true
          && adminPos.evidence.evidenceSource === 'supervisor-chain/primary',
          JSON.stringify({ got: adminPos && adminPos.status, crossOrg: adminPos && adminPos.evidence.crossOrg, supOrg, org: c.org_name }));
      } else {
        const admCnt = Number((await q(
          `SELECT COUNT(*)::int n FROM v_employee_org_full v JOIN employee e ON e.id=v.employee_id
            WHERE v.position_name='管理员' AND v.org_name=$1 AND v.is_current=TRUE
              AND v.relation_status='active' AND v.is_deleted=FALSE AND ${VALID}`, [c.org_name])).rows[0].n);
        const expStatus = admCnt === 0 ? 'UNRESOLVED' : admCnt === 1 ? 'RESOLVED' : 'AMBIGUOUS';
        check(`C1 管理员层兜底语义（同组织，有效管理员=${admCnt} → ${expStatus}，绝不全量）`,
          adminPos && adminPos.status === expStatus
          && (expStatus !== 'RESOLVED' || adminPos.evidence.evidenceSource === 'org-unique-valid/fallback'),
          JSON.stringify({ got: adminPos && adminPos.status, src: adminPos && adminPos.evidence.evidenceSource, admCnt }));
      }
      if (c.sup_pos === '乡镇作业中心经理') {
        const mgrT = (res.targets || []).find((t) => String(t.employeeId) === String(c.sup_id));
        check('C2 上级=经理 → 经理层经 supervisor 链唯一确定', !!mgrT, JSON.stringify([...targetEmployeeIds(res)]));
      } else if (supOrg !== c.org_name) {
        // R4：跨组织有效 supervisor → 管理员槽位目标恰为该直接上级
        check('C2 跨组织有效 supervisor → 管理员槽位目标=该直接上级（R4 §四）',
          (res.targets || []).some((t) => String(t.employeeId) === String(c.sup_id)), JSON.stringify([...targetEmployeeIds(res)]));
      } else {
        check('C2 上级非经理非管理员 → 管理员层不落到该上级头上', !(res.targets || []).some((t) => String(t.employeeId) === String(c.sup_id)), JSON.stringify([...targetEmployeeIds(res)]));
      }
      } finally { if (tg.created) await removeCreatedTargets(); }
    }
  }
  { // D 多经理（含无效）过滤后唯一 → org-unique fallback
    const org = await findOrgWithUniqueValidManager();
    check('D-pre 有效经理恰 1 的组织存在', !!org, JSON.stringify(org));
    if (org) {
      const cleaner = await q(
        `SELECT v.employee_id, v.org_name FROM v_employee_org_full v JOIN employee e ON e.id=v.employee_id
          WHERE v.position_name LIKE '%保洁%' AND v.org_name=$1 AND v.is_current=TRUE
            AND v.relation_status='active' AND v.is_deleted=FALSE AND ${VALID} LIMIT 1`, [org.org_name]);
      if (cleaner.rows.length) {
        await overrideSupervisor(cleaner.rows[0].employee_id, null); // 链断造数
        try {
          const res = await resolveTransmissionTargets({ cycleId: CYCLE_ID, violatorId: cleaner.rows[0].employee_id, checkSource: 'company', transmissionConfig: TCFG });
          const mgrPos = (res.evidence.positions || []).find((p) => p.wantedPosition === '乡镇作业中心经理');
          check('D1 链断 → 经理层回退「同组织有效经理唯一性」确定', mgrPos && mgrPos.evidence.method === 'org-unique-valid' && mgrPos.status === 'RESOLVED'
            && mgrPos.evidence.evidenceSource === 'org-unique-valid/fallback', JSON.stringify(mgrPos && { method: mgrPos.evidence.method, status: mgrPos.status, src: mgrPos.evidence.evidenceSource }));
          // R2-FIX 语义：管理员层 supervisor=null → 同样允许 org-unique 兜底（0/1/≥2 三态）
          const admCnt = Number((await q(
            `SELECT COUNT(*)::int n FROM v_employee_org_full v JOIN employee e ON e.id=v.employee_id
              WHERE v.position_name='管理员' AND v.org_name=$1 AND v.is_current=TRUE
                AND v.relation_status='active' AND v.is_deleted=FALSE AND ${VALID}`, [org.org_name])).rows[0].n);
          const admPos = (res.evidence.positions || []).find((p) => p.wantedPosition === '管理员');
          const expAdm = admCnt === 0 ? 'UNRESOLVED' : admCnt === 1 ? 'RESOLVED' : 'AMBIGUOUS';
          check(`D2 管理员层兜底语义（组织有效管理员=${admCnt} → ${expAdm}）`,
            admPos && admPos.status === expAdm, JSON.stringify({ got: admPos && admPos.status, admCnt }));
        } finally { await restoreSupervisors(); }
      } else {
        check('D-skipped 该组织无有效保洁员（场景不可达，如实登记）', true);
      }
    }
  }
  { // E 多经理 + supervisor 唯一（真实多经理场景在 DEV 乡镇已无；用链完整案例验证两跳链优先）
    const res = await resolveTransmissionTargets({ cycleId: CYCLE_ID, violatorId: chain.cleaner_id, checkSource: 'company', transmissionConfig: TCFG });
    const mgrPos = (res.evidence.positions || []).find((p) => p.wantedPosition === '乡镇作业中心经理');
    check('E1 经理经 supervisor 两跳链唯一确定（hop=2）', mgrPos && mgrPos.status === 'RESOLVED' && mgrPos.evidence.method === 'supervisor-chain' && mgrPos.evidence.hop === 2, JSON.stringify(mgrPos && { method: mgrPos.evidence.method, hop: mgrPos.evidence.hop }));
  }
  { // F 多有效经理仍无法唯一 → AMBIGUOUS（环卫作业中心 2 有效经理 + 链断造数）
    const org = await findOrgWithMultipleValidManagers();
    check('F-pre 多有效经理组织存在', !!org, JSON.stringify(org));
    if (org) {
      const cleaner = await q(
        `SELECT v.employee_id FROM v_employee_org_full v JOIN employee e ON e.id=v.employee_id
          WHERE v.position_name LIKE '%保洁%' AND v.org_name=$1 AND v.is_current=TRUE
            AND v.relation_status='active' AND v.is_deleted=FALSE AND ${VALID} LIMIT 1`, [org.org_name]);
      if (cleaner.rows.length) {
        await overrideSupervisor(cleaner.rows[0].employee_id, null);
        try {
          const res = await resolveTransmissionTargets({ cycleId: CYCLE_ID, violatorId: cleaner.rows[0].employee_id, checkSource: 'company', transmissionConfig: TCFG });
          const mgrPos = (res.evidence.positions || []).find((p) => p.wantedPosition === '乡镇作业中心经理');
          check('F1 多有效经理且链断 → AMBIGUOUS（不自动选人）', mgrPos && mgrPos.status === 'AMBIGUOUS' && mgrPos.reason === 'multiple-valid-candidates-in-org', JSON.stringify(mgrPos && { status: mgrPos.status, reason: mgrPos.reason, candidates: mgrPos.evidence.orgCandidates }));
        } finally { await restoreSupervisors(); }
      } else {
        check('F-skipped 该组织无有效保洁员', true);
      }
    }
  }
  { // G supervisor 指向无效人员 → INVALID_TARGET（构造式：R4 已修正全部 29 条同名错配，
    //   真实无效案例已清零 —— 恰是本阶段数据修正生效的证明。用辞职同名档案 8259 造数验证）
    const resigned = await q(
      `SELECT id::int, name FROM employee WHERE id = 8259 AND is_deleted = FALSE AND employment_relation = '辞职' LIMIT 1`);
    check('G-pre 辞职同名档案 8259 存在（赵书坤辞职保洁员档案）', resigned.rows.length === 1, JSON.stringify(resigned.rows));
    if (resigned.rows.length) {
      await overrideSupervisor(chain.cleaner_id, resigned.rows[0].id);
      try {
        const res = await resolveTransmissionTargets({ cycleId: CYCLE_ID, violatorId: chain.cleaner_id, checkSource: 'company', transmissionConfig: TCFG });
        check('G1 状态=INVALID_TARGET（supervisor 非当前在职责任池：辞职）', res.status === 'INVALID_TARGET' && res.mode === 'none', JSON.stringify({ status: res.status, reason: res.reason }));
        check('G2 无任何扣分对象（不回退全量）', (res.targets || []).length === 0);
      } finally { await restoreSupervisors(); }
    }
  }
  { // H 跨组织 supervisor（R4 §四语义：有效直接上级跨组织 → 管理员槽位 RESOLVED + crossOrg 留痕；
    //   造数：指向另一组织的有效管理员）
    const cross = await q(
      `SELECT a.employee_id AS cross_admin_id FROM v_employee_org_full a
         JOIN employee ea ON ea.id=a.employee_id
        WHERE a.position_name='管理员' AND a.is_current=TRUE AND a.relation_status='active' AND a.is_deleted=FALSE
          AND a.org_name <> $1
          AND ea.employment_relation = '正式员工'
        LIMIT 1`, [chain.org_name]);
    check('H-pre 可用作跨组织指向的有效管理员存在', cross.rows.length > 0);
    if (cross.rows.length) {
      const tg = await ensureTarget(CYCLE_ID, cross.rows[0].cross_admin_id);
      await overrideSupervisor(chain.cleaner_id, cross.rows[0].cross_admin_id);
      try {
        const res = await resolveTransmissionTargets({ cycleId: CYCLE_ID, violatorId: chain.cleaner_id, checkSource: 'company', transmissionConfig: TCFG });
        const adminPos = (res.evidence.positions || []).find((p) => p.wantedPosition === '管理员');
        check('H1 跨组织有效 supervisor → 管理员槽位 RESOLVED（crossOrg=true，正式 supervisor 关系）',
          adminPos && adminPos.status === 'RESOLVED' && adminPos.evidence.crossOrg === true, JSON.stringify(adminPos && { status: adminPos.status, crossOrg: adminPos.evidence.crossOrg }));
      } finally {
        await restoreSupervisors();
        if (tg.created) await removeCreatedTargets();
      }
    }
  }

  // 引擎级前置：快照（链完整案例涉及的管理员+经理 target）
  const engineEmps = [chain.admin_id, chain.mgr_id];
  console.log('\n== Phase R-B：引擎级（LIVE/BACKFILL + revoke O-U） ==');
  await snapshot(engineEmps);
  // 实时得分（快照 recalc 后的基线；每用例造数前重新读取）
  const liveScores = async () => {
    const r = await q(
      `SELECT employee_id, score_auto FROM hse_assessment_target
        WHERE cycle_id=$1 AND employee_id = ANY($2) AND is_deleted=FALSE`, [CYCLE_ID, engineEmps]);
    const m = {};
    for (const row of r.rows) m[Number(row.employee_id)] = Number(row.score_auto);
    return { mgr: m[Number(chain.mgr_id)], adm: m[Number(chain.admin_id)] };
  };

  { // I/J/K 引擎级责任对象（规则有效期临时放宽）
    await q(`UPDATE hse_assessment_rule SET valid_from='2026-04-30', valid_to=NULL, updated_at=NOW() WHERE rule_code='GRIDVIOL001' AND is_deleted=FALSE`);
    // I 保洁员 → 管理员+经理两目标
    const vrI = await insertVr({ violatorId: chain.cleaner_id, checkSource: 'company', sourceType: 'grid_candidate' });
    const engine = require('../services/ruleEngine/engine');
    await engine.runCycleAdapters(CYCLE_ID, { adapterKeys: ['sanwei_candidate'] });
    let rows = (await createdDeductions()).filter((r) => String(r.source_id) === String(vrI) && !r.is_deleted);
    check('I1 保洁员 → 恰 2 条扣分（管理员+经理）', rows.length === 2, `rows=${rows.length}`);
    check('I2 对象集合=[责任管理员, 经理]', setEq(new Set(rows.map((r) => String(r.employee_id))), expectedSet(chain.admin_id, chain.mgr_id)), JSON.stringify(rows.map((r) => r.employee_id)));
    check('I3 is_transmission=TRUE', rows.every((r) => r.is_transmission === true));
    await cleanupEngineData();
    // J 管理员 → 本人+经理
    const vrJ = await insertVr({ violatorId: chain.admin_id, checkSource: 'company', sourceType: 'grid_candidate' });
    await engine.runCycleAdapters(CYCLE_ID, { adapterKeys: ['sanwei_candidate'] });
    rows = (await createdDeductions()).filter((r) => String(r.source_id) === String(vrJ) && !r.is_deleted);
    check('J1 管理员 → 恰 2 条（本人+经理）', rows.length === 2 && setEq(new Set(rows.map((r) => String(r.employee_id))), expectedSet(chain.admin_id, chain.mgr_id)), JSON.stringify(rows.map((r) => r.employee_id)));
    await cleanupEngineData();
    // K 经理 → 仅本人
    const vrK = await insertVr({ violatorId: chain.mgr_id, checkSource: 'company', sourceType: 'grid_candidate' });
    await engine.runCycleAdapters(CYCLE_ID, { adapterKeys: ['sanwei_candidate'] });
    rows = (await createdDeductions()).filter((r) => String(r.source_id) === String(vrK) && !r.is_deleted);
    check('K1 经理 → 仅本人 1 条', rows.length === 1 && String(rows[0].employee_id) === String(chain.mgr_id), JSON.stringify(rows.map((r) => r.employee_id)));
    await cleanupEngineData();
  }

  { // L/M/N：LIVE vs HISTORICAL_BACKFILL
    const engine = require('../services/ruleEngine/engine');
    await restoreRules(); // 恢复真实 valid_from（2026-09，晚于周期 53）
    const vrL = await insertVr({ violatorId: chain.cleaner_id, checkSource: 'company', sourceType: 'grid_candidate' });
    // L LIVE：历史周期被规则有效期拦截
    let res = await engine.runCycleAdapters(CYCLE_ID, { adapterKeys: ['sanwei_candidate'] });
    let rows = (await createdDeductions()).filter((r) => String(r.source_id) === String(vrL) && !r.is_deleted);
    const aL = res.adapters.find((x) => x.key === 'sanwei_candidate');
    check('L1 LIVE：返回 executionMode=live', res.executionMode === 'live', JSON.stringify(res.executionMode));
    check('L2 LIVE：历史周期被 valid_from 拦截（rule-not-effective）', aL && aL.ok === false && aL.reason === 'rule-not-effective', JSON.stringify(aL));
    check('L3 LIVE：未产生扣分', rows.length === 0);
    // M BACKFILL：显式传入 → 不被配置有效期阻断
    res = await engine.runCycleAdapters(CYCLE_ID, { adapterKeys: ['sanwei_candidate'], executionMode: 'backfill' });
    rows = (await createdDeductions()).filter((r) => String(r.source_id) === String(vrL) && !r.is_deleted);
    const aM = res.adapters.find((x) => x.key === 'sanwei_candidate');
    check('M1 BACKFILL：返回 executionMode=backfill', res.executionMode === 'backfill');
    check('M2 BACKFILL：历史业务日期不被规则配置有效期阻断', aM && aM.ok === true, JSON.stringify(aM));
    check('M3 BACKFILL：正常产出 2 对象扣分', rows.length === 2, `rows=${rows.length}`);
    check('M4 BACKFILL：对象=[责任管理员, 经理]', setEq(new Set(rows.map((r) => String(r.employee_id))), expectedSet(chain.admin_id, chain.mgr_id)));
    await cleanupEngineData();
    // N scheduler 不自动 backfill（静态 + 动态双证）
    const schedSrc = fs.readFileSync(path.join(__dirname, '../services/assessmentScheduler.js'), 'utf8');
    check('N1 assessmentScheduler 源码无 backfill 触发', !schedSrc.includes("'backfill'") && !schedSrc.includes('executionMode'), '');
    const gudsSrc = fs.readFileSync(path.join(__dirname, '../services/gridUncheckedDeductionService.js'), 'utf8');
    check('N2 syncGridUncheckedDeductions 仅透传 executionMode（默认 undefined→live）', gudsSrc.includes('executionMode') && !/executionMode\s*[:=]\s*['"]backfill['"]/.test(gudsSrc));
    res = await engine.runCycleAutoDeductions(CYCLE_ID, { dryRun: true });
    check('N3 runCycleAutoDeductions 默认 executionMode=live（scheduler 同路径）', res.executionMode === 'live', JSON.stringify(res.executionMode));
  }

  { // O/P/Q/R/S/T/U：撤销即时恢复
    const engine = require('../services/ruleEngine/engine');
    const op = { userId: 1, username: 'e0804r2test', ip: '127.0.0.1' };
    await q(`UPDATE hse_assessment_rule SET valid_from='2026-04-30', valid_to=NULL, updated_at=NOW() WHERE rule_code='GRIDVIOL001' AND is_deleted=FALSE`);

    const setupDeduction = async (seq, markName) => {
      const vr = await insertVr({ violatorId: chain.cleaner_id, name: markName, checkSource: 'company', sourceType: 'grid_candidate' });
      const gvc = await insertGvc(vr, seq);
      await q(`UPDATE violation_records SET candidate_id=$1 WHERE id=$2`, [gvc, vr]);
      await engine.runCycleAdapters(CYCLE_ID, { adapterKeys: ['sanwei_candidate'] });
      const rows = (await createdDeductions()).filter((r) => String(r.source_id) === String(vr) && !r.is_deleted);
      return { vr, gvc, rows };
    };
    const assertRevoked = async (label, r, vr, baseScores) => {
      check(`${label}a revoke 成功`, r.ok === true, JSON.stringify(r));
      const rows = (await createdDeductions()).filter((x) => String(x.source_id) === String(vr));
      check(`${label}b 全部扣分行已回滚`, rows.length > 0 && rows.every((x) => x.is_deleted === true), `rows=${rows.length}`);
      const sMgr = Number((await q('SELECT score_auto FROM hse_assessment_target WHERE cycle_id=$1 AND employee_id=$2', [CYCLE_ID, chain.mgr_id])).rows[0].score_auto);
      const sAdm = Number((await q('SELECT score_auto FROM hse_assessment_target WHERE cycle_id=$1 AND employee_id=$2', [CYCLE_ID, chain.admin_id])).rows[0].score_auto);
      check(`${label}c 经理得分立即恢复`, Math.abs(sMgr - baseScores.mgr) < 0.001, `${baseScores.mgr}→${sMgr}`);
      check(`${label}d 管理员得分立即恢复`, Math.abs(sAdm - baseScores.adm) < 0.001, `${baseScores.adm}→${sAdm}`);
    };

    // O pending
    {
      await recalcTargets();
      const base = await liveScores();
      const s = await setupDeduction(11, `${MARK}-O`);
      check('O-pre pending 扣分已产生（2 对象）', s.rows.length === 2, `rows=${s.rows.length}`);
      const r = await candidateService.revokeConfirmation({ candidate_id: s.gvc, reason: 'R2 pending 撤销', operator: op });
      await assertRevoked('O', r, s.vr, base);
      check('Oe vr 已软删', (await q('SELECT is_deleted FROM violation_records WHERE id=$1', [s.vr])).rows[0].is_deleted === true);
    }
    // P approved
    {
      await cleanupEngineData(); await recalcTargets();
      const base = await liveScores();
      const s = await setupDeduction(12, `${MARK}-P`);
      await q(`UPDATE hse_assessment_deduction SET review_status='approved', updated_at=NOW() WHERE source_table='violation_records' AND source_id=$1 AND is_deleted=FALSE`, [String(s.vr)]);
      const r = await candidateService.revokeConfirmation({ candidate_id: s.gvc, reason: 'R2 approved 撤销', operator: op });
      check('P-a revoke 成功且锁定行一并回滚', r.ok === true && r.rollback.deductionsLockedRemoved === 2, JSON.stringify(r.rollback || r));
      await assertRevoked('P', r, s.vr, base);
    }
    // Q adjusted
    {
      await cleanupEngineData(); await recalcTargets();
      const base = await liveScores();
      const s = await setupDeduction(13, `${MARK}-Q`);
      await q(`UPDATE hse_assessment_deduction SET review_status='adjusted', confirmed_score=4, updated_at=NOW() WHERE source_table='violation_records' AND source_id=$1 AND is_deleted=FALSE`, [String(s.vr)]);
      const r = await candidateService.revokeConfirmation({ candidate_id: s.gvc, reason: 'R2 adjusted 撤销', operator: op });
      check('Q-a revoke 成功（adjusted 同样回滚）', r.ok === true && r.rollback.deductionsRemoved === 2 && r.rollback.deductionsLockedRemoved === 2, JSON.stringify(r.rollback || r));
      await assertRevoked('Q', r, s.vr, base);
    }
    // R frozen cycle
    {
      await cleanupEngineData(); await recalcTargets();
      const base = await liveScores();
      const s = await setupDeduction(14, `${MARK}-R`);
      await q(`UPDATE hse_assessment_cycle SET status='frozen', updated_at=NOW() WHERE id=$1`, [CYCLE_ID]);
      try {
        const r = await candidateService.revokeConfirmation({ candidate_id: s.gvc, reason: 'R2 frozen 撤销', operator: op });
        await assertRevoked('R', r, s.vr, base);
      } finally {
        await q(`UPDATE hse_assessment_cycle SET status=$2, updated_at=NOW() WHERE id=$1`, [CYCLE_ID, state.cycleStatusBefore]);
      }
      check('R-e 周期状态已恢复', (await q('SELECT status FROM hse_assessment_cycle WHERE id=$1', [CYCLE_ID])).rows[0].status === state.cycleStatusBefore);
    }
    // S not_started cycle
    {
      await cleanupEngineData(); await recalcTargets();
      const base = await liveScores();
      const s = await setupDeduction(15, `${MARK}-S`);
      await q(`UPDATE hse_assessment_cycle SET status='not_started', updated_at=NOW() WHERE id=$1`, [CYCLE_ID]);
      try {
        const r = await candidateService.revokeConfirmation({ candidate_id: s.gvc, reason: 'R2 not_started 撤销', operator: op });
        await assertRevoked('S', r, s.vr, base);
      } finally {
        await q(`UPDATE hse_assessment_cycle SET status=$2, updated_at=NOW() WHERE id=$1`, [CYCLE_ID, state.cycleStatusBefore]);
      }
    }
    // T 幂等
    {
      await cleanupEngineData(); await recalcTargets();
      const s = await setupDeduction(16, `${MARK}-T`);
      const r1 = await candidateService.revokeConfirmation({ candidate_id: s.gvc, reason: 'R2 幂等首次', operator: op });
      const r2 = await candidateService.revokeConfirmation({ candidate_id: s.gvc, reason: 'R2 幂等重复', operator: op });
      check('T1 首次撤销成功', r1.ok === true);
      check('T2 重复撤销被拒（409/NOT_REVOCABLE）', r2.ok !== true && (r2.code === 'NOT_REVOCABLE' || r2.code === 'REVOKE_CONFLICT'), JSON.stringify(r2));
      const alive = Number((await q(`SELECT count(*)::int c FROM hse_assessment_deduction WHERE source_table='violation_records' AND source_id=$1 AND is_deleted=FALSE`, [String(s.vr)])).rows[0].c);
      check('T3 重复撤销不复活扣分', alive === 0);
    }
    // U 并发
    {
      await cleanupEngineData(); await recalcTargets();
      const s = await setupDeduction(17, `${MARK}-U`);
      const [c1, c2] = await Promise.all([
        candidateService.revokeConfirmation({ candidate_id: s.gvc, reason: 'R2 并发A', operator: op }),
        candidateService.revokeConfirmation({ candidate_id: s.gvc, reason: 'R2 并发B', operator: op }),
      ]);
      const okCnt = [c1, c2].filter((x) => x.ok === true).length;
      check('U1 并发撤销恰一次成功', okCnt === 1, JSON.stringify([c1.code || 'ok', c2.code || 'ok']));
      const alive = Number((await q(`SELECT count(*)::int c FROM hse_assessment_deduction WHERE source_table='violation_records' AND source_id=$1 AND is_deleted=FALSE`, [String(s.vr)])).rows[0].c);
      check('U2 并发后无残留有效扣分', alive === 0);
      await cleanupEngineData();
    }
  }
})().then(async () => {
  console.log('\n== 收尾恢复 ==');
  try { await restoreSupervisors(); } catch (e) { console.log('  supervisor 恢复异常:', e.message); }
  try { await restoreRules(); } catch (e) { console.log('  规则恢复异常:', e.message); }
  if (state.cycleStatusBefore) {
    try { await q(`UPDATE hse_assessment_cycle SET status=$2 WHERE id=$1`, [CYCLE_ID, state.cycleStatusBefore]); } catch (_) {}
  }
  try { await cleanupEngineData(); } catch (e) { console.log('  造数清理异常:', e.message); }
  if (state.conflictIds.length) {
    await q(`UPDATE hse_assessment_deduction SET is_deleted=FALSE, updated_at=NOW() WHERE id=ANY($1)`, [state.conflictIds]);
    state.conflictIds = [];
    await recalcTargets();
  }
  // 基线核验
  const rb = (await q(`SELECT rule_code, valid_from, valid_to FROM hse_assessment_rule WHERE rule_code IN ('GRIDVIOL001','VIOLATION003') AND is_deleted=FALSE ORDER BY id`)).rows;
  let rulesOk = true;
  for (const r of rb) {
    const b = state.rulesBefore[r.rule_code];
    if (!b || String(b.validFrom) !== String(r.valid_from) || String(b.validTo ?? '') !== String(r.valid_to ?? '')) rulesOk = false;
  }
  check('Z1 规则有效期已恢复原值', rulesOk, JSON.stringify(rb));
  check('Z2 周期状态已恢复', (await q('SELECT status FROM hse_assessment_cycle WHERE id=$1', [CYCLE_ID])).rows[0].status === state.cycleStatusBefore);
  const vrCnt = Number((await q(`SELECT count(*)::int c FROM violation_records WHERE violator_name LIKE '${MARK}%' OR violation_behavior LIKE '${MARK}%'`)).rows[0].c);
  check('Z3 测试 vr 已清空', vrCnt === 0, `剩余=${vrCnt}`);
  const supOk = state.supOverrides.length === 0;
  check('Z4 supervisor 覆盖已全部恢复', supOk);

  console.log(`\n===== RESULT: PASS=${pass} FAIL=${fail} =====`);
  if (fails.length) { console.log('失败项:'); for (const f of fails) console.log('  -', f); }
  await pool.end();
  process.exit(fail ? 1 : 0);
}).catch(async (e) => {
  console.error('TEST RUNNER ERROR:', e.message);
  if (e.stack) console.error(e.stack.split('\n').slice(1, 5).join('\n'));
  try { await restoreSupervisors(); } catch (_) {}
  try { await restoreRules(); } catch (_) {}
  try { if (state.cycleStatusBefore) await q(`UPDATE hse_assessment_cycle SET status=$2 WHERE id=$1`, [CYCLE_ID, state.cycleStatusBefore]); } catch (_) {}
  try { await cleanupEngineData(); } catch (_) {}
  try { if (state.conflictIds.length) { await q(`UPDATE hse_assessment_deduction SET is_deleted=FALSE WHERE id=ANY($1)`, [state.conflictIds]); } } catch (_) {}
  await pool.end();
  process.exit(2);
});
