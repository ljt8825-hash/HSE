/**
 * 规章制度（/api/regulations）—— 薄 controller
 * 仅做 req 解析 + 调 service + res 包装；业务规则与 SQL 全在 services/regulationsService.js。
 *
 * 描述符 → 对外响应（__t:'json'）：
 *  - { payload, message }          成功 → res.json(success(payload, message))
 *  - { error:{ code, message } }   业务错误 → res.json(error(code, message))（HTTP 200）
 *  - throw                         未捕获异常 → next(err) → 全局 errorHandler
 *                                   （忠实复刻原文件 try/catch → next(err) 的行为，
 *                                    保留 httpStatus / PG 错误码 / 生产化消息处理）
 *
 * exportList 返回的是原始数据行（含 expiry_status），由本层负责渲染 CSV 并发送。
 */
const { success, error } = require('../middleware/response');
const service = require('../services/regulationsService');

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

/**
 * 包裹 service 调用：描述符由 respond 解释；未捕获异常经 next(err) 转发给全局 errorHandler
 * （等价原文件各端点的 try/catch → next(err)，不在此层吞异常）。
 */
async function run(req, res, next, fn) {
  try {
    respond(res, await fn());
  } catch (err) {
    next(err);
  }
}

// CSV 导出辅助函数（兼容 xlsx 工具，CSV 兼容 Excel 打开）
function sendCsvExport(res, data) {
  const headers = ['ID', '标题', '分类', '版本', '状态', '文号', '发布机构', '生效日期', '有效期(月)', '时效状态', '归口部门'];
  const rows = data.map(r => [
    r.id || '',
    (r.title || r.name || '').replace(/"/g, '""'),
    r.category || '',
    r.version || '',
    r.status || '',
    r.document_no || '',
    r.issuer || '',
    r.effective_date ? new Date(r.effective_date).toISOString().slice(0, 10) : '',
    r.validity_period || '',
    r.expiry_status || '',
    r.department || ''
  ].map(v => `"${v}"`).join(','));
  const csv = '\uFEFF' + headers.map(h => `"${h}"`).join(',') + '\n' + rows.join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="regulations_${new Date().toISOString().slice(0, 10)}.csv"`);
  return res.send(csv);
}

// ---- 基础 CRUD ----
const list = (req, res, next) => run(req, res, next, () => service.list(req.query));
const stats = (req, res, next) => run(req, res, next, () => service.stats());
const detail = (req, res, next) => run(req, res, next, () => service.detail(req.params));
const create = (req, res, next) => run(req, res, next, () => service.create(req));
const update = (req, res, next) => run(req, res, next, () => service.update(req));
const remove = (req, res, next) => run(req, res, next, () => service.remove(req.params));

// ---- 导出（CSV 由本层渲染并直接发送；成功即结束响应，不经过 respond） ----
const exportList = async (req, res, next) => {
  try {
    const r = await service.exportList(); // 成功描述符或异常
    if (r && r.__t === 'json' && !r.error) {
      sendCsvExport(res, r.payload);
      return;
    }
    respond(res, r);
  } catch (err) {
    next(err);
  }
};

// ---- 附件 ----
const listAttachments = (req, res, next) => run(req, res, next, () => service.listAttachments(req.params, req.query));
const uploadAttachment = (req, res, next) => run(req, res, next, () => service.uploadAttachment(req));
const removeAttachment = (req, res, next) => run(req, res, next, () => service.removeAttachment(req.params));

// ---- 版本履历 ----
const listVersions = (req, res, next) => run(req, res, next, () => service.listVersions(req.params));

module.exports = {
  list, stats, exportList, detail, create, update, remove,
  listAttachments, uploadAttachment, removeAttachment, listVersions,
};