/**
 * 集团HSE考核分析中心（/api/hse/assessment-analysis）—— 子路由绑定层
 * 仅绑定路径 → 方法 → controller 函数，严格按原 routes/hse-assessment-analysis.js 的端点注册顺序。
 * 原文件 5 个端点均公开只读、无鉴权中间件。
 */
const express = require('express');
const router = express.Router();
const ctl = require('../../controllers/hseAssessmentAnalysisController');

router.get('/overview', ctl.overview);
router.get('/department-ranking', ctl.departmentRanking);
router.get('/township-ranking', ctl.townshipRanking);
router.get('/goals', ctl.goals);
router.get('/deduction', ctl.deduction);

module.exports = router;