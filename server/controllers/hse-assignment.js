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

/**
 * 返聘（A-02e.5-B2.2）
 * 唯一正向出口：终态（退休）人员重新建立用工关系。
 * 操作者身份只取 req.user，不接受 body 中的 userId / operator 等字段。
 */
async function rehireEmployee(req, res) {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));
    const { employee_id, org_unit_id, group_id, region_id, enterprise_id, project_id, team_id,
            position_id, supervisor_id, start_date, change_reason, remark } = req.body;
    const result = await employeeAssignmentService.rehireEmployee({
      employee_id, org_unit_id, group_id, region_id, enterprise_id, project_id, team_id,
      position_id, supervisor_id, start_date, change_reason, remark,
      userId: req.user?.id || null,
    });
    if (result.error) return res.json(error(result.error, result.message));
    await auditLog({
      userId: req.user?.id, username: req.user?.username,
      action: 'update', module: '人员返聘',
      description: `返聘: 员工${result.employeeName}(ID=${employee_id}) `
        + `${result.audit.fromRelation}→${result.audit.toRelation}，生效日 ${result.audit.effectiveDate}，`
        + `新任职段 ID=${result.audit.newAssignmentId}`,
      ip: req.ip,
      detail: {
        employeeId: result.audit.employeeId,
        effectiveDate: result.audit.effectiveDate,
        previousAssignmentId: result.audit.previousAssignmentId,
        newAssignmentId: result.audit.newAssignmentId,
      },
    }).catch(() => {});
    buildDetailResponse(res, result.responseData, '返聘成功', { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

/**
 * 终态登记（A-02A / B02-DEC-03.34）
 * 唯一权威入口：在同一事务内写 employment_relation + leave_date、关闭当前有效任职段、
 * 写 employee_history、写 sys_operation_log。
 *
 * 与 changeAssignmentStatus 的区别：
 *   - 入参是 employee_id（不是任职段 ID）；
 *   - 只允许 辞职 / 死亡 / 退休 三种终态，不允许笼统「离职」；
 *   - 审计在 service 事务内写，因此此处**不再**调用 auditLog，避免同一次业务产生两条审计。
 * 操作者身份只取 req.user，不接受 body 中的 userId / operator 等字段。
 */
async function terminateEmployee(req, res) {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));
    const { employee_id, terminal_type, event_date, remark } = req.body;
    const result = await employeeAssignmentService.terminateEmployee({
      employee_id, terminal_type, event_date, remark,
      userId: req.user?.id || null,
      username: req.user?.username || null,
      ip: req.ip,
      userAgent: req.headers?.['user-agent'],
    });
    if (result.error) return res.json(error(result.error, result.message));
    buildDetailResponse(res, result.responseData, '终态登记成功', { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

module.exports = {
  getCurrentAssignment,
  getAssignmentHistory,
  assignEmployee,
  changeAssignmentStatus,
  rehireEmployee,
  terminateEmployee,
};
