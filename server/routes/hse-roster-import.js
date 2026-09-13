/**
 * 花名册导入路由 —— 纯聚合入口（不再承载业务 handler）
 * 业务已按三层下沉至 services/rosterImportService.js + controllers/rosterImportController.js
 *   + routes/hse-roster-import/main.js
 */
const express = require('express');
const router = express.Router();
router.use('/', require('./hse-roster-import/main'));
module.exports = router;