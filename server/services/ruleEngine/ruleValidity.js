/**
 * 规则引擎 · 规则有效期判断（P2-B1-E-08-04）
 *
 * 业务冻结口径：
 *   - valid_from <= business_time 且 business_time <= valid_to（valid_to 为空 = 无结束日期）
 *   - 未生效 / 已失效的规则不得参与计算（统一在引擎执行链过滤，禁止各 Adapter 复制日期判断）
 *
 * 月度周期口径（窗口重叠）：
 *   考核按月扫描，规则按日定义有效期。规则对某周期「参与计算」的判定为
 *   「规则有效期与周期窗口存在重叠」：
 *     valid_from <= cycle_end_date  且  (valid_to IS NULL 或 valid_to >= cycle_start_date)
 *   边界均含端点（valid_from 当天 / valid_to 当天均执行）。
 *   纯函数、无 IO，便于单测覆盖边界（valid_from 前/当天、valid_to 当天/之后/空）。
 */

/**
 * 解析日期为「日」粒度时间戳（本地时区零点），容错 Date / 'YYYY-MM-DD' / ISO 字符串
 * @returns {number|null} null = 输入为空/非法
 */
function toDayStart(v) {
  if (v === null || v === undefined || v === '') return null;
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * 规则是否对「单一业务时点」有效
 * @param {object} rule 含 validFrom / validTo（Date | 'YYYY-MM-DD' | null）
 * @param {Date|string} businessTime 业务发生/考核时间
 * @returns {boolean}
 */
function isRuleEffectiveForDate(rule, businessTime) {
  if (!rule) return false;
  const from = toDayStart(rule.validFrom);
  const to = toDayStart(rule.validTo);
  const t = toDayStart(businessTime);
  if (t === null) return false;
  if (from !== null && t < from) return false;   // 尚未生效
  if (to !== null && t > to) return false;       // 已失效
  return true;
}

/**
 * 规则是否对「考核周期窗口」有效（引擎统一过滤口径：窗口重叠，含端点）
 * @param {object} rule 含 validFrom / validTo
 * @param {object} cycle 含 start_time / end_time（Date 或可解析字符串）
 * @returns {boolean}
 */
function isRuleEffectiveForWindow(rule, cycle) {
  if (!rule) return false;
  if (!cycle || !cycle.start_time || !cycle.end_time) return false;
  const cycleStart = toDayStart(cycle.start_time);
  const cycleEnd = toDayStart(cycle.end_time);
  if (cycleStart === null || cycleEnd === null) return false;
  const from = toDayStart(rule.validFrom);
  const to = toDayStart(rule.validTo);
  if (from !== null && from > cycleEnd) return false;  // 周期结束才开始生效 → 本周期不参与
  if (to !== null && to < cycleStart) return false;    // 周期开始前已失效 → 本周期不参与
  return true;
}

module.exports = {
  isRuleEffectiveForDate,
  isRuleEffectiveForWindow,
  toDayStart,
};
