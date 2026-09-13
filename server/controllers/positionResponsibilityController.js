/**
 * 岗位体系 + 责任体系（/api/hse/position-resp）—— 薄 controller
 * 仅做 req 解析 + 调 service + res 包装；业务规则与 SQL 全在 services/positionResponsibilityService.js。
 * 各 service 返回统一描述符（__t:'json'），由 respond() 统一解释为对外契约。
 *
 * 描述符语义：
 *  - json：{ __t:'json', payload, message } 成功 → res.json(success(payload, message))
 *           { __t:'json', error:{code,message} } 业务错误 → res.json(error(code, message))
 *    本模块所有响应恒 HTTP 200；code 沿用原值（业务分支 404 / 默认 -1，catch 一律 -1）。
 *
 * 执行包裹：
 *  - run()：本域各端点 catch 前缀各异，service 函数内已各自捕获并返回带前缀的错误描述符，
 *    故 run() 仅作兜底（service 实际不会抛出），归一为 error(-1, '操作失败')。
 *  - 鉴权（requireRole(['admin','safety_manager']) 数组形式）在路由层绑定，不入 controller。
 */
const { success, error } = require('../middleware/response');
const service = require('../services/positionResponsibilityService');

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

/** 兜底包裹：service 抛出（罕见）→ error(-1, '操作失败') */
async function run(req, res, fn) {
  try {
    respond(res, await fn());
  } catch (err) {
    res.json(error(-1, '操作失败'));
  }
}

// ---- 一、标准岗位 ----
const positionList = (req, res) => run(req, res, () => service.positionList(req.query));
const positionAll = (req, res) => run(req, res, () => service.positionAll(req.query));
const positionDetail = (req, res) => run(req, res, () => service.positionDetail(req.params));
const positionCreate = (req, res) => run(req, res, () => service.positionCreate(req.body));
const positionUpdate = (req, res) => run(req, res, () => service.positionUpdate(req.params, req.body));
const positionDelete = (req, res) => run(req, res, () => service.positionDelete(req.params));
const positionJobCategories = (req, res) => run(req, res, () => service.positionJobCategories());

// ---- 二、岗位别名 ----
const aliasList = (req, res) => run(req, res, () => service.aliasList(req.query));
const aliasByPosition = (req, res) => run(req, res, () => service.aliasByPosition(req.params));
const aliasCreate = (req, res) => run(req, res, () => service.aliasCreate(req.body));
const aliasDelete = (req, res) => run(req, res, () => service.aliasDelete(req.params));

// ---- 三、责任配置 ----
const configList = (req, res) => run(req, res, () => service.configList(req.query));
const configByPosition = (req, res) => run(req, res, () => service.configByPosition(req.params));
const configUpdate = (req, res) => run(req, res, () => service.configUpdate(req.params, req.body));

// ---- 四、责任记录 ----
const responsibilityList = (req, res) => run(req, res, () => service.responsibilityList(req.query));
const responsibilityDetail = (req, res) => run(req, res, () => service.responsibilityDetail(req.params));
const responsibilityCreate = (req, res) => run(req, res, () => service.responsibilityCreate(req.body));
const responsibilityUpdate = (req, res) => run(req, res, () => service.responsibilityUpdate(req.params, req.body));
const responsibilityDelete = (req, res) => run(req, res, () => service.responsibilityDelete(req.params));

// ---- 五、枚举接口 ----
const responsibilityTypes = (req, res) => run(req, res, () => service.responsibilityTypes());
const responsibilityGridLevels = (req, res) => run(req, res, () => service.responsibilityGridLevels());

module.exports = {
  positionList, positionAll, positionDetail, positionCreate, positionUpdate, positionDelete, positionJobCategories,
  aliasList, aliasByPosition, aliasCreate, aliasDelete,
  configList, configByPosition, configUpdate,
  responsibilityList, responsibilityDetail, responsibilityCreate, responsibilityUpdate, responsibilityDelete,
  responsibilityTypes, responsibilityGridLevels,
};