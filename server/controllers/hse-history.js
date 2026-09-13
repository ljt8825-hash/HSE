/**
 * HSE 员工域 · 人事变动记录薄 controller
 * 仅做 req 解析 + 调 service + res 包装；业务规则与 SQL 在 services/employeeHistoryService.js
 */
const { isConnected } = require('../config/db');
const { success, error } = require('../middleware/response');
const { camelKeys } = require('../utils/commonResponse');
const employeeHistoryService = require('../services/employeeHistoryService');

async function listEmployeeHistory(req, res) {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));
    const rows = await employeeHistoryService.listEmployeeHistory(req.params.employeeId);
    res.json(success(rows.map(camelKeys), '查询成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

module.exports = {
  listEmployeeHistory,
};
