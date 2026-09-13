/**
 * 现场管理模块（/api/site-mgmt）—— 薄 controller
 * 仅做 req 解析 + 调 service + res 包装；业务规则与 SQL 全在 services/siteMgmtService.js。
 * 各 service 返回统一描述符（__t: json / list / not-found），由 respond() 统一解释为对外 JSON 契约，
 * 行为与原 routes/site-mgmt.js 一致。
 *
 * service 不触碰 req/res；需要 req.user / req.logger / req.ip 的端点（网格长巡查台账 scope/身份/SQL），
 * 统一经 gridCtx(req) 组装传入。csv 与本单无关。
 */

const { success, error } = require('../middleware/response');
const { buildListResponse, sendNotFound } = require('../utils/commonResponse');
const service = require('../services/siteMgmtService');

/** 统一解释 service 返回描述符 → 对外响应（支持 httpStatus，用于 scope-denied 403 / purge 400 / identity 401/403/409/503） */
function respond(req, res, r) {
  if (r == null) return res.status(500).json(error(-1, '服务无返回'));
  switch (r.__t) {
    case 'json':
      if (r.error) {
        if (r.httpStatus) res.status(r.httpStatus);
        return res.json(error(r.error.code, r.error.message, r.error.data));
      }
      return res.json(success(r.payload, r.message));
    case 'list':
      if (r.error) return res.json(error(r.error.code, r.error.message, r.error.data));
      return buildListResponse(res, r.list, r.total, r.page, r.pageSize, r.message);
    case 'not-found':
      return sendNotFound(res, r.message || '记录不存在');
    default:
      return res.json(success(r.payload ?? null, r.message));
  }
}

/** 包裹 service 调用：业务异常 → 标准 error(-1)（与原各端点 catch 归一） */
async function run(req, res, fn) {
  try {
    const r = await fn();
    respond(req, res, r);
  } catch (err) {
    res.json(error(-1, '操作失败，请稍后重试'));
  }
}

/** 审计元信息（userId / username / ip） */
function auditCtx(req) {
  return { userId: req.user && req.user.id, username: req.user && req.user.username, ip: req.ip };
}

/** 网格长巡查台账业务上下文：scope/身份/SQL 需要 user + logger，审计需要 ip */
function gridCtx(req) {
  return {
    user: req.user || null,
    logger: req.logger || console,
    ip: req.ip,
  };
}

// ================================================================
//  三违管理（/violations）
// ================================================================
async function violationList(req, res) {
  return run(req, res, () => service.violationList(req.query));
}
async function violationDetail(req, res) {
  return run(req, res, () => service.violationDetail(req.params.id));
}
async function violationCreate(req, res) {
  return run(req, res, () => service.violationCreate(req.body, auditCtx(req)));
}
async function violationUpdate(req, res) {
  return run(req, res, () => service.violationUpdate(req.params.id, req.body, auditCtx(req)));
}
async function violationDelete(req, res) {
  return run(req, res, () => service.violationDelete(req.params.id, auditCtx(req)));
}

// ================================================================
//  消防设施管理（/fire-equipment）
// ================================================================
async function fireEquipmentList(req, res) {
  return run(req, res, () => service.fireEquipmentList(req.query));
}
async function fireEquipmentDetail(req, res) {
  return run(req, res, () => service.fireEquipmentDetail(req.params.id));
}
async function fireEquipmentCreate(req, res) {
  return run(req, res, () => service.fireEquipmentCreate(req.body, auditCtx(req)));
}
async function fireEquipmentUpdate(req, res) {
  return run(req, res, () => service.fireEquipmentUpdate(req.params.id, req.body, auditCtx(req)));
}
async function fireEquipmentDelete(req, res) {
  return run(req, res, () => service.fireEquipmentDelete(req.params.id, auditCtx(req)));
}

// ================================================================
//  交通安全评估档案（/driver-assessments）
// ================================================================
async function driverAssessmentList(req, res) {
  return run(req, res, () => service.driverAssessmentList(req.query));
}
async function driverAssessmentDetail(req, res) {
  return run(req, res, () => service.driverAssessmentDetail(req.params.id));
}
async function driverAssessmentCreate(req, res) {
  return run(req, res, () => service.driverAssessmentCreate(req.body, auditCtx(req)));
}
async function driverAssessmentUpdate(req, res) {
  return run(req, res, () => service.driverAssessmentUpdate(req.params.id, req.body, auditCtx(req)));
}
async function driverAssessmentDelete(req, res) {
  return run(req, res, () => service.driverAssessmentDelete(req.params.id, auditCtx(req)));
}
async function driverAssessmentRenumber(req, res) {
  return run(req, res, () => service.driverAssessmentRenumber(auditCtx(req)));
}

// ================================================================
//  驾驶员违章记录（/driver-violations）
// ================================================================
async function driverViolationList(req, res) {
  return run(req, res, () => service.driverViolationList(req.query));
}
async function driverViolationDetail(req, res) {
  return run(req, res, () => service.driverViolationDetail(req.params.id));
}
async function driverViolationCreate(req, res) {
  return run(req, res, () => service.driverViolationCreate(req.body, auditCtx(req)));
}
async function driverViolationUpdate(req, res) {
  return run(req, res, () => service.driverViolationUpdate(req.params.id, req.body, auditCtx(req)));
}
async function driverViolationDelete(req, res) {
  return run(req, res, () => service.driverViolationDelete(req.params.id, auditCtx(req)));
}

