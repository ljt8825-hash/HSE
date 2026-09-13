/**
 * 隐患整改闭环（/api/hse/hazard-rectification）—— 子路由绑定层
 * 仅绑定 路径 → 方法 → 中间件 → controller 函数，严格按原 routes/hse-hazard-rectification.js
 * 的端点注册顺序。写端点受 requireRole('admin','safety_manager')（变参形式）保护；
 * 读端点公开（"其他角色只读"），不绑定鉴权。
 *
 * 端点顺序约束（与原文件一致）：
 *  - /tasks、/tasks/:id、/tasks/:taskId/actions 均不冲突（不同段数/字面量）；
 *  - /stats 与 /stats/overdue（2 vs 3 段）不冲突；
 *  - /tasks/:id/ai-suggestions 注册在最后。
 */
const express = require('express');
const router = express.Router();
const { requireRole } = require('../../middleware/auth');
const ctl = require('../../controllers/hazardRectificationController');

const WRITER = requireRole('admin', 'safety_manager');

// ---- 一、隐患确认 ----
router.post('/confirm', WRITER, ctl.confirm);

// ---- 二、整改任务 ----
router.get('/tasks', ctl.listTasks);
router.get('/tasks/:id', ctl.taskDetail);
router.post('/tasks', WRITER, ctl.createTask);
router.put('/tasks/:id', WRITER, ctl.updateTask);
router.delete('/tasks/:id', WRITER, ctl.removeTask);

// ---- 三、整改措施 ----
router.get('/tasks/:taskId/actions', ctl.listActions);
router.post('/tasks/:taskId/actions', WRITER, ctl.createAction);
router.put('/actions/:id', WRITER, ctl.updateAction);
router.delete('/actions/:id', WRITER, ctl.removeAction);

// ---- 四、复查记录 ----
router.get('/reviews', ctl.listReviews);
router.get('/reviews/:id', ctl.reviewDetail);
router.post('/reviews', WRITER, ctl.createReview);
router.delete('/reviews/:id', WRITER, ctl.removeReview);

// ---- 五、统计 ----
router.get('/stats', ctl.getStats);
router.get('/stats/overdue', ctl.getStatsOverdue);

// ---- 六、责任人查询 ----
router.get('/responsible/:employeeId/tasks', ctl.responsibleTasks);

// ---- 七、AI 整改建议（公开，模拟生成） ----
router.post('/tasks/:id/ai-suggestions', ctl.aiSuggestions);

module.exports = router;