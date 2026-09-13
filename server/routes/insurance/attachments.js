/**
 * 保险模块 · 通用附件/版本管理（vehicle/personnel/overage/other 共用）
 * —— 纯绑定路由
 * 业务已下沉：controllers/hse-insurance.js → services/insuranceAttachmentService.js
 * 最终契约 /api/insurance/:bizType/:id/attachments、.../versions
 */
const express = require('express');
const router = express.Router();

const { uploadDocument } = require('../../middleware/upload');
const {
  listAttachments,
  uploadAttachment,
  deleteAttachment,
  listVersions,
} = require('../../controllers/hse-insurance');

router.get('/:bizType/:id/attachments', listAttachments);
router.post('/:bizType/:id/attachments', uploadDocument.single('file'), uploadAttachment);
router.delete('/:bizType/:id/attachments/:aid', deleteAttachment);
router.get('/:bizType/:id/versions', listVersions);

module.exports = router;