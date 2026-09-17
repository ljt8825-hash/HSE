/**
 * HSE 综合驾驶舱（/api/hse/dashboard）—— 子路由绑定层
 * 7 个只读 GET 端点（Sprint6.3-B-1），原文件无 requireRole/鉴权中间件（仅全局 authMiddleware 保护），
 * 此处不追加，忠实复刻。端点顺序与原文件一致。
 */
const express = require('express');
const router = express.Router();
const ctl = require('../../controllers/hseDashboardController');

router.get('/overview', ctl.overview);
router.get('/level-distribution', ctl.levelDistribution);
router.get('/risk-type-analysis', ctl.riskTypeAnalysis);
router.get('/risk-top', ctl.riskTop);
router.get('/risk-trend', ctl.riskTrend);
router.get('/management-execution', ctl.managementExecution);
router.get('/risk-level-config', ctl.riskLevelConfig);

module.exports = router;