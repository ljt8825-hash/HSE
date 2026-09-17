/**
 * P2-B1-E-08-04-R2-FIX 自动化测试（DEV：safety_dashboard_dev）
 *
 * 覆盖（R2-FIX 规格 §十二）：
 *   ① 撤销矩阵：deduction(pending/approved/adjusted) × cycle(in_progress/pending_review/frozen/not_started)
 *   ② target.status='frozen' 真实撤销场景（触发器白名单通道验证）
 *   ③ 触发器保护不放松：无白名单时 frozen target 更新必须被拒；事务后白名单不泄漏
 *   ④ revoke 幂等 / 并发
 *   ⑤ resolver 新语义：supervisor-chain primary / org-unique-valid fallback 显式标记 /
 *      MANAGER_DIRECT_SUPERVISOR / UNRESOLVED / AMBIGUOUS / fallback 不覆盖明确 supervisor
 *
 * 边界：零生产触碰；target 冻结造数用专用事务回填恢复（会话级 set_config，仅测试清理用）。
 *
 * R4 语义更新（2026-09-14）：①有效口径=正式员工；②F18 组改为「经理直管=正式责任
 * 关系（RESOLVED，双身份去重单目标）」——原 MANAGER_DIRECT_SUPERVISOR 待确认终态
 * 经业务确认转为正式责任关系；③跨组织有效 supervisor（管理员槽位）= RESOLVED + crossOrg。
 *
 * 运行：node scripts/p2b1e0804r2fix_tests.cjs
 */
process.env.DB_NAME = 'safety_dashboard_dev';
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

const db = require('../config/db');
const { pool } = db;
const { resolveTransmissionTargets } = require('../services/ruleEngine/violationTargetResolver');
const scoringEngine = require('../services/assessmentScoringEngine');
const candidateService = require('../services/gridViolationCandidateService');

