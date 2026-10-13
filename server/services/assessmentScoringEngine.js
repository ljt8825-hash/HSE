/**
 * 月度安全履职自动考核 —— 评分引擎
 *
 * 职责（供事件服务 / 定时任务 / 手动重算复用）：
 *   1. 依据扣分明细（hse_assessment_deduction）对单个考核对象重算分数
 *   2. 增删自动扣分明细（deduction_source='auto'）
 *   3. 等级划分、审计日志
 *
 * 分数口径（以扣分明细为准）：
 *   score_auto   = max(0, 100 - Σ(有效 auto + chain_transmission 扣分明细建议分))
 *   score_total  = COALESCE(score_manual,0) + score_auto + COALESCE(score_bonus,0)
 *   与现有 /chain/generate（写传导明细）一致；与 /scoring/execute 的权重模板
 *   为两套并存口径，以最近一次执行为准，每日校验任务负责最终对齐。
 */

const { pool, isConnected } = require('../config/db');
// 归类 + 类别上限 + 三违活源聚合（与列表/三违考核同源口径）
const { resolveRuleForDeductionRows } = require('./assessmentRuleCategoryService');
const { getCategoryCap, roleFromPosition } = require('./ruleEngine/categoryCap');
const { getEmployeeSanweiTotal } = require('./violationAssessmentService');

// ============================================================
// 常量
// ============================================================

const TRANSMISSION_RATIO = 1.0;     // 直属上级传导比例100%
const CHAIN_LEVEL = 1;              // 仅一级传导

const MAX_SCORE = 100;              // 百分制基准

// 扣分来源
const DEDUCTION_SOURCE = {
  AUTO: 'auto',
  IMPORT: 'import',
  MANUAL: 'manual',
  CHAIN_TRANSMISSION: 'chain_transmission',
};

// 等级划分
function calculateGrade(score) {
  if (score == null) return 'E';
  const s = Number(score);
  if (s >= 90) return 'A';
  if (s >= 80) return 'B';
  if (s >= 70) return 'C';
  if (s >= 60) return 'D';
  return 'E';
}

// ============================================================
// 指标读取
// ============================================================

async function getActiveMetrics() {
  if (!isConnected()) return [];
  const r = await pool.query(
    `SELECT * FROM hse_assessment_metric
     WHERE status='active' AND is_deleted = FALSE
     ORDER BY sort_order ASC`
  );
  return r.rows;
}

async function findMetricByCode(metricCode) {
  if (!isConnected()) return null;
  const r = await pool.query(
    `SELECT * FROM hse_assessment_metric WHERE metric_code = $1 AND is_deleted = FALSE`,
    [metricCode]
  );
  return r.rows[0] || null;
}

// ============================================================
// 规则层（扣分权重/豁免规则命中）
// ============================================================

/**
 * 解析某扣分对象在指定指标、指定业务日期命中的最高优先级扣分规则。
 * 命中优先级（只取最高一条生效，不叠加）：
 *   1) object_type='employee'  精确绑定（object_value=员工ID）
 *   2) object_type='grid_level' 网格等级
 *   3) object_type='township' / 'department' 组织维度
 *   4) object_type='all' 全体（同层内按 priority 大者优先）
 * @param {object} params - { metricCode, employeeId, position, orgType, gridLevel, township, department, date }
 * @returns {object|null} 命中的规则；未命中返回 null
 */
async function resolveMetricRule({ metricCode, employeeId, position = '', orgType = '', gridLevel = '', township = '', department = '', date }) {
  if (!isConnected()) return null;
  const effDate = date ? new Date(date) : new Date();

  // 维度键：active 且生效期内命中该指标的全部规则，一次拉取后按优先级判定
  const bindings = [];
  // 1) employee 精确绑定（最高优先）
  if (employeeId != null) bindings.push({ objectType: 'employee', value: String(employeeId) });
  // 2) grid_level 网格等级（经 position 中含"网格长"推断）
  if (gridLevel) bindings.push({ objectType: 'grid_level', value: String(gridLevel) });
  // 3) township / department 组织维度
  if (township) bindings.push({ objectType: 'township', value: String(township) });
  if (department) bindings.push({ objectType: 'department', value: String(department) });
  // 4) all 全体兜底
  bindings.push({ objectType: 'all', value: null });

  const r = await pool.query(
    `SELECT * FROM hse_assessment_metric_rule
     WHERE metric_code = $1 AND active = TRUE AND is_deleted = FALSE
       AND COALESCE(valid_from, CURRENT_DATE) <= $2
       AND COALESCE(valid_to, CURRENT_DATE) >= $2
     ORDER BY priority DESC, id DESC`,
    [metricCode, effDate]
  );
  if (!r.rows.length) return null;

  // 按对象维度从具体到宽泛匹配，同维度内取 priority 最大已由 SQL 排序保证
  for (const b of bindings) {
    const hit = b.value == null
      ? r.rows.find(x => x.object_type === b.objectType)
      : r.rows.find(x => x.object_type === b.objectType && x.object_value === b.value);
    if (hit) return hit;
  }
  return null;
}

