/**
 * 规则引擎 · 规则加载器
 *
 * 职责：从 hse_assessment_rule 读取启用的规则配置，供引擎与适配器消费。
 * 与旧的 gridUncheckedDeductionService.loadRuleConfig 的区别：
 *   - 旧实现按「category + rule_name LIKE」模糊匹配；
 *   - 新实现按 adapter_key 精确匹配（阶段0 已在规则库回填），不再依赖模糊匹配。
 *
 * 只读模块，不写任何表。
 */

const { pool, isConnected } = require('../../config/db');

const RULE_FIELDS = `
  id, rule_code, rule_name, category, metric_code, indicator_name,
  source_table, trigger_type, deduct_type, deduct_score, max_deduct,
  adapter_key, integration_status, integration_note,
  last_run_at, last_run_cycle_id, last_scanned_count, last_deducted_count, last_run_summary
`;

/**
 * 把数据库行规整为引擎统一使用的规则配置对象
 */
function toRuleConfig(row) {
  if (!row) return null;
  return {
    ruleId: row.id,
    ruleCode: row.rule_code,
    ruleName: row.rule_name,
    category: row.category,
    metricCode: row.metric_code || null,
    indicatorName: row.indicator_name || null,
    sourceTable: row.source_table || null,
    triggerType: row.trigger_type,
    deductType: row.deduct_type,
    deductScore: row.deduct_score != null ? Number(row.deduct_score) : 0,
    maxDeduct: row.max_deduct != null ? Number(row.max_deduct) : null,
    adapterKey: row.adapter_key || null,
    integrationStatus: row.integration_status,
    integrationNote: row.integration_note || null,
  };
}

/**
 * 加载全部启用且未删除的规则
 * @returns {Array<object>} 规则配置数组（按 id 升序）
 */
async function loadEnabledRules() {
  if (!isConnected()) return [];
  const r = await pool.query(
    `SELECT ${RULE_FIELDS}
       FROM hse_assessment_rule
      WHERE is_deleted = FALSE AND status = 'enabled'
      ORDER BY id ASC`
  );
  return r.rows.map(toRuleConfig);
}

/**
 * 按适配器标识取规则（阶段1 只有 grid_unchecked 有值）
 * @param {string} adapterKey
 * @returns {object|null}
 */
async function getRuleByAdapterKey(adapterKey) {
  if (!adapterKey) return null;
  if (!isConnected()) return null;
  const r = await pool.query(
    `SELECT ${RULE_FIELDS}
       FROM hse_assessment_rule
      WHERE is_deleted = FALSE AND status = 'enabled' AND adapter_key = $1
      ORDER BY id DESC LIMIT 1`,
    [adapterKey]
  );
  return toRuleConfig(r.rows[0] || null);
}

/**
 * 按 rule_code 取规则
 */
async function getRuleByCode(ruleCode) {
  if (!ruleCode) return null;
  if (!isConnected()) return null;
  const r = await pool.query(
    `SELECT ${RULE_FIELDS}
       FROM hse_assessment_rule
      WHERE is_deleted = FALSE AND status = 'enabled' AND rule_code = $1
      ORDER BY id DESC LIMIT 1`,
    [ruleCode]
  );
  return toRuleConfig(r.rows[0] || null);
}

module.exports = {
  loadEnabledRules,
  getRuleByAdapterKey,
  getRuleByCode,
  toRuleConfig,
};
