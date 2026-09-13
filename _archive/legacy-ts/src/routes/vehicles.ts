/**
 * 车辆管理路由
 * 文件: src/routes/vehicles.ts
 *
 * ⚠️ 路由顺序重要！/:id 通配必须放在所有具体路径之后，
 *    否则 /list、/stats 等路径会被 :id 误捕获（导致"ID必须为数字"错误）
 */

import { Router, Request, Response, NextFunction } from 'express';
import vehiclesController from '../controllers/vehicles';
import { uploadExcel } from '../middleware/upload';

const router = Router();

// ── 具体路径（必须在 :id 之前）─────────────────────────────────────
router.get('/list', vehiclesController.list.bind(vehiclesController));
router.get('/expiring', vehiclesController.expiring.bind(vehiclesController));
router.get('/export', vehiclesController.exportExcel.bind(vehiclesController));
router.get('/type-stats', vehiclesController.typeStats.bind(vehiclesController));
router.get('/stats', vehiclesController.stats.bind(vehiclesController));
router.post('/import', uploadExcel.single('file'), vehiclesController.importExcel.bind(vehiclesController));

// ── CRUD 根路径 ────────────────────────────────────────────────────
router.get('/', vehiclesController.list.bind(vehiclesController));
router.post('/', vehiclesController.create.bind(vehiclesController));

// ── :id 参数化路径（必须最后，否则吞掉上面的具体路径）────────────────
router.get('/:id', vehiclesController.detail.bind(vehiclesController));
router.put('/:id', vehiclesController.update.bind(vehiclesController));
router.delete('/:id', vehiclesController.remove.bind(vehiclesController));

export default router;