/**
 * 依据规则层对建议扣分做换算：effectiveScore = round(suggested × scale_factor)
 * @returns {{ score: number, rule: object|null }}
 */
async function applyMetricRule({ metricCode, suggestedScore, employeeId, position, orgType, gridLevel, township, department, date }) {
  const rule = await resolveMetricRule({ metricCode, employeeId, position, orgType, gridLevel, township, department, date });
  if (!rule || rule.scale_factor == null || Number(rule.scale_factor) === 1) {
    return { score: suggestedScore, rule: null };
  }
  const factor = Number(rule.scale_factor);
  const scaled = Math.round((suggestedScore * factor) * 100) / 100;
  return { score: scaled, rule };
}

// ============================================================
// 审计日志
// ============================================================

// 与 hse-assessment-monthly.js recordAudit 同口径；非 employee 操作者置 NULL 防外键冲突
async function logAudit({ operatorId = null, operationType, targetType, targetId, targetDesc, detail }) {
  try {
    let safeOperator = operatorId;
    if (safeOperator != null) {
      const chk = await pool.query('SELECT id FROM employee WHERE id = $1', [safeOperator]).catch(() => ({ rows: [] }));
      if (!chk.rows.length) safeOperator = null;
    }
    await pool.query(
      `INSERT INTO hse_assessment_audit_log
        (module, operation_type, target_type, target_id, target_desc, operator_id, operator_name, operation_detail)
       VALUES ('assessment', $1, $2, $3, $4, $5, 'system', $6)`,
      [operationType, targetType, targetId, targetDesc, safeOperator, detail || null]
    );
  } catch (e) {
    // 审计失败不阻断主流程
  }
}

// ============================================================
// 扣分明细增删（deduction_source='auto'）
// ============================================================

/**
 * 判断某条扣分明细是否已存在（按 来源表+来源ID+指标 幂等判断）
 */
async function findAutoDeduction({ targetId, cycleId, metricCode, sourceTable, sourceId }) {
  const r = await pool.query(
    `SELECT * FROM hse_assessment_deduction
     WHERE target_id = $1 AND cycle_id = $2 AND metric_code = $3
       AND source_table = $4 AND source_id = $5 AND is_deleted = FALSE`,
    [targetId, cycleId, metricCode, sourceTable, sourceId]
  );
  return r.rows[0] || null;
}

/**
 * 读取考核对象在指定周期的对象维度（用于规则层命中）
 */
async function getTargetDimensions(targetId, cycleId) {
  const r = await pool.query(
    `SELECT t.employee_id, t.position, t.township, t.department,
            v.org_type
     FROM hse_assessment_target t
     LEFT JOIN v_employee_org_full v
       ON v.employee_id = t.employee_id AND v.relation_status = 'active'
     WHERE t.id = $1 AND t.cycle_id = $2 AND t.is_deleted = FALSE
     LIMIT 1`,
    [targetId, cycleId]
  );
  return r.rows[0] || null;
}

/**
 * 新增一条自动扣分明细（幂等，规则层拦截换算建议分）
 * @returns {object|null} 新增的明细，若已存在返回 null
 */
