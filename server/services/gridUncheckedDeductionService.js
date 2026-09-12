/**
 * 网格长「未检查/未巡查」月度自动扣分服务（阶段1：薄封装）
 *
 * 阶段1 已将业务实现迁入 server/services/ruleEngine/：
 *   ruleEngine/engine.js                      主编排（周期守卫 → 扫描 → 钳制 → 落库 → 重算 → 可观测）
 *   ruleEngine/adapters/gridUncheckedAdapter.js  本通路的扫描与明细构建
 *   ruleEngine/deductionWriter.js             通用幂等写入器
 *   ruleEngine/categoryCap.js                 类别上限钳制
 *   ruleEngine/ruleLoader.js                  规则加载（adapter_key 精确匹配）
 *
 * 本文件保留原有导出与返回形状，供 4 个调用点零改动继续使用：
 *   - server/routes/import.js（台账上传后扫描）
 *   - server/routes/hse-assessment-monthly.js（/scoring/execute 执行评分、解锁后重扫）
 *   - server/services/assessmentScheduler.js（每日定时兜底 runGridCheck）
 *
 * 业务口径（2026-08-30 拍板，迁移前后不变）：
 *   缺次 = max(0, 应巡 − 实巡)；每缺 1 次扣规则库「未检查」的 deduct_score（默认 1）
 *   计入「三违管理」类别，受 hse_assessment_category_limit.max_deduct（当前 15）钳制
 *   幂等键 = source_detail.kind='grid_unchecked_monthly'
 *            + deductKey='grid-unchecked:{cycleId}:{employeeId}'
 *   人工锁定行（approved/adjusted）不覆盖；当月无台账则整月跳过（reason='no-ledger-data'）
 */

const { isConnected } = require('../config/db');
const { runCycleAutoDeductions } = require('./ruleEngine/engine');
const { getRuleByAdapterKey, getRuleByCode } = require('./ruleEngine/ruleLoader');
const { getCategoryCap } = require('./ruleEngine/categoryCap');
const gridUncheckedAdapter = require('./ruleEngine/adapters/gridUncheckedAdapter');

const ADAPTER_KEY = 'grid_unchecked';
const RULE_CATEGORY = '三违管理';

/**
 * 对指定考核周期执行自动扣分同步（幂等，可重复执行）
 *
 * 阶段2 起转调规则引擎「统一门面」runCycleAutoDeductions，一次运行同时覆盖
 * 网格未巡查（grid_unchecked）与三违自身行为（violation_record）两条适配器；
 * 返回字段（ok/scanned/affected 等）与历史调用点零感知兼容。
 *
 * @param {number} cycleId 考核周期 id
 * @param {object} [opts]
 * @param {boolean} [opts.dryRun] 只算不写库，返回 details 供人工核对
 * @returns {object} { ok, cycleId, scanned, affected, details, skipped, dryRun, adapters }
 */
async function syncGridUncheckedDeductions(cycleId, { dryRun = false } = {}) {
  if (!isConnected()) return { ok: false, reason: 'memory-mode', adapters: [] };
  return runCycleAutoDeductions(cycleId, { dryRun: !!dryRun });
}

// ===== 以下导出为兼容保留（内部转调规则引擎新模块），供历史脚本使用 =====

/**
 * 读取本通路规则配置（兼容旧签名）
 * @returns {Promise<{ruleId:number|null, ruleName:string, category:string, metricCode:string|null, unit:number, cumulative:boolean}>}
 */
async function loadRuleConfig() {
  const rule = (await getRuleByAdapterKey(ADAPTER_KEY)) || (await getRuleByCode(gridUncheckedAdapter.ruleCode));
  if (!rule) {
    return { ruleId: null, ruleName: '未检查', category: RULE_CATEGORY, metricCode: null, unit: 1, cumulative: true };
  }
  return {
    ruleId: rule.ruleId,
    ruleName: rule.ruleName,
    category: RULE_CATEGORY,
    metricCode: rule.metricCode,
    unit: rule.deductScore > 0 ? rule.deductScore : 1,
    cumulative: rule.deductType === 'cumulative',
  };
}

/**
 * 读取「三违管理」类别扣分上限（未配置返回 Infinity）
 */
async function loadCategoryCap() {
  return getCategoryCap(RULE_CATEGORY);
}

/**
 * 确保本通路指标存在（幂等）
 */
async function ensureMetric(metricCode) {
  return gridUncheckedAdapter.ensureMetric(metricCode);
}

module.exports = {
  syncGridUncheckedDeductions,
  loadRuleConfig,
  loadCategoryCap,
  ensureMetric,
};
