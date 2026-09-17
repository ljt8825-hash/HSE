/**
 * 规章制度路由 —— 纯聚合入口（不再承载业务 handler）
 * 业务已按三层下沉至 services/regulationsService.js
 *   + controllers/regulationsController.js + routes/regulations/main.js
 */
const express = require('express');
const router = express.Router();
router.use('/', require('./regulations/main'));
module.exports = router;