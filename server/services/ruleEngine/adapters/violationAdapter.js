/**
 * 规则引擎 · 适配器：三违「自身行为」事件级自动扣分
 *
 * 业务迁移自 server/services/assessmentScoringEngine.js 的 FILL_SOURCES.violation 死路
 * （阶段2 拆除），改为「规则库驱动 + 事件级幂等」：
 *   - 一条违规记录 = 一条扣分（幂等键 = source_table + source_id）
 *   - 违规记录被软删 / violator_id 改挂他人 → 对应扣分软删（revoked）
 *   - 人工锁定（approved/adjusted）不覆盖
 *   - 计入「三违管理」类别，复用引擎统一类别上限钳制
 *
 * 业务口径（2026-08-30 拍板）：
 *   规则库 VIOLATION003 配 1 分/次；check_source='company'（公司查处）5 分/次；
 *   township/self 1 分/次；check_source 为 NULL（未标注）默认按 1 分/次（保守口径）。
 *   → 若业务要求「未标注不计分」，只需把下方 NULL_SCORE 改为 0 即可。
 *   周期归属按 violation_date 落在考核周期年月内；violation_date 为 NULL 的记录跳过
 *   （skipped reason='no-date'），不扣分。
 */

const { pool } = require('../../../config/db');
const engine = require('../../assessmentScoringEngine');

const KEY = 'violation_record';
const RULE_CODE = 'VIOLATION003';
const SOURCE_TABLE = 'violation_records';
const KIND = 'violation_event';
const EVENT_TYPE = 'VIOLATION';
const METRIC_CODE = 'HSE-KPI-SAF-001';
const METRIC_NAME = '三违行为管控';

// 计分开关（业务可改）
const COMPANY_SCORE = 5;   // 公司查处：5 分/次
const DEFAULT_SCORE = 1;   // 乡镇查处 / 自查自纠：1 分/次
// 未标注（check_source 为 NULL）的计分：保持 1（与规则库基准分一致）。
// 若业务要求「未标注不计分」，改为 0 即可，source_detail.checkSourceText 仍显示「未标注」。
const NULL_SCORE = DEFAULT_SCORE;

// 事件级幂等：一条违规记录 = 一条扣分
const IDEMPOTENCY = 'event';

const CHECK_SOURCE_TEXT = {
  company: '公司查处',
  township: '乡镇查处',
  self: '自查自纠',
};

function checkSourceText(cs) {
  return CHECK_SOURCE_TEXT[cs] || '未标注';
}

/**
 * 幂等键：一条违规记录 = 一条扣分（事件模式由 writer 按 source_id 二次校验）
 */
function buildDeductKey({ cycleId, sourceId }) {
  return `violation:${cycleId}:${sourceId}`;
}

/**
 * 确保指标存在（幂等）：规则未配 metric_code 或指标不存在时补建 HSE-KPI-SAF-001
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
     VALUES ($1,$2,'SAFETY','all',0,'auto','violation_records',
             '三违自身行为，按违规记录逐条扣分，受三违管理类别上限钳制',13,'active',
             '自动考核：三违自身行为事件级扣分，计入三违管理类别')
     ON CONFLICT (metric_code) DO UPDATE SET is_deleted=FALSE
     RETURNING id`,
    [METRIC_CODE, METRIC_NAME]
  );
  return { code: METRIC_CODE, id: r.rows[0].id };
}

/**
 * 扫描：产出扣分意图 / 撤销意图 / 跳过名单
 *
 * @returns {Promise<{scanned:number, assessed:number, intents:Array, revocations:Array, skipped:Array, noLedger:boolean, metric:object}>}
 */
