/**
 * HSE 员工域 · 检查管理中心薄 controller
 * 仅做 req 解析 + 调 service + res 包装；业务规则与 SQL 在 services/inspectionCenterService.js
 */
const { isConnected } = require('../config/db');
const { success, error } = require('../middleware/response');
const { buildListResponse, buildDetailResponse, camelKeys } = require('../utils/commonResponse');
const { auditLog } = require('../routes/audit');
const inspectionCenterService = require('../services/inspectionCenterService');

// ============================================================
// 一、inspection_plan — 检查计划
// ============================================================

// GET /inspection-plans
async function listInspectionPlans(req, res) {
  try {
    if (!isConnected()) return buildListResponse(res, [], 0, 1, 20, undefined, { camelCase: true });
    const r = await inspectionCenterService.listInspectionPlans(req.query);
    buildListResponse(res, r.rows, r.total, r.pageNum, r.limitNum, undefined, { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
}

// GET /inspection-plans/stats
async function getInspectionPlanStats(req, res) {
  try {
    if (!isConnected()) return res.json(success(camelKeys({ total: 0, active: 0, routine: 0, special: 0, byCategory: [] })));
    const r = await inspectionCenterService.getInspectionPlanStats();
    res.json(success(camelKeys(r)));
  } catch (err) { res.json(error(-1, err.message)); }
}

// GET /inspection-plans/:id
async function getInspectionPlan(req, res) {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const r = await inspectionCenterService.getInspectionPlan(req.params.id);
    if (r.error) return res.json(error(r.error, r.message));
    buildDetailResponse(res, r.row, undefined, { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
}

// POST /inspection-plans
async function createInspectionPlan(req, res) {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const r = await inspectionCenterService.createInspectionPlan(req.body, req.user?.id || null);
    if (r.error) return res.json(error(r.error, r.message));
    await auditLog({ userId: req.user?.id, username: req.user?.username, action: 'create', module: '检查计划',
      description: `新增检查计划: ${r.audit.plan_name}`, ip: req.ip }).catch(() => {});
    buildDetailResponse(res, r.row, '新增成功', { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
}

// PUT /inspection-plans/:id
async function updateInspectionPlan(req, res) {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const r = await inspectionCenterService.updateInspectionPlan(req.params.id, req.body);
    if (r.error) return res.json(error(r.error, r.message));
    buildDetailResponse(res, r.row, '更新成功', { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
}

// DELETE /inspection-plans/:id
async function deleteInspectionPlan(req, res) {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const r = await inspectionCenterService.deleteInspectionPlan(req.params.id);
    if (r.error) return res.json(error(r.error, r.message));
    buildDetailResponse(res, r.row, '删除成功', { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
}

// POST /inspection-plans/:id/generate-tasks — 生成检查任务
async function generateInspectionTasks(req, res) {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const r = await inspectionCenterService.generateInspectionTasks(req.params.id, req.user?.id || null);
    if (r.error) return res.json(error(r.error, r.message));
    buildDetailResponse(res, r.row, '任务生成成功', { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
}

// POST /inspection-plans/batch-generate
async function batchGenerateInspectionTasks(req, res) {
  try {
    if (!isConnected()) return res.json(success(camelKeys({ generated: 0 }), '批量生成完成'));
    const r = await inspectionCenterService.batchGenerateInspectionTasks(req.user?.id || null);
    res.json(success(camelKeys(r), '批量生成完成'));
  } catch (err) { res.json(error(-1, err.message)); }
}

// ============================================================
// 二、inspection_task — 检查任务
// ============================================================

// GET /inspection-tasks
async function listInspectionTasks(req, res) {
  try {
    if (!isConnected()) return buildListResponse(res, [], 0, 1, 20, undefined, { camelCase: true });
    const r = await inspectionCenterService.listInspectionTasks(req.query);
    buildListResponse(res, r.rows, r.total, r.pageNum, r.limitNum, undefined, { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
}

// GET /inspection-tasks/stats
async function getInspectionTaskStats(req, res) {
  try {
    if (!isConnected()) return res.json(success(camelKeys({ total: 0, pending: 0, in_progress: 0, completed: 0, overdue: 0, byPriority: [] })));
    const r = await inspectionCenterService.getInspectionTaskStats();
    res.json(success(camelKeys(r)));
  } catch (err) { res.json(error(-1, err.message)); }
}

// GET /inspection-tasks/:id
async function getInspectionTask(req, res) {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const r = await inspectionCenterService.getInspectionTask(req.params.id);
    if (r.error) return res.json(error(r.error, r.message));
    buildDetailResponse(res, r.row, undefined, { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
}

// GET /inspection-tasks/assignee/:employeeId
async function listInspectionTasksByAssignee(req, res) {
  try {
    if (!isConnected()) return res.json(success(camelKeys([]), '查询成功'));
    const r = await inspectionCenterService.listInspectionTasksByAssignee(req.params.employeeId);
    res.json(success(r.map(camelKeys), '查询成功'));
  } catch (err) { res.json(error(-1, err.message)); }
}

// POST /inspection-tasks
async function createInspectionTask(req, res) {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const r = await inspectionCenterService.createInspectionTask(req.body, req.user?.id || null);
    if (r.error) return res.json(error(r.error, r.message));
    buildDetailResponse(res, r.row, '新增成功', { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
}

// PUT /inspection-tasks/:id
async function updateInspectionTask(req, res) {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const r = await inspectionCenterService.updateInspectionTask(req.params.id, req.body);
    if (r.error) return res.json(error(r.error, r.message));
    buildDetailResponse(res, r.row, '更新成功', { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
}

// PUT /inspection-tasks/:id/start
async function startInspectionTask(req, res) {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const r = await inspectionCenterService.startInspectionTask(req.params.id);
    if (r.error) return res.json(error(r.error, r.message));
    buildDetailResponse(res, r.row, '任务已开始', { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
}

// PUT /inspection-tasks/:id/complete
async function completeInspectionTask(req, res) {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const r = await inspectionCenterService.completeInspectionTask(req.params.id, req.body.result_summary);
    if (r.error) return res.json(error(r.error, r.message));
    buildDetailResponse(res, r.row, '任务已完成', { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
}

// PUT /inspection-tasks/:id/approve
async function approveInspectionTask(req, res) {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const r = await inspectionCenterService.approveInspectionTask(req.params.id, req.body, req.user?.id || null);
    if (r.error) return res.json(error(r.error, r.message));
    buildDetailResponse(res, r.row, '审批完成', { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
}

// DELETE /inspection-tasks/:id
async function deleteInspectionTask(req, res) {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const r = await inspectionCenterService.deleteInspectionTask(req.params.id);
    if (r.error) return res.json(error(r.error, r.message));
    buildDetailResponse(res, r.row, '删除成功', { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
}

// ============================================================
// 三、inspection_record — 检查记录
// ============================================================

// GET /inspection-records
async function listInspectionRecords(req, res) {
  try {
    if (!isConnected()) return buildListResponse(res, [], 0, 1, 20, undefined, { camelCase: true });
    const r = await inspectionCenterService.listInspectionRecords(req.query);
    buildListResponse(res, r.rows, r.total, r.pageNum, r.limitNum, undefined, { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
}

// GET /inspection-records/stats
async function getInspectionRecordStats(req, res) {
  try {
    if (!isConnected()) return res.json(success(camelKeys({ total: 0, passed: 0, failed: 0, hazards_found: 0, byCategory: [] })));
    const r = await inspectionCenterService.getInspectionRecordStats();
    res.json(success(camelKeys(r)));
  } catch (err) { res.json(error(-1, err.message)); }
}

// GET /inspection-records/:id
async function getInspectionRecord(req, res) {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const r = await inspectionCenterService.getInspectionRecord(req.params.id);
    if (r.error) return res.json(error(r.error, r.message));
    buildDetailResponse(res, r.row, undefined, { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
}

// GET /inspection-records/task/:taskId
async function listInspectionRecordsByTask(req, res) {
  try {
    if (!isConnected()) return res.json(success(camelKeys([]), '查询成功'));
    const r = await inspectionCenterService.listInspectionRecordsByTask(req.params.taskId);
    res.json(success(r.map(camelKeys), '查询成功'));
  } catch (err) { res.json(error(-1, err.message)); }
}

// GET /inspection-records/employee/:employeeId
async function listInspectionRecordsByEmployee(req, res) {
  try {
    if (!isConnected()) return res.json(success(camelKeys([]), '查询成功'));
    const r = await inspectionCenterService.listInspectionRecordsByEmployee(req.params.employeeId);
    res.json(success(r.map(camelKeys), '查询成功'));
  } catch (err) { res.json(error(-1, err.message)); }
}

// POST /inspection-records
async function createInspectionRecord(req, res) {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const r = await inspectionCenterService.createInspectionRecord(req.body, req.user?.id || null);
    if (r.error) return res.json(error(r.error, r.message));
    buildDetailResponse(res, r.row, '新增成功', { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
}

// PUT /inspection-records/:id
async function updateInspectionRecord(req, res) {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const r = await inspectionCenterService.updateInspectionRecord(req.params.id, req.body);
    if (r.error) return res.json(error(r.error, r.message));
    buildDetailResponse(res, r.row, '更新成功', { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
}

// DELETE /inspection-records/:id
async function deleteInspectionRecord(req, res) {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const r = await inspectionCenterService.deleteInspectionRecord(req.params.id);
    if (r.error) return res.json(error(r.error, r.message));
    buildDetailResponse(res, r.row, '删除成功', { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
}

// POST /inspection-records/batch-create
async function batchCreateInspectionRecords(req, res) {
  try {
    if (!isConnected()) return res.json(success(camelKeys({ total: 0, success: 0, failed: 0, errors: [] }), '批量创建完成'));
    const r = await inspectionCenterService.batchCreateInspectionRecords(req.body);
    if (r.error) return res.json(error(r.error, r.message));
    res.json(success(camelKeys(r), '批量创建完成'));
  } catch (err) { res.json(error(-1, err.message)); }
}

// ============================================================
// 四、hazard_record — 隐患记录
// ============================================================

// GET /hazard-records
async function listHazardRecords(req, res) {
  try {
    if (!isConnected()) return buildListResponse(res, [], 0, 1, 20, undefined, { camelCase: true });
    const r = await inspectionCenterService.listHazardRecords(req.query);
    buildListResponse(res, r.rows, r.total, r.pageNum, r.limitNum, undefined, { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
}

// GET /hazard-records/stats
async function getHazardRecordStats(req, res) {
  try {
    if (!isConnected()) return res.json(success(camelKeys({ total: 0, open_count: 0, in_progress: 0, closed: 0, overdue: 0, byLevel: [], byCategory: [] })));
    const r = await inspectionCenterService.getHazardRecordStats();
    res.json(success(camelKeys(r)));
  } catch (err) { res.json(error(-1, err.message)); }
}

// GET /hazard-records/open
async function listOpenHazardRecords(req, res) {
  try {
    if (!isConnected()) return res.json(success(camelKeys([]), '查询成功'));
    const r = await inspectionCenterService.listOpenHazardRecords();
    res.json(success(r.map(camelKeys), '查询成功'));
  } catch (err) { res.json(error(-1, err.message)); }
}

// GET /hazard-records/overdue
async function listOverdueHazardRecords(req, res) {
  try {
    if (!isConnected()) return res.json(success(camelKeys([]), '查询成功'));
    const r = await inspectionCenterService.listOverdueHazardRecords();
    res.json(success(r.map(camelKeys), '查询成功'));
  } catch (err) { res.json(error(-1, err.message)); }
}

// GET /hazard-records/task/:taskId
async function listHazardRecordsByTask(req, res) {
  try {
    if (!isConnected()) return res.json(success(camelKeys([]), '查询成功'));
    const r = await inspectionCenterService.listHazardRecordsByTask(req.params.taskId);
    res.json(success(r.map(camelKeys), '查询成功'));
  } catch (err) { res.json(error(-1, err.message)); }
}

// GET /hazard-records/responsible/:employeeId
async function listHazardRecordsByResponsible(req, res) {
  try {
    if (!isConnected()) return res.json(success(camelKeys([]), '查询成功'));
    const r = await inspectionCenterService.listHazardRecordsByResponsible(req.params.employeeId);
    res.json(success(r.map(camelKeys), '查询成功'));
  } catch (err) { res.json(error(-1, err.message)); }
}

// GET /hazard-records/:id
async function getHazardRecord(req, res) {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const r = await inspectionCenterService.getHazardRecord(req.params.id);
    if (r.error) return res.json(error(r.error, r.message));
    buildDetailResponse(res, r.row, undefined, { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
}

// POST /hazard-records
async function createHazardRecord(req, res) {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const r = await inspectionCenterService.createHazardRecord(req.body, req.user?.id || null);
    if (r.error) return res.json(error(r.error, r.message));
    buildDetailResponse(res, r.row, '新增成功', { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
}

// PUT /hazard-records/:id
async function updateHazardRecord(req, res) {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const r = await inspectionCenterService.updateHazardRecord(req.params.id, req.body);
    if (r.error) return res.json(error(r.error, r.message));
    buildDetailResponse(res, r.row, '更新成功', { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
}

// PUT /hazard-records/:id/assign
async function assignHazardRecord(req, res) {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const r = await inspectionCenterService.assignHazardRecord(req.params.id, req.body);
    if (r.error) return res.json(error(r.error, r.message));
    buildDetailResponse(res, r.row, '分配成功', { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
}

// PUT /hazard-records/:id/complete
async function completeHazardRecord(req, res) {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const r = await inspectionCenterService.completeHazardRecord(req.params.id, req.body);
    if (r.error) return res.json(error(r.error, r.message));
    buildDetailResponse(res, r.row, '整改完成，待复查', { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
}

// PUT /hazard-records/:id/review
async function reviewHazardRecord(req, res) {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const r = await inspectionCenterService.reviewHazardRecord(req.params.id, req.body, req.user?.id || null);
    if (r.error) return res.json(error(r.error, r.message));
    buildDetailResponse(res, r.row, `复查${r.reviewStatus === 'passed' ? '通过' : '不通过'}`, { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
}

// PUT /hazard-records/:id/close
async function closeHazardRecord(req, res) {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const r = await inspectionCenterService.closeHazardRecord(req.params.id);
    if (r.error) return res.json(error(r.error, r.message));
    buildDetailResponse(res, r.row, '已关闭', { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
}

// DELETE /hazard-records/:id
async function deleteHazardRecord(req, res) {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const r = await inspectionCenterService.deleteHazardRecord(req.params.id);
    if (r.error) return res.json(error(r.error, r.message));
    buildDetailResponse(res, r.row, '删除成功', { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
}

// ============================================================
// 五、检查清单模板 API
// ============================================================

// GET /checklist-templates
async function listChecklistTemplates(req, res) {
  try {
    if (!isConnected()) return buildListResponse(res, [], 0, 1, 20, undefined, { camelCase: true });
    const r = await inspectionCenterService.listChecklistTemplates(req.query);
    buildListResponse(res, r.rows, r.total, r.pageNum, r.limitNum, undefined, { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
}

// GET /checklist-templates/:id
async function getChecklistTemplate(req, res) {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const r = await inspectionCenterService.getChecklistTemplate(req.params.id);
    if (r.error) return res.json(error(r.error, r.message));
    res.json(success(camelKeys(r.row)));
  } catch (err) { res.json(error(-1, err.message)); }
}

// POST /checklist-templates
async function createChecklistTemplate(req, res) {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const r = await inspectionCenterService.createChecklistTemplate(req.body, req.user?.id || null);
    if (r.error) return res.json(error(r.error, r.message));
    buildDetailResponse(res, r.row, '新增成功', { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
}

// PUT /checklist-templates/:id
async function updateChecklistTemplate(req, res) {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const r = await inspectionCenterService.updateChecklistTemplate(req.params.id, req.body);
    if (r.error) return res.json(error(r.error, r.message));
    buildDetailResponse(res, r.row, '更新成功', { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
}

// DELETE /checklist-templates/:id
async function deleteChecklistTemplate(req, res) {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const r = await inspectionCenterService.deleteChecklistTemplate(req.params.id);
    if (r.error) return res.json(error(r.error, r.message));
    buildDetailResponse(res, r.row, '删除成功', { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
}

// POST /checklist-templates/:id/apply — 应用模板到计划
async function applyChecklistTemplate(req, res) {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const r = await inspectionCenterService.applyChecklistTemplate(req.params.id, req.body);
    if (r.error) return res.json(error(r.error, r.message));
    res.json(success(camelKeys(r.row), '模板已应用到计划'));
  } catch (err) { res.json(error(-1, err.message)); }
}

// ============================================================
// 六、检查项模板 API
// ============================================================

// GET /checklist-items/template/:templateId
async function listChecklistItemsByTemplate(req, res) {
  try {
    if (!isConnected()) return res.json(success(camelKeys([]), '查询成功'));
    const r = await inspectionCenterService.listChecklistItemsByTemplate(req.params.templateId);
    res.json(success(r.map(camelKeys), '查询成功'));
  } catch (err) { res.json(error(-1, err.message)); }
}

// POST /checklist-items
async function createChecklistItem(req, res) {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const r = await inspectionCenterService.createChecklistItem(req.body, req.user?.id || null);
    if (r.error) return res.json(error(r.error, r.message));
    buildDetailResponse(res, r.row, '新增成功', { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
}

// PUT /checklist-items/:id
async function updateChecklistItem(req, res) {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const r = await inspectionCenterService.updateChecklistItem(req.params.id, req.body);
    if (r.error) return res.json(error(r.error, r.message));
    buildDetailResponse(res, r.row, '更新成功', { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
}

// DELETE /checklist-items/:id
async function deleteChecklistItem(req, res) {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const r = await inspectionCenterService.deleteChecklistItem(req.params.id);
    if (r.error) return res.json(error(r.error, r.message));
    buildDetailResponse(res, r.row, '删除成功', { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
}

// POST /checklist-items/batch-create
async function batchCreateChecklistItems(req, res) {
  try {
    if (!isConnected()) return res.json(success(camelKeys({ total: 0, success: 0, failed: 0 }), '批量创建完成'));
    const r = await inspectionCenterService.batchCreateChecklistItems(req.body, req.user?.id || null);
    if (r.error) return res.json(error(r.error, r.message));
    res.json(success(camelKeys(r), '批量创建完成'));
  } catch (err) { res.json(error(-1, err.message)); }
}

// ============================================================
// 七、隐患来源追踪 API
// ============================================================

// GET /hazard-records/source/:sourceType/:sourceId
async function listHazardRecordsBySource(req, res) {
  try {
    if (!isConnected()) return res.json(success(camelKeys([]), '查询成功'));
    const r = await inspectionCenterService.listHazardRecordsBySource(req.params.sourceType, req.params.sourceId);
    if (r.error) return res.json(error(r.error, r.message));
    res.json(success(r.map(camelKeys), '查询成功'));
  } catch (err) { res.json(error(-1, err.message)); }
}

// POST /hazard-records/from-inspection — 从检查记录创建隐患
async function createHazardRecordFromInspection(req, res) {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const r = await inspectionCenterService.createHazardRecordFromInspection(req.body, req.user?.id || null);
    if (r.error) return res.json(error(r.error, r.message));
    buildDetailResponse(res, r.row, '隐患创建成功', { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
}

// PUT /hazard-records/:id/confirm — 确认隐患
async function confirmHazardRecord(req, res) {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const r = await inspectionCenterService.confirmHazardRecord(req.params.id, req.user?.id || null);
    if (r.error) return res.json(error(r.error, r.message));
    buildDetailResponse(res, r.row, '确认成功', { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
}

module.exports = {
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
};