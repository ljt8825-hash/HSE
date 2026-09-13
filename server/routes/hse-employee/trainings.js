/**
 * HSE 培训域 (position_training_requirement / training_record / employee_induction_training / employee_training_status 表)
 * 纯绑定路由 —— 业务已下沉：controllers/hse-trainings.js（薄 handler）→ services/trainingService.js（业务+SQL）
 * 保持对外路由契约逐字节不变，由父路由 router.use('/', this) 挂载，最终契约 /api/hse/employee/... 下各培训端点
 */
const express = require('express');
const router = express.Router();

const { requireRole, requirePermission } = require('../../middleware/auth');
const {
  listPositionTrainingRequirements,
  getPositionTrainingRequirementsStats,
  getPositionTrainingRequirement,
  listPositionTrainingRequirementsByPosition,
  createPositionTrainingRequirement,
  updatePositionTrainingRequirement,
  deletePositionTrainingRequirement,
  batchImportPositionTrainingRequirements,
  listTrainingRecords,
  getTrainingRecordsStats,
  getTrainingRecord,
  listTrainingRecordsByEmployee,
  createTrainingRecord,
  updateTrainingRecord,
  deleteTrainingRecord,
  batchImportTrainingRecords,
  listInductionTrainings,
  getInductionTrainingsStats,
  getInductionTraining,
  getInductionTrainingByEmployee,
  createInductionTraining,
  updateInductionTraining,
  completeInductionLevel,
  deleteInductionTraining,
  listTrainingStatus,
  getTrainingStatusStats,
  listNonCompliantTrainingStatus,
  listExpiringTrainingStatus,
  getTrainingStatus,
  listTrainingStatusByEmployee,
  analyzeTrainingCompliance,
  batchAnalyzeTrainingCompliance,
} = require('../../controllers/hse-trainings');

// GET /position-training-requirements — 分页查询岗位培训要求
router.get('/position-training-requirements', listPositionTrainingRequirements);

// GET /position-training-requirements/stats — 岗位培训要求统计
router.get('/position-training-requirements/stats', getPositionTrainingRequirementsStats);

// GET /position-training-requirements/:id — 岗位培训要求详情
router.get('/position-training-requirements/:id', getPositionTrainingRequirement);

// GET /position-training-requirements/position/:positionId — 查询某岗位的培训要求
router.get('/position-training-requirements/position/:positionId', listPositionTrainingRequirementsByPosition);

