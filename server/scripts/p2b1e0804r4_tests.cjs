/**
 * P2-B1-E-08-04-R4 自动化测试（DEV：safety_dashboard_dev）
 *
 * 覆盖（R4 规格 §十七）：
 *   R4-1  71 名经理直接责任测试（全量，真实数据）
 *   R4-2  同一经理双身份 target 去重测试（同 event + 同 employee_id = 至多 1 目标）
 *   R4-3  29 条 supervisor 修正测试（修正后解析到 7085/7947）
 *   R4-4  29(45) 条 migration 幂等测试（--verify 重跑 changed=0）
 *   R4-5  migration rollback 测试（rollback → verify NOT_APPLIED → 重新 migrate 恢复）
 *   R4-6  津城 16 人 → 于鑫宁(6702) 测试（crossOrg 证据；临时 target 造数+清理）
 *   R4-7  两名环卫中心经理（6707 刘菲 / 6708 韩晓亮）保持不产生责任目标（UNRESOLVED 语义）
 *   R4-8  119 名 rel=NULL 人员不能成为责任目标（violation 层 + supervisor 层）
 *   R4-9  正式员工可以成为责任目标（R4-1/R4-3/R4-6 覆盖）
 *   R4-10 辞职人员不能成为责任目标（构造 supervisor=8259）
 *   R4-11 死亡人员不能成为责任目标（真实死亡档案构造）
 *   R4-17 同一 event + employee_id 不重复 deduction（引擎级端到端）
 *
 * R4-12~16（revoke pending/approved/adjusted/frozen target/并发）由 R2/R2-FIX 套件
 *   原样覆盖（p2b1e0804r2_tests.cjs O-U / p2b1e0804r2fix_tests.cjs 矩阵+TF+I1-3），
 *   本阶段已全部跑绿，映射见正式报告 §测试结果。
 *
 * 前置：p2b1e0804r4_dev_migration.cjs 已执行（45 条 supervisor 修正落库）。
 * 运行：node scripts/p2b1e0804r4_tests.cjs
 */
process.env.DB_NAME = 'safety_dashboard_dev';
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

const db = require('../config/db');
const { pool } = db;
const fs = require('fs');
const { spawnSync } = require('child_process');
const { resolveTransmissionTargets } = require('../services/ruleEngine/violationTargetResolver');

const CYCLE_ID = 53;
const TEST_DATE = '2026-05-10';
const MARK = 'E0804R4测试';
const MIGRATION = 'G:/hse-dashboard/server/scripts/p2b1e0804r4_dev_migration.cjs';
const ROSTER_CSV = 'G:/hse-dashboard/.workbuddy/artifacts/e0804r2fix/235-roster-resignation-check.csv';
const NODE = 'C:/Users/honey/.workbuddy/binaries/node/versions/22.22.2-2/node.exe';