async function scan({ cycle, year, month, rule, dryRun }) {
  const cycleId = cycle.id;

  // 指标（幂等 ensure）
  const metric = await ensureMetric(rule && rule.metricCode);

  // 本周期窗口内、violator_id 已落键的违规记录候选（按月窗口在 SQL 侧过滤）
  const candR = await pool.query(
    `SELECT id, violator_id, violator_name, check_source, violation_date
       FROM violation_records
      WHERE is_deleted = FALSE AND violator_id IS NOT NULL
        AND violation_date >= make_date($1,$2,1)
        AND violation_date <  make_date($1,$2,1) + INTERVAL '1 month'`,
    [year, month]
  );

  // 本月窗口内有效记录 id → 该记录「当前」的 violator_id（撤销判定用：
  // 既判断记录是否仍有效，也判断是否被改挂他人）
  const validIdToEmployee = new Map();
  const violators = new Map();  // employeeId -> { name, records: [] }
  const skipped = [];

  for (const rec of candR.rows) {
    validIdToEmployee.set(String(rec.id), String(rec.violator_id));
    if (!violators.has(rec.violator_id)) {
      violators.set(rec.violator_id, { name: rec.violator_name, records: [] });
    }
    violators.get(rec.violator_id).records.push(rec);
  }

  // violator_id 非空但 violation_date 为 NULL：无法归属周期，跳过计数（reason='no-date'）
  const noDateR = await pool.query(
    `SELECT violator_id, violator_name
       FROM violation_records
      WHERE is_deleted = FALSE AND violator_id IS NOT NULL AND violation_date IS NULL`,
    []
  );
  for (const rec of noDateR.rows) {
    skipped.push({ employeeId: rec.violator_id, name: rec.violator_name, reason: 'no-date' });
  }

  const intents = [];
  const revocations = [];
  let seq = 0;

  // 已落键员工 → 考核对象匹配
  for (const [employeeId, info] of violators) {
    const target = await engine.findAssessmentTarget(cycleId, employeeId);
    if (!target) {
      skipped.push({ employeeId, name: info.name, reason: 'not-assessment-target' });
      continue;
    }
    for (const rec of info.records) {
      const cs = rec.check_source || null;
      const rawScore =
        cs === 'company'
          ? COMPANY_SCORE
          : rule && rule.deductScore > 0
          ? rule.deductScore
          : NULL_SCORE;
      intents.push({
        _seq: seq++,
        sourceId: String(rec.id),
        cycleId,
        targetId: target.id,
        employeeId,
        employeeName: info.name || rec.violator_name,
        ruleName: rule ? rule.ruleName : '自身三违行为',
        category: rule ? rule.category : '三违管理',
        eventType: EVENT_TYPE,
        checkSource: cs,
        checkSourceText: checkSourceText(cs),
        violationDate: rec.violation_date ? rec.violation_date.toISOString().slice(0, 10) : null,
        rawScore,
        year,
        month,
      });
    }
  }

  // 撤销集：本周期本 kind 既有自动扣分中——
  //   ① source_id 不在本月有效记录集合内（记录被软删 / 落键丢失）
  //   ② source_id 仍在，但记录当前 violator_id ≠ 该扣分行的归属人
  //      （违规记录改挂他人 → 旧扣分撤销，由新归属人重新生成，避免同一记录双重扣分）
  // 注：source_detail 无 employeeId 的历史行跳过 ② 判定（生产环境目前无此类行）
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
    if (!sid) continue;
    const detail = row.source_detail || {};
    const rowEmployeeId = detail.employeeId != null ? String(detail.employeeId) : null;
    const currentEmployeeId = validIdToEmployee.get(sid);
    const recordGone = currentEmployeeId === undefined;
    const reassigned =
      !recordGone && rowEmployeeId != null && currentEmployeeId !== rowEmployeeId;
    if (recordGone || reassigned) {
      revocations.push({
        _seq: seq++,
        sourceId: sid,
        cycleId,
        targetId: row.target_id,
        employeeId: detail.employeeId != null ? detail.employeeId : null,
        employeeName: detail.employeeName,
      });
    }
  }

  // 口径：scanned = 本月窗口内 violator_id 非空的去重违规人数；
  // assessed = 命中本期考核对象的去重人数（intents 涉及人 ∪ revocations 涉及人）
  const scanned = violators.size;
  const assessedSet = new Set();
  for (const it of intents) assessedSet.add(it.employeeId);
  for (const rv of revocations) if (rv.employeeId != null) assessedSet.add(rv.employeeId);
  const assessed = assessedSet.size;

  return {
    scanned,
    assessed,
    intents,
    revocations,
    skipped,
    noLedger: false,
    metric,
  };
}

/**
 * deduction_item 文案
 */
function buildItem(intent) {
  return intent.checkSource === 'company' ? '三违1次（公司查处）' : '三违1次';
}

/**
 * source_detail 结构
 */
function buildDetail(intent, capRes) {
  return {
    kind: KIND,
    deductKey: buildDeductKey({ cycleId: intent.cycleId, sourceId: intent.sourceId }),
    ruleName: intent.ruleName,
    category: intent.category,
    eventType: EVENT_TYPE,
    sourceId: intent.sourceId,
    // 归属人/考核对象：供「换人撤销」判定与排查（换人时旧扣分行的归属人 ≠ 记录当前 violator_id）
    employeeId: intent.employeeId,
    targetId: intent.targetId,
    violationDate: intent.violationDate,
    checkSource: intent.checkSource,
    checkSourceText: intent.checkSourceText,
    rawScore: intent.rawScore,
    cap: capRes.cap,
    cappedScore: capRes.cappedScore,
    otherCatScore: capRes.otherCatScore,
    summary: `三违1次（${intent.checkSourceText}，${intent.violationDate || ''}）`,
  };
}

/**
 * 返回给调用方的 details 元素
 */
function buildReportDetail(intent, outcome) {
  const base = {
    employeeId: intent.employeeId,
    employeeName: intent.employeeName,
    checkSource: intent.checkSource,
    checkSourceText: intent.checkSourceText,
    rawScore: intent.rawScore,
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
  idempotency: IDEMPOTENCY,
  // 计量单位：三违为「事件级」，一条违规记录 = 1 次扣分，deducted 文案称「人次」
  deductedUnit: 'events',
  ensureMetric,
  buildDeductKey,
  scan,
  buildItem,
  buildDetail,
  buildReportDetail,
};
