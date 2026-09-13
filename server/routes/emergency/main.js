/**
 * 应急管理子路由 —— 纯绑定（不承载业务）
 * 业务在 services/emergencyService.js，薄 handler 在 controllers/emergencyController.js，
 * 本文件仅按与原 routes/emergency.js 一致的注册顺序做 方法+路径+中间件 → controller 绑定。
 *
 * 顺序约束（务必保持）：
 *  - 各固定路径（/plans/stats、/materials/list、/teams/generate、/events/export 等）在对应 /:id 之前，
 *    避免参数路由遮蔽固定路径；
 *  - 通用 /:bizType/:id/attachments 放在最后；
 *  - 固定预案附件（/plans/:id/attachments 等）原实现未挂 requireRole，保持不放。
 */
const express = require('express');
const router = express.Router();

const { requireRole } = require('../../middleware/auth');
const { uploadDocument } = require('../../middleware/upload');
const ctl = require('../../controllers/emergencyController');

// ---- 应急预案 ----
router.get('/plans/stats', ctl.planStats);
router.get('/plans', ctl.planList);
router.get('/plans/export', requireRole('admin', 'safety_manager'), ctl.planExport);
router.get('/plans/:id', ctl.planDetail);
router.post('/plans', requireRole('admin', 'safety_manager'), ctl.planCreate);
router.put('/plans/:id', requireRole('admin', 'safety_manager'), ctl.planUpdate);
router.delete('/plans/:id', requireRole('admin', 'safety_manager'), ctl.planDelete);

// ---- 演练记录 ----
router.get('/drills/stats', ctl.drillStats);
router.get('/drills', ctl.drillList);
router.get('/drills/export', requireRole('admin', 'safety_manager'), ctl.drillExport);
router.get('/drills/:id', ctl.drillDetail);
router.post('/drills', requireRole('admin', 'safety_manager'), ctl.drillCreate);
router.put('/drills/:id', requireRole('admin', 'safety_manager'), ctl.drillUpdate);
router.delete('/drills/:id', requireRole('admin', 'safety_manager'), ctl.drillDelete);

// ---- 统计 ----
router.get('/stats/overview', ctl.statsOverview);
router.get('/stats', ctl.statsLegacy);

// ---- 预案附件 & 版本（固定路径，未挂 requireRole，保持原状） ----
router.get('/plans/:id/attachments', ctl.planAttachments);
router.post('/plans/:id/attachments', uploadDocument.single('file'), ctl.planUploadAttachment);
router.delete('/plans/:id/attachments/:aid', ctl.planDeleteAttachment);
router.get('/plans/:id/versions', ctl.planVersions);

// ---- 应急物资 ----
router.get('/materials/list', ctl.materialList);
router.get('/materials/stats', ctl.materialStats);
router.get('/materials/export', requireRole('admin', 'safety_manager'), ctl.materialExport);
router.get('/materials/:id', ctl.materialDetail);
router.post('/materials', requireRole('admin', 'safety_manager'), ctl.materialCreate);
router.put('/materials/:id', requireRole('admin', 'safety_manager'), ctl.materialUpdate);
router.delete('/materials/:id', requireRole('admin', 'safety_manager'), ctl.materialDelete);

// ---- 应急队伍 ----
router.get('/teams/list', ctl.teamList);
router.get('/teams/stats', ctl.teamStats);
router.get('/teams/export', requireRole('admin', 'safety_manager'), ctl.teamExport);
router.get('/teams/:id', ctl.teamDetail);
router.post('/teams', requireRole('admin', 'safety_manager'), ctl.teamCreate);
router.put('/teams/:id', requireRole('admin', 'safety_manager'), ctl.teamUpdate);
router.delete('/teams/:id', requireRole('admin', 'safety_manager'), ctl.teamDelete);
router.get('/teams/:id/members', ctl.teamMembers);
// POST /teams/generate 定义在 POST /teams 之后；由于不存在 POST /teams/:id，generate 不会被 :id 遮蔽
router.post('/teams/generate', requireRole('admin', 'safety_manager'), ctl.teamGenerate);

// ---- 应急事件 ----
router.get('/events/list', ctl.eventList);
router.get('/events/stats', ctl.eventStats);
router.get('/events/export', requireRole('admin', 'safety_manager'), ctl.eventExport);
router.get('/events/:id', ctl.eventDetail);
router.post('/events', requireRole('admin', 'safety_manager'), ctl.eventCreate);
router.put('/events/:id', requireRole('admin', 'safety_manager'), ctl.eventUpdate);
router.delete('/events/:id', requireRole('admin', 'safety_manager'), ctl.eventDelete);

// ---- 通用附件（置于所有固定路径之后，避免参数遮蔽） ----
router.get('/:bizType/:id/attachments', ctl.attachmentsByBiz);
router.post('/:bizType/:id/attachments', requireRole('admin', 'safety_manager'), uploadDocument.single('file'), ctl.uploadAttachmentByBiz);
router.delete('/:bizType/:id/attachments/:aid', requireRole('admin', 'safety_manager'), ctl.deleteAttachmentByBiz);

module.exports = router;