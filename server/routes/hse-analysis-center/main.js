/**
 * Sprint8-A HSE智能分析中心子路由 —— 纯绑定（不承载业务）
 * 业务在 services/analysisCenterService.js，薄 handler 在 controllers/analysisCenterController.js，
 * 本文件仅按与原 routes/hse-analysis-center.js 一致的注册顺序做 方法+路径+中间件 → controller 绑定。
 *
 * 保持一致的关键约束（务必遵循）：
 *  - 注册顺序逐条与原文件一致，尤其 GET /model-versions/:id 注册在 GET /model-versions/active 之前——Express 按序匹配，
 *    GET /model-versions/active 实际命中 /model-versions/:id（id='active'）后返回「模型版本不存在」；此语义是原实现固有行为，须原样保留。
 *    GET /abnormal 注册在 GET /predictions/:id 之后，属独立前缀，相对位置与原文件一致。
 *  - requireRole 权限中间件留在本层绑定（admin/safety_manager…），controller/service 不感知角色。
 */
const express = require('express');
const router = express.Router();

const { requireRole } = require('../../middleware/auth');
const ctl = require('../../controllers/analysisCenterController');

// ---- 模块一：风险趋势分析 ----
router.get('/risk-trend', ctl.riskTrend);
router.get('/risk-trend/:target_type/:target_id', ctl.riskTrendDetail);

// ---- 模块二：事故趋势分析 ----
router.get('/accident-trend', ctl.accidentTrend);
router.get('/accident-repeat', ctl.accidentRepeat);

// ---- 模块三：整改效果分析 ----
router.get('/rectification-analysis', ctl.rectificationAnalysis);

// ---- 模块四：组织风险画像 ----
router.get('/org-portrait', ctl.orgPortrait);
router.get('/org-portrait/:org_type/:org_id', ctl.orgPortraitDetail);

// ---- 模块五：风险预测模型 ----
router.post('/predict', requireRole('admin', 'safety_manager'), ctl.predict);
router.get('/predictions', ctl.predictions);
router.get('/predictions/:id', ctl.predictionDetail);
router.get('/abnormal', ctl.abnormal);

// ---- Sprint8-A-1 预测模型版本管理 ----
router.get('/model-versions', ctl.modelVersions);
router.get('/model-versions/:id', ctl.modelVersionDetail);
router.get('/model-versions/active', ctl.modelVersionActive);
router.post('/model-versions', requireRole('admin', 'safety_manager'), ctl.modelVersionCreate);
router.put('/model-versions/:id', requireRole('admin', 'safety_manager'), ctl.modelVersionUpdate);
router.put('/model-versions/:id/freeze', requireRole('admin', 'safety_manager'), ctl.modelVersionFreeze);
router.delete('/model-versions/:id', requireRole('admin', 'safety_manager'), ctl.modelVersionDelete);

// ---- Sprint8-A-1 预测预警联动 ----
router.post('/predictions/:id/generate-warning', requireRole('admin', 'safety_manager'), ctl.generateWarning);
router.get('/prediction-warnings', ctl.predictionWarnings);
router.get('/prediction-warnings/stats', ctl.predictionWarningStats);

module.exports = router;