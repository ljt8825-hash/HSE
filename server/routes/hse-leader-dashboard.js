/**
 * 领导视角统一看板路由 —— 纯聚合入口（不再承载业务 handler）
 * 业务已按三层下沉至 services/leaderDashboardService.js + controllers/leaderDashboardController.js。
 * 全部端点只读，权限：admin / safety_manager。
 */
const express = require('express');
const router = express.Router();
const { requireRole } = require('../middleware/auth');
const ctl = require('../controllers/leaderDashboardController');

router.get('/centers', requireRole('admin', 'safety_manager'), ctl.centers);
router.get('/centers/:id/towns', requireRole('admin', 'safety_manager'), ctl.townsByCenter);
router.get('/centers/:centerId/towns/:townId/trend', requireRole('admin', 'safety_manager'), ctl.townTrend);
router.get('/towns/:id/roles', requireRole('admin', 'safety_manager'), ctl.rolesByTown);
router.get('/towns/:id/managers', requireRole('admin', 'safety_manager'), ctl.townManagers);
router.get('/managers/:employeeId/overview', requireRole('admin', 'safety_manager'), ctl.managerOverview);
router.get('/managers/:employeeId/month-detail', requireRole('admin', 'safety_manager'), ctl.managerMonthDetail);
router.get('/employees/:id', requireRole('admin', 'safety_manager'), ctl.employeeDetail);
router.get('/dim-records', requireRole('admin', 'safety_manager'), ctl.dimRecords);

module.exports = router;
