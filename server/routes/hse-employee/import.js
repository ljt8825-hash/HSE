/**
 * HSE 员工域 · 员工导入（JSON + Excel 模板/预览/落库）—— 纯绑定路由
 * 业务已下沉：controllers/hse-import.js（薄 handler）→ services/employeeImportService.js（业务+SQL）
 * 对外路由契约逐字节不变，由父路由 router.use('/', this) 挂载，
 * 最终契约 /api/hse/employee/employees/import(...)
 */
const express = require('express');
const router = express.Router();

const { requireRole, requirePermission } = require('../../middleware/auth');
const { uploadExcel } = require('../../middleware/upload');
const {
  importEmployees,
  getImportTemplate,
  previewExcel,
  importExcel,
} = require('../../controllers/hse-import');

// POST /employees/import — 批量导入员工（JSON数组）
router.post('/employees/import', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:import'), importEmployees);

// GET /employees/import/template — 下载 Excel 模板
router.get('/employees/import/template', requireRole('admin', 'safety_manager'), getImportTemplate);

// POST /employees/import/excel/preview — 上传 Excel 文件并返回解析+校验结果（不写入数据库）
router.post('/employees/import/excel/preview', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:import'), uploadExcel.single('file'), previewExcel);

// POST /employees/import/excel — 上传 Excel 文件并直接导入（支持组织路径匹配 + 岗位关联）
router.post('/employees/import/excel', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:import'), uploadExcel.single('file'), importExcel);

module.exports = router;
