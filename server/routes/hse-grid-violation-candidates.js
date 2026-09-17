/**
 * 三违候选管理 API（P2-B1-E-06-IMPLEMENT · 独立 router）
 *
 * 路由：
 *   GET  /api/grid-violation-candidates            —— 候选列表（status/page/pageSize/keyword）
 *   GET  /api/grid-violation-candidates/dry-run    —— 候选识别 dry-run（只读统计，不写任何表）
 *   GET  /api/grid-violation-candidates/dict       —— 可修正标准行为（字典驱动，确认弹窗下拉）
 *   GET  /api/grid-violation-candidates/:id        —— 详情 + 完整证据链（candidate→gir→vr→audit）
 *   POST /api/grid-violation-candidates/generate   —— 批量候选生成（显式触发，无 scheduler；幂等）
 *   POST /api/grid-violation-candidates/:id/confirm —— 人工确认（可修正 inspection_source/behavior_id；事务；一对一 vr）
 *   POST /api/grid-violation-candidates/:id/reject  —— 驳回（pending → rejected，不生成 vr）
 *   POST /api/grid-violation-candidates/:id/revoke  —— 撤销确认（confirmed → revoked；vr 软删）
 *
 * 权限：authMiddleware（全局已挂）+ requireRole('admin','hse_manager','safety_manager')
 *   —— 与通道 B 归属闭环一致；grid_inspector 不在白名单（越权 403，后端强校验，
 *      前端隐藏不是安全措施）。不新增角色、不扩大 grid_inspector 权限。
 *
 * 客户端白名单：
 *   - generate：仅可选 grid_record_ids（测试/补扫），不得提交 inspection_source/candidate_status；
 *   - confirm：仅可选 inspection_source（company/township/self）；confirmed_by/at、
 *     candidate_id、source_type、source_record_id 等一律由服务端决定；
 *   - reject：仅可选 rejection_reason；
 *   - revoke：仅可选 reason。
 * AI 边界：生成/推荐均为候选性质（pending），最终正式化必须人工确认；无任何自动处罚端点。
 */
const express = require('express');
const { requireRole } = require('../middleware/auth');
const svc = require('../services/gridViolationCandidateService');

const router = express.Router();
const ROLES = ['admin', 'hse_manager', 'safety_manager'];

function clientIp(req) {
  if (req.ip) return req.ip;
  if (req.headers && req.headers['x-forwarded-for']) return req.headers['x-forwarded-for'];
  return null;
}

function sendUnhandled(res, err, fallbackCode) {
  const httpStatus = Number.isInteger(err && err.httpStatus) ? err.httpStatus : 500;
  const code = (err && err.code) || fallbackCode;
  console.error('[grid-violation-candidates] 未捕获异常:', err && err.message);
  return res.status(httpStatus).json({
    success: false,
    code,
    message: (err && err.message) || '操作失败',
  });
}

// ========= GET / 列表 =========
router.get('/', requireRole(...ROLES), async (req, res) => {
  try {
    const q = req.query || {};
    const result = await svc.listCandidates({
      page: q.page,
      pageSize: q.pageSize,
      keyword: typeof q.keyword === 'string' ? q.keyword : undefined,
      status: typeof q.status === 'string' ? q.status : undefined,
    });
    return res.json({ success: true, code: 0, data: result });
  } catch (err) {
    return sendUnhandled(res, err, 'CANDIDATE_LIST_FAILED');
  }
});

// ========= GET /dry-run（只读统计） =========
router.get('/dry-run', requireRole(...ROLES), async (req, res) => {
  try {
    const stats = await svc.dryRunScan();
    return res.json({ success: true, code: 0, data: stats });
  } catch (err) {
    return sendUnhandled(res, err, 'DRYRUN_FAILED');
  }
});

// ========= GET /dict（可修正标准行为，来自字典，供确认弹窗下拉） =========
router.get('/dict', requireRole(...ROLES), async (req, res) => {
  try {
    const rows = await svc.listCorrectableBehaviors();
    return res.json({ success: true, code: 0, data: rows });
  } catch (err) {
    return sendUnhandled(res, err, 'DICT_FAILED');
  }
});

