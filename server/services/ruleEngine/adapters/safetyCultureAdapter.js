/**
 * 规则引擎 · 适配器：安全文化建设「专项活动台帐」月度扣分（主管版）
 *
 * 数据源：hse_safety_culture_monthly（月度安全文化建设台账，由「专项活动台帐」导入生成）
 *   - act_three_violation  "三违"专项活动 是否开展(1=√)
 *   - act_duty_safety      轮值安全员 是否开展(1=√)
 *   - act_traffic_risk     交通安全危险因素识别清单 是否开展(1=√)
 *   - manual_deduct        表格「扣分」列（>0 优先采用）
 * 扣分对象：乡镇主管 = 二级网格长（乡镇作业中心经理）。台账行 employee_id 在导入时
 *   按 name+dept+level 回填；此处再兜底按 level/name 匹配该周期考核对象。
 * 口径（2026-09-04 拍板）：
 *   - 表格 manual_deduct>0 → 直接采用；
 *   - 否则按未开展的√项数 × 规则 deductible_score（默认 10 分/项/次，页面可改）
 *   - 计入「安全文化建设」类别，上限 20 被引擎钳制
 *   - 当月无台账 → 整月跳过（noLedger）
 *   - 行考核对象非当月考核对象 → skipped（不扣分不报错）
 * 幂等：月度模式，一人一条安全文化建设扣分（未开展项合并为一条）。
 */

const { pool } = require('../../../config/db');
const engine = require('../../assessmentScoringEngine');

const KEY = 'safety_culture';
const RULE_CODE = 'SAFE_AUTO';
const SOURCE_TABLE = 'hse_safety_culture_monthly';
const KIND = 'safety_culture_monthly';
const EVENT_TYPE = 'SAFETY_CULTURE';
const METRIC_CODE = 'HSE-KPI-ACT-001';
const METRIC_NAME = '安全文化建设专项活动未开展';

// 三个专项活动项（仅作为 activities 为空时的回退展示标签）
const ACTIVITY_ITEMS = [
  { key: 'actThreeViolation', label: '"三违"专项活动', col: 'act_three_violation' },
  { key: 'actDutySafety', label: '轮值安全员', col: 'act_duty_safety' },
  { key: 'actTrafficRisk', label: '交通安全危险因素识别清单', col: 'act_traffic_risk' },
];

/**
 * 组装行的动态活动项数组 [{ name, done }]。
 * 每月「专项活动台帐」活动列表头不同，故优先读 activities JSON；为空（旧数据）时回退旧三列。
 */
function buildActivities(rec) {
  const acts = rec.activities;
  if (acts && typeof acts === 'object' && Object.keys(acts).length) {
    return Object.keys(acts).map((name) => ({ name, done: Number(acts[name]) > 0 }));
  }
  return ACTIVITY_ITEMS.map((a) => ({ name: a.label, done: Number(rec[a.col]) > 0 }));
}

/**
 * 幂等键：按考核对象 + 周期（月度模式 cycleId + employeeId）
 */
