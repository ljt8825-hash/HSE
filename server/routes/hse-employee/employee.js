/**
 * HSE 员工域 · 员工 CRUD（employee 表，无 age，年龄由视图计算）—— 纯绑定路由
 * 业务已下沉：controllers/hse-employee.js（薄 handler）→ services/employeeService.js（业务+SQL）
 * 对外路由契约逐字节不变，由父路由 router.use('/', this) 挂载，
 * 最终契约 /api/hse/employee/employees(...)
 */
const express = require('express');
const router = express.Router();

const { decryptMiddleware } = require('../../middleware/encryption');
const { requireRole, requirePermission } = require('../../middleware/auth');
const { ENCRYPT_FIELDS } = require('./_shared');
const {
  listEmployees,
  getFilterOptions,
  getEmployeeStats,
  batchGetEmployees,
  batchGetEmployeesByBody,
  getEvents,
  getEmployeeProfile,
  listEmployeeHazards,
  listEmployeeAccidents,
  listEmployeeEmergencyPlans,
  listEmployeeTraining,
  listEmployeeViolations,
  getEmployeeDetail,
  createEmployee,
  updateEmployee,
  getRosterAuthority,
  deleteEmployee,
} = require('../../controllers/hse-employee');

// ============================================================
// 一、员工管理 (employee 表)
// ============================================================

// GET /employees — 分页查询员工列表（通过视图返回年龄）
router.get('/employees', decryptMiddleware(...ENCRYPT_FIELDS), listEmployees);

// GET /employees/filter-options — 筛选项动态化（提示词-92 任务1）
router.get('/employees/filter-options', getFilterOptions);

// GET /employees/stats — 员工统计
router.get('/employees/stats', getEmployeeStats);

// GET /employees/batch — 批量获取员工基础信息（GET query.ids）
router.get('/employees/batch', batchGetEmployees);

// POST /employees/batch — 批量获取员工基础信息（body { ids }）
router.post('/employees/batch', batchGetEmployeesByBody);

// GET /events — 员工事件轮询端点（P0-2）
router.get('/events', getEvents);

// ============================================================
// R1-Phase1 收尾 · 提示词-40 任务 C：员工主档案页
// GET /employees/:id/profile —— 完整档案（基本信息 + 组织岗位 + 关联业务统计）
// GET /employees/:id/{hazards,accidents,emergency-plans,training,violations} —— 关联业务列表（分页）
// ============================================================

// GET /employees/:id/profile — 员工主档案
router.get('/employees/:id/profile', getEmployeeProfile);

// 关联业务列表
router.get('/employees/:id/hazards', listEmployeeHazards);
router.get('/employees/:id/accidents', listEmployeeAccidents);
router.get('/employees/:id/emergency-plans', listEmployeeEmergencyPlans);
router.get('/employees/:id/training', listEmployeeTraining);
router.get('/employees/:id/violations', listEmployeeViolations);

// GET /employees/:id — 员工详情（含组织关系和年龄）
router.get('/employees/:id', decryptMiddleware(...ENCRYPT_FIELDS), getEmployeeDetail);

// POST /employees — 新增员工（纯身份数据）
router.post('/employees', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:create'), createEmployee);

// PUT /employees/:id — 更新员工信息
router.put('/employees/:id', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:update'), updateEmployee);

// GET /employees/:id/roster-authority — 员工「花名册权威状态」
router.get('/employees/:id/roster-authority', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:view'), getRosterAuthority);

// DELETE /employees/:id — 删除员工（软删除）
router.delete('/employees/:id', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:delete'), deleteEmployee);

module.exports = router;
