/**
 * HSE月度安全履职考核模块（/api/hse/assessment-monthly）—— 薄 controller
 * 仅做 req 解析 + 调 service + res 包装；业务规则与 SQL 全在 services/assessmentMonthly*.js。
 * 各 service 返回统一描述符（__t: list / detail / json / raw / xlsx / error），
 * 由 respond() 统一解释为对外 JSON 契约，保持与原 routes/hse-assessment-monthly.js 一致。
 *
 * 说明：
 *   - 原实现审计链（recordAudit）下沉至 shared 服务，controller 不 direct 调 auditLog；
 *     auditMiddleware 仍按原样绑定在子路由层。
 *   - 5.3/5.4 capWarning 追加字段场景由 __t:'raw' 透传完整 body。
 *   - 11.1.2 xlsx 导出由 __t:'xlsx' 处理（header + send），Controller 不写业务。
 */

const { success, error } = require('../middleware/response');
const { buildListResponse, buildDetailResponse, camelKeys } = require('../utils/commonResponse');

const cycleService = require('../services/assessmentMonthlyCycleService');
const targetService = require('../services/assessmentMonthlyTargetService');
const metricService = require('../services/assessmentMonthlyMetricService');
const scoringService = require('../services/assessmentMonthlyScoringService');
const deductionService = require('../services/assessmentMonthlyDeductionService');
const chainService = require('../services/assessmentMonthlyChainService');
const freezeService = require('../services/assessmentMonthlyFreezeService');
const resultService = require('../services/assessmentMonthlyResultService');
const exportService = require('../services/assessmentMonthlyExportService');
const standardService = require('../services/assessmentMonthlyStandardService');
const healthService = require('../services/assessmentMonthlyHealthService');
const shared = require('../services/assessmentMonthlyShared');

/** 统一解释 service 返回描述符 → 对外响应 */
function respond(req, res, r) {
  if (r == null) return res.status(500).json(error(-1, '服务无返回'));
  switch (r.__t) {
    case 'list':
      return buildListResponse(res, r.list, r.total, r.page, r.pageSize, r.message, { camelCase: r.camelCase });
    case 'detail':
      return buildDetailResponse(res, r.data, r.message, { camelCase: r.camelCase });
    case 'json':
      return res.json(success(r.payload, r.message));
    case 'error':
      return res.json(error(r.code, r.message, r.data));
    case 'raw':
      return res.json(r.body);
    case 'xlsx':
      res.setHeader('Content-Type', r.contentType);
      res.setHeader('Content-Disposition', r.contentDisposition);
      return res.send(r.buffer);
    default:
      return res.json(success(r.payload ?? null, r.message));
  }
}

