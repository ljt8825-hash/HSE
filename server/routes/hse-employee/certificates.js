/**
 * HSE 证件管理 (employee_certificate 表) —— 纯绑定路由
 * 业务已下沉：controllers/hse-certificates.js（薄 handler）→ services/employeeCertificateService.js（业务+SQL）
 * 对外路由契约逐字节不变，由父路由 router.use('/', this) 挂载，
 * 最终契约 /api/hse/employee/certificates(...)
 */
const express = require('express');
const router = express.Router();

const { requireRole, requirePermission } = require('../../middleware/auth');
const {
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
} = require('../../controllers/hse-certificates');

// GET /certificates — 分页查询证件
router.get('/certificates', listCertificates);

// GET /certificates/stats — 证件统计
router.get('/certificates/stats', getCertificateStats);

// GET /certificates/:id — 证件详情
router.get('/certificates/:id', getCertificate);

// GET /certificates/employee/:employeeId — 查询某员工的所有证件
router.get('/certificates/employee/:employeeId', listCertificatesByEmployee);

// POST /certificates — 新增证件
router.post('/certificates', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:create'), createCertificate);

// PUT /certificates/:id — 更新证件
router.put('/certificates/:id', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:update'), updateCertificate);

// DELETE /certificates/:id — 软删除证件
router.delete('/certificates/:id', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:delete'), deleteCertificate);

// GET /certificates/expiring/:days — 临期证件列表
router.get('/certificates/expiring/:days', listExpiringCertificates);

// GET /certificates/expired/list — 已过期证件列表
router.get('/certificates/expired/list', listExpiredCertificates);

// POST /certificates/batch-import — 批量导入证件（JSON）
router.post('/certificates/batch-import', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:import'), batchImportCertificates);

module.exports = router;