async function addAutoDeduction({
  targetId, cycleId, metricCode, deductionItem, deductionType = 'auto_deduction',
  sourceTable, sourceId, sourceDetail = {}, suggestedScore,
}) {
  const existing = await findAutoDeduction({ targetId, cycleId, metricCode, sourceTable, sourceId });
  if (existing) return null;

  const metric = await findMetricByCode(metricCode);

  // 规则层：按对象维度/时期/开关命中规则，换算建议分并记录命中信息
  let effective = { score: suggestedScore, rule: null };
  try {
    const dim = await getTargetDimensions(targetId, cycleId);
    if (dim) {
      const gridLevel = String(dim.position || '').includes('网格长') ? (String(dim.position).match(/网格长/)?.[0] || 'grid') : '';
      effective = await applyMetricRule({
        metricCode,
        suggestedScore,
        employeeId: dim.employee_id,
        position: dim.position || '',
        orgType: dim.org_type || '',
        gridLevel,
        township: dim.township || '',
        department: dim.department || '',
        date: sourceDetail.eventDate || sourceDetail.violationDate || sourceDetail.accidentDate || sourceDetail.trainingDate || sourceDetail.date,
      });
    }
  } catch (e) {
    // 规则层失败不阻断自动扣分，退回原始建议分
    effective = { score: suggestedScore, rule: null };
  }

  // 命中规则时，把建议分/换算结果写入 source_detail 供追溯
  const detail = { ...(sourceDetail || {}) };
  if (effective.rule) {
    detail.ruleHit = {
      ruleId: effective.rule.id,
      ruleName: effective.rule.rule_name,
      scaleFactor: Number(effective.rule.scale_factor),
      originalSuggested: suggestedScore,
    };
  }

  // score_id 非空约束：引用该 target/cycle 的聚合评分记录，缺则先创建
  const scoreId = await ensureTargetScoreRecord(targetId, cycleId);
  const r = await pool.query(
    `INSERT INTO hse_assessment_deduction
      (score_id, target_id, cycle_id, metric_id, metric_code, deduction_item,
       deduction_type, deduction_source, source_table, source_id, source_detail,
       suggested_score, current_version, review_status, is_transmission, is_deleted)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'auto', $8, $9, $10, $11, 1, 'pending', $12, FALSE)
     RETURNING *`,
    [
      scoreId, targetId, cycleId, metric ? metric.id : null, metricCode, deductionItem,
      deductionType, sourceTable, sourceId, detail,
      effective.score, sourceDetail.isTransmission ? true : false,
    ]
  );
  return r.rows[0];
}

/**
 * 确保存在该考核对象在周期内的聚合评分记录，返回其 id（供扣分明细的 score_id 引用）
 */
async function ensureTargetScoreRecord(targetId, cycleId) {
  const r = await pool.query(
    `SELECT id FROM hse_assessment_score
     WHERE target_id = $1 AND cycle_id = $2
       AND metric_code = 'AUTO_TOTAL_SNAPSHOT' AND is_deleted = FALSE
     LIMIT 1`,
    [targetId, cycleId]
  );
  if (r.rows.length) return r.rows[0].id;
  const ins = await pool.query(
    `INSERT INTO hse_assessment_score
      (target_id, cycle_id, metric_id, metric_code, raw_value, raw_value_desc,
       deduction_total, original_score, final_score, is_auto, is_manual,
       review_status, calc_time, remark)
     VALUES ($1,$2, NULL, 'AUTO_TOTAL_SNAPSHOT', $3, '自动考核扣分明细汇总',
       0, 100, 100, TRUE, FALSE, 'pending', NOW(), '由评分引擎按扣分明细自动重算')
     RETURNING id`,
    [targetId, cycleId, 0]
  );
  return ins.rows[0].id;
}

/**
 * 撤销一条自动扣分明细（软删除 + 记录撤销，幂等）
 */
async function removeAutoDeduction({ targetId, cycleId, metricCode, sourceTable, sourceId }) {
  const existing = await findAutoDeduction({ targetId, cycleId, metricCode, sourceTable, sourceId });
  if (!existing) return false;
  await pool.query(
    `UPDATE hse_assessment_deduction
     SET is_deleted = TRUE, updated_at = NOW()
     WHERE id = $1`,
    [existing.id]
  );
  return true;
}

// ============================================================
// 分数重算
// ============================================================

/**
 * 读取该考核对象当前生效的自动/传导扣分明细，汇总结论扣分
 * 生效分口径（全系统唯一）：approved/adjusted 用 confirmed_score（人工锁定），
 * 其余（pending）用 suggested_score（自动值），rejected/软删为 0。
 */
async function getEffectiveDeductionTotal(targetId, cycleId, executor = pool) {
  const r = await executor.query(
    `SELECT COALESCE(SUM(
       CASE WHEN review_status IN ('approved','adjusted')
            THEN COALESCE(confirmed_score, suggested_score)
            ELSE suggested_score END
     ), 0)::numeric AS total
     FROM hse_assessment_deduction
     WHERE target_id = $1 AND cycle_id = $2
       AND is_deleted = FALSE
       AND deduction_source IN ('auto','chain_transmission')
       AND review_status != 'rejected'`,
    [targetId, cycleId]
  );
  return Number(r.rows[0].total);
}

