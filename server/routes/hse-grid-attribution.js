/**
 * 阶段 P2-B1-D-IMPLEMENTATION-04-B：通道 B 待归属人工归属 API（独立 router）
 *
 * 路由（§四）：
 *   GET  /api/grid-attribution/pending    —— 待归属列表（严格 pending + 双 NULL）
 *   POST /api/grid-attribution/attribute   —— 人工归属
 *   DELETE /api/grid-attribution/revoke    —— 撤销归属
 *   GET  /api/grid-attribution/attributed  —— 已归属记录查询（04-D-B，只读，真分页）
 *
 * 权限（§四/§六）：authMiddleware（全局已挂）+ requireRole('admin','hse_manager','safety_manager')
 *   - 严禁 requirePermission('hse:site:grid:update')（grid_inspector 也持有，会误放行）
 *   - township_manager 不在此列 → 自然 403
 *
 * 客户端白名单（§七）：仅读取 record_id / candidate_employee_id；其余字段一律忽略（不读取）。
 * 操作人：req.user.id / req.user.username（不要求 employee 绑定，admin.employee_id 可为 NULL，见 04-A）。
 */
const express = require('express');
const { requireRole } = require('../middleware/auth');
const svc = require('../services/gridAttributionService');

const router = express.Router();
const ATTR_ROLES = ['admin', 'hse_manager', 'safety_manager'];

function clientIp(req) {
  if (req.ip) return req.ip;
  if (req.headers && req.headers['x-forwarded-for']) return req.headers['x-forwarded-for'];
  return null;
}

/**
 * 统一异常兜底：Express 4 不会捕获 async handler 的 reject，若不在处理器内 catch，
 * 请求会**永不响应**（挂起）。服务层在少数路径（如入参校验）会 throw ApiError 而非返回错误对象，
 * 故此处将「抛出的异常」与「返回的错误对象」统一映射为响应。
 */
function sendUnhandled(res, err, fallbackCode) {
  const httpStatus = Number.isInteger(err && err.httpStatus) ? err.httpStatus : 500;
  const code = (err && err.code) || fallbackCode;
  console.error('[grid-attribution] 未捕获异常:', err && err.message);
  return res.status(httpStatus).json({
    success: false,
    code,
    message: (err && err.message) || '操作失败',
  });
}

// ========= GET pending =========
router.get('/pending', requireRole(...ATTR_ROLES), async (req, res) => {
  try {
    const rows = await svc.getPendingRecords({ limit: 500, offset: 0 });
    return res.json({ success: true, code: 0, data: rows, total: rows.length });
  } catch (e) {
    console.error('[grid-attribution] GET /pending 失败:', e && e.message);
    return res.status(500).json({ success: false, code: 500, message: '查询待归属列表失败' });
  }
});

// ========= POST attribute =========
router.post('/attribute', requireRole(...ATTR_ROLES), async (req, res) => {
  // 仅读取白名单字段；grid_id / inspector_employee_id / attribution_status / source_channel /
  // client_token / submission_fingerprint / operator_user_id / operator_employee_id 一律忽略
  const body = (req.body && typeof req.body === 'object') ? req.body : {};
  const record_id = body.record_id;
  const candidate_employee_id = body.candidate_employee_id;
  const operator = { userId: req.user.id, username: req.user.username };
  try {
    const r = await svc.attributeRecord({ record_id, candidate_employee_id, operator, ip: clientIp(req) });
    const status = r.ok ? 200 : (r.httpStatus || 500);
    return res.status(status).json({
      success: !!r.ok,
      // 成功：code=0（与 @vben/request 拦截器 successCode 对齐，避免被误判为错误并误弹提示）
      // 失败：code=具体业务码（GRID_NONE / GRID_MULTIPLE / RECORD_NOT_PENDING / EMPLOYEE_INVALID ...），便于前端精准提示
      code: r.ok ? 0 : (r.code || status),
      message: r.message,
      data: r.ok ? { record_id: r.record_id, inspector_employee_id: r.inspector_employee_id, grid_id: r.grid_id } : undefined,
    });
  } catch (err) {
    // 例：record_id / candidate_employee_id 无效（服务层抛 ApiError(400,'INVALID_RECORD_ID'|'INVALID_EMPLOYEE_ID')）
    return sendUnhandled(res, err, 'ATTRIBUTE_FAILED');
  }
});

// ========= DELETE revoke =========
router.delete('/revoke', requireRole(...ATTR_ROLES), async (req, res) => {
  // 仅读取 record_id；reason 仅作审计 detail（不参与权限、不持久化）；严禁 oldEmployeeId/oldGridId
  const body = (req.body && typeof req.body === 'object') ? req.body : {};
  const record_id = body.record_id;
  const reason = typeof body.reason === 'string' ? body.reason : undefined;
  const operator = { userId: req.user.id, username: req.user.username };
  try {
    const r = await svc.revokeRecord({ record_id, operator, ip: clientIp(req), reason });
    const status = r.ok ? 200 : (r.httpStatus || 500);
    return res.status(status).json({
      success: !!r.ok,
      code: r.ok ? 0 : (r.code || status),
      message: r.message,
    });
  } catch (err) {
    return sendUnhandled(res, err, 'REVOKE_FAILED');
  }
});

// ========= GET attributed（04-D-B，只读） =========
// 已归属记录查询：服务端固定 attribution_status IN ('attributed','manual_confirmed')；
// 仅接受 page/pageSize/keyword；grid_id/inspector_employee_id/attribution_status 等
// 客户端参数一律忽略（不读取），杜绝越权过滤面。权限与归属闭环一致（ATTR_ROLES）。
router.get('/attributed', requireRole(...ATTR_ROLES), async (req, res) => {
  try {
    const q = req.query || {};
    const result = await svc.listAttributed({
      page: q.page,
      pageSize: q.pageSize,
      keyword: typeof q.keyword === 'string' ? q.keyword : undefined,
    });
    return res.json({ success: true, code: 0, data: result });
  } catch (err) {
    return sendUnhandled(res, err, 'ATTRIBUTED_QUERY_FAILED');
  }
});

module.exports = router;
