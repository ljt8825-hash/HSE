/**
 * 智能导入（/api/import）—— 纯绑定路由
 * 业务已下沉：controllers/hse-import.js（薄 handler）→ services/importExcelService.js / importQueryService.js / importMemoryService.js。
 * 由父路由 routes/import.js 聚合挂载，最终契约 /api/import/parse | /confirm | /rollback | /logs | /config | /template/:module | /upload | /stats。
 * 注意：router 以 use('/') 挂载，路径在此基础上保持与原 import.js 一致。
 */
const express = require('express');
const router = express.Router();

const { requireRole } = require('../../middleware/auth');
const { uploadExcel } = require('../../middleware/upload');
const { error } = require('../../middleware/response');
const {
  parseFile,
  confirmImport,
  rollbackImport,
  getImportLogs,
  getImportConfig,
  downloadTemplate,
  uploadFile,
  getImportStats,
} = require('../../controllers/import');

router.post('/parse', requireRole('admin', 'safety_manager'), parseFile);
router.post('/confirm', requireRole('admin', 'safety_manager'), confirmImport);
router.post('/rollback', requireRole('admin', 'safety_manager'), rollbackImport);
router.get('/logs', requireRole('admin', 'safety_manager'), getImportLogs);
router.get('/config', requireRole('admin', 'safety_manager'), getImportConfig);
router.get('/template/:module', requireRole('admin', 'safety_manager'), downloadTemplate);
// upload：multer 落盘。注意必须与原实现一致地在请求期惰性调用
// `uploadExcel.single('file')`（而非模块加载期绑定），否则 mocking/中间件注入 req.file 将失效。
router.post('/upload', requireRole('admin', 'safety_manager'), (req, res, next) => {
  uploadExcel.single('file')(req, res, (err) => {
    if (err) {
      console.error('[Upload Debug] multer 错误:', err.message);
      return res.json(error(-1, err.message || '文件上传失败'));
    }
    next();
  });
}, uploadFile);
router.get('/stats', requireRole('admin', 'safety_manager'), getImportStats);

module.exports = router;