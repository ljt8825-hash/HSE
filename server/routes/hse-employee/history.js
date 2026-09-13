/**
 * HSE 员工域 · 人事变动记录（employee_history 表）—— 纯绑定路由
 * 业务已下沉：controllers/hse-history.js（薄 handler）→ services/employeeHistoryService.js（业务+SQL）
 * 对外路由契约逐字节不变，由父路由 router.use('/', this) 挂载，
 * 最终契约 /api/hse/employee/history/employee/:employeeId
 */
const express = require('express');
const router = express.Router();

const { listEmployeeHistory } = require('../../controllers/hse-history');

// GET /history/employee/:employeeId — 员工人事变动历史
router.get('/history/employee/:employeeId', listEmployeeHistory);

module.exports = router;
