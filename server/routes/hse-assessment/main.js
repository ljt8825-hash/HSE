/**
 * Sprint6.5-B 集团HSE考核分析系统子路由 —— 纯绑定（不承载业务）
 * 业务在 services/assessmentService.js，薄 handler 在 controllers/assessmentController.js，
 * 本文件仅按与原 routes/hse-assessment.js 一致的注册顺序做 方法+路径 → controller 绑定。
 *
 * 保持一致的关键约束：注册顺序逐条与原文件一致，尤其 GET / 根路由注册在最后（其余五个前缀路由之前）。
 * 本域六端点均为公开 GET，无鉴权，无 requireRole 中间件。
 */
const express = require('express');
const router = express.Router();

const ctl = require('../../controllers/assessmentController');

// ---- 集团HSE考核分析 ----
router.get('/overview', ctl.overview);
router.get('/ranking', ctl.ranking);
router.get('/indicator-analysis', ctl.indicatorAnalysis);
router.get('/target-progress', ctl.targetProgress);
router.get('/deduction-detail', ctl.deductionDetail);

// ---- 考核记录列表（供前端 /objectives/assessment 视图使用，注册在最后） ----
router.get('/', ctl.assessmentList);

module.exports = router;