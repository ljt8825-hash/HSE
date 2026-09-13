/**
 * Sprint8-A HSE智能分析中心路由 —— 纯聚合入口（不再承载业务 handler）
 *
 * 业务已按三层下沉至 services/analysisCenterService.js（全部业务 + SQL + 画像/预测辅助计算）+
 * controllers/analysisCenterController.js（薄 handler，统一解释 __t:'json' 描述符）+
 * routes/hse-analysis-center/main.js（纯绑定子路由，requireRole 中间件留在绑定层，注册顺序与原文件逐条一致）。
 * 本文件仅负责挂载，对外路由契约逐字节不变（挂载点 /api/hse/analysis-center，由 app.js
 * `app.use('/api/hse/analysis-center', ...)` 依赖）。
 *
 * 兼容说明：源文件记录原五大分析模块（风险/事故/整改/画像/预测模型）与数据约束（只读源表）；
 * 此处保持最简聚合，原文件仅导出 router（无内存单例导出），不与任何外部消费者耦合。
 * 原文件顶部文件头（路由前缀、五大模块、数据约束、权限说明）见 services/analysisCenterService.js 文件头保留。
 */

const express = require('express');
const router = express.Router();

// 子路由挂载（保持 /api/hse/analysis-center/... 契约与注册顺序不变）
router.use('/', require('./hse-analysis-center/main'));

module.exports = router;