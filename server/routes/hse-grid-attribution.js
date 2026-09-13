/**
 * 阶段 P2-B1-D-IMPLEMENTATION-04-B：通道 B 待归属人工归属 API（独立 router）
 *
 * 路由（§四）：
 *   GET  /api/grid-attribution/pending    —— 待归属列表（严格 pending + 双 NULL）
 *   POST /api/grid-attribution/attribute   —— 人工归属
 *   DELETE /api/grid-attribution/revoke    —— 撤销归属
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
  const r = await svc.attributeRecord({ record_id, candidate_employee_id, operator, ip: clientIp(req) });
  const status = r.ok ? 200 : (r.httpStatus || 500);
  return res.status(status).json({
    success: status < 400,
    code: status,
    message: r.message,
    data: r.ok ? { record_id: r.record_id, inspector_employee_id: r.inspector_employee_id, grid_id: r.grid_id } : undefined,
  });
});

// ========= DELETE revoke =========
router.delete('/revoke', requireRole(...ATTR_ROLES), async (req, res) => {
  // 仅读取 record_id；reason 仅作审计 detail（不参与权限、不持久化）；严禁 oldEmployeeId/oldGridId
  const body = (req.body && typeof req.body === 'object') ? req.body : {};
  const record_id = body.record_id;
  const reason = typeof body.reason === 'string' ? body.reason : undefined;
  const operator = { userId: req.user.id, username: req.user.username };
  const r = await svc.revokeRecord({ record_id, operator, ip: clientIp(req), reason });
  const status = r.ok ? 200 : (r.httpStatus || 500);
  return res.status(status).json({
    success: status < 400,
    code: status,
    message: r.message,
  });
});

module.exports = router;
