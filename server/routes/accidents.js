/**
 * 事故管理路由 —— 纯聚合入口（不再承载业务 handler）
 *
 * 业务已按三层下沉至 services/accidentService.js（业务+SQL+内存降级+建表启动）
 * + controllers/accidentController.js（薄 handler） + routes/accidents/main.js（纯绑定子路由），
 * 本文件仅负责挂载，对外路由契约逐字节不变（挂载点 /api/accidents，由 app.js
 * `app.use('/api/accidents', require('./routes/accidents'))` 依赖）。
 *
 * 端点（18 条）：
 *   GET    / stats/all stats/yearly unsettled stats export / teams personnel-search
 *          suggest-team category-nature suggest-party :id :id/attachments :id/versions
 *   POST   / :id/attachments
 *   PUT    /:id
 *   DELETE /:id :id/attachments/:aid
 *
 * 兼容说明：原文件模块级仅导出 router（module.exports = router），无内部符号被外部引用，
 *           故聚合条目完成即等价原契约，无需额外转发。
 */

const express = require('express');
const router = express.Router();

// 子路由挂载（保持 /api/accidents/... 契约与注册顺序不变）
router.use('/', require('./accidents/main'));

module.exports = router;