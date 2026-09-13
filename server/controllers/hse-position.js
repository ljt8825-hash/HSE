/**
 * HSE 员工域 · 岗位管理薄 controller
 * 仅做 req 解析 + 调 service + res 包装；业务规则与 SQL 在 services/positionService.js
 */
const { isConnected } = require('../config/db');
const { success, error } = require('../middleware/response');
const { buildDetailResponse } = require('../utils/commonResponse');
const { auditLog } = require('../routes/audit');
const positionService = require('../services/positionService');

async function listPositions(req, res) {
  try {
    if (!isConnected()) return res.json(success([], '数据库未连接'));
    const data = await positionService.listPositions(req.query);
    res.json(success(data, '查询成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

async function createPosition(req, res) {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));
    const { row, error: errCode, message } = await positionService.createPosition(req.body);
    if (errCode) return res.json(error(errCode, message));
    await auditLog({
      userId: req.user?.id, username: req.user?.username,
      action: 'create', module: '岗位管理',
      description: `新增岗位: ${row.name}（${row.position_code}）`,
      ip: req.ip,
    }).catch(() => {});
    buildDetailResponse(res, row, '新增成功', { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

async function updatePosition(req, res) {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));
    const { row, error: errCode, message } = await positionService.updatePosition(req.params.id, req.body);
    if (errCode) return res.json(error(errCode, message));
    buildDetailResponse(res, row, '更新成功', { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

async function deletePosition(req, res) {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));
    const { error: errCode, message } = await positionService.deletePosition(req.params.id);
    if (errCode) return res.json(error(errCode, message));
    res.json(success(null, '删除成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

module.exports = {
  listPositions,
  createPosition,
  updatePosition,
  deletePosition,
};
