/**
 * 风险管控路由 —— 纯聚合入口（不再承载业务 handler）
 *
 * 业务已按三层下沉至 services/riskControlService.js（全部业务 + SQL + 内存降级 + 通知 + 规则字典）+
 * controllers/riskControlController.js（薄 handler，统一解释 __t:'json'/'csv' 描述符 + CSV 响应）+
 * routes/risk-control/main.js（纯绑定子路由，requireRole 中间件与 uploadDocument.single 留在绑定层，注册顺序与原文件逐条一致）。
 * 本文件仅负责挂载，对外路由契约逐字节不变（挂载点 /api/risk-control，由 app.js
 * `app.use('/api/risk-control', ...)` 依赖）。
 *
 * 兼容说明：原文件仅导出 router（无内存单例导出），故此处保持最简聚合，不与任何外部消费者耦合。
 * 原文件顶部文件头（PostgreSQL + 内存降级双模式、端点清单）见 services/riskControlService.js 文件头保留。
 */

const express = require('express');
const router = express.Router();

// 子路由挂载（保持 /api/risk-control/... 契约与注册顺序不变）
router.use('/', require('./risk-control/main'));

module.exports = router;