// POST /position-training-requirements — 新增岗位培训要求
router.post('/position-training-requirements', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:create'), createPositionTrainingRequirement);

// PUT /position-training-requirements/:id — 更新岗位培训要求
router.put('/position-training-requirements/:id', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:update'), updatePositionTrainingRequirement);

// DELETE /position-training-requirements/:id — 软删除岗位培训要求
router.delete('/position-training-requirements/:id', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:delete'), deletePositionTrainingRequirement);

// POST /position-training-requirements/batch-import — 批量导入岗位培训要求
router.post('/position-training-requirements/batch-import', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:import'), batchImportPositionTrainingRequirements);

// ============================================================
// Sprint5.3 员工安全能力中心 API
// ============================================================

// 一、training_record — 员工培训台账

// GET /training-records — 分页查询培训台账
router.get('/training-records', requireRole('admin', 'safety_manager', 'hr'), listTrainingRecords);

// GET /training-records/stats — 培训台账统计
router.get('/training-records/stats', requireRole('admin', 'safety_manager', 'hr'), getTrainingRecordsStats);

// GET /training-records/:id — 培训台账详情
router.get('/training-records/:id', requireRole('admin', 'safety_manager', 'hr'), getTrainingRecord);

// GET /training-records/employee/:employeeId — 查询员工培训记录
router.get('/training-records/employee/:employeeId', requireRole('admin', 'safety_manager', 'hr'), listTrainingRecordsByEmployee);

// POST /training-records — 新增培训记录
router.post('/training-records', requireRole('admin', 'safety_manager', 'hr'), requirePermission('hse:personnel:create'), createTrainingRecord);

// PUT /training-records/:id — 更新培训记录
router.put('/training-records/:id', requireRole('admin', 'safety_manager', 'hr'), requirePermission('hse:personnel:update'), updateTrainingRecord);

// DELETE /training-records/:id — 删除培训记录
router.delete('/training-records/:id', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:delete'), deleteTrainingRecord);

// POST /training-records/batch-import — 批量导入培训记录
router.post('/training-records/batch-import', requireRole('admin', 'safety_manager', 'hr'), requirePermission('hse:personnel:import'), batchImportTrainingRecords);

// ============================================================
// 二、employee_induction_training — 新员工入职培训
// ============================================================

// GET /induction-trainings — 分页查询新员工培训
router.get('/induction-trainings', requireRole('admin', 'safety_manager', 'hr'), listInductionTrainings);

// GET /induction-trainings/stats — 新员工培训统计
router.get('/induction-trainings/stats', requireRole('admin', 'safety_manager', 'hr'), getInductionTrainingsStats);

// GET /induction-trainings/:id — 新员工培训详情
router.get('/induction-trainings/:id', requireRole('admin', 'safety_manager', 'hr'), getInductionTraining);

// GET /induction-trainings/employee/:employeeId — 查询员工入职培训
router.get('/induction-trainings/employee/:employeeId', requireRole('admin', 'safety_manager', 'hr'), getInductionTrainingByEmployee);

// POST /induction-trainings — 新增入职培训记录
router.post('/induction-trainings', requireRole('admin', 'safety_manager', 'hr'), requirePermission('hse:personnel:create'), createInductionTraining);

// PUT /induction-trainings/:id — 更新入职培训记录
router.put('/induction-trainings/:id', requireRole('admin', 'safety_manager', 'hr'), requirePermission('hse:personnel:update'), updateInductionTraining);

// POST /induction-trainings/:id/complete-level — 完成某一级培训
router.post('/induction-trainings/:id/complete-level', requireRole('admin', 'safety_manager', 'hr'), requirePermission('hse:personnel:update'), completeInductionLevel);

// DELETE /induction-trainings/:id — 删除入职培训记录
router.delete('/induction-trainings/:id', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:delete'), deleteInductionTraining);

// ============================================================
// 三、employee_training_status — 培训状态统计
// ============================================================

// GET /training-status — 分页查询培训状态
router.get('/training-status', requireRole('admin', 'safety_manager', 'hr'), listTrainingStatus);

// GET /training-status/stats — 培训状态统计
router.get('/training-status/stats', requireRole('admin', 'safety_manager', 'hr'), getTrainingStatusStats);

// GET /training-status/non-compliant — 不合规员工列表（必须在 /:id 之前）
router.get('/training-status/non-compliant', requireRole('admin', 'safety_manager', 'hr'), listNonCompliantTrainingStatus);

// GET /training-status/expiring — 即将到期培训列表（必须在 /:id 之前）
router.get('/training-status/expiring', requireRole('admin', 'safety_manager', 'hr'), listExpiringTrainingStatus);

// GET /training-status/:id — 培训状态详情
router.get('/training-status/:id', requireRole('admin', 'safety_manager', 'hr'), getTrainingStatus);

// GET /training-status/employee/:employeeId — 查询员工培训状态
router.get('/training-status/employee/:employeeId', requireRole('admin', 'safety_manager', 'hr'), listTrainingStatusByEmployee);

// POST /training-status/analyze — 执行培训合规分析
router.post('/training-status/analyze', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:create'), analyzeTrainingCompliance);

// POST /training-status/batch-analyze — 批量培训合规分析
router.post('/training-status/batch-analyze', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:create'), batchAnalyzeTrainingCompliance);

module.exports = router;