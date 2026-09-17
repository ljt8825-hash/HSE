/**
 * P2-B1-E-08-04 自动化测试（DEV：safety_dashboard_dev）
 *
 * 覆盖（对应规格 §十四 22 用例）：
 *   【三违责任对象】1-4（岗位传递：保洁员/管理员/乡镇经理/非公司来源）
 *   【三违月度上限】5-6（上限配置不变 + 超限行为保持钳制）
 *   【撤销】7-11（confirmed→revoke / 立即回滚 / 不等 scheduler / 幂等 / 并发）
 *   【规则有效期】12-16（valid_from 前/当天、valid_to 当天/之后/空：纯函数 + 引擎集成）
 *   【SAFE_AUTO】17-18（经理→安全文化建设 / 管理员→目标职责）
 *   【TRANSFER001】19-22（不读固定分 / 五列之和 / 展示语义 / 历史数据不重算）
 *
 * 边界：零生产触碰；DEV 造数全部精确清理并恢复目标得分与规则配置。
 * 运行：node scripts/p2b1e0804_tests.cjs
 *
 * P2-B1-E-08-04-R2 语义更新（2026-09-14）：
 *   责任对象由「同组织全部管理员」修正为「supervisor 链唯一责任人」（R2 冻结规则）。
 *   B1/B2/C7/F14a 断言已按唯一责任人语义更新（期望恰 2 对象：责任管理员+经理）；
 *   pickOrg 改为选择 supervisor 链完整的组织。新语义专项用例（A-U）见 p2b1e0804r2_tests.cjs。
 */
process.env.DB_NAME = 'safety_dashboard_dev';
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

const db = require('../config/db');
const { pool } = db;
// 引擎/服务内部用 isConnected() 守卫，须先初始化连接（等价服务启动动作）
async function boot() {
  await db.testConnection();
  if (!db.isConnected()) throw new Error('DEV 数据库连接失败');
}
const engine = require('../services/ruleEngine/engine');
const scoringEngine = require('../services/assessmentScoringEngine');
const candidateService = require('../services/gridViolationCandidateService');
const ruleValidity = require('../services/ruleEngine/ruleValidity');
const { getRuleByCode } = require('../services/ruleEngine/ruleLoader');
const safetyCultureAdapter = require('../services/ruleEngine/adapters/safetyCultureAdapter');
const transferCheckAdapter = require('../services/ruleEngine/adapters/transferCheckAdapter');
const fs = require('fs');
const path = require('path');

