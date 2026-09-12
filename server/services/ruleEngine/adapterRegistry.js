/**
 * 规则引擎 · 适配器注册表
 *
 * 适配器契约：
 * {
 *   key: 'grid_unchecked',                       // 与 hse_assessment_rule.adapter_key 对应
 *   ruleCode: 'R000001',                          // 兜底规则编码（adapter_key 缺失时按此加载）
 *   sourceTable: 'grid_inspection_records',       // 写入扣分行的 source_table
 *   kind: 'grid_unchecked_monthly',               // source_detail.kind
 *   async scan({ cycle, year, month, rule, dryRun })
 *        -> { scanned, intents, revocations, skipped, noLedger }
 *   buildDeductKey({ cycleId, employeeId }) -> string
 *   buildItem(intent) -> deduction_item 文案
 *   buildDetail(intent, outcome) -> source_detail 对象
 *   buildReportDetail(intent, outcome) -> 返回给调用方的 details 元素
 * }
 */

const _adapters = new Map();

/**
 * 注册适配器（重复注册以最后为准）
 */
function registerAdapter(key, adapter) {
  if (!key || !adapter) throw new Error('registerAdapter: key 与 adapter 必填');
  _adapters.set(key, adapter);
}

function getAdapter(key) {
  return _adapters.get(key) || null;
}

/**
 * 已注册适配器 key 列表（按注册顺序）
 */
function listActiveAdapterKeys() {
  return [..._adapters.keys()];
}

/**
 * 清空注册表（仅供单测使用）
 */
function resetAdapters() {
  _adapters.clear();
}

module.exports = {
  registerAdapter,
  getAdapter,
  listActiveAdapterKeys,
  resetAdapters,
};
