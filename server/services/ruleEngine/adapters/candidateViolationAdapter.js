/**
 * 规则引擎 · 适配器：三违候选确认记录（GRIDVIOL001）事件级扣分
 *
 * P2-B1-E-06-IMPLEMENT 新增。业务口径（业务方已确认，2026-09）：
 *   - 仅对「三违候选人工确认」产生的正式 violation_records 行计分
 *     （source_type = 'grid_candidate'，由确认 API 写入）；
 *   - check_source = 'company'（公司查处）→ rule.deductScore（5 分/次）；
 *   - check_source = township / self → 本规则不产生扣分意图（= 0 分，非 0 分行）；
 *   - 历史存量 vr 行（source_type IS NULL）归 VIOLATION003 存量域，本适配器不碰；
 *     Excel 历史 423 条扣分为独立来源（sanwei_excel / 人+月对齐），与本适配器正交。
 *
 * 分值来源：规则库 hse_assessment_rule.deduct_score（GRIDVIOL001=5.00），
 *   不再依赖 violationAdapter 的 COMPANY_SCORE 常量（该常量保留仅服务 VIOLATION003 存量行为）。
 *
 * 幂等：事件级（一条确认记录 = 一条扣分），沿用 source_table + source_id 模式。
 * 撤销联动：确认记录被软删 / violator_id 改挂他人 → 对应扣分撤销（与 violationAdapter 同机制）。
 *
 * 生产激活边界：本适配器已注册（resolveTasks 可显式指定 adapterKeys 调用），
 *   但【未加入】engine.AUTO_DEDUCTION_ADAPTERS 统一门面——生产库 vr 5 列 DDL 未执行前
 *   即使被误调入也会因列不存在而安全空转（见 _hasGridCandidateColumns 守卫）。
 *   进入门面 = 生产激活门禁阶段（备份 + 审计）单独执行。
 */

const { pool } = require('../../../config/db');
const engine = require('../../assessmentScoringEngine');
const { resolveTransmissionTargets } = require('../violationTargetResolver');

const KEY = 'sanwei_candidate';
const RULE_CODE = 'GRIDVIOL001';
const SOURCE_TABLE = 'violation_records';
const KIND = 'grid_violation_candidate';
const EVENT_TYPE = 'VIOLATION';
const METRIC_CODE = 'HSE-KPI-SAF-001';
const METRIC_NAME = '三违行为管控';

const SOURCE_TYPE = 'grid_candidate';

// 计分开关：非 company 来源一律不扣分（业务确认口径，非可调常量）
const NON_COMPANY_SCORE = 0;

// 事件级幂等：一条确认记录 = 一条扣分
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
 * 幂等键：一条确认记录 × 一个扣分对象 = 一条扣分
 * （P2-B1-E-08-04：岗位传递下一记录可产生多对象扣分，键含 employeeId 便于追溯）
 */
function buildDeductKey({ cycleId, sourceId, employeeId }) {
  return `grid_candidate:${cycleId}:${sourceId}:${employeeId != null ? employeeId : '-'}`;
}

// ---------------------------------------------------------------------------
// 列存在性守卫：生产库 vr 5 列 DDL 未执行前安全空转（0 扫描 0 意图），绝不抛错
// 破坏统一评分链路。结果缓存（进程内一次探测）。
// ---------------------------------------------------------------------------
let _colsReady = undefined;
async function gridCandidateColumnsReady() {
  if (_colsReady !== undefined) return _colsReady;
  try {
    const r = await pool.query(
      `SELECT count(*)::int AS c FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'violation_records'
          AND column_name IN ('source_type','candidate_id')`
    );
    _colsReady = r.rows[0].c === 2;
  } catch (e) {
    console.warn('[sanweiCandidate] vr 列探测失败，按未就绪处理:', e.message);
    _colsReady = false;
  }
  return _colsReady;
}

/**
 * 确保指标存在（幂等）：复用 VIOLATION003 的 HSE-KPI-SAF-001（同一指标语义）
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
             '三违候选确认记录（公司查处）逐条扣分，受三违管理类别上限钳制',13,'active',
             '自动考核：三违候选确认（公司查处5分/次），计入三违管理类别')
     ON CONFLICT (metric_code) DO UPDATE SET is_deleted=FALSE
     RETURNING id`,
    [METRIC_CODE, METRIC_NAME]
  );
  return { code: METRIC_CODE, id: r.rows[0].id };
}

/**
 * 扫描：产出扣分意图 / 撤销意图 / 跳过名单
 *
 * 周期窗口按 violation_date（确认 API 写入 = gir.inspection_date）。
 * 只扫 source_type='grid_candidate' 且 check_source='company' 的行；
 *   非 company 的确认行直接不入集合（不产生意图、也不进入 no-date 统计）。
 */
