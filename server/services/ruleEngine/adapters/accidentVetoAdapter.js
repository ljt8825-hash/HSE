/**
 * 规则引擎 · 适配器：事故否决项（交通 / 生产安全）「一票否决」
 *
 * 数据源：accidents（事故管理台账）
 *   - accident_category / accident_nature / accident_date / responsibility_team /
 *     party_dept / party_supervisor / involved_person / personnel_id
 * 口径（2026-09-05 拍板；2026-09-06 修订）：
 *   - 交通：事故性质∈{全部责任,主要责任,同等责任,次要责任}（排除「无责任」「待认定」）
 *           → 扣「当事人直接上级 + 乡镇作业中心经理」
 *   - 生产安全：nature='责任' → 扣「当事人直接上级 + 乡镇作业中心经理」
 *   - 直接上级名单不含「管理员」：驾驶员/保洁员等一线作业人员的直接上级为属地乡镇作业中心经理，
 *     管理员不作为事故否决的直接上级考核对象（2026-09-06 修订，撤销张福梅式管理员否决）。
 *   - 其他类别（意外/公众/突发疾病/职业病/其它）只记录，不自动扣分（人工处理另行）
 *   - 分值：一票否决=100，进入「否决项」类别（类别上限 100），使该对象 score_auto 归 0
 * 幂等：事件模式，按 (考核对象 + 事故) 一条=每个对象每事故一条；source_id=事故 id
 */

const { pool } = require('../../../config/db');
const engine = require('../../assessmentScoringEngine');

const KEY = 'accident_veto';
const RULE_CODE = 'ACCIDENT_VETO';
const SOURCE_TABLE = 'accidents';
const KIND = 'accident_veto';
const EVENT_TYPE = 'ACCIDENT_VETO';
const METRIC_CODE = 'HSE-KPI-NEG-004';
const METRIC_NAME = '事故否决（交通/生产安全责任）';

// 合格性质：交通排除 无责任/待认定；生产安全仅责任
const QUALIFYING_TRAFFIC_NATURES = ['全部责任', '主要责任', '同等责任', '次要责任'];

// 一票否决分值
const VETO_SCORE = 100;

// 上级（直接上级/乡镇经理）允许的考核对象岗位，用于「直接上级」按姓名匹配 target
// 2026-09-06 修订：不含「管理员」——一线作业人员(驾驶员/保洁员)的直接上级为属地乡镇作业中心经理
const SUPERVISOR_POSITIONS = ['乡镇作业中心经理', '部门经理', '环卫作业中心副经理', '环卫作业中心副经理（人工）'];

/**
 * 幂等键：每对象每事故一条
 */