async function run(req, res, fn) {
  try {
    const r = await fn();
    respond(req, res, r);
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

// ================================================================
//  1. 考核周期
// ================================================================
async function createCycle(req, res) { return run(req, res, () => cycleService.createCycle(shared.getUserInfo(req), req.body)); }
async function autoGenerateCycle(req, res) { return run(req, res, () => cycleService.autoGenerateCycle(shared.getUserInfo(req), req.body)); }
async function listCycles(req, res) { return run(req, res, () => cycleService.listCycles(req.query)); }
async function getCycle(req, res) { return run(req, res, () => cycleService.getCycle(req.params.id)); }
async function updateCycle(req, res) { return run(req, res, () => cycleService.updateCycle(shared.getUserInfo(req), req.params.id, req.body)); }
async function deleteCycle(req, res) { return run(req, res, () => cycleService.deleteCycle(shared.getUserInfo(req), req.params.id)); }
async function startCycle(req, res) { return run(req, res, () => cycleService.startCycle(shared.getUserInfo(req), req.params.id)); }

// ================================================================
//  2. 考核对象
// ================================================================
async function listTargets(req, res) { return run(req, res, () => targetService.listTargets(req.params.id, req.query)); }
async function getTarget(req, res) { return run(req, res, () => targetService.getTarget(req.params.id)); }
async function syncTargets(req, res) { return run(req, res, () => targetService.syncTargets(shared.getUserInfo(req), req.params.id)); }
async function addTargets(req, res) { return run(req, res, () => targetService.addTargets(shared.getUserInfo(req), req.params.id, req.body)); }
async function removeTarget(req, res) { return run(req, res, () => targetService.removeTarget(shared.getUserInfo(req), req.params.id)); }

// ================================================================
//  3. 考核指标
// ================================================================
async function listMetrics(req, res) { return run(req, res, () => metricService.listMetrics(req.query)); }
async function getMetric(req, res) { return run(req, res, () => metricService.getMetric(req.params.id)); }

// ================================================================
//  4. 评分引擎
// ================================================================
async function executeScoring(req, res) { return run(req, res, () => scoringService.executeScoring(shared.getUserInfo(req), req.body)); }
async function getScoringProgress(req, res) { return run(req, res, () => scoringService.getScoringProgress(req.params.cycleId)); }
async function recalculateScoring(req, res) { return run(req, res, () => scoringService.recalculateScoring(shared.getUserInfo(req), req.body)); }

// ================================================================
//  5. 扣分明细
// ================================================================
async function listDeductions(req, res) { return run(req, res, () => deductionService.listDeductions(req.query)); }
async function getDeduction(req, res) { return run(req, res, () => deductionService.getDeduction(req.params.id)); }
async function createDeduction(req, res) { return run(req, res, () => deductionService.createDeduction(shared.getUserInfo(req), req.body)); }
async function updateDeduction(req, res) { return run(req, res, () => deductionService.updateDeduction(shared.getUserInfo(req), req.params.id, req.body)); }
async function deleteDeduction(req, res) { return run(req, res, () => deductionService.deleteDeduction(shared.getUserInfo(req), req.params.id)); }

// ================================================================
//  6. 扣分审核
// ================================================================
async function approveDeduction(req, res) { return run(req, res, () => deductionService.approveDeduction(shared.getUserInfo(req), req.body)); }
async function rejectDeduction(req, res) { return run(req, res, () => deductionService.rejectDeduction(shared.getUserInfo(req), req.body)); }
async function batchApproveDeductions(req, res) { return run(req, res, () => deductionService.batchApproveDeductions(shared.getUserInfo(req), req.body)); }

// ================================================================
//  7. 扣分调整
// ================================================================
async function adjustDeduction(req, res) { return run(req, res, () => deductionService.adjustDeduction(shared.getUserInfo(req), req.body)); }
async function unlockDeduction(req, res) { return run(req, res, () => deductionService.unlockDeduction(shared.getUserInfo(req), req.params.id)); }
async function listAdjustments(req, res) { return run(req, res, () => deductionService.listAdjustments(req.params.id)); }

// ================================================================
//  8. 三违责任传导
// ================================================================
async function generateChain(req, res) { return run(req, res, () => chainService.generateChain(shared.getUserInfo(req), req.body)); }
async function listChainRelations(req, res) { return run(req, res, () => chainService.listChainRelations(req.query)); }

// ================================================================
//  9. 冻结管理
// ================================================================
async function freezeCycle(req, res) { return run(req, res, () => freezeService.freezeCycle(shared.getUserInfo(req), req.params.id)); }
async function unfreezeCycle(req, res) { return run(req, res, () => freezeService.unfreezeCycle(shared.getUserInfo(req), req.body)); }

// ================================================================
//  10. 结果查询
// ================================================================
async function listResults(req, res) { return run(req, res, () => resultService.listResults(req.query)); }
async function getResult(req, res) { return run(req, res, () => resultService.getResult(req.params.targetId)); }
async function listRanking(req, res) { return run(req, res, () => resultService.listRanking(req.query)); }

// ================================================================
//  11. 导入导出
// ================================================================
async function exportResults(req, res) { return run(req, res, () => exportService.exportResults(req.params.cycleId)); }
async function getTargetDeductions(req, res) { return run(req, res, () => exportService.getTargetDeductions(req.params.cycleId, req.params.targetId)); }
async function exportScoring(req, res) { return run(req, res, () => exportService.exportScoring(req.params.cycleId)); }
async function importDeductions(req, res) { return run(req, res, () => exportService.importDeductions(shared.getUserInfo(req), req.body)); }

// ================================================================
//  12. 考核标准
// ================================================================
async function listStandards(req, res) { return run(req, res, () => standardService.listStandards(req.query)); }
async function updateStandard(req, res) { return run(req, res, () => standardService.updateStandard(shared.getUserInfo(req), req.params.id, req.body)); }

// ================================================================
//  13. 健康检查
// ================================================================
async function checkHealth(req, res) { return run(req, res, () => healthService.checkHealth()); }

module.exports = {
  // 1 cycles
  createCycle, autoGenerateCycle, listCycles, getCycle, updateCycle, deleteCycle, startCycle,
  // 2 targets
  listTargets, getTarget, syncTargets, addTargets, removeTarget,
  // 3 metrics
  listMetrics, getMetric,
  // 4 scoring
  executeScoring, getScoringProgress, recalculateScoring,
  // 5 deductions
  listDeductions, getDeduction, createDeduction, updateDeduction, deleteDeduction,
  // 6 review
  approveDeduction, rejectDeduction, batchApproveDeductions,
  // 7 adjust
  adjustDeduction, unlockDeduction, listAdjustments,
  // 8 chain
  generateChain, listChainRelations,
  // 9 freeze
  freezeCycle, unfreezeCycle,
  // 10 results
  listResults, getResult, listRanking,
  // 11 export/import
  exportResults, getTargetDeductions, exportScoring, importDeductions,
  // 12 standards
  listStandards, updateStandard,
  // 13 health
  checkHealth,
  // helpers (for route bind + parity)
  respond, run, camelKeys,
};