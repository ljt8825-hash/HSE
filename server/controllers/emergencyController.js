/**
 * 应急管理模块（/api/emergency）—— 薄 controller
 * 仅做 req 解析 + 调 service + res 包装；业务规则与 SQL 全在 services/emergencyService.js。
 * 各 service 返回统一描述符（__t: json / list / csv / not-found / validation-error），
 * 由 respond() 统一解释为对外 JSON 契约，保持与原 routes/emergency.js 一致。
 *
 * 通用附件 /:bizType/:id/attachments：bizType === 'plans' 时改写 req.url 并 next('route')
 * 委派回已定义的固定 /plans/:id/attachments 路由（原实现即如此，属路由层逻辑，故保留在 controller）。
 */

const { success, error } = require('../middleware/response');
const { buildListResponse, sendNotFound, sendValidationError } = require('../utils/commonResponse');
const { getFileUrl, fixFilenameEncoding } = require('../middleware/upload');
const service = require('../services/emergencyService');

/** 统一解释 service 返回描述符 → 对外响应 */
function respond(req, res, r) {
  if (r == null) return res.status(500).json(error(-1, '服务无返回'));
  switch (r.__t) {
    case 'json':
      if (r.error) return res.json(error(r.error.code, r.error.message, r.error.data));
      return res.json(success(r.payload, r.message));
    case 'list':
      if (r.error) return res.json(error(r.error.code, r.error.message, r.error.data));
      return buildListResponse(res, r.list, r.total, r.page, r.pageSize, r.message);
    case 'csv': {
      for (const [k, v] of Object.entries(r.writeHeaders || {})) res.setHeader(k, v);
      return res.send(r.content);
    }
    case 'not-found':
      return sendNotFound(res, r.message || '记录不存在');
    case 'validation-error':
      return sendValidationError(res, r.message || '参数校验失败');
    default:
      return res.json(success(r.payload ?? null, r.message));
  }
}

/** 包裹 service 调用：业务异常 → 标准 error(-1)（与原各端点 catch 一致） */
async function run(req, res, fn, next) {
  try {
    const r = await fn();
    respond(req, res, r);
  } catch (err) {
    if (next) return next(err);
    res.json(error(-1, '操作失败，请稍后重试'));
  }
}

function auditCtx(req) {
  return { userId: req.user && req.user.id, username: req.user && req.user.username, ip: req.ip };
}

// ================================================================
//  应急预案（/plans）
// ================================================================
async function planStats(req, res) {
  return run(req, res, () => service.planStats());
}
async function planList(req, res) {
  return run(req, res, () => service.planList(req.query));
}
async function planExport(req, res, next) {
  return run(req, res, () => service.planExport(), next);
}
async function planDetail(req, res) {
  return run(req, res, () => service.planDetail(req.params.id));
}
async function planCreate(req, res) {
  return run(req, res, () => service.planCreate(req.body, auditCtx(req)));
}
async function planUpdate(req, res) {
  return run(req, res, () => service.planUpdate(req.params.id, req.body, auditCtx(req)));
}
async function planDelete(req, res) {
  return run(req, res, () => service.planDelete(req.params.id, auditCtx(req)));
}
async function planAttachments(req, res, next) {
  return run(req, res, () => service.planAttachments(req.params.id, req.query), next);
}
async function planUploadAttachment(req, res, next) {
  return run(req, res, () => {
    const file = req.file || null;
    return service.planUploadAttachment({
      id: req.params.id,
      body: req.body,
      file,
      fileUrl: file ? getFileUrl(req, file.filename, 'documents') : null,
      originalName: file ? fixFilenameEncoding(file.originalname) : '',
    });
  }, next);
}
async function planDeleteAttachment(req, res, next) {
  return run(req, res, () => service.planDeleteAttachment(req.params.id, req.params.aid), next);
}
async function planVersions(req, res, next) {
  return run(req, res, () => service.planVersions(req.params.id), next);
}

// ================================================================
//  演练记录（/drills）
// ================================================================
async function drillStats(req, res) {
  return run(req, res, () => service.drillStats());
}
async function drillList(req, res) {
  return run(req, res, () => service.drillList(req.query));
}
async function drillExport(req, res, next) {
  return run(req, res, () => service.drillExport(), next);
}
async function drillDetail(req, res) {
  return run(req, res, () => service.drillDetail(req.params.id));
}
async function drillCreate(req, res) {
  return run(req, res, () => service.drillCreate(req.body, auditCtx(req)));
}
async function drillUpdate(req, res) {
  return run(req, res, () => service.drillUpdate(req.params.id, req.body, auditCtx(req)));
}
async function drillDelete(req, res) {
  return run(req, res, () => service.drillDelete(req.params.id, auditCtx(req)));
}

// ================================================================
//  统计（/stats）
// ================================================================
async function statsOverview(req, res) {
  return run(req, res, () => service.statsOverview());
}
async function statsLegacy(req, res) {
  return run(req, res, () => service.statsLegacy());
}

