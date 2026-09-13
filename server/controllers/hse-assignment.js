/**
 * HSE 员工域 · 人员组织关系维护薄 controller
 * 仅做 req 解析 + 调 service + res 包装；业务规则与 SQL 在 services/employeeAssignmentService.js
 */
const { isConnected } = require('../config/db');
const { success, error } = require('../middleware/response');
const { buildDetailResponse, camelKeys } = require('../utils/commonResponse');
const { auditLog } = require('../routes/audit');
const employeeAssignmentService = require('../services/employeeAssignmentService');

async function getCurrentAssignment(req, res) {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));
    const { row } = await employeeAssignmentService.getCurrentAssignmentDetail(req.params.employeeId);
    if (!row) return res.json(error(-2, '无当前组织关系'));
    buildDetailResponse(res, row, '查询成功', { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

async function getAssignmentHistory(req, res) {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));
    const rows = await employeeAssignmentService.getAssignmentHistoryDetail(req.params.employeeId);
    res.json(success(rows.map(camelKeys), '查询成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

async function assignEmployee(req, res) {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));
    const { employee_id, group_id, region_id, enterprise_id, project_id, team_id,
            position_id, start_date, supervisor_id, change_reason, remark } = req.body;
    const result = await employeeAssignmentService.assignEmployee({
      employee_id, group_id, region_id, enterprise_id, project_id, team_id,
      position_id, start_date, supervisor_id, change_reason, remark,
      userId: req.user?.id || null,
    });
    if (result.error) return res.json(error(result.error, result.message));
    await auditLog({
      userId: req.user?.id, username: req.user?.username,
      action: 'update', module: '人员组织关系',
      description: `${result.eventType}: 员工${result.employeeName}(ID=${employee_id})`,
      ip: req.ip,
    }).catch(() => {});
    buildDetailResponse(res, result.responseData, `${result.eventType}成功`, { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

async function changeAssignmentStatus(req, res) {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));
    const { status, event_date, remark } = req.body;
    const result = await employeeAssignmentService.changeAssignmentStatus({
      id: req.params.id, status, event_date, remark,
      userId: req.user?.id || null,
    });
    if (result.error) return res.json(error(result.error, result.message));
    await auditLog({
      userId: req.user?.id, username: req.user?.username,
      action: 'update', module: '人员状态',
      description: `状态变更: 员工ID=${result.audit.employeeId} ${result.audit.beforeStatus}→${result.audit.status}`,
      ip: req.ip,
    }).catch(() => {});
    res.json(success(null, '状态变更成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

module.exports = {
  getCurrentAssignment,
  getAssignmentHistory,
  assignEmployee,
  changeAssignmentStatus,
};