function buildDeductKey({ cycleId, employeeId, accidentId }) {
  return `accident-veto:${cycleId}:${employeeId}:${accidentId}`;
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
     VALUES ($1,$2,'SAFETY','all',0,'auto','accidents',
             '事故交通/生产安全事故责任：一票否决100分，扣当事人直接上级及乡镇作业中心经理',10,'active',
             '自动考核：事故否决项，一票否决')
     ON CONFLICT (metric_code) DO UPDATE SET is_deleted=FALSE
     RETURNING id`,
    [METRIC_CODE, METRIC_NAME]
  );
  return { code: METRIC_CODE, id: r.rows[0].id };
}

/**
 * 按"责任班组/所属作业中心"(depart) 找该中心在指定考核周期内的「乡镇作业中心经理」考核对象。
 * 复用 driverMonthlyAdapter.findTownManagerForDept 同口径。
 */
async function findTownManagerForDept(depart, cycleId) {
  if (!depart) return null;
  const q = `
    SELECT e.employee_id AS id, e.name
      FROM v_employee_org_full e
      JOIN hse_assessment_target t
        ON t.employee_id = e.employee_id AND t.cycle_id = $2 AND t.is_deleted = FALSE
     WHERE e.relation_status = 'active'
       AND e.position_name = '乡镇作业中心经理'
       AND e.org_name = $1
     LIMIT 1`;
  let r = await pool.query(q, [depart, cycleId]);
  if (!r.rows.length) {
    const q2 = `SELECT e.employee_id AS id, e.name
                  FROM v_employee_org_full e
                  JOIN hse_assessment_target t
                    ON t.employee_id = e.employee_id AND t.cycle_id = $2 AND t.is_deleted = FALSE
                 WHERE e.relation_status = 'active'
                   AND e.position_name = '乡镇作业中心经理'
                   AND e.org_name LIKE '%' || $1
                 LIMIT 1`;
    r = await pool.query(q2, [depart, cycleId]);
  }
  return r.rows.length ? { id: r.rows[0].id, name: r.rows[0].name } : null;
}

/**
 * 取「直接上级」：party_supervisor 段串的第一段（按 / 拆分、去空格）。
 * 若与当事人同名则取下一段（本人即上级的边界情况）。
 */
function parseDirectSupervisor(supStr, involvedPerson) {
  if (!supStr || typeof supStr !== 'string') return null;
  const segs = supStr.split('/').map((s) => String(s).trim()).filter(Boolean);
  for (const seg of segs) {
    if (seg !== involvedPerson) return seg;
  }
  return segs[0] || null;
}

/**
 * 按「直接上级姓名」在考核周期内匹配目标（岗位限定为领导岗）。
 */
async function findSupervisorTarget(name, cycleId) {
  if (!name) return null;
  const r = await pool.query(
    `SELECT id, employee_id AS employeeId, employee_name AS name
       FROM hse_assessment_target
      WHERE cycle_id = $1 AND is_deleted = FALSE AND employee_name = $2
        AND position = ANY($3::text[])
      ORDER BY id LIMIT 1`,
    [cycleId, name, SUPERVISOR_POSITIONS]
  );
  return r.rows.length ? { id: r.rows[0].id, employeeId: r.rows[0].employeeId, name: r.rows[0].name } : null;
}

async function findTargetById(targetId, cycleId) {
  const r = await pool.query(
    `SELECT id, employee_id AS "employeeId", employee_name AS name
       FROM hse_assessment_target WHERE id = $1 AND cycle_id = $2 AND is_deleted = FALSE`,
    [targetId, cycleId]
  );
  return r.rows.length ? { id: r.rows[0].id, employeeId: r.rows[0].employeeId, name: r.rows[0].name } : null;
}

/**
 * 扫描：当月合格事故 → 解析扣分对象（直接上级 + 乡镇经理，去重）→ 生成否决意图；并撤销不再合格的行
 */
async function scan({ cycle, year, month, rule, dryRun }) {
  const cycleId = cycle.id;
  const metric = await ensureMetric(rule.metricCode);

  const rows = (
    await pool.query(
      `SELECT id, accident_date, accident_category, accident_nature,
              involved_person, personnel_id, involved_person_role,
              responsibility_team, party_dept, party_supervisor
         FROM accidents
        WHERE is_deleted = FALSE
          AND ( (accident_category = '交通' AND accident_nature = ANY($3::text[]))
                  OR (accident_category = '生产安全' AND accident_nature = '责任') )
          AND (accident_date AT TIME ZONE 'Asia/Shanghai')::date >= make_date($1,$2,1)
          AND (accident_date AT TIME ZONE 'Asia/Shanghai')::date <  make_date($1,$2,1) + INTERVAL '1 month'`,
      [year, month, QUALIFYING_TRAFFIC_NATURES]
    )
  ).rows;

  const managerCache = new Map(); // dept -> {id,name}|null
  const supervisorCache = new Map(); // name -> target|null
  const intents = [];
  const skipped = [];
  const qualifiedKeys = new Set(); // `${accidentId}:${targetId}`
  let scanned = 0;
  let seq = 0;

  for (const acc of rows) {
    scanned++;
    const accidentId = Number(acc.id);
    // 解析目标（去重：同一事故可能上级==乡镇经理）
    const targets = new Map(); // targetId -> target

    // 乡镇作业中心经理（findTownManagerForDept.id = employee_id → 再解出 target.id）
    // 兜底顺序：responsibility_team 先试，无经理则回退 party_dept。
    // 例：事故 #155 responsibility_team='柴胡店镇一班' 匹配不到经理，party_dept='柴胡店镇作业中心'
    //     才能解析到该中心的「乡镇作业中心经理」。缓存以 dept 为键，两候选各查一次。
    let townMgr = null;
    for (const dept of [acc.responsibility_team, acc.party_dept]) {
      if (!dept) continue;
      if (!managerCache.has(dept)) {
        managerCache.set(dept, await findTownManagerForDept(dept, cycleId));
      }
      const found = managerCache.get(dept);
      if (found) {
        townMgr = found;
        break;
      }
    }
    if (townMgr) {
      const tgt = await engine.findAssessmentTarget(cycleId, townMgr.id);
      if (tgt) targets.set(tgt.id, { id: tgt.id, employeeId: tgt.employee_id, name: tgt.employee_name });
    }

    // 直接上级
    const supName = parseDirectSupervisor(acc.party_supervisor, (acc.involved_person || '').trim());
    let sup;
    if (supName) {
      if (!supervisorCache.has(supName)) {
        const found = await findSupervisorTarget(supName, cycleId);
        supervisorCache.set(supName, found);
      }
      sup = supervisorCache.get(supName);
    }
    if (sup) targets.set(sup.id, sup);

    if (!targets.size) {
      skipped.push({ accidentId, name: acc.involved_person, reason: 'no-matching-target', category: acc.accident_category, nature: acc.accident_nature });
      continue;
    }

    for (const target of targets.values()) {
      qualifiedKeys.add(`${accidentId}:${target.id}`);
      intents.push({
        _seq: seq++,
        cycleId,
        targetId: target.id,
        employeeId: target.employeeId,
        employeeName: target.name,
        ruleName: rule.ruleName,
        category: rule.category,
        sourceId: accidentId,
        rawScore: VETO_SCORE,
        accident: {
          id: accidentId,
          category: acc.accident_category,
          nature: acc.accident_nature,
          involvedPerson: acc.involved_person,
          accidentDate: acc.accident_date,
          responsibilityTeam: acc.responsibility_team,
          partyDept: acc.party_dept,
          supervisor: acc.party_supervisor,
        },
        year,
        month,
      });
    }
  }

  // 撤销：该周期已有 accident_veto 行，但事故已不再合格（性质改无责/待认定、类别改其他、事故删除、
  // 或目标不再命中）→ 返回 revocations 供 writer 软删
  const existing = (
    await pool.query(
      `SELECT id, target_id, source_id
         FROM hse_assessment_deduction
        WHERE cycle_id = $1 AND deduction_source = 'auto'
          AND source_table = 'accidents'
          AND source_detail ->> 'kind' = 'accident_veto'
          AND is_deleted = FALSE`,
      [cycleId]
    )
  ).rows;
  const revocations = [];
  for (const ex of existing) {
    const tgtId = Number(ex.target_id);
    const accId = Number(ex.source_id);
    const key = `${accId}:${tgtId}`;
    if (qualifiedKeys.has(key)) continue; // 当前仍合格，保留
    const tgt = await findTargetById(tgtId, cycleId);
    revocations.push({
      _seq: seq++,
      cycleId,
      targetId: tgtId,
      employeeId: tgt ? tgt.employeeId : null,
      employeeName: tgt ? tgt.name : null,
      sourceId: accId,
      rawScore: 0,
    });
  }

  return {
    scanned,
    assessed: intents.length + revocations.length,
    intents,
    revocations,
    skipped,
    noLedger: rows.length === 0 && existing.length === 0,
    metric,
  };
}

function buildItem(intent, rule) {
  const a = intent.accident || {};
  return `事故否决（${a.category || ''}·${a.nature || ''}）`;
}

function buildDetail(intent, capRes) {
  const a = intent.accident || {};
  return {
    kind: KIND,
    ruleName: intent.ruleName,
    category: intent.category,
    eventType: EVENT_TYPE,
    accidentId: intent.sourceId,
    accidentCategory: a.category,
    accidentNature: a.nature,
    involvedPerson: a.involvedPerson,
    accidentDate: a.accidentDate,
    responsibilityTeam: a.responsibilityTeam,
    partyDept: a.partyDept,
    supervisor: a.supervisor,
    rawScore: intent.rawScore,
    cap: capRes.cap,
    cappedScore: capRes.cappedScore,
    otherCatScore: capRes.otherCatScore,
    year: intent.year,
    month: intent.month,
    summary: `交通事故/生产安全事故否决（${a.category || ''}·${a.nature || ''}），一票否决`,
  };
}

function buildReportDetail(intent, outcome) {
  const a = intent.accident || {};
  const base = {
    employeeId: intent.employeeId,
    employeeName: intent.employeeName,
    accidentId: intent.sourceId,
    accidentCategory: a.category,
    accidentNature: a.nature,
  };
  if (outcome.type === 'revoke') {
    return { ...base, cappedScore: 0, action: outcome.action };
  }
  if (outcome.type === 'capped-out') {
    return { ...base, cappedScore: 0, cappedOut: true, action: outcome.action };
  }
  return { ...base, cappedScore: outcome.cappedScore, action: outcome.action };
}

module.exports = {
  key: KEY,
  ruleCode: RULE_CODE,
  sourceTable: SOURCE_TABLE,
  kind: KIND,
  metricCode: METRIC_CODE,
  idempotency: 'event',
  ensureMetric,
  buildDeductKey,
  scan,
  buildItem,
  buildDetail,
  buildReportDetail,
};