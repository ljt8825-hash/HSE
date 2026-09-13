/**
 * 应急管理路由 —— 纯聚合入口（不再承载业务 handler）
 *
 * 业务已按三层下沉至 services/emergencyService.js（业务+SQL+内存降级+建表）
 * + controllers/emergencyController.js（薄 handler） + routes/emergency/main.js（纯绑定子路由），
 * 本文件仅负责挂载，对外路由契约逐字节不变（挂载点 /api/emergency，由 app.js
 * `app.use('/api/emergency', require('./routes/emergency'))` 依赖）。
 *
 * 端点（约 46 条）：
 *   /plans:    GET stats list export :id :id/attachments :id/versions；POST /；PUT/DELETE :id；
 *              POST/DELETE :id/attachments
 *   /drills:   GET stats list export :id；POST /；PUT/DELETE :id
 *   /stats, /stats/overview
 *   /materials: list stats export :id；POST /；PUT/DELETE :id
 *   /teams:    list stats export :id :id/members；POST / ；PUT/DELETE :id；POST /generate
 *   /events:   list stats export :id；POST /；PUT/DELETE :id
 *   通用附件 /:bizType/:id/attachments（GET/POST/DELETE，置于固定路径之后）
 *
 * 兼容说明：原文件模块级仅导出 router（module.exports = router），无内部符号被外部引用，
 *           故聚合条目完成即等价原契约，无需额外转发。
 */

const express = require('express');
const router = express.Router();

// 子路由挂载（保持 /api/emergency/... 契约与注册顺序不变）
router.use('/', require('./emergency/main'));

module.exports = router;