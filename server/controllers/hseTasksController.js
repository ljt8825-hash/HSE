/**
 * HSE 任务中心（/api/hse/tasks）—— 薄 controller
 * 只做 req 解析 + 调 service + res 包装；业务规则与 SQL 全在 services/hseTasksService.js。
 *
 * 响应契约（与原 routes/hse-tasks.js 逐一等价）：
 *  - 成功：res.json(success(payload, message)) → HTTP 200。
 *  - 业务错误：res.status(404|400).json(error(msg)) —— 原写法只传一参，文案落在 code 字段、
 *    message 为默认 '操作失败'。对应 service 的 fail(msg, httpStatus) 描述符。
 *  - 非预期异常：res.status(500).json(error(err.message)) —— 同理文案落在 code 字段。
 * 全部端点共用同一 run()（catch → status(500)），与原文件所有 catch 一致。
 */

const { success, error } = require('../middleware/response');
const service = require('../services/hseTasksService');

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
  return res.json(success(r.payload ?? null, r.message));
}

/** 包裹 service 调用：业务异常 → status(500).json(error(err.message))（等价原所有 catch） */
async function run(req, res, fn) {
  try {
    const r = await fn();
    respond(req, res, r);
  } catch (err) {
    res.status(500).json(error(err.message));
  }
}

const list = (req, res) => run(req, res, () => service.list(req.query));
const detail = (req, res) => run(req, res, () => service.detail(req.params));
const updateStatus = (req, res) => run(req, res, () => service.updateStatus(req.params, req.body));
const create = (req, res) => run(req, res, () => service.create(req.body, req));
const remove = (req, res) => run(req, res, () => service.remove(req.params));
const statsOverview = (req, res) => run(req, res, () => service.statsOverview());
const statsRanking = (req, res) => run(req, res, () => service.statsRanking());
const listInspection = (req, res) => run(req, res, () => service.listInspection(req.query));
const createInspection = (req, res) => run(req, res, () => service.createInspection(req.body, req));
const executeInspection = (req, res) => run(req, res, () => service.executeInspection(req.params, req.body));
const pending = (req, res) => run(req, res, () => service.pending(req.query));
const overdue = (req, res) => run(req, res, () => service.overdue(req.query));

module.exports = {
  list,
  detail,
  updateStatus,
  create,
  remove,
  statsOverview,
  statsRanking,
  listInspection,
  createInspection,
  executeInspection,
  pending,
  overdue,
};