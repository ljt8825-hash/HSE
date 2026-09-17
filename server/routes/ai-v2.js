/**
 * AI v2 统一 API（/api/hse/ai/v2）—— AI-03
 *
 * 目标链路：Frontend → /api/hse/ai/v2/* → AI Gateway → Provider Registry → Provider。
 * 所有端点均经 AI Gateway，禁止 Route → Provider 直连（AI-03 §7）。
 *
 * 鉴权（与 ai-enhanced 写端点惯例一致）：
 *  - 全局 authMiddleware（app.js /api 前缀）已覆盖全部端点；
 *  - 写端点（generate/stream/analyze）追加 requireRole('admin','safety_manager')；
 *  - 读端点（health/providers/models）任意登录用户可访问（同 provider/status 惯例）。
 */
const express = require('express');
const router = express.Router();
const { requireRole } = require('../middleware/auth');
const ctl = require('../controllers/aiV2Controller');
const taskCtl = require('../controllers/aiAnalysisTaskController');

const AI_WRITER = requireRole('admin', 'safety_manager');

router.get('/health', ctl.health);
router.get('/providers', ctl.providers);
router.get('/models', ctl.models);

router.post('/generate', AI_WRITER, ctl.generate);
router.post('/stream', AI_WRITER, ctl.stream);
router.post('/analyze', AI_WRITER, ctl.analyze);
router.post('/analyze/data', AI_WRITER, ctl.analyzeData);

// AI-07 分析任务编排（异步执行，创建接口同步返回 PENDING）
router.post('/analysis-tasks', AI_WRITER, taskCtl.create);
router.get('/analysis-tasks/:id', taskCtl.get);
router.get('/analysis-tasks', taskCtl.list);
router.post('/analysis-tasks/:id/cancel', AI_WRITER, taskCtl.cancel);

// AI-10 管理建议（写：生成 requireRole(admin, safety_manager)；读：任意登录用户）
router.post('/analysis-tasks/:id/management-suggestions', AI_WRITER, taskCtl.generateManagementSuggestion);
router.get('/analysis-tasks/:id/management-suggestions', taskCtl.getManagementSuggestion);

// AI-11 人工审核（写：审核 requireRole(admin, safety_manager)；读：审核历史任意登录用户）
router.post('/analysis-tasks/:id/management-suggestions/review', AI_WRITER, taskCtl.submitReview);
router.get('/analysis-tasks/:id/management-suggestions/reviews', taskCtl.getReviewHistory);

module.exports = router;
