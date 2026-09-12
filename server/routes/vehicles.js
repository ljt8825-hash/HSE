/**
 * ⚠️ 遗留接口（车辆主数据收敛-阶段13）
 * 车辆主数据唯一入口为 /api/insurance/vehicle（前端实际使用）。
 * 本文件保留仅为向后兼容，不再新增功能；新需求请统一到保险模块车辆路由。
 * 迁移计划：待确认无其他模块引用后，将标记为 @deprecated 并逐步下线。
 */
const express = require('express');
const router = express.Router();
const vehiclesController = require('../controllers/vehicles');
const { uploadExcel } = require('../middleware/upload');

router.get('/expiring', vehiclesController.expiring.bind(vehiclesController));

router.get('/export', vehiclesController.exportExcel.bind(vehiclesController));

router.get('/type-stats', vehiclesController.typeStats.bind(vehiclesController));

router.post('/import', uploadExcel.single('file'), vehiclesController.importExcel.bind(vehiclesController));

router.get('/:id', vehiclesController.detail.bind(vehiclesController));

router.put('/:id', vehiclesController.update.bind(vehiclesController));

router.delete('/:id', vehiclesController.remove.bind(vehiclesController));

router.get('/', vehiclesController.list.bind(vehiclesController));

router.post('/', vehiclesController.create.bind(vehiclesController));

module.exports = router;
