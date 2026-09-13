/**
 * 制度标准（/api/standards）—— 子路由绑定层
 * 仅绑定路径 → 方法 → controller 函数，严格按原 routes/standards.js 的端点注册顺序。
 * 原文件所有端点均无鉴权中间件（公开），故此处不绑定 requirePermission/requireRole。
 *
 * 关键顺序约束（与原文件一致，不可调整）：
 *  - 通用附件路由（/:bizType/:id/attachments...）注册在最前（紧跟 /rules）。
 *  - 各域 /stats、/export 必须注册在 /:id 之前，避免被参数路由遮蔽。
 */
const express = require('express');
const router = express.Router();
const ctl = require('../../controllers/standardsController');

// ---- 规则查询 ----
router.get('/rules', ctl.rules);

// ---- 附件通用（通用参数段，注册最前） ----
router.get('/:bizType/:id/attachments', ctl.listAttachments);
router.post('/:bizType/:id/attachments', ctl.uploadAttachment);
router.delete('/:bizType/:id/attachments/:aid', ctl.deleteAttachment);

// ---- 1. 规章制度 ----
router.get('/regulations/stats', ctl.regulationsStats);
router.get('/regulations', ctl.listRegulations);
router.get('/regulations/export', ctl.exportRegulations);
router.get('/regulations/:id', ctl.getRegulation);
router.post('/regulations', ctl.createRegulation);
router.put('/regulations/:id', ctl.updateRegulation);
router.delete('/regulations/:id', ctl.deleteRegulation);

// ---- 2. 文件库 ----
router.get('/library/stats', ctl.libraryStats);
router.get('/library', ctl.listLibrary);
router.get('/library/export', ctl.exportLibrary);
router.get('/library/:id', ctl.getLibraryDoc);
router.post('/library', ctl.createLibraryDoc);
router.put('/library/:id', ctl.updateLibraryDoc);
router.delete('/library/:id', ctl.deleteLibraryDoc);

// ---- 3. 文件审核 ----
router.get('/reviews/stats', ctl.reviewsStats);
router.get('/reviews', ctl.listReviews);
router.get('/reviews/:id', ctl.getReview);
router.post('/reviews', ctl.createReview);
router.put('/reviews/:id', ctl.updateReview);

// ---- 4. 条款库 ----
router.get('/clauses/stats', ctl.clausesStats);
router.get('/clauses', ctl.listClauses);
router.get('/clauses/export', ctl.exportClauses);
router.get('/clauses/:id', ctl.getClause);
router.post('/clauses', ctl.createClause);
router.put('/clauses/:id', ctl.updateClause);
router.delete('/clauses/:id', ctl.deleteClause);

// ---- 5. 条款资料关联 ----
router.get('/relations', ctl.listRelations);
router.post('/relations', ctl.createRelations);
router.delete('/relations/:id', ctl.deleteRelation);

// ---- 6. 匹配建议 ----
router.get('/suggestions/stats', ctl.suggestionsStats);
router.get('/suggestions', ctl.listSuggestions);
router.post('/suggestions/generate', ctl.generateSuggestions);
router.put('/suggestions/:id/handle', ctl.handleSuggestion);

// ---- 统计总览 ----
router.get('/stats/overview', ctl.statsOverview);
router.get('/stats', ctl.stats);

// ---- 模块信息（根路径，注册最后） ----
router.get('/', ctl.moduleInfo);

module.exports = router;