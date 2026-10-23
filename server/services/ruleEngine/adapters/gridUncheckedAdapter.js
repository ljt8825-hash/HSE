/**
 * 规则引擎 · 适配器：网格长「未检查/未巡查」月度缺次扣分
 *
 * 业务逻辑由 server/services/gridUncheckedDeductionService.js 原样迁入，仅拆分为
 * 「扫描（产出意图）」+「引擎统一钳制与落库」两段。阶段1 铁律：零行为变化，
 * source_detail 结构、deductKey、kind、summary 文案与迁移前逐字段一致。
 *
 * 业务口径（2026-09-25 收口，替代此前误用「公司人员查处 R000001 5分/次」）：
 *   缺次 = max(0, 应巡 − 实巡)；每缺 1 次扣规则库「网格长巡查考核·扣1分/次」deduct_score 分
 *   应巡/实巡复用 gridCompletionService.getGridPatrolStats（当前月按今天截止、过去月按整月）
 *   计入「三违管理」类别，受 hse_assessment_category_limit.max_deduct 钳制（由引擎统一处理，经理15/管理员40）
 *   「公司人员查处」语义=公司管理（总/一级网格长）查处各乡镇各班组三违，与网格长缺巡无关（由 GRIDVIOL001 通路承担）
 *   当月无 grid_inspection_records 台账 → 整月跳过（noLedger）
 */

const { pool } = require('../../../config/db');
const engine = require('../../assessmentScoringEngine');
const gridCompletion = require('../../gridCompletionService');

const KEY = 'grid_unchecked';
const RULE_CODE = 'GRIDCHECK001';
const SOURCE_TABLE = 'grid_inspection_records';
const KIND = 'grid_unchecked_monthly';
const EVENT_TYPE = 'GRID_UNCHECKED';
const METRIC_CODE = 'HSE-KPI-SAF-004';
const METRIC_NAME = '网格未巡查（未检查）';

/**
 * 幂等键：与迁移前完全一致
 */
function buildDeductKey({ cycleId, employeeId }) {
  return `grid-unchecked:${cycleId}:${employeeId}`;
}

/**
 * 确保指标存在（幂等）：规则未配 metric_code 或指标不存在时补建 HSE-KPI-SAF-004。
 * 不使用 HSE-KPI-GRD-001（那是网格类，不计入「三违管理」）。
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
     VALUES ($1,$2,'SAFETY','all',0,'auto','grid_inspection_records',
             '网格长本月缺巡次数×单次分值，受三违管理类别上限钳制',12,'active',
             '自动考核：网格长未巡查（未检查）月度缺次扣分，计入三违管理类别')
     ON CONFLICT (metric_code) DO UPDATE SET is_deleted=FALSE
     RETURNING id`,
    [METRIC_CODE, METRIC_NAME]
  );
  return { code: METRIC_CODE, id: r.rows[0].id };
}

/**
 * 扫描：产出扣分意图 / 撤销意图 / 跳过名单
 * @param {object} p
 * @param {object} p.cycle  周期行
 * @param {number} p.year
 * @param {number} p.month
 * @param {object} p.rule   规则配置（ruleLoader 产出）
 * @param {boolean} p.dryRun
 * @returns {Promise<{scanned:number, intents:Array, revocations:Array, skipped:Array, noLedger:boolean, metric:object}>}
 */
