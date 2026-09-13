/**
 * HSE 检查管理中心 (inspection_plan / inspection_task / inspection_record / hazard_record / 检查模板 表)
 * —— 纯绑定路由
 * 业务已下沉：controllers/hse-inspection-center.js（薄 handler）→ services/inspectionCenterService.js（业务+SQL）
 * 对外路由契约逐字节不变，由父路由 router.use('/', this) 挂载，最终契约 /api/hse/employee/inspection-*(...) / hazard-records(...) / checklist-*(...)
 */
const express = require('express');
const router = express.Router();

const { requireRole, requirePermission } = require('../../middleware/auth');
const {
  listInspectionPlans,
  getInspectionPlanStats,
  getInspectionPlan,
  createInspectionPlan,
  updateInspectionPlan,
  deleteInspectionPlan,
  generateInspectionTasks,
  batchGenerateInspectionTasks,
  listInspectionTasks,
  getInspectionTaskStats,
  getInspectionTask,
  listInspectionTasksByAssignee,
  createInspectionTask,
  updateInspectionTask,
  startInspectionTask,
  completeInspectionTask,
  approveInspectionTask,
  deleteInspectionTask,
  listInspectionRecords,
  getInspectionRecordStats,
  getInspectionRecord,
  listInspectionRecordsByTask,
  listInspectionRecordsByEmployee,
  createInspectionRecord,
  updateInspectionRecord,
  deleteInspectionRecord,
  batchCreateInspectionRecords,
  listHazardRecords,
  getHazardRecordStats,
  listOpenHazardRecords,
  listOverdueHazardRecords,
  listHazardRecordsByTask,
  listHazardRecordsByResponsible,
  getHazardRecord,
  createHazardRecord,
  updateHazardRecord,
  assignHazardRecord,
  completeHazardRecord,
  reviewHazardRecord,
  closeHazardRecord,
  deleteHazardRecord,
  listChecklistTemplates,
  getChecklistTemplate,
  createChecklistTemplate,
  updateChecklistTemplate,
  deleteChecklistTemplate,
  applyChecklistTemplate,
  listChecklistItemsByTemplate,
  createChecklistItem,
  updateChecklistItem,
  deleteChecklistItem,
  batchCreateChecklistItems,
  listHazardRecordsBySource,
  createHazardRecordFromInspection,
  confirmHazardRecord,
} = require('../../controllers/hse-inspection-center');

// ============================================================
// 一、inspection_plan — 检查计划
// ============================================================

// GET /inspection-plans
router.get('/inspection-plans', requireRole('admin', 'safety_manager'), listInspectionPlans);

// GET /inspection-plans/stats
router.get('/inspection-plans/stats', requireRole('admin', 'safety_manager'), getInspectionPlanStats);

// GET /inspection-plans/:id
router.get('/inspection-plans/:id', requireRole('admin', 'safety_manager'), getInspectionPlan);

