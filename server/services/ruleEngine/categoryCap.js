/**
 * 规则引擎 · 类别扣分上限
 *
 * 封装 gridUncheckedDeductionService 的 loadCategoryCap / otherSanweiScore / 钳制计算。
 * 自动钳制：allowed = max(0, cap − 其他自动扣分合计)，cappedScore = min(raw, allowed)（强制砍断）。
 * 人工提示：computeManualCapWarning 计算「全部有效来源合计 + 本次分值」是否超上限，纯 advisory（只提示不拦截）。
 * 归类口径两路共用 assessmentRuleCategoryService（resolveDeductionRule / resolveRuleForDeductionRows），禁止第二套。
 *
 * 口径：
 *   allowed     = max(0, 类别上限 − 该对象该类别下「其他」自动扣分合计)
 *   cappedScore = min(rawScore, allowed)
 *   「其他」= 排除本通路 kind 之后，仍归属同一中文大类的有效扣分
 *   生效分：approved/adjusted 取 confirmed_score，其余取 suggested_score
 */

const { pool, isConnected } = require('../../config/db');
const { resolveRuleForDeductionRows, resolveDeductionRule } = require('../assessmentRuleCategoryService');

// 生效分统计时排除的无效态
const EXCLUDED_STATUSES = ['rejected'];
// 自动钳制合计范围：仅自动 + 链传（人工扣分不参与自动钳制）
const VALID_SOURCES = ['auto', 'chain_transmission'];
// 人工扣分提示合计范围：含全部有效来源（auto + manual + chain_transmission）
const ALL_SOURCES = ['auto', 'manual', 'chain_transmission'];

/**
 * 由考核对象岗位(position，中文名)推导类别上限岗位套(role)。
 * 「管理员」→ admin；其余（含空/未知）→ manager（乡镇作业中心经理，历史语义）。
 */
function roleFromPosition(position) {
  return String(position || '').trim() === '管理员' ? 'admin' : 'manager';
}

/**
 * 读取类别扣分上限；未配置或异常返回 Infinity（不设上限）
 * @param {string} category 中文大类，如「三违管理」
 * @param {object} [executor] 查询执行器；默认 pool
 * @param {string} [role] 岗位套：manager=乡镇作业中心经理 / admin=管理员；缺省 manager（兼容既有调用方）
 * @returns {Promise<number>}
 */
async function getCategoryCap(category, executor = pool, role = 'manager') {
  if (!category) return Infinity;
  const normRole = role === 'admin' ? 'admin' : 'manager';
  try {
    const r = await executor.query(
      `SELECT max_deduct FROM hse_assessment_category_limit
        WHERE category = $1 AND target_role = $2
        LIMIT 1`,
      [category, normRole]
    );
    if (!r.rows.length || r.rows[0].max_deduct == null) return Infinity;
    return Math.max(0, Number(r.rows[0].max_deduct));
  } catch (e) {
    return Infinity;
  }
}

/**
 * 按归类口径累加符合条件的扣分（纯合计，复用 resolveRuleForDeductionRows 归类）。
 * 与自动钳制完全一致：approved/adjusted 取 confirmed_score，其余取 suggested_score；
 * excludeId 用于排除「当前正在落库的行」自身（编辑时排除本行）。
 */
async function resolveAndSum(rows, category, excludeId) {
  const resolved = await resolveRuleForDeductionRows(rows);
  let sum = 0;
  for (const { deduction: d, category: cat } of resolved) {
    if (cat !== category) continue;
    // 仅排除「当前正在落库的那一行」，避免重算时自身被重复计入；同 kind 其他行照常累加
    if (excludeId != null && d.id != null && Number(d.id) === Number(excludeId)) continue;
    const eff = d.review_status === 'approved' || d.review_status === 'adjusted'
      ? (d.confirmed_score != null ? Number(d.confirmed_score) : Number(d.suggested_score))
      : Number(d.suggested_score);
    sum += Number.isFinite(eff) ? eff : 0;
  }
  return Math.round(sum * 100) / 100;
}

/**
 * 该考核对象在指定周期内、指定类别下、除「当前正在落库的那一行」(excludeId) 外的有效扣分合计。
 *
 * 关键修复：旧实现按整条 kind 排除（excludeKind），导致同一 kind 的多次扣分永远互不计入
 * 类别上限，多人/多次违章可无限叠加、突破 15 分上限。现改为按行排除（excludeId），
 * 使同 kind 多行（如一人多次三违）也能正确累加到类别上限，同时不重复计入当前行自身。
 *
 * @param {string[]} [sources] 计入的扣分来源白名单；默认 VALID_SOURCES（仅自动+链传）。
 * @param {object} [executor]  查询执行器；默认 pool（导入事务内可传 client 以读未提交行）。
 */
