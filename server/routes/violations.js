/**
 * 三违记录路由 —— 纯聚合入口（不再承载业务 handler）
 * 业务已按三层下沉至 services/violationService.js + controllers/violationController.js + routes/violations/main.js
 */
const express = require('express');
const router = express.Router();
router.use('/', require('./violations/main'));
module.exports = router;