// POST /inspection-plans
router.post('/inspection-plans', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:create'), createInspectionPlan);

// PUT /inspection-plans/:id
router.put('/inspection-plans/:id', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:update'), updateInspectionPlan);

// DELETE /inspection-plans/:id
router.delete('/inspection-plans/:id', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:delete'), deleteInspectionPlan);

// POST /inspection-plans/:id/generate-tasks — 生成检查任务
router.post('/inspection-plans/:id/generate-tasks', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:create'), generateInspectionTasks);

// POST /inspection-plans/batch-generate
router.post('/inspection-plans/batch-generate', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:create'), batchGenerateInspectionTasks);

// ============================================================
// 二、inspection_task — 检查任务
// ============================================================

// GET /inspection-tasks
router.get('/inspection-tasks', requireRole('admin', 'safety_manager'), listInspectionTasks);

// GET /inspection-tasks/stats
router.get('/inspection-tasks/stats', requireRole('admin', 'safety_manager'), getInspectionTaskStats);

// GET /inspection-tasks/:id
router.get('/inspection-tasks/:id', requireRole('admin', 'safety_manager'), getInspectionTask);

// GET /inspection-tasks/assignee/:employeeId
router.get('/inspection-tasks/assignee/:employeeId', requireRole('admin', 'safety_manager'), listInspectionTasksByAssignee);

// POST /inspection-tasks
router.post('/inspection-tasks', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:create'), createInspectionTask);

// PUT /inspection-tasks/:id
router.put('/inspection-tasks/:id', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:update'), updateInspectionTask);

// PUT /inspection-tasks/:id/start
router.put('/inspection-tasks/:id/start', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:update'), startInspectionTask);

// PUT /inspection-tasks/:id/complete
router.put('/inspection-tasks/:id/complete', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:update'), completeInspectionTask);

// PUT /inspection-tasks/:id/approve
router.put('/inspection-tasks/:id/approve', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:update'), approveInspectionTask);

// DELETE /inspection-tasks/:id
router.delete('/inspection-tasks/:id', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:delete'), deleteInspectionTask);

// ============================================================
// 三、inspection_record — 检查记录
// ============================================================

// GET /inspection-records
router.get('/inspection-records', requireRole('admin', 'safety_manager'), listInspectionRecords);

// GET /inspection-records/stats
router.get('/inspection-records/stats', requireRole('admin', 'safety_manager'), getInspectionRecordStats);

// GET /inspection-records/:id
router.get('/inspection-records/:id', requireRole('admin', 'safety_manager'), getInspectionRecord);

// GET /inspection-records/task/:taskId
router.get('/inspection-records/task/:taskId', requireRole('admin', 'safety_manager'), listInspectionRecordsByTask);

// GET /inspection-records/employee/:employeeId
router.get('/inspection-records/employee/:employeeId', requireRole('admin', 'safety_manager'), listInspectionRecordsByEmployee);

// POST /inspection-records
router.post('/inspection-records', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:create'), createInspectionRecord);

// PUT /inspection-records/:id
router.put('/inspection-records/:id', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:update'), updateInspectionRecord);

// DELETE /inspection-records/:id
router.delete('/inspection-records/:id', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:delete'), deleteInspectionRecord);

// POST /inspection-records/batch-create
router.post('/inspection-records/batch-create', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:create'), batchCreateInspectionRecords);

// ============================================================
// 四、hazard_record — 隐患记录
// ============================================================

// GET /hazard-records
router.get('/hazard-records', requireRole('admin', 'safety_manager'), listHazardRecords);

// GET /hazard-records/stats
router.get('/hazard-records/stats', requireRole('admin', 'safety_manager'), getHazardRecordStats);

// GET /hazard-records/open（必须在 /:id 之前）
router.get('/hazard-records/open', requireRole('admin', 'safety_manager'), listOpenHazardRecords);

// GET /hazard-records/overdue（必须在 /:id 之前）
router.get('/hazard-records/overdue', requireRole('admin', 'safety_manager'), listOverdueHazardRecords);

// GET /hazard-records/task/:taskId（必须在 /:id 之前）
router.get('/hazard-records/task/:taskId', requireRole('admin', 'safety_manager'), listHazardRecordsByTask);

// GET /hazard-records/responsible/:employeeId（必须在 /:id 之前）
router.get('/hazard-records/responsible/:employeeId', requireRole('admin', 'safety_manager'), listHazardRecordsByResponsible);

// GET /hazard-records/:id
router.get('/hazard-records/:id', requireRole('admin', 'safety_manager'), getHazardRecord);

// POST /hazard-records
router.post('/hazard-records', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:create'), createHazardRecord);

// PUT /hazard-records/:id
router.put('/hazard-records/:id', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:update'), updateHazardRecord);

// PUT /hazard-records/:id/assign
router.put('/hazard-records/:id/assign', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:update'), assignHazardRecord);

// PUT /hazard-records/:id/complete
router.put('/hazard-records/:id/complete', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:update'), completeHazardRecord);

// PUT /hazard-records/:id/review
router.put('/hazard-records/:id/review', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:update'), reviewHazardRecord);

// PUT /hazard-records/:id/close
router.put('/hazard-records/:id/close', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:update'), closeHazardRecord);

// DELETE /hazard-records/:id
router.delete('/hazard-records/:id', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:delete'), deleteHazardRecord);

// ============================================================
// 五、检查清单模板 API
// ============================================================

// GET /checklist-templates
router.get('/checklist-templates', requireRole('admin', 'safety_manager'), listChecklistTemplates);

// GET /checklist-templates/:id
router.get('/checklist-templates/:id', requireRole('admin', 'safety_manager'), getChecklistTemplate);

// POST /checklist-templates
router.post('/checklist-templates', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:create'), createChecklistTemplate);

// PUT /checklist-templates/:id
router.put('/checklist-templates/:id', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:update'), updateChecklistTemplate);

// DELETE /checklist-templates/:id
router.delete('/checklist-templates/:id', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:delete'), deleteChecklistTemplate);

// POST /checklist-templates/:id/apply — 应用模板到计划
router.post('/checklist-templates/:id/apply', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:create'), applyChecklistTemplate);

// ============================================================
// 六、检查项模板 API
// ============================================================

// GET /checklist-items/template/:templateId
router.get('/checklist-items/template/:templateId', requireRole('admin', 'safety_manager'), listChecklistItemsByTemplate);

// POST /checklist-items
router.post('/checklist-items', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:create'), createChecklistItem);

// PUT /checklist-items/:id
router.put('/checklist-items/:id', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:update'), updateChecklistItem);

// DELETE /checklist-items/:id
router.delete('/checklist-items/:id', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:delete'), deleteChecklistItem);

// POST /checklist-items/batch-create
router.post('/checklist-items/batch-create', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:create'), batchCreateChecklistItems);

// ============================================================
// 七、隐患来源追踪 API
// ============================================================

// GET /hazard-records/source/:sourceType/:sourceId
router.get('/hazard-records/source/:sourceType/:sourceId', requireRole('admin', 'safety_manager'), listHazardRecordsBySource);

// POST /hazard-records/from-inspection — 从检查记录创建隐患
router.post('/hazard-records/from-inspection', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:create'), createHazardRecordFromInspection);

// PUT /hazard-records/:id/confirm — 确认隐患
router.put('/hazard-records/:id/confirm', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:update'), confirmHazardRecord);

module.exports = router;