/**
 * 按「类别扣分上限」封顶重算自动评分（P2 修正口径）。
 * score = max(0, 100 − Σ_各类别 min(该对象该类别有效扣分合计, 类别上限))
 *   - 归类：resolveRuleForDeductionRows（rule_name→category）
 *   - 生效分：approved/adjusted 取 confirmed_score，其余取 suggested_score
 *   - 三违管理类别 = 三违管理考核列表聚合（网格/巡查/填报 + 未按时整改 + 驾驶员三违 + 公司查处），
 *     复用 violationAssessmentService（与列表同源，避免表内 kind 重复计数）
 *   - 否决项类别有效扣分 > 0 → 命中否决，总分归 0（上限 100 兜底，命中必满额）
 * @param {object} p
 * @param {number} p.cycleId
 * @param {number} p.targetId
 * @param {number} p.employeeId
 * @param {string} p.position    考核对象岗位中文名 → role
 * @param {object} [p.executor]
 * @returns {Promise<{scoreAuto:number, cappedDeduction:number, vetoHit:boolean, breakdown:Array}>}
 */
async function computeCategoryCappedScore({ cycleId, targetId, employeeId, position, executor = pool }) {
  const role = roleFromPosition(position);
  const r = await executor.query(
    `SELECT id, deduction_item, source_detail, suggested_score, confirmed_score, review_status
       FROM hse_assessment_deduction
      WHERE target_id = $1 AND cycle_id = $2 AND is_deleted = FALSE
        AND review_status <> 'rejected'
        AND deduction_source IN ('auto','chain_transmission')`,
    [targetId, cycleId]
  );
  const rows = r.rows || [];
  const resolved = await resolveRuleForDeductionRows(rows);

  // 每类累计（表内非三违类别用归类合计；三违类别单独用活源聚合整现值）
  const catSum = new Map();
  for (const { deduction: d, category } of resolved) {
    if (!category) continue;
    const eff = d.review_status === 'approved' || d.review_status === 'adjusted'
      ? (d.confirmed_score != null ? Number(d.confirmed_score) : Number(d.suggested_score))
      : Number(d.suggested_score);
    if (!Number.isFinite(eff) || eff <= 0) continue;
    catSum.set(category, (catSum.get(category) || 0) + eff);
  }

  // 否决项：有效扣分 > 0 → 命中否决
  const vetoHit = (catSum.get('否决项') || 0) > 0;

  // 三违管理类别：活源聚合整现值（含未按时整改/驾驶员/公司查处），与三违考核列表同源
  const sanweiTotal = await getEmployeeSanweiTotal(cycleId, position, employeeId, { year: 0, month: 0 });
  if (sanweiTotal > 0) catSum.set('三违管理', sanweiTotal);

  // 逐类封顶求和
  let cappedDeduction = 0;
  const breakdown = [];
  for (const [cat, raw] of catSum) {
    const cap = await getCategoryCap(cat, executor, role);
    const capped = Number.isFinite(cap) ? Math.min(raw, cap) : raw;
    cappedDeduction += capped;
    breakdown.push({
      category: cat,
      rawDeduction: Math.round(raw * 100) / 100,
      cap: Number.isFinite(cap) ? cap : null,
      capped: Math.round(capped * 100) / 100,
    });
  }

  const scoreAuto = vetoHit
    ? 0
    : Math.max(0, Math.round((MAX_SCORE - Math.round(cappedDeduction * 100) / 100) * 100) / 100);
  return {
    scoreAuto,
    cappedDeduction: Math.round(cappedDeduction * 100) / 100,
    vetoHit,
    breakdown,
  };
}

/**
 * 重算单个考核对象分数（以扣分明细为准）
 * 更新：hse_assessment_target.score_auto / score_total / grade / rank
 * P2-B1-E-08-04：新增可选 executor（事务 client），供「撤销即时回滚」在同一业务事务内重算；
 *   缺省 pool，既有调用方零漂移。
 * P2-B1-E-08-04-R2：新增 opts.force（默认 false）——撤销即时恢复场景下，
 *   周期 frozen/not_started 的应用层软拦截放行（仍走完整正式评分链：
 *   getEffectiveDeductionTotal → target UPDATE → 快照同步；DB 触发器
 *   prevent_frozen_target_modify 拦截的是 target 行级冻结，作为兜底保留）。
 *   仅 revokeConfirmation 传 force=true；其余调用方零漂移。
 * @returns {object} 重算结果
 */