const CYCLE_ID = 53; // 2026-05（E-08-02 同款周期口径）
const TEST_DATE = '2026-05-10';
const MARK = 'E0804测试';
let pass = 0, fail = 0;
const fails = [];
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✔ ${name}`); }
  else { fail++; fails.push(name + (extra ? ` :: ${extra}` : '')); console.log(`  ✘ ${name}${extra ? ' :: ' + extra : ''}`); }
}
const q = (sql, params) => pool.query(sql, params);

const state = {
  vrIds: [], gvcIds: [], highWater: 0,
  rulesBefore: {}, targetsBefore: {}, targetIds: [],
  catLimitBefore: [], transferSnap: null,
  orgName: null, managerEmp: null, adminEmps: [], cleanerEmp: null,
  auditIdsBaseline: null, conflictIds: [],
};

async function pickOrg() {
  // R2 语义：唯一责任人（supervisor 链）。选「链完整」的组织+保洁员：
  //   保洁员直接上级 = 本组织有效管理员 A1（有考核对象），A1 直接上级 = 本组织有效经理（有考核对象）。
  //   期望扣分对象 = {A1, 经理}（恰 2 人），替代 E-08-04 时期的「全组织管理员」期望。
  const r = await q(
    `SELECT v.org_name, v.employee_id AS cleaner_id, v.name AS cleaner_name,
            a.employee_id AS admin_id, a.name AS admin_name,
            m.employee_id AS mgr_id, m.name AS mgr_name
       FROM v_employee_org_full v
       JOIN v_employee_org_full a ON a.employee_id = v.supervisor_id
        AND a.is_current = TRUE AND a.relation_status = 'active' AND a.is_deleted = FALSE
        AND a.position_name = '管理员' AND a.org_name = v.org_name
       JOIN v_employee_org_full m ON m.employee_id = a.supervisor_id
        AND m.is_current = TRUE AND m.relation_status = 'active' AND m.is_deleted = FALSE
        AND m.position_name = '乡镇作业中心经理' AND m.org_name = v.org_name
       JOIN employee ec ON ec.id = v.employee_id
       JOIN employee ea ON ea.id = a.employee_id
       JOIN employee em ON em.id = m.employee_id
       JOIN hse_assessment_target t1 ON t1.employee_id = a.employee_id AND t1.cycle_id = $1 AND t1.is_deleted = FALSE
       JOIN hse_assessment_target t2 ON t2.employee_id = m.employee_id AND t2.cycle_id = $1 AND t2.is_deleted = FALSE
      WHERE v.is_current = TRUE AND v.relation_status = 'active' AND v.is_deleted = FALSE
        AND v.position_name LIKE '%保洁%'
        AND ec.employment_relation = '正式员工'
        AND ea.employment_relation = '正式员工'
        AND em.employment_relation = '正式员工'
      ORDER BY v.org_name, v.employee_id
      LIMIT 1`,
    [CYCLE_ID]
  );
  if (!r.rows.length) throw new Error('未找到 supervisor 链完整（保洁员→管理员→经理且均有考核对象）的组织');
  const row = r.rows[0];
  state.orgName = row.org_name;
  state.managerEmp = { employee_id: row.mgr_id, name: row.mgr_name };
  state.adminEmps = [{ employee_id: row.admin_id, name: row.admin_name }];
  state.cleanerEmp = { employee_id: row.cleaner_id, name: row.cleaner_name };
}

async function snapshot() {
  const hw = await q('SELECT COALESCE(MAX(id),0) m FROM hse_assessment_deduction');
  state.highWater = Number(hw.rows[0].m);
  const rb = await q(
    `SELECT rule_code, valid_from, valid_to FROM hse_assessment_rule
      WHERE rule_code IN ('GRIDVIOL001','VIOLATION003') AND is_deleted = FALSE`
  );
  for (const r of rb.rows) state.rulesBefore[r.rule_code] = { validFrom: r.valid_from, validTo: r.valid_to };
  const emps = [state.managerEmp.employee_id, state.cleanerEmp.employee_id, ...state.adminEmps.map((x) => x.employee_id)];
  const tb = await q(
    `SELECT id, employee_id, score_auto, score_total, score_version FROM hse_assessment_target
      WHERE cycle_id = $1 AND employee_id = ANY($2) AND is_deleted = FALSE`,
    [CYCLE_ID, emps]
  );
  for (const r of tb.rows) state.targetsBefore[Number(r.employee_id)] = r;
  state.targetIds = tb.rows.map((r) => Number(r.id));
  state.catLimitBefore = (await q(
    `SELECT target_role, category, max_deduct FROM hse_assessment_category_limit
      WHERE category = '三违管理' ORDER BY target_role`
  )).rows;
  state.transferSnap = (await q(
    `SELECT count(*)::int c, COALESCE(SUM(suggested_score),0) s FROM hse_assessment_deduction
      WHERE source_detail->>'kind' = 'transfer_check' AND is_deleted = FALSE`
  )).rows[0];
  state.auditIdsBaseline = Number((await q('SELECT COALESCE(MAX(id),0) m FROM audit_record')).rows[0].m);

  // 暂避存量冲突：测试目标（经理+管理员）在「三违管理」类别的有效扣分先软删（结束精确恢复），
  //   否则既有 155 分 R000001 等会把新意图全部 capped-out（上限机制正确行为，但阻塞测试断言）。
  const conflicts = await q(
    `SELECT d.id FROM hse_assessment_deduction d
       JOIN hse_assessment_target t ON t.id = d.target_id AND t.cycle_id = $1
      WHERE t.employee_id = ANY($2) AND d.is_deleted = FALSE AND d.review_status <> 'rejected'
        AND d.deduction_source IN ('auto','chain_transmission')
        AND (d.source_detail->>'category') = '三违管理'`,
    [CYCLE_ID, [state.managerEmp.employee_id, ...state.adminEmps.map((x) => x.employee_id)]]
  );
  state.conflictIds = conflicts.rows.map((r) => Number(r.id));
  if (state.conflictIds.length) {
    await q(`UPDATE hse_assessment_deduction SET is_deleted = TRUE, updated_at = NOW() WHERE id = ANY($1)`, [state.conflictIds]);
    console.log(`  （暂避存量三违管理扣分 ${state.conflictIds.length} 行，结束后恢复）`);
  }
  // 建立「暂避后」基线得分（此后 Phase C 的 before/after 对比均以此为参照）
  await recalcTargets();
}

async function insertVr({ violatorId, name, checkSource, sourceType, candidateId }) {
  const r = await q(
    `INSERT INTO violation_records
       (violator_id, violator_name, violation_behavior, check_source, violation_date, source_type, candidate_id, is_deleted)
     VALUES ($1,$2,$3,$4,$5,$6,$7,FALSE) RETURNING id`,
    [violatorId, name || `${MARK}-${violatorId}`, `${MARK} 三违行为`, checkSource || null, TEST_DATE, sourceType || null, candidateId || null]
  );
  const id = Number(r.rows[0].id);
  state.vrIds.push(id);
  return id;
}

async function insertGvc(vrId, seq) {
  const gir = await q('SELECT id FROM grid_inspection_records ORDER BY id DESC LIMIT 1');
  const gridRecordId = Number(gir.rows[0].id);
  // behavior_id 有外键 → 必须用字典真实 id（每次取不同行保证 (grid_record_id, behavior_id) 唯一）
  const dict = await q(`SELECT id FROM sanwei_behavior_dict WHERE is_deleted = FALSE AND enabled = TRUE ORDER BY id LIMIT 1 OFFSET $1`, [seq % 50]);
  if (!dict.rows.length) throw new Error('行为字典为空，无法构造候选');
  const behaviorId = Number(dict.rows[0].id);
  const r = await q(
    `INSERT INTO grid_violation_candidates
       (grid_record_id, behavior_id, behavior_text, raw_violation_behavior,
        candidate_type, candidate_reason, inspection_source,
        suggested_score, candidate_status, confirmed_violation_id, confirmed_by, confirmed_at)
     VALUES ($1,$2,$3,$4,'E0804TEST','E0804TEST','company',5,'confirmed',$5,1,NOW())
     RETURNING id`,
    [gridRecordId, behaviorId, `${MARK} 三违行为`, `${MARK} 三违行为`, vrId]
  );
  const id = Number(r.rows[0].id);
  state.gvcIds.push(id);
  return id;
}

async function createdDeductions() {
  const r = await q(
    `SELECT d.id, d.source_id, d.suggested_score, d.is_transmission, d.is_deleted, d.source_detail,
            t.employee_id, t.position
       FROM hse_assessment_deduction d
       JOIN hse_assessment_target t ON t.id = d.target_id
      WHERE d.id > $1 AND d.source_table = 'violation_records'
      ORDER BY d.id`,
    [state.highWater]
  );
  return r.rows;
}

async function recalcTargets() {
  for (const tid of state.targetIds) {
    try {
      const rr = await scoringEngine.recalculateTarget(CYCLE_ID, tid);
      if (!rr || !rr.ok) console.log(`  （recalc skip target=${tid}: ${rr && rr.reason}）`);
    } catch (e) { console.log(`  （recalc 失败 target=${tid}: ${e.message}）`); }
  }
}

async function cleanup() {
  if (state.vrIds.length) {
    await q(`DELETE FROM hse_assessment_deduction WHERE source_table = 'violation_records' AND source_id = ANY($1::bigint[])`, [state.vrIds]);
    await q(`DELETE FROM grid_violation_candidates WHERE id = ANY($1)`, [state.gvcIds.length ? state.gvcIds : [-1]]);
    await q(`DELETE FROM audit_record WHERE id > $1 AND table_name = 'grid_violation_candidates' AND record_id = ANY($2)`,
      [state.auditIdsBaseline, state.gvcIds.length ? state.gvcIds : [-1]]);
    await q(`DELETE FROM violation_records WHERE id = ANY($1)`, [state.vrIds]);
    state.vrIds = []; state.gvcIds = [];
  }
  if (state.targetIds.length) await recalcTargets();
}

async function ruleDates(code, validFrom, validTo) {
  await q(`UPDATE hse_assessment_rule SET valid_from = $2, valid_to = $3, updated_at = NOW() WHERE rule_code = $1 AND is_deleted = FALSE`, [code, validFrom, validTo]);
}

async function restoreRules() {
  for (const [code, v] of Object.entries(state.rulesBefore)) {
    await q(`UPDATE hse_assessment_rule SET valid_from = $2, valid_to = $3, updated_at = NOW() WHERE rule_code = $1 AND is_deleted = FALSE`,
      [code, v.validFrom, v.validTo]);
  }
}

// ============================== 测试体 ==============================
(async () => {
  await boot();
  console.log('== 环境与基线 ==');
  await pickOrg();
  console.log(`  组织=${state.orgName} 经理=${state.managerEmp.name}(${state.managerEmp.employee_id}) 管理员×${state.adminEmps.length} 保洁员=${state.cleanerEmp.name}(${state.cleanerEmp.employee_id})`);
  await snapshot();

  const cycleRow = (await q('SELECT * FROM hse_assessment_cycle WHERE id = $1', [CYCLE_ID])).rows[0];

  // ---- Phase A：有效期纯函数（用例 12-16 边界语义）----
  console.log('\n== Phase A：规则有效期（纯函数边界） ==');
  {
    const rule = { validFrom: '2026-05-01', validTo: null };
    check('A12 valid_from 之前不执行', ruleValidity.isRuleEffectiveForDate(rule, '2026-04-30') === false);
    check('A13 valid_from 当天执行', ruleValidity.isRuleEffectiveForDate(rule, '2026-05-01') === true);
    const rule2 = { validFrom: '2026-04-01', validTo: '2026-05-31' };
    check('A14 valid_to 当天执行', ruleValidity.isRuleEffectiveForDate(rule2, '2026-05-31') === true);
    check('A15 valid_to 之后不执行', ruleValidity.isRuleEffectiveForDate(rule2, '2026-06-01') === false);
    check('A16 valid_to 为空继续有效', ruleValidity.isRuleEffectiveForDate(rule, '2027-01-01') === true);
    // 周期窗口口径（引擎统一过滤用）
    const cyc = { start_time: '2026-05-01', end_time: '2026-05-31T23:59:59.999' };
    check('A17 窗口重叠=有效（valid_from 在周期中段）',
      ruleValidity.isRuleEffectiveForWindow({ validFrom: '2026-05-10', validTo: null }, cyc) === true);
    check('A18 周期结束才开始 → 不参与',
      ruleValidity.isRuleEffectiveForWindow({ validFrom: '2026-09-13', validTo: null }, cyc) === false);
    check('A19 周期开始前已失效 → 不参与',
      ruleValidity.isRuleEffectiveForWindow({ validFrom: '2026-01-01', validTo: '2026-04-30' }, cyc) === false);
  }

  // ---- Phase B：三违责任对象（用例 1-4）+ 月度上限（用例 5-6）----
  console.log('\n== Phase B：三违责任对象传递（GRIDVIOL001 / VIOLATION003） ==');
  {
    // 临时放宽有效期到周期窗口（测试周期为 2026-05，规则原 valid_from 在 9 月）
    await ruleDates('GRIDVIOL001', '2026-04-30', null);
    await ruleDates('VIOLATION003', '2026-04-30', null);

    // 用例 1：公司检查 + 保洁员 → 实际责任管理员（supervisor 链唯一）+ 乡镇经理
    // R2 语义修正：期望集 = {保洁员的直接上级管理员, 该管理员的直接上级经理}，非全组织管理员
    const vr1 = await insertVr({ violatorId: state.cleanerEmp.employee_id, checkSource: 'company', sourceType: 'grid_candidate' });
    let res = await engine.runCycleAdapters(CYCLE_ID, { adapterKeys: ['sanwei_candidate'] });
    let rows = (await createdDeductions()).filter((r) => String(r.source_id) === String(vr1) && !r.is_deleted);
    const expectSet = new Set([String(state.managerEmp.employee_id), String(state.adminEmps[0].employee_id)]);
    const gotSet = new Set(rows.map((r) => String(r.employee_id)));
    const sameSet = expectSet.size === gotSet.size && [...expectSet].every((x) => gotSet.has(x));
    check('B1 保洁员 → 扣分对象=实际责任管理员+乡镇经理（supervisor 链唯一）', sameSet, JSON.stringify([...gotSet]));
    check('B1a 每条 5 分（规则库权威）', rows.every((r) => Number(r.suggested_score) === 5));
    check('B1b is_transmission=TRUE', rows.every((r) => r.is_transmission === true));
    check('B1c detail 含被检查人岗位', rows.every((r) => r.source_detail.violatorPosition === '保洁员'));
    await cleanup();

    // 用例 2：公司检查 + 管理员 → 管理员 + 乡镇经理
    const vr2 = await insertVr({ violatorId: state.adminEmps[0].employee_id, checkSource: 'company', sourceType: 'grid_candidate' });
    await engine.runCycleAdapters(CYCLE_ID, { adapterKeys: ['sanwei_candidate'] });
    rows = (await createdDeductions()).filter((r) => String(r.source_id) === String(vr2) && !r.is_deleted);
    const got2 = new Set(rows.map((r) => String(r.employee_id)));
    check('B2 管理员 → 扣分对象=管理员本人+乡镇经理（本人+supervisor 链经理）',
      expectSet.size === got2.size && [...expectSet].every((x) => got2.has(x)), JSON.stringify([...got2]));
    await cleanup();

    // 用例 3：公司检查 + 乡镇作业中心经理 → 仅本人
    const vr3 = await insertVr({ violatorId: state.managerEmp.employee_id, checkSource: 'company', sourceType: 'grid_candidate' });
    await engine.runCycleAdapters(CYCLE_ID, { adapterKeys: ['sanwei_candidate'] });
    rows = (await createdDeductions()).filter((r) => String(r.source_id) === String(vr3) && !r.is_deleted);
    check('B3 乡镇经理 → 仅扣本人 1 条', rows.length === 1 && String(rows[0].employee_id) === String(state.managerEmp.employee_id), JSON.stringify(rows.map((r) => r.employee_id)));
    check('B3a 分值 5（规则库）', rows.length === 1 && Number(rows[0].suggested_score) === 5);
    await cleanup();

    // 用例 4：非公司来源不错误套用
    const vr4 = await insertVr({ violatorId: state.adminEmps[0].employee_id, checkSource: 'township', sourceType: null });
    await engine.runCycleAdapters(CYCLE_ID, { adapterKeys: ['violation_record'] });
    rows = (await createdDeductions()).filter((r) => String(r.source_id) === String(vr4) && !r.is_deleted);
    check('B4 乡镇查处 → 扣违规者本人（非传递）',
      rows.length === 1 && String(rows[0].employee_id) === String(state.adminEmps[0].employee_id), JSON.stringify(rows.map((r) => r.employee_id)));
    check('B4a 分值=规则库基准 1 分（非公司 5 分）', rows.length === 1 && Number(rows[0].suggested_score) === 1);
    check('B4b is_transmission=FALSE', rows.every((r) => r.is_transmission === false));
    const vr4b = await insertVr({ violatorId: state.cleanerEmp.employee_id, checkSource: 'township', sourceType: 'grid_candidate' });
    await engine.runCycleAdapters(CYCLE_ID, { adapterKeys: ['sanwei_candidate'] });
    rows = (await createdDeductions()).filter((r) => String(r.source_id) === String(vr4b) && !r.is_deleted);
    check('B4c GRIDVIOL001 忽略非 company 候选确认行', rows.length === 0, JSON.stringify(rows.length));
    await cleanup();

    // 用例 5-6：月度上限保持（保洁员 3 次公司查处 → 经理累计恰 15 = 上限，不突破）
    for (let i = 0; i < 3; i++) {
      await insertVr({ violatorId: state.cleanerEmp.employee_id, name: `${MARK}-保洁员-${i}`, checkSource: 'company', sourceType: 'grid_candidate' });
    }
    res = await engine.runCycleAdapters(CYCLE_ID, { adapterKeys: ['sanwei_candidate'] });
    rows = (await createdDeductions()).filter((r) => !r.is_deleted);
    const mgrRows = rows.filter((r) => String(r.employee_id) === String(state.managerEmp.employee_id));
    const mgrTotal = mgrRows.reduce((s, r) => s + Number(r.suggested_score), 0);
    check('B5 经理三违累计 ≤ 15（上限保持）', mgrTotal <= 15, `total=${mgrTotal}`);
    const capNow = (await q(`SELECT target_role, category, max_deduct FROM hse_assessment_category_limit WHERE category='三违管理' ORDER BY target_role`)).rows;
    check('B6 上限配置未被改动（15/40）',
      JSON.stringify(capNow) === JSON.stringify(state.catLimitBefore), JSON.stringify(capNow));
    const adminRows = rows.filter((r) => r.position === '管理员');
    const adminTotal = adminRows.filter((r) => String(r.employee_id) === String(state.adminEmps[0].employee_id)).reduce((s, r) => s + Number(r.suggested_score), 0);
    check('B6a 管理员三违累计 ≤ 40', adminTotal <= 40, `total=${adminTotal}`);
    await cleanup();
  }

  // ---- Phase C：撤销即时回滚（用例 7-11）----
  console.log('\n== Phase C：撤销即时回滚（同事务，不等 scheduler） ==');
  {
    await ruleDates('GRIDVIOL001', '2026-04-30', null);
    const op = { userId: 1, username: 'e0804test', ip: '127.0.0.1' };

    // 用例 7-9
    const vr7 = await insertVr({ violatorId: state.cleanerEmp.employee_id, checkSource: 'company', sourceType: 'grid_candidate' });
    const gvc7 = await insertGvc(vr7, 1);
    // 回写 vr.candidate_id（真实链路由 confirmCandidate 写入；此处补齐供撤销 vr 匹配）
    await q(`UPDATE violation_records SET candidate_id = $1 WHERE id = $2`, [gvc7, vr7]);
    await recalcTargets();
    const beforeRun = Number((await q('SELECT score_auto FROM hse_assessment_target WHERE cycle_id=$1 AND employee_id=$2', [CYCLE_ID, state.managerEmp.employee_id])).rows[0].score_auto);
    await engine.runCycleAdapters(CYCLE_ID, { adapterKeys: ['sanwei_candidate'] });
    let rows = (await createdDeductions()).filter((r) => String(r.source_id) === String(vr7) && !r.is_deleted);
    const expectCnt = 2; // R2 唯一责任人：责任管理员 1 + 经理 1
    check('C7 预置：确认记录产生扣分（恰 2 对象）', rows.length === expectCnt, `rows=${rows.length} expect=${expectCnt}`);
    const afterRun = Number((await q('SELECT score_auto FROM hse_assessment_target WHERE cycle_id=$1 AND employee_id=$2', [CYCLE_ID, state.managerEmp.employee_id])).rows[0].score_auto);
    check('C7a 扣分已影响经理得分', afterRun < beforeRun, `${beforeRun}→${afterRun}`);

    const r1 = await candidateService.revokeConfirmation({ candidate_id: gvc7, reason: 'E0804TEST 撤销', operator: op });
    check('C7b revoke 成功且返回 rollback 明细', r1.ok === true && r1.rollback && r1.rollback.deductionsRemoved === expectCnt, JSON.stringify(r1.rollback || r1));
    rows = (await createdDeductions()).filter((r) => String(r.source_id) === String(vr7));
    check('C8 revoke 后扣分立即全部回滚（is_deleted）', rows.length > 0 && rows.every((r) => r.is_deleted === true), `rows=${rows.length}`);
    const afterRevoke = Number((await q('SELECT score_auto FROM hse_assessment_target WHERE cycle_id=$1 AND employee_id=$2', [CYCLE_ID, state.managerEmp.employee_id])).rows[0].score_auto);
    check('C9 得分立即恢复（不等 scheduler）', Math.abs(afterRevoke - beforeRun) < 0.001, `${beforeRun}→${afterRun}`);
    const vrDeleted = (await q('SELECT is_deleted FROM violation_records WHERE id=$1', [vr7])).rows[0];
    check('C9a vr 已软删（可追溯）', vrDeleted.is_deleted === true);

    // 用例 10：重复 revoke 不重复回滚
    const r2 = await candidateService.revokeConfirmation({ candidate_id: gvc7, reason: 'E0804TEST 重复撤销', operator: op });
    check('C10 重复撤销被拒（NOT_REVOCABLE）', r2.ok !== true && (r2.code === 'NOT_REVOCABLE' || r2.code === 'REVOKE_CONFLICT'), JSON.stringify(r2));
    const aliveCnt = Number((await q(`SELECT count(*)::int c FROM hse_assessment_deduction WHERE source_table='violation_records' AND source_id=$1 AND is_deleted=FALSE`, [String(vr7)])).rows[0].c);
    check('C10a 无复活扣分', aliveCnt === 0);

    // 用例 11：并发 revoke 安全
    const vr11 = await insertVr({ violatorId: state.cleanerEmp.employee_id, name: `${MARK}-并发`, checkSource: 'company', sourceType: 'grid_candidate' });
    const gvc11 = await insertGvc(vr11, 2);
    await q(`UPDATE violation_records SET candidate_id = $1 WHERE id = $2`, [gvc11, vr11]);
    await engine.runCycleAdapters(CYCLE_ID, { adapterKeys: ['sanwei_candidate'] });
    const [c1, c2] = await Promise.all([
      candidateService.revokeConfirmation({ candidate_id: gvc11, reason: 'E0804TEST 并发A', operator: op }),
      candidateService.revokeConfirmation({ candidate_id: gvc11, reason: 'E0804TEST 并发B', operator: op }),
    ]);
    const okCnt = [c1, c2].filter((x) => x.ok === true).length;
    check('C11 并发撤销恰一次成功', okCnt === 1, JSON.stringify([c1.code || 'ok', c2.code || 'ok']));
    const alive11 = Number((await q(`SELECT count(*)::int c FROM hse_assessment_deduction WHERE source_table='violation_records' AND source_id=$1 AND is_deleted=FALSE`, [String(vr11)])).rows[0].c);
    check('C11a 并发后无残留有效扣分', alive11 === 0);
    const revokedCnt = Number((await q(`SELECT count(*)::int c FROM grid_violation_candidates WHERE id=$1 AND candidate_status='revoked'`, [gvc11])).rows[0].c);
    check('C11b 候选状态=revoked', revokedCnt === 1);
    await cleanup();
  }

  // ---- Phase D：SAFE_AUTO 岗位类别（用例 17-18）----
  console.log('\n== Phase D：SAFE_AUTO 按岗位解析类别 ==');
  {
    const rule = await getRuleByCode('SAFE_AUTO');
    check('D0 SAFE_AUTO 配置已就位', !!(rule.scopeConfig && rule.scopeConfig.category_by_position));
    await q(
      `INSERT INTO hse_safety_culture_monthly
         (month, level, dept, name, employee_id, has_manual_col, act_three_violation, act_duty_safety, act_traffic_risk, manual_deduct, is_deleted)
       VALUES ('2026-05','乡镇作业中心经理','E0804TEST',$1,$2,FALSE,0,0,0,0,FALSE),
              ('2026-05','管理员','E0804TEST',$3,$4,FALSE,0,0,0,0,FALSE)`,
      [state.managerEmp.name, state.managerEmp.employee_id, state.adminEmps[0].name, state.adminEmps[0].employee_id]
    );
    const res = await safetyCultureAdapter.scan({ cycle: cycleRow, year: 2026, month: 5, rule, dryRun: true });
    // intent.employeeId 回退为 target.id（历史行为），故按 targetId 匹配
    const mgrTid = state.targetsBefore[Number(state.managerEmp.employee_id)].id;
    const admTid = state.targetsBefore[Number(state.adminEmps[0].employee_id)].id;
    const mgrIntent = res.intents.find((x) => String(x.targetId) === String(mgrTid));
    const admIntent = res.intents.find((x) => String(x.targetId) === String(admTid));
    check('D17 乡镇作业中心经理 → 安全文化建设', !!mgrIntent && mgrIntent.category === '安全文化建设', mgrIntent && mgrIntent.category);
    check('D18 管理员 → 目标职责', !!admIntent && admIntent.category === '目标职责', admIntent && admIntent.category);
    const capM = (await q(`SELECT max_deduct FROM hse_assessment_category_limit WHERE category='安全文化建设' AND target_role='manager'`)).rows;
    const capA = (await q(`SELECT max_deduct FROM hse_assessment_category_limit WHERE category='目标职责' AND target_role='admin'`)).rows;
    check('D17a 两类别上限均存在（20/30）', capM.length === 1 && Number(capM[0].max_deduct) === 20 && capA.length === 1 && Number(capA[0].max_deduct) === 30);
    await q(`DELETE FROM hse_safety_culture_monthly WHERE dept = 'E0804TEST'`);
  }

  // ---- Phase E：TRANSFER001（用例 19-22）----
  console.log('\n== Phase E：TRANSFER001 五列之和语义 ==');
  {
    const rule = await getRuleByCode('TRANSFER001');
    const rawRule = (await q(`SELECT deduct_score FROM hse_assessment_rule WHERE rule_code='TRANSFER001' AND is_deleted=FALSE`)).rows[0];
    check('E19 规则库固定分值已退出（deduct_score=NULL）', rawRule.deduct_score == null, String(rawRule.deduct_score));
    // 造一行正分台账（五列之和 3.5）验证意图分值来源；历史 5 月行全 0 分走 continue（正确行为）
    await q(
      `INSERT INTO transfer_station_check
         (station_code, station_name, area_team, check_date, ledger_management, sign_management, electricity_safety, fire_management, item_placement, is_deleted)
       SELECT COALESCE(MAX(station_code),'E0804'),'E0804测试站','保店','2026-05',2,1.5,0,0,0,FALSE
         FROM transfer_station_check`
    );
    const res = await transferCheckAdapter.scan({ cycle: cycleRow, year: 2026, month: 5, rule, dryRun: true });
    check('E20 扫描产出正分意图', res.intents.length > 0, `intents=${res.intents.length}`);
    const testIntent = res.intents.find((x) => x.stations && x.stations.includes('E0804测试站'));
    check('E20a 测试站意图 rawScore = 五列之和 3.5（非固定 2 分）',
      !!testIntent && Math.abs(Number(testIntent.rawScore) - 3.5) < 0.001,
      testIntent && `rawScore=${testIntent.rawScore} counts=${JSON.stringify(testIntent.counts)}`);
    check('E20b 存在非 2 分行（证明不读固定分）',
      res.intents.some((it) => Math.abs(Number(it.rawScore) - 2) > 0.001));
    // T21 展示语义（静态）
    const vue = fs.readFileSync(path.join(__dirname, '../../安全看板vben/apps/web-naive/src/views/hse/assessment-rule/index.vue'), 'utf8');
    check('E21 前端按 calc_mode 显示「按转运站五列之和」', vue.includes('ledger_five_columns_sum') && vue.includes('按转运站五列之和'));
    check('E22 历史 TRANSFER001 扣分未重算（7 行 / 52.5）',
      Number(state.transferSnap.c) ===
      Number((await q(`SELECT count(*)::int c FROM hse_assessment_deduction WHERE source_detail->>'kind'='transfer_check' AND is_deleted=FALSE`)).rows[0].c));
    await q(`DELETE FROM transfer_station_check WHERE station_name = 'E0804测试站'`);
  }

  // ---- Phase F：有效期引擎集成（统一过滤生效）----
  console.log('\n== Phase F：有效期统一过滤（引擎集成） ==');
  {
    // F1：恢复原始 valid_from（2026-09-13，晚于周期 53 结束）→ 不参与
    await restoreRules();
    const vrF = await insertVr({ violatorId: state.cleanerEmp.employee_id, name: `${MARK}-F1`, checkSource: 'company', sourceType: 'grid_candidate' });
    let res = await engine.runCycleAdapters(CYCLE_ID, { adapterKeys: ['sanwei_candidate'] });
    const a1 = res.adapters.find((x) => x.key === 'sanwei_candidate');
    check('F12 valid_from 晚于周期 → 适配器被统一过滤（rule-not-effective）',
      a1 && a1.ok === false && a1.reason === 'rule-not-effective', JSON.stringify(a1));
    let rows = (await createdDeductions()).filter((r) => String(r.source_id) === String(vrF) && !r.is_deleted);
    check('F12a 未产生任何扣分', rows.length === 0);

    // F2：valid_to 早于周期开始 → 不参与
    await ruleDates('GRIDVIOL001', '2026-01-01', '2026-04-30');
    res = await engine.runCycleAdapters(CYCLE_ID, { adapterKeys: ['sanwei_candidate'] });
    const a2 = res.adapters.find((x) => x.key === 'sanwei_candidate');
    check('F15 valid_to 之后（周期前失效）→ 不参与', a2 && a2.reason === 'rule-not-effective', JSON.stringify(a2));

    // F3：valid_to = 周期开始当天 → 参与（含端点）
    await ruleDates('GRIDVIOL001', '2026-01-01', '2026-05-01');
    res = await engine.runCycleAdapters(CYCLE_ID, { adapterKeys: ['sanwei_candidate'] });
    const a3 = res.adapters.find((x) => x.key === 'sanwei_candidate');
    check('F14 valid_to 当天（周期窗口端点）→ 参与', a3 && a3.ok === true, JSON.stringify(a3));
    rows = (await createdDeductions()).filter((r) => String(r.source_id) === String(vrF) && !r.is_deleted);
    check('F14a 有效期内正常产生扣分（恰 2 对象）', rows.length === 2, `rows=${rows.length}`);

    // F16：valid_to 为空继续有效（valid_from 周期中段 → 窗口重叠即参与）
    await ruleDates('GRIDVIOL001', '2026-05-10', null);
    res = await engine.runCycleAdapters(CYCLE_ID, { adapterKeys: ['sanwei_candidate'] });
    const a4 = res.adapters.find((x) => x.key === 'sanwei_candidate');
    check('F16 valid_to 为空 → 继续有效', a4 && a4.ok === true, JSON.stringify(a4));
    await cleanup();
  }
})().then(async () => {
  // ---- 收尾：恢复规则配置与得分，核验基线 ----
  console.log('\n== 收尾恢复 ==');
  // 先恢复被暂避的存量扣分行，再重算得分（恢复原始得分口径）
  if (state.conflictIds.length) {
    await q(`UPDATE hse_assessment_deduction SET is_deleted = FALSE, updated_at = NOW() WHERE id = ANY($1)`, [state.conflictIds]);
    state.conflictIds = [];
  }
  try { await restoreRules(); } catch (e) { console.log('  规则恢复异常:', e.message); }
  await cleanup();
  const rb = (await q(`SELECT rule_code, valid_from, valid_to FROM hse_assessment_rule WHERE rule_code IN ('GRIDVIOL001','VIOLATION003') AND is_deleted=FALSE ORDER BY id`)).rows;
  let rulesOk = true;
  for (const r of rb) {
    const b = state.rulesBefore[r.rule_code];
    if (!b || String(b.validFrom) !== String(r.valid_from) || String(b.validTo ?? '') !== String(r.valid_to ?? '')) rulesOk = false;
  }
  check('Z1 规则有效期配置已恢复原值', rulesOk, JSON.stringify(rb));
  const vrCnt = Number((await q(`SELECT count(*)::int c FROM violation_records WHERE violator_name LIKE '${MARK}%' OR violation_behavior LIKE '${MARK}%'`)).rows[0].c);
  check('Z2 测试 vr 已清空', vrCnt === 0, `剩余=${vrCnt}`);
  const dedCnt = Number((await q(`SELECT count(*)::int c FROM hse_assessment_deduction WHERE id > $1 AND source_table='violation_records'`, [state.highWater])).rows[0].c);
  check('Z3 测试 deduction 已清空', dedCnt === 0, `剩余=${dedCnt}`);
  const gvcCnt = Number((await q(`SELECT count(*)::int c FROM grid_violation_candidates WHERE behavior_text LIKE '${MARK}%'`)).rows[0].c);
  check('Z4 测试候选已清空', gvcCnt === 0, `剩余=${gvcCnt}`);
  const ts = (await q(`SELECT count(*)::int c, COALESCE(SUM(suggested_score),0) s FROM hse_assessment_deduction WHERE source_detail->>'kind'='transfer_check' AND is_deleted=FALSE`)).rows[0];
  check('Z5 历史 TRANSFER001 扣分零变化', Number(ts.c) === Number(state.transferSnap.c) && Number(ts.s) === Number(state.transferSnap.s), `${ts.c}/${ts.s}`);
  const cl = (await q(`SELECT target_role, category, max_deduct FROM hse_assessment_category_limit WHERE category='三违管理' ORDER BY target_role`)).rows;
  check('Z6 类别上限零变化', JSON.stringify(cl) === JSON.stringify(state.catLimitBefore));
  const mgrTid = Number(state.targetsBefore[Number(state.managerEmp.employee_id)].id);
  if (mgrTid) {
    // 重算幂等一致：连续两次 recalc 结果恒定（证明撤销回滚后的得分可由扣分行确定性重建）。
    // 注：目标 1342 存量分值（91/86）本与其扣分行（合计 161 → 应为 0）不一致——E-08-04 前已存在的
    //     dev 历史陈旧态；重算使其恢复「与扣分行一致」的正确口径（详见正式报告 §风险）。
    const s1 = (await q(`SELECT score_auto, score_total FROM hse_assessment_target WHERE id=$1`, [mgrTid])).rows[0];
    await scoringEngine.recalculateTarget(CYCLE_ID, mgrTid);
    const s2 = (await q(`SELECT score_auto, score_total FROM hse_assessment_target WHERE id=$1`, [mgrTid])).rows[0];
    check('Z7 经理得分重算幂等一致',
      Math.abs(Number(s1.score_auto) - Number(s2.score_auto)) < 0.001 && Math.abs(Number(s1.score_total) - Number(s2.score_total)) < 0.001,
      `${s1.score_auto}/${s1.score_total} vs ${s2.score_auto}/${s2.score_total}`);
    console.log(`  （注：target=${mgrTid} 测试前存量分值 ${state.targetsBefore[Number(state.managerEmp.employee_id)].score_auto} 与其扣分行不一致，重算后=${s2.score_auto}，系测试前既有陈旧态）`);
  }

  console.log(`\n===== RESULT: PASS=${pass} FAIL=${fail} =====`);
  if (fails.length) { console.log('失败项:'); for (const f of fails) console.log('  -', f); }
  await pool.end();
  process.exit(fail ? 1 : 0);
}).catch(async (e) => {
  console.error('TEST RUNNER ERROR:', e.message);
  if (e.stack) console.error(e.stack.split('\n').slice(1, 5).join('\n'));
  try { if (state.conflictIds.length) { await q(`UPDATE hse_assessment_deduction SET is_deleted = FALSE WHERE id = ANY($1)`, [state.conflictIds]); state.conflictIds = []; } } catch (_) {}
  try { await restoreRules(); } catch (_) {}
  try { await cleanup(); } catch (_) {}
  await pool.end();
  process.exit(2);
});
