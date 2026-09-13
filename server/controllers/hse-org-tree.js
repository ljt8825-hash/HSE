/**
 * HSE 员工域 · 组织树管理薄 controller
 * 仅做 req 解析 + 调 service + res 包装；业务规则与 SQL 在 services/orgTreeService.js
 */
const { isConnected } = require('../config/db');
const { success, error } = require('../middleware/response');
const { buildListResponse, buildDetailResponse, camelKeys } = require('../utils/commonResponse');
const { auditLog } = require('../routes/audit');
const orgTreeService = require('../services/orgTreeService');

async function getOrgTree(req, res) {
  try {
    if (!isConnected()) return res.json(success([], '数据库未连接'));
    const includeInactive = req.query.includeInactive === 'true';
    const tree = await orgTreeService.getOrgTree(includeInactive);
    res.json(success(tree, '查询成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

async function listDepartments(req, res) {
  try {
    if (!isConnected()) return res.json(success([], '数据库未连接'));
    const rows = await orgTreeService.listDepartments();
    res.json(success(rows.map(camelKeys), '查询成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

async function listDepartmentEmployees(req, res) {
  try {
    if (!isConnected()) return res.json(success(camelKeys({ list: [], total: 0 }), '数据库未连接'));
    const result = await orgTreeService.listDepartmentEmployees({ rawId: req.params.id, query: req.query });
    if (result.error) return res.json(error(result.error, result.message));
    if (result.empty) {
      return buildListResponse(res, [], 0, result.pageNum, result.limitNum, '查询成功', { camelCase: false });
    }
    buildListResponse(res, result.rows, result.total, result.pageNum, result.limitNum, '查询成功', { camelCase: false });
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

async function createDepartment(req, res) {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));
    const result = await orgTreeService.createDepartment(req.body, req.user?.id || null);
    if (result.error) return res.json(error(result.error, result.message));
    await auditLog({
      userId: req.user?.id, username: req.user?.username,
      action: 'create', module: '组织管理',
      description: `新增部门: ${result.audit.name}（${result.audit.dept_code}）`,
      ip: req.ip,
    }).catch(() => {});
    buildDetailResponse(res, result.row, '新增成功', { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

async function updateDepartment(req, res) {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));
    const result = await orgTreeService.updateDepartment(req.params.id, req.body);
    if (result.error) return res.json(error(result.error, result.message));
    await auditLog({
      userId: req.user?.id, username: req.user?.username,
      action: 'update', module: '组织管理',
      description: `更新部门 ID=${result.audit.id}: ${result.audit.name || ''}`,
      ip: req.ip,
    }).catch(() => {});
    buildDetailResponse(res, result.row, '更新成功', { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

async function deleteDepartment(req, res) {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));
    const result = await orgTreeService.deleteDepartment(req.params.id);
    if (result.error) return res.json(error(result.error, result.message));
    await auditLog({
      userId: req.user?.id, username: req.user?.username,
      action: 'delete', module: '组织管理',
      description: `删除部门: ${result.audit.name} (ID=${result.audit.id})`,
      ip: req.ip,
    }).catch(() => {});
    res.json(success(null, '删除成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

module.exports = {
  getOrgTree,
  listDepartments,
  listDepartmentEmployees,
  createDepartment,
  updateDepartment,
  deleteDepartment,
};