// ================================================================
//  三违扣分记录（/driver-three-violations）
// ================================================================
async function driverThreeViolationList(req, res) {
  return run(req, res, () => service.driverThreeViolationList(req.query));
}
async function driverThreeViolationDetail(req, res) {
  return run(req, res, () => service.driverThreeViolationDetail(req.params.id));
}
async function driverThreeViolationCreate(req, res) {
  return run(req, res, () => service.driverThreeViolationCreate(req.body, auditCtx(req)));
}
async function driverThreeViolationUpdate(req, res) {
  return run(req, res, () => service.driverThreeViolationUpdate(req.params.id, req.body, auditCtx(req)));
}
async function driverThreeViolationDelete(req, res) {
  return run(req, res, () => service.driverThreeViolationDelete(req.params.id, auditCtx(req)));
}

// ================================================================
//  驾驶员月度考核（/driver-monthly）
// ================================================================
async function driverMonthlyList(req, res) {
  return run(req, res, () => service.driverMonthlyList(req.query));
}
async function driverMonthlyDetail(req, res) {
  return run(req, res, () => service.driverMonthlyDetail(req.params.id));
}
async function driverMonthlyCreate(req, res) {
  return run(req, res, () => service.driverMonthlyCreate(req.body, auditCtx(req)));
}
async function driverMonthlyUpdate(req, res) {
  return run(req, res, () => service.driverMonthlyUpdate(req.params.id, req.body, auditCtx(req)));
}
async function driverMonthlyDelete(req, res) {
  return run(req, res, () => service.driverMonthlyDelete(req.params.id, auditCtx(req)));
}

// ================================================================
//  网格管理（/grid-areas）
// ================================================================
async function gridAreaList(req, res) {
  return run(req, res, () => service.gridAreaList(req.query));
}
async function gridAreaFilterOptions(req, res) {
  return run(req, res, () => service.gridAreaFilterOptions());
}
async function gridAreaDetail(req, res) {
  return run(req, res, () => service.gridAreaDetail(req.params.id));
}
async function gridAreaCreate(req, res) {
  return run(req, res, () => service.gridAreaCreate(req.body, auditCtx(req)));
}
async function gridAreaUpdate(req, res) {
  return run(req, res, () => service.gridAreaUpdate(req.params.id, req.body, auditCtx(req)));
}
async function gridAreaDelete(req, res) {
  return run(req, res, () => service.gridAreaDelete(req.params.id, auditCtx(req)));
}

// ================================================================
//  网格长巡查台账（/grid-records）—— 受权限保护
// ================================================================
async function gridRecordList(req, res) {
  return run(req, res, () => service.gridRecordList(req.query, gridCtx(req)));
}
async function gridRecordFilterOptions(req, res) {
  return run(req, res, () => service.gridRecordFilterOptions());
}
async function gridRecordUpdate(req, res) {
  return run(req, res, () => service.gridRecordUpdate(req.params.id, req.body, gridCtx(req)));
}
async function gridRecordCreate(req, res) {
  return run(req, res, () => service.gridRecordCreate(req.body, gridCtx(req)));
}
async function gridRecordDelete(req, res) {
  return run(req, res, () => service.gridRecordDelete(req.body, req.query, req.params, gridCtx(req)));
}
async function gridRecordPurge(req, res) {
  return run(req, res, () => service.gridRecordPurge(req.body, gridCtx(req)));
}

// ================================================================
//  统计（/stats）
// ================================================================
async function siteStats(req, res) {
  return run(req, res, () => service.siteStats(req.query));
}

module.exports = {
  violationList,
  violationDetail,
  violationCreate,
  violationUpdate,
  violationDelete,
  fireEquipmentList,
  fireEquipmentDetail,
  fireEquipmentCreate,
  fireEquipmentUpdate,
  fireEquipmentDelete,
  driverAssessmentList,
  driverAssessmentDetail,
  driverAssessmentCreate,
  driverAssessmentUpdate,
  driverAssessmentDelete,
  driverAssessmentRenumber,
  driverViolationList,
  driverViolationDetail,
  driverViolationCreate,
  driverViolationUpdate,
  driverViolationDelete,
  driverThreeViolationList,
  driverThreeViolationDetail,
  driverThreeViolationCreate,
  driverThreeViolationUpdate,
  driverThreeViolationDelete,
  driverMonthlyList,
  driverMonthlyDetail,
  driverMonthlyCreate,
  driverMonthlyUpdate,
  driverMonthlyDelete,
  gridAreaList,
  gridAreaFilterOptions,
  gridAreaDetail,
  gridAreaCreate,
  gridAreaUpdate,
  gridAreaDelete,
  gridRecordList,
  gridRecordFilterOptions,
  gridRecordUpdate,
  gridRecordCreate,
  gridRecordDelete,
  gridRecordPurge,
  siteStats,
};