async function scan({ cycle, year, month, rule, dryRun }) {
  const cycleId = cycle.id;

  const metric = await ensureMetric(rule && rule.metricCode);

  // 列未就绪（生产 DDL 前）→ 安全空转
  if (!(await gridCandidateColumnsReady())) {
    return { scanned: 0, assessed: 0, intents: [], revocations: [], skipped: [], noLedger: false, metric };
  }

  // 本周期窗口内、company 查处的候选确认行
  const candR = await pool.query(
    `SELECT id, violator_id, violator_name, check_source, violation_date
       FROM violation_records
      WHERE is_deleted = FALSE AND violator_id IS NOT NULL
        AND source_type = $3 AND check_source = 'company'
        AND violation_date >= make_date($1,$2,1)
        AND violation_date <  make_date($1,$2,1) + INTERVAL '1 month'`,
    [year, month, SOURCE_TYPE]
  );

  // ---------------------------------------------------------------------------
  // P2-B1-E-08-04 扣分对象传递（配置驱动）：本适配器仅处理 company 行，
  //   规则行 transmission_config 存在且含 by_violator_position 时按被检查人岗位
  //   解析扣分对象（保洁员/管理员 → 管理员+乡镇作业中心经理；乡镇作业中心经理 → 仅本人），
  //   fail-closed；未配置 → 历史行为（扣违规者本人），零漂移。
  // ---------------------------------------------------------------------------
  const tCfg = rule && rule.transmissionConfig ? rule.transmissionConfig : null;
  const transmissionActive = !!(
    tCfg && tCfg.by_violator_position && Object.keys(tCfg.by_violator_position).length
  );

  const validIdToEmployee = new Map();
  const skipped = [];

  for (const rec of candR.rows) {
    validIdToEmployee.set(String(rec.id), String(rec.violator_id));
  }

  // company 确认行但无 violation_date：无法归属周期，跳过计数
  const noDateR = await pool.query(
    `SELECT violator_id, violator_name
       FROM violation_records
      WHERE is_deleted = FALSE AND violator_id IS NOT NULL AND violation_date IS NULL
        AND source_type = $1 AND check_source = 'company'`,
    [SOURCE_TYPE]
  );
  for (const rec of noDateR.rows) {
    skipped.push({ employeeId: rec.violator_id, name: rec.violator_name, reason: 'no-date' });
  }

  const intents = [];
  const revocations = [];
  let seq = 0;

  // 分值：规则库驱动（rule.deductScore=5.00）；规则缺失/为 0 时按 NON_COMPANY_SCORE=0
  //   兜底（绝不本地写 5 分常量——「公司查处 5 分」的唯一权威在规则库）。
  const companyScore = rule && rule.deductScore > 0 ? rule.deductScore : NON_COMPANY_SCORE;

  const transmissionCache = new Map(); // violatorId -> resolver 结果

  for (const rec of candR.rows) {
    const sid = String(rec.id);
    const cs = rec.check_source || null;

    if (transmissionActive) {
      let tRes = transmissionCache.get(String(rec.violator_id));
      if (tRes === undefined) {
        tRes = await resolveTransmissionTargets({
          cycleId,
          violatorId: rec.violator_id,
          checkSource: cs,
          transmissionConfig: tCfg,
        });
        transmissionCache.set(String(rec.violator_id), tRes);
      }

      if (tRes.mode === 'none') {
        skipped.push({ employeeId: rec.violator_id, name: rec.violator_name, reason: tRes.reason, status: tRes.status });
        continue;
      }
      if (tRes.mode === 'transmitted') {
        // R2：部分解析（PARTIAL）时，未唯一确定的岗位进入 skipped 可观测
        for (const s of tRes.skipped || []) {
          skipped.push({ employeeId: rec.violator_id, name: rec.violator_name,
            reason: s.reason, position: s.position, status: s.status });
        }
        for (const t of tRes.targets) {
          intents.push({
            _seq: seq++,
            sourceId: sid,
            cycleId,
            targetId: t.targetId,
            employeeId: t.employeeId,
            employeeName: t.name,
            ruleName: rule ? rule.ruleName : '三违-公司查处',
            category: rule ? rule.category : '三违管理',
            eventType: EVENT_TYPE,
            checkSource: cs,
            checkSourceText: checkSourceText(cs),
            violationDate: rec.violation_date ? rec.violation_date.toISOString().slice(0, 10) : null,
            rawScore: companyScore,
            isTransmission: true,
            violatorId: rec.violator_id,
            violatorName: rec.violator_name,
            violatorPosition: tRes.violatorPosition,
            deductPosition: t.position,
            year,
            month,
          });
        }
        continue;
      }
      // mode === 'self' → 落入下方历史路径
    }

    // 本人路径（历史行为）：违规者须为本期考核对象
    const target = await engine.findAssessmentTarget(cycleId, rec.violator_id);
    if (!target) {
      skipped.push({ employeeId: rec.violator_id, name: rec.violator_name, reason: 'not-assessment-target' });
      continue;
    }
    intents.push({
      _seq: seq++,
      sourceId: sid,
      cycleId,
      targetId: target.id,
      employeeId: rec.violator_id,
      employeeName: rec.violator_name,
      ruleName: rule ? rule.ruleName : '三违-公司查处',
      category: rule ? rule.category : '三违管理',
      eventType: EVENT_TYPE,
      checkSource: cs,
      checkSourceText: checkSourceText(cs),
      violationDate: rec.violation_date ? rec.violation_date.toISOString().slice(0, 10) : null,
      rawScore: companyScore,
      year,
      month,
    });
  }

  // 撤销集：本周期本 kind 既有自动扣分中，与「当前期望扣分对象集合」不符的行撤销。
  if (transmissionActive) {
    const desiredMap = new Map();
    for (const it of intents) {
      if (!desiredMap.has(it.sourceId)) desiredMap.set(it.sourceId, new Set());
      desiredMap.get(it.sourceId).add(String(it.employeeId));
    }
    const existR = await pool.query(
      `SELECT d.target_id, d.source_id, d.source_detail, t.employee_id AS tgt_employee_id
         FROM hse_assessment_deduction d
         LEFT JOIN hse_assessment_target t ON t.id = d.target_id
        WHERE d.cycle_id = $1 AND d.deduction_source = 'auto'
          AND d.source_table = $2 AND d.source_detail ->> 'kind' = $3
          AND d.is_deleted = FALSE`,
      [cycleId, SOURCE_TABLE, KIND]
    );
    for (const row of existR.rows) {
      const sid = row.source_id != null ? String(row.source_id) : null;
      if (!sid) continue;
      const detail = row.source_detail || {};
      const rowEmployeeId =
        detail.employeeId != null
          ? String(detail.employeeId)
          : row.tgt_employee_id != null
          ? String(row.tgt_employee_id)
          : null;
      const desired = desiredMap.get(sid);
      if (!desired || (rowEmployeeId != null && !desired.has(rowEmployeeId))) {
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
  } else {
    // 历史撤销口径（未启用传递时完全保持原行为）：
    //   ① source_id 不在本月有效 company 确认行集合内（软删 / 落键丢失 / check_source 被改）
    //   ② 仍在但 violator_id 改挂他人 → 旧扣分撤销
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
  }

  const distinctViolators = new Set(validIdToEmployee.values());
  const scanned = distinctViolators.size;
  const assessedSet = new Set();
  for (const it of intents) assessedSet.add(String(it.employeeId));
  for (const rv of revocations) if (rv.employeeId != null) assessedSet.add(String(rv.employeeId));
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

function buildItem(intent) {
  return intent.isTransmission
    ? '三违1次（公司查处·候选确认·传递）'
    : '三违1次（公司查处·候选确认）';
}

function buildDetail(intent, capRes) {
  return {
    kind: KIND,
    deductKey: buildDeductKey({ cycleId: intent.cycleId, sourceId: intent.sourceId, employeeId: intent.employeeId }),
    ruleName: intent.ruleName,
    category: intent.category,
    eventType: EVENT_TYPE,
    sourceId: intent.sourceId,
    employeeId: intent.employeeId,
    targetId: intent.targetId,
    violationDate: intent.violationDate,
    checkSource: intent.checkSource,
    checkSourceText: intent.checkSourceText,
    rawScore: intent.rawScore,
    // P2-B1-E-08-04：岗位传递元数据（可追溯：被检查人 → 扣分对象）
    isTransmission: intent.isTransmission === true,
    violatorId: intent.violatorId != null ? String(intent.violatorId) : undefined,
    violatorName: intent.violatorName || undefined,
    violatorPosition: intent.violatorPosition || undefined,
    deductPosition: intent.deductPosition || undefined,
    cap: capRes.cap,
    cappedScore: capRes.cappedScore,
    otherCatScore: capRes.otherCatScore,
    summary: `三违1次（${intent.checkSourceText}·候选确认，${intent.violationDate || ''}）`,
  };
}

function buildReportDetail(intent, outcome) {
  const base = {
    employeeId: intent.employeeId,
    employeeName: intent.employeeName,
    checkSource: intent.checkSource,
    checkSourceText: intent.checkSourceText,
    rawScore: intent.rawScore,
    isTransmission: intent.isTransmission === true,
    violatorName: intent.violatorName || undefined,
    violatorPosition: intent.violatorPosition || undefined,
    deductPosition: intent.deductPosition || undefined,
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
  deductedUnit: 'events',
  ensureMetric,
  buildDeductKey,
  scan,
  buildItem,
  buildDetail,
  buildReportDetail,
};
