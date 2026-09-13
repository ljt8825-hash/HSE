/**
 * 培训模块路由 —— 纯聚合入口（不再承载业务 handler）
 *
 * 业务已按子域下沉至 services/ (业务+SQL) + controllers/trainingController.js (薄 handler)
 * + routes/training/main.js (纯绑定子路由)，本文件仅负责挂载，对外路由契约逐字节不变
 * （挂载点 /api/training，由 app.js app.use('/api/training', trainingRoutes) 依赖）。
 *
 * 子域归属：
 *   - /records 全套          → services/trainingRecordService.js
 *   - /ledger 台账相关        → services/trainingLedgerService.js
 *   - /ledger/signin、batch-* → services/trainingRegisterService.js
 *   - /stats、（/stats/enhanced 也在其中）→ services/trainingStatsService.js + services/trainingReminderService.js(analysis)
 *   - /records/:id/attachments、/records/:id/versions → services/trainingAttachmentService.js
 *   - /requirements           → services/trainingRequirementService.js
 *   - /plans（含 execute）    → services/trainingPlanService.js
 *   - /reminders/*、/analysis/enhanced → services/trainingReminderService.js
 *   - 子路由工厂 createTrainingSubRoute（/ledger、/new-employees、/driver、/taihang）
 *     收入 services/trainingShared.js 并由 routes/training/main.js 复用挂载。
 *
 * 兼容说明：
 *   - routes/training-ocr.js 依赖的 resolveTrainingPersonId / resolveTrainingPersonName
 *     在此经 trainingShared 转发保留，仅供外部引用（不在本文件内执行业务）。
 *   - 原文件模块级导出的身份解析纯函数（提示词-OCR 复用）转发不变。
 */

const express = require('express');
const router = express.Router();

const shared = require('../services/trainingShared');

// ============================================================
// 子路由挂载（业务全部下沉，此处只做聚合；子路由内已按原顺序注册，避免参数路由遮蔽）
// ============================================================
router.use('/', require('./training/main'));

// ============================================================
// 模块级导出转发（保持原内部符号可被 require('../routes/training').xxx 引用）
// routes/training-ocr.js: resolveTrainingPersonId / resolveTrainingPersonName
// ============================================================
module.exports = router;
module.exports.resolveTrainingPersonId = shared.resolveTrainingPersonId;
module.exports.resolveTrainingPersonName = shared.resolveTrainingPersonName;