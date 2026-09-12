/**
 * 规则引擎 · 运行可观测落库
 *
 * 每次自动扣分通路「实际运行」（dryRun=false）后，把扫描人数/考核对象人数/扣分人数
 * 写回规则行，供规则库列表「最近执行结果」列展示。dryRun 不写。
 *
 * 口径（阶段1.5 起）：
 *   scanned  = 适配器扫描到的总人数（含非本期考核对象）
 *   assessed = 实际命中考核对象的人数
 *   deducted = 当期产生有效扣分的人数（或事件条数，见 deductedUnit）
 * 文案：assessed 与 scanned 不一致时展示「扫描X人/考核Y人/扣分Z人」，
 *       一致时省略考核数。deducted 段单位随 deductedUnit 变化：
 *       'people'（默认，月度聚合按人）→「扣分Z人」；
 *       'events'（事件级按条/人次）→「扣分Z人次」（scanned/assessed 仍按人数口径）。
 */

const { pool, isConnected } = require('../../config/db');

/**
 * 生成最近执行结果展示文案
 * @param {number} scanned       扫描总人数
 * @param {number} assessed      命中考核对象人数
 * @param {number} deducted      有效扣分人数（或事件条数，见 deductedUnit）
 * @param {string}  deductedUnit 计量单位：'people'（默认，按月度聚合按人）| 'events'（事件级按条/人次）
 * @returns {string}
 */
function buildRunSummary({ scanned = 0, assessed = 0, deducted = 0, deductedUnit = 'people' }) {
  const s = Number(scanned) || 0;
  const a = Number(assessed) || 0;
  const d = Number(deducted) || 0;
  // deducted 段单位随适配器计量口径变化：事件级（一条违规=1 次）称「人次」，月度聚合称「人」
  const deductedWord = deductedUnit === 'events' ? '人次' : '人';
  // 考核对象人数与扫描人数不一致时，显式补一段「考核N人」避免业务误解
  return a !== s
    ? `扫描${s}人/考核${a}人/扣分${d}${deductedWord}`
    : `扫描${s}人/扣分${d}${deductedWord}`;
}

/**
 * 记录一次规则运行
 * @param {object} p
 * @param {number|null} p.ruleId   规则 id（为空则跳过）
 * @param {number|null} p.cycleId  考核周期 id
 * @param {number} p.scanned       扫描到的总人数
 * @param {number} p.assessed      命中考核对象的人数
 * @param {number} p.deducted      当期有效扣分人数（或事件条数，见 deductedUnit）
 * @param {string}  p.deductedUnit 计量单位：'people'（默认）| 'events'
 * @returns {Promise<boolean>} 是否写入成功
 */
async function recordRuleRun({ ruleId, cycleId, scanned = 0, assessed = 0, deducted = 0, deductedUnit = 'people' }) {
  if (!isConnected() || !ruleId) return false;
  const summary = buildRunSummary({ scanned, assessed, deducted, deductedUnit });
  try {
    await pool.query(
      `UPDATE hse_assessment_rule
          SET last_run_at = NOW(),
              last_run_cycle_id = $2,
              last_scanned_count = $3,
              last_assessed_count = $4,
              last_deducted_count = $5,
              last_run_summary = $6,
              updated_at = NOW()
        WHERE id = $1`,
      [
        ruleId,
        cycleId ?? null,
        Number(scanned) || 0,
        Number(assessed) || 0,
        Number(deducted) || 0,
        summary,
      ]
    );
    return true;
  } catch (e) {
    console.warn(`[rule-engine] 记录规则运行失败 rule=${ruleId}:`, e.message);
    return false;
  }
}

module.exports = { recordRuleRun, buildRunSummary };
