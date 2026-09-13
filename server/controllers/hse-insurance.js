/**
 * 保险模块（/api/insurance）—— 薄 controller
 * 仅做 req 解析 + 调 service + res 包装；业务规则与 SQL 全在 services/insurance*.js。
 * 各 service 返回统一描述符（__t: list / json / csv / not-found / http-error / stream-file / error / audit-then-json），
 * 由 respond() 统一解释为对外 JSON 契约，保持与原 routes/insurance.js 一致。
 *
 * 已知与原实现差异（详见交付报告）：原 vehicle 写接口在 DB/内存成功分支调用了未 import 的
 * auditLog(...)（routes/audit.js 的 module 导出，本文件从未 require），触发 ReferenceError 后落入
 * 外层 catch 返回错误。此处 audit-then-json 直接返回既定 success 载荷，修复合理解析（不再抛错）。
 */

const { success, error } = require('../middleware/response');
const { auditLog } = require('../routes/audit');
const { buildListResponse, sendNotFound } = require('../utils/commonResponse');
const { getFileUrl, fixFilenameEncoding } = require('../middleware/upload');
const { streamInsuranceFile } = require('../services/insuranceShared');
const { personnelImportRowSchema } = require('../schemas/insurance');

const vehicleService = require('../services/insuranceVehicleService');
const personnelService = require('../services/insurancePersonnelService');
const overageService = require('../services/insuranceOverageService');
const attachmentService = require('../services/insuranceAttachmentService');
const otherService = require('../services/insuranceOtherService');
const policyService = require('../services/insurancePolicyService');
const statsService = require('../services/insuranceStatsService');
const policyReadService = require('../services/insurancePolicyReadService');

/** 统一解释 service 返回描述符 → 对外响应 */
function respond(req, res, r) {
  if (r == null) return res.status(500).json(error(-1, '服务无返回'));
  switch (r.__t) {
    case 'list':
      if (r.error) return res.json(error(r.error.code, r.error.message, r.error.data));
      return buildListResponse(res, r.list, r.total, r.page, r.pageSize, r.message);
    case 'json':
      if (r.error) return res.json(error(r.error.code, r.error.message, r.error.data));
      // 部分端点原实现不带 message（如 departments → success({departments})），以 empty 标记
      return r.empty ? res.json(success(r.payload)) : res.json(success(r.payload, r.message));
    case 'csv': {
      if (r.writeHeaders) {
        for (const [k, v] of Object.entries(r.writeHeaders)) res.setHeader(k, v);
      } else {
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        if (r.contentDisposition) res.setHeader('Content-Disposition', r.contentDisposition);
      }
      return res.send(r.csv);
    }
    case 'not-found':
      return sendNotFound(res, r.message || '记录不存在');
    case 'http-error':
      return res.status(r.status).json(error(r.status, r.message));
    case 'stream-file':
      return streamInsuranceFile(res, r.fileName, { dispositionName: r.dispositionName });
    case 'error':
      return res.json(error(r.code, r.message));
    case 'audit-then-json':
      // 补回审计链：原 routes/insurance.js 的 vehicle 写接口意图记录 sys_operation_log，
      // 但 auditLog 从未被 require，属幽灵引用（写库后立即 ReferenceError，前端收到失败）。
      // 此处按原签名落库审计（fire-and-forget，与原 .catch(()=>{}) 语义一致）。
      try {
        const u = req.user || {};
        auditLog({
          userId: u.id,
          username: u.username,
          ip: req.ip,
          action: r.audit && r.audit.action,
          module: r.audit && r.audit.module,
          description: r.audit && r.audit.description,
        }).catch(() => {});
      } catch (_e) { /* 审计失败不阻塞主流程 */
      }
      return res.json(success(r.payload, r.message));
    default:
      return res.json(success(r.payload ?? null, r.message));
  }
}

/** 附件/版本类端点异常交给 express next（与原文案一致推进错误中间件） */
async function run(req, res, fn, userField, next) {
  try {
    const r = await fn();
    respond(req, res, r);
  } catch (err) {
    if (next) return next(err);
    res.json(error(-1, err.message));
  }
}

// ================================================================
//  /vehicle
// ================================================================
async function listVehicles(req, res) { return run(req, res, () => vehicleService.listVehicles(req.query)); }
async function vehicleStats(req, res) { return run(req, res, () => vehicleService.vehicleStats()); }
async function importVehicles(req, res) { return run(req, res, () => vehicleService.importVehicles(req.body)); }
async function exportVehicles(req, res) { return run(req, res, () => vehicleService.exportVehicles()); }
async function getVehicle(req, res) { return run(req, res, () => vehicleService.getVehicle(req.params.id)); }
async function createVehicle(req, res) { return run(req, res, () => vehicleService.createVehicle(req.body)); }
async function updateVehicle(req, res) { return run(req, res, () => vehicleService.updateVehicle(req.params.id, req.body)); }
async function deleteVehicle(req, res) { return run(req, res, () => vehicleService.deleteVehicle(req.params.id)); }

