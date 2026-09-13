/**
 * HSE 员工档案中心 API（基于 v_employee_current 视图）—— 纯绑定路由
 * 业务已下沉：controllers/hse-profile-center.js（薄 handler）→ services/employeeProfileService.js（业务+SQL）
 * 对外路由契约逐字节不变，由父路由 router.use('/', this) 挂载，
 * 最终契约 /api/hse/employee/employees/profile(...) / roster-version(...)
 */
const express = require('express');
const router = express.Router();

const { decryptMiddleware } = require('../../middleware/encryption');
const { ENCRYPT_FIELDS } = require('./_shared');
const {
  getProfileList,
  getRosterVersion,
  getProfileDetail,
  getProfileAssignments,
  getDriverInfo,
} = require('../../controllers/hse-profile-center');

// GET /employees/profile/list — 员工档案列表（分页 + 搜索 + 筛选）
router.get('/employees/profile/list', decryptMiddleware(...ENCRYPT_FIELDS), getProfileList);

// GET /employees/profile/roster-version — 花名册名单版本号
router.get('/employees/profile/roster-version', getRosterVersion);

// GET /employees/profile/:id — 员工档案详情
router.get('/employees/profile/:id', decryptMiddleware(...ENCRYPT_FIELDS), getProfileDetail);

// GET /employees/profile/:id/assignments — 员工任职历史列表
router.get('/employees/profile/:id/assignments', getProfileAssignments);

// GET /employees/profile/:id/driver-info — 员工驾驶员信息（从 employee_assignment.remark 解析）
router.get('/employees/profile/:id/driver-info', getDriverInfo);

module.exports = router;