/**
 * 岗位体系 + 责任体系路由 —— 纯聚合入口（不再承载业务 handler）
 * 业务已按三层下沉至 services/positionResponsibilityService.js
 *   + controllers/positionResponsibilityController.js + routes/hse-position-responsibility/main.js
 */
const express = require('express');
const router = express.Router();
router.use('/', require('./hse-position-responsibility/main'));
module.exports = router;