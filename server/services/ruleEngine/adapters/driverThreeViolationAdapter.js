/**
 * 规则引擎 · 适配器：驾驶员「日常三违」事件级自动扣分 —— 传导到乡镇作业中心经理
 *
 * 背景（2026-09-12）：
 *   驾驶员日常三违记录（driver_three_violation，逐条）不再只落在驾驶员档案，
 *   每条三违按「每起 1 分」传导给该驾驶员所属乡镇作业中心经理，计入其「三违管理」类别。
 *
 * 口径（已与业务确认）：
 *   - 数据源：driver_three_violation（按 violation_time 归属考核周期年月，LEFT 前 7 位=YYYY-MM）
 *   - 扣分对象：传导到所属乡镇作业中心经理（仅此一级，不含管理员）
 *     · 定位链：记录.name → v_employee_org_full(is_current,active) 唯一员工 → org_name
 *       → findTownManagerForDept(org_name, cycleId) 在考核对象中找该中心「乡镇作业中心经理」
 *   - 扣分粒度：每起三违 1 分（规则库 deductScore 可自定义）；多条记录分别累计到该类别上限
 *   - 归属类别：三违管理（经理侧上限 15，由引擎 applyCap 统一钳制）
 *   - 幂等：事件级（一条记录 = 一条扣分，按 source_id 定位）；记录被软删/移出本月 → 扣分撤销
 *   - 无法定位员工(no-employee/重名) / 无对应乡镇经理(no-town-manager) → 跳过不扣分不报错
 *   - 本月无任何三违记录 → noLedger（该适配器跳过，不影响其他适配器）
 */

const { pool } = require('../../../config/db');
const engine = require('../../assessmentScoringEngine');

const KEY = 'driver_three_violation';
const RULE_CODE = 'DRIVER004';
const SOURCE_TABLE = 'driver_three_violation';
const KIND = 'driver_three_violation_event';
const EVENT_TYPE = 'DRIVER_THREE_VIOLATION';
const METRIC_CODE = 'HSE-KPI-DRV-004';
const METRIC_NAME = '驾驶员日常三违（传导乡镇作业中心经理）';

// 事件级幂等：一条三违记录 = 一条扣分
const IDEMPOTENCY = 'event';

// 默认分值：每起 1 分（规则库可调整）
const DEFAULT_SCORE = 1;

/**
 * 幂等键：一条三违记录 = 一条扣分（事件模式由 writer 按 source_id 二次校验）
 */
function buildDeductKey({ cycleId, sourceId }) {
  return `driver-three-violation:${cycleId}:${sourceId}`;
}

/**
 * 确保指标存在（幂等）
 */
async function ensureMetric(metricCode) {
  let code = metricCode;
  if (code) {
    const existing = await engine.findMetricByCode(code);
    if (existing) return { code, id: existing.id };
    code = METRIC_CODE;
  }
  const metric = await engine.findMetricByCode(METRIC_CODE);
  if (metric) return { code: METRIC_CODE, id: metric.id };
  const r = await pool.query(
    `INSERT INTO hse_assessment_metric
       (metric_code, metric_name, category, target_post, base_score, metric_type,
        data_source, calc_formula, sort_order, status, remark)
     VALUES ($1,$2,'SAFETY','all',0,'auto','driver_three_violation',
             '驾驶员日常三违，每起1分传导到所属乡镇作业中心经理，计入三违管理类别',11,'active',
             '自动考核：驾驶员日常三违事件级扣分，传导到乡镇作业中心经理')
     ON CONFLICT (metric_code) DO UPDATE SET is_deleted=FALSE
     RETURNING id`,
    [METRIC_CODE, METRIC_NAME]
  );
  return { code: METRIC_CODE, id: r.rows[0].id };
}

/**
 * 按"所属作业中心"(org_name) 找该中心在指定考核周期内的「乡镇作业中心经理」考核对象。
 * 只认该职位；无法命中 → 返回 null（不扣分不报错）。
 * 与 driverMonthlyAdapter.findTownManagerForDept 口径保持一致，避免双套逻辑。
 */