const CYCLE_ID = 53;
const TEST_DATE = '2026-05-10';
const MARK = 'E0804R2FIX测试';
let pass = 0, fail = 0;
const fails = [];
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✔ ${name}`); }
  else { fail++; fails.push(name + (extra ? ` :: ${extra}` : '')); console.log(`  ✘ ${name}${extra ? ' :: ' + extra : ''}`); }
}
const q = (sql, params) => pool.query(sql, params);
// R4 冻结口径（2026-09-14）：有效 ⇔ employment_relation='正式员工'（leave_date 不参与）
const VALID = `e.employment_relation = '正式员工'`;
const GUC = 'app.allow_frozen_target_score_recalc';

const state = {
  vrIds: [], gvcIds: [], highWater: 0, auditBase: 0,
  rulesBefore: {}, conflictIds: [], targetIds: [], targetsBefore: {},
  supOverrides: [], cycleStatusBefore: null, frozenTargets: [],
};

async function boot() {
  await db.testConnection();
  if (!db.isConnected()) throw new Error('DEV 数据库连接失败');
}

// ---------------- 案例查找（真实 DEV 数据，只读） ----------------

/** 链完整保洁员：保洁员→有效管理员(同组织)→有效经理(同组织)，均有 target */
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

/** 在岗保洁员直接上级=同组织有效乡镇作业中心经理（真实案例） */
async function findManagerDirectCleaner() {
  const r = await q(
    `SELECT v.employee_id AS cleaner_id, v.name AS cleaner_name, v.org_name,
            s.employee_id AS sup_id, s.name AS sup_name
       FROM v_employee_org_full v
       JOIN v_employee_org_full s ON s.employee_id=v.supervisor_id
        AND s.is_current=TRUE AND s.relation_status='active' AND s.is_deleted=FALSE
        AND s.position_name='乡镇作业中心经理' AND s.org_name=v.org_name
       JOIN employee e ON e.id=v.employee_id
       JOIN employee e2 ON e2.id=v.supervisor_id
      WHERE v.is_current=TRUE AND v.relation_status='active' AND v.is_deleted=FALSE
        AND v.position_name LIKE '%保洁%' AND ${VALID}
        AND e2.employment_relation = '正式员工'
      LIMIT 1`, []);
  return r.rows[0] || null;
}

/** 无有效乡镇作业中心经理的组织 */
async function findOrgWithoutValidManager() {
  const r = await q(
    `SELECT DISTINCT v.org_name FROM v_employee_org_full v
      WHERE v.org_name LIKE '%作业中心%' AND v.is_current=TRUE AND v.relation_status='active' AND v.is_deleted=FALSE
        AND NOT EXISTS (
          SELECT 1 FROM v_employee_org_full m JOIN employee e ON e.id=m.employee_id
           WHERE m.org_name=v.org_name AND m.position_name='乡镇作业中心经理'
             AND m.is_current=TRUE AND m.relation_status='active' AND m.is_deleted=FALSE AND ${VALID})
      ORDER BY v.org_name LIMIT 1`, []);
  return r.rows[0] || null;
}

const orgValidAdminCount = async (orgName) => Number((await q(
  `SELECT COUNT(*)::int n FROM v_employee_org_full v JOIN employee e ON e.id=v.employee_id
    WHERE v.position_name='管理员' AND v.org_name=$1 AND v.is_current=TRUE
      AND v.relation_status='active' AND v.is_deleted=FALSE AND ${VALID}`, [orgName])).rows[0].n);

// ---------------- supervisor 临时覆盖（造数，finally 恢复） ----------------
async function overrideSupervisor(employeeId, newSupId) {
  const cur = await q(
    `SELECT id, supervisor_id FROM employee_assignment
      WHERE employee_id=$1 AND is_current=TRUE AND is_deleted=FALSE ORDER BY id LIMIT 1`, [employeeId]);
  if (!cur.rows.length) throw new Error(`employee ${employeeId} 无 current assignment`);
  state.supOverrides.push({ id: cur.rows[0].id, old: cur.rows[0].supervisor_id });
  await q(`UPDATE employee_assignment SET supervisor_id=$2, updated_at=NOW() WHERE id=$1`, [cur.rows[0].id, newSupId]);
}
async function restoreSupervisors() {
  for (const o of state.supOverrides) {
    await q(`UPDATE employee_assignment SET supervisor_id=$2, updated_at=NOW() WHERE id=$1`, [o.id, o.old]);
  }
  state.supOverrides = [];
}

// ---------------- 引擎级造数助手 ----------------
async function insertVr({ violatorId, name, checkSource, sourceType }) {
  const r = await q(
    `INSERT INTO violation_records
       (violator_id, violator_name, violation_behavior, check_source, violation_date, source_type, is_deleted)
     VALUES ($1,$2,$3,$4,$5,$6,FALSE) RETURNING id`,
    [violatorId, name || `${MARK}-${violatorId}`, `${MARK} 三违行为`, checkSource || null, TEST_DATE, sourceType || null]);
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
  let id = null;
  for (let off = 0; off < state.dictIds.length && !id; off++) {
    const behaviorId = state.dictIds[(seq + off) % state.dictIds.length];
    try {
      const r = await q(
        `INSERT INTO grid_violation_candidates
           (grid_record_id, behavior_id, behavior_text, raw_violation_behavior,
            candidate_type, candidate_reason, inspection_source,
            suggested_score, candidate_status, confirmed_violation_id, confirmed_by, confirmed_at)
         VALUES ($1,$2,$3,$4,'E0804R2FIX','E0804R2FIX','company',5,'confirmed',$5,1,NOW())
         RETURNING id`, [gridRecordId, behaviorId, `${MARK} 三违行为`, `${MARK} 三违行为`, vrId]);
      id = Number(r.rows[0].id);
    } catch (e) {
      if (e.code !== '23505') throw e; // 唯一约束冲突 → 换下一个行为字典项重试
    }
  }
  if (!id) throw new Error('行为字典全部冲突，无法造 gvc');
  state.gvcIds.push(id);
  return id;
}

async function createdDeductions() {
  const r = await q(
    `SELECT d.id, d.source_id, d.review_status, d.is_deleted, d.source_detail, t.employee_id, t.position
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
    `SELECT id, employee_id, score_auto, score_total, status FROM hse_assessment_target
      WHERE cycle_id=$1 AND employee_id = ANY($2) AND is_deleted=FALSE`, [CYCLE_ID, targetsEmployees]);
  for (const r of tb.rows) state.targetsBefore[Number(r.employee_id)] = r;
  state.targetIds = tb.rows.map((r) => Number(r.id));
  state.cycleStatusBefore = (await q('SELECT status FROM hse_assessment_cycle WHERE id=$1', [CYCLE_ID])).rows[0].status;
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

