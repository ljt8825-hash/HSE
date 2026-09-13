/**
 * 保险模块 · 其他保险（other_insurance 表）—— 纯绑定路由
 * 业务已下沉：controllers/hse-insurance.js → services/insuranceOtherService.js
 * 由父路由 node ./index.js 挂载，最终契约 /api/insurance/other(...)
 * 注意顺序：/other/stats 必须注册在 /other/:id 参数路由之前（虽然本域无 GET /:id，仍保持原顺序）。
 */
const express = require('express');
const router = express.Router();

const { requireRole } = require('../../middleware/auth');
const { uploadInsurance } = require('../../middleware/upload');
const {
  listOther,
  otherStats,
  createOther,
  updateOther,
  deleteOther,
  importOtherPdf,
} = require('../../controllers/hse-insurance');

router.get('/other', listOther);
router.get('/other/stats', otherStats);
router.post('/other', requireRole('admin', 'safety_manager'), createOther);
router.put('/other/:id', requireRole('admin', 'safety_manager'), updateOther);
router.delete('/other/:id', requireRole('admin', 'safety_manager'), deleteOther);
router.post('/other/import-pdf', requireRole('admin', 'safety_manager'), uploadInsurance.single('file'), importOtherPdf);

module.exports = router;