/**
 * 隐患整改闭环路由 —— 纯聚合入口（不再承载业务 handler）
 * 业务已按三层下沉至 services/hazardRectificationService.js
 *   + controllers/hazardRectificationController.js + routes/hse-hazard-rectification/main.js
 */
const express = require('express');
const router = express.Router();
router.use('/', require('./hse-hazard-rectification/main'));
module.exports = router;