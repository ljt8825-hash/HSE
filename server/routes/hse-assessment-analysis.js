/**
 * 集团HSE考核分析中心路由 —— 纯聚合入口（不再承载业务 handler）
 * 业务已按三层下沉至 services/hseAssessmentAnalysisService.js
 *   + controllers/hseAssessmentAnalysisController.js + routes/hse-assessment-analysis/main.js
 */
const express = require('express');
const router = express.Router();
router.use('/', require('./hse-assessment-analysis/main'));
module.exports = router;