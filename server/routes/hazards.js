/**
 * 隐患排查治理路由 —— 纯聚合入口（不再承载业务 handler）
 * 业务已按三层下沉至 services/hazardService.js + controllers/hazardController.js + routes/hazards/main.js
 */
const express = require('express');
const router = express.Router();
router.use('/', require('./hazards/main'));
module.exports = router;