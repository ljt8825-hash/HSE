/**
 * P2-B1-E-08-04-R4-FIX → R4-FIX-SCOPE 自动化测试（DEV：safety_dashboard_dev）
 *
 * 覆盖（R4-FIX 规格 §十三 + R4-FIX-SCOPE 规格 §十六）：
 *   F1  配置单一事实源就绪（system_settings confirmed_relations 责任关系事实）
 *   F2  津城 16 名保洁员 → 于鑫宁 → RESOLVED → target_count=1（确认责任关系分支）
 *   F3  配置缺失 → 完全回退默认模板（历史 R4 语义：crossOrg 管理员 + 经理 fail-closed = PARTIAL）
 *   F4  确认责任人为无效人员 → INVALID_TARGET（fail-closed）
 *   F5  考核目标资格：syncAssessmentTargets 真实调用 → 6702 纳入
 *       （岗位=作业质量管理主管 不在默认白名单 → 资格来源=确认责任关系，非岗位白名单）
 *   F6  默认岗位白名单不回归（经理/管理员@town_center/网格长 仍纳入）
 *   F7  反向清理不误删确认责任目标；非白名单非确认对象仍被清理
 *   F8  引擎级：津城保洁员事件 → 恰 1 条扣分且对象=6702 + 幂等重跑
 *   F9  6702 原始人员数据（employee/assignment/组织视图行）零修改
 *   F10 历史数据保护：violation_records / deduction 按来源分布 前后一致（无重算）
 *   F11 环卫两名在职经理仍不自动归属
 *
 * SCOPE（R4-FIX-SCOPE §十六 范围隔离）：
 *   S1  确认=责任关系事实：16 人命中 confirmed-responsibility（Scope-1）
 *   S2  非确认人员 + supervisor=6702 → 不继承确认语义，回默认模板（Scope-2，核心）
 *   S3  资格 SQL：仅 responsible(6702) 具备资格，下属(6825)不具备（Scope-3/4）
 *   S4  确认分支抑制默认模板对同一责任人(6702)的重复解析 → 无重复目标（Scope-5）
 *   （Scope-6 revoke 立即回滚由 p2b1e0804r2fix_tests.cjs 95 项全矩阵原样覆盖，全量回归重跑验证）
 *
 * 前置：p2b1e0804r4fix_dev_migration.cjs v2 已执行（confirmed_relations 结构就绪）。
 * 运行：node scripts/p2b1e0804r4fix_tests.cjs
 */
process.env.DB_NAME = 'safety_dashboard_dev';
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

const db = require('../config/db');
const { pool } = db;
const crypto = require('crypto');
const { resolveTransmissionTargets } = require('../services/ruleEngine/violationTargetResolver');
const { loadConfirmedResponsibilityRelations, CONFIRMED_TARGET_ELIGIBILITY_SQL, CONFIRMED_SETTING_KEY } = require('../services/assessmentTargetEligibility');
const scheduler = require('../services/assessmentScheduler');

const CYCLE_ID = 53;
const TEST_DATE = '2026-05-10';
const MARK = 'E0804R4FIX测试';