// ================================================================
//  /personnel
// ================================================================
async function listPersonnel(req, res) { return run(req, res, () => personnelService.listPersonnel(req.query)); }
async function personnelStats(req, res) { return run(req, res, () => personnelService.personnelStats()); }
async function personnelDepartments(req, res) { return run(req, res, () => personnelService.departments()); }
async function syncFromRoster(req, res) { return run(req, res, () => personnelService.syncFromRoster(req.body && req.body.employeeIds)); }
async function jobTypeStats(req, res) { return run(req, res, () => personnelService.jobTypeStats()); }
async function expiringSoon(req, res) { return run(req, res, () => personnelService.expiringSoon(req.query)); }
async function batchRenewal(req, res) { return run(req, res, () => personnelService.batchRenewal(req.body)); }
async function batchDelete(req, res) { return run(req, res, () => personnelService.batchDelete(req.body)); }
async function importPersonnel(req, res) { return run(req, res, () => personnelService.importPersonnel({ body: req.body, personnelImportRowSchema })); }
async function exportPersonnel(req, res) { return run(req, res, () => personnelService.exportPersonnel()); }
async function personnelUnmatched(req, res) { return run(req, res, () => personnelService.unmatched(req.query)); }
async function matchRule(req, res) { return run(req, res, () => personnelService.matchRule(req.query)); }
async function pendingList(req, res) { return run(req, res, () => personnelService.pendingList(req.query)); }
async function generateFromPending(req, res) { return run(req, res, () => personnelService.generateFromPending(req.body)); }
async function getPersonnel(req, res) { return run(req, res, () => personnelService.getPersonnel(req.params.id)); }
async function createPersonnel(req, res) { return run(req, res, () => personnelService.createPersonnel(req.body)); }
async function updatePersonnel(req, res) { return run(req, res, () => personnelService.updatePersonnel(req.params.id, req.body)); }
async function deletePersonnel(req, res) { return run(req, res, () => personnelService.deletePersonnel(req.params.id)); }

// ================================================================
//  /overage
// ================================================================
async function listOverage(req, res) { return run(req, res, () => overageService.listOverage(req.query)); }
async function exportOverage(req, res) { return run(req, res, () => overageService.exportOverage()); }
async function getOverage(req, res) { return run(req, res, () => overageService.getOverage(req.params.id)); }
async function createOverage(req, res) { return run(req, res, () => overageService.createOverage(req.body)); }
async function updateOverage(req, res) { return run(req, res, () => overageService.updateOverage(req.params.id, req.body)); }
async function deleteOverage(req, res) { return run(req, res, () => overageService.deleteOverage(req.params.id)); }

// ================================================================
//  通用附件/版本（next 异常推进）
// ================================================================
async function listAttachments(req, res, next) {
  return run(req, res, () => attachmentService.listAttachments(req.params.bizType, req.params.id), null, next);
}
async function uploadAttachment(req, res, next) {
  const file = req.file ? {
    filename: req.file.filename,
    originalName: fixFilenameEncoding(req.file.originalname),
    size: req.file.size,
    fileUrl: getFileUrl(req, req.file.filename, 'documents'),
  } : null;
  return run(req, res, () => attachmentService.uploadAttachment(req.params.bizType, req.params.id, file, req.body), null, next);
}
async function deleteAttachment(req, res, next) {
  return run(req, res, () => attachmentService.deleteAttachment(req.params.bizType, req.params.id, req.params.aid), null, next);
}
async function listVersions(req, res, next) {
  return run(req, res, () => attachmentService.listVersions(req.params.bizType, req.params.id), null, next);
}

// ================================================================
//  /other
// ================================================================
async function listOther(req, res) { return run(req, res, () => otherService.listOther(req.query)); }
async function otherStats(req, res) { return run(req, res, () => otherService.otherStats()); }
async function createOther(req, res) { return run(req, res, () => otherService.createOther(req.body)); }
async function updateOther(req, res) { return run(req, res, () => otherService.updateOther(req.params.id, req.body)); }
async function deleteOther(req, res) { return run(req, res, () => otherService.deleteOther(req.params.id)); }
async function importOtherPdf(req, res) {
  const file = req.file || null;
  return run(req, res, () => otherService.importOtherPdf(file));
}

// ================================================================
//  /policies
// ================================================================
async function listPolicies(req, res) { return run(req, res, () => policyService.listPolicies(req.query)); }
async function importPolicyPdf(req, res) {
  const file = req.file || null;
  return run(req, res, () => policyService.importPolicyPdf(file, req.body || {}));
}
async function deletePolicy(req, res) { return run(req, res, () => policyService.deletePolicy(req.params.id)); }
async function updatePolicy(req, res) { return run(req, res, () => policyService.updatePolicy(req.params.id, req.body)); }

// ================================================================
//  /stats/overview
// ================================================================
async function overviewStats(req, res) { return run(req, res, () => statsService.overViewStats()); }

// ================================================================
//  受保护保单文件读取
// ================================================================
async function readPolicyFile(req, res) { return run(req, res, () => policyReadService.readPolicyFile(req.params.id)); }
async function readOtherFile(req, res) { return run(req, res, () => policyReadService.readOtherFile(req.params.id)); }

module.exports = {
  // vehicle
  listVehicles, vehicleStats, importVehicles, exportVehicles, getVehicle, createVehicle, updateVehicle, deleteVehicle,
  // personnel
  listPersonnel, personnelStats, personnelDepartments, syncFromRoster, jobTypeStats, expiringSoon,
  batchRenewal, batchDelete, importPersonnel, exportPersonnel, personnelUnmatched, matchRule,
  pendingList, generateFromPending, getPersonnel, createPersonnel, updatePersonnel, deletePersonnel,
  // overage
  listOverage, exportOverage, getOverage, createOverage, updateOverage, deleteOverage,
  // attachments
  listAttachments, uploadAttachment, deleteAttachment, listVersions,
  // other
  listOther, otherStats, createOther, updateOther, deleteOther, importOtherPdf,
  // policies
  listPolicies, importPolicyPdf, deletePolicy, updatePolicy,
  // overview
  overviewStats,
  // policy read
  readPolicyFile, readOtherFile,
  _respond: respond,
};