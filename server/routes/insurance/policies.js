/**
 * 保险模块 · 保单管理（insurance_policies 表）—— 纯绑定路由
 * 业务已下沉：controllers/hse-insurance.js → services/insurancePolicyService.js
 * 由父路由 node ./index.js 挂载，最终契约 /api/insurance/policies(...)
 */
const express = require('express');
const router = express.Router();

const { requireRole } = require('../../middleware/auth');
const { uploadInsurance } = require('../../middleware/upload');
const {
  listPolicies,
  importPolicyPdf,
  deletePolicy,
  updatePolicy,
} = require('../../controllers/hse-insurance');

router.get('/policies', listPolicies);
router.post('/policies/import-pdf', requireRole('admin', 'safety_manager'), uploadInsurance.single('file'), importPolicyPdf);
router.delete('/policies/:id', requireRole('admin', 'safety_manager'), deletePolicy);
router.put('/policies/:id', requireRole('admin', 'safety_manager'), updatePolicy);

module.exports = router;