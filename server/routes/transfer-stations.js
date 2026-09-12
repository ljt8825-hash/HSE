/**
 * 转运站管理台账路由（补充缺失业务模块，独立独立于 site-mgmt）
 * 挂载于 /api/transfer-stations
 */
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/transferStations');
const { uploadExcel } = require('../middleware/upload');
const { requireRole } = require('../middleware/auth');

// 静态路由优先，避免与 /:id 冲突
router.get('/template', ctrl.templateRoute.bind(ctrl));
router.get('/export', ctrl.exportExcel.bind(ctrl));
router.post('/continue', requireRole('admin', 'safety_manager'), ctrl.continueMonth.bind(ctrl));
router.post('/import-preview', requireRole('admin', 'safety_manager'), uploadExcel.single('file'), ctrl.importPreview.bind(ctrl));
router.post('/import-confirm', requireRole('admin', 'safety_manager'), ctrl.importConfirm.bind(ctrl));
router.delete('/batch', requireRole('admin', 'safety_manager'), ctrl.batchRemove.bind(ctrl));

router.get('/', ctrl.list.bind(ctrl));
router.get('/:id', ctrl.detail.bind(ctrl));
router.post('/', requireRole('admin', 'safety_manager'), ctrl.create.bind(ctrl));
router.put('/:id', requireRole('admin', 'safety_manager'), ctrl.update.bind(ctrl));
router.delete('/:id', requireRole('admin', 'safety_manager'), ctrl.remove.bind(ctrl));

module.exports = router;