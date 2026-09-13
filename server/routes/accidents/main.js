/**
 * 事故管理子路由 —— 纯绑定（不承载业务）
 * 业务在 services/accidentService.js，薄 handler 在 controllers/accidentController.js，
 * 本文件仅按与原 routes/accidents.js 一致的注册顺序做 方法+路径+中间件 → controller 绑定。
 *
 * 注意：原文件将「参数路由 /:id」放在各固定路径之后，此处保持相同顺序，避免参数路由遮蔽固定路径。
 */
const express = require('express');
const router = express.Router();

const { requireRole } = require('../../middleware/auth');
const { validateBody } = require('../../middleware/validate');
const { uploadDocument } = require('../../middleware/upload');
const { createAccidentSchema, updateAccidentSchema } = require('../../schemas/accidents');
const ctl = require('../../controllers/accidentController');

// ---- 统计 & 列表（固定路径优先于 :id） ----
router.get('/stats/all', ctl.statsAll);
router.get('/stats/yearly', ctl.statsYearly);
router.get('/unsettled', ctl.unsettled);
router.get('/stats', ctl.statsLegacy);
router.get('/export', requireRole('admin', 'safety_manager'), ctl.exportCsv);
router.get('/', ctl.list);
router.get('/teams', ctl.teams);
router.get('/personnel-search', ctl.personnelSearch);
router.get('/suggest-team', ctl.suggestTeam);
router.get('/category-nature', ctl.categoryNature);
router.get('/suggest-party', ctl.suggestParty);

// ---- CRUD ----
router.get('/:id', ctl.detail);
router.post('/', requireRole('admin', 'safety_manager'), validateBody(createAccidentSchema), ctl.create);
router.put('/:id', requireRole('admin', 'safety_manager'), validateBody(updateAccidentSchema), ctl.update);
router.delete('/:id', requireRole('admin', 'safety_manager'), ctl.remove);

// ---- 附件 & 版本（两条段路径，不受 /:id 单段遮蔽） ----
router.get('/:id/attachments', ctl.attachments);
router.post('/:id/attachments', requireRole('admin', 'safety_manager'), uploadDocument.single('file'), ctl.uploadAttachment);
router.delete('/:id/attachments/:aid', requireRole('admin', 'safety_manager'), ctl.deleteAttachment);
router.get('/:id/versions', ctl.versions);

module.exports = router;