async function findTownManagerForDept(orgName, cycleId) {
  const q = `
    SELECT e.employee_id AS id, e.name
      FROM v_employee_org_full e
      JOIN hse_assessment_target t
        ON t.employee_id = e.employee_id AND t.cycle_id = $2 AND t.is_deleted = FALSE
     WHERE e.relation_status = 'active' AND e.is_current = TRUE
       AND e.position_name = '乡镇作业中心经理'
       AND e.org_name = $1
     LIMIT 1`;
  let r = await pool.query(q, [orgName, cycleId]);
  if (!r.rows.length) {
    // 兜底：组织名末段包含（避免"XX作业中心"写法差异）
    const q2 = `SELECT e.employee_id AS id, e.name
                  FROM v_employee_org_full e
                  JOIN hse_assessment_target t
                    ON t.employee_id = e.employee_id AND t.cycle_id = $2 AND t.is_deleted = FALSE
                 WHERE e.relation_status = 'active' AND e.is_current = TRUE
                   AND e.position_name = '乡镇作业中心经理'
                   AND e.org_name LIKE '%' || $1
                 LIMIT 1`;
    r = await pool.query(q2, [orgName, cycleId]);
  }
  return r.rows.length ? { id: r.rows[0].id, name: r.rows[0].name } : null;
}

/**
 * 由驾驶员姓名定位其唯一现职员工记录 → org_name
 * @returns {Promise<{employeeId:number, orgName:string}|null>} null = 无法唯一定位
 */
async function resolveDriverOrg(name) {
  const r = await pool.query(
    `SELECT employee_id, org_name
       FROM v_employee_org_full
      WHERE name = $1 AND is_current = TRUE AND relation_status = 'active' AND is_deleted = FALSE`,
    [name]
  );
  if (r.rows.length === 1) {
    return { employeeId: Number(r.rows[0].employee_id), orgName: r.rows[0].org_name || '' };
  }
  return null; // 0 行(不存在) 或多行(重名) 均视为无法定位
}

/**
 * 扫描：按驾驶员三违记录逐条，传导到所属乡镇作业中心经理 target
 */
async function scan({ cycle, year, month, rule, dryRun }) {
  const cycleId = cycle.id;
  const monthStr = `${year}-${String(month).padStart(2, '0')}`;

  // 台账守卫：本月无驾驶员三违记录 → 跳过该适配器
  const cover = await pool.query(
    `SELECT COUNT(*)::int AS c FROM driver_three_violation
      WHERE is_deleted = FALSE AND LEFT(TRIM(COALESCE(violation_time,'')), 7) = $1`,
    [monthStr]
  );
  if (!cover.rows.length || cover.rows[0].c <= 0) {
    return { scanned: 0, assessed: 0, intents: [], revocations: [], skipped: [], noLedger: true, metric: null };
  }

  const metric = await ensureMetric(rule && rule.metricCode);
  const unit = rule && rule.deductScore > 0 ? Number(rule.deductScore) : DEFAULT_SCORE;

  const candR = await pool.query(
    `SELECT id, name, violation_time, violation_desc, demerit_points, plate_no
       FROM driver_three_violation
      WHERE is_deleted = FALSE AND LEFT(TRIM(COALESCE(violation_time,'')), 7) = $1`,
    [monthStr]
  );

  // 本月有效记录 id（撤销判定：记录被软删/移出本月 → 撤销）
  const validIdSet = new Set();
  const skipped = [];
  const driverCache = new Map();   // name -> {orgName}|null
  const mgrCache = new Map();      // orgName -> {id,name}|null
  const targetCache = new Map();   // managerId -> target|null

  const intents = [];
  let scanned = 0;

  for (const rec of candR.rows) {
    scanned++;
    const sourceId = String(rec.id);
    validIdSet.add(sourceId);

    // 1) 定位驾驶员所属作业中心
    let drv = driverCache.get(rec.name);
    if (drv === undefined) {
      const org = await resolveDriverOrg(rec.name);
      drv = org && org.orgName ? { orgName: org.orgName } : null;
      if (!drv) {
        skipped.push({ sourceId, driver: rec.name, reason: 'no-unique-employee' });
        continue;
      }
      driverCache.set(rec.name, drv);
    }
    if (!drv) continue;

    // 2) 找该中心乡镇作业中心经理（考核对象内，仅此一级）
    let mgr = mgrCache.get(drv.orgName);
    if (mgr === undefined) {
      mgr = await findTownManagerForDept(drv.orgName, cycleId);
      mgrCache.set(drv.orgName, mgr);
    }
    if (!mgr) {
      // 每条记录都补报原因（同 org 多条也逐条，保证 skipped 可排查完整）
      skipped.push({ sourceId, driver: rec.name, org: drv.orgName, reason: 'no-town-manager' });
      continue;
    }

    // 3) 经理考核对象 target
    let target = targetCache.get(mgr.id);
    if (target === undefined) {
      target = await engine.findAssessmentTarget(cycleId, mgr.id) || null;
      targetCache.set(mgr.id, target);
      if (!target) {
        skipped.push({ sourceId, driver: rec.name, name: mgr.name, reason: 'manager-not-assessment-target' });
        continue;
      }
    }
    if (!target) continue;

    intents.push({
      _seq: intents.length,
      sourceId,
      cycleId,
      targetId: target.id,
      employeeId: mgr.id,
      employeeName: mgr.name,
      driverName: rec.name,
      plateNo: rec.plate_no || '',
      demeritPoints: rec.demerit_points != null ? rec.demerit_points : 0,
      violationDate: (rec.violation_time || '').trim(),
      violationDesc: rec.violation_desc || '',
      ruleName: rule ? rule.ruleName : '驾驶员日常三违（传导）',
      category: rule ? rule.category : '三违管理',
      eventType: EVENT_TYPE,
      rawScore: unit,
      unit,
      year,
      month,
    });
  }

  // 撤销集：本周期本 kind 既有自动扣分行中，source_id 已不在本月有效记录集内 → 撤销
  const revocations = [];
  const existR = await pool.query(
    `SELECT id, target_id, source_id, source_detail
       FROM hse_assessment_deduction
      WHERE cycle_id = $1 AND deduction_source = 'auto'
        AND source_table = $2 AND source_detail ->> 'kind' = $3
        AND is_deleted = FALSE`,
    [cycleId, SOURCE_TABLE, KIND]
  );
  for (const row of existR.rows) {
    const sid = row.source_id != null ? String(row.source_id) : null;
    if (!sid || validIdSet.has(sid)) continue;
    const detail = row.source_detail || {};
    revocations.push({
      _seq: intents.length + revocations.length,
      sourceId: sid,
      cycleId,
      targetId: row.target_id,
      employeeId: detail.employeeId != null ? detail.employeeId : null,
      employeeName: detail.employeeName || null,
    });
  }

  const assessedSet = new Set();
  for (const it of intents) assessedSet.add(it.employeeId);
  for (const rv of revocations) if (rv.employeeId != null) assessedSet.add(rv.employeeId);

  return {
    scanned,
    assessed: assessedSet.size,
    intents,
    revocations,
    skipped,
    noLedger: false,
    metric,
  };
}

