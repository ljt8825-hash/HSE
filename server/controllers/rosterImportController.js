/**
 * 花名册导入（/api/hse）roster-import + import-mapping-rules + import-batches —— 薄 controller
 * 仅做 req 解析 + 调 service + res 包装；业务规则与 SQL 全在 services/rosterImportService.js。
 * 各 service 返回统一描述符（__t:'json'），由 respond() 统一解释为对外契约，
 * 行为与原 routes/hse-roster-import.js 一致（标准 success/error 包装，恒 HTTP 200）。
 *
 * 描述符语义：
 *  - json：{ __t:'json', payload, message } 成功 → res.json(success(payload, message))
 *           { __t:'json', error:{code,message} } 业务错误 → res.json(error(code, message))
 *    本模块所有响应均恒 HTTP 200；code 默认 -1（原文件一律 error('...')），
 *    仅当 descriptor 携带 httpStatus 时设置状态码（本模块不会触发）。
 *
 * 执行包裹：
 *  - run()：service 各函数已内置原 try/catch 并返回带域前缀的错误描述符，故 run() 仅作
 *    兜底：仅当 service 抛出（理论上仅路由/上传中间件异常），归一为 error(-1, '操作失败')。
 *  - 鉴权（requireRole）在路由层绑定，不入 controller。
 */
const { success, error } = require('../middleware/response');
const service = require('../services/rosterImportService');

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

// ---- 上传 / 确认 ----
const upload = (req, res) => run(req, res, () => service.upload(req));
const confirm = (req, res) => run(req, res, () => service.confirm(req));

// ---- 待确认列表 ----
const pendingList = (req, res) => run(req, res, () => service.pendingList(req.query));

// ---- 映射规则管理 ----
const mappingList = (req, res) => run(req, res, () => service.mappingList(req.query));
const mappingCreate = (req, res) => run(req, res, () => service.mappingCreate(req.body));
const mappingDelete = (req, res) => run(req, res, () => service.mappingDelete(req.params));

// ---- 批次列表 ----
const batchesList = (req, res) => run(req, res, () => service.batchesList(req.query));

module.exports = {
  upload, confirm, pendingList, mappingList, mappingCreate, mappingDelete, batchesList,
};