async function recalculateTarget(cycleId, targetId, executor = pool, opts = {}) {
  const force = opts && opts.force === true;
  const tR = await executor.query(
    `SELECT * FROM hse_assessment_target
     WHERE id = $1 AND cycle_id = $2 AND is_deleted = FALSE`,
    [targetId, cycleId]
  );
  if (!tR.rows.length) return { ok: false, reason: 'target-not-found' };

  const target = tR.rows[0];

  // 冻结周期禁止自动变更（DB 触发器是兜底，这里先软拦截，避免异常幂等）
  // R2：撤销即时恢复（force）放行本软拦截——事实撤销成功提交 = 相关对象分数立即恢复，
  //     不允许出现「扣分行已回滚但分数快照仍旧值」的中间态。
  const cycleR = await executor.query(
    `SELECT status FROM hse_assessment_cycle WHERE id = $1 AND is_deleted = FALSE`,
    [cycleId]
  );
  const cycleStatus = cycleR.rows.length ? cycleR.rows[0].status : null;
  if (!force && (cycleStatus === 'frozen' || cycleStatus === 'not_started')) {
    return { ok: false, reason: `cycle-status-${cycleStatus}` };
  }

  // R2-FIX：force（撤销即时恢复）时开启事务本地白名单，放行 DB 触发器
  // prevent_frozen_target_modify 对 target.status='frozen' 行的评分更新拦截。
  // set_config 第三参 true = 事务本地（随 COMMIT/ROLLBACK 自动失效，不泄漏到连接池）；
  // 仍走完整评分链重算，非绕过式直改。
  if (force) {
    await executor.query(`SELECT set_config('app.allow_frozen_target_score_recalc', 'on', true)`);
  }

  const { scoreAuto, cappedDeduction, vetoHit } = await computeCategoryCappedScore({
    cycleId,
    targetId,
    employeeId: target.employee_id,
    position: target.position,
    executor,
  });

  // 重算总分
  const updated = await executor.query(
    `UPDATE hse_assessment_target
     SET score_auto = $1,
         score_total = COALESCE(score_manual,0) + $1 + COALESCE(score_bonus,0),
         grade = $2,
         score_version = score_version + 1,
         updated_at = NOW()
     WHERE id = $3
     RETURNING *`,
    [scoreAuto, calculateGrade(scoreAuto), targetId]
  );
  const newTarget = updated.rows[0];

  // 同步该 target 聚合指标评分记录（保持 hse_assessment_score 可视化一致）
  await syncTargetScoreSnapshot(cycleId, newTarget, scoreAuto, vetoHit ? 100 : cappedDeduction, executor);

  return {
    ok: true,
    target: newTarget,
    scoreAuto,
    totalDeduction: vetoHit ? 100 : cappedDeduction,
    vetoHit,
    scoreTotal: newTarget.score_total,
    grade: newTarget.grade,
  };
}

/**
 * 重算本周期全部考核对象（幂等，供手动“同步数据”/定时任务调用）
 */
async function recalculateCycle(cycleId) {
  const tR = await pool.query(
    `SELECT id FROM hse_assessment_target WHERE cycle_id = $1 AND is_deleted = FALSE`,
    [cycleId]
  );
  const results = [];
  for (const t of tR.rows) {
    // 逐个捕获异常，保证一个失败不影响其它
    try {
      const r = await recalculateTarget(cycleId, t.id);
      results.push({ targetId: t.id, ...r });
    } catch (e) {
      results.push({ targetId: t.id, ok: false, error: e.message });
    }
  }
  return results;
}

/**
 * 汇总目标聚合分写入：将自动/传导负分写入一条 target 指标评分摘要。
 * 不破坏 /scoring/execute 生成的逐指标评分，仅保证 target 总分在一处可读。
 */
async function syncTargetScoreSnapshot(cycleId, target, scoreAuto, totalDeduction, executor = pool) {
  try {
    // 标记一条“自动考核汇总”评分记录（deduction_total=总扣分, final_score=自动分）
    const r = await executor.query(
      `SELECT id FROM hse_assessment_score
       WHERE target_id = $1 AND cycle_id = $2
         AND metric_code = 'AUTO_TOTAL_SNAPSHOT' AND is_deleted = FALSE`,
      [target.id, cycleId]
    );
    if (r.rows.length) {
      await executor.query(
        `UPDATE hse_assessment_score
         SET raw_value = $1, deduction_total = $2, original_score = 100,
             final_score = $3, is_auto = TRUE, calc_time = NOW(), updated_at = NOW()
         WHERE id = $4`,
        [totalDeduction, totalDeduction, scoreAuto, r.rows[0].id]
      );
    } else {
      await executor.query(
        `INSERT INTO hse_assessment_score
          (target_id, cycle_id, metric_id, metric_code, raw_value, raw_value_desc,
           deduction_total, original_score, final_score, is_auto, is_manual,
           review_status, calc_time, remark)
         VALUES ($1,$2, NULL, 'AUTO_TOTAL_SNAPSHOT', $3, '自动考核扣分明细汇总',
           $3, 100, $4, TRUE, FALSE, 'approved', NOW(), '由评分引擎按扣分明细自动重算')`,
        [target.id, cycleId, totalDeduction, scoreAuto]
      );
    }
  } catch (e) {
    // 快照失败不影响主分数
  }
}

