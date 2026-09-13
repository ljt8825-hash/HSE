/**
 * 事故管理模块（/api/accidents）—— 薄 controller
 * 仅做 req 解析 + 调 service + res 包装；业务规则与 SQL 全在 services/accidentService.js。
 * 各 service 返回统一描述符（__t: json / list / csv / not-found / validation-error），
 * 由 respond() 统一解释为对外 JSON 契约，保持与原 routes/accidents.js 一致。
 */

const { success, error } = require('../middleware/response');
const {
  buildListResponse,
  sendNotFound,
  sendValidationError,
} = require('../utils/commonResponse');
const { getFileUrl, fixFilenameEncoding } = require('../middleware/upload');
const service = require('../services/accidentService');

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
//  GET 系列
// ================================================================
async function statsAll(req, res) {
  return run(req, res, () => service.accidentStatsAll());
}
async function statsYearly(req, res) {
  return run(req, res, () => service.accidentStatsYearly(req.query.year));
}
async function unsettled(req, res) {
  return run(req, res, () => service.accidentUnsettled());
}
async function statsLegacy(req, res) {
  return run(req, res, () => service.accidentStatsLegacy());
}
async function exportCsv(req, res) {
  return run(req, res, () => service.accidentExport());
}
async function list(req, res) {
  return run(req, res, () => service.accidentList(req.query));
}
async function teams(req, res) {
  return run(req, res, () => service.accidentTeams(req.query));
}
async function personnelSearch(req, res) {
  return run(req, res, () => service.accidentPersonnelSearch(req.query));
}
async function suggestTeam(req, res) {
  return run(req, res, () => service.accidentSuggestTeam(req.query));
}
async function categoryNature(req, res) {
  return run(req, res, () => service.accidentCategoryNature());
}
async function suggestParty(req, res) {
  return run(req, res, () => service.accidentSuggestParty(req.query));
}
async function detail(req, res) {
  return run(req, res, () => service.accidentDetail(req.params.id));
}
async function attachments(req, res, next) {
  return run(req, res, () => service.accidentAttachments(req.params.id, req.query.version), next);
}
async function versions(req, res, next) {
  return run(req, res, () => service.accidentVersions(req.params.id), next);
}

// ================================================================
//  写操作系列
// ================================================================
async function create(req, res) {
  return run(req, res, () => service.accidentCreate(req.body, auditCtx(req)));
}
async function update(req, res) {
  return run(req, res, () => service.accidentUpdate(req.params.id, req.body, auditCtx(req)));
}
async function remove(req, res) {
  return run(req, res, () => service.accidentDelete(req.params.id, auditCtx(req)));
}
async function uploadAttachment(req, res, next) {
  return run(req, res, () => {
    const file = req.file || null;
    return service.accidentUploadAttachment({
      id: req.params.id,
      body: req.body,
      file,
      fileUrl: file ? getFileUrl(req, file.filename, 'documents') : null,
      originalName: file ? fixFilenameEncoding(file.originalname) : '',
      audit: auditCtx(req),
    });
  }, next);
}
async function deleteAttachment(req, res, next) {
  return run(req, res, () => service.accidentDeleteAttachment(req.params.id, req.params.aid, auditCtx(req)), next);
}

module.exports = {
  statsAll,
  statsYearly,
  unsettled,
  statsLegacy,
  exportCsv,
  list,
  teams,
  personnelSearch,
  suggestTeam,
  categoryNature,
  suggestParty,
  detail,
  create,
  update,
  remove,
  attachments,
  uploadAttachment,
  deleteAttachment,
  versions,
};