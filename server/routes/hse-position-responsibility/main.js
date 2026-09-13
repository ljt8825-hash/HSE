/**
 * 岗位体系 + 责任体系（/api/hse/position-resp）—— 子路由绑定层
 * 仅绑定 路径 → 方法 → 中间件 → controller 函数，严格按原 routes/hse-position-responsibility.js
 * 的端点注册顺序。写端点 requireRole(['admin','safety_manager'])（数组形式）；读公开。
 *
 * ⚠️ 必须保留原注册顺序（含既有路由遮蔽）：原文件 GET /position/:id 与 GET
 * /responsibility/:id 均注册在枚举端点之前，导致 /position/job-categories、
 * /responsibility/types、/responsibility/grid-levels 被 :id 捕获而不可达。
 * 拆分版忠实还原该顺序（遮蔽故障照旧，见交付报告），保证新旧行为逐字节一致。
 */
const express = require('express');
const router = express.Router();
const { requireRole } = require('../../middleware/auth');
const ctl = require('../../controllers/positionResponsibilityController');

const WRITER = requireRole(['admin', 'safety_manager']);

// ---- 一、标准岗位 ----
router.get('/position/list', ctl.positionList);
router.get('/position/all', ctl.positionAll);
router.get('/position/:id', ctl.positionDetail);
router.post('/position', WRITER, ctl.positionCreate);
router.put('/position/:id', WRITER, ctl.positionUpdate);
router.delete('/position/:id', WRITER, ctl.positionDelete);

// ---- 二、岗位别名 ----
router.get('/position-alias/list', ctl.aliasList);
router.get('/position-alias/by-position/:positionId', ctl.aliasByPosition);
router.post('/position-alias', WRITER, ctl.aliasCreate);
router.delete('/position-alias/:id', WRITER, ctl.aliasDelete);

// ---- 三、责任配置 ----
router.get('/responsibility-config/list', ctl.configList);
router.get('/responsibility-config/by-position/:positionId', ctl.configByPosition);
router.put('/responsibility-config/:id', WRITER, ctl.configUpdate);

// ---- 四、责任记录 ----
router.get('/responsibility/list', ctl.responsibilityList);
router.get('/responsibility/:id', ctl.responsibilityDetail);
router.post('/responsibility', WRITER, ctl.responsibilityCreate);
router.put('/responsibility/:id', WRITER, ctl.responsibilityUpdate);
router.delete('/responsibility/:id', WRITER, ctl.responsibilityDelete);

// ---- 五、枚举接口（⚠️ 在 :id 之后注册，按原文件顺序 → 被 :id 遮蔽/不可达） ----
router.get('/responsibility/types', ctl.responsibilityTypes);
router.get('/responsibility/grid-levels', ctl.responsibilityGridLevels);
router.get('/position/job-categories', ctl.positionJobCategories);

module.exports = router;