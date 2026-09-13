/**
 * 隐患排查治理（/api/hazards）—— 子路由绑定层
 * 仅绑定路径 → 方法 → 中间件 → controller 函数，严格按原 routes/hazards.js 的端点注册顺序。
 * 权限（requirePermission）与文件上传（uploadDocument.single）在此层绑定。
 *
 * 关键顺序约束（与原文件一致，不可调整）：
 *  - /stats、/export 必须注册在 /:id 之前，避免被参数路由遮蔽。
 *  - /:id/related-risk 注册在 /export 之前（两者无冲突，保持原序）。
 */
const express = require('express');
const router = express.Router();
const { requirePermission } = require('../../middleware/auth');
const { uploadDocument } = require('../../middleware/upload');
const ctl = require('../../controllers/hazardController');

// 1-2. 列表 + 统计
router.get('/', ctl.list);
router.get('/stats', ctl.stats);

// 3. 关联风险点（/export 之前注册，保持原序）
router.get('/:id/related-risk', ctl.relatedRisk);

// 4. 导出 CSV
router.get('/export', ctl.exportCsv);

// 5-8. 单条 CRUD
router.get('/:id', ctl.detail);
router.post('/', requirePermission('hse:hazard:create'), ctl.create);
router.put('/:id', requirePermission('hse:hazard:update'), ctl.update);
router.delete('/:id', requirePermission('hse:hazard:delete'), ctl.remove);

// 9-12. 治理闭环
router.put('/:id/rectify', requirePermission('hse:hazard:update'), ctl.rectify);
router.put('/:id/submit-review', requirePermission('hse:hazard:update'), ctl.submitReview);
router.put('/:id/review', requirePermission('hse:hazard:update'), ctl.review);
router.put('/:id/close', requirePermission('hse:hazard:update'), ctl.close);

// 13-16. 提醒 + 分析
router.get('/reminders/high-risk', ctl.remindersHighRisk);
router.get('/reminders/overdue', ctl.remindersOverdue);
router.get('/analysis/repeated', ctl.analysisRepeated);
router.get('/analysis/responsible-overdue', ctl.analysisResponsibleOverdue);

// 17-20. 附件 + 版本
router.get('/:id/attachments', ctl.attachments);
router.post('/:id/attachments', requirePermission('hse:hazard:create'), uploadDocument.single('file'), ctl.uploadAttachment);
router.delete('/:id/attachments/:aid', requirePermission('hse:hazard:delete'), ctl.deleteAttachment);
router.get('/:id/versions', ctl.versions);

// 21-27. 规则（levels/status-flow/sources/categories/expiry/responsibility-matrix/all）
router.get('/rules/levels', ctl.rulesLevels);
router.get('/rules/status-flow', ctl.rulesStatusFlow);
router.get('/rules/sources', ctl.rulesSources);
router.get('/rules/categories', ctl.rulesCategories);
router.get('/rules/expiry', ctl.rulesExpiry);
router.get('/rules/responsibility-matrix', ctl.rulesResponsibilityMatrix);
router.get('/rules/all', ctl.rulesAll);

module.exports = router;