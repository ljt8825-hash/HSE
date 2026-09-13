/**
 * 智能导入（/api/import）—— 薄 controller
 * 仅做 req 解析 + 调 service + res 包装；业务规则与 SQL 全在 services/import*.js。
 * 各 service 返回统一描述符（__t: json / error / file），由 respond() 统一解释为对外 JSON/文件契约，
 * 保持与原 routes/import.js 一致。
 *
 * 说明：本控制器为 /api/import 域专用；controllers/hse-import.js 是「人员主数据员工导入」薄控制器，
 * 两者是不同的域，互不影响。
 */
const { success, error } = require('../middleware/response');
const importExcelService = require('../services/importExcelService');
const importQueryService = require('../services/importQueryService');

/** 统一解释 service 返回描述符 → 对外响应 */
function respond(req, res, r) {
  if (r == null) return res.status(500).json(error(-1, '服务无返回'));
  switch (r.__t) {
    case 'json':
      return res.json(success(r.payload, r.message));
    case 'error':
      if (r.data !== undefined && r.data !== null) return res.json(error(r.code, r.message, r.data));
      return res.json(error(r.code, r.message));
    case 'file': {
      for (const [k, v] of Object.entries(r.headers || {})) res.setHeader(k, v);
      return res.send(r.buffer);
    }
    default:
      return res.status(500).json(error(-1, '未知响应类型'));
  }
}

/** run 包装：异常统一落入 error(-1, message)。service 内已按原各端点 catch 语义返回各自错误描述符。 */
async function run(req, res, fn) {
  try {
    const r = await fn();
    respond(req, res, r);
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

// POST /api/import/parse
async function parseFile(req, res) {
  return run(req, res, () => importExcelService.parse({
    fileRecordId: req.body.fileRecordId,
    filePath: req.body.filePath,
    fileName: req.body.fileName,
    sheets: req.body.sheets,
  }));
}

// POST /api/import/confirm
async function confirmImport(req, res) {
  return run(req, res, () => importExcelService.confirm({
    fileRecordId: req.body.fileRecordId,
    insuranceType: req.body.insuranceType,
    operator: req.user || null,
    ip: req.ip,
  }));
}

// POST /api/import/rollback
async function rollbackImport(req, res) {
  return run(req, res, () => importExcelService.rollback({
    jobId: req.body.jobId,
    operator: req.user || null,
    ip: req.ip,
  }));
}

// GET /api/import/logs
async function getImportLogs(req, res) {
  return run(req, res, () => importQueryService.getLogs(req.query));
}

// GET /api/import/config
async function getImportConfig(req, res) {
  return run(req, res, () => importQueryService.getConfig(req.query));
}

// GET /api/import/template/:module
async function downloadTemplate(req, res) {
  return run(req, res, () => importExcelService.template({
    module: req.params.module,
    format: req.query.format,
  }));
}

// POST /api/import/upload（multer 中间件已在路由绑定，此处处理落库 + 解析）
async function uploadFile(req, res) {
  return run(req, res, () => importExcelService.upload({
    file: req.file,
    module: req.body?.module,
    originalFilename: req.body.original_filename || req.body.originalFilename || '',
  }));
}

// GET /api/import/stats
async function getImportStats(req, res) {
  return run(req, res, () => importQueryService.getStats());
}

module.exports = {
  parseFile,
  confirmImport,
  rollbackImport,
  getImportLogs,
  getImportConfig,
  downloadTemplate,
  uploadFile,
  getImportStats,
};