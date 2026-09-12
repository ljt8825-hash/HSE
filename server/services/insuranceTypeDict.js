/**
 * 人员保险险种字典（任务4，提示词08）。
 *
 * 人员保险透视/统计/合规/表单只支持两个规范值：`雇主责任险`、`工伤保险`。
 * 所有单条创建、更新、直接导入、通用导入、规则生成和筛选必须在写库前规范化。
 *
 * 别名：工伤险 -> 工伤保险（唯一内置别名）。
 * `意外伤害险` 不属于当前人员保险双险透视：禁止从人员保险入口写入。
 * `五险` 是人员属性/规则条件，不是 personnel_insurance.insurance_type 的规范保单类型：
 * 规则输出只能生成规范险种；"五险人员方案"的实际跟踪结果是工伤保障 → 输出 `工伤保险`。
 *
 * 无法规范化的险种返回 null（调用方必须以 unsupported_insurance_type 拒绝并阻止写库，
 * 禁止"写入成功但主列表不可见"）。
 */

/** 规范险种（唯一允许写入 personnel_insurance.insurance_type 的值） */
const SUPPORTED_INSURANCE_TYPES = Object.freeze(['雇主责任险', '工伤保险']);

/** 别名映射（小写 -> 规范值） */
const ALIAS_MAP = Object.freeze({
  '工伤险': '工伤保险',
  '工伤': '工伤保险',
  '工伤保险': '工伤保险',
  '雇主责任险': '雇主责任险',
  '雇主险': '雇主责任险',
});

/**
 * 规范化险种。返回规范值；无法规范化的返回 null。
 * - 输入为 null/undefined/空串 → null
 * - 匹配规范值或别名 → 规范值
 * - 其他（意外伤害险/五险/未知）→ null
 */
function normalizeInsuranceType(raw) {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (s === '') return null;
  return ALIAS_MAP[s] || null;
}

/** 是否为受支持的规范险种 */
function isSupportedInsuranceType(raw) {
  return SUPPORTED_INSURANCE_TYPES.includes(normalizeInsuranceType(raw));
}

module.exports = {
  SUPPORTED_INSURANCE_TYPES,
  ALIAS_MAP,
  normalizeInsuranceType,
  isSupportedInsuranceType,
};
