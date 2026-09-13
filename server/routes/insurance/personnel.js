/**
 * 保险模块 · 人员保险（personnel_insurance 表）—— 纯绑定路由
 * 业务已下沉：controllers/hse-insurance.js（薄 handler）→ services/insurancePersonnelService.js（业务+SQL）
 * 由父路由 node ./index.js 挂载，最终契约 /api/insurance/personnel(...)
 * 注意顺序：/personnel/stats、/personnel/departments 等静态路径必须注册在 /personnel/:id 之前。
 */
const express = require('express');
const router = express.Router();

const { requireRole } = require('../../middleware/auth');
const { validateBody } = require('../../middleware/validate');
const {
  createPersonnelSchema, updatePersonnelSchema,
  batchDeleteSchema, batchRenewalSchema,
} = require('../../schemas/insurance');
const {
  listPersonnel,
  personnelStats,
  personnelDepartments,
  syncFromRoster,
  jobTypeStats,
  expiringSoon,
  batchRenewal,
  batchDelete,
  importPersonnel,
  exportPersonnel,
  personnelUnmatched,
  matchRule,
  pendingList,
  generateFromPending,
  getPersonnel,
  createPersonnel,
  updatePersonnel,
  deletePersonnel,
} = require('../../controllers/hse-insurance');

router.get('/personnel', listPersonnel);
router.get('/personnel/stats', personnelStats);
router.get('/personnel/departments', personnelDepartments);
router.post('/personnel/sync-from-roster', requireRole('admin', 'safety_manager'), syncFromRoster);
router.get('/personnel/job-type-stats', requireRole('admin', 'safety_manager'), jobTypeStats);
router.get('/personnel/expiring-soon', requireRole('admin', 'safety_manager'), expiringSoon);
router.put('/personnel/batch-renewal', requireRole('admin', 'safety_manager'), validateBody(batchRenewalSchema), batchRenewal);
router.post('/personnel/batch-delete', requireRole('admin', 'safety_manager'), validateBody(batchDeleteSchema), batchDelete);
router.post('/personnel/import', requireRole('admin', 'safety_manager'), importPersonnel);
router.get('/personnel/export', requireRole('admin', 'safety_manager'), exportPersonnel);
router.get('/personnel/unmatched', requireRole('admin', 'safety_manager'), personnelUnmatched);
router.get('/personnel/rules/match', matchRule);
router.get('/personnel/pending-list', pendingList);
router.post('/personnel/generate-from-pending', requireRole('admin', 'safety_manager'), generateFromPending);
router.get('/personnel/:id', getPersonnel);
router.post('/personnel', requireRole('admin', 'safety_manager'), validateBody(createPersonnelSchema), createPersonnel);
router.put('/personnel/:id', requireRole('admin', 'safety_manager'), validateBody(updatePersonnelSchema), updatePersonnel);
router.delete('/personnel/:id', requireRole('admin', 'safety_manager'), deletePersonnel);

module.exports = router;