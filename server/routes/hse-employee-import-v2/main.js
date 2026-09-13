/**
 * 员工花名册导入 V2 子路由 —— 纯绑定（不承载业务）
 * 业务在 services/employeeImportV2Service.js，薄 handler 在 controllers/employeeImportV2Controller.js，
 * 本文件仅按与原 routes/hse-employee-import-v2.js 一致的注册顺序做 方法+路径+中间件 → controller 绑定。
 *
 * 保持一致的关键约束（务必遵循）：
 *  - 注册顺序逐条与原文件一致（共 12 条）。
 *  - requireRole 权限中间件留在本层绑定（admin/safety_manager / admin），controller/service 不感知角色。
 *  - multer 上传中间件 uploadExcel.single('file') 仅在本层绑定；controller 的 upload handler 自 req.file/req.body 取参再调 service。
 */
const express = require('express');
const router = express.Router();

const { requireRole } = require('../../middleware/auth');
const { uploadExcel } = require('../../middleware/upload');
const ctl = require('../../controllers/employeeImportV2Controller');

router.post('/upload', requireRole('admin', 'safety_manager'), uploadExcel.single('file'), ctl.upload);
router.get('/batches', requireRole('admin', 'safety_manager'), ctl.batches);
router.get('/batch/:batchId/preview', requireRole('admin', 'safety_manager'), ctl.batchPreview);
router.get('/batch/:batchId/pending', requireRole('admin', 'safety_manager'), ctl.batchPending);
router.post('/pending/:id/resolve', requireRole('admin', 'safety_manager'), ctl.pendingResolve);
router.post('/batch/:batchId/import', requireRole('admin', 'safety_manager'), ctl.batchImport);
router.delete('/batch/:batchId', requireRole('admin', 'safety_manager'), ctl.deleteBatch);
router.post('/clear-all', requireRole('admin'), ctl.clearAll);
router.get('/clear-all-preview', requireRole('admin'), ctl.clearAllPreview);
router.post('/clear-all-cascade', requireRole('admin'), ctl.clearAllCascade);
router.get('/source-files', requireRole('admin', 'safety_manager'), ctl.sourceFiles);
router.post('/source/import', requireRole('admin', 'safety_manager'), ctl.sourceImport);

module.exports = router;