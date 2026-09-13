/**
 * Sprint10-D-2-1 HSE月度安全履职考核模块 - 父路由（纯聚合入口）
 * 路由前缀: /api/hse/assessment-monthly
 *
 * 本模块仅做子路由聚合：全部 42 条端点（GET19/POST17/PUT3/DELETE3）已迁移至
 * routes/hse-assessment-monthly/main.js（薄控制器 controllers/assessmentMonthlyController.js）
 * → services/assessmentMonthly*.js（业务+SQL）。此处保留原对外挂载契约：
 * app.js 中 `app.use('/api/hse/assessment-monthly', require('./routes/hse-assessment-monthly'))` 依赖不变。
 *
 * 数据库: PostgreSQL 15，10张核心表
 */
const express = require('express');
const router = express.Router();

// 子路由聚合（保持 /api/hse/assessment-monthly/... 契约与注册顺序不变）
router.use('/', require('./hse-assessment-monthly/main'));

module.exports = router;