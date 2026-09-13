/**
 * 培训模块（/api/training）—— 薄 controller
 * 仅做 req 解析 + 调 service + res 包装；业务规则与 SQL 全在 services/training*.js。
 * 各 service 返回统一描述符（__t: list / json / csv / not-found / error），
 * 由 respond() 统一解释为对外 JSON 契约，保持与原 routes/training.js 一致。
 *
 * 与复用参考（hse-insurance.js）一致：CSV / 附件 / 导入端点原 catch 走 next(err)，
 * 此处以 run(..., next) 透传；其余端点原 catch 统一 res.json(error(-1, err.message))，
 * 此处以 run(..., undefined) 复现。
 */

const { success, error } = require('../middleware/response');
const { buildListResponse, sendNotFound } = require('../utils/commonResponse');
const { getFileUrl, fixFilenameEncoding } = require('../middleware/upload');

const recordService = require('../services/trainingRecordService');
const ledgerService = require('../services/trainingLedgerService');
const registerService = require('../services/trainingRegisterService');
const statsService = require('../services/trainingStatsService');
const attachmentService = require('../services/trainingAttachmentService');
const requirementService = require('../services/trainingRequirementService');
const planService = require('../services/trainingPlanService');
const reminderService = require('../services/trainingReminderService');

/** 按原路由响应语义解释 service 返回描述符 → 对外 JSON/CSV */
function respond(req, res, r) {
  if (r == null) return res.status(500).json(error(-1, '服务无返回'));
  switch (r.__t) {
    case 'list':
      if (r.error) return res.json(error(r.error.code, r.error.message, r.error.data));
      return buildListResponse(res, r.list, r.total, r.page, r.pageSize, r.message);
    case 'json':
      if (r.error) return res.json(error(r.error.code, r.error.message, r.error.data));
      return res.json(success(r.payload, r.message));
    case 'csv':
      // 与原 sendTrainingCsvExport/user summary export 一致：Content-Type + Content-Disposition + send
      res.setHeader('Content-Type', r.contentType || 'text/csv; charset=utf-8');
      if (r.contentDisposition) res.setHeader('Content-Disposition', r.contentDisposition);
      return res.send(r.csv);
    case 'not-found':
      return sendNotFound(res, r.message || '记录不存在');
    case 'error':
      return res.json(error(r.code, r.message));
    default:
      return res.json(success(r.payload ?? null, r.message));
  }
}

/**
 * 执行 service 并交互。传 next 时异常走错误中间件（CSV/附件/导入例外端点），
 * 否则按原实现 res.json(error(-1, err.message))。
 */
async function run(req, res, fn, next) {
  try {
    const r = await fn();
    respond(req, res, r);
  } catch (err) {
    if (next) return next(err);
    res.json(error(-1, err.message));
  }
}

// ================================================================
//  /records（GET 列表 / export / :id / POST / PUT / DELETE）
// ================================================================
async function listRecords(req, res) { return run(req, res, () => recordService.listRecords(req.query)); }
async function exportRecords(req, res, next) { return run(req, res, () => recordService.exportRecords(), next); }
async function getRecord(req, res) { return run(req, res, () => recordService.getRecord(req.params.id)); }
async function createRecord(req, res) { return run(req, res, () => recordService.createRecord(req.body)); }
async function updateRecord(req, res) { return run(req, res, () => recordService.updateRecord(req.params.id, req.body)); }
async function deleteRecord(req, res) { return run(req, res, () => recordService.deleteRecord(req.params.id)); }

// ================================================================
//  /ledger（台账导出 / 月份 / 月度汇总 + export / 导入 / 明细 / 下拉 / 未培训）
// ================================================================
async function exportLedger(req, res, next) { return run(req, res, () => ledgerService.exportLedger(), next); }
async function getLedgerMonths(req, res) { return run(req, res, () => ledgerService.getLedgerMonths()); }
async function getPersonnelSummary(req, res) { return run(req, res, () => ledgerService.getPersonnelSummary(req.query.month)); }
async function exportPersonnelSummary(req, res, next) { return run(req, res, () => ledgerService.exportPersonnelSummary(req.query.month), next); }
async function importMonthlyLedger(req, res, next) { return run(req, res, () => ledgerService.importMonthlyLedger(req.file || null, req.body && req.body.month), next); }
async function getPersonnelRecords(req, res) {
  return run(req, res, () => ledgerService.getPersonnelRecords(req.params.employeeId, req.query.month, req.query.page || 1, req.query.pageSize || 20));
}
async function getPlanContentOptions(req, res) { return run(req, res, () => ledgerService.getPlanContentOptions(req.query)); }
async function getTrainingTypeOptions(req, res) { return run(req, res, () => ledgerService.getTrainingTypeOptions()); }
async function getUntrained(req, res) { return run(req, res, () => ledgerService.getUntrained(req.params.employeeId, req.query.month)); }

