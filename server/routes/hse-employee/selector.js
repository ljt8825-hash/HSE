/**
 * HSE 员工公共选择 API（用于培训/保险/三违/隐患/消防等模块）—— 纯绑定路由
 * 业务已下沉：controllers/hse-selector.js（薄 handler）→ services/employeeSelectorService.js（业务+SQL）
 * 对外路由契约逐字节不变，由父路由 router.use('/', this) 挂载，
 * 最终契约 /api/hse/employee/employees/selector(...)
 */
const express = require('express');
const router = express.Router();

const {
  listSelector,
  getSelectorById,
  batchSelector,
} = require('../../controllers/hse-selector');

// GET /employees/selector — 员工选择列表（精简字段，支持关键词搜索 + 组织/岗位/驾驶员筛选）
router.get('/employees/selector', listSelector);

// GET /employees/selector/:id — 员工选择单条查询（用于已选择员工的回显）
router.get('/employees/selector/:id', getSelectorById);

// POST /employees/selector/batch — 员工选择批量查询（用于批量回显，如培训人员列表）
router.post('/employees/selector/batch', batchSelector);

module.exports = router;
