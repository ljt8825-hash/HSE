/**
 * AI 增强（/api/hse/ai，ai-enhanced）—— 子路由绑定层
 * 严格按原 routes/ai-enhanced.js 的端点注册顺序与鉴权绑定 → controller。
 *
 * 与 ai.js 分工（同挂载点 /api/hse/ai，独立注册不覆盖）：
 *   ai.js:          /risk-predict, /classify, /anomaly-detect, /qa
 *   ai-enhanced.js: /generate-report, /root-cause, /records, /provider/status
 *
 * 鉴权（保持原状）：
 *  - /generate-report、/root-cause   → requireRole('admin','safety_manager')
 *  - DELETE /records/:id             → requireRole('admin')
 *  - GET /records、GET /records/:id、POST /provider/status → 仅全局 authMiddleware，
 *    行级过滤（非 admin 仅自己）在 service 内完成。
 */
const express = require('express');
const router = express.Router();
const { requireRole } = require('../../middleware/auth');
const ctl = require('../../controllers/aiEnhancedController');

const AI_WRITER = requireRole('admin', 'safety_manager');

router.post('/generate-report', AI_WRITER, ctl.generateReport);
router.post('/root-cause', AI_WRITER, ctl.rootCause);
router.get('/records', ctl.records);
router.get('/records/:id', ctl.recordDetail);
router.delete('/records/:id', requireRole('admin'), ctl.removeRecord);
router.post('/provider/status', ctl.providerStatus);

module.exports = router;