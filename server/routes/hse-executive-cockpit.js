/**
 * 集团HSE智能驾驶舱路由 —— 纯聚合入口（不再承载业务 handler）
 * 业务已按三层下沉至 services/executiveCockpitService.js
 *   + controllers/executiveCockpitController.js + routes/hse-executive-cockpit/main.js
 */
const express = require('express');
const router = express.Router();
router.use('/', require('./hse-executive-cockpit/main'));
module.exports = router;