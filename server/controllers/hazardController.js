/**
 * 隐患排查治理（/api/hazards）—— 薄 controller
 * 仅做 req 解析 + 调 service + res 包装；业务规则与 SQL 全在 services/hazardService.js。
 * 各 service 返回统一描述符（__t:'json' / __t:'csv'），由 respond() 统一解释为对外契约，
 * 行为与原 routes/hazards.js 一致。
 *
 * 描述符语义：
 *  - json：{ __t:'json', payload, message } 成功；{ __t:'json', error:{code,message} } 业务错误。
 *    本模块所有响应均为 HTTP 200（等价原 res.json(success/error)/sendNotFound），仅在 descriptor 携带 httpStatus 时设置状态码（本模块不会触发）。
 *  - csv：{ __t:'csv', csv } → 设置 text/csv 头并 res.send（等价原 sendHazardCsvExport 的 res 写逻辑）。
 *
 * 双执行包裹：
 *  - run()：catch 归一为 res.json(error(-1, err.message))（HTTP 200）——对应原 catch 为 res.json(error(-1,...)) 的端点。
 *  - runNext()：catch 委托 next(err)——对应原 catch 为 next(err) 的端点（关联风险点/导出/附件/版本）。
 */

const { success, error } = require('../middleware/response');
const service = require('../services/hazardService');

/** 统一解释 service 返回描述符 → 对外响应 */
function respond(req, res, r) {
  if (r == null) return res.json(error(-1, '服务无返回'));
  if (r.__t === 'json') {
    if (r.error) {
      if (r.httpStatus) res.status(r.httpStatus);
      return res.json(error(r.error.code, r.error.message));
    }
    return res.json(success(r.payload, r.message));
  }
  if (r.__t === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    const fname = `hazards_${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
    return res.send(r.csv);
  }
  return res.json(success(r.payload ?? null, r.message));
}

/** 包裹 service 调用：业务异常 → error(-1)（HTTP 200，等价原 res.json(error(-1, e.message)) 的 catch） */
async function run(req, res, fn) {
  try {
    const r = await fn();
    respond(req, res, r);
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

/** 包裹 service 调用：异常委托 next(err)（对应原关联风险点/导出/附件/版本端点的 next(err) catch） */
async function runNext(req, res, next, fn) {
  try {
    const r = await fn();
    respond(req, res, r);
  } catch (err) {
    next(err);
  }
}

// ---- 列表与统计（run）----
const list = (req, res) => run(req, res, () => service.list(req.query));
const stats = (req, res) => run(req, res, () => service.stats());

// ---- 关联风险点 / 导出（runNext）----
const relatedRisk = (req, res, next) => runNext(req, res, next, () => service.relatedRisk(req.params));
const exportCsv = (req, res, next) => runNext(req, res, next, () => service.exportCsv());

// ---- 单条 CRUD + 治理闭环（run）----
const detail = (req, res) => run(req, res, () => service.detail(req.params));
const create = (req, res) => run(req, res, () => service.create(req.body, req));
const update = (req, res) => run(req, res, () => service.update(req.params, req.body, req));
const remove = (req, res) => run(req, res, () => service.remove(req.params, req));
const rectify = (req, res) => run(req, res, () => service.rectify(req.params, req.body, req));
const submitReview = (req, res) => run(req, res, () => service.submitReview(req.params, req));
const review = (req, res) => run(req, res, () => service.review(req.params, req.body, req));
const close = (req, res) => run(req, res, () => service.close(req.params, req.body, req));

// ---- 提醒 / 分析（run）----
const remindersHighRisk = (req, res) => run(req, res, () => service.remindersHighRisk());
const remindersOverdue = (req, res) => run(req, res, () => service.remindersOverdue());
const analysisRepeated = (req, res) => run(req, res, () => service.analysisRepeated());
const analysisResponsibleOverdue = (req, res) => run(req, res, () => service.analysisResponsibleOverdue());

// ---- 附件 + 版本（runNext）----
const attachments = (req, res, next) => runNext(req, res, next, () => service.attachments(req.params, req.query));
const uploadAttachment = (req, res, next) => runNext(req, res, next, () => service.uploadAttachment(req, req.params));
const deleteAttachment = (req, res, next) => runNext(req, res, next, () => service.deleteAttachment(req.params));
const versions = (req, res, next) => runNext(req, res, next, () => service.versions(req.params));

// ---- 规则（run）----
const rulesLevels = (req, res) => run(req, res, () => service.rulesLevels());
const rulesStatusFlow = (req, res) => run(req, res, () => service.rulesStatusFlow());
const rulesSources = (req, res) => run(req, res, () => service.rulesSources());
const rulesCategories = (req, res) => run(req, res, () => service.rulesCategories());
const rulesExpiry = (req, res) => run(req, res, () => service.rulesExpiry());
const rulesResponsibilityMatrix = (req, res) => run(req, res, () => service.rulesResponsibilityMatrix());
const rulesAll = (req, res) => run(req, res, () => service.rulesAll());

module.exports = {
  list,
  stats,
  relatedRisk,
  exportCsv,
  detail,
  create,
  update,
  remove,
  rectify,
  submitReview,
  review,
  close,
  remindersHighRisk,
  remindersOverdue,
  analysisRepeated,
  analysisResponsibleOverdue,
  attachments,
  uploadAttachment,
  deleteAttachment,
  versions,
  rulesLevels,
  rulesStatusFlow,
  rulesSources,
  rulesCategories,
  rulesExpiry,
  rulesResponsibilityMatrix,
  rulesAll,
};