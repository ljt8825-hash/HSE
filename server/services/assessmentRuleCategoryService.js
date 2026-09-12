/**
 * 扣分规则库 → 类别 解析服务（共享）
 *
 * 扣分明细与「扣分规则库」以规则名（rule_name）作为唯一稳定关联：
 *   规则库表 hse_assessment_rule（含 rule_name + category），
 *   扣分明细携带 source_detail.ruleHit.ruleName 或明细名 deduction_item，
 *   两者按规则名精确匹配以归属类别。规则名加载带 30s 缓存。
 *
 * 供 hse-assessment-monthly.js 与 gridUncheckedDeductionService.js 复用。
 */

const { pool, isConnected } = require('../config/db');

let _ruleCategoryMap = null;
let _ruleCategoryLoadedAt = 0;

/**
 * 加载规则库 rule_name → { category, ruleId } 映射（30s 缓存）
 */
async function getRuleCategoryMap() {
  if (_ruleCategoryMap && Date.now() - _ruleCategoryLoadedAt < 30000) return _ruleCategoryMap;
  if (!isConnected()) return {};
  const r = await pool.query(
    `SELECT id, rule_name, category FROM hse_assessment_rule WHERE is_deleted = FALSE`
  );
  const map = {};
  for (const row of r.rows) {
    if (!row.rule_name) continue;
    if (!map[row.rule_name]) {
      map[row.rule_name] = { category: row.category, ruleId: row.id };
    }
  }
  _ruleCategoryMap = map;
  _ruleCategoryLoadedAt = Date.now();
  return map;
}

/**
 * 解析单条扣分明细的规则名与类别；未命中返回 { ruleName, category:null }（仍保留 ruleName 供展示）
 *
 * 优先级：扣分明细自带的可信类别 source_detail.category（适配器落库时已写入）→ 规则名查表。
 * 这样无需依赖 deduction_item / ruleHit.ruleName 与规则库 rule_name 的文本精确匹配，
 * 避免「三违1次（公司查处）」这类展示文案匹配不到规则名而导致类别解析为 null、上限失效。
 */
async function resolveDeductionRule(d) {
  if (d.source_detail && d.source_detail.category) {
    return { ruleName: d.source_detail.ruleName || null, category: d.source_detail.category };
  }
  let ruleName = null;
  if (d.source_detail && d.source_detail.ruleHit && d.source_detail.ruleHit.ruleName) {
    ruleName = String(d.source_detail.ruleHit.ruleName);
  }
  if (!ruleName && d.deduction_item) ruleName = String(d.deduction_item);
  if (!ruleName) return { ruleName: null, category: null };
  const map = await getRuleCategoryMap();
  const hit = map[ruleName];
  if (hit) return { ruleName, category: hit.category };
  return { ruleName, category: null };
}

/**
 * 批量解析扣分明细行 → { deduction, ruleName, category }
 *
 * 优先级：明细自带 source_detail.category（可信）→ 规则名查表。
 */
async function resolveRuleForDeductionRows(rows) {
  const map = await getRuleCategoryMap();
  const out = [];
  for (const d of rows) {
    let category = (d.source_detail && d.source_detail.category) || null;
    let ruleName = null;
    if (d.source_detail && d.source_detail.ruleHit && d.source_detail.ruleHit.ruleName) {
      ruleName = String(d.source_detail.ruleHit.ruleName);
    }
    if (!ruleName && d.deduction_item) ruleName = String(d.deduction_item);
    if (!category && ruleName && map[ruleName]) category = map[ruleName].category;
    out.push({ deduction: d, ruleName, category });
  }
  return out;
}

module.exports = {
  getRuleCategoryMap,
  resolveDeductionRule,
  resolveRuleForDeductionRows,
};
