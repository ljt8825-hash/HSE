/**
 * 三违记录（/api/violations）—— 薄 controller
 * 仅做 req 解析 + 调 service + res 包装；业务规则与 SQL 全在 services/violationService.js。
 * 各 service 返回统一描述符（__t:'json' / __t:'csv'），由 respond() 统一解释为对外契约，
 * 行为与原 routes/violations.js 一致。
 *
 * 描述符语义：
 *  - json：{ __t:'json', payload, message } 成功；{ __t:'json', error:{code,message} } 业务错误。
 *    本模块所有响应均恒 HTTP 200（等价原 res.json(success/error)），仅当 descriptor 携带 httpStatus 时设置状态码（本模块不会触发）。
 *  - csv：{ __t:'csv', csv } → 设置 text/csv 头 + 固定文件名「三违记录.csv」并 res.send（等价原 export/csv 的 res 写逻辑）。
 *
 * 执行包裹：
 *  - run()：catch 归一为 res.json(error(-1, '操作失败，请稍后重试'))（HTTP 200）——
 *    原文件所有端点（含 export/csv）的 catch 均为该固定文案，故统一用 run()，无需 runNext。
 */

const { success, error } = require('../middleware/response');
const service = require('../services/violationService');

/** 统一解释 service 返回描述符 → 对外响应 */
function respond(req, res, r) {
  if (r == null) return res.json(error(-1, '操作失败，请稍后重试'));
  if (r.__t === 'json') {
    if (r.error) {
      if (r.httpStatus) res.status(r.httpStatus);
      return res.json(error(r.error.code, r.error.message));
    }
    return res.json(success(r.payload, r.message));
  }
  if (r.__t === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=三违记录.csv');
    return res.send(r.csv);
  }
  return res.json(success(r.payload ?? null, r.message));
}

/** 包裹 service 调用：异常 → error(-1, '操作失败，请稍后重试')（HTTP 200，等价原 catch） */
async function run(req, res, fn) {
  try {
    respond(req, res, await fn());
  } catch (err) {
    res.json(error(-1, '操作失败，请稍后重试'));
  }
}

// ---- 列表与统计 ----
const list = (req, res) => run(req, res, () => service.list(req.query));
const stats = (req, res) => run(req, res, () => service.stats());
const filterOptions = (req, res) => run(req, res, () => service.filterOptions());

// ---- 详情 + CRUD ----
const detail = (req, res) => run(req, res, () => service.detail(req.params));
const create = (req, res) => run(req, res, () => service.create(req.body, req));
const update = (req, res) => run(req, res, () => service.update(req.params, req.body, req));
const batchDelete = (req, res) => run(req, res, () => service.batchDelete(req.body, req));
const remove = (req, res) => run(req, res, () => service.remove(req.params, req));

// ---- CSV 导出 ----
const exportCsv = (req, res) => run(req, res, () => service.exportCsv());

// ---- 整改闭环 ----
const rectify = (req, res) => run(req, res, () => service.rectify(req.params, req.body, req));
const review = (req, res) => run(req, res, () => service.review(req.params, req.body, req));

// ---- 统计（人员/高风险/部门/岗位） ----
const statisticsEmployeeCount = (req, res) => run(req, res, () => service.statisticsEmployeeCount(req.query));
const statisticsHighRisk = (req, res) => run(req, res, () => service.statisticsHighRisk(req.query));
const statisticsDepartmentRanking = (req, res) => run(req, res, () => service.statisticsDepartmentRanking(req.query));
const statisticsPositionRanking = (req, res) => run(req, res, () => service.statisticsPositionRanking(req.query));

module.exports = {
  list,
  stats,
  filterOptions,
  detail,
  create,
  update,
  batchDelete,
  remove,
  exportCsv,
  rectify,
  review,
  statisticsEmployeeCount,
  statisticsHighRisk,
  statisticsDepartmentRanking,
  statisticsPositionRanking,
};