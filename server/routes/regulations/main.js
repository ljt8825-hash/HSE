/**
 * 规章制度（/api/regulations）—— 子路由绑定层
 * 严格按原 routes/regulations.js 的端点注册顺序绑定 → controller。
 *
 * 端点顺序约束（与原文件一致）：
 *  - 列表 /、统计 /stats、导出 /export 均注册在 /:id 之前，避免被参数路由遮蔽；
 *  - /:id/attachments、/:id/versions 为多段子路径，不与单段 /:id 冲突。
 *
 * 鉴权说明：
 *  - 全局 app.use('/api', authMiddleware) 已覆盖本路由，所有端点需有效 JWT；
 *  - 原文件无 requireRole 写保护（已认证角色均可写）→ 此处不追加，忠实复刻原行为。
 */
const express = require('express');
const router = express.Router();
const { uploadDocument } = require('../../middleware/upload');
const ctl = require('../../controllers/regulationsController');

// ---- 基础 CRUD ----
router.get('/', ctl.list);
router.get('/stats', ctl.stats);
router.get('/export', ctl.exportList);
router.get('/:id', ctl.detail);
router.post('/', ctl.create);
router.put('/:id', ctl.update);
router.delete('/:id', ctl.remove);

// ---- 附件 ----
router.get('/:id/attachments', ctl.listAttachments);
router.post('/:id/attachments', uploadDocument.single('file'), ctl.uploadAttachment);
router.delete('/:id/attachments/:aid', ctl.removeAttachment);

// ---- 版本履历 ----
router.get('/:id/versions', ctl.listVersions);

module.exports = router;