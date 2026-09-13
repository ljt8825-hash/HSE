/**
 * 制度标准路由 —— 纯聚合入口（不再承载业务 handler）
 * 业务已按三层下沉至 services/standardsService.js + controllers/standardsController.js + routes/standards/main.js
 */
const express = require('express');
const router = express.Router();
router.use('/', require('./standards/main'));
module.exports = router;