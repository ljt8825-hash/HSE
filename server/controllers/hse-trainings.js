/**
 * HSE 培训域薄 controller
 * 仅做 req 解析 + 调 service + res 包装；业务规则与 SQL 在 services/trainingService.js
 */
const { isConnected } = require('../config/db');
const { success, error } = require('../middleware/response');
const { buildListResponse, buildDetailResponse, camelKeys } = require('../utils/commonResponse');
const { auditLog } = require('../routes/audit');
const trainingService = require('../services/trainingService');


// ============================================================
// 一、position_training_requirement — 岗位培训要求
// ============================================================

// GET /position-training-requirements — 分页查询岗位培训要求
async function listPositionTrainingRequirements(req, res) {
  try {
    if (!isConnected()) return buildListResponse(res, [], 0, 1, 20, undefined, { camelCase: true });
    const result = await trainingService.listPositionTrainingRequirements(req.query);
    buildListResponse(res, result.rows, result.total, result.pageNum, result.limitNum, undefined, { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

// GET /position-training-requirements/stats — 岗位培训要求统计
async function getPositionTrainingRequirementsStats(req, res) {
  try {
    if (!isConnected()) return res.json(success(camelKeys({ total: 0, byCategory: {}, byFrequency: {}, byMandatory: {} })));
    const result = await trainingService.getPositionTrainingRequirementsStats();
    res.json(success(camelKeys(result)));
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

// GET /position-training-requirements/:id — 岗位培训要求详情
async function getPositionTrainingRequirement(req, res) {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const result = await trainingService.getPositionTrainingRequirement(req.params.id);
    if (result.error) return res.json(error(result.error, result.message));
    buildDetailResponse(res, result.row, undefined, { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

// GET /position-training-requirements/position/:positionId — 查询某岗位的培训要求
async function listPositionTrainingRequirementsByPosition(req, res) {
  try {
    if (!isConnected()) return res.json(success(camelKeys({ list: [], total: 0, position: null })));
    const result = await trainingService.listPositionTrainingRequirementsByPosition(req.params.positionId);
    res.json(success(camelKeys(result)));
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

// POST /position-training-requirements — 新增岗位培训要求
async function createPositionTrainingRequirement(req, res) {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const result = await trainingService.createPositionTrainingRequirement(req.body, req.user?.id || null);
    if (result.error) return res.json(error(result.error, result.message));
    await auditLog({
      userId: req.user?.id, username: req.user?.username,
      action: 'create', module: '岗位培训要求',
      description: `新增岗位培训要求: ${result.audit.training_type} (岗位ID: ${result.audit.position_id})`,
      ip: req.ip,
    }).catch(() => {});
    buildDetailResponse(res, result.row, '新增成功', { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

// PUT /position-training-requirements/:id — 更新岗位培训要求
async function updatePositionTrainingRequirement(req, res) {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const result = await trainingService.updatePositionTrainingRequirement(req.params.id, req.body);
    if (result.error) return res.json(error(result.error, result.message));
    await auditLog({
      userId: req.user?.id, username: req.user?.username,
      action: 'update', module: '岗位培训要求',
      description: `更新岗位培训要求: ID ${req.params.id}`,
      ip: req.ip,
    }).catch(() => {});
    buildDetailResponse(res, result.row, '更新成功', { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

// DELETE /position-training-requirements/:id — 软删除岗位培训要求
async function deletePositionTrainingRequirement(req, res) {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const result = await trainingService.deletePositionTrainingRequirement(req.params.id);
    if (result.error) return res.json(error(result.error, result.message));
    await auditLog({
      userId: req.user?.id, username: req.user?.username,
      action: 'delete', module: '岗位培训要求',
      description: `删除岗位培训要求: ID ${req.params.id}`,
      ip: req.ip,
    }).catch(() => {});
    buildDetailResponse(res, result.row, '删除成功', { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

// POST /position-training-requirements/batch-import — 批量导入岗位培训要求
async function batchImportPositionTrainingRequirements(req, res) {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const items = req.body && req.body.items;
    const result = await trainingService.batchImportPositionTrainingRequirements(items, req.user?.id || null);
    if (result.error) return res.json(error(result.error, result.message));
    await auditLog({
      userId: req.user?.id, username: req.user?.username,
      action: 'import', module: '岗位培训要求',
      description: `批量导入岗位培训要求: 成功${result.audit.successCount}条, 失败${result.audit.failCount}条`,
      ip: req.ip,
    }).catch(() => {});
    res.json(success(camelKeys({ total: result.total, success: result.success, failed: result.failed, errors: result.errors }), '批量导入完成'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
}


// ============================================================
// 二、training_record — 员工培训台账
// ============================================================

// GET /training-records — 分页查询培训台账
async function listTrainingRecords(req, res) {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const result = await trainingService.listTrainingRecords(req.query);
    buildListResponse(res, result.rows, result.total, result.pageNum, result.limitNum, undefined, { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

// GET /training-records/stats — 培训台账统计
async function getTrainingRecordsStats(req, res) {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const result = await trainingService.getTrainingRecordsStats(req.query);
    res.json(success(camelKeys(result)));
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

// GET /training-records/:id — 培训台账详情
async function getTrainingRecord(req, res) {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const result = await trainingService.getTrainingRecord(req.params.id);
    if (result.error) return res.json(error(result.error, result.message));
    buildDetailResponse(res, result.row, undefined, { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

// GET /training-records/employee/:employeeId — 查询员工培训记录
async function listTrainingRecordsByEmployee(req, res) {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const rows = await trainingService.listTrainingRecordsByEmployee(req.params.employeeId);
    res.json(success(rows.map(camelKeys), '查询成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

// POST /training-records — 新增培训记录
async function createTrainingRecord(req, res) {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const result = await trainingService.createTrainingRecord(req.body, req.user?.id || null);
    if (result.error) return res.json(error(result.error, result.message));
    await auditLog({
      userId: req.user?.id, username: req.user?.username,
      action: 'create', module: '培训台账',
      description: `新增培训记录: ${result.audit.training_name} (员工ID ${result.audit.employee_id})`,
      ip: req.ip,
    }).catch(() => {});
    buildDetailResponse(res, result.row, '新增成功', { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

// PUT /training-records/:id — 更新培训记录
async function updateTrainingRecord(req, res) {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const result = await trainingService.updateTrainingRecord(req.params.id, req.body);
    if (result.error) return res.json(error(result.error, result.message));
    await auditLog({
      userId: req.user?.id, username: req.user?.username,
      action: 'update', module: '培训台账',
      description: `更新培训记录: ID ${req.params.id}`,
      ip: req.ip,
    }).catch(() => {});
    buildDetailResponse(res, result.row, '更新成功', { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

// DELETE /training-records/:id — 删除培训记录
async function deleteTrainingRecord(req, res) {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const result = await trainingService.deleteTrainingRecord(req.params.id);
    if (result.error) return res.json(error(result.error, result.message));
    await auditLog({
      userId: req.user?.id, username: req.user?.username,
      action: 'delete', module: '培训台账',
      description: `删除培训记录: ID ${req.params.id}`,
      ip: req.ip,
    }).catch(() => {});
    buildDetailResponse(res, result.row, '删除成功', { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

// POST /training-records/batch-import — 批量导入培训记录
async function batchImportTrainingRecords(req, res) {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const items = req.body && req.body.items;
    const result = await trainingService.batchImportTrainingRecords(items, req.user?.id || null);
    if (result.error) return res.json(error(result.error, result.message));
    await auditLog({
      userId: req.user?.id, username: req.user?.username,
      action: 'import', module: '培训台账',
      description: `批量导入培训记录: 成功${result.audit.successCount}条, 失败${result.audit.failCount}条`,
      ip: req.ip,
    }).catch(() => {});
    res.json(success(camelKeys({ total: result.total, success: result.success, failed: result.failed, errors: result.errors }), '批量导入完成'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
}


// ============================================================
// 三、employee_induction_training — 新员工入职培训
// ============================================================

// GET /induction-trainings — 分页查询新员工培训
async function listInductionTrainings(req, res) {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const result = await trainingService.listInductionTrainings(req.query);
    buildListResponse(res, result.rows, result.total, result.pageNum, result.limitNum, undefined, { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

// GET /induction-trainings/stats — 新员工培训统计
async function getInductionTrainingsStats(req, res) {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const result = await trainingService.getInductionTrainingsStats();
    res.json(success(camelKeys(result)));
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

// GET /induction-trainings/:id — 新员工培训详情
async function getInductionTraining(req, res) {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const result = await trainingService.getInductionTraining(req.params.id);
    if (result.error) return res.json(error(result.error, result.message));
    buildDetailResponse(res, result.row, undefined, { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

// GET /induction-trainings/employee/:employeeId — 查询员工入职培训
async function getInductionTrainingByEmployee(req, res) {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const row = await trainingService.getInductionTrainingByEmployee(req.params.employeeId);
    buildDetailResponse(res, row, undefined, { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

// POST /induction-trainings — 新增入职培训记录
async function createInductionTraining(req, res) {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const result = await trainingService.createInductionTraining(req.body, req.user?.id || null);
    if (result.error) return res.json(error(result.error, result.message));
    await auditLog({
      userId: req.user?.id, username: req.user?.username,
      action: 'create', module: '新员工入职培训',
      description: `新增入职培训记录: 员工ID ${result.audit.employee_id}`,
      ip: req.ip,
    }).catch(() => {});
    buildDetailResponse(res, result.row, '新增成功', { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

// PUT /induction-trainings/:id — 更新入职培训记录
async function updateInductionTraining(req, res) {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const result = await trainingService.updateInductionTraining(req.params.id, req.body);
    if (result.error) return res.json(error(result.error, result.message));
    await auditLog({
      userId: req.user?.id, username: req.user?.username,
      action: 'update', module: '新员工入职培训',
      description: `更新入职培训记录: ID ${req.params.id}`,
      ip: req.ip,
    }).catch(() => {});
    buildDetailResponse(res, result.row, '更新成功', { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

// POST /induction-trainings/:id/complete-level — 完成某一级培训
async function completeInductionLevel(req, res) {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const result = await trainingService.completeInductionLevel(req.params.id, req.body);
    if (result.error) return res.json(error(result.error, result.message));
    await auditLog({
      userId: req.user?.id, username: req.user?.username,
      action: 'complete_level', module: '新员工入职培训',
      description: `完成${result.level === 'company' ? '公司级' : result.level === 'department' ? '部门级' : '班组级'}培训: ID ${req.params.id}`,
      ip: req.ip,
    }).catch(() => {});
    buildDetailResponse(res, result.row, `${result.level}级培训已完成`, { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

// DELETE /induction-trainings/:id — 删除入职培训记录
async function deleteInductionTraining(req, res) {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const result = await trainingService.deleteInductionTraining(req.params.id);
    if (result.error) return res.json(error(result.error, result.message));
    await auditLog({
      userId: req.user?.id, username: req.user?.username,
      action: 'delete', module: '新员工入职培训',
      description: `删除入职培训记录: ID ${req.params.id}`,
      ip: req.ip,
    }).catch(() => {});
    buildDetailResponse(res, result.row, '删除成功', { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
}


// ============================================================
// 四、employee_training_status — 培训状态统计
// ============================================================

// GET /training-status — 分页查询培训状态
async function listTrainingStatus(req, res) {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const result = await trainingService.listTrainingStatus(req.query);
    buildListResponse(res, result.rows, result.total, result.pageNum, result.limitNum, undefined, { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

// GET /training-status/stats — 培训状态统计
async function getTrainingStatusStats(req, res) {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const result = await trainingService.getTrainingStatusStats();
    res.json(success(camelKeys(result)));
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

// GET /training-status/non-compliant — 不合规员工列表
async function listNonCompliantTrainingStatus(req, res) {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const rows = await trainingService.listNonCompliantTrainingStatus();
    res.json(success(rows.map(camelKeys), '查询成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

// GET /training-status/expiring — 即将到期培训列表
async function listExpiringTrainingStatus(req, res) {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const rows = await trainingService.listExpiringTrainingStatus(req.query);
    res.json(success(rows.map(camelKeys), '查询成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

// GET /training-status/:id — 培训状态详情
async function getTrainingStatus(req, res) {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const result = await trainingService.getTrainingStatus(req.params.id);
    if (result.error) return res.json(error(result.error, result.message));
    buildDetailResponse(res, result.row, undefined, { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

// GET /training-status/employee/:employeeId — 查询员工培训状态
async function listTrainingStatusByEmployee(req, res) {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const rows = await trainingService.listTrainingStatusByEmployee(req.params.employeeId);
    res.json(success(rows.map(camelKeys), '查询成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

// POST /training-status/analyze — 执行培训合规分析
async function analyzeTrainingCompliance(req, res) {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const result = await trainingService.analyzeTrainingCompliance(req.body, req.user?.id || null);
    if (result.error) return res.json(error(result.error, result.message));
    await auditLog({
      userId: req.user?.id, username: req.user?.username,
      action: 'analyze', module: '培训合规分析',
      description: `培训合规分析: 员工ID ${result.audit.employee_id}, 合规率 ${result.audit.complianceRate}%`,
      ip: req.ip,
    }).catch(() => {});
    res.json(success(camelKeys({
      ...result.row,
      analysis: result.analysis
    }), '分析完成'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

// POST /training-status/batch-analyze — 批量培训合规分析
async function batchAnalyzeTrainingCompliance(req, res) {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const result = await trainingService.batchAnalyzeTrainingCompliance(req.body, req.user?.id || null);
    if (result.error) return res.json(error(result.error, result.message));
    await auditLog({
      userId: req.user?.id, username: req.user?.username,
      action: 'batch_analyze', module: '培训合规分析',
      description: `批量培训合规分析: ${result.audit.analyzed}名员工`,
      ip: req.ip,
    }).catch(() => {});
    res.json(success(camelKeys({ total: result.total, analyzed: result.analyzed }), '批量分析完成'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
}


module.exports = {
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
};