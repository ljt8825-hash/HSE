/**
 * HSE 一人一档 & 岗位安全画像 (employee_safety_profile / position_safety_profile 表) —— 纯绑定路由
 * 业务已下沉：controllers/hse-safety-profiles.js（薄 handler）→ services/safetyProfileService.js（业务+SQL）
 * 对外路由契约逐字节不变，由父路由 router.use('/', this) 挂载，
 * 最终契约 /api/hse/employee/safety-profiles(...) / position-safety-profiles(...)
 */
const express = require('express');
const router = express.Router();

const { requireRole, requirePermission } = require('../../middleware/auth');
const {
  listSafetyProfiles,
  getSafetyProfileStats,
  getEmployeeSafetyProfile,
  assessEmployeeRisk,
  updateSafetyProfile,
  batchAssessSafetyProfiles,
  listPositionSafetyProfiles,
  getPositionSafetyProfileStats,
  getPositionSafetyProfile,
  getPositionSafetyProfileByPosition,
  upsertPositionSafetyProfile,
  updatePositionSafetyProfile,
  deletePositionSafetyProfile,
  batchAssessPositionSafetyProfiles,
} = require('../../controllers/hse-safety-profiles');

// GET /safety-profiles — 分页查询一人一档
router.get('/safety-profiles', listSafetyProfiles);

// GET /safety-profiles/stats — 一人一档统计
router.get('/safety-profiles/stats', getSafetyProfileStats);

// GET /safety-profiles/employee/:employeeId — 查询某员工一人一档
router.get('/safety-profiles/employee/:employeeId', getEmployeeSafetyProfile);

// POST /safety-profiles/employee/:employeeId/assess — 手动触发风险评估
router.post('/safety-profiles/employee/:employeeId/assess', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:create'), assessEmployeeRisk);

// PUT /safety-profiles/:id — 更新风险画像
router.put('/safety-profiles/:id', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:update'), updateSafetyProfile);

// POST /safety-profiles/batch-assess — 批量风险评估
router.post('/safety-profiles/batch-assess', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:create'), batchAssessSafetyProfiles);

// GET /position-safety-profiles — 分页查询岗位安全画像
router.get('/position-safety-profiles', listPositionSafetyProfiles);

// GET /position-safety-profiles/stats — 岗位安全画像统计
router.get('/position-safety-profiles/stats', getPositionSafetyProfileStats);

// GET /position-safety-profiles/:id — 岗位安全画像详情
router.get('/position-safety-profiles/:id', getPositionSafetyProfile);

// GET /position-safety-profiles/position/:positionId — 查询某岗位的安全画像
router.get('/position-safety-profiles/position/:positionId', getPositionSafetyProfileByPosition);

// POST /position-safety-profiles — 新增/更新岗位安全画像
router.post('/position-safety-profiles', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:create'), upsertPositionSafetyProfile);

// PUT /position-safety-profiles/:id — 更新岗位安全画像
router.put('/position-safety-profiles/:id', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:update'), updatePositionSafetyProfile);

// DELETE /position-safety-profiles/:id — 软删除岗位安全画像
router.delete('/position-safety-profiles/:id', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:delete'), deletePositionSafetyProfile);

// POST /position-safety-profiles/batch-assess — 批量岗位风险评估
router.post('/position-safety-profiles/batch-assess', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:create'), batchAssessPositionSafetyProfiles);

module.exports = router;
