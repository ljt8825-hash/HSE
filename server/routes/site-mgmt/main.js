/**
 * 现场管理子路由 —— 纯绑定（不承载业务）
 * 业务在 services/siteMgmtService.js，薄 handler 在 controllers/siteMgmtController.js，
 * 本文件仅按与原 routes/site-mgmt.js 一致的注册顺序做 方法+路径+中间件 → controller 绑定。
 *
 * 数据范围/权限中间件（requirePermission / requireRole）留在本层绑定，不搬进 service；
 * service 内的 resolveGridScope / buildScopeSqlCondition / deriveGridIdForEmployee / SCOPE
 * 属纯计算业务，不触碰 res，故留在 service。
 *
 * 顺序约束（务必保持）：
 *  - 固定路径（/driver-assessments/renumber、/grid-areas/filter-options、/grid-records/filter-options、
 *    /grid-records/all）定义在对应 /:id 之前，避免参数路由遮蔽固定路径；
 *  - grid-areas 系列原实现未挂 requirePermission（与原文件一致），grid-records 系列挂 requirePermission；
 *  - grid-records/all 为固定路径，注册在 DELETE /grid-records 之后（路径段数不同，不会被遮蔽）。
 */
const express = require('express');
const router = express.Router();

const { requirePermission, requireRole } = require('../../middleware/auth');
const ctl = require('../../controllers/siteMgmtController');

// ---- 三违管理 ----
router.get('/violations', ctl.violationList);
router.get('/violations/:id', ctl.violationDetail);
router.post('/violations', ctl.violationCreate);
router.put('/violations/:id', ctl.violationUpdate);
router.delete('/violations/:id', ctl.violationDelete);

// ---- 消防设施管理 ----
router.get('/fire-equipment', ctl.fireEquipmentList);
router.get('/fire-equipment/:id', ctl.fireEquipmentDetail);
router.post('/fire-equipment', ctl.fireEquipmentCreate);
router.put('/fire-equipment/:id', ctl.fireEquipmentUpdate);
router.delete('/fire-equipment/:id', ctl.fireEquipmentDelete);

// ---- 交通安全评估档案（固定路径 /renumber 定义于 CRUD 之后；无同名参数化 POST，故不被遮蔽，与原注册顺序一致） ----
router.get('/driver-assessments', ctl.driverAssessmentList);
router.get('/driver-assessments/:id', ctl.driverAssessmentDetail);
router.post('/driver-assessments', ctl.driverAssessmentCreate);
router.put('/driver-assessments/:id', ctl.driverAssessmentUpdate);
router.delete('/driver-assessments/:id', ctl.driverAssessmentDelete);
router.post('/driver-assessments/renumber', ctl.driverAssessmentRenumber);

// ---- 驾驶员违章记录 ----
router.get('/driver-violations', ctl.driverViolationList);
router.get('/driver-violations/:id', ctl.driverViolationDetail);
router.post('/driver-violations', ctl.driverViolationCreate);
router.put('/driver-violations/:id', ctl.driverViolationUpdate);
router.delete('/driver-violations/:id', ctl.driverViolationDelete);

// ---- 三违扣分记录 ----
router.get('/driver-three-violations', ctl.driverThreeViolationList);
router.get('/driver-three-violations/:id', ctl.driverThreeViolationDetail);
router.post('/driver-three-violations', ctl.driverThreeViolationCreate);
router.put('/driver-three-violations/:id', ctl.driverThreeViolationUpdate);
router.delete('/driver-three-violations/:id', ctl.driverThreeViolationDelete);

// ---- 驾驶员月度考核 ----
router.get('/driver-monthly', ctl.driverMonthlyList);
router.get('/driver-monthly/:id', ctl.driverMonthlyDetail);
router.post('/driver-monthly', ctl.driverMonthlyCreate);
router.put('/driver-monthly/:id', ctl.driverMonthlyUpdate);
router.delete('/driver-monthly/:id', ctl.driverMonthlyDelete);

// ---- 网格管理（原实现未挂权限，保持与 /grid-areas/filter-options 固定路径一致的公开访问） ----
router.get('/grid-areas', ctl.gridAreaList);
router.get('/grid-areas/filter-options', ctl.gridAreaFilterOptions);
router.get('/grid-areas/:id', ctl.gridAreaDetail);
router.post('/grid-areas', ctl.gridAreaCreate);
router.put('/grid-areas/:id', ctl.gridAreaUpdate);
router.delete('/grid-areas/:id', ctl.gridAreaDelete);

// ---- 网格长巡查台账（requirePermission 功能权限门禁；固定路径先于参数化：filter-options 在无 GET :id 前注册，all 在 DELETE 批量后） ----
router.get('/grid-records', requirePermission('hse:site:grid:view'), ctl.gridRecordList);
router.get('/grid-records/filter-options', requirePermission('hse:site:grid:view'), ctl.gridRecordFilterOptions);
router.put('/grid-records/:id', requirePermission('hse:site:grid:update'), ctl.gridRecordUpdate);
router.post('/grid-records', requirePermission('hse:site:grid:create'), ctl.gridRecordCreate);
router.delete('/grid-records', requirePermission('hse:site:grid:delete'), ctl.gridRecordDelete);
// 固定路径 /grid-records/all（路径段数不同，不会被 DELETE /grid-records 遮蔽）
router.delete(
  '/grid-records/all',
  requirePermission('hse:site:grid:purge'),
  requireRole('system_admin', 'admin'),
  ctl.gridRecordPurge
);

// ---- 统计 ----
router.get('/stats', ctl.siteStats);

module.exports = router;