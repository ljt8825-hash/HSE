/**
 * 现场管理路由 —— 纯聚合入口（不再承载业务 handler）
 *
 * 业务已按三层下沉至 services/siteMgmtService.js（业务 + SQL + WPS/PG 双数据源 + 内存降级）
 * + controllers/siteMgmtController.js（薄 handler） + routes/site-mgmt/main.js（纯绑定子路由），
 * 本文件仅负责挂载，对外路由契约逐字节不变（挂载点 /api/site-mgmt，由 app.js
 * `app.use('/api/site-mgmt', siteMgmtRoutes)` 依赖）。
 *
 * 兼容说明：原文件除 router 外还导出内存单例 memoryStores / memoryCounters / initMemoryData，
 *           被 services/importMemoryService.js 直接读取改写（内存模式智能导入入库），
 *           故聚合条目完成 move 后仍由 service 暴露同一单例引用，并在此转发，等价原契约与内存一致性。
 */

const express = require('express');
const router = express.Router();

const service = require('../services/siteMgmtService');

// 子路由挂载（保持 /api/site-mgmt/... 契约与注册顺序不变）
router.use('/', require('./site-mgmt/main'));

module.exports = router;
// 内存单例转发（保持与 services/importMemoryService.js 的引用一致性 —— 二者共享同一模块缓存）
module.exports.memoryStores = service.memoryStores;
module.exports.memoryCounters = service.memoryCounters;
module.exports.initMemoryData = service.initMemoryData;