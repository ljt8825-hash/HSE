/**
 * 花名册导入（/api/hse）roster-import + import-mapping-rules + import-batches —— 子路由绑定层
 * 仅绑定 路径 → 方法 → 中间件 → controller 函数，严格按原 routes/hse-roster-import.js
 * 的端点注册顺序与鉴权中间件。本域全端点受 requireRole 保护（上传/确认/待确认/批次
 * 允许 admin·safety_manager·hr；映射规则允许 admin·safety_manager）。
 *
 * 注意：upload 端点的 multer 中间件 `uploadExcel.single('file')` + `validateUploadedFile`
 * 属请求预处理，须保留在本层原样绑定（在 requireRole 之后、controller 之前）。
 */
const express = require('express');
const router = express.Router();
const multer = require('multer');
const { requireRole } = require('../../middleware/auth');
const { uploadExcel, validateUploadedFile } = require('../../middleware/upload');
const ctl = require('../../controllers/rosterImportController');

const IMPORT_WRITER = requireRole(['admin', 'safety_manager', 'hr']);
const RULE_WRITER = requireRole(['admin', 'safety_manager']);

// 1. 上传解析（multer 预处理）
router.post('/roster-import/upload', IMPORT_WRITER, uploadExcel.single('file'), validateUploadedFile, ctl.upload);
// 2. 确认导入
router.post('/roster-import/confirm', IMPORT_WRITER, ctl.confirm);
// 3. 待确认列表
router.get('/roster-import/pending', IMPORT_WRITER, ctl.pendingList);

// 4. 映射规则查询
router.get('/import-mapping-rules/list', RULE_WRITER, ctl.mappingList);
// 5. 映射规则新增
router.post('/import-mapping-rules', RULE_WRITER, ctl.mappingCreate);
// 6. 映射规则删除
router.delete('/import-mapping-rules/:id', RULE_WRITER, ctl.mappingDelete);

// 7. 批次列表
router.get('/import-batches/list', IMPORT_WRITER, ctl.batchesList);

module.exports = router;