function buildItem(intent) {
  return `${intent.driverName}日常三违1起（传导）`;
}

function buildDetail(intent, capRes) {
  return {
    kind: KIND,
    deductKey: buildDeductKey({ cycleId: intent.cycleId, sourceId: intent.sourceId }),
    ruleName: intent.ruleName,
    category: intent.category,
    eventType: EVENT_TYPE,
    sourceId: intent.sourceId,
    employeeId: intent.employeeId,
    targetId: intent.targetId,
    driverName: intent.driverName,
    plateNo: intent.plateNo,
    demeritPoints: intent.demeritPoints,
    violationDate: intent.violationDate,
    violationDesc: intent.violationDesc,
    rawScore: intent.rawScore,
    cap: capRes.cap,
    cappedScore: capRes.cappedScore,
    otherCatScore: capRes.otherCatScore,
    year: intent.year,
    month: intent.month,
    summary: `驾驶员${intent.driverName}日常三违1起（传导至${intent.employeeName}，${intent.violationDate}）`,
  };
}

function buildReportDetail(intent, outcome) {
  const base = {
    employeeId: intent.employeeId,
    employeeName: intent.employeeName,
    driverName: intent.driverName,
    rawScore: intent.rawScore,
  };
  if (outcome.type === 'revoke') return { ...base, cappedScore: 0, action: outcome.action };
  if (outcome.type === 'capped-out') return { ...base, cappedScore: 0, cappedOut: true, action: outcome.action };
  return { ...base, cappedScore: outcome.cappedScore, action: outcome.action };
}

module.exports = {
  key: KEY,
  ruleCode: RULE_CODE,
  sourceTable: SOURCE_TABLE,
  kind: KIND,
  metricCode: METRIC_CODE,
  idempotency: IDEMPOTENCY,
  deductedUnit: 'events',
  ensureMetric,
  findTownManagerForDept,
  buildDeductKey,
  scan,
  buildItem,
  buildDetail,
  buildReportDetail,
};