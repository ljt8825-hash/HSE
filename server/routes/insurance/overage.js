/**
 * 保险模块 · 超龄人员（over_age_personnel 表）—— 纯绑定路由
 * 业务已下沉：controllers/hse-insurance.js → services/insuranceOverageService.js
 * 由父路由 node ./index.js 挂载，最终契约 /api/insurance/overage(...)
 * 注意顺序：/overage/export 必须注册在 /overage/:id 之前。
 */
const express = require('express');
const router = express.Router();

const { requireRole } = require('../../middleware/auth');
const { decryptMiddleware } = require('../../middleware/encryption');
const { validateBody } = require('../../middleware/validate');
const { createOverageSchema, updateOverageSchema } = require('../../schemas/insurance');
const {
  listOverage,
  exportOverage,
  getOverage,
  createOverage,
  updateOverage,
  deleteOverage,
} = require('../../controllers/hse-insurance');

router.get('/overage', requireRole('admin', 'safety_manager'), decryptMiddleware('id_card'), listOverage);
router.get('/overage/export', requireRole('admin', 'safety_manager'), decryptMiddleware('id_card'), exportOverage);
router.get('/overage/:id', requireRole('admin', 'safety_manager'), decryptMiddleware('id_card'), getOverage);
router.post('/overage', requireRole('admin', 'safety_manager'), validateBody(createOverageSchema), createOverage);
router.put('/overage/:id', requireRole('admin', 'safety_manager'), validateBody(updateOverageSchema), updateOverage);
router.delete('/overage/:id', requireRole('admin', 'safety_manager'), deleteOverage);

module.exports = router;