// ========= GET /:id（详情 + 完整证据链，含 rejected/revoked 可追溯） =========
router.get('/:id', requireRole(...ROLES), async (req, res) => {
  try {
    const data = await svc.getCandidateDetail(req.params.id);
    return res.json({ success: true, code: 0, data });
  } catch (err) {
    const status = err && err.httpStatus ? err.httpStatus : 500;
    return res.status(status).json({ success: false, code: (err && err.code) || status, message: (err && err.message) || '查询失败' });
  }
});

// ========= POST /generate（显式触发，幂等） =========
router.post('/generate', requireRole(...ROLES), async (req, res) => {
  const body = (req.body && typeof req.body === 'object') ? req.body : {};
  // 白名单：仅 grid_record_ids；其余字段一律忽略
  const ids = Array.isArray(body.grid_record_ids) ? body.grid_record_ids : undefined;
  try {
    const stats = await svc.generateCandidates({ gridRecordIds: ids });
    return res.json({ success: true, code: 0, message: '候选生成完成', data: stats });
  } catch (err) {
    return sendUnhandled(res, err, 'GENERATE_FAILED');
  }
});

// ========= POST /:id/confirm =========
router.post('/:id/confirm', requireRole(...ROLES), async (req, res) => {
  const body = (req.body && typeof req.body === 'object') ? req.body : {};
  const operator = { userId: req.user.id, username: req.user.username };
  try {
    const r = await svc.confirmCandidate({
      candidate_id: req.params.id,
      inspection_source: typeof body.inspection_source === 'string' && body.inspection_source !== '' ? body.inspection_source : undefined,
      behavior_id: body.behavior_id !== undefined ? body.behavior_id : undefined,
      operator,
      ip: clientIp(req),
    });
    const status = r.ok ? 200 : (r.httpStatus || 500);
    return res.status(status).json({
      success: !!r.ok,
      code: r.ok ? 0 : (r.code || status),
      message: r.message || (r.ok ? '确认成功' : '确认失败'),
      data: r.ok ? {
        candidate_id: r.candidate_id,
        violation_record_id: r.violation_record_id,
        inspection_source: r.inspection_source,
        behavior_id: r.behavior_id,
        behavior_code: r.behavior_code,
        behavior_name: r.behavior_name,
        behavior_corrected: r.behavior_corrected,
      } : undefined,
    });
  } catch (err) {
    return sendUnhandled(res, err, 'CONFIRM_FAILED');
  }
});

// ========= POST /:id/reject =========
router.post('/:id/reject', requireRole(...ROLES), async (req, res) => {
  const body = (req.body && typeof req.body === 'object') ? req.body : {};
  const operator = { userId: req.user.id, username: req.user.username };
  try {
    const r = await svc.rejectCandidate({
      candidate_id: req.params.id,
      rejection_reason: typeof body.rejection_reason === 'string' ? body.rejection_reason : undefined,
      operator,
      ip: clientIp(req),
    });
    const status = r.ok ? 200 : (r.httpStatus || 500);
    return res.status(status).json({
      success: !!r.ok,
      code: r.ok ? 0 : (r.code || status),
      message: r.message || (r.ok ? '驳回成功' : '驳回失败'),
    });
  } catch (err) {
    return sendUnhandled(res, err, 'REJECT_FAILED');
  }
});

// ========= POST /:id/revoke =========
router.post('/:id/revoke', requireRole(...ROLES), async (req, res) => {
  const body = (req.body && typeof req.body === 'object') ? req.body : {};
  const operator = { userId: req.user.id, username: req.user.username };
  try {
    const r = await svc.revokeConfirmation({
      candidate_id: req.params.id,
      reason: typeof body.reason === 'string' ? body.reason : undefined,
      operator,
      ip: clientIp(req),
    });
    const status = r.ok ? 200 : (r.httpStatus || 500);
    return res.status(status).json({
      success: !!r.ok,
      code: r.ok ? 0 : (r.code || status),
      message: r.message || (r.ok ? '撤销成功' : '撤销失败'),
    });
  } catch (err) {
    return sendUnhandled(res, err, 'REVOKE_FAILED');
  }
});

module.exports = router;