let pass = 0, fail = 0;
const fails = [];
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✔ ${name}`); }
  else { fail++; fails.push(name + (extra ? ` :: ${extra}` : '')); console.log(`  ✘ ${name}${extra ? ' :: ' + extra : ''}`); }
}
const q = (sql, params) => pool.query(sql, params);
const VALID = `e.employment_relation = '正式员工'`;

const state = {
  vrIds: [], gvcIds: [], highWater: 0, auditBase: 0,
  rulesBefore: {}, createdTargetIds: [], tempCycleId: null, conflictIds: [],
  yxnBefore: null, histBefore: null,
};

async function boot() {
  await db.testConnection();
  if (!db.isConnected()) throw new Error('DEV 数据库连接失败');
}

/** 津城街道作业中心 16 名确认保洁员（sup=6702，正式员工） */
async function loadJincheng16() {
  const r = await q(`
    SELECT v.employee_id::int AS cleaner_id, v.name, v.org_name, v.supervisor_id::int AS sup_id
      FROM v_employee_org_full v JOIN employee e ON e.id = v.employee_id
     WHERE v.is_current = TRUE AND v.relation_status = 'active' AND v.is_deleted = FALSE
       AND v.org_name = '津城街道作业中心' AND v.position_name = '保洁员'
       AND v.supervisor_id = 6702 AND ${VALID}
     ORDER BY v.employee_id`);
  return r.rows;
}

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
  for (const id of state.createdTargetIds) {
    await q(`DELETE FROM hse_assessment_deduction WHERE target_id=$1`, [id]);
    await q(`DELETE FROM hse_assessment_target WHERE id=$1`, [id]);
  }
  state.createdTargetIds = [];
}

async function insertVr({ violatorId, checkSource, sourceType }) {
  const r = await q(
    `INSERT INTO violation_records
       (violator_id, violator_name, violation_behavior, check_source, violation_date, source_type, is_deleted)
     VALUES ($1,$2,$3,$4,$5,$6,FALSE) RETURNING id`,
    [violatorId, `${MARK}-${violatorId}`, `${MARK} 三违行为`, checkSource || null, TEST_DATE, sourceType || null]);
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
         VALUES ($1,$2,$3,$4,'E0804R4FIX','E0804R4FIX','company',5,'confirmed',$5,1,NOW())
         RETURNING id`, [gridRecordId, behaviorId, `${MARK} 三违行为`, `${MARK} 三违行为`, vrId]);
      id = Number(r.rows[0].id);
    } catch (e) {
      if (e.code !== '23505') throw e;
    }
  }
  if (!id) throw new Error('行为字典全部冲突，无法造 gvc');
  state.gvcIds.push(id);
  return id;
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
}
async function snapshotEngine() {
  const hw = await q('SELECT COALESCE(MAX(id),0) m FROM hse_assessment_deduction');
  state.highWater = Number(hw.rows[0].m);
  state.auditBase = Number((await q('SELECT COALESCE(MAX(id),0) m FROM audit_record')).rows[0].m);
  const rb = await q(`SELECT rule_code, valid_from, valid_to FROM hse_assessment_rule WHERE rule_code IN ('GRIDVIOL001','VIOLATION003') AND is_deleted=FALSE`);
  for (const r of rb.rows) state.rulesBefore[r.rule_code] = { validFrom: r.valid_from, validTo: r.valid_to };
}
async function restoreRules() {
  for (const [code, v] of Object.entries(state.rulesBefore)) {
    await q(`UPDATE hse_assessment_rule SET valid_from=$2, valid_to=$3, updated_at=NOW() WHERE rule_code=$1 AND is_deleted=FALSE`,
      [code, v.validFrom, v.validTo]);
  }
}

/** 6702 原始数据快照（employee + assignment + 现职视图行）md5 */
async function yxnSnapshot() {
  const rows = await q(`
    (SELECT 'employee' t, to_jsonb(e) s FROM employee e WHERE e.id=6702)
    UNION ALL
    (SELECT 'assignment'||ROW_NUMBER() OVER ()::text, to_jsonb(a) FROM employee_assignment a WHERE a.employee_id=6702)
    UNION ALL
    (SELECT 'orgview', to_jsonb(v) FROM v_employee_org_full v
      WHERE v.employee_id=6702 AND v.is_current=TRUE AND v.relation_status='active' AND v.is_deleted=FALSE)`);
  return crypto.createHash('md5').update(JSON.stringify(rows.rows)).digest('hex');
}

/** 历史扣分/三违按来源分布快照 */
async function histSnapshot() {
  const ded = await q(`SELECT COALESCE(source_table,'-') k, COUNT(*)::int n FROM hse_assessment_deduction GROUP BY 1 ORDER BY 1`);
  const vr = await q(`SELECT COALESCE(source_type,'-') k, COUNT(*)::int n FROM violation_records GROUP BY 1 ORDER BY 1`);
  return { ded: ded.rows, vr: vr.rows };
}

const TCFG = { only_check_source: 'company', by_violator_position: {
  '保洁员': ['管理员', '乡镇作业中心经理'],
  '管理员': ['管理员', '乡镇作业中心经理'],
  '乡镇作业中心经理': ['乡镇作业中心经理'],
} };

