/**
 * 隐患整改闭环（/api/hse/hazard-rectification）—— 薄 controller
 * 仅做 req 解析 + 调 service + res 包装；业务规则与 SQL 全在 services/hazardRectificationService.js。
 * 各 service 返回统一描述符（__t:'json'），由 respond() 统一解释为对外契约。
 *
 * 描述符语义：
 *  - json：{ __t:'json', payload, message } 成功 → res.json(success(payload, message))
 *           { __t:'json', error:{code,message} } 业务错误 → res.json(error(code, message))
 *    本模块所有响应恒 HTTP 200；code 语义 -1 未连接/兜底、-2 不存在、-3 参数/状态不可操作。
 *
 * 执行包裹：
 *  - run()：本域全部端点外层 catch 统一为 `res.json(error(-1, err.message))`（真实错误信息，
 *    非固定文案）。故 service 遇 DB/逻辑异常抛错，run() 归一为 error(-1, err.message)；
 *    service 内「预期分支」（未连接/不存在/参数）均返回描述符，不抛到 run()。
 *  - 鉴权（requireRole）与写权限在路由层绑定，不入 controller。
 */
const { success, error } = require('../middleware/response');
const service = require('../services/hazardRectificationService');

/** 统一解释 service 返回描述符 → 对外响应 */
function respond(res, r) {
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

/** 包裹 service 调用：异常 → error(-1, err.message)（HTTP 200，等价原外层统一 catch） */
async function run(req, res, fn) {
  try {
    respond(res, await fn());
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

// ---- 隐患确认 ----
const confirm = (req, res) => run(req, res, () => service.confirm(req));

// ---- 整改任务 ----
const listTasks = (req, res) => run(req, res, () => service.listTasks(req.query));
const taskDetail = (req, res) => run(req, res, () => service.taskDetail(req.params));
const createTask = (req, res) => run(req, res, () => service.createTask(req));
const updateTask = (req, res) => run(req, res, () => service.updateTask(req));
const removeTask = (req, res) => run(req, res, () => service.removeTask(req));

// ---- 整改措施 ----
const listActions = (req, res) => run(req, res, () => service.listActions(req.params));
const createAction = (req, res) => run(req, res, () => service.createAction(req));
const updateAction = (req, res) => run(req, res, () => service.updateAction(req));
const removeAction = (req, res) => run(req, res, () => service.removeAction(req.params));

// ---- 复查记录 ----
const listReviews = (req, res) => run(req, res, () => service.listReviews(req.query));
const reviewDetail = (req, res) => run(req, res, () => service.reviewDetail(req.params));
const createReview = (req, res) => run(req, res, () => service.createReview(req));
const removeReview = (req, res) => run(req, res, () => service.removeReview(req.params));

// ---- 统计 ----
const getStats = (req, res) => run(req, res, () => service.getStats());
const getStatsOverdue = (req, res) => run(req, res, () => service.getStatsOverdue());

// ---- 责任人查询 / AI建议 ----
const responsibleTasks = (req, res) => run(req, res, () => service.responsibleTasks(req.params));
const aiSuggestions = (req, res) => run(req, res, () => service.aiSuggestions(req));

module.exports = {
  confirm,
  listTasks, taskDetail, createTask, updateTask, removeTask,
  listActions, createAction, updateAction, removeAction,
  listReviews, reviewDetail, createReview, removeReview,
  getStats, getStatsOverdue,
  responsibleTasks, aiSuggestions,
};