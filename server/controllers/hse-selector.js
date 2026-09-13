/**
 * HSE 员工域 · 员工公共选择薄 controller
 * 仅做 req 解析 + 调 service + res 包装；业务规则与 SQL 在 services/employeeSelectorService.js
 */
const { isConnected } = require('../config/db');
const { success, error } = require('../middleware/response');
const { buildDetailResponse, camelKeys } = require('../utils/commonResponse');
const employeeSelectorService = require('../services/employeeSelectorService');

// GET /employees/selector — 员工选择列表
async function listSelector(req, res) {
  try {
    if (!isConnected()) return res.json(success([], '数据库未连接'));
    const rows = await employeeSelectorService.listSelector(req.query);
    res.json(success(rows.map(camelKeys), '查询成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

// GET /employees/selector/:id — 员工选择单条查询
async function getSelectorById(req, res) {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));
    const result = await employeeSelectorService.getSelectorById(req.params.id);
    if (result.error) return res.json(error(result.error, result.message));
    buildDetailResponse(res, result.row, '查询成功', { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

// POST /employees/selector/batch — 员工选择批量查询
async function batchSelector(req, res) {
  try {
    if (!isConnected()) return res.json(success([], '数据库未连接'));
    const ids = req.body && req.body.ids;
    const result = await employeeSelectorService.batchSelector(ids);
    if (result.message) return res.json(success([], result.message));
    res.json(success(result.rows.map(camelKeys), '查询成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

module.exports = {
  listSelector,
  getSelectorById,
  batchSelector,
};
