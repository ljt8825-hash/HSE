/**
 * HSE 超龄人员自动识别（基于 employee 表 birth_date）—— 纯绑定路由
 * 规则来源: config/hseRules/employee-age-rule.json（男性 > male 默认60 / 女性 > female 默认50）
 * 业务已下沉：controllers/hse-over-age.js（薄 handler）→ services/overAgeService.js（业务+SQL）
 * 对外路由契约逐字节不变，由父路由 router.use('/', this) 挂载，
 * 最终契约 /api/hse/employee/over-age/auto(...)
 */
const express = require('express');
const router = express.Router();

const { requireRole } = require('../../middleware/auth');
const { decryptMiddleware } = require('../../middleware/encryption');
const { ENCRYPT_FIELDS } = require('./_shared');
const {
  getAutoList,
  getAutoStats,
  getAutoExport,
  getAutoDetail,
} = require('../../controllers/hse-over-age');

// GET /over-age/auto-list — 自动识别的超龄人员列表（基于employee表）
router.get('/over-age/auto-list', requireRole('admin', 'safety_manager'), decryptMiddleware(...ENCRYPT_FIELDS), getAutoList);

// GET /over-age/auto-stats — 超龄人员统计
router.get('/over-age/auto-stats', requireRole('admin', 'safety_manager'), getAutoStats);

// GET /over-age/auto-export — 导出超龄人员清单（CSV，基于employee实时计算，id_card/phone 脱敏）
router.get('/over-age/auto-export', requireRole('admin', 'safety_manager'), getAutoExport);

// GET /over-age/auto/:id — 单个超龄人员详情（基于employee）
router.get('/over-age/auto/:id', requireRole('admin', 'safety_manager'), decryptMiddleware(...ENCRYPT_FIELDS), getAutoDetail);

module.exports = router;