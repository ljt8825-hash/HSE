/**
 * 规则引擎 · 适配器：三违「检查未反馈/未整改」事件级自动扣分（备建，暂不激活）
 *
 * 业务来源：覆盖矩阵 P0 项 VIOLATION002（规则名「检查未反馈」）。
 * 命中语义（2026-08-31 备建）：
 *   violation_records 中 violator_id 已落键、need_rectification='是'、
 *   且（rectification 为空 / btrim 后为空 / rectification_time 为空）→ 视为「未整改」，
 *   落在当前考核周期月窗口内 → 每人每条计 1 分（口径待业务确认：是否区分查处来源、与
 *   VIOLATION003 同记录是否双重扣分、三违管理大类 15 分上限共用）。
 *
 * 状态：备建完成但 **未激活**——
 *   - 不加入 AUTO_DEDUCTION_ADAPTERS（门面不跑它，门面运行结果本轮前完全一致）；
 *   - 规则行 VIOLATION002 保持 integration_status='pending_data'、adapter_key NULL、metric NULL；
 *   - 激活清单见执行报告-07（置 active + adapter_key + metric_code + 加入 AUTO 列表）。
 *
 * 契约对齐 violationAdapter：事件级幂等（一条违规记录 = 一条扣分）、换人撤销、人工锁定不覆盖、
 * 计入「三违管理」类别上限。差异：KIND='violation_unrectified'（与 violation_event 隔离），
 * 统一 1 分/条（不区分查处来源）。本适配器幂等键补 kind 维度（提示词-07 任务 A 修复后生效）。
 */

const { pool } = require('../../../config/db');
const engine = require('../../assessmentScoringEngine');

const KEY = 'violation_unrectified';
const RULE_CODE = 'VIOLATION002';
const SOURCE_TABLE = 'violation_records';
const KIND = 'violation_unrectified';
const EVENT_TYPE = 'VIOLATION_UNRECTIFIED';
// 激活前指标未映射：保持 null，ensureMetric 不写库；激活时填此常量 + 规则 metric_code
const METRIC_CODE = null;
const METRIC_NAME = '三违检查未整改';

// 事件级幂等：一条违规记录 = 一条扣分（与 violation_event 共用 violation_records，靠 kind 隔离）
const IDEMPOTENCY = 'event';

/**
 * 幂等键：一条违规记录 = 一条扣分（事件模式由 writer 按 source_id + kind 二次校验）
 */
function buildDeductKey({ cycleId, sourceId }) {
  return `violation-unrectified:${cycleId}:${sourceId}`;
}

/**
 * 确保指标存在：METRIC_CODE 为 null（激活前）时不绑定、零写，直接返回 null 指标；
 * 激活后填 METRIC_CODE + 规则 metric_code 即自动补建/复用。
 */
async function ensureMetric(metricCode) {
  if (!METRIC_CODE) return { code: null, id: null };
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
             '三违检查未整改，按未整改记录逐条扣分，受三违管理类别上限钳制',14,'active',
             '自动考核：三违检查未反馈/未整改事件级扣分，计入三违管理类别')
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

  // 指标（激活前 METRIC_CODE=null → 不写库，返回 null 指标）
  const metric = await ensureMetric(rule && rule.metricCode);

  // 本月窗口内、violator_id 已落键、需整改且未整改的违规记录候选
  const candR = await pool.query(
    `SELECT id, violator_id, violator_name, need_rectification, rectification, rectification_time, violation_date
       FROM violation_records
      WHERE is_deleted = FALSE AND violator_id IS NOT NULL
        AND need_rectification = '是'
        AND (rectification IS NULL OR btrim(rectification) = '' OR rectification_time IS NULL)
        AND violation_date >= make_date($1,$2,1)
        AND violation_date <  make_date($1,$2,1) + INTERVAL '1 month'`,
    [year, month]
  );

  // 本月窗口内有效记录 id → 该记录「当前」的 violator_id（撤销判定用）
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

  // violator_id 非空但 violation_date 为 NULL：无法归属周期，跳过（reason='no-date'）
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
      // 口径：统一 1 分/条（不区分查处来源；是否区分待业务确认）
      const rawScore = rule && rule.deductScore > 0 ? rule.deductScore : 1;
      intents.push({
        _seq: seq++,
        sourceId: String(rec.id),
        cycleId,
        targetId: target.id,
        employeeId,
        employeeName: info.name || rec.violator_name,
        ruleName: rule ? rule.ruleName : '检查未反馈',
        category: rule ? rule.category : '三违管理',
        eventType: EVENT_TYPE,
        violationDate: rec.violation_date ? rec.violation_date.toISOString().slice(0, 10) : null,
        needRectification: rec.need_rectification,
        rectification: rec.rectification,
        rectificationTime: rec.rectification_time ? rec.rectification_time.toISOString().slice(0, 10) : null,
        rawScore,
        year,
        month,
      });
    }
  }

  // 撤销集：本周期本 kind 既有自动扣分中——
  //   ① source_id 不在本月有效记录集合内（记录被软删 / 落键丢失 / 已整改离开候选集）
  //   ② source_id 仍在，但记录当前 violator_id ≠ 该扣分行的归属人（改挂他人）
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
function buildItem() {
  return '检查未反馈/未整改1次';
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
    employeeId: intent.employeeId,
    targetId: intent.targetId,
    violationDate: intent.violationDate,
    needRectification: intent.needRectification,
    rectification: intent.rectification,
    rectificationTime: intent.rectificationTime,
    rawScore: intent.rawScore,
    cap: capRes.cap,
    cappedScore: capRes.cappedScore,
    otherCatScore: capRes.otherCatScore,
    summary: `检查未反馈/未整改1次（${intent.violationDate || ''}）`,
  };
}

/**
 * 返回给调用方的 details 元素
 */
function buildReportDetail(intent, outcome) {
  const base = {
    employeeId: intent.employeeId,
    employeeName: intent.employeeName,
    needRectification: intent.needRectification,
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
  // 计量单位：事件级，一条未整改记录 = 1 次扣分，deducted 文案称「人次」
  deductedUnit: 'events',
  ensureMetric,
  buildDeductKey,
  scan,
  buildItem,
  buildDetail,
  buildReportDetail,
};
