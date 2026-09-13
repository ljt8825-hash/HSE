/**
 * HSE 员工域 · 组织树管理（department 表，五级树形：集团/区域/企业/项目/班组）—— 纯绑定路由
 * 业务已下沉：controllers/hse-org-tree.js（薄 handler）→ services/orgTreeService.js（业务+SQL）
 * 对外路由契约逐字节不变，由父路由 router.use('/', this) 挂载，
 * 最终契约 /api/hse/employee/departments(...)
 */
const express = require('express');
const router = express.Router();

const { decryptMiddleware } = require('../../middleware/encryption');
const { requireRole, requirePermission } = require('../../middleware/auth');
const { ENCRYPT_FIELDS } = require('./_shared');
const {
  getOrgTree,
  listDepartments,
  listDepartmentEmployees,
  createDepartment,
  updateDepartment,
  deleteDepartment,
} = require('../../controllers/hse-org-tree');

// GET /departments/tree — 重组部门树（阶段1：hse_org_unit 骨架 + department 班组叶子）
router.get('/departments/tree', getOrgTree);

// GET /departments — 部门扁平列表
router.get('/departments', listDepartments);

// GET /departments/:id/employees — 查询部门下的员工列表
router.get('/departments/:id/employees', decryptMiddleware(...ENCRYPT_FIELDS), listDepartmentEmployees);

// POST /departments — 新增部门
router.post('/departments', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:create'), createDepartment);

// PUT /departments/:id — 更新部门
router.put('/departments/:id', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:update'), updateDepartment);

// DELETE /departments/:id — 删除部门（软删除）
router.delete('/departments/:id', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:delete'), deleteDepartment);

module.exports = router;
