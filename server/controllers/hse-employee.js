/**
 * HSE 员工域 · 员工 CRUD 薄 controller
 * 仅做 req 解析 + 调 service + res 包装；业务规则与 SQL 在 services/employeeService.js
 */
const { isConnected } = require('../config/db');
const { success, error } = require('../middleware/response');
const { buildListResponse, buildDetailResponse } = require('../utils/commonResponse');
const { auditLog } = require('../routes/audit');
const { parseIdList } = require('../routes/hse-employee/_shared');
const employeeService = require('../services/employeeService');

// GET /employees — 分页查询员工列表（通过视图返回年龄）
async function listEmployees(req, res) {
  try {
    if (!isConnected()) return buildListResponse(res, [], 0, 1, 20, '数据库未连接');
    const result = await employeeService.listEmployees(req.query);
    buildListResponse(res, result.rows, result.total, result.pageNum, result.limitNum, '查询成功');
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

// GET /employees/filter-options — 筛选项动态化
async function getFilterOptions(req, res) {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));
    const result = await employeeService.getFilterOptions();
    res.json(success(result, '查询成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

// GET /employees/stats — 员工统计
async function getEmployeeStats(req, res) {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));
    const result = await employeeService.getEmployeeStats();
    res.json(success(result, '统计成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

// GET /employees/batch — 批量获取员工基础信息（GET query.ids）
async function batchGetEmployees(req, res) {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));
    const result = await employeeService.batchGetEmployees(parseIdList(req.query.ids));
    if (result.error) return res.json(error(result.error, result.message));
    res.json(success(result.rows, '查询成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

// POST /employees/batch — 批量获取员工基础信息（body { ids }）
async function batchGetEmployeesByBody(req, res) {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));
    const rawIds = req.body && req.body.ids;
    const result = await employeeService.batchGetEmployeesByBody(parseIdList(rawIds));
    if (result.error) return res.json(error(result.error, result.message));
    res.json(success(result.rows, '查询成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

// GET /events — 员工事件轮询端点（P0-2）
async function getEvents(req, res) {
  try {
    const since = req.query.since;
    const result = await employeeService.getEvents(since);
    res.json(success(result, '查询成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

// GET /employees/:id/profile — 员工主档案
async function getEmployeeProfile(req, res, next) {
  if (!/^\d+$/.test(req.params.id)) return next();
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));
    const result = await employeeService.getEmployeeProfile(parseInt(req.params.id, 10));
    if (result.error) return res.json(error(result.error, result.message));
    res.json(success(result.profile, '查询成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

// 关联业务列表（hazards / accidents / emergency-plans / training / violations）
async function listEmployeeHazards(req, res, next) {
  if (!/^\d+$/.test(req.params.id)) return next();
  try {
    if (!isConnected()) return buildListResponse(res, [], 0, 1, 20, '数据库未连接');
    const result = await employeeService.listEmployeeHazards(parseInt(req.params.id, 10), req.query);
    buildListResponse(res, result.rows, result.total, result.pageNum, result.limitNum, '查询成功', { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

async function listEmployeeAccidents(req, res, next) {
  if (!/^\d+$/.test(req.params.id)) return next();
  try {
    if (!isConnected()) return buildListResponse(res, [], 0, 1, 20, '数据库未连接');
    const result = await employeeService.listEmployeeAccidents(parseInt(req.params.id, 10), req.query);
    buildListResponse(res, result.rows, result.total, result.pageNum, result.limitNum, '查询成功', { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

async function listEmployeeEmergencyPlans(req, res, next) {
  if (!/^\d+$/.test(req.params.id)) return next();
  try {
    if (!isConnected()) return buildListResponse(res, [], 0, 1, 20, '数据库未连接');
    const result = await employeeService.listEmployeeEmergencyPlans(parseInt(req.params.id, 10), req.query);
    buildListResponse(res, result.rows, result.total, result.pageNum, result.limitNum, '查询成功', { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

async function listEmployeeTraining(req, res, next) {
  if (!/^\d+$/.test(req.params.id)) return next();
  try {
    if (!isConnected()) return buildListResponse(res, [], 0, 1, 20, '数据库未连接');
    const result = await employeeService.listEmployeeTraining(parseInt(req.params.id, 10), req.query);
    buildListResponse(res, result.rows, result.total, result.pageNum, result.limitNum, '查询成功', { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

async function listEmployeeViolations(req, res, next) {
  if (!/^\d+$/.test(req.params.id)) return next();
  try {
    if (!isConnected()) return buildListResponse(res, [], 0, 1, 20, '数据库未连接');
    const result = await employeeService.listEmployeeViolations(parseInt(req.params.id, 10), req.query);
    buildListResponse(res, result.rows, result.total, result.pageNum, result.limitNum, '查询成功', { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

// GET /employees/:id — 员工详情（含组织关系和年龄）
async function getEmployeeDetail(req, res, next) {
  if (!/^\d+$/.test(req.params.id)) return next();
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));
    const result = await employeeService.getEmployeeDetail(req.params.id);
    if (result.error) return res.json(error(result.error, result.message));
    buildDetailResponse(res, result.row, '查询成功', { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

// POST /employees — 新增员工（纯身份数据，手动加密 + 哈希）
async function createEmployee(req, res) {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));
    const result = await employeeService.createEmployee(req.body);
    if (result.error) return res.json(error(result.error, result.message));
    await auditLog({
      userId: req.user?.id, username: req.user?.username,
      action: 'create', module: '人员主数据',
      description: `新增员工: ${result.audit.name}（${result.audit.employee_code}）`,
      ip: req.ip,
    }).catch(() => {});
    buildDetailResponse(res, result.row, '新增成功', { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

// PUT /employees/:id — 更新员工信息（手动加密 + 哈希唯一性校验）
async function updateEmployee(req, res) {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));
    const result = await employeeService.updateEmployee(req.params.id, req.body);
    if (result.error) return res.json(error(result.error, result.message));
    await auditLog({
      userId: req.user?.id, username: req.user?.username,
      action: 'update', module: '人员主数据',
      description: `更新员工 ID=${req.params.id}: ${result.audit.name || ''}`,
      ip: req.ip,
    }).catch(() => {});
    buildDetailResponse(res, result.row, '更新成功', { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

// GET /employees/:id/roster-authority — 员工「花名册权威状态」
async function getRosterAuthority(req, res) {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));
    const result = await employeeService.getRosterAuthority(parseInt(req.params.id, 10));
    if (result.error) return res.json(error(result.error, result.message));
    res.json(success(result.data, '查询成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

// DELETE /employees/:id — 删除员工（软删除，同时结束当前组织关系）
async function deleteEmployee(req, res) {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));
    const result = await employeeService.deleteEmployee(req.params.id);
    if (result.error) return res.json(error(result.error, result.message));
    await auditLog({
      userId: req.user?.id, username: req.user?.username,
      action: 'delete', module: '人员主数据',
      description: `删除员工: ${result.audit.name} (ID=${req.params.id})`,
      ip: req.ip,
    }).catch(() => {});
    res.json(success(null, '删除成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

module.exports = {
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
};