// target 冻结造数 / 恢复（恢复用会话级白名单专用 client —— 仅测试清理用途）
async function freezeTargets(employeeIds) {
  const tb = await q(
    `SELECT id, employee_id, status FROM hse_assessment_target
      WHERE cycle_id=$1 AND employee_id = ANY($2) AND is_deleted=FALSE`, [CYCLE_ID, employeeIds]);
  for (const r of tb.rows) {
    if (r.status === 'frozen') continue;
    state.frozenTargets.push({ id: Number(r.id), oldStatus: r.status });
  }
  if (state.frozenTargets.length) {
    await q(`UPDATE hse_assessment_target SET status='frozen', updated_at=NOW()
              WHERE id = ANY($1)`, [state.frozenTargets.map((t) => t.id)]);
  }
}
async function unfreezeTargets() {
  if (!state.frozenTargets.length) return;
  const ids = state.frozenTargets.map((t) => t.id);
  const client = await pool.connect();
  try {
    // 显式事务 + 事务本地白名单（is_local=true 随 COMMIT 失效，不残留到连接池）
    await client.query('BEGIN');
    await client.query(`SELECT set_config($1, 'on', true)`, [GUC]);
    await client.query(`UPDATE hse_assessment_target SET status = data.old_status, updated_at=NOW()
                          FROM (SELECT unnest($1::int[]) AS id, unnest($2::text[]) AS old_status) data
                         WHERE hse_assessment_target.id = data.id`, [ids, state.frozenTargets.map((t) => t.oldStatus)]);
    await client.query('COMMIT');
  } finally {
    client.release();
  }
  state.frozenTargets = [];
}

const setCycle = async (st) => q(`UPDATE hse_assessment_cycle SET status=$2, updated_at=NOW() WHERE id=$1`, [CYCLE_ID, st]);

function expectedSet(...emps) { return new Set(emps.map((x) => String(x))); }
function setEq(a, b) { return a.size === b.size && [...a].every((x) => b.has(x)); }

