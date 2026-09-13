/**
 * 员工花名册导入 V2（/api/hse/employee-import/v2）—— 薄 controller
 * 仅做 req 解析 + 调 service + res 包装；业务规则与 SQL 全在 services/employeeImportV2Service.js。
 * 各 service 返回统一描述符（__t:'json'），由 respond() 统一解释为对外契约，行为与原 routes/hse-employee-import-v2.js 一致。
 *
 * 描述符语义：
 *  - 成功：{ __t:'json', payload, message } → res.json(success(payload, message))
 *  - error 且带 httpStatus：{ __t:'json', error:{code,message}, httpStatus } → res.status(httpStatus).json(error(...))
 *  - error 无 httpStatus：{ __t:'json', error:{code,message} } → res.json(error(...))（200 JSON，等价原 !isConnected / 业务校验 / catch 分支）
 *    （本域所有 service 错误均不带 httpStatus，故全部 200，与原路由 catch 分支 res.json(error(-1,...)) 逐字节一致）
 */
const { success, error } = require('../middleware/response');
const service = require('../services/employeeImportV2Service');

/** 统一解释 service 返回描述符 → 对外响应 */
function respond(req, res, r) {
  if (r == null) return res.status(500).json(error(-1, '服务无返回'));
  if (r.__t === 'json') {
    if (r.error) {
      if (r.httpStatus) res.status(r.httpStatus);
      return res.json(error(r.error.code, r.error.message));
    }
    return res.json(success(r.payload, r.message));
  }
  return res.json(success(r.payload ?? null, r.message));
}

/** 执行描述符构建；遇未捕获异常降级为标准 500 JSON（正常情况下 service 均已自包 catch 返回 200 描述符） */
async function run(req, res, fn) {
  try {
    const r = await fn();
    respond(req, res, r);
  } catch (err) {
    res.status(500).json(error(-1, err.message || '操作失败，请稍后重试'));
  }
}

// ---- 上传与批次 ----
async function upload(req, res) {
  return run(req, res, () => service.upload(req.file, req.body, req.user, req.ip));
}
async function batches(req, res) {
  return run(req, res, () => service.batches(req.query));
}
async function batchPreview(req, res) {
  return run(req, res, () => service.batchPreview(req.params.batchId));
}
async function batchPending(req, res) {
  return run(req, res, () => service.batchPending(req.params.batchId, req.query));
}
async function pendingResolve(req, res) {
  return run(req, res, () => service.pendingResolve(req.params.id, req.body, req.user, req.ip));
}
async function batchImport(req, res) {
  return run(req, res, () => service.batchImport(req.params.batchId, req.user, req.ip));
}
async function deleteBatch(req, res) {
  return run(req, res, () => service.deleteBatch(req.params.batchId));
}

// ---- 清空（危险操作） ----
async function clearAll(req, res) {
  return run(req, res, () => service.clearAll());
}
async function clearAllPreview(req, res) {
  return run(req, res, () => service.clearAllPreview());
}
async function clearAllCascade(req, res) {
  return run(req, res, () => service.clearAllCascade());
}

// ---- 目录导入 ----
async function sourceFiles(req, res) {
  return run(req, res, () => service.sourceFiles());
}
async function sourceImport(req, res) {
  return run(req, res, () => service.sourceImport(req.body, req.user, req.ip));
}

module.exports = {
  upload,
  batches,
  batchPreview,
  batchPending,
  pendingResolve,
  batchImport,
  deleteBatch,
  clearAll,
  clearAllPreview,
  clearAllCascade,
  sourceFiles,
  sourceImport,
};