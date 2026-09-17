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
 * 业务口径（P2-B1-E-08-08 重定义，2026-09-14；此前「公司检查全部扣5分」作废）：
 *   公司检查（check_source='company'）责任扣分按具体三违项目区分：
 *     - 普通三违：基础扣分 1 分/次（scope_config.company_score，权威=规则库）；
 *     - 仅「不戴安全头盔」这一项三违：责任上级扣 5 分/次
 *       （scope_config.company_item_scores 配置驱动：{ 项目: { score, match_keywords } }），
 *       5 分严禁扩散到其他三违项目；
 *     - 项目识别字段 = violation_behavior（组件，逗号/顿号分隔）+ description，
 *       与配置关键词精确包含匹配；不按姓名/area_team/WPS Creator 判断。
 *   非公司来源（township/self/NULL）：按规则库基准分 1 分/次（自身行为历史口径），
 *     乡镇经理/管理员自查不产生责任传导扣分（resolver 仅 company 生效）。
 *   周期归属按 violation_date 落在考核周期年月内；violation_date 为 NULL 的记录跳过
 *   （skipped reason='no-date'），不扣分。
 */

const { pool } = require('../../../config/db');
const engine = require('../../assessmentScoringEngine');
const { resolveTransmissionTargets } = require('../violationTargetResolver');

const KEY = 'violation_record';
const RULE_CODE = 'VIOLATION003';
const SOURCE_TABLE = 'violation_records';
const KIND = 'violation_event';
const EVENT_TYPE = 'VIOLATION';
const METRIC_CODE = 'HSE-KPI-SAF-001';
const METRIC_NAME = '三违行为管控';

// 计分开关（业务可改）
// P2-B1-E-08-08：company 分值的唯一权威为规则库 scope_config：
//   company_score=普通三违基础扣分（1）；company_item_scores=特殊项目分值
//   （如「不戴安全头盔」5，仅限配置列明的项目，5 分严禁扩散）。
//   本常量仅作为规则库未配置时的兜底，消除「规则重复定义/双源」以配置优先。
const COMPANY_SCORE = 1;   // 公司查处·普通三违：1 分/次（E-08-08 前为 5，已由规则库配置接管）
const DEFAULT_SCORE = 1;   // 乡镇查处 / 自查自纠：1 分/次
// 未标注（check_source 为 NULL）的计分：保持 1（与规则库基准分一致）。
// 若业务要求「未标注不计分」，改为 0 即可，source_detail.checkSourceText 仍显示「未标注」。
const NULL_SCORE = DEFAULT_SCORE;

// 事件级幂等：一条违规记录 = 一条扣分
const IDEMPOTENCY = 'event';

// ---------------------------------------------------------------------------
// P2-B1-E-06-IMPLEMENT 作用域隔离（存量口径零变化）：
//   GRIDVIOL001（sanwei_candidate 适配器）只扫 source_type='grid_candidate' 的新增
//   候选确认行；本适配器（VIOLATION003，存量 vr 补录事件 1 分口径）须排除这些行，
//   防止同一确认记录被两条规则重复扣分。
//   列存在性守卫：生产库尚未执行 vr 5 列 DDL 前（source_type 列不存在）自动退化为
//   原 SQL（历史行为零漂移）；列存在后恒定加 AND source_type IS NULL。
// ---------------------------------------------------------------------------
let _vrHasSourceType = undefined;
async function vrHasSourceTypeColumn() {
  if (_vrHasSourceType !== undefined) return _vrHasSourceType;
  try {
    const r = await pool.query(
      `SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'violation_records'
          AND column_name = 'source_type' LIMIT 1`
    );
    _vrHasSourceType = r.rows.length > 0;
  } catch (e) {
    // 查询失败按「列不存在」处理（退化为历史 SQL，不破坏存量扫描）
    console.warn('[violationAdapter] source_type 列探测失败，按不存在处理:', e.message);
    _vrHasSourceType = false;
  }
  return _vrHasSourceType;
}
async function sourceTypeIsolationClause() {
  return (await vrHasSourceTypeColumn()) ? 'AND source_type IS NULL' : '';
}

const CHECK_SOURCE_TEXT = {
  company: '公司查处',
  township: '乡镇查处',
  self: '自查自纠',
};

function checkSourceText(cs) {
  return CHECK_SOURCE_TEXT[cs] || '未标注';
}

