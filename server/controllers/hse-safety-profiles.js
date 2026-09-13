/**
 * HSE 员工域 · 安全画像薄 controller
 * 仅做 req 解析 + 调 service + res 包装；业务规则与 SQL 在 services/safetyProfileService.js
 */
const { isConnected } = require('../config/db');
const { success, error } = require('../middleware/response');
const { buildListResponse, buildDetailResponse, camelKeys } = require('../utils/commonResponse');
const { auditLog } = require('../routes/audit');
const safetyProfileService = require('../services/safetyProfileService');

// GET /safety-profiles — 分页查询一人一档
async function listSafetyProfiles(req, res) {
  try {
    if (!isConnected()) return buildListResponse(res, [], 0, 1, 20, undefined, { camelCase: true });
    const result = await safetyProfileService.listSafetyProfiles(req.query);
    buildListResponse(res, result.rows, result.total, result.pageNum, result.limitNum, undefined, { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

// GET /safety-profiles/stats — 一人一档统计
async function getSafetyProfileStats(req, res) {
  try {
    if (!isConnected()) return res.json(success(camelKeys({ total: 0, byRiskLevel: {}, byQualification: {}, byHealth: {} })));
    const result = await safetyProfileService.getSafetyProfileStats();
    res.json(success(camelKeys(result)));
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

// GET /safety-profiles/employee/:employeeId — 查询某员工一人一档
async function getEmployeeSafetyProfile(req, res) {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const result = await safetyProfileService.getEmployeeSafetyProfile(req.params.employeeId, req.user?.id || null);
    if (result.error) return res.json(error(result.error, result.message));
    res.json(success(camelKeys({
      profile: result.profile,
      certificates: result.certificates,
      history: result.history,
    })));
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

// POST /safety-profiles/employee/:employeeId/assess — 手动触发风险评估
async function assessEmployeeRisk(req, res) {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const result = await safetyProfileService.assessEmployeeRisk(req.params.employeeId, req.body, req.user?.id || null);
    if (result.error) return res.json(error(result.error, result.message));
    await auditLog({
      userId: req.user?.id, username: req.user?.username,
      action: 'assess', module: '一人一档',
      description: `风险评估员工ID: ${req.params.employeeId}, 等级: ${result.audit.level}, 评分: ${result.audit.score}`,
      ip: req.ip,
    }).catch(() => {});
    res.json(success(camelKeys({
      profile: result.row,
      risk_factors: result.risk_factors,
    }), '风险评估完成'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

// PUT /safety-profiles/:id — 更新风险画像
async function updateSafetyProfile(req, res) {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const result = await safetyProfileService.updateSafetyProfile(req.params.id, req.body);
    if (result.error) return res.json(error(result.error, result.message));
    if (result.noop) return res.json(success(camelKeys(result.existing), '无更新'));
    await auditLog({
      userId: req.user?.id, username: req.user?.username,
      action: 'update', module: '一人一档',
      description: `更新风险画像 ID: ${req.params.id}`,
      ip: req.ip,
    }).catch(() => {});
    buildDetailResponse(res, result.row, '更新成功', { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

// POST /safety-profiles/batch-assess — 批量风险评估
async function batchAssessSafetyProfiles(req, res) {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const result = await safetyProfileService.batchAssessSafetyProfiles(req.body);
    if (result.error) return res.json(error(result.error, result.message));
    await auditLog({
      userId: req.user?.id, username: req.user?.username,
      action: 'batch_assess', module: '一人一档',
      description: `批量风险评估: ${result.audit.updated}人`,
      ip: req.ip,
    }).catch(() => {});
    res.json(success(camelKeys({ total: result.total, updated: result.updated }), '批量评估完成'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

// GET /position-safety-profiles — 分页查询岗位安全画像
async function listPositionSafetyProfiles(req, res) {
  try {
    if (!isConnected()) return buildListResponse(res, [], 0, 1, 20, undefined, { camelCase: true });
    const result = await safetyProfileService.listPositionSafetyProfiles(req.query);
    buildListResponse(res, result.rows, result.total, result.pageNum, result.limitNum, undefined, { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

// GET /position-safety-profiles/stats — 岗位安全画像统计
async function getPositionSafetyProfileStats(req, res) {
  try {
    if (!isConnected()) return res.json(success(camelKeys({ total: 0, byRiskLevel: {}, bySpecialOperation: {}, bySafetyCritical: {} })));
    const result = await safetyProfileService.getPositionSafetyProfileStats();
    res.json(success(camelKeys(result)));
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

// GET /position-safety-profiles/:id — 岗位安全画像详情
async function getPositionSafetyProfile(req, res) {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const result = await safetyProfileService.getPositionSafetyProfile(req.params.id);
    if (result.error) return res.json(error(result.error, result.message));
    buildDetailResponse(res, result.row, undefined, { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

// GET /position-safety-profiles/position/:positionId — 查询某岗位的安全画像
async function getPositionSafetyProfileByPosition(req, res) {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const result = await safetyProfileService.getPositionSafetyProfileByPosition(req.params.positionId, req.user?.id || null);
    if (result.error) return res.json(error(result.error, result.message));
    res.json(success(camelKeys({
      profile: result.profile,
      position: result.position,
      trainingRequirements: result.trainingRequirements,
    })));
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

// POST /position-safety-profiles — 新增/更新岗位安全画像
async function upsertPositionSafetyProfile(req, res) {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const result = await safetyProfileService.upsertPositionSafetyProfile(req.body, req.user?.id || null);
    if (result.error) return res.json(error(result.error, result.message));
    await auditLog({
      userId: req.user?.id, username: req.user?.username,
      action: result.audit.isUpdate ? 'update' : 'create', module: '岗位安全画像',
      description: `${result.audit.isUpdate ? '更新' : '新增'}岗位安全画像: 岗位ID ${result.audit.position_id}`,
      ip: req.ip,
    }).catch(() => {});
    buildDetailResponse(res, result.row, result.audit.msg, { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

// PUT /position-safety-profiles/:id — 更新岗位安全画像
async function updatePositionSafetyProfile(req, res) {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const result = await safetyProfileService.updatePositionSafetyProfile(req.params.id, req.body);
    if (result.error) return res.json(error(result.error, result.message));
    await auditLog({
      userId: req.user?.id, username: req.user?.username,
      action: 'update', module: '岗位安全画像',
      description: `更新岗位安全画像: ID ${req.params.id}`,
      ip: req.ip,
    }).catch(() => {});
    buildDetailResponse(res, result.row, '更新成功', { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

// DELETE /position-safety-profiles/:id — 软删除岗位安全画像
async function deletePositionSafetyProfile(req, res) {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const result = await safetyProfileService.deletePositionSafetyProfile(req.params.id);
    if (result.error) return res.json(error(result.error, result.message));
    await auditLog({
      userId: req.user?.id, username: req.user?.username,
      action: 'delete', module: '岗位安全画像',
      description: `删除岗位安全画像: ID ${req.params.id}`,
      ip: req.ip,
    }).catch(() => {});
    buildDetailResponse(res, result.row, '删除成功', { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

// POST /position-safety-profiles/batch-assess — 批量岗位风险评估
async function batchAssessPositionSafetyProfiles(req, res) {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const result = await safetyProfileService.batchAssessPositionSafetyProfiles(req.body);
    if (result.error) return res.json(error(result.error, result.message));
    await auditLog({
      userId: req.user?.id, username: req.user?.username,
      action: 'batch_assess', module: '岗位安全画像',
      description: `批量岗位风险评估: ${result.audit.updated}个岗位`,
      ip: req.ip,
    }).catch(() => {});
    res.json(success(camelKeys({ total: result.total, updated: result.updated }), '批量评估完成'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

module.exports = {
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
};