/**
 * 培训台账 OCR 路由 —— 纯聚合入口（不再承载业务 handler）
 * 业务已按三层下沉至 services/trainingOcrService.js
 *   + controllers/trainingOcrController.js + routes/training-ocr/main.js
 */
const express = require('express');
const router = express.Router();
router.use('/', require('./training-ocr/main'));
module.exports = router;