// ============================================================
// 人员定位（供事件服务使用）
// ============================================================

/**
 * 查询员工当前是否为考核对象白名单岗位
 * 白名单：乡镇作业中心经理 / 管理员(town_center) / 网格长（含总/一级/二级/三级）
 */
async function isAssessmentTargetPosition(position, orgType) {
  if (!position) return false;
  const p = String(position);
  if (p === '乡镇作业中心经理') return true;
  if (p === '管理员' && orgType === 'town_center') return true;
  // 网格长纳入考核（用户确认）
  if (p.includes('网格长')) return true;
  return false;
}

/**
 * 查询员工信息 + 直属上级（走 v_employee_org_full 视图）
 * @returns {object|null}
 */
async function getEmployeeWithManager(employeeId) {
  if (!employeeId) return null;
  const r = await pool.query(
    `SELECT v.employee_id, v.employee_code, v.name AS employee_name,
            v.position_name, v.org_type, v.org_path, v.org_name,
            v.supervisor_id, v.supervisor_name,
            v.relation_status
     FROM v_employee_org_full v
     WHERE v.employee_id = $1 AND v.relation_status = 'active'
     LIMIT 1`,
    [employeeId]
  );
  if (!r.rows.length) return null;
  const row = r.rows[0];
  return {
    id: row.employee_id,
    employeeCode: row.employee_code,
    name: row.employee_name,
    position: row.position_name,
    orgType: row.org_type,
    orgPath: row.org_path,
    orgName: row.org_name,
    manager: row.supervisor_id ? {
      id: row.supervisor_id,
      name: row.supervisor_name,
      position: null,
    } : null,
  };
}

// ============================================================
// 考核对象/周期查询
// ============================================================

/**
 * 查找事件日期所属的考核周期；不存在则返回 null（不自动创建）
 */
async function findCycleForDate(date) {
  if (!date) return null;
  const d = new Date(date);
  const r = await pool.query(
    `SELECT * FROM hse_assessment_cycle
     WHERE start_time <= $1 AND end_time >= $1
       AND status IN ('in_progress','pending_review','reviewed')
       AND is_deleted = FALSE
     ORDER BY id DESC LIMIT 1`,
    [d]
  );
  return r.rows[0] || null;
}

/**
 * 按员工查找其在某周期的考核对象记录
 */
async function findAssessmentTarget(cycleId, employeeId) {
  const r = await pool.query(
    `SELECT * FROM hse_assessment_target
     WHERE cycle_id = $1 AND employee_id = $2 AND is_deleted = FALSE`,
    [cycleId, employeeId]
  );
  return r.rows[0] || null;
}

// ============================================================
// 历史数据回填（供首次上线 / 手动执行评分时补齐明细）
// ============================================================

const FILL_SOURCES = {
  training: { metricCode: 'HSE-KPI-TRN-002', sourceTable: 'training_records', score: 3,
    fetch: `SELECT id AS source_id, training_date AS ev_date FROM training_records
            WHERE employee_id = $1 AND result = '不合格' AND training_date >= $2 AND training_date <= $3 AND is_deleted = FALSE`,
    makeItem: () => '培训不合格1次' },
  accident: { isVeto: true,
    fetchVeto: `SELECT id AS source_id, accident_date AS ev_date, accident_type FROM accidents
                WHERE personnel_id = $1 AND accident_date >= $2 AND accident_date <= $3 AND is_deleted = FALSE`,
  },
};

// 旧评分路刹车开关（提示词-11）：默认启用 = 与现状完全一致（两路当前为死路，不产生任何新扣分）。
// 业务拍板停用后，设环境变量 LEGACY_TRAINING_FILL=false 并重启即可，无需改码。
//
// 2026-10-13 口径清理（A 方案）：事故否决（一票否决 100 分）自 2026-09-05 起已由规则引擎
// accidentVetoAdapter（METRIC_CODE=HSE-KPI-NEG-004，engine.js 注册、assessmentEventService 触发）独家承担，
// 生产 18 行事故否决记录全部为 NEG-004，config 表 / legacy 路径声称的 NEG-001/002/003 在生产零数据。
// 故本开关仅保留 training；accident 否决项彻底移出 config/legacy 路径，杜绝「config/legacy 与规则引擎并存 → 同事故双扣」陷阱。
const LEGACY_FILL_ENABLED = {
  training: process.env.LEGACY_TRAINING_FILL !== 'false',
};

