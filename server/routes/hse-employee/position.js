/**
 * HSE 员工域 · 岗位管理（position 表）—— 纯绑定路由
 * 业务已下沉：controllers/hse-position.js（薄 handler）→ services/positionService.js（业务+SQL）
 * 对外路由契约逐字节不变，由父路由 router.use('/', this) 挂载，
 * 最终契约 /api/hse/employee/positions(...)
 */
const express = require('express');
const router = express.Router();

const { requireRole, requirePermission } = require('../../middleware/auth');
const {
  listPositions,
  createPosition,
  updatePosition,
  deletePosition,
} = require('../../controllers/hse-position');

// GET /positions — 岗位列表
router.get('/positions', listPositions);

// POST /positions — 新增岗位
router.post('/positions', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:create'), createPosition);

// PUT /positions/:id — 更新岗位
router.put('/positions/:id', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:update'), updatePosition);

// DELETE /positions/:id — 删除岗位（软删除）
router.delete('/positions/:id', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:delete'), deletePosition);

module.exports = router;