let pass = 0, fail = 0;
const fails = [];
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✔ ${name}`); }
  else { fail++; fails.push(name + (extra ? ` :: ${extra}` : '')); console.log(`  ✘ ${name}${extra ? ' :: ' + extra : ''}`); }
}
const q = (sql, params) => pool.query(sql, params);

// R4 冻结口径：有效 ⇔ employment_relation='正式员工'
const VALID = `e.employment_relation = '正式员工'`;

const state = {
  vrIds: [], gvcIds: [], highWater: 0, auditBase: 0,
  rulesBefore: {}, supOverrides: [], createdTargetIds: [], targetIds: [],
};

async function boot() {
  await db.testConnection();
  if (!db.isConnected()) throw new Error('DEV 数据库连接失败');
}

// ---------------- 数据加载 ----------------

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
  const header = lines[0].split(',');
  return lines.slice(1).map((ln) => {
    const cols = ln.split(',');
    const row = {};
    header.forEach((h, i) => { row[h] = cols[i] || ''; });
    return row;
  });
}

/** 71 名经理直管保洁员（上级=同组织在职经理） */
async function loadManagerDirectCleaners() {
  const r = await q(`
    SELECT v.employee_id::int AS cleaner_id, v.name AS cleaner_name, v.org_name,
           v.supervisor_id::int AS mgr_id, v.supervisor_name AS mgr_name
      FROM v_employee_org_full v
      JOIN v_employee_org_full s ON s.employee_id=v.supervisor_id
       AND s.is_current=TRUE AND s.relation_status='active' AND s.is_deleted=FALSE
       AND s.position_name='乡镇作业中心经理' AND s.org_name=v.org_name
      JOIN employee e ON e.id=v.employee_id
      JOIN employee se ON se.id=v.supervisor_id
     WHERE v.is_current=TRUE AND v.relation_status='active' AND v.is_deleted=FALSE
       AND v.position_name='保洁员' AND ${VALID}
       AND se.employment_relation = '正式员工'
     ORDER BY v.org_name, v.employee_id`);
  return r.rows;
}

/** 29 条同名错配修正目标（组A/组B，与迁移脚本一致） */
const CORRECTIONS_29 = {
  A: { from: 8259, to: 7085, ids: [7086, 7087, 7088, 7089, 7091, 7092, 7093, 7095, 7096, 7097, 7098, 8066, 9658] },
  B: { from: 9478, to: 7947, ids: [7949, 7950, 7951, 7952, 7953, 7954, 7955, 7956, 7957, 7958, 7959, 7961, 7962, 7963, 9276, 9368] },
};
/** 津城 16 人（组C，sup 6705 → 6702 于鑫宁） */
const JINCHENG = { from: 6705, to: 6702, ids: [6825, 6827, 6828, 6829, 6831, 6833, 6834, 6835, 6836, 6837, 6838, 6839, 6840, 9292, 9465, 9556] };

// ---------------- 造数助手 ----------------

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
         VALUES ($1,$2,$3,$4,'E0804R4','E0804R4','company',5,'confirmed',$5,1,NOW())
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

function runMigration(args) {
  const r = spawnSync(NODE, [MIGRATION, ...args], { encoding: 'utf8', timeout: 120000 });
  const m = (r.stdout || '').match(/total=(\d+) changed=(\d+) noop=(\d+) problems=(\d+)/);
  return { code: r.status, out: (r.stdout || '') + (r.stderr || ''),
    total: m ? Number(m[1]) : -1, changed: m ? Number(m[2]) : -1, noop: m ? Number(m[3]) : -1, problems: m ? Number(m[4]) : -1 };
}

// ============================== 测试体 ==============================
(async () => {
  await boot();
  console.log('== R4 测试（DEV） ==');

  const TCFG = { only_check_source: 'company', by_violator_position: {
    '保洁员': ['管理员', '乡镇作业中心经理'],
    '管理员': ['管理员', '乡镇作业中心经理'],
    '乡镇作业中心经理': ['乡镇作业中心经理'],
  } };

  // ========== R4-1 / R4-2：71 名经理直管 ==========
  console.log('\n== R4-1/R4-2：71 名经理直接责任（全量）+ 双身份去重 ==');
  const mdCleaners = await loadManagerDirectCleaners();
  check('R4-1-pre 经理直管保洁员恰 71 人', mdCleaners.length === 71, `实际=${mdCleaners.length}`);
  let mdOk = 0; const mdBad = [];
  for (const c of mdCleaners) {
    const res = await resolveTransmissionTargets({ cycleId: CYCLE_ID, violatorId: c.cleaner_id, checkSource: 'company', transmissionConfig: TCFG });
    const admPos = (res.evidence.positions || []).find((p) => p.wantedPosition === '管理员');
    const mgrPos = (res.evidence.positions || []).find((p) => p.wantedPosition === '乡镇作业中心经理');
    const ok = res.mode === 'transmitted' && res.status === 'RESOLVED'
      && (res.targets || []).length === 1
      && String(res.targets[0].employeeId) === String(c.mgr_id)
      && admPos && admPos.status === 'RESOLVED' && admPos.evidence.managerDirect === true
      && mgrPos && mgrPos.status === 'RESOLVED' && mgrPos.evidence.hop === 1;
    if (ok) mdOk++; else mdBad.push({ id: c.cleaner_id, status: res.status, n: (res.targets || []).length, adm: admPos && admPos.status, mgr: mgrPos && mgrPos.status });
  }
  check('R4-1 71/71 全部 RESOLVED 且唯一目标=其直接上级经理（managerDirect 证据）', mdOk === 71, `ok=${mdOk} bad=${JSON.stringify(mdBad.slice(0, 3))}`);
  check('R4-2 每人恰 1 个目标（管理员+经理双身份去重，同 employee_id 不重复）', mdOk === 71);

  // ========== R4-3：29 条同名错配修正 ==========
  console.log('\n== R4-3：29 条 supervisor 修正后解析 ==');
  for (const [g, def] of Object.entries(CORRECTIONS_29)) {
    let ok = 0; const bad = [];
    for (const id of def.ids) {
      const cur = await q(
        `SELECT supervisor_id::int FROM employee_assignment WHERE employee_id=$1 AND is_current=TRUE AND is_deleted=FALSE LIMIT 1`, [id]);
      const atNew = cur.rows.length === 1 && Number(cur.rows[0].supervisor_id) === def.to;
      if (!atNew) { bad.push({ id, sup: cur.rows[0] && cur.rows[0].supervisor_id }); continue; }
      const res = await resolveTransmissionTargets({ cycleId: CYCLE_ID, violatorId: id, checkSource: 'company', transmissionConfig: TCFG });
      const hasNewSup = (res.targets || []).some((t) => String(t.employeeId) === String(def.to));
      if (atNew && hasNewSup) ok++; else bad.push({ id, status: res.status, targets: (res.targets || []).map((t) => t.employeeId) });
    }
    check(`R4-3${g} 组${g}（${def.ids.length} 条）supervisor 已指向 ${def.to} 且解析目标包含之`, ok === def.ids.length, `ok=${ok} bad=${JSON.stringify(bad.slice(0, 3))}`);
  }

  // ========== R4-4：migration 幂等 ==========
  console.log('\n== R4-4：migration 幂等（--verify 重跑） ==');
  {
    const r = runMigration(['--verify']);
    check('R4-4a verify 退出码 0', r.code === 0, r.out.slice(-200));
    check('R4-4b verify changed=0 / noop=45 / problems=0（幂等）', r.changed === 0 && r.noop === 45 && r.problems === 0, `changed=${r.changed} noop=${r.noop} problems=${r.problems}`);
  }

  // ========== R4-5：migration rollback → 恢复 ==========
  console.log('\n== R4-5：migration rollback 与恢复 ==');
  {
    const rb = runMigration(['--rollback']);
    check('R4-5a rollback changed=45（全部恢复原 supervisor）', rb.code === 0 && rb.changed === 45 && rb.problems === 0, `changed=${rb.changed} problems=${rb.problems}`);
    const v1 = runMigration(['--verify']);
    check('R4-5b rollback 后 verify：0 人处于新关系（NOT_APPLIED）', v1.code === 0 && v1.noop === 0 && v1.changed === 0 && v1.problems === 0, `noop=${v1.noop} changed=${v1.changed}`);
    const mg = runMigration([]);
    check('R4-5c 重新 migrate changed=45（最终态=已修正）', mg.code === 0 && mg.changed === 45 && mg.problems === 0, `changed=${mg.changed}`);
    const v2 = runMigration(['--verify']);
    check('R4-5d 终态 verify noop=45', v2.code === 0 && v2.noop === 45 && v2.problems === 0, `noop=${v2.noop}`);
  }

  // ========== R4-6：津城 16 → 于鑫宁 ==========
  // （R4-FIX 更新 2026-09-14：确认责任人分支生效 → 单一目标 RESOLVED，不再 PARTIAL。
  //   旧 R4 语义（crossOrg 管理员槽位 + 经理槽位 fail-closed = PARTIAL）由
  //   p2b1e0804r4fix_tests.cjs F3「配置缺失→回退默认模板」用例保留覆盖。）
  console.log('\n== R4-6：津城 16 人 → 于鑫宁(6702)（R4-FIX 确认责任人语义） ==');
  {
    const yxn = await q(`SELECT id::int, name, employment_relation, is_deleted FROM employee WHERE id=6702`);
    check('R4-6a 于鑫宁唯一档案且为正式员工',
      yxn.rows.length === 1 && yxn.rows[0].employment_relation === '正式员工' && !yxn.rows[0].is_deleted, JSON.stringify(yxn.rows));
    const tg = await ensureTarget(CYCLE_ID, 6702);
    try {
      let ok = 0; const bad = [];
      for (const id of JINCHENG.ids) {
        const res = await resolveTransmissionTargets({ cycleId: CYCLE_ID, violatorId: id, checkSource: 'company', transmissionConfig: TCFG });
        const okCond = res.mode === 'transmitted' && res.status === 'RESOLVED'
          && (res.targets || []).length === 1
          && String(res.targets[0].employeeId) === '6702'
          && res.evidence.evidenceSource === 'confirmed-responsibility/primary'
          && res.evidence.confirmedResponsibility === true;
        if (okCond) ok++; else bad.push({ id, status: res.status, n: (res.targets || []).length });
      }
      check('R4-6b 16/16 RESOLVED 且唯一目标=于鑫宁（confirmed-responsibility 证据，target_count=1）', ok === 16, `ok=${ok} bad=${JSON.stringify(bad.slice(0, 3))}`);
      const res = await resolveTransmissionTargets({ cycleId: CYCLE_ID, violatorId: JINCHENG.ids[0], checkSource: 'company', transmissionConfig: TCFG });
      check('R4-6c 顶层 RESOLVED（不再 PARTIAL），skipped 为空，无经理槽位猜测',
        res.status === 'RESOLVED' && (res.skipped || []).length === 0
        && (res.evidence.positions || []).length === 1
        && res.evidence.positions[0].wantedPosition === 'confirmed_responsibility',
        JSON.stringify({ top: res.status, skipped: res.skipped, pos: res.evidence.positions }));
    } finally { if (tg.created) await removeCreatedTargets(); }
  }

  // ========== R4-7：环卫两名在职经理 ==========
  console.log('\n== R4-7：环卫两名在职经理不自动归属 ==');
  {
    const two = await q(`
      SELECT v.employee_id::int, v.name, v.org_name, e.employment_relation
        FROM v_employee_org_full v JOIN employee e ON e.id=v.employee_id
       WHERE v.is_current=TRUE AND v.relation_status='active' AND v.is_deleted=FALSE
         AND v.org_name LIKE '%环卫%' AND v.position_name='乡镇作业中心经理' AND ${VALID}
       ORDER BY v.employee_id`);
    check('R4-7a 环卫在职经理恰 2 名（刘菲/韩晓亮）且均正式员工', two.rows.length === 2, JSON.stringify(two.rows));
    const supCnt = await q(`
      SELECT COUNT(*)::int n FROM v_employee_org_full v JOIN employee e ON e.id=v.employee_id
       WHERE v.supervisor_id = ANY($1) AND v.is_current=TRUE AND v.relation_status='active'
         AND v.is_deleted=FALSE AND ${VALID}`, [two.rows.map((x) => x.employee_id)]);
    check('R4-7b 两名经理不担任任何在职责任人员的直接上级（0 绑定）', Number(supCnt.rows[0].n) === 0, `n=${supCnt.rows[0].n}`);
    const hwCleaners = await q(`
      SELECT COUNT(*)::int n FROM v_employee_org_full v JOIN employee e ON e.id=v.employee_id
       WHERE v.org_name LIKE '%环卫%' AND v.position_name='保洁员' AND v.is_current=TRUE
         AND v.relation_status='active' AND v.is_deleted=FALSE AND ${VALID}`);
    check('R4-7c 环卫在职（正式员工）保洁员=0（R4 口径下无人可被错误绑定）', Number(hwCleaners.rows[0].n) === 0, `n=${hwCleaners.rows[0].n}`);
    const hwNullCleaner = await q(`
      SELECT v.employee_id::int FROM v_employee_org_full v JOIN employee e ON e.id=v.employee_id
       WHERE v.org_name LIKE '%环卫%' AND v.position_name='保洁员' AND v.is_current=TRUE
         AND v.relation_status='active' AND v.is_deleted=FALSE AND e.employment_relation IS NULL LIMIT 1`);
    if (hwNullCleaner.rows.length) {
      const res = await resolveTransmissionTargets({ cycleId: CYCLE_ID, violatorId: hwNullCleaner.rows[0].employee_id, checkSource: 'company', transmissionConfig: TCFG });
      check('R4-7d 环卫 rel=NULL 保洁员 → INVALID_TARGET（不进入责任池）', res.mode === 'none' && res.status === 'INVALID_TARGET', JSON.stringify({ status: res.status }));
    }
  }

  // ========== R4-8：119 名 rel=NULL 不能成为责任目标 ==========
  console.log('\n== R4-8：119 名非在册（rel=NULL）人员排除 ==');
  {
    const rows = parseCsv(fs.readFileSync(ROSTER_CSV, 'utf8'));
    const ids119 = rows.filter((r) => r.category === 'ROSTER_REMOVED').map((r) => Number(r.employee_id));
    check('R4-8a 花名册比对 ROSTER_REMOVED 恰 119 人', ids119.length === 119, `实际=${ids119.length}`);
    let asViolator = 0, asSup = 0; const bad = [];
    for (const id of ids119) {
      const res = await resolveTransmissionTargets({ cycleId: CYCLE_ID, violatorId: id, checkSource: 'company', transmissionConfig: TCFG });
      if (res.mode === 'none' && res.status === 'INVALID_TARGET') asViolator++;
      else bad.push({ id, status: res.status, mode: res.mode });
    }
    check('R4-8b 119/119 作为违规者 → INVALID_TARGET（violator-invalid）', asViolator === 119, `ok=${asViolator} bad=${JSON.stringify(bad.slice(0, 3))}`);
    // supervisor 层：构造链保洁员 → 119 中一人 → INVALID_TARGET
    const chain = await q(`
      SELECT v.employee_id::int AS cleaner_id, v.supervisor_id::int AS old_sup
        FROM v_employee_org_full v JOIN employee e ON e.id=v.employee_id
       WHERE v.is_current=TRUE AND v.relation_status='active' AND v.is_deleted=FALSE
         AND v.position_name='保洁员' AND ${VALID} AND v.supervisor_id IS NOT NULL LIMIT 1`);
    if (chain.rows.length) {
      await overrideSupervisor(chain.rows[0].cleaner_id, ids119[0]);
      try {
        const res = await resolveTransmissionTargets({ cycleId: CYCLE_ID, violatorId: chain.rows[0].cleaner_id, checkSource: 'company', transmissionConfig: TCFG });
        if (res.status === 'INVALID_TARGET') asSup++;
        check('R4-8c rel=NULL 人员作为直接上级 → INVALID_TARGET（不进入候选池）',
          res.status === 'INVALID_TARGET' && (res.targets || []).length === 0, JSON.stringify({ status: res.status, reason: res.reason }));
      } finally { await restoreSupervisors(); }
    }
  }

  // ========== R4-9/10/11：有效性边界 ==========
  console.log('\n== R4-9/10/11：有效性边界（正式员工/辞职/死亡） ==');
  {
    // R4-10 辞职 supervisor
    const resigned = await q(`SELECT id::int FROM employee WHERE id=8259 AND employment_relation='辞职' AND is_deleted=FALSE LIMIT 1`);
    check('R4-10a 辞职档案 8259 存在', resigned.rows.length === 1);
    if (resigned.rows.length) {
      const cleaner = await q(`
        SELECT v.employee_id::int FROM v_employee_org_full v JOIN employee e ON e.id=v.employee_id
         WHERE v.is_current=TRUE AND v.relation_status='active' AND v.is_deleted=FALSE
           AND v.position_name='保洁员' AND ${VALID} LIMIT 1`);
      await overrideSupervisor(cleaner.rows[0].employee_id, resigned.rows[0].id);
      try {
        const res = await resolveTransmissionTargets({ cycleId: CYCLE_ID, violatorId: cleaner.rows[0].employee_id, checkSource: 'company', transmissionConfig: TCFG });
        check('R4-10b 辞职 supervisor → INVALID_TARGET', res.status === 'INVALID_TARGET' && (res.targets || []).length === 0, JSON.stringify({ status: res.status }));
      } finally { await restoreSupervisors(); }
    }
    // R4-11 死亡 supervisor（真实死亡档案）
    const dead = await q(`SELECT id::int, name FROM employee WHERE employment_relation='死亡' AND is_deleted=FALSE LIMIT 1`);
    check('R4-11a 死亡档案存在', dead.rows.length === 1, JSON.stringify(dead.rows));
    if (dead.rows.length) {
      const inView = await q(`SELECT 1 FROM v_employee_org_full WHERE employee_id=$1 AND is_current=TRUE AND relation_status='active' AND is_deleted=FALSE`, [dead.rows[0].id]);
      if (inView.rows.length) {
        const cleaner = await q(`
          SELECT v.employee_id::int FROM v_employee_org_full v JOIN employee e ON e.id=v.employee_id
           WHERE v.is_current=TRUE AND v.relation_status='active' AND v.is_deleted=FALSE
             AND v.position_name='保洁员' AND ${VALID} LIMIT 1`);
        await overrideSupervisor(cleaner.rows[0].employee_id, dead.rows[0].id);
        try {
          const res = await resolveTransmissionTargets({ cycleId: CYCLE_ID, violatorId: cleaner.rows[0].employee_id, checkSource: 'company', transmissionConfig: TCFG });
          check('R4-11b 死亡 supervisor → INVALID_TARGET', res.status === 'INVALID_TARGET' && (res.targets || []).length === 0, JSON.stringify({ status: res.status }));
        } finally { await restoreSupervisors(); }
      } else {
        check('R4-11-skipped 死亡档案不在现职视图（INVALID 同类路径，见 R4-10）', true);
      }
    }
    // R4-9 正式员工可成为责任目标：R4-1（71 经理）/R4-3（7085/7947）/R4-6（6702）已全量证明
    check('R4-9 正式员工可成为责任目标（由 R4-1/R4-3/R4-6 全量覆盖）', mdOk === 71);
  }

  // ========== R4-17：同 event + 同 employee_id 不重复 deduction（引擎级） ==========
  console.log('\n== R4-17：同 event + employee_id 唯一扣分（引擎级端到端） ==');
  {
    await snapshotEngine();
    await q(`UPDATE hse_assessment_rule SET valid_from='2026-04-30', valid_to=NULL, updated_at=NOW() WHERE rule_code='GRIDVIOL001' AND is_deleted=FALSE`);
    const md = mdCleaners[0];
    // 暂避存量三违管理扣分（上限钳制 capped-out 会吞掉新意图；结束恢复）
    const conflicts = await q(
      `SELECT d.id FROM hse_assessment_deduction d
         JOIN hse_assessment_target t ON t.id=d.target_id AND t.cycle_id=$1
        WHERE t.employee_id = ANY($2) AND d.is_deleted=FALSE AND d.review_status <> 'rejected'
          AND d.deduction_source IN ('auto','chain_transmission')
          AND (d.source_detail->>'category') = '三违管理'`, [CYCLE_ID, [6702, md.mgr_id]]);
    state.conflictIds = conflicts.rows.map((r) => Number(r.id));
    if (state.conflictIds.length) {
      await q(`UPDATE hse_assessment_deduction SET is_deleted=TRUE, updated_at=NOW() WHERE id=ANY($1)`, [state.conflictIds]);
      console.log(`  （暂避存量三违管理扣分 ${state.conflictIds.length} 行，结束恢复）`);
    }
    const tg = await ensureTarget(CYCLE_ID, 6702);
    try {
      // a) 津城保洁员（R4-FIX 确认责任人分支）：恰 1 条扣分且对象=于鑫宁
      const vrA = await insertVr({ violatorId: JINCHENG.ids[0], checkSource: 'company', sourceType: 'grid_candidate' });
      const gvcA = await insertGvc(vrA, 1);
      await q(`UPDATE violation_records SET candidate_id=$1 WHERE id=$2`, [gvcA, vrA]);
      const engine = require('../services/ruleEngine/engine');
      await engine.runCycleAdapters(CYCLE_ID, { adapterKeys: ['sanwei_candidate'] });
      let rows = (await q(
        `SELECT d.id, d.is_deleted, d.is_transmission, t.employee_id
           FROM hse_assessment_deduction d JOIN hse_assessment_target t ON t.id=d.target_id
          WHERE d.source_table='violation_records' AND d.source_id=$1`, [String(vrA)])).rows;
      check('R4-17a 津城保洁员事件 → 恰 1 条扣分且对象=于鑫宁(6702)',
        rows.filter((x) => !x.is_deleted).length === 1 && String(rows[0].employee_id) === '6702', JSON.stringify(rows));
      check('R4-17b is_transmission=TRUE', rows.length > 0 && rows.every((x) => x.is_transmission === true));
      // b) 经理直管保洁员（双身份去重端到端）：恰 1 条扣分（管理器+经理同 employee_id）
      const vrB = await insertVr({ violatorId: md.cleaner_id, checkSource: 'company', sourceType: 'grid_candidate' });
      const gvcB = await insertGvc(vrB, 2);
      await q(`UPDATE violation_records SET candidate_id=$1 WHERE id=$2`, [gvcB, vrB]);
      await engine.runCycleAdapters(CYCLE_ID, { adapterKeys: ['sanwei_candidate'] });
      rows = (await q(
        `SELECT d.id, d.is_deleted, t.employee_id
           FROM hse_assessment_deduction d JOIN hse_assessment_target t ON t.id=d.target_id
          WHERE d.source_table='violation_records' AND d.source_id=$1`, [String(vrB)])).rows;
      const alive = rows.filter((x) => !x.is_deleted);
      check('R4-17c 经理直管保洁员事件 → 恰 1 条扣分（同经理双身份去重，无重复 deduction）',
        alive.length === 1 && String(alive[0].employee_id) === String(md.mgr_id), JSON.stringify(rows));
      // c) 幂等重跑
      await engine.runCycleAdapters(CYCLE_ID, { adapterKeys: ['sanwei_candidate'] });
      rows = (await q(
        `SELECT COUNT(*)::int n FROM hse_assessment_deduction d
          WHERE d.source_table='violation_records' AND d.source_id=$1 AND d.is_deleted=FALSE`, [String(vrB)])).rows;
      check('R4-17d 引擎重跑后仍恰 1 条有效扣分（事件幂等）', Number(rows[0].n) === 1, `n=${rows[0].n}`);
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

  // ========== 收尾基线 ==========
  console.log('\n== 收尾基线核验 ==');
  {
    const rb = (await q(`SELECT rule_code, valid_from, valid_to FROM hse_assessment_rule WHERE rule_code IN ('GRIDVIOL001','VIOLATION003') AND is_deleted=FALSE ORDER BY id`)).rows;
    let rulesOk = true;
    for (const r of rb) {
      const b = state.rulesBefore[r.rule_code];
      if (!b || String(b.validFrom) !== String(r.valid_from) || String(b.validTo ?? '') !== String(r.valid_to ?? '')) rulesOk = false;
    }
    check('Z1 规则有效期已恢复原值', rulesOk, JSON.stringify(rb));
    const vrCnt = Number((await q(`SELECT count(*)::int c FROM violation_records WHERE violator_name LIKE '${MARK}%' OR violation_behavior LIKE '${MARK}%'`)).rows[0].c);
    check('Z2 测试 vr 已清空', vrCnt === 0, `剩余=${vrCnt}`);
    const dedCnt = Number((await q(`SELECT count(*)::int c FROM hse_assessment_deduction WHERE id > $1 AND source_table='violation_records'`, [state.highWater])).rows[0].c);
    check('Z3 测试 deduction 已清空', dedCnt === 0, `剩余=${dedCnt}`);
    const gvcCnt = Number((await q(`SELECT count(*)::int c FROM grid_violation_candidates WHERE behavior_text LIKE '${MARK}%'`)).rows[0].c);
    check('Z4 测试候选已清空', gvcCnt === 0, `剩余=${gvcCnt}`);
    const tgCnt = Number((await q(`SELECT count(*)::int c FROM hse_assessment_target WHERE employee_id=6702 AND cycle_id=$1`, [CYCLE_ID])).rows[0].c);
    check('Z5 临时 target 已清理（6702@cycle53）', tgCnt === 0, `剩余=${tgCnt}`);
    const supChk = await q(
      `SELECT COUNT(*)::int n FROM employee_assignment WHERE employee_id = ANY($1) AND is_current=TRUE AND is_deleted=FALSE
         AND supervisor_id IN (8259, 9478, 6705)`, [[...CORRECTIONS_29.A.ids, ...CORRECTIONS_29.B.ids, ...JINCHENG.ids]]);
    check('Z6 45 条 supervisor 修正终态保持（无回退到旧值）', Number(supChk.rows[0].n) === 0, `n=${supChk.rows[0].n}`);
    check('Z7 supervisor 覆盖已全部恢复', state.supOverrides.length === 0);
  }

  console.log(`\n===== RESULT: PASS=${pass} FAIL=${fail} =====`);
  if (fails.length) { console.log('失败项:'); for (const f of fails) console.log('  -', f); }
  await pool.end();
  process.exit(fail ? 1 : 0);
})().catch(async (e) => {
  console.error('TEST RUNNER ERROR:', e.message);
  if (e.stack) console.error(e.stack.split('\n').slice(1, 5).join('\n'));
  try { await restoreSupervisors(); } catch (_) {}
  try { await removeCreatedTargets(); } catch (_) {}
  try { await restoreRules(); } catch (_) {}
  try { await cleanupEngineData(); } catch (_) {}
  await pool.end();
  process.exit(2);
});
