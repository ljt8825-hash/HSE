/**
 * Sprint6.5-B 集团HSE考核分析系统路由 —— 纯聚合入口（不再承载业务 handler）
 *
 * 业务已按三层下沉至 services/assessmentService.js（全部业务 + SQL + 私有辅助函数）+
 * controllers/assessmentController.js（薄 handler，统一解释 __t:'json' 描述符）+
 * routes/hse-assessment/main.js（纯绑定子路由，注册顺序与原文件逐条一致）。
 * 本文件仅负责挂载，对外路由契约逐字节不变（挂载点 /api/hse/assessment，由 app.js
 * `app.use('/api/hse/assessment', ...)` 依赖）。
 *
 * 兼容说明：原文件为纯只读考核综合分析（GET /overview /ranking /indicator-analysis /target-progress
 * /deduction-detail 及根路径考核记录列表），无鉴权、无 cron；此处保持最简聚合，原文件仅导出 router，不与外部消费者耦合。
 * 原文件顶部文件头（路由前缀、六大接口、模型版本说明）见 services/assessmentService.js 文件头保留。
 */

const express = require('express');
const router = express.Router();

// 子路由挂载（保持 /api/hse/assessment/... 契约与注册顺序不变）
router.use('/', require('./hse-assessment/main'));

module.exports = router;