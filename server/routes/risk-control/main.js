/**
 * 风险管控（/api/risk-control）子路由 —— 纯绑定（不承载业务）
 * 业务在 services/riskControlService.js，薄 handler 在 controllers/riskControlController.js，
 * 本文件仅按与原 routes/risk-control.js 一致的注册顺序做 方法+路径+中间件 → controller 绑定。
 *
 * 保持一致的关键约束（务必遵循）：
 *  - 注册顺序逐条与原文件一致。GET /（根，列表）注册在 GET /:id 之前；
 *    /rules/*（2 段路径）注册在 /:id/attachments、/:id/generate-hazard 之后，不与 1 段 /:id 冲突。
 *  - requireRole('admin','safety_manager') 与 uploadDocument.single('file') 中间件留在本层绑定，
 *    controller/service 不感知鉴权与上传。
 */
const express = require('express');
const router = express.Router();

const { requireRole } = require('../../middleware/auth');
const { uploadDocument } = require('../../middleware/upload');
const ctl = require('../../controllers/riskControlController');

// ---- 统计 ----（原文件顺序 1-3）
router.get('/stats/all', ctl.statsAll);
router.get('/stats/level', ctl.statsLevel);
router.get('/stats/type', ctl.statsType);

// ---- 导出 CSV ----（原文件顺序 4）
router.get('/export', ctl.riskExport);

// ---- 根列表 / 详情（根注册在 /:id 之前）----（原文件顺序 5-6）
router.get('/', ctl.list);
router.get('/:id', ctl.detail);

// ---- 创建 / 更新 / 软删除 / 导入 ----（原文件顺序 7-10）
router.post('/', ctl.create);
router.put('/:id', ctl.update);
router.delete('/:id', ctl.remove);
router.post('/import', ctl.importRecords);

// ---- 附件 ----（原文件顺序 11-13）
router.get('/:id/attachments', ctl.attachments);
router.post('/:id/attachments', uploadDocument.single('file'), ctl.uploadAttachment);
router.delete('/:id/attachments/:aid', ctl.deleteAttachment);

// ---- 版本履历 ----（原文件顺序 14）
router.get('/:id/versions', ctl.versions);

// ---- 风险评估（唯一鉴权端点）----（原文件顺序 15）
router.put('/:id/assess', requireRole('admin', 'safety_manager'), ctl.assess);

// ---- 风险↔隐患联动 ----（原文件顺序 16-17）
router.get('/:id/related-hazards', ctl.relatedHazards);
router.post('/:id/generate-hazard', ctl.generateHazard);

// ---- 规则字典 ----（原文件顺序 18-24）
router.get('/rules/levels', ctl.ruleLevels);
router.get('/rules/assessment-methods', ctl.ruleAssessmentMethods);
router.get('/rules/control-measures', ctl.ruleControlMeasures);
router.get('/rules/categories', ctl.ruleCategories);
router.get('/rules/responsibility-matrix', ctl.ruleResponsibilityMatrix);
router.get('/rules/assessment-scales', ctl.ruleAssessmentScales);
router.get('/rules/all', ctl.ruleAll);

module.exports = router;