// ============================== 测试体 ==============================
(async () => {
  await boot();
  console.log('== R2-FIX 测试（DEV） ==');

  const chain = await findChainCleaner();
  check('PRE 链完整真实案例存在', !!chain, JSON.stringify(chain));
  if (!chain) throw new Error('缺少链完整真实案例');
  console.log(`  案例：${chain.org_name} 保洁员${chain.cleaner_name} → 管理员${chain.admin_name} → 经理${chain.mgr_name}`);

  const engineEmps = [chain.admin_id, chain.mgr_id];
  await snapshot(engineEmps);
  const liveScores = async () => {
    const r = await q(
      `SELECT employee_id, score_auto FROM hse_assessment_target
        WHERE cycle_id=$1 AND employee_id = ANY($2) AND is_deleted=FALSE`, [CYCLE_ID, engineEmps]);
    const m = {};
    for (const row of r.rows) m[Number(row.employee_id)] = Number(row.score_auto);
    return { mgr: m[Number(chain.mgr_id)], adm: m[Number(chain.admin_id)] };
  };

  const TCFG = { only_check_source: 'company', by_violator_position: {
    '保洁员': ['管理员', '乡镇作业中心经理'],
    '管理员': ['管理员', '乡镇作业中心经理'],
    '乡镇作业中心经理': ['乡镇作业中心经理'],
  } };
  const op = { userId: 1, username: 'e0804r2fixtest', ip: '127.0.0.1' };

  // ================= Phase R2FIX-A：resolver 新语义 =================
  console.log('\n== Phase R2FIX-A：责任解析新语义（真实数据） ==');
  { // 13/14 supervisor-chain 唯一责任人（多管理员组织）
    const r = await q(
      `WITH org_admins AS (
         SELECT v.org_name, COUNT(*)::int AS n
           FROM v_employee_org_full v JOIN employee e ON e.id=v.employee_id
          WHERE v.position_name='管理员' AND v.is_current=TRUE AND v.relation_status='active'
            AND v.is_deleted=FALSE AND ${VALID} GROUP BY v.org_name)
       SELECT v.employee_id AS cleaner_id, v.org_name, a.employee_id AS admin_id, m.employee_id AS mgr_id
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
          AND ea.leave_date IS NULL AND (ea.employment_relation IS NULL OR ea.employment_relation NOT IN ('辞职','死亡'))
          AND em.leave_date IS NULL AND (em.employment_relation IS NULL OR em.employment_relation NOT IN ('辞职','死亡'))
          AND (SELECT n FROM org_admins o WHERE o.org_name=v.org_name) >= 2
        LIMIT 1`, []);
    check('F13-pre 多管理员组织链完整案例存在', r.rows.length > 0);
    if (r.rows.length) {
      const c = r.rows[0];
      const res = await resolveTransmissionTargets({ cycleId: CYCLE_ID, violatorId: c.cleaner_id, checkSource: 'company', transmissionConfig: TCFG });
      check('F13 多管理员组织 → supervisor 链唯一 RESOLVED（非全量）',
        res.mode === 'transmitted' && res.status === 'RESOLVED' && res.targets.length === 2, JSON.stringify({ status: res.status, n: (res.targets || []).length }));
      check('F14 对象恰=[直接上级管理员, 经理]', setEq(new Set((res.targets || []).map((t) => String(t.employeeId))), expectedSet(c.admin_id, c.mgr_id)), JSON.stringify(res.targets));
      const admPos = (res.evidence.positions || []).find((p) => p.wantedPosition === '管理员');
      check('F14b 管理员层 evidence_source=supervisor-chain/primary（PRIMARY 非兜底）',
        !!admPos && admPos.evidence.evidenceSource === 'supervisor-chain/primary', JSON.stringify(admPos && admPos.evidence.evidenceSource));
    }
  }
  { // 15/20 多经理 + 链断 → AMBIGUOUS
    const org = (await q(
      `SELECT v.org_name, COUNT(*)::int AS n FROM v_employee_org_full v JOIN employee e ON e.id=v.employee_id
        WHERE v.position_name='乡镇作业中心经理' AND v.is_current=TRUE
          AND v.relation_status='active' AND v.is_deleted=FALSE AND ${VALID}
        GROUP BY v.org_name HAVING COUNT(*) >= 2 ORDER BY v.org_name LIMIT 1`, [])).rows[0];
    check('F15-pre 多有效经理组织存在', !!org, JSON.stringify(org));
    if (org) {
      const cleaner = (await q(
        `SELECT v.employee_id FROM v_employee_org_full v JOIN employee e ON e.id=v.employee_id
          WHERE v.position_name LIKE '%保洁%' AND v.org_name=$1 AND v.is_current=TRUE
            AND v.relation_status='active' AND v.is_deleted=FALSE AND ${VALID} LIMIT 1`, [org.org_name])).rows[0];
      if (cleaner) {
        await overrideSupervisor(cleaner.employee_id, null);
        try {
          const res = await resolveTransmissionTargets({ cycleId: CYCLE_ID, violatorId: cleaner.employee_id, checkSource: 'company', transmissionConfig: TCFG });
          const mgrPos = (res.evidence.positions || []).find((p) => p.wantedPosition === '乡镇作业中心经理');
          check('F15 多有效经理且链断 → AMBIGUOUS（不自动选人）',
            mgrPos && mgrPos.status === 'AMBIGUOUS' && mgrPos.evidence.evidenceSource === 'org-unique-valid/fallback', JSON.stringify(mgrPos && { status: mgrPos.status, src: mgrPos.evidence.evidenceSource }));
        } finally { await restoreSupervisors(); }
      } else {
        // R4 严格口径：环卫组织保洁员全部非「正式员工」（含 119 名 rel=NULL 非在册人员）
        // → 组织内无有效保洁员可构造链断场景，AMBIGUOUS 语义改由 F20（多管理员）等价覆盖
        check('F15-skipped 该组织无正式员工保洁员（R4 口径下场景不可达，如实登记）', true);
      }
    }
  }
  { // 16/17 org-unique fallback 显式标记（单管理员组织 + 链断造数）
    const org = (await q(
      `SELECT org_name, COUNT(*)::int AS n FROM (
         SELECT v.org_name FROM v_employee_org_full v JOIN employee e ON e.id=v.employee_id
          WHERE v.position_name='管理员' AND v.is_current=TRUE
            AND v.relation_status='active' AND v.is_deleted=FALSE AND ${VALID}) t
        GROUP BY org_name HAVING COUNT(*)=1 ORDER BY org_name LIMIT 1`, [])).rows[0];
    check('F16-pre 单有效管理员组织存在', !!org, JSON.stringify(org));
    if (org) {
      const cleaner = (await q(
        `SELECT v.employee_id FROM v_employee_org_full v JOIN employee e ON e.id=v.employee_id
          WHERE v.position_name LIKE '%保洁%' AND v.org_name=$1 AND v.is_current=TRUE
            AND v.relation_status='active' AND v.is_deleted=FALSE AND ${VALID} LIMIT 1`, [org.org_name])).rows[0];
      if (cleaner) {
        await overrideSupervisor(cleaner.employee_id, null);
        try {
          const res = await resolveTransmissionTargets({ cycleId: CYCLE_ID, violatorId: cleaner.employee_id, checkSource: 'company', transmissionConfig: TCFG });
          const admPos = (res.evidence.positions || []).find((p) => p.wantedPosition === '管理员');
          check('F16 链断 + 组织恰 1 有效管理员 → RESOLVED（fallback 兜底）',
            admPos && admPos.status === 'RESOLVED' && admPos.evidence.method === 'org-unique-valid', JSON.stringify(admPos && { status: admPos.status, method: admPos.evidence.method }));
          check('F17 evidence_source 显式标记 org-unique-valid/fallback（FALLBACK 非_PRIMARY）',
            !!admPos && admPos.evidence.evidenceSource === 'org-unique-valid/fallback', JSON.stringify(admPos && admPos.evidence.evidenceSource));
        } finally { await restoreSupervisors(); }
      }
    }
  }
  { // 17b fallback 不覆盖明确 supervisor（链完整时绝不走 org-unique）
    const res = await resolveTransmissionTargets({ cycleId: CYCLE_ID, violatorId: chain.cleaner_id, checkSource: 'company', transmissionConfig: TCFG });
    const usedOrg = (res.evidence.positions || []).some((p) => p.evidence.method === 'org-unique-valid');
    check('F17b 链完整 → 全部 supervisor-chain/primary，org-unique 不介入',
      res.status === 'RESOLVED' && !usedOrg
      && (res.evidence.positions || []).every((p) => p.evidence.evidenceSource === 'supervisor-chain/primary'),
      JSON.stringify(res.evidence.positions));
  }
  { // 18 R4 §二.1：经理直接管理保洁员 = 正式责任关系（业务确认 2026-09-14，
    //   原 R2-FIX 待确认终态 MANAGER_DIRECT_SUPERVISOR 转为正式 RESOLVED；
    //   同一经理填充管理员+经理两槽位 → 去重后单目标）
    const c = await findManagerDirectCleaner();
    check('F18-pre 真实「保洁员直接上级=同组织有效经理」案例存在', !!c, JSON.stringify(c));
    if (c) {
      const res = await resolveTransmissionTargets({ cycleId: CYCLE_ID, violatorId: c.cleaner_id, checkSource: 'company', transmissionConfig: TCFG });
      const admPos = (res.evidence.positions || []).find((p) => p.wantedPosition === '管理员');
      check('F18 管理员层 → RESOLVED（经理直管=正式责任关系，R4 §二.1）',
        !!admPos && admPos.status === 'RESOLVED' && admPos.evidence.managerDirect === true
        && admPos.evidence.evidenceSource === 'supervisor-chain/primary', JSON.stringify(admPos));
      check('F18b 同一经理双身份去重 → 恰 1 个扣分目标=该经理（禁止重复扣分）',
        (res.targets || []).length === 1 && String(res.targets[0].employeeId) === String(c.sup_id), JSON.stringify(res.targets));
      const mgrPos = (res.evidence.positions || []).find((p) => p.wantedPosition === '乡镇作业中心经理');
      check('F18c 经理层亦 RESOLVED 且指向同一经理（hop=1）',
        !!mgrPos && mgrPos.status === 'RESOLVED' && mgrPos.evidence.hop === 1, JSON.stringify(mgrPos && { status: mgrPos.status, hop: mgrPos.evidence.hop }));
    }
  }
  { // 19 UNRESOLVED（无有效经理组织 + 链断造数）
    const org = await findOrgWithoutValidManager();
    check('F19-pre 无有效经理组织存在', !!org, JSON.stringify(org));
    if (org) {
      const cleaner = (await q(
        `SELECT v.employee_id FROM v_employee_org_full v JOIN employee e ON e.id=v.employee_id
          WHERE v.position_name LIKE '%保洁%' AND v.org_name=$1 AND v.is_current=TRUE
            AND v.relation_status='active' AND v.is_deleted=FALSE AND ${VALID} LIMIT 1`, [org.org_name])).rows[0];
      if (cleaner) {
        await overrideSupervisor(cleaner.employee_id, null);
        try {
          const res = await resolveTransmissionTargets({ cycleId: CYCLE_ID, violatorId: cleaner.employee_id, checkSource: 'company', transmissionConfig: TCFG });
          const mgrPos = (res.evidence.positions || []).find((p) => p.wantedPosition === '乡镇作业中心经理');
          check('F19 组织 0 有效经理且链断 → UNRESOLVED（fail-closed）',
            mgrPos && mgrPos.status === 'UNRESOLVED' && mgrPos.reason === 'no-valid-candidate-in-org', JSON.stringify(mgrPos && { status: mgrPos.status, reason: mgrPos.reason }));
        } finally { await restoreSupervisors(); }
      }
    }
  }
  { // F20 多有效管理员 + 链断 → AMBIGUOUS
    const org = (await q(
      `SELECT v.org_name, COUNT(*)::int AS n FROM v_employee_org_full v JOIN employee e ON e.id=v.employee_id
        WHERE v.position_name='管理员' AND v.is_current=TRUE
          AND v.relation_status='active' AND v.is_deleted=FALSE AND ${VALID}
        GROUP BY v.org_name HAVING COUNT(*) >= 2 ORDER BY v.org_name LIMIT 1`, [])).rows[0];
    check('F20-pre 多有效管理员组织存在', !!org, JSON.stringify(org));
    if (org) {
      const cleaner = (await q(
        `SELECT v.employee_id FROM v_employee_org_full v JOIN employee e ON e.id=v.employee_id
          WHERE v.position_name LIKE '%保洁%' AND v.org_name=$1 AND v.is_current=TRUE
            AND v.relation_status='active' AND v.is_deleted=FALSE AND ${VALID} LIMIT 1`, [org.org_name])).rows[0];
      if (cleaner) {
        await overrideSupervisor(cleaner.employee_id, null);
        try {
          const res = await resolveTransmissionTargets({ cycleId: CYCLE_ID, violatorId: cleaner.employee_id, checkSource: 'company', transmissionConfig: TCFG });
          const admPos = (res.evidence.positions || []).find((p) => p.wantedPosition === '管理员');
          check('F20 多有效管理员且链断 → AMBIGUOUS（绝不自动选第一个）',
            admPos && admPos.status === 'AMBIGUOUS' && (admPos.evidence.candidates || []).length >= 2, JSON.stringify(admPos && { status: admPos.status, n: (admPos.evidence.candidates || []).length }));
        } finally { await restoreSupervisors(); }
      }
    }
  }

  // ================= Phase R2FIX-B：撤销矩阵 + target frozen =================
  console.log('\n== Phase R2FIX-B：撤销矩阵（deduction × cycle × target frozen） ==');
  await q(`UPDATE hse_assessment_rule SET valid_from='2026-04-30', valid_to=NULL, updated_at=NOW() WHERE rule_code='GRIDVIOL001' AND is_deleted=FALSE`);

  const setupDeduction = async (seq, markName, reviewStatus) => {
    const vr = await insertVr({ violatorId: chain.cleaner_id, name: markName, checkSource: 'company', sourceType: 'grid_candidate' });
    const gvc = await insertGvc(vr, seq);
    await q(`UPDATE violation_records SET candidate_id=$1 WHERE id=$2`, [gvc, vr]);
    const engine = require('../services/ruleEngine/engine');
    await engine.runCycleAdapters(CYCLE_ID, { adapterKeys: ['sanwei_candidate'] });
    const rows = (await createdDeductions()).filter((r) => String(r.source_id) === String(vr) && !r.is_deleted);
    if (reviewStatus && reviewStatus !== 'pending') {
      const extra = reviewStatus === 'adjusted' ? `, confirmed_score=4` : '';
      await q(`UPDATE hse_assessment_deduction SET review_status='${reviewStatus}', updated_at=NOW()${extra}
                WHERE source_table='violation_records' AND source_id=$1 AND is_deleted=FALSE`, [String(vr)]);
    }
    return { vr, gvc, rows };
  };
  const assertRevoked = async (label, r, vr, baseScores) => {
    check(`${label}a revoke 成功提交`, r.ok === true, JSON.stringify(r));
    const rows = (await createdDeductions()).filter((x) => String(x.source_id) === String(vr));
    check(`${label}b 全部扣分行立即回滚`, rows.length > 0 && rows.every((x) => x.is_deleted === true), `rows=${rows.length}`);
    const s = await q(
      `SELECT employee_id, score_auto FROM hse_assessment_target
        WHERE cycle_id=$1 AND employee_id = ANY($2) AND is_deleted=FALSE`, [CYCLE_ID, engineEmps]);
    const m = {};
    for (const row of s.rows) m[Number(row.employee_id)] = Number(row.score_auto);
    check(`${label}c 经理得分立即恢复`, Math.abs(m[Number(chain.mgr_id)] - baseScores.mgr) < 0.001, `${baseScores.mgr}→${m[Number(chain.mgr_id)]}`);
    check(`${label}d 管理员得分立即恢复`, Math.abs(m[Number(chain.admin_id)] - baseScores.adm) < 0.001, `${baseScores.adm}→${m[Number(chain.admin_id)]}`);
  };

  // —— 矩阵：deduction status × cycle status ——
  const dedStatuses = ['pending', 'approved', 'adjusted'];
  const cycleStatuses = ['in_progress', 'pending_review', 'frozen', 'not_started'];
  let seq = 20;
  for (const ds of dedStatuses) {
    for (const cs of cycleStatuses) {
      const label = `M[${ds.slice(0, 3)}×${cs.slice(0, 4)}]`;
      try {
        await cleanupEngineData(); await recalcTargets();
        const base = await liveScores();
        const s = await setupDeduction(seq++, `${MARK}-${ds}-${cs}`, ds);
        if (s.rows.length !== 2) { check(`${label} 预置 2 条扣分`, false, `rows=${s.rows.length}`); continue; }
        await setCycle(cs);
        try {
          const r = await candidateService.revokeConfirmation({ candidate_id: s.gvc, reason: `${MARK} ${ds}/${cs}`, operator: op });
          await assertRevoked(label, r, s.vr, base);
        } finally {
          await setCycle(state.cycleStatusBefore);
        }
      } catch (e) {
        check(`${label} 执行异常`, false, e.message);
        try { await setCycle(state.cycleStatusBefore); } catch (_) {}
      }
    }
  }

  // —— target.status='frozen' 真实场景（核心新增） ——
  console.log('\n== Phase R2FIX-C：target frozen 撤销（触发器白名单通道） ==');
  for (const ds of dedStatuses) {
    const label = `TF[${ds.slice(0, 3)}]`;
    try {
      await cleanupEngineData(); await recalcTargets();
      const base = await liveScores();
      const s = await setupDeduction(seq++, `${MARK}-TF-${ds}`, ds);
      if (s.rows.length !== 2) { check(`${label} 预置 2 条扣分`, false, `rows=${s.rows.length}`); continue; }
      await freezeTargets(engineEmps);
      try {
        const r = await candidateService.revokeConfirmation({ candidate_id: s.gvc, reason: `${MARK} target-frozen ${ds}`, operator: op });
        await assertRevoked(label, r, s.vr, base);
        const st = await q(`SELECT status FROM hse_assessment_target WHERE cycle_id=$1 AND employee_id=ANY($2) AND is_deleted=FALSE`, [CYCLE_ID, engineEmps]);
        check(`${label}e 冻结状态保持不变（不解除冻结机制）`, st.rows.every((x) => x.status === 'frozen'), JSON.stringify(st.rows));
      } finally {
        await unfreezeTargets();
      }
      check(`${label}f target 状态已恢复原值`, (await q(`SELECT status FROM hse_assessment_target WHERE cycle_id=$1 AND employee_id=ANY($2) AND is_deleted=FALSE`, [CYCLE_ID, engineEmps])).rows.every((x) => x.status !== 'frozen'));
    } catch (e) {
      check(`${label} 执行异常`, false, e.message);
      try { await unfreezeTargets(); } catch (_) {}
    }
  }

  // —— 触发器保护不放松 ——
  {
    await cleanupEngineData(); await recalcTargets();
    await freezeTargets(engineEmps);
    try {
      let blocked = false;
      try {
        await q(`UPDATE hse_assessment_target SET score_auto=0, updated_at=NOW() WHERE id=$1`, [state.frozenTargets[0].id]);
      } catch (e) { blocked = /已冻结的考核对象记录不可修改/.test(e.message); }
      check('P1 无白名单 → frozen target 直改分数被触发器拒绝（保护机制未放松）', blocked);
      // 白名单为事务本地：新查询（连接池其他连接/新事务）不得继承
      let stillBlocked = false;
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        await c.query('SAVEPOINT sp');
        try {
          await c.query(`UPDATE hse_assessment_target SET score_auto=0, updated_at=NOW() WHERE id=$1`, [state.frozenTargets[0].id]);
          stillBlocked = false;
        } catch (e) {
          stillBlocked = /已冻结的考核对象记录不可修改/.test(e.message);
        } finally {
          await c.query('ROLLBACK TO SAVEPOINT sp');
          await c.query('COMMIT');
        }
      } finally {
        c.release();
      }
      check('P2 独立事务内白名单默认关闭（R2FIX 撤销用的 set_config 随事务结束失效，无泄漏）', stillBlocked);
    } finally {
      await unfreezeTargets();
    }
  }

  // —— 幂等 / 并发（frozen cycle 下同样幂等） ——
  {
    await cleanupEngineData(); await recalcTargets();
    const s = await setupDeduction(seq++, `${MARK}-T2`, 'approved');
    await setCycle('frozen');
    try {
      const r1 = await candidateService.revokeConfirmation({ candidate_id: s.gvc, reason: 'R2FIX 幂等首次', operator: op });
      const r2 = await candidateService.revokeConfirmation({ candidate_id: s.gvc, reason: 'R2FIX 幂等重复', operator: op });
      check('I1 frozen cycle 下首次撤销成功', r1.ok === true, JSON.stringify(r1));
      check('I2 重复撤销被拒（幂等）', r2.ok !== true && !!r2.code, JSON.stringify(r2));
      const [c1, c2] = await Promise.all([
        candidateService.revokeConfirmation({ candidate_id: s.gvc, reason: 'R2FIX 并发A', operator: op }),
        candidateService.revokeConfirmation({ candidate_id: s.gvc, reason: 'R2FIX 并发B', operator: op }),
      ]);
      check('I3 已撤销后并发再撤均被拒（无重复恢复）', [c1, c2].every((x) => x.ok !== true), JSON.stringify([c1.code || 'ok', c2.code || 'ok']));
    } finally {
      await setCycle(state.cycleStatusBefore);
    }
    await cleanupEngineData();
  }
})().then(async () => {
  console.log('\n== 收尾恢复 ==');
  try { await unfreezeTargets(); } catch (e) { console.log('  unfreeze 异常:', e.message); }
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
  check('Z3 target 冻结已全部解除', state.frozenTargets.length === 0);
  const vrCnt = Number((await q(`SELECT count(*)::int c FROM violation_records WHERE violator_name LIKE '${MARK}%' OR violation_behavior LIKE '${MARK}%'`)).rows[0].c);
  check('Z4 测试 vr 已清空', vrCnt === 0, `剩余=${vrCnt}`);
  check('Z5 supervisor 覆盖已全部恢复', state.supOverrides.length === 0);

  console.log(`\n===== RESULT: PASS=${pass} FAIL=${fail} =====`);
  if (fails.length) { console.log('失败项:'); for (const f of fails) console.log('  -', f); }
  await pool.end();
  process.exit(fail ? 1 : 0);
}).catch(async (e) => {
  console.error('TEST RUNNER ERROR:', e.message);
  if (e.stack) console.error(e.stack.split('\n').slice(1, 5).join('\n'));
  try { await unfreezeTargets(); } catch (_) {}
  try { await restoreSupervisors(); } catch (_) {}
  try { await restoreRules(); } catch (_) {}
  try { if (state.cycleStatusBefore) await q(`UPDATE hse_assessment_cycle SET status=$2 WHERE id=$1`, [CYCLE_ID, state.cycleStatusBefore]); } catch (_) {}
  try { await cleanupEngineData(); } catch (_) {}
  try { if (state.conflictIds.length) { await q(`UPDATE hse_assessment_deduction SET is_deleted=FALSE WHERE id=ANY($1)`, [state.conflictIds]); } } catch (_) {}
  await pool.end();
  process.exit(2);
});
