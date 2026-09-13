/**
 * 保险模块 · 保险模块全量统计（/stats/overview）—— 纯绑定路由
 * 业务已下沉：controllers/hse-insurance.js → services/insuranceStatsService.js
 * 最终契约 /api/insurance/stats/overview
 */
const express = require('express');
const router = express.Router();

const { overviewStats } = require('../../controllers/hse-insurance');

router.get('/stats/overview', overviewStats);

module.exports = router;