// ---------------------------------------------------------------------------
// P2-B1-E-08-08 特殊项目分值识别（配置驱动，改库不改码）：
//   scope_config.company_item_scores = { "不戴安全头盔": { score: 5, match_keywords: [...] } }
//   匹配文本 = violation_behavior 组件（按逗号/顿号/分号/换行拆分）+ description；
//   关键词为「精确包含」匹配（组件或描述包含配置关键词即命中）；
//   多关键词/多项目命中时取最高分（一次事件一个分值，不做分值累加）。
//   未命中任何特殊项目 → company_score（普通三违基础分）。
// ---------------------------------------------------------------------------
function splitBehaviorComponents(text) {
  return String(text || '')
    .split(/[,，、;；\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function resolveCompanySpecialScore(rule, rec) {
  const cfg = rule && rule.scopeConfig && rule.scopeConfig.company_item_scores;
  if (!cfg || typeof cfg !== 'object') return { score: null, matchedItem: null };
  const texts = [...splitBehaviorComponents(rec.violation_behavior)];
  const desc = String(rec.description || '').trim();
  if (desc) texts.push(desc);
  if (!texts.length) return { score: null, matchedItem: null };
  let best = { score: null, matchedItem: null };
  for (const [item, spec] of Object.entries(cfg)) {
    const s = spec && typeof spec === 'object' ? Number(spec.score) : Number(spec);
    const kws = spec && typeof spec === 'object' && Array.isArray(spec.match_keywords)
      ? spec.match_keywords
      : [item];
    if (!Number.isFinite(s) || s <= 0) continue;
    for (const kw of kws) {
      const k = String(kw || '').trim();
      if (!k) continue;
      if (texts.some((t) => t.includes(k))) {
        if (best.score == null || s > best.score) best = { score: s, matchedItem: item };
        break;
      }
    }
  }
  return best;
}

/**
 * 幂等键：一条违规记录 × 一个扣分对象 = 一条扣分
 * （P2-B1-E-08-04：岗位传递下一记录可产生多对象扣分，键中含 employeeId 便于追溯；
 *   事件模式定位仍以 target_id + source_id + kind 为准，键仅作展示/追溯）
 */
function buildDeductKey({ cycleId, sourceId, employeeId }) {
  return `violation:${cycleId}:${sourceId}:${employeeId != null ? employeeId : '-'}`;
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
  // P2-B1-E-06-IMPLEMENT：排除候选确认行（source_type='grid_candidate' 归 GRIDVIOL001 域）
  const isolation = await sourceTypeIsolationClause();
  const candR = await pool.query(
    `SELECT id, violator_id, violator_name, check_source, violation_date,
            violation_behavior, description
       FROM violation_records
      WHERE is_deleted = FALSE AND violator_id IS NOT NULL
        ${isolation}
        AND violation_date >= make_date($1,$2,1)
        AND violation_date <  make_date($1,$2,1) + INTERVAL '1 month'`,
    [year, month]
  );

  // ---------------------------------------------------------------------------
  // P2-B1-E-08-04 扣分对象传递（配置驱动，规则变化改库不改码）：
  //   规则行 transmission_config 存在且含 by_violator_position 时启用：
  //     - 传递来源行（默认 company）→ 按被检查人岗位解析扣分对象（保洁员/管理员 →
  //       管理员+乡镇作业中心经理；乡镇作业中心经理 → 仅本人），fail-closed。
  //     - 其余来源行 → 历史行为（扣违规者本人）。
  //   未配置 → 完全历史行为，零漂移。
  // ---------------------------------------------------------------------------
  const tCfg = rule && rule.transmissionConfig ? rule.transmissionConfig : null;
  const transmissionActive = !!(
    tCfg && tCfg.by_violator_position && Object.keys(tCfg.by_violator_position).length
  );

  // 本月窗口内有效记录 id → 该记录「当前」的 violator_id（撤销判定用：
  // 既判断记录是否仍有效，也判断是否被改挂他人）
  const validIdToEmployee = new Map();
  const skipped = [];

  for (const rec of candR.rows) {
    validIdToEmployee.set(String(rec.id), String(rec.violator_id));
  }

  // violator_id 非空但 violation_date 为 NULL：无法归属周期，跳过计数（reason='no-date'）
  // （同样排除候选确认行——其周期归属归 GRIDVIOL001 域）
  const noDateR = await pool.query(
    `SELECT violator_id, violator_name
       FROM violation_records
      WHERE is_deleted = FALSE AND violator_id IS NOT NULL AND violation_date IS NULL
        ${isolation}`,
    []
  );
  for (const rec of noDateR.rows) {
    skipped.push({ employeeId: rec.violator_id, name: rec.violator_name, reason: 'no-date' });
  }

  const intents = [];
  const revocations = [];
  let seq = 0;

  // 分值：company 分值以 scope_config.company_score 为唯一权威（消除与常量的双源）；
  //   未配置时回退历史常量（行为零漂移）。非 company 仍按规则库基准分 / NULL 口径。
  const cfgCompanyScore =
    rule && rule.scopeConfig && rule.scopeConfig.company_score != null
      ? Number(rule.scopeConfig.company_score)
      : null;
  const companyScore = cfgCompanyScore != null ? cfgCompanyScore : COMPANY_SCORE;
  const baseScore = rule && rule.deductScore > 0 ? rule.deductScore : NULL_SCORE;

  const transmissionCache = new Map(); // `${violatorId}|${cs}` -> resolver 结果
  const targetCache = new Map();       // String(employeeId) -> target|null
  const specialScoreCache = new Map(); // String(rec.id) -> { score, matchedItem }

  // P2-B1-E-08-11 头盔分层分值表（规则行 transmission_config.helmet_layer_scores）：
  //   { self_violator: 5, direct_supervisor: 5, escalated: 1 }
  // 键与 violationTargetResolver 输出的 resolutionLayer 对齐；未配置 → 分层不生效（现状行为）。
  const helmetLayerScores = tCfg && tCfg.helmet_layer_scores && typeof tCfg.helmet_layer_scores === 'object'
    ? tCfg.helmet_layer_scores
    : null;

  // P2-B1-E-08-08 分值判定：company 来源按具体项目（普通=company_score，命中特殊项目=配置分值）；
  // 非 company 一律基准分。每记录只判定一次，两条路径共用。
  function scoreFor(rec, cs) {
    if (cs !== 'company') return { rawScore: baseScore, specialItem: null };
    let sp = specialScoreCache.get(String(rec.id));
    if (sp === undefined) {
      sp = resolveCompanySpecialScore(rule, rec);
      specialScoreCache.set(String(rec.id), sp);
    }
    if (sp.matchedItem) return { rawScore: sp.score, specialItem: sp.matchedItem };
    return { rawScore: companyScore, specialItem: null };
  }

  for (const rec of candR.rows) {
    const sid = String(rec.id);
    const cs = rec.check_source || null;

    if (transmissionActive) {
      const cacheKey = `${rec.violator_id}|${cs || ''}`;
      let tRes = transmissionCache.get(cacheKey);
      if (tRes === undefined) {
        tRes = await resolveTransmissionTargets({
          cycleId,
          violatorId: rec.violator_id,
          checkSource: cs,
          transmissionConfig: tCfg,
        });
        transmissionCache.set(cacheKey, tRes);
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
          const { rawScore, specialItem } = scoreFor(rec, cs);
          // P2-B1-E-08-11 头盔分层：特殊项目分值按目标层级修正
          // （transmission_config.helmet_layer_scores：direct_supervisor/self_violator=5、escalated=1）。
          // 普通项目/未配置层级分表/目标无层级 → 保持原 rawScore（现状行为零漂移）。
          let perTargetScore = rawScore;
          const layer = t.resolutionLayer || null;
          if (specialItem && helmetLayerScores && layer
            && helmetLayerScores[layer] != null) {
            perTargetScore = Number(helmetLayerScores[layer]);
          }
          intents.push({
            _seq: seq++,
            sourceId: sid,
            cycleId,
            targetId: t.targetId,
            employeeId: t.employeeId,
            employeeName: t.name,
            ruleName: rule ? rule.ruleName : '自身三违行为',
            category: rule ? rule.category : '三违管理',
            eventType: EVENT_TYPE,
            checkSource: cs,
            checkSourceText: checkSourceText(cs),
            violationDate: rec.violation_date ? rec.violation_date.toISOString().slice(0, 10) : null,
            rawScore: perTargetScore,
            specialItem,
            resolutionLayer: layer || null,
            violationBehavior: rec.violation_behavior || null,
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
      // mode === 'self' → 落入下方历史路径（扣违规者本人）
    }

    // 本人路径（历史行为）：违规者须为本期考核对象
    const empKey = String(rec.violator_id);
    let target = targetCache.get(empKey);
    if (target === undefined) {
      target = await engine.findAssessmentTarget(cycleId, rec.violator_id);
      targetCache.set(empKey, target || null);
    }
    if (!target) {
      skipped.push({ employeeId: rec.violator_id, name: rec.violator_name, reason: 'not-assessment-target' });
      continue;
    }
    const { rawScore, specialItem } = scoreFor(rec, cs);
    intents.push({
      _seq: seq++,
      sourceId: sid,
      cycleId,
      targetId: target.id,
      employeeId: rec.violator_id,
      employeeName: rec.violator_name,
      ruleName: rule ? rule.ruleName : '自身三违行为',
      category: rule ? rule.category : '三违管理',
      eventType: EVENT_TYPE,
      checkSource: cs,
      checkSourceText: checkSourceText(cs),
      violationDate: rec.violation_date ? rec.violation_date.toISOString().slice(0, 10) : null,
      rawScore,
      specialItem,
      violationBehavior: rec.violation_behavior || null,
      year,
      month,
    });
  }

  // 撤销集：本周期本 kind 既有自动扣分中，与「当前期望扣分对象集合」不符的行撤销。
  if (transmissionActive) {
    // 传递模式：期望集 = intents 中 (sourceId → {employeeId})；
    //   ① source_id 不在期望集（记录被软删/落键丢失/岗位解析失败）→ 撤销
    //   ② 期望集存在但该行归属人 ∉ 期望集（改挂他人/传递对象变化）→ 撤销
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
    //   ① source_id 不在本月有效记录集合内（记录被软删 / 落键丢失）
    //   ② source_id 仍在，但记录当前 violator_id ≠ 该扣分行的归属人
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

  // 口径：scanned = 本月窗口内 violator_id 非空的去重违规人数；
  // assessed = 涉及去重人数（intents ∪ revocations）
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

/**
 * deduction_item 文案（P2-B1-E-08-08：命中特殊项目时在文案中显式标注，可追溯）
 */
function buildItem(intent) {
  const itemPart = intent.specialItem ? `${intent.specialItem}·` : '';
  if (intent.isTransmission) {
    return `三违1次（${itemPart}${intent.checkSourceText}·传递至${intent.deductPosition || '责任岗位'}）`;
  }
  return intent.checkSource === 'company' ? `三违1次（${itemPart}公司查处）` : '三违1次';
}

/**
 * source_detail 结构
 */
function buildDetail(intent, capRes) {
  return {
    kind: KIND,
    deductKey: buildDeductKey({ cycleId: intent.cycleId, sourceId: intent.sourceId, employeeId: intent.employeeId }),
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
    // P2-B1-E-08-08：特殊项目分值可追溯（命中项目名 + 原始行为文本；普通三违为 null）
    specialItem: intent.specialItem || undefined,
    violationBehavior: intent.violationBehavior || undefined,
    // P2-B1-E-08-11：分层扣分可追溯（self_violator/direct_supervisor/escalated；普通三违为 null）
    resolutionLayer: intent.resolutionLayer || undefined,
    scoreBasis: intent.specialItem
      ? (intent.resolutionLayer
        ? `company-item:${intent.specialItem}:layer:${intent.resolutionLayer}`
        : `company-item:${intent.specialItem}`)
      : (intent.checkSource === 'company' ? 'company-base' : 'base'),
    // P2-B1-E-08-04：岗位传递元数据（可追溯：被检查人 → 扣分对象）
    isTransmission: intent.isTransmission === true,
    violatorId: intent.violatorId != null ? String(intent.violatorId) : undefined,
    violatorName: intent.violatorName || undefined,
    violatorPosition: intent.violatorPosition || undefined,
    deductPosition: intent.deductPosition || undefined,
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
    specialItem: intent.specialItem || undefined,
    resolutionLayer: intent.resolutionLayer || undefined,
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
  // 计量单位：三违为「事件级」，一条违规记录 = 1 次扣分，deducted 文案称「人次」
  deductedUnit: 'events',
  ensureMetric,
  buildDeductKey,
  scan,
  buildItem,
  buildDetail,
  buildReportDetail,
};
