/**
 * 保险模块 · 受保护保单文件读取（/policies/:id/file、/other/:id/file）—— 纯绑定路由
 * 业务已下沉：controllers/hse-insurance.js → services/insurancePolicyReadService.js
 * 最终契约 /api/insurance/policies/:id/file、/api/insurance/other/:id/file
 */
const express = require('express');
const router = express.Router();

const { requireRole } = require('../../middleware/auth');
const { readPolicyFile, readOtherFile } = require('../../controllers/hse-insurance');

router.get('/policies/:id/file', requireRole('admin', 'safety_manager'), readPolicyFile);
router.get('/other/:id/file', requireRole('admin', 'safety_manager'), readOtherFile);

module.exports = router;