function buildDeductKey({ cycleId, employeeId }) {
  return `safety-culture:${cycleId}:${employeeId}`;
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
     VALUES ($1,$2,'SAFETY','all',0,'auto','hse_safety_culture_monthly',
             '专项活动未开展项×单次分值，扣考核对象本人（主管/管理员）',10,'active',
             '自动考核：安全文化建设专项活动月度扣分')
     ON CONFLICT (metric_code) DO UPDATE SET is_deleted=FALSE
     RETURNING id`,
    [METRIC_CODE, METRIC_NAME]
  );
  return { code: METRIC_CODE, id: r.rows[0].id };
}

/**
 * 扫描：逐条读取台账，按考核对象聚合未开展项，产出扣分意图
 */
async function scan({ cycle, year, month, rule, dryRun }) {
  const cycleId = cycle.id;
  const monthStr = `${year}-${String(month).padStart(2, '0')}`;

  // 台账守卫：当月无安全文化台账 → 跳过
  const cover = await pool.query(
    `SELECT COUNT(*)::int AS c FROM hse_safety_culture_monthly
      WHERE month = $1 AND is_deleted = FALSE`,
    [monthStr]
  );
  if (!cover.rows.length || cover.rows[0].c <= 0) {
    return { scanned: 0, assessed: 0, intents: [], revocations: [], skipped: [], noLedger: true, metric: null };
  }

  const metric = await ensureMetric(rule.metricCode);
  const unit = rule.deductScore > 0 ? rule.deductScore : 10;

  const rows = (
    await pool.query(
      `SELECT id, level, dept, name, employee_id, activities, has_manual_col,
              act_three_violation, act_duty_safety, act_traffic_risk, manual_deduct
         FROM hse_safety_culture_monthly
        WHERE month = $1 AND is_deleted = FALSE`,
      [monthStr]
    )
  ).rows;

  const intents = [];
  const revocations = [];
  const skipped = [];
  let seq = 0;
  let scanned = 0;

  for (const rec of rows) {
    scanned++;
    const manual = Math.max(0, Number(rec.manual_deduct) || 0);
    // 动态活动项：未开展的项
    const activities = buildActivities(rec);
    const missing = activities.filter((a) => !a.done);
    // 打分口径：该表有「扣分」列则按扣分列(manual)为准（即便为 0）；无扣分列回退未开展项×unit
    const rawScore = rec.has_manual_col
      ? manual
      : Math.round(missing.length * unit * 100) / 100;

    // 定位考核对象：优先 employee_id，兜底按姓名+所属作业中心+岗位命中当前周期考核对象
    let target = null;
    if (rec.employee_id) {
      target = await engine.findAssessmentTarget(cycleId, rec.employee_id);
    }
    if (!target) {
      const tb = rec.level === '管理员' ? '管理员' : '乡镇作业中心经理';
      const t = (
        await pool.query(
          `SELECT * FROM hse_assessment_target
            WHERE cycle_id = $1 AND is_deleted = FALSE AND employee_name = $2
              AND ($3 = '' OR department = $3)
              AND position = $4
            LIMIT 1`,
          [cycleId, rec.name, rec.dept || '', tb]
        )
      ).rows[0];
      if (t) target = t;
    }
    if (!target) {
      skipped.push({
        employeeId: rec.employee_id, name: rec.name,
        dept: rec.dept, reason: 'employee-not-assessment-target',
      });
      continue;
    }

    const base = {
      _seq: seq++,
      cycleId,
      targetId: target.id,
      employeeId: target.employeeId || target.id,
      employeeName: target.name || rec.name,
      ruleName: rule.ruleName,
      category: rule.category,
      missingLabels: missing.map((a) => a.name),
      dept: rec.dept,
      level: rec.level,
      unit,
      manual,
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

  return { scanned, assessed: intents.length + revocations.length, intents, revocations, skipped, noLedger: false, metric };
}

function buildItem(intent, rule) {
  return rule.ruleName;
}

function buildDetail(intent, capRes) {
  const lines = intent.missingLabels.length
    ? `${intent.missingLabels.join('、')}未开展`
    : (intent.manual > 0 ? '人工扣分' : '未开展');
  return {
    kind: KIND,
    deductKey: buildDeductKey({ cycleId: intent.cycleId, employeeId: intent.employeeId }),
    ruleName: intent.ruleName,
    category: intent.category,
    eventType: EVENT_TYPE,
    dept: intent.dept,
    level: intent.level,
    unit: intent.unit,
    manual: intent.manual,
    missingLabels: intent.missingLabels,
    rawScore: intent.rawScore,
    cap: capRes.cap,
    cappedScore: capRes.cappedScore,
    otherCatScore: capRes.otherCatScore,
    year: intent.year,
    month: intent.month,
    summary: `安全文化建设（${lines}）`,
  };
}

function buildReportDetail(intent, outcome) {
  const base = {
    employeeId: intent.employeeId,
    employeeName: intent.employeeName,
    dept: intent.dept,
    level: intent.level,
    missingLabels: intent.missingLabels,
    manual: intent.manual,
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
  ensureMetric,
  buildDeductKey,
  scan,
  buildItem,
  buildDetail,
  buildReportDetail,
};