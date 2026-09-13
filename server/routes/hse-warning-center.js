/**
 * 智能预警与整改闭环中心路由 —— 纯聚合入口（不再承载业务 handler）
 *
 * 业务已按三层下沉至 services/warningCenterService.js（业务 + SQL + 预警扫描/升级看护 + cron 定时注册）+
 * controllers/warningCenterController.js（薄 handler，统一解释 __t:'json' 描述符）+
 * routes/hse-warning-center/main.js（纯绑定子路由，requireRole 中间件留在绑定层，注册顺序与原文件逐条一致）。
 * 本文件仅负责挂载，对外路由契约逐字节不变（挂载点 /api/hse/warning-center，由 app.js
 * `app.use('/api/hse/warning-center', hseWarningCenterRoutes)` 依赖）。
 *
 * 兼容说明：原文件仅导出 router（无内存单例导出），故此处保持最简聚合，不与任何外部消费者耦合；
 * 定时任务（每日 2 点预警扫描 + 每小时升级检查）的 cron.schedule 副作用随 service 模块加载而注册，
 * 测试环境 NODE_ENV=test 不启动。
 */

const express = require('express');
const router = express.Router();

// 子路由挂载（保持 /api/hse/warning-center/... 契约与注册顺序不变）
router.use('/', require('./hse-warning-center/main'));

module.exports = router;