const _legacyFillWarned = { training: false, accident: false };
function warnLegacyFillOnce(kind, envKey) {
  if (!_legacyFillWarned[kind]) {
    _legacyFillWarned[kind] = true;
    console.warn(`[assessment-scoring] 旧${kind === 'training' ? '培训补扣' : '事故否决'}路已停用 (${envKey}=false)`);
  }
}

// ============================================================
// 指标取数配置驱动（替代硬编码 FILL_SOURCES）
// 从 hse_assessment_metric_source 读取启用源，按 source_table/filter_expr 动态取数。
// 新增评分数据源只插配置行，不动本引擎。env 开关(LEGACY_*)做最终覆盖。
// ============================================================

async function getMetricSources() {
  if (!isConnected()) return [];
  try {
  const r = await pool.query(
    `SELECT * FROM hse_assessment_metric_source
     WHERE enabled = TRUE AND is_deleted = FALSE
     ORDER BY sort_order ASC, id ASC`
  );
  let rows = r.rows || [];
  // 事故否决由规则引擎 accidentVetoAdapter（NEG-004）独家承担，config 表不再承载；
  // 此处硬排除 accident 源，即便 DB 行被重新 is_deleted=FALSE 或误翻 env，也绝不会走 config 路径生成 NEG-001/002/003，
  // 避免与规则引擎并存导致同事故双扣。
  rows = rows
    .filter((s) => s.source_name !== 'accident')
    .map((s) => {
      if (s.source_name === 'training' && LEGACY_FILL_ENABLED.training === false) return { ...s, enabled: false };
      return s;
    })
    .filter((s) => s.enabled);
  return rows;
  } catch (e) {
    // 配置表尚未建立（如生产库未跑 DDL）时返回空数组，上层回退 legacy，
    // 避免 “relation does not exist” 使评分同步整体崩溃。
    if (!/does not exist/i.test(e.message)) {
      console.error('[assessment-scoring] getMetricSources 查询异常:', e.message);
    }
    return [];
  }
}

async function fetchSourceRows(source, employeeId, start, end) {
  if (source.source_type !== 'sql' || !source.source_table) return [];
  const sql = `SELECT * FROM ${source.source_table} WHERE ${source.filter_expr}`;
  const r = await pool.query(sql, [employeeId, start, end]);
  return r.rows || [];
}

function renderItem(template, row) {
  if (!template) return '自动扣分';
  return String(template).replace(/\{(\w+)\}/g, (m, k) => (row[k] != null ? String(row[k]) : m));
}

function resolveVetoMetric(source, row) {
  if (!source.is_veto || !source.veto_metric_map) return source.metric_code;
  const map = source.veto_metric_map;
  const key = row[source.map_column];
  if (key != null && map[key] != null) return map[key];
  return map.default || source.metric_code;
}

/**
 * 为该考核对象补齐缺失的自动扣分明细（配置驱动版）
 * 100% 保留原 training/accident 语义：逐行生成 auto 明细、否决映射、env 开关、幂等。
 * 配置表无数据（dev 演练前未 seed）时回退 fillMissingDeductionsLegacy，行为零漂移。
 */
