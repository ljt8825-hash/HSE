/**
 * 目标管理路由 —— 纯聚合入口（不再承载业务 handler）
 *
 * 业务已按三层下沉至 services/objectiveService.js（业务 + SQL + 内存降级）
 * + controllers/objectiveController.js（薄 handler） + routes/objectives/main.js（纯绑定子路由，
 * 含别名重派发 /org-personnel→/committees、/responsibility→/responsibilities、
 * /safety-budget→/budgets 与上传/权限中间件），
 * 本文件仅负责挂载，对外路由契约逐字节不变（挂载点 /api/objectives，由 app.js
 * `app.use('/api/objectives', objectivesRoutes)` 依赖）。
 *
 * 兼容说明：原文件仅导出 router（无内存单例导出），故此处保持最简聚合，不与任何外部消费者耦合。
 */

const express = require('express');
const router = express.Router();

// 子路由挂载（保持 /api/objectives/... 契约与注册顺序不变）
router.use('/', require('./objectives/main'));

module.exports = router;