async function scan({ cycle, year, month, rule, dryRun }) {
  const cycleId = cycle.id;

  // 台账覆盖守卫：当月无任何台账数据时禁止扣分
  const cover = await pool.query(
    `SELECT COUNT(*)::int AS c FROM grid_inspection_records
      WHERE inspection_date >= make_date($1,$2,1)
        AND inspection_date <  make_date($1,$2,1) + INTERVAL '1 month'`,
    [year, month]
  );
  if (!cover.rows.length || cover.rows[0].c <= 0) {
    return { scanned: 0, assessed: 0, intents: [], revocations: [], skipped: [], noLedger: true, metric: null };
  }

  // 指标（与迁移前一致：dryRun 也会 ensure，写入幂等）
  const metric = await ensureMetric(rule.metricCode);

  // 加载网格长与其网格（按人聚合 expected/actual）
  const grids = (
    await pool.query(
      `SELECT id, name, personnel_id, grid_level, patrol_frequency
         FROM grid_areas
        WHERE is_deleted = FALSE AND personnel_id IS NOT NULL`
    )
  ).rows;
  const hireDateByGrid = await gridCompletion.getHireDateMap(grids.map((g) => g.id));
  const statMap = await gridCompletion.getGridPatrolStats(grids, { year, month, hireDateByGrid });
  // 逐日缺巡日期（仅可按天定位频率的网格参与；非按天频率不逐日标记）
  const missedDatesMap = await gridCompletion.getMissedDatesMap(grids, { year, month, hireDateByGrid });

  const perPerson = new Map(); // personnel_id -> { name, expected, actual }
  for (const g of grids) {
    const s = statMap.get(g.id);
    if (!s) continue;
    const cur = perPerson.get(g.personnel_id) || { name: g.name, expected: 0, actual: 0 };
    cur.expected += s.expected || 0;
    cur.actual += s.actual || 0;
    perPerson.set(g.personnel_id, cur);
  }

  const unit = rule.deductScore > 0 ? rule.deductScore : 1;
  const cumulative = rule.deductType === 'cumulative';

  const intents = [];
  const revocations = [];
  const skipped = [];
  let seq = 0;

  for (const [personnelId, p] of perPerson) {
    const target = await engine.findAssessmentTarget(cycleId, personnelId);
    if (!target) {
      skipped.push({ employeeId: personnelId, name: p.name, reason: 'not-assessment-target' });
      continue;
    }

    const missing = Math.max(0, p.expected - p.actual);
    const rawScore = Math.round((cumulative ? missing * unit : missing > 0 ? unit : 0) * 100) / 100;
    const base = {
      _seq: seq++,
      cycleId,
      targetId: target.id,
      employeeId: personnelId,
      employeeName: p.name,
      ruleName: rule.ruleName,
      category: rule.category,
      expected: p.expected,
      actual: p.actual,
      actualZero: p.actual === 0,
      missing,
      unit,
      rawScore,
      year,
      month,
      // 逐日缺巡日期（YYYY-MM-DD 升序；无可定位日期时空数组）
      missedDates: missedDatesMap.get(personnelId) || [],
    };

    if (missing <= 0 || rawScore <= 0) {
      revocations.push(base);
    } else {
      intents.push(base);
    }
  }

  // assessed = 实际命中考核对象的人数（intents + revocations）；
  // skipped（not-assessment-target，非本期考核对象）不计入，避免与 scanned 混淆
  const assessed = intents.length + revocations.length;
  return { scanned: perPerson.size, assessed, intents, revocations, skipped, noLedger: false, metric };
}

/**
 * deduction_item 文案：与迁移前一致，取规则名
 */
function buildItem(intent, rule) {
  return rule.ruleName;
}

/**
 * source_detail 结构：与迁移前逐字段一致
 */
function buildDetail(intent, capRes) {
  return {
    kind: KIND,
    deductKey: buildDeductKey({ cycleId: intent.cycleId, employeeId: intent.employeeId }),
    ruleName: intent.ruleName,
    category: intent.category,
    eventType: EVENT_TYPE,
    expected: intent.expected,
    actual: intent.actual,
    missing: intent.missing,
    unit: intent.unit,
    rawScore: intent.rawScore,
    cap: capRes.cap,
    cappedScore: capRes.cappedScore,
    otherCatScore: capRes.otherCatScore,
    year: intent.year,
    month: intent.month,
    missedDates: intent.missedDates || [],
    summary: `未检查（本月应巡${intent.expected}次/实巡${intent.actual}次/缺${intent.missing}次）`,
  };
}

/**
 * 返回给调用方的 details 元素：与迁移前逐字段一致
 */
function buildReportDetail(intent, outcome) {
  const base = {
    employeeId: intent.employeeId,
    employeeName: intent.employeeName,
    expected: intent.expected,
    actual: intent.actual,
    actualZero: intent.actualZero,
    missing: intent.missing,
    missedDates: intent.missedDates || [],
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
