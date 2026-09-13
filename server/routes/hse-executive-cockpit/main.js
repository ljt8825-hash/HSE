/**
 * 集团HSE智能驾驶舱（/api/hse/executive-cockpit）—— 子路由绑定层
 * 仅绑定路径 → 方法 → controller 函数，严格按原 routes/hse-executive-cockpit.js 的端点注册顺序。
 * 原文件 6 个端点均公开只读、无鉴权中间件（req.user 由 app 级鉴权注入，org-ranking 内部缺省取 admin）。
 */
const express = require('express');
const router = express.Router();
const ctl = require('../../controllers/executiveCockpitController');

router.get('/overview', ctl.overview);
router.get('/org-ranking', ctl.orgRanking);
router.get('/risk-trend', ctl.riskTrend);
router.get('/indicator-completion', ctl.indicatorCompletion);
router.get('/major-risk-warning', ctl.majorRiskWarning);
router.get('/management-performance', ctl.managementPerformance);

module.exports = router;