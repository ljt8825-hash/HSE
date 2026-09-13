/**
 * HSE 员工域 · 证件管理薄 controller
 * 仅做 req 解析 + 调 service + res 包装；业务规则与 SQL 在 services/employeeCertificateService.js
 */
const { isConnected } = require('../config/db');
const { success, error } = require('../middleware/response');
const { buildListResponse, buildDetailResponse, camelKeys } = require('../utils/commonResponse');
const { auditLog } = require('../routes/audit');
const employeeCertificateService = require('../services/employeeCertificateService');

// GET /certificates — 分页查询证件
async function listCertificates(req, res) {
  try {
    if (!isConnected()) return buildListResponse(res, [], 0, 1, 20, undefined, { camelCase: true });
    const result = await employeeCertificateService.listCertificates(req.query);
    buildListResponse(res, result.rows, result.total, result.pageNum, result.limitNum, undefined, { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

// GET /certificates/stats — 证件统计
async function getCertificateStats(req, res) {
  try {
    if (!isConnected()) return res.json(success(camelKeys({ total: 0, byCategory: {}, byStatus: {}, expiring: 0, expired: 0 })));
    const result = await employeeCertificateService.getCertificateStats();
    res.json(success(camelKeys(result)));
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

// GET /certificates/:id — 证件详情
async function getCertificate(req, res) {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const result = await employeeCertificateService.getCertificate(req.params.id);
    if (result.error) return res.json(error(result.error, result.message));
    buildDetailResponse(res, result.row, undefined, { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

// GET /certificates/employee/:employeeId — 查询某员工的所有证件
async function listCertificatesByEmployee(req, res) {
  try {
    if (!isConnected()) return res.json(success(camelKeys({ list: [] })));
    const rows = await employeeCertificateService.listCertificatesByEmployee(req.params.employeeId);
    res.json(success({ list: rows.map(camelKeys), total: rows.length }));
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

// POST /certificates — 新增证件
async function createCertificate(req, res) {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const result = await employeeCertificateService.createCertificate(req.body, req.user?.id || null);
    if (result.error) return res.json(error(result.error, result.message));
    await auditLog({
      userId: req.user?.id, username: req.user?.username,
      action: 'create', module: '证件管理',
      description: `新增证件: ${result.audit.cert_name} (员工ID: ${result.audit.employee_id})`,
      ip: req.ip,
    }).catch(() => {});
    buildDetailResponse(res, result.row, '新增成功', { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

// PUT /certificates/:id — 更新证件
async function updateCertificate(req, res) {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const result = await employeeCertificateService.updateCertificate(req.params.id, req.body);
    if (result.error) return res.json(error(result.error, result.message));
    if (result.noop) return res.json(success(camelKeys(result.existing), '无更新'));
    await auditLog({
      userId: req.user?.id, username: req.user?.username,
      action: 'update', module: '证件管理',
      description: `更新证件 ID: ${req.params.id}`,
      ip: req.ip,
    }).catch(() => {});
    buildDetailResponse(res, result.row, '更新成功', { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

// DELETE /certificates/:id — 软删除证件
async function deleteCertificate(req, res) {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const result = await employeeCertificateService.deleteCertificate(req.params.id);
    if (result.error) return res.json(error(result.error, result.message));
    await auditLog({
      userId: req.user?.id, username: req.user?.username,
      action: 'delete', module: '证件管理',
      description: `删除证件 ID: ${req.params.id}`,
      ip: req.ip,
    }).catch(() => {});
    res.json(success(camelKeys({ id: result.id }), '删除成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

// GET /certificates/expiring/:days — 临期证件列表
async function listExpiringCertificates(req, res) {
  try {
    if (!isConnected()) return res.json(success(camelKeys({ list: [] })));
    const result = await employeeCertificateService.listExpiringCertificates(req.params.days);
    res.json(success({ list: result.rows.map(camelKeys), total: result.rows.length, days: result.days }));
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

// GET /certificates/expired/list — 已过期证件列表
async function listExpiredCertificates(req, res) {
  try {
    if (!isConnected()) return res.json(success(camelKeys({ list: [] })));
    const rows = await employeeCertificateService.listExpiredCertificates();
    res.json(success({ list: rows.map(camelKeys), total: rows.length }));
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

// POST /certificates/batch-import — 批量导入证件（JSON）
async function batchImportCertificates(req, res) {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const items = req.body && req.body.items;
    const result = await employeeCertificateService.batchImportCertificates(items, req.user?.id || null);
    if (result.error) return res.json(error(result.error, result.message));
    await auditLog({
      userId: req.user?.id, username: req.user?.username,
      action: 'import', module: '证件管理',
      description: `批量导入证件: 成功${result.success}条, 失败${result.failed}条`,
      ip: req.ip,
    }).catch(() => {});
    res.json(success(camelKeys({ total: result.total, success: result.success, failed: result.failed, errors: result.errors }), '批量导入完成'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

module.exports = {
  listCertificates,
  getCertificateStats,
  getCertificate,
  listCertificatesByEmployee,
  createCertificate,
  updateCertificate,
  deleteCertificate,
  listExpiringCertificates,
  listExpiredCertificates,
  batchImportCertificates,
};