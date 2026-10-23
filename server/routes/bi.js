/**
 * BI 数据看板路由（/api/hse/bi）—— 纯聚合入口，不再承载业务 handler
 * 业务按三层下沉至 services/biService.js + controllers/biController.js。
 * 口径与「领导视角统一看板」一致（复用 leader 域聚合函数），全部端点只读。
 * 权限：admin（与前端菜单 authority 对齐）；缓存 30s（realtime 10s）。
 *
 * 端点契约（year 缺省 = 历年累计；trend 累计模式截断到当前月）：
 *   GET /overview                公司级 10 维汇总（summary）
 *   GET /trend?year=             公司级逐月趋势（months + rows 各维度按月数组）
 *   GET /ranking?metricKey=&top=&order=&year=   乡镇排行（violations|hazards|accidents|inspections|trainings|emergencies）
 *   GET /map?type=hazards|accidents|emergencies&year=       隐患乡镇 / 事故等级 / 演练乡镇分布
 *   GET /realtime                今日动态计数
 */
const express = require('express');
const router = express.Router();
const { requireRole } = require('../middleware/auth');
const { cacheMiddleware } = require('../middleware/cache');
const ctl = require('../controllers/biController');

// BI 缓存 TTL（毫秒），默认 30 秒
const BI_CACHE_TTL = parseInt(process.env.BI_CACHE_TTL) || 30000;

router.get('/overview', requireRole('admin'), cacheMiddleware(BI_CACHE_TTL), ctl.overview);
router.get('/trend', requireRole('admin'), cacheMiddleware(BI_CACHE_TTL), ctl.trend);
router.get('/ranking', requireRole('admin'), cacheMiddleware(BI_CACHE_TTL), ctl.ranking);
router.get('/map', requireRole('admin'), cacheMiddleware(BI_CACHE_TTL), ctl.mapData);
router.get('/realtime', requireRole('admin'), cacheMiddleware(10000), ctl.realtime);

module.exports = router;