// ================================================================
//  应急物资（/materials）
// ================================================================
async function materialList(req, res) {
  return run(req, res, () => service.materialList(req.query));
}
async function materialStats(req, res) {
  return run(req, res, () => service.materialStats());
}
async function materialExport(req, res, next) {
  return run(req, res, () => service.materialExport(), next);
}
async function materialDetail(req, res) {
  return run(req, res, () => service.materialDetail(req.params.id));
}
async function materialCreate(req, res) {
  return run(req, res, () => service.materialCreate(req.body, auditCtx(req)));
}
async function materialUpdate(req, res) {
  return run(req, res, () => service.materialUpdate(req.params.id, req.body, auditCtx(req)));
}
async function materialDelete(req, res) {
  return run(req, res, () => service.materialDelete(req.params.id, auditCtx(req)));
}

// ================================================================
//  应急队伍（/teams）
// ================================================================
async function teamList(req, res) {
  return run(req, res, () => service.teamList(req.query));
}
async function teamStats(req, res) {
  return run(req, res, () => service.teamStats());
}
async function teamExport(req, res, next) {
  return run(req, res, () => service.teamExport(), next);
}
async function teamDetail(req, res) {
  return run(req, res, () => service.teamDetail(req.params.id));
}
async function teamCreate(req, res) {
  return run(req, res, () => service.teamCreate(req.body, auditCtx(req)));
}
async function teamUpdate(req, res) {
  return run(req, res, () => service.teamUpdate(req.params.id, req.body, auditCtx(req)));
}
async function teamDelete(req, res) {
  return run(req, res, () => service.teamDelete(req.params.id, auditCtx(req)));
}
async function teamMembers(req, res) {
  return run(req, res, () => service.teamMembers(req.params.id));
}
async function teamGenerate(req, res) {
  return run(req, res, () => service.teamGenerate(auditCtx(req)));
}

// ================================================================
//  应急事件（/events）
// ================================================================
async function eventList(req, res) {
  return run(req, res, () => service.eventList(req.query));
}
async function eventStats(req, res) {
  return run(req, res, () => service.eventStats());
}
async function eventExport(req, res, next) {
  return run(req, res, () => service.eventExport(), next);
}
async function eventDetail(req, res) {
  return run(req, res, () => service.eventDetail(req.params.id));
}
async function eventCreate(req, res) {
  return run(req, res, () => service.eventCreate(req.body, auditCtx(req)));
}
async function eventUpdate(req, res) {
  return run(req, res, () => service.eventUpdate(req.params.id, req.body, auditCtx(req)));
}
async function eventDelete(req, res) {
  return run(req, res, () => service.eventDelete(req.params.id, auditCtx(req)));
}

// ================================================================
//  通用附件（/:bizType/:id/attachments）—— 置于所有固定路径之后
//  保留原实现的路由层逻辑：bizType 白名单校验 + plans 重定向委派回固定路由
// ================================================================
async function attachmentsByBiz(req, res, next) {
  const { bizType, id } = req.params;
  if (!service.VALID_BIZ_TYPES.includes(bizType)) return res.json(error(-1, '无效的业务类型'));
  if (bizType === 'plans') {
    req.url = `/plans/${id}/attachments`;
    req.params = { id };
    return next('route');
  }
  return run(req, res, () => service.getBizAttachments(bizType, id), next);
}

async function uploadAttachmentByBiz(req, res, next) {
  const { bizType, id } = req.params;
  if (!service.VALID_BIZ_TYPES.includes(bizType)) return res.json(error(-1, '无效的业务类型'));
  if (!req.file) return res.json(error(-1, '请上传文件'));
  if (bizType === 'plans') {
    req.url = `/plans/${id}/attachments`;
    req.params = { id };
    return next('route');
  }
  return run(req, res, () => {
    const file = req.file || null;
    const { uploaded_by = 'admin' } = req.body;
    return service.uploadBizAttachment({
      bizType,
      id,
      file,
      fileUrl: file ? getFileUrl(req, file.filename, 'documents') : null,
      originalName: file ? fixFilenameEncoding(file.originalname) : '',
      uploaded_by,
    });
  }, next);
}

async function deleteAttachmentByBiz(req, res, next) {
  const { bizType, id, aid } = req.params;
  if (!service.VALID_BIZ_TYPES.includes(bizType)) return res.json(error(-1, '无效的业务类型'));
  if (bizType === 'plans') {
    req.url = `/plans/${id}/attachments/${aid}`;
    req.params = { id, aid };
    return next('route');
  }
  return run(req, res, () => service.deleteBizAttachment(bizType, id, aid), next);
}

module.exports = {
  planStats,
  planList,
  planExport,
  planDetail,
  planCreate,
  planUpdate,
  planDelete,
  planAttachments,
  planUploadAttachment,
  planDeleteAttachment,
  planVersions,
  drillStats,
  drillList,
  drillExport,
  drillDetail,
  drillCreate,
  drillUpdate,
  drillDelete,
  statsOverview,
  statsLegacy,
  materialList,
  materialStats,
  materialExport,
  materialDetail,
  materialCreate,
  materialUpdate,
  materialDelete,
  teamList,
  teamStats,
  teamExport,
  teamDetail,
  teamCreate,
  teamUpdate,
  teamDelete,
  teamMembers,
  teamGenerate,
  eventList,
  eventStats,
  eventExport,
  eventDetail,
  eventCreate,
  eventUpdate,
  eventDelete,
  attachmentsByBiz,
  uploadAttachmentByBiz,
  deleteAttachmentByBiz,
};