/**
 * HSE 员工域 · 员工档案中心薄 controller
 * 仅做 req 解析 + 调 service + res 包装；业务规则与 SQL 在 services/employeeProfileService.js
 */
const { isConnected } = require('../config/db');
const { success, error } = require('../middleware/response');
const { camelKeys } = require('../utils/commonResponse');
const { decryptFields } = require('../middleware/encryption');
const { ENCRYPT_FIELDS } = require('../routes/hse-employee/_shared');
const employeeProfileService = require('../services/employeeProfileService');

// GET /employees/profile/list — 员工档案列表
async function getProfileList(req, res) {
  try {
    if (!isConnected()) return res.json(success(camelKeys({ list: [], total: 0, page: 1, pageSize: 20 }), '数据库未连接'));
    const result = await employeeProfileService.getProfileList(req.query);
    res.json(success(result, '查询成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

// GET /employees/profile/roster-version — 花名册名单版本号
async function getRosterVersion(req, res) {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));
    const scope = req.query.scope === 'all' ? 'all' : 'driver';
    const rows = await employeeProfileService.getRosterVersion(scope);
    const crypto = require('crypto');
    const payload = rows
      .map((x) => [x.name, x.employment_relation ?? '', x.leave_date ?? '', x.updated_at ?? '', x.dept ?? ''].join('|'))
      .join(';');
    const version = crypto.createHash('md5').update(payload).digest('hex');
    const latest = rows.reduce((m, x) => (x.updated_at && x.updated_at > m ? x.updated_at : m), '');
    res.json(success({ version, count: rows.length, updatedAt: latest || null }, '查询成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

// GET /employees/profile/:id — 员工档案详情
async function getProfileDetail(req, res) {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));
    const result = await employeeProfileService.getProfileDetail(req.params.id);
    if (result.error) return res.json(error(result.error, result.message));
    // decryptMiddleware 只处理 data.data 顶层，而 id_card/phone 位于 basic 内，此处手动解密扁平 basic
    const decryptedEmp = decryptFields(result.basic, ENCRYPT_FIELDS);
    res.json(success({ basic: decryptedEmp, currentOrg: result.currentOrg }, '查询成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

// GET /employees/profile/:id/assignments — 员工任职历史列表
async function getProfileAssignments(req, res) {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));
    const rows = await employeeProfileService.getProfileAssignments(req.params.id);
    res.json(success(rows, '查询成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

// GET /employees/profile/:id/driver-info — 员工驾驶员信息
async function getDriverInfo(req, res) {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));
    const result = await employeeProfileService.getDriverInfo(req.params.id);
    res.json(success(camelKeys(result), '查询成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

module.exports = {
  getProfileList,
  getRosterVersion,
  getProfileDetail,
  getProfileAssignments,
  getDriverInfo,
};