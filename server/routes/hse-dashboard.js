/**
 * HSE 综合驾驶舱路由 —— 纯聚合入口（不再承载业务 handler）
 * 业务已按三层下沉至 services/hseDashboardService.js
 *   + controllers/hseDashboardController.js + routes/hse-dashboard/main.js
 */
const express = require('express');
const router = express.Router();
router.use('/', require('./hse-dashboard/main'));
module.exports = router;