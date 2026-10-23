/**
 * 风险管控（/api/risk-control）—— 薄 controller
 * 仅做 req 解析 + 调 service + res 包装；业务规则与 SQL 全在 services/riskControlService.js。
 * 各 service 返回统一描述符（__t:'json' / __t:'csv'），由 respond() 统一解释为对外契约，
 * 行为与原 routes/risk-control.js 一致。
 *
 * 描述符语义：
 *  - json：{ __t:'json', payload, message } 成功；{ __t:'json', error:{code,message} } 业务错误。
 *    本模块所有响应均为 HTTP 200（等价原 res.json(success/error)），仅在 descriptor 携带 httpStatus 时设置状态码（本模块不会触发）。
 *  - csv：{ __t:'csv', csv } → 设置 text/csv 头并 res.send（等价原 sendCsvExport 的 res 写逻辑）。
 *
 * 双执行包裹：
 *  - run()：catch 归一为 res.json(error(-1, err.message))（HTTP 200）——对应原 catch 为 res.json(error(-1,...)) 的端点。
 *  - runNext()：catch 委托 next(err)——对应原 catch 为 next(err) 的端点（附件/版本/联动）。
 */

const { success, error } = require('../middleware/response');
const service = require('../services/riskControlService');

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
    const fname = `risk_control_${new Date().toISOString().slice(0, 10)}.csv`;
    // RFC 5987 双保险：filename 回退 ASCII + filename* 编码（当前 fname 为 ASCII，统一加固防御中文扩展）
    res.setHeader('Content-Disposition', `attachment; filename="${fname}"; filename*=UTF-8''${encodeURIComponent(fname)}`);
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

/** 包裹 service 调用：异常委托 next(err)（对应原附件/版本/联动端点的 next(err) catch） */
async function runNext(req, res, next, fn) {
  try {
    const r = await fn();
    respond(req, res, r);
  } catch (err) {
    next(err);
  }
}

// 1-4. 统计 + 导出
const statsAll = (req, res) => run(req, res, () => service.statsAll());
const statsLevel = (req, res) => run(req, res, () => service.statsLevel());
const statsType = (req, res) => run(req, res, () => service.statsType());
const riskExport = (req, res) => run(req, res, () => service.riskExport());

// 5-10. 列表 CRUD + 导入
const list = (req, res) => run(req, res, () => service.list(req.query));
const detail = (req, res) => run(req, res, () => service.detail(req.params));
const create = (req, res) => run(req, res, () => service.create(req.body));
const update = (req, res) => run(req, res, () => service.update(req.params, req.body));
const remove = (req, res) => run(req, res, () => service.remove(req.params));
const importRecords = (req, res) => run(req, res, () => service.importRecords(req.body));

// 11-14. 附件 + 版本（next 系列）
const attachments = (req, res, next) => runNext(req, res, next, () => service.attachments(req.params));
const uploadAttachment = (req, res, next) => runNext(req, res, next, () => service.uploadAttachment(req, req.params));
const deleteAttachment = (req, res, next) => runNext(req, res, next, () => service.deleteAttachment(req.params));
const versions = (req, res, next) => runNext(req, res, next, () => service.versions(req.params));

// 15. 评估（requireRole 在绑定层）
const assess = (req, res) => run(req, res, () => service.assess(req.params, req.body, req.user));

// 16-17. 联动（next 系列）
const relatedHazards = (req, res, next) => runNext(req, res, next, () => service.relatedHazards(req.params));
const generateHazard = (req, res, next) => runNext(req, res, next, () => service.generateHazard(req.params, req.body, req.user));

// 18-24. rules/*
const ruleLevels = (req, res) => run(req, res, () => service.ruleLevels());
const ruleAssessmentMethods = (req, res) => run(req, res, () => service.ruleAssessmentMethods());
const ruleControlMeasures = (req, res) => run(req, res, () => service.ruleControlMeasures());
const ruleCategories = (req, res) => run(req, res, () => service.ruleCategories());
const ruleResponsibilityMatrix = (req, res) => run(req, res, () => service.ruleResponsibilityMatrix());
const ruleAssessmentScales = (req, res) => run(req, res, () => service.ruleAssessmentScales());
const ruleAll = (req, res) => run(req, res, () => service.ruleAll());

module.exports = {
  statsAll,
  statsLevel,
  statsType,
  riskExport,
  list,
  detail,
  create,
  update,
  remove,
  importRecords,
  attachments,
  uploadAttachment,
  deleteAttachment,
  versions,
  assess,
  relatedHazards,
  generateHazard,
  ruleLevels,
  ruleAssessmentMethods,
  ruleControlMeasures,
  ruleCategories,
  ruleResponsibilityMatrix,
  ruleAssessmentScales,
  ruleAll,
};