// ================================================================
//  /ledger/signin & /ledger/personnel-summary/batch-*（签到登记 / 批量）
// ================================================================
async function recognize(req, res) { return run(req, res, () => registerService.recognize(req.body || {})); }
async function confirm(req, res) { return run(req, res, () => registerService.confirm(req.body || {})); }
async function batchCreate(req, res) { return run(req, res, () => registerService.batchCreate(req.body)); }
async function batchDelete(req, res) { return run(req, res, () => registerService.batchDelete(req.body)); }

// ================================================================
//  /stats & /stats/enhanced
// ================================================================
async function getStats(req, res) { return run(req, res, () => statsService.getStats()); }
async function getStatsEnhanced(req, res) { return run(req, res, () => statsService.getStatsEnhanced()); }

// ================================================================
//  /records/:id/attachments & /records/:id/versions（异常走 next）
// ================================================================
async function listAttachments(req, res, next) {
  return run(req, res, () => attachmentService.listAttachments(req.params.id, req.query.version), next);
}
async function uploadAttachment(req, res, next) {
  const file = req.file ? {
    filename: req.file.filename,
    originalName: fixFilenameEncoding(req.file.originalname),
    size: req.file.size,
    fileUrl: getFileUrl(req, req.file.filename, 'documents'),
  } : null;
  return run(req, res, () => attachmentService.uploadAttachment(req.params.id, file, req.body), next);
}
async function deleteAttachment(req, res, next) {
  return run(req, res, () => attachmentService.deleteAttachment(req.params.id, req.params.aid), next);
}
async function listVersions(req, res, next) {
  return run(req, res, () => attachmentService.listVersions(req.params.id), next);
}

// ================================================================
//  /requirements（Sprint5.10）
// ================================================================
async function listRequirements(req, res) { return run(req, res, () => requirementService.listRequirements(req.query)); }
async function getRequirement(req, res) { return run(req, res, () => requirementService.getRequirement(req.params.id)); }
async function createRequirement(req, res) { return run(req, res, () => requirementService.createRequirement(req.body)); }
async function updateRequirement(req, res) { return run(req, res, () => requirementService.updateRequirement(req.params.id, req.body)); }
async function deleteRequirement(req, res) { return run(req, res, () => requirementService.deleteRequirement(req.params.id)); }

// ================================================================
//  /plans（含 /plans/:id/execute）
// ================================================================
async function listPlans(req, res) { return run(req, res, () => planService.listPlans(req.query)); }
async function getPlan(req, res) { return run(req, res, () => planService.getPlan(req.params.id)); }
async function createPlan(req, res) { return run(req, res, () => planService.createPlan(req.body)); }
async function updatePlan(req, res) { return run(req, res, () => planService.updatePlan(req.params.id, req.body)); }
async function deletePlan(req, res) { return run(req, res, () => planService.deletePlan(req.params.id)); }
async function executePlan(req, res) { return run(req, res, () => planService.executePlan(req.params.id, req.body)); }

// ================================================================
//  /reminders/* & /analysis/enhanced
// ================================================================
async function getExpiryReminders(req, res) { return run(req, res, () => reminderService.getExpiryReminders(req.query.days)); }
async function getNewEmployeeReminders(req, res) { return run(req, res, () => reminderService.getNewEmployeeReminders()); }
async function getAnalysisEnhanced(req, res) { return run(req, res, () => reminderService.getAnalysisEnhanced()); }

module.exports = {
  // records
  listRecords, exportRecords, getRecord, createRecord, updateRecord, deleteRecord,
  // ledger
  exportLedger, getLedgerMonths, getPersonnelSummary, exportPersonnelSummary, importMonthlyLedger,
  getPersonnelRecords, getPlanContentOptions, getTrainingTypeOptions, getUntrained,
  // register
  recognize, confirm, batchCreate, batchDelete,
  // stats
  getStats, getStatsEnhanced,
  // attachments / versions
  listAttachments, uploadAttachment, deleteAttachment, listVersions,
  // requirements
  listRequirements, getRequirement, createRequirement, updateRequirement, deleteRequirement,
  // plans
  listPlans, getPlan, createPlan, updatePlan, deletePlan, executePlan,
  // reminders / analysis
  getExpiryReminders, getNewEmployeeReminders, getAnalysisEnhanced,
  _respond: respond,
};