/**
 * 制度标准（/api/standards）—— 薄 controller
 * 仅做 req 解析 + 调 service + res 包装；业务规则与 SQL 全在 services/standardsService.js。
 * 各 service 返回统一描述符（__t:'json'），由 respond() 统一解释为对外契约，
 * 行为与原 routes/standards.js 一致（标准 success/error 包装，恒 HTTP 200）。
 *
 * 描述符语义：
 *  - json：{ __t:'json', payload, message } 成功 → res.json(success(payload, message))
 *           { __t:'json', error:{code,message} } 业务错误 → res.json(error(code, message))
 *    本模块所有响应均恒 HTTP 200（等价原 res.json(...)），仅当 descriptor 携带 httpStatus
 *    时设置状态码（本模块不会触发，保留分支与 violation 域一致）。
 *
 * 执行包裹：
 *  - run()：catch 归一为 res.json(error(-1, err.message))（HTTP 200）——
 *    原文件所有端点外层 catch 均为 `res.json(error(-1, e.message))`（真实错误信息），
 *    故用 run() 直接传 err.message，无需固定文案。
 *  - 业务内「预期降级分支」（如 clauses 复用已有表）已在 service 层内部处理并返回描述符，
 *    不会抛到 run()。
 */
const { success, error } = require('../middleware/response');
const service = require('../services/standardsService');

/** 统一解释 service 返回描述符 → 对外响应 */
function respond(req, res, r) {
  if (r == null) return res.json(error(-1, '操作失败'));
  if (r.__t === 'json') {
    if (r.error) {
      if (r.httpStatus) res.status(r.httpStatus);
      return res.json(error(r.error.code, r.error.message));
    }
    return res.json(success(r.payload, r.message));
  }
  return res.json(success(r.payload ?? null, r.message));
}

/** 包裹 service 调用：异常 → error(-1, err.message)（HTTP 200，等价原外层 catch） */
async function run(req, res, fn) {
  try {
    respond(req, res, await fn());
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

// ---- 规则与模块信息（同步） ----
const rules = (req, res) => run(req, res, () => service.rules());
const moduleInfo = (req, res) => run(req, res, () => service.moduleInfo());

// ---- 附件通用 ----
const listAttachments = (req, res) => run(req, res, () => service.listAttachments(req.params));
const uploadAttachment = (req, res) => run(req, res, () => service.uploadAttachment(req.params, req.body));
const deleteAttachment = (req, res) => run(req, res, () => service.deleteAttachment(req.params));

// ---- 1. 规章制度 ----
const regulationsStats = (req, res) => run(req, res, () => service.regulationsStats());
const listRegulations = (req, res) => run(req, res, () => service.listRegulations(req.query));
const exportRegulations = (req, res) => run(req, res, () => service.exportRegulations());
const getRegulation = (req, res) => run(req, res, () => service.getRegulation(req.params));
const createRegulation = (req, res) => run(req, res, () => service.createRegulation(req.body));
const updateRegulation = (req, res) => run(req, res, () => service.updateRegulation(req.params, req.body));
const deleteRegulation = (req, res) => run(req, res, () => service.deleteRegulation(req.params));

// ---- 2. 文件库 ----
const libraryStats = (req, res) => run(req, res, () => service.libraryStats());
const listLibrary = (req, res) => run(req, res, () => service.listLibrary(req.query));
const exportLibrary = (req, res) => run(req, res, () => service.exportLibrary());
const getLibraryDoc = (req, res) => run(req, res, () => service.getLibraryDoc(req.params));
const createLibraryDoc = (req, res) => run(req, res, () => service.createLibraryDoc(req.body));
const updateLibraryDoc = (req, res) => run(req, res, () => service.updateLibraryDoc(req.params, req.body));
const deleteLibraryDoc = (req, res) => run(req, res, () => service.deleteLibraryDoc(req.params));

// ---- 3. 文件审核 ----
const reviewsStats = (req, res) => run(req, res, () => service.reviewsStats());
const listReviews = (req, res) => run(req, res, () => service.listReviews(req.query));
const getReview = (req, res) => run(req, res, () => service.getReview(req.params));
const createReview = (req, res) => run(req, res, () => service.createReview(req.body));
const updateReview = (req, res) => run(req, res, () => service.updateReview(req.params, req.body));

// ---- 4. 条款库 ----
const clausesStats = (req, res) => run(req, res, () => service.clausesStats());
const listClauses = (req, res) => run(req, res, () => service.listClauses(req.query));
const exportClauses = (req, res) => run(req, res, () => service.exportClauses());
const getClause = (req, res) => run(req, res, () => service.getClause(req.params));
const createClause = (req, res) => run(req, res, () => service.createClause(req.body));
const updateClause = (req, res) => run(req, res, () => service.updateClause(req.params, req.body));
const deleteClause = (req, res) => run(req, res, () => service.deleteClause(req.params));

// ---- 5. 条款资料关联 ----
const listRelations = (req, res) => run(req, res, () => service.listRelations(req.query));
const createRelations = (req, res) => run(req, res, () => service.createRelations(req.body));
const deleteRelation = (req, res) => run(req, res, () => service.deleteRelation(req.params));

// ---- 6. 匹配建议 ----
const suggestionsStats = (req, res) => run(req, res, () => service.suggestionsStats());
const listSuggestions = (req, res) => run(req, res, () => service.listSuggestions(req.query));
const generateSuggestions = (req, res) => run(req, res, () => service.generateSuggestions());
const handleSuggestion = (req, res) => run(req, res, () => service.handleSuggestion(req.params, req.body));

// ---- 统计总览 ----
const statsOverview = (req, res) => run(req, res, () => service.statsOverview());
const stats = (req, res) => run(req, res, () => service.stats());

module.exports = {
  rules, moduleInfo,
  listAttachments, uploadAttachment, deleteAttachment,
  regulationsStats, listRegulations, exportRegulations, getRegulation, createRegulation, updateRegulation, deleteRegulation,
  libraryStats, listLibrary, exportLibrary, getLibraryDoc, createLibraryDoc, updateLibraryDoc, deleteLibraryDoc,
  reviewsStats, listReviews, getReview, createReview, updateReview,
  clausesStats, listClauses, exportClauses, getClause, createClause, updateClause, deleteClause,
  listRelations, createRelations, deleteRelation,
  suggestionsStats, listSuggestions, generateSuggestions, handleSuggestion,
  statsOverview, stats,
};