/**
 * HSE 员工域 · 员工导入薄 controller
 * 仅做 req 解析 + 调 service + res 包装；业务规则与 SQL 在 services/employeeImportService.js
 */
const { isConnected } = require('../config/db');
const { success, error } = require('../middleware/response');
const { camelKeys } = require('../utils/commonResponse');
const { auditLog } = require('../routes/audit');
const { validateUploadedFile, deleteFile, fixFilenameEncoding } = require('../middleware/upload');
const employeeImportService = require('../services/employeeImportService');

// POST /employees/import — 批量导入员工（JSON数组）
async function importEmployees(req, res) {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));
    const result = await employeeImportService.importEmployees(req.body.employees, req.user?.id || null);
    if (result.error) return res.json(error(result.error, result.message));
    await auditLog({
      userId: req.user?.id, username: req.user?.username,
      action: 'import', module: '人员主数据',
      description: `批量导入员工: 成功${result.success}条, 失败${result.failed}条`,
      ip: req.ip,
    }).catch(() => {});
    res.json(success(camelKeys({ total: result.total, success: result.success, failed: result.failed, errors: result.errors }), '导入完成'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

// GET /employees/import/template — 下载 Excel 模板
async function getImportTemplate(req, res) {
  try {
    const buffer = employeeImportService.buildImportTemplate();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="employee_import_template.xlsx"');
    res.send(buffer);
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

// POST /employees/import/excel/preview — 上传 Excel 文件并返回解析+校验结果（不写入数据库）
async function previewExcel(req, res) {
  const tmpFile = req.file?.path;
  try {
    if (!req.file) return res.json(error(-3, '请上传 Excel 文件'));

    // 魔术字节校验
    const sigCheck = validateUploadedFile(req.file, 'excel');
    if (!sigCheck.valid) return res.json(error(-3, sigCheck.error));

    const result = employeeImportService.previewExcel({ tmpFile, originalname: fixFilenameEncoding(req.file.originalname) });
    if (result.error) return res.json(error(result.error, result.message));

    res.json(success(camelKeys({
      fileName: result.fileName,
      sheetName: result.sheetName,
      totalRows: result.totalRows,
      validRows: result.validRows,
      invalidRows: result.invalidRows,
      errors: result.errors,
      preview: result.preview,
    }), '解析完成'));
  } catch (err) {
    res.json(error(-1, err.message));
  } finally {
    // 清理临时文件
    if (tmpFile) await deleteFile(tmpFile);
  }
}

// POST /employees/import/excel — 上传 Excel 文件并直接导入（支持组织路径匹配 + 岗位关联）
async function importExcel(req, res) {
  const tmpFile = req.file?.path;
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));
    if (!req.file) return res.json(error(-3, '请上传 Excel 文件'));

    const sigCheck = validateUploadedFile(req.file, 'excel');
    if (!sigCheck.valid) return res.json(error(-3, sigCheck.error));

    const result = await employeeImportService.importExcelFile({ tmpFile, userId: req.user?.id || null });
    if (result.error) return res.json(error(result.error, result.message));

    await auditLog({
      userId: req.user?.id, username: req.user?.username,
      action: 'import', module: '人员主数据',
      description: `Excel导入员工: 成功${result.success}条, 失败${result.failed}条`,
      ip: req.ip,
    }).catch(() => {});

    res.json(success(camelKeys({
      total: result.total,
      success: result.success,
      failed: result.failed,
      errors: result.errors,
      warnings: result.warnings,
    }), 'Excel导入完成'));
  } catch (err) {
    res.json(error(-1, err.message));
  } finally {
    if (tmpFile) await deleteFile(tmpFile);
  }
}

module.exports = {
  importEmployees,
  getImportTemplate,
  previewExcel,
  importExcel,
};
