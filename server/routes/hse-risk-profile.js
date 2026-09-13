/**
 * HSE 员工风险画像路由 —— 纯聚合入口（不再承载业务 handler）
 * 业务已按三层下沉至 services/hseRiskProfileService.js
 *   + controllers/hseRiskProfileController.js + routes/hse-risk-profile/main.js
 */
const express = require('express');
const router = express.Router();
router.use('/', require('./hse-risk-profile/main'));
module.exports = router;