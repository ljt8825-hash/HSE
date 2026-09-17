/**
 * AI 增强路由 —— 纯聚合入口（不再承载业务 handler）
 * 业务已按三层下沉至 services/aiEnhancedService.js
 *   + controllers/aiEnhancedController.js + routes/ai-enhanced/main.js
 */
const express = require('express');
const router = express.Router();
router.use('/', require('./ai-enhanced/main'));
module.exports = router;