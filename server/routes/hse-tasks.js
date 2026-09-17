/**
 * HSE 任务中心路由 —— 纯聚合入口（不再承载业务 handler）
 * 业务已按三层下沉至 services/hseTasksService.js
 *   + controllers/hseTasksController.js + routes/hse-tasks/main.js
 */
const express = require('express');
const router = express.Router();
router.use('/', require('./hse-tasks/main'));
module.exports = router;