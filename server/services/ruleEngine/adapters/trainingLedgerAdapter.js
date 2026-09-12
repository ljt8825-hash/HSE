/**
 * 规则引擎 · 适配器：HSE教育培训「培训台账月度」缺训/资料不完整扣分
 *
 * 数据源：hse_training_ledger_monthly（月度培训台账，由「培训记录」导入生成）
 *   - missing_count      缺少人数
 *   - incomplete_count   资料不完整份数
 * 口径（2026-09-04 拍板）：
 *   - 每缺少 1 人 / 每资料不完整 1 份，各扣规则库 deductible 分值（默认 1 分，页面可自定义）
 *   - 扣分对象 = 培训人（trainer）本人，不传导上级
 *   - 计入「HSE教育培训」类别，受 hse_assessment_category_limit.max_deduct 钳制（引擎统一处理）
 *   - 当月无培训台账记录 → 整月跳过（noLedger）
 * 幂等：月度模式，一轮=每人一条；trainer 非考核对象时跳过并记 reason。
 */

const { pool } = require('../../../config/db');
const engine = require('../../assessmentScoringEngine');

const KEY = 'training_ledger';
const RULE_CODE = 'TRAINING001';
const SOURCE_TABLE = 'hse_training_ledger_monthly';
const KIND = 'training_ledger_monthly';
const EVENT_TYPE = 'TRAINING_LEDGER';
const METRIC_CODE = 'HSE-KPI-TRN-003';
const METRIC_NAME = '培训台账缺训（缺少/资料不完整）';

/**
 * 幂等键：按培训人 + 周期（月度模式统一为 cycleId + employeeId）
 */
function buildDeductKey({ cycleId, employeeId }) {
  return `training-ledger:${cycleId}:${employeeId}`;
}

/**
 * 确保指标存在（幂等）：无现成培训台账指标时补建。
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
     VALUES ($1,$2,'SAFETY','all',0,'auto','hse_training_ledger_monthly',
             '本月缺训/资料不完整份数×单份分值，计入HSE教育培训类别上限',11,'active',
             '自动考核：培训台账「缺少/资料不完整」月度扣分，扣培训人本人')
     ON CONFLICT (metric_code) DO UPDATE SET is_deleted=FALSE
     RETURNING id`,
    [METRIC_CODE, METRIC_NAME]
  );
  return { code: METRIC_CODE, id: r.rows[0].id };
}

/**
 * 扫描：产出扣分意图 / 撤销意图 / 跳过名单
 */
async function scan({ cycle, year, month, rule, dryRun }) {
  const cycleId = cycle.id;
  const monthStr = `${year}-${String(month).padStart(2, '0')}`;

  // 台账覆盖守卫：当月无任何培训台账 → 跳过
  const cover = await pool.query(
    `SELECT COUNT(*)::int AS c FROM hse_training_ledger_monthly WHERE month = $1`,
    [monthStr]
  );
  if (!cover.rows.length || cover.rows[0].c <= 0) {
    return { scanned: 0, assessed: 0, intents: [], revocations: [], skipped: [], noLedger: true, metric: null };
  }

  const metric = await ensureMetric(rule.metricCode);

  const records = (
    await pool.query(
      `SELECT id, trainer_id, trainer_name, missing_count, incomplete_count
         FROM hse_training_ledger_monthly
        WHERE month = $1`,
      [monthStr]
    )
  ).rows;

  const unit = rule.deductScore > 0 ? rule.deductScore : 1; // 默认 1，页面可自定义
  const intents = [];
  const revocations = [];
  const skipped = [];
  let seq = 0;

  for (const rec of records) {
    const trainerId = rec.trainer_id;
    if (!trainerId) {
      skipped.push({ employeeId: null, name: rec.trainer_name, reason: 'no-trainer-id' });
      continue;
    }
    const target = await engine.findAssessmentTarget(cycleId, trainerId);
    if (!target) {
      skipped.push({ employeeId: trainerId, name: rec.trainer_name, reason: 'not-assessment-target' });
      continue;
    }

    const missing = Math.max(0, Number(rec.missing_count) || 0);
    const incomplete = Math.max(0, Number(rec.incomplete_count) || 0);
    const rawScore = Math.round((missing + incomplete) * unit * 100) / 100;

    const base = {
      _seq: seq++,
      cycleId,
      targetId: target.id,
      employeeId: trainerId,
      employeeName: rec.trainer_name,
      ruleName: rule.ruleName,
      category: rule.category,
      missing,
      incomplete,
      unit,
      rawScore,
      year,
      month,
    };

    if (rawScore <= 0) {
      revocations.push(base);
    } else {
      intents.push(base);
    }
  }

  const assessed = intents.length + revocations.length;
  return { scanned: records.length, assessed, intents, revocations, skipped, noLedger: false, metric };
}

/**
 * deduction_item 文案：取规则名
 */
function buildItem(intent, rule) {
  return rule.ruleName;
}

/**
 * source_detail 结构
 */
function buildDetail(intent, capRes) {
  return {
    kind: KIND,
    deductKey: buildDeductKey({ cycleId: intent.cycleId, employeeId: intent.employeeId }),
    ruleName: intent.ruleName,
    category: intent.category,
    eventType: EVENT_TYPE,
    missing: intent.missing,
    incomplete: intent.incomplete,
    unit: intent.unit,
    rawScore: intent.rawScore,
    cap: capRes.cap,
    cappedScore: capRes.cappedScore,
    otherCatScore: capRes.otherCatScore,
    year: intent.year,
    month: intent.month,
    summary: `培训台账：缺少${intent.missing}人/资料不完整${intent.incomplete}份`,
  };
}

/**
 * 返回给调用方的 details 元素
 */
function buildReportDetail(intent, outcome) {
  const base = {
    employeeId: intent.employeeId,
    employeeName: intent.employeeName,
    missing: intent.missing,
    incomplete: intent.incomplete,
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
  ensureMetric,
  buildDeductKey,
  scan,
  buildItem,
  buildDetail,
  buildReportDetail,
};