/**
 * HSE 任务中心（/api/hse/tasks）—— 子路由绑定层
 * 仅绑定路径 → 方法 → 中间件 → controller 函数，严格按原 routes/hse-tasks.js 的端点注册顺序。
 *
 * 顺序约束（与原文件一致，不可调整）：
 *  当 /:taskId 于第 2 位注册后，其后的单段 GET（/inspection、/pending、/overdue）在 Express 中
 *  会被 /:taskId 遮蔽（GET /inspection → taskId='inspection' → 详情 404）。此即原文件既有行为，
 *  三层化必须原样保留，不得提前注册（否则会改变既有路由语义）。
 */
const express = require('express');
const router = express.Router();
const ctl = require('../../controllers/hseTasksController');

// 1. 列表
router.get('/', ctl.list);

// 2. 详情（此后单段 GET 被其遮蔽，保持原序）
router.get('/:taskId', ctl.detail);

// 3. 更新状态
router.put('/:taskId/status', ctl.updateStatus);

// 4. 创建任务
router.post('/', ctl.create);

// 5. 删除任务
router.delete('/:taskId', ctl.remove);

// 6-7. 统计（双段路径，不被 /:taskId 遮蔽）
router.get('/stats/overview', ctl.statsOverview);
router.get('/stats/ranking', ctl.statsRanking);

// 8-10. 检查任务（GET 单段被 /:taskId 遮蔽，保持原序）
router.get('/inspection', ctl.listInspection);
router.post('/inspection', ctl.createInspection);
router.post('/inspection/:taskId/execute', ctl.executeInspection);

// 11-12. 待办 / 逾期（GET 单段被 /:taskId 遮蔽，保持原序）
router.get('/pending', ctl.pending);
router.get('/overdue', ctl.overdue);

module.exports = router;