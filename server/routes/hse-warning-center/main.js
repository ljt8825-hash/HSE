/**
 * 智能预警与整改闭环中心子路由 —— 纯绑定（不承载业务）
 * 业务在 services/warningCenterService.js，薄 handler 在 controllers/warningCenterController.js，
 * 本文件仅按与原 routes/hse-warning-center.js 一致的注册顺序做 方法+路径+中间件 → controller 绑定。
 *
 * 保持一致的关键约束（务必遵循）：
 *  - 注册顺序逐条与原文件一致，尤其 GET /rules/:id 注册在 GET /rules/versions 之前——Express 按序匹配，
 *    GET /rules/versions 实际命中 /rules/:id（id='versions'）后返回「规则不存在」；此语义是原实现固有行为，须原样保留。
 *  - requireRole 权限中间件留在本层绑定（admin/safety_manager…），controller/service 不感知角色。
 *  - 定时任务（预警扫描/升级检查的 cron.schedule）注册副作用在 services/warningCenterService.js 模块加载时执行，
 *    测试 NODE_ENV=test 不启动，与本文件无关。
 */
const express = require('express');
const router = express.Router();

const { requireRole } = require('../../middleware/auth');
const ctl = require('../../controllers/warningCenterController');

// ---- 模块一：风险预警中心 ----
router.get('/warnings', ctl.warnings);
router.get('/warnings/stats', ctl.warningStats);
router.get('/warnings/:id', ctl.warningDetail);
router.post('/warnings/scan', requireRole('admin', 'safety_manager'), ctl.warningScan);
router.post('/warnings/escalate', requireRole('admin', 'safety_manager'), ctl.warningEscalate);

// ---- 模块二：整改任务中心 ----
router.get('/tasks', ctl.taskList);
router.get('/tasks/:id', ctl.taskDetail);
router.post('/tasks', requireRole('admin', 'safety_manager', 'department_manager', 'township_manager', 'area_manager', 'administrator'), ctl.taskCreate);
router.put('/tasks/:id/dispatch', requireRole('admin', 'safety_manager', 'department_manager', 'township_manager', 'area_manager', 'administrator'), ctl.taskDispatch);
router.put('/tasks/:id/process', ctl.taskProcess);
router.put('/tasks/:id/submit-proof', ctl.taskSubmitProof);
router.put('/tasks/:id/review', requireRole('admin', 'safety_manager', 'department_manager', 'township_manager'), ctl.taskReview);
router.put('/tasks/:id/close', requireRole('admin', 'safety_manager'), ctl.taskClose);

// ---- 模块三：整改闭环分析 ----
router.get('/analysis', ctl.analysis);

// ---- 模块四：预警规则管理 ----
router.get('/rules', ctl.ruleList);
router.get('/rules/:id', ctl.ruleDetail);
router.post('/rules', requireRole('admin', 'safety_manager'), ctl.ruleCreate);
router.put('/rules/:id', requireRole('admin', 'safety_manager'), ctl.ruleUpdate);
router.put('/rules/:id/toggle', requireRole('admin', 'safety_manager'), ctl.ruleToggle);
router.get('/rules/versions', ctl.ruleVersions);

// ---- Sprint7-C 模块五：整改效果验证 ----
router.post('/tasks/:id/evaluate', requireRole('admin', 'safety_manager', 'department_manager', 'township_manager'), ctl.taskEvaluate);
router.get('/tasks/:id/evaluation', ctl.taskEvaluation);
router.get('/evaluations/stats', ctl.evaluationStats);

// ---- Sprint7-C 模块六：预警调度管理 ----
router.get('/schedulers', ctl.schedulerList);
router.post('/schedulers', requireRole('admin', 'safety_manager'), ctl.schedulerCreate);
router.put('/schedulers/:id', requireRole('admin', 'safety_manager'), ctl.schedulerUpdate);
router.put('/schedulers/:id/toggle', requireRole('admin', 'safety_manager'), ctl.schedulerToggle);
router.post('/schedulers/:id/execute', requireRole('admin', 'safety_manager'), ctl.schedulerExecute);

module.exports = router;