async function fillMissingDeductionsForTarget(cycle, target) {
  if (!cycle || !target) return { added: 0 };
  const start = cycle.start_time;
  const end = cycle.end_time;

  const sources = await getMetricSources();
  if (!sources.length) {
    // 配置表无数据：回退原硬编码，保证未 seed 时行为完全一致
    return fillMissingDeductionsLegacy(cycle, target);
  }

  const dedBySource = await pool.query(
    `SELECT source_table, source_id FROM hse_assessment_deduction
     WHERE target_id = $1 AND cycle_id = $2 AND is_deleted = FALSE`,
    [target.id, cycle.id]
  );
  const hasKey = new Set(dedBySource.rows.map((r) => `${r.source_table}:${r.source_id}`));

  let added = 0;
  for (const src of sources) {
    try {
      const rows = await fetchSourceRows(src, target.employee_id, start, end);
      for (const row of rows) {
        const sourceId = row.id;
        const metricCode = src.is_veto ? resolveVetoMetric(src, row) : src.metric_code;
        const key = `${src.source_table}:${sourceId}${src.is_veto ? '__' + metricCode : ''}`;
        if (hasKey.has(key)) continue;
        const detail = { sourceType: src.source_name, sourceId, backfill: true };
        if (row.training_date) detail.trainingDate = row.training_date;
        if (row.accident_date) detail.accidentDate = row.accident_date;
        const ins = await addAutoDeduction({
          targetId: target.id, cycleId: cycle.id, metricCode,
          deductionItem: renderItem(src.item_template, row),
          sourceTable: src.source_table, sourceId,
          suggestedScore: src.fixed_score != null ? Number(src.fixed_score) : 0,
          sourceDetail: detail,
        });
        if (ins) { added++; hasKey.add(key); }
      }
    } catch (e) {
      if (/does not exist/i.test(e.message)) {
        // 业务表/字段差异，容忍（与原逻辑一致）
      } else throw e;
    }
  }
  return { added };
}

/**
 * 为该考核对象补齐缺失的自动扣分明细（三违/培训不合格/事故否决）
 * 幂等：已存在的不重复生成。用于首次上线时覆盖事件驱动之前的历史数据。
 * 配置表无数据时由 fillMissingDeductionsForTarget 回退调用（原硬编码版）。
 */
async function fillMissingDeductionsLegacy(cycle, target) {
  if (!cycle || !target) return { added: 0 };
  const start = cycle.start_time;
  const end = cycle.end_time;
  // 查看是否事故否决字段
  const dedBySource = await pool.query(
    `SELECT source_table, source_id FROM hse_assessment_deduction
     WHERE target_id = $1 AND cycle_id = $2 AND is_deleted = FALSE`,
    [target.id, cycle.id]
  );
  const hasKey = new Set(dedBySource.rows.map(r => `${r.source_table}:${r.source_id}`));

  let added = 0;

  // 培训不合格（旧路，受 LEGACY_TRAINING_FILL 开关控制；默认启用=现状）
  if (LEGACY_FILL_ENABLED.training) {
    try {
      const t = await pool.query(FILL_SOURCES.training.fetch, [target.employee_id, start, end]);
      for (const row of t.rows) {
        const key = `training_records:${row.source_id}`;
        if (hasKey.has(key)) continue;
        const ins = await addAutoDeduction({
          targetId: target.id, cycleId: cycle.id, metricCode: FILL_SOURCES.training.metricCode,
          deductionItem: FILL_SOURCES.training.makeItem(), sourceTable: FILL_SOURCES.training.sourceTable,
          sourceId: row.source_id, suggestedScore: FILL_SOURCES.training.score,
          sourceDetail: { sourceType: 'training', sourceId: row.source_id, trainingDate: row.ev_date, backfill: true },
        });
        if (ins) { added++; hasKey.add(key); }
      }
    } catch (e) {
      if (!/does not exist/i.test(e.message)) throw e;
    }
  } else {
    warnLegacyFillOnce('training', 'LEGACY_TRAINING_FILL');
  }

  // 事故否决（一票否决 100 分）自 2026-09-05 起由规则引擎 accidentVetoAdapter（METRIC_CODE=HSE-KPI-NEG-004）独家承担。
  // 2026-10-13 口径清理（A 方案）：config 表 accident 源已 is_deleted，本 legacy 回退路径也不再生成 NEG-001/002/003，
  // 彻底杜绝「config/legacy 与规则引擎并存 → 同事故双扣」。故此处不再处理事故否决。
  // 若 config 表查询异常导致 getMetricSources 返回空而进入本回退路径，事故否决仍由规则引擎独立产出，不会出现漏扣。

  return { added };
}

module.exports = {
  TRANSMISSION_RATIO,
  CHAIN_LEVEL,
  MAX_SCORE,
  DEDUCTION_SOURCE,
  calculateGrade,
  getActiveMetrics,
  findMetricByCode,
  resolveMetricRule,
  applyMetricRule,
  getTargetDimensions,
  logAudit,
  findAutoDeduction,
  addAutoDeduction,
  removeAutoDeduction,
  ensureTargetScoreRecord,
  getEffectiveDeductionTotal,
  computeCategoryCappedScore,
  recalculateTarget,
  recalculateCycle,
  syncTargetScoreSnapshot,
  fillMissingDeductionsForTarget,
  fillMissingDeductionsLegacy,
  isAssessmentTargetPosition,
  getEmployeeWithManager,
  findCycleForDate,
  findAssessmentTarget,
};