async function getOtherCategoryScore(cycleId, targetId, category, excludeId, sources = VALID_SOURCES, executor = pool) {
  if (executor === pool && (!isConnected() || !category)) return 0;
  const r = await executor.query(
    `SELECT id, deduction_item, source_detail, suggested_score, confirmed_score, review_status
       FROM hse_assessment_deduction
      WHERE target_id = $1 AND cycle_id = $2 AND is_deleted = FALSE
        AND review_status <> ALL($3::text[])
        AND deduction_source = ANY($4::text[])`,
    [targetId, cycleId, EXCLUDED_STATUSES, sources]
  );
  if (!r.rows.length) return 0;
  return resolveAndSum(r.rows, category, excludeId);
}

/**
 * 该对象该周期该类别下「全部有效来源」(auto + manual + chain_transmission) 的扣分合计。
 * 用于人工扣分上限提示（提示口径需包含所有来源，而非仅自动来源）。
 */
async function getValidCategoryScore(cycleId, targetId, category, excludeId, executor = pool) {
  return getOtherCategoryScore(cycleId, targetId, category, excludeId, ALL_SOURCES, executor);
}

/**
 * 人工扣分上限提示（纯 advisory，照常保存不拦截）。
 * 归类口径与自动钳制完全一致（resolveDeductionRule / resolveRuleForDeductionRows）。
 * 返回 null 表示无需提示：类别缺失 / 该类别无上限 / 当前合计 + 本次分值未超上限。
 *
 * @param {object} p
 * @param {number} p.cycleId
 * @param {number} p.targetId
 * @param {string} p.deductionItem   扣分项名称（用于归类到类别）
 * @param {object} [p.sourceDetail]  扣分明细 source_detail（含可信 category 时优先）
 * @param {number} p.adding          本次分值（正数）
 * @param {number|null} [p.excludeId] 编辑时排除本行 id
 * @param {string} [p.role]          岗位套 manager/admin；缺省 manager
 * @param {object} [p.executor]      可选查询执行器（默认 pool；导入事务内可传 client 以读未提交行）
 */
async function computeManualCapWarning({ cycleId, targetId, deductionItem, sourceDetail, adding, excludeId = null, role = 'manager', executor = pool }) {
  const { category } = await resolveDeductionRule({ deduction_item: deductionItem, source_detail: sourceDetail });
  if (!category) return null;                       // 类别缺失 → 不提示
  const cap = await getCategoryCap(category, executor, role);
  if (!Number.isFinite(cap)) return null;           // 无上限 → 不提示
  const currentTotal = await getValidCategoryScore(cycleId, targetId, category, excludeId, executor);
  const addingNum = Number(adding) || 0;
  const wouldTotal = Math.round((currentTotal + addingNum) * 100) / 100;
  if (wouldTotal <= cap) return null;               // 未超 → 不提示
  return { category, cap, currentTotal, adding: addingNum, wouldTotal };
}

/**
 * 应用类别上限钳制
 * @param {object} p
 * @param {number} p.cycleId
 * @param {number} p.targetId
 * @param {string} p.category   中文大类
 * @param {number|null} [p.excludeId] 当前正在落库行的 id（用于排除自身历史行，避免重算重复计）
 * @param {number} p.rawScore   钳制前分数
 * @param {string} [p.role]     岗位套 manager/admin；缺省 manager
 * @returns {Promise<{cap:number, otherCatScore:number, allowed:number, cappedScore:number, cappedOut:boolean}>}
 */
async function applyCap({ cycleId, targetId, category, excludeId = null, rawScore, role = 'manager' }) {
  const cap = await getCategoryCap(category, pool, role);
  const otherCatScore = await getOtherCategoryScore(cycleId, targetId, category, excludeId);
  const allowed = Math.max(0, cap - otherCatScore);
  const cappedScore = Math.min(rawScore, allowed);
  return {
    cap,
    otherCatScore,
    allowed,
    cappedScore: Math.round(cappedScore * 100) / 100,
    cappedOut: rawScore > 0 && cappedScore <= 0,
  };
}

module.exports = {
  getCategoryCap,
  getOtherCategoryScore,
  getValidCategoryScore,
  applyCap,
  computeManualCapWarning,
  roleFromPosition,
};
