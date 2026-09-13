/**
 * HSE 员工风险画像（/api/hse/risk-profile）—— 子路由绑定层
 * 仅绑定 路径 → 方法 → 中间件 → controller 函数，严格按原 routes/hse-risk-profile.js
 * 的端点注册顺序。写端点 requirePermission('hse:risk:update' | 'hse:risk:create')；读公开。
 *
 * ⚠️ 必须保留原注册顺序（含既有路由遮蔽）：原文件 GET /:employeeId 于第 2 位注册，导致其后
 * 的单段 GET /score-config 被 /:employeeId 捕获（GET /score-config → employeeId='score-config'
 * → 详情 404『员工不存在』），不可达。拆分版忠实还原该顺序（遮蔽故障照旧，见交付报告），
 * 保证新旧行为逐字节一致。头注释中的 GET /dimension/:type 在原文件并不存在，不新增假端点。
 */
const express = require('express');
const router = express.Router();
const { requirePermission } = require('../../middleware/auth');
const ctl = require('../../controllers/hseRiskProfileController');

// 1. 员工风险画像列表
router.get('/list', ctl.list);

// 2. 员工风险画像详情（此后单段 GET /score-config 被其遮蔽，保持原序）
router.get('/:employeeId', ctl.detail);

// 3. 员工风险评分计算
router.get('/:employeeId/score', ctl.score);

// 4. 风险统计概览
router.get('/risk-stats/overview', ctl.riskStats);

// 5. 评分配置列表（⚠️ 被 /:employeeId 遮蔽，保持原序）
router.get('/score-config', ctl.scoreConfig);

// 6. 更新评分配置
router.put('/score-config/:id', requirePermission('hse:risk:update'), ctl.updateScoreConfig);

// 7. 批量计算所有员工评分
router.post('/calculate-all', requirePermission('hse:risk:create'), ctl.calculateAll);

module.exports = router;