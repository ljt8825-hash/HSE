/**
 * 保险模块 · 车辆保险（vehicles 表）—— 纯绑定路由
 * 业务已下沉：controllers/hse-insurance.js（薄 handler）→ services/insuranceVehicleService.js（业务+SQL）
 * 由父路由 node ./index.js 挂载，最终契约 /api/insurance/vehicle(...)
 * 注意顺序：/vehicle/stats、/vehicle/export 必须注册在 /vehicle/:id 之前（:id 会遮蔽静态路径）。
 */
const express = require('express');
const router = express.Router();

const { requireRole } = require('../../middleware/auth');
const { validateBody } = require('../../middleware/validate');
const { createVehicleSchema, updateVehicleSchema } = require('../../schemas/insurance');
const {
  listVehicles,
  vehicleStats,
  importVehicles,
  exportVehicles,
  getVehicle,
  createVehicle,
  updateVehicle,
  deleteVehicle,
} = require('../../controllers/hse-insurance');

router.get('/vehicle', requireRole('admin', 'safety_manager'), listVehicles);
router.get('/vehicle/stats', requireRole('admin', 'safety_manager'), vehicleStats);
router.post('/vehicle/import', requireRole('admin', 'safety_manager'), importVehicles);
router.get('/vehicle/export', requireRole('admin', 'safety_manager'), exportVehicles);
router.get('/vehicle/:id', requireRole('admin', 'safety_manager'), getVehicle);
router.post('/vehicle', requireRole('admin', 'safety_manager'), validateBody(createVehicleSchema), createVehicle);
router.put('/vehicle/:id', requireRole('admin', 'safety_manager'), validateBody(updateVehicleSchema), updateVehicle);
router.delete('/vehicle/:id', requireRole('admin', 'safety_manager'), deleteVehicle);

module.exports = router;