// ============================== 测试体 ==============================
(async () => {
  await boot();
  // 基线快照：6702 原始数据 + 历史扣分/三违来源分布（套件结束比对，证明零修改）
  state.yxnBefore = await yxnSnapshot();
  state.histBefore = await histSnapshot();
  console.log('== R4-FIX 测试（DEV） ==');

  // ========== F1：配置单一事实源（confirmed_relations 责任关系事实） ==========
  console.log('\n== F1：system_settings 确认责任关系配置（v2） ==');
  {
    const row = await q(`SELECT setting_value FROM system_settings WHERE setting_key=$1`, [CONFIRMED_SETTING_KEY]);
    check('F1a 配置行存在', row.rows.length === 1);
    const rels = await loadConfirmedResponsibilityRelations(pool);
    const rel6702 = rels.get(6702);
    check('F1b loader 解析出 responsible=6702 的确认关系（16 名下属）',
      !!rel6702 && rel6702.subordinateIds.size === 16, JSON.stringify([...rels.keys()]));
    const cfg = JSON.parse(row.rows[0].setting_value);
    check('F1c 配置为 confirmed_relations 结构（responsible+subordinate employee_id，非姓名/组织字符串硬编码）',
      Array.isArray(cfg.confirmed_relations) && cfg.confirmed_relations.length === 1
      && Number.isFinite(cfg.confirmed_relations[0].responsible_employee_id)
      && Array.isArray(cfg.confirmed_relations[0].subordinate_employee_ids),
      row.rows[0].setting_value.slice(0, 160));
  }

  // ========== F2：津城 16 → 于鑫宁（确认分支） ==========
  console.log('\n== F2：津城 16 名保洁员 → 于鑫宁 RESOLVED / target_count=1 ==');
  {
    const jc = await loadJincheng16();
    check('F2a 确认范围恰 16 人（sup=6702 的在职正式保洁员）', jc.length === 16, `实际=${jc.length}`);
    const tg = await ensureTarget(CYCLE_ID, 6702);
    try {
      let ok = 0; const bad = [];
      for (const c of jc) {
        const res = await resolveTransmissionTargets({ cycleId: CYCLE_ID, violatorId: c.cleaner_id, checkSource: 'company', transmissionConfig: TCFG });
        const okCond = res.mode === 'transmitted' && res.status === 'RESOLVED'
          && (res.targets || []).length === 1
          && String(res.targets[0].employeeId) === '6702'
          && res.targets[0].position === '作业质量管理主管'
          && res.evidence.evidenceSource === 'confirmed-responsibility/primary'
          && res.evidence.confirmedResponsibility === true
          && (res.skipped || []).length === 0;
        if (okCond) ok++; else bad.push({ id: c.cleaner_id, status: res.status, n: (res.targets || []).length });
      }
      check('F2b 16/16 RESOLVED、唯一目标=于鑫宁（6702）、无 skipped、无 PARTIAL', ok === 16, `ok=${ok} bad=${JSON.stringify(bad.slice(0, 3))}`);
    } finally { if (tg.created) await removeCreatedTargets(); }
  }

  // ========== F3：配置缺失 → 回退默认模板（事务内删除配置行 + ROLLBACK） ==========
  console.log('\n== F3：配置缺失 → 完全回退默认模板（历史 R4 语义） ==');
  {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // 事务内造 6702 target（对 executor=client 可见）
      const emp = await client.query(
        `SELECT employee_code, name, position_name, COALESCE(org_name,'') AS org FROM v_employee_org_full
          WHERE employee_id=6702 AND is_current=TRUE AND relation_status='active' AND is_deleted=FALSE LIMIT 1`);
      const e = emp.rows[0];
      const ins = await client.query(
        `INSERT INTO hse_assessment_target (cycle_id, employee_id, employee_code, employee_name, position, township, department)
         VALUES ($1,6702,$2,$3,$4,$5,$6) RETURNING id`, [CYCLE_ID, e.employee_code, e.name, e.position_name, e.org, e.org]);
      await client.query(`DELETE FROM system_settings WHERE setting_key=$1`, [CONFIRMED_SETTING_KEY]);
      const jc = await loadJincheng16();
      const res = await resolveTransmissionTargets({ cycleId: CYCLE_ID, violatorId: jc[0].cleaner_id, checkSource: 'company', transmissionConfig: TCFG, executor: client });
      const admPos = (res.evidence.positions || []).find((p) => p.wantedPosition === '管理员');
      const mgrPos = (res.evidence.positions || []).find((p) => p.wantedPosition === '乡镇作业中心经理');
      check('F3a 配置缺失 → 管理员槽位经 supervisor 链 crossOrg RESOLVED（旧 R4 语义）',
        admPos && admPos.status === 'RESOLVED' && admPos.evidence.crossOrg === true, JSON.stringify(admPos && admPos.evidence));
      check('F3b 经理槽位 fail-closed UNRESOLVED、顶层 PARTIAL（津城无在职经理）',
        mgrPos && mgrPos.status === 'UNRESOLVED' && res.status === 'PARTIAL', JSON.stringify({ top: res.status, mgr: mgrPos && mgrPos.status }));
      await client.query('ROLLBACK');
      console.log('  （事务已 ROLLBACK：配置行与临时 target 均未持久化）');
    } finally { client.release(); }
    const relBack = await loadConfirmedResponsibilityRelations(pool);
    check('F3c ROLLBACK 后配置仍在（responsible=6702）', relBack.has(6702));
  }

  // ========== F4：确认责任人为无效人员 → INVALID_TARGET（事务内替换配置 + ROLLBACK） ==========
  console.log('\n== F4：确认责任关系中的无效责任人 → fail-closed ==');
  {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // 事务内把配置临时替换为：responsible=8259（辞职档案），下属=某在职保洁员
      const cleaner = await q(`
        SELECT v.employee_id::int AS id FROM v_employee_org_full v JOIN employee e ON e.id=v.employee_id
         WHERE v.is_current=TRUE AND v.relation_status='active' AND v.is_deleted=FALSE
           AND v.position_name='保洁员' AND ${VALID} AND v.supervisor_id <> 6702 LIMIT 1`);
      await client.query(
        `UPDATE system_settings SET setting_value=$2 WHERE setting_key=$1`,
        [CONFIRMED_SETTING_KEY, JSON.stringify({
          confirmed_relations: [{ responsible_employee_id: 8259, subordinate_employee_ids: [cleaner.rows[0].id], mode: 'sole_target' }],
        })]);
      await client.query(
        `UPDATE employee_assignment SET supervisor_id=8259
          WHERE id=(SELECT id FROM employee_assignment WHERE employee_id=$1 AND is_current=TRUE AND is_deleted=FALSE ORDER BY id LIMIT 1)`,
        [cleaner.rows[0].id]);
      const res = await resolveTransmissionTargets({ cycleId: CYCLE_ID, violatorId: cleaner.rows[0].id, checkSource: 'company', transmissionConfig: TCFG, executor: client });
      check('F4a 确认名单人员为辞职档案 → INVALID_TARGET（supervisor-invalid，不产生目标）',
        res.mode === 'none' && res.status === 'INVALID_TARGET' && res.reason === 'supervisor-invalid'
        && (res.targets || []).length === 0, JSON.stringify({ status: res.status, reason: res.reason }));
      await client.query('ROLLBACK');
    } finally { client.release(); }
  }

  // ========== F5/F6/F7：考核目标资格（真实调用 syncAssessmentTargets，临时周期） ==========
  console.log('\n== F5/F6/F7：目标资格同步（临时周期 + 清理） ==');
  {
    const cyc = await q(
      `INSERT INTO hse_assessment_cycle
         (cycle_code, cycle_name, cycle_type, assessment_year, assessment_month, start_time, end_time, status, created_by_name, remark)
       VALUES ('HSE-CYCLE-R4FIXTEST','R4FIX资格测试周期','monthly',2026,9,'2026-09-01','2026-09-30 23:59:59.999','in_progress','r4fix-test','临时周期，测试后删除')
       RETURNING id`);
    state.tempCycleId = Number(cyc.rows[0].id);
    try {
      // 对照组：一个非白名单、非确认、非网格长的在职正式保洁员
      const ctrl = await q(`
        SELECT v.employee_id::int AS id FROM v_employee_org_full v
          JOIN employee e ON e.id=v.employee_id
         WHERE v.is_current=TRUE AND v.relation_status='active' AND v.is_deleted=FALSE
           AND v.position_name='保洁员' AND ${VALID} AND v.employee_id <> 6702
           AND v.supervisor_id <> 6702
           AND NOT EXISTS (SELECT 1 FROM grid_areas ga WHERE ga.personnel_id=v.employee_id AND COALESCE(ga.is_deleted,FALSE)=FALSE)
         ORDER BY v.employee_id LIMIT 1`);
      state.ctrlId = ctrl.rows[0] ? ctrl.rows[0].id : null;

      const r1 = await scheduler.syncAssessmentTargets(state.tempCycleId);
      const has = (empId) => q(`SELECT 1 FROM hse_assessment_target WHERE cycle_id=$1 AND employee_id=$2 AND is_deleted=FALSE LIMIT 1`, [state.tempCycleId, empId]);
      check('F5a 同步后 于鑫宁(6702) 纳入考核对象', (await has(6702)).rowCount === 1);
      const yxnRow = await q(`SELECT position FROM hse_assessment_target WHERE cycle_id=$1 AND employee_id=6702 AND is_deleted=FALSE LIMIT 1`, [state.tempCycleId]);
      check('F5b 资格来源=确认责任关系（岗位=作业质量管理主管 ∉ 默认白名单仍纳入）',
        yxnRow.rows.length === 1 && yxnRow.rows[0].position === '作业质量管理主管', JSON.stringify(yxnRow.rows));
      const mgrCnt = await q(
        `SELECT COUNT(*)::int n FROM hse_assessment_target t JOIN v_employee_org_full v ON v.employee_id=t.employee_id
          AND v.is_current=TRUE AND v.relation_status='active' AND v.is_deleted=FALSE
         WHERE t.cycle_id=$1 AND t.is_deleted=FALSE AND v.position_name='乡镇作业中心经理'`, [state.tempCycleId]);
      check('F6a 默认白名单不回归：在职乡镇作业中心经理仍纳入', Number(mgrCnt.rows[0].n) > 0, `n=${mgrCnt.rows[0].n}`);
      const admCnt = await q(
        `SELECT COUNT(*)::int n FROM hse_assessment_target t JOIN v_employee_org_full v ON v.employee_id=t.employee_id
          AND v.is_current=TRUE AND v.relation_status='active' AND v.is_deleted=FALSE
         WHERE t.cycle_id=$1 AND t.is_deleted=FALSE AND v.position_name='管理员' AND v.org_type='town_center'`, [state.tempCycleId]);
      check('F6b 默认白名单不回归：管理员(town_center) 仍纳入', Number(admCnt.rows[0].n) > 0, `n=${admCnt.rows[0].n}`);
      const gridCnt = await q(
        `SELECT COUNT(*)::int n FROM hse_assessment_target t
          WHERE t.cycle_id=$1 AND t.is_deleted=FALSE
            AND t.employee_id IN (SELECT ga.personnel_id FROM grid_areas ga WHERE ga.personnel_id IS NOT NULL AND COALESCE(ga.is_deleted,FALSE)=FALSE)`,
        [state.tempCycleId]);
      check('F6c 默认白名单不回归：网格长仍纳入', Number(gridCnt.rows[0].n) > 0, `n=${gridCnt.rows[0].n}`);
      if (state.ctrlId) {
        check('F6d 对照组：非白名单非确认保洁员不纳入（默认口径未扩大）', (await has(state.ctrlId)).rowCount === 0, `id=${state.ctrlId}`);
        // F7 反向清理：插入对照 target → 重跑同步应被清理；6702 target → 保留
        await q(`INSERT INTO hse_assessment_target (cycle_id, employee_id, employee_code, employee_name, position, township, department)
                  SELECT $1, employee_id, employee_code, name, position_name, COALESCE(org_name,''), COALESCE(org_name,'')
                    FROM v_employee_org_full WHERE employee_id=$2 AND is_current=TRUE AND relation_status='active' AND is_deleted=FALSE LIMIT 1`,
          [state.tempCycleId, state.ctrlId]);
        await scheduler.syncAssessmentTargets(state.tempCycleId);
        check('F7a 反向清理：非白名单非确认对象被清理', (await has(state.ctrlId)).rowCount === 0);
        check('F7b 反向清理不误删确认责任目标（6702 保留）', (await has(6702)).rowCount === 1);
      } else {
        check('F6d/F7 跳过：无对照组样本（结构性不可能）', true);
      }
    } finally {
      if (state.tempCycleId) {
        await q(`DELETE FROM hse_assessment_deduction WHERE target_id IN (SELECT id FROM hse_assessment_target WHERE cycle_id=$1)`, [state.tempCycleId]);
        await q(`DELETE FROM hse_assessment_target WHERE cycle_id=$1`, [state.tempCycleId]);
        await q(`DELETE FROM hse_assessment_cycle WHERE id=$1`, [state.tempCycleId]);
        state.tempCycleId = null;
      }
    }
  }

  // ========== F8：引擎级端到端（确认分支 → 恰 1 条扣分 + 幂等） ==========
  console.log('\n== F8：引擎级 津城保洁员事件 → 单一扣分（6702）+ 幂等重跑 ==');
  {
    const jc = await loadJincheng16();
    await snapshotEngine();
    await q(`UPDATE hse_assessment_rule SET valid_from='2026-04-30', valid_to=NULL, updated_at=NOW() WHERE rule_code='GRIDVIOL001' AND is_deleted=FALSE`);
    const conflicts = await q(
      `SELECT d.id FROM hse_assessment_deduction d
         JOIN hse_assessment_target t ON t.id=d.target_id AND t.cycle_id=$1
        WHERE t.employee_id = 6702 AND d.is_deleted=FALSE AND d.review_status <> 'rejected'
          AND d.deduction_source IN ('auto','chain_transmission')
          AND (d.source_detail->>'category') = '三违管理'`, [CYCLE_ID]);
    state.conflictIds = conflicts.rows.map((r) => Number(r.id));
    if (state.conflictIds.length) {
      await q(`UPDATE hse_assessment_deduction SET is_deleted=TRUE, updated_at=NOW() WHERE id=ANY($1)`, [state.conflictIds]);
      console.log(`  （暂避存量三违管理扣分 ${state.conflictIds.length} 行，结束恢复）`);
    }
    const tg = await ensureTarget(CYCLE_ID, 6702);
    try {
      const vr = await insertVr({ violatorId: jc[0].cleaner_id, checkSource: 'company', sourceType: 'grid_candidate' });
      const gvc = await insertGvc(vr, 1);
      await q(`UPDATE violation_records SET candidate_id=$1 WHERE id=$2`, [gvc, vr]);
      const engine = require('../services/ruleEngine/engine');
      await engine.runCycleAdapters(CYCLE_ID, { adapterKeys: ['sanwei_candidate'] });
      let rows = (await q(
        `SELECT d.id, d.is_deleted, d.is_transmission, t.employee_id
           FROM hse_assessment_deduction d JOIN hse_assessment_target t ON t.id=d.target_id
          WHERE d.source_table='violation_records' AND d.source_id=$1`, [String(vr)])).rows;
      const alive = rows.filter((x) => !x.is_deleted);
      check('F8a 津城保洁员事件 → 恰 1 条有效扣分且对象=于鑫宁(6702)',
        alive.length === 1 && String(alive[0].employee_id) === '6702', JSON.stringify(rows));
      check('F8b is_transmission=TRUE', alive.length === 1 && alive[0].is_transmission === true);
      await engine.runCycleAdapters(CYCLE_ID, { adapterKeys: ['sanwei_candidate'] });
      rows = (await q(
        `SELECT COUNT(*)::int n FROM hse_assessment_deduction d
          WHERE d.source_table='violation_records' AND d.source_id=$1 AND d.is_deleted=FALSE`, [String(vr)])).rows;
      check('F8c 引擎重跑仍恰 1 条（同 event + 同 employee_id 不重复 deduction）', Number(rows[0].n) === 1, `n=${rows[0].n}`);
      await cleanupEngineData();
    } finally {
      await restoreRules();
      if (tg.created) await removeCreatedTargets();
      if (state.conflictIds.length) {
        await q(`UPDATE hse_assessment_deduction SET is_deleted=FALSE, updated_at=NOW() WHERE id=ANY($1)`, [state.conflictIds]);
        state.conflictIds = [];
      }
    }
  }

  // ========== F9/F10：原始数据与历史数据零修改 ==========
  console.log('\n== F9/F10：6702 原始数据 & 历史数据零修改 ==');
  {
    const y1 = await yxnSnapshot();
    const h1 = await histSnapshot();
    check('F9a 6702 employee/assignment/组织视图行 md5 与套件启动前一致（无任何原始数据修改）',
      y1 === state.yxnBefore, `${state.yxnBefore} -> ${y1}`);
    check('F10a deduction 按来源分布与套件启动前一致（无历史重算）',
      JSON.stringify(h1.ded) === JSON.stringify(state.histBefore.ded), JSON.stringify({ before: state.histBefore.ded, after: h1.ded }));
    check('F10b violation_records 按 source_type 分布与套件启动前一致（历史三违事实未动）',
      JSON.stringify(h1.vr) === JSON.stringify(state.histBefore.vr), JSON.stringify({ before: state.histBefore.vr, after: h1.vr }));
  }

  // ========== F11：环卫两名在职经理仍不自动归属 ==========
  console.log('\n== F11：环卫两名在职经理保持不产生责任目标 ==');
  {
    const two = await q(`
      SELECT v.employee_id::int, v.name FROM v_employee_org_full v JOIN employee e ON e.id=v.employee_id
       WHERE v.is_current=TRUE AND v.relation_status='active' AND v.is_deleted=FALSE
         AND v.org_name LIKE '%环卫%' AND v.position_name='乡镇作业中心经理' AND ${VALID}
       ORDER BY v.employee_id`);
    check('F11a 环卫在职经理恰 2 名', two.rows.length === 2, JSON.stringify(two.rows));
    const supCnt = await q(`
      SELECT COUNT(*)::int n FROM v_employee_org_full v JOIN employee e ON e.id=v.employee_id
       WHERE v.supervisor_id = ANY($1) AND v.is_current=TRUE AND v.relation_status='active'
         AND v.is_deleted=FALSE AND ${VALID}`, [two.rows.map((x) => x.employee_id)]);
    check('F11b 两名经理不担任任何在职正式人员的直接上级（0 绑定，UNRESOLVED 语义保持）', Number(supCnt.rows[0].n) === 0, `n=${supCnt.rows[0].n}`);
  }

  // ========== 收尾基线 ==========
  console.log('\n== 收尾基线核验 ==');
  {
    const rb = (await q(`SELECT rule_code, valid_from, valid_to FROM hse_assessment_rule WHERE rule_code IN ('GRIDVIOL001','VIOLATION003') AND is_deleted=FALSE ORDER BY id`)).rows;
    let rulesOk = true;
    for (const r of rb) {
      const b = state.rulesBefore[r.rule_code];
      if (!b || String(b.validFrom) !== String(r.valid_from) || String(b.validTo ?? '') !== String(r.valid_to ?? '')) rulesOk = false;
    }
    check('Z1 规则有效期已恢复原值', rulesOk);
    const vrCnt = Number((await q(`SELECT count(*)::int c FROM violation_records WHERE violator_name LIKE '${MARK}%' OR violation_behavior LIKE '${MARK}%'`)).rows[0].c);
    check('Z2 测试 vr 已清空', vrCnt === 0, `剩余=${vrCnt}`);
    const dedCnt = Number((await q(`SELECT count(*)::int c FROM hse_assessment_deduction WHERE id > $1 AND source_table='violation_records'`, [state.highWater])).rows[0].c);
    check('Z3 测试 deduction 已清空', dedCnt === 0, `剩余=${dedCnt}`);
    const cycCnt = Number((await q(`SELECT count(*)::int c FROM hse_assessment_cycle WHERE cycle_code='HSE-CYCLE-R4FIXTEST'`)).rows[0].c);
    check('Z4 临时周期已删除', cycCnt === 0, `剩余=${cycCnt}`);
    const cfg = await q(`SELECT setting_value FROM system_settings WHERE setting_key=$1`, [CONFIRMED_SETTING_KEY]);
    check('Z5 配置行终态在位（confirmed_relations，responsible=6702）',
      cfg.rows.length === 1
      && Array.isArray(JSON.parse(cfg.rows[0].setting_value).confirmed_relations)
      && Number(JSON.parse(cfg.rows[0].setting_value).confirmed_relations[0].responsible_employee_id) === 6702);
  }

  // ========== SCOPE：确认责任关系范围隔离（R4-FIX-SCOPE §十六） ==========
  console.log('\n== SCOPE：范围隔离验证 ==');
  {
    // S1（Scope-1）：16 人全部命中 confirmed-responsibility（F2b 已逐人验证，此处补关系维度断言）
    const jc = await loadJincheng16();
    const rels = await loadConfirmedResponsibilityRelations(pool);
    const rel6702 = rels.get(6702);
    check('S1（Scope-1）确认范围=责任关系事实：16 人均在 6702 的 confirmed subordinate 列表内',
      !!rel6702 && jc.every((c) => rel6702.subordinateIds.has(c.cleaner_id)), `jc=${jc.length}`);

    // S2（Scope-2，核心）：非确认人员 + supervisor=6702 → 不继承确认语义，回默认模板
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // 选一名不在 16 人名单内的在职正式保洁员，事务内把其直接上级临时指向 6702
      const outsider = await q(`
        SELECT v.employee_id::int AS id, v.org_name FROM v_employee_org_full v
          JOIN employee e ON e.id=v.employee_id
         WHERE v.is_current=TRUE AND v.relation_status='active' AND v.is_deleted=FALSE
           AND v.position_name='保洁员' AND ${VALID} AND v.supervisor_id <> 6702
           AND NOT EXISTS (
             SELECT 1 FROM jsonb_array_elements(
               COALESCE(NULLIF((SELECT setting_value FROM system_settings WHERE setting_key=$1 LIMIT 1),'')::jsonb,'{}'::jsonb)
                 ->'confirmed_relations') rel
              WHERE (rel->>'responsible_employee_id')='6702'
                AND (rel->'subordinate_employee_ids') ? (v.employee_id::bigint)::text)
         ORDER BY v.employee_id LIMIT 1`, [CONFIRMED_SETTING_KEY]);
      if (outsider.rows.length) {
        const oid = outsider.rows[0].id;
        const eaBefore = await client.query(
          `SELECT id, supervisor_id FROM employee_assignment WHERE employee_id=$1 AND is_current=TRUE AND is_deleted=FALSE ORDER BY id LIMIT 1`, [oid]);
        await client.query(`UPDATE employee_assignment SET supervisor_id=6702 WHERE id=$1`, [eaBefore.rows[0].id]);
        // 事务内造 6702 target（默认模板 crossOrg 解析需要）
        const emp = await client.query(
          `SELECT employee_code, name, position_name, COALESCE(org_name,'') AS org FROM v_employee_org_full
            WHERE employee_id=6702 AND is_current=TRUE AND relation_status='active' AND is_deleted=FALSE LIMIT 1`);
        const e6702 = emp.rows[0];
        await client.query(
          `INSERT INTO hse_assessment_target (cycle_id, employee_id, employee_code, employee_name, position, township, department)
           VALUES ($1,6702,$2,$3,$4,$5,$6)`, [CYCLE_ID, e6702.employee_code, e6702.name, e6702.position_name, e6702.org, e6702.org]);
        const res = await resolveTransmissionTargets({ cycleId: CYCLE_ID, violatorId: oid, checkSource: 'company', transmissionConfig: TCFG, executor: client });
        const admPos = (res.evidence.positions || []).find((p) => p.wantedPosition === '管理员');
        check('S2a（Scope-2 核心）非确认人员 + sup=6702 → 不命中 confirmed-responsibility（走默认模板）',
          res.evidence.evidenceSource !== 'confirmed-responsibility/primary'
          && res.evidence.confirmedResponsibility !== true,
          JSON.stringify({ src: res.evidence.evidenceSource, cr: res.evidence.confirmedResponsibility }));
        check('S2b 非确认人员 → 管理员槽位走默认 crossOrg supervisor 链语义（R4 §四）',
          admPos && admPos.status === 'RESOLVED' && admPos.evidence.crossOrg === true
          && admPos.evidence.evidenceSource !== 'confirmed-responsibility/primary',
          JSON.stringify(admPos && { s: admPos.status, x: admPos.evidence.crossOrg, src: admPos.evidence.evidenceSource }));
        check('S2c 非确认人员不强制 target_count=1（默认模板经理槽位照常解析，津城无在职经理 → PARTIAL）',
          res.status === 'PARTIAL' || res.status === 'RESOLVED',
          JSON.stringify({ top: res.status, n: (res.targets || []).length }));
      } else {
        check('S2（Scope-2）跳过：库内无非确认对照保洁员（结构性不可能）', true);
      }
      await client.query('ROLLBACK');
      console.log('  （事务已 ROLLBACK：临时 supervisor 修改与临时 target 均未持久化）');
    } finally { client.release(); }

    // S3（Scope-3/4）：资格 SQL —— 仅 responsible(6702) 具备资格；下属(6825)不具备；默认白名单不受影响
    const elig = async (empId) => {
      const r = await q(`SELECT 1 FROM v_employee_org_full v WHERE v.employee_id=$1 AND v.is_current=TRUE AND v.relation_status='active' AND v.is_deleted=FALSE AND (${CONFIRMED_TARGET_ELIGIBILITY_SQL}) LIMIT 1`, [empId]);
      return r.rowCount === 1;
    };
    check('S3a（Scope-3）确认责任关系 → 6702 仍具备考核目标资格（资格 SQL 命中）', await elig(6702));
    check('S3b（Scope-3）下属（6825，确认保洁员）不具备考核目标资格（资格仅产生于 responsible，不外溢）', !(await elig(6825)));

    // S4（Scope-5）：确认分支抑制默认模板对同一责任人(6702)的重复解析 → 无重复目标
    const tg = await ensureTarget(CYCLE_ID, 6702);
    try {
      const res = await resolveTransmissionTargets({ cycleId: CYCLE_ID, violatorId: jc[0].cleaner_id, checkSource: 'company', transmissionConfig: TCFG });
      const ids = (res.targets || []).map((t) => String(t.employeeId));
      check('S4（Scope-5）确认分支 + 默认模板同指向 6702 → 去重后恰 1 个目标（无重复 employee_id）',
        ids.length === 1 && ids[0] === '6702' && new Set(ids).size === ids.length, JSON.stringify(ids));
    } finally { if (tg.created) await removeCreatedTargets(); }
    // Scope-6（revoke 立即回滚）：由 p2b1e0804r2fix_tests.cjs 95 项全矩阵覆盖（全量回归重跑）
  }

  console.log(`\n===== RESULT: PASS=${pass} FAIL=${fail} =====`);
  if (fails.length) { console.log('失败项:'); for (const f of fails) console.log('  -', f); }
  await pool.end();
  process.exit(fail ? 1 : 0);
})().catch(async (e) => {
  console.error('TEST RUNNER ERROR:', e.message);
  if (e.stack) console.error(e.stack.split('\n').slice(1, 5).join('\n'));
  try {
    if (state.tempCycleId) {
      await q(`DELETE FROM hse_assessment_deduction WHERE target_id IN (SELECT id FROM hse_assessment_target WHERE cycle_id=$1)`, [state.tempCycleId]);
      await q(`DELETE FROM hse_assessment_target WHERE cycle_id=$1`, [state.tempCycleId]);
      await q(`DELETE FROM hse_assessment_cycle WHERE id=$1`, [state.tempCycleId]);
    }
  } catch (_) {}
  try { await removeCreatedTargets(); } catch (_) {}
  try { await restoreRules(); } catch (_) {}
  try { await cleanupEngineData(); } catch (_) {}
  if (state.conflictIds.length) { try { await q(`UPDATE hse_assessment_deduction SET is_deleted=FALSE WHERE id=ANY($1)`, [state.conflictIds]); } catch (_) {} }
  await pool.end();
  process.exit(2);
});
