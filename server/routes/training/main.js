/**
 * 培训模块（/api/training）子路由 —— 纯绑定（path+method+middleware→controller）
 * 业务已下沉：controllers/trainingController.js（薄 handler）→ services/training*.js（业务+SQL）。
 * 由父路由 routes/training.js 以 router.use('/', require('./training/main')) 挂载，
 * 对外契约 /api/training(...) 逐字节不变。
 *
 * 绑定顺序与拆分前 train/main.js 逐一对齐：
 *   - 导出端点（/records/export、/ledger/personnel-summary/export）必须先于对应 /:id 注册，
 *     避免被参数路由遮蔽；
 *   - 子路由工厂 createTrainingSubRoute 挂载 /ledger、/new-employees、/driver、/taihang，
 *     逻辑与内存态原样复用（trainingShared）。
 */
const express = require('express');
const path = require('path');
const os = require('os');
const fs = require('fs');
const multer = require('multer');
const router = express.Router();

const { uploadDocument } = require('../../middleware/upload');
const { requireRole } = require('../../middleware/auth');
const { createTrainingSubRoute } = require('../../services/trainingShared');
const controller = require('../../controllers/trainingController');

// 月度培训台账导入专属 multer（与原实现一致：独立临时目录 + 磁盘存储 + 50MB 上限）
const _ledgerTmpDir = path.join(os.tmpdir(), 'hse-training-ledger');
if (!fs.existsSync(_ledgerTmpDir)) fs.mkdirSync(_ledgerTmpDir, { recursive: true });
const ledgerUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, _ledgerTmpDir),
    filename: (req, file, cb) => cb(
      null,
      `${Date.now()}_${Math.round(Math.random() * 1e6)}${path.extname(file.originalname || '').toLowerCase() || '.xlsx'}`,
    ),
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
});

// ============================================================
// /records
// ============================================================
router.get('/records', controller.listRecords);
router.get('/records/export', requireRole('admin', 'safety_manager'), controller.exportRecords);
router.get('/records/:id', controller.getRecord);
router.post('/records', requireRole('admin', 'safety_manager'), controller.createRecord);
router.put('/records/:id', requireRole('admin', 'safety_manager'), controller.updateRecord);
router.delete('/records/:id', requireRole('admin', 'safety_manager'), controller.deleteRecord);

// ============================================================
// 子路由工厂：/ledger、/new-employees、/driver、/taihang（帮带四类培训实体 CRUD）
// ============================================================
createTrainingSubRoute(router, 'ledger', null, 'records');
createTrainingSubRoute(router, 'new-employees', '新员工', 'records');
createTrainingSubRoute(router, 'driver', '驾驶员', 'records');
createTrainingSubRoute(router, 'taihang', '太行', 'records');

// ============================================================
// /ledger（台账相关）
// ============================================================
router.get('/ledger/export', requireRole('admin', 'safety_manager'), controller.exportLedger);
router.get('/ledger/months', controller.getLedgerMonths);
router.get('/ledger/personnel-summary', controller.getPersonnelSummary);
router.get('/ledger/personnel-summary/export', requireRole('admin', 'safety_manager'), controller.exportPersonnelSummary);
router.post('/ledger/monthly-import', requireRole('admin', 'safety_manager'), ledgerUpload.single('file'), controller.importMonthlyLedger);
router.get('/ledger/personnel-summary/:employeeId/records', controller.getPersonnelRecords);
router.get('/ledger/plan-content-options', controller.getPlanContentOptions);
router.get('/ledger/training-type-options', controller.getTrainingTypeOptions);
router.get('/ledger/personnel-summary/:employeeId/untrained', controller.getUntrained);

// ============================================================
// /ledger/signin & /ledger/personnel-summary/batch-*
// ============================================================
router.post('/ledger/signin/recognize', requireRole('admin', 'safety_manager'), controller.recognize);
router.post('/ledger/signin/confirm', requireRole('admin', 'safety_manager'), controller.confirm);
router.post('/ledger/personnel-summary/batch-create', requireRole('admin', 'safety_manager'), controller.batchCreate);
router.post('/ledger/personnel-summary/batch-delete', requireRole('admin', 'safety_manager'), controller.batchDelete);

// ============================================================
// /stats & /stats/enhanced
// ============================================================
router.get('/stats', controller.getStats);
router.get('/stats/enhanced', controller.getStatsEnhanced);

// ============================================================
// /records/:id/attachments & /records/:id/versions
// ============================================================
router.get('/records/:id/attachments', controller.listAttachments);
router.post('/records/:id/attachments', requireRole('admin', 'safety_manager'), uploadDocument.single('file'), controller.uploadAttachment);
router.delete('/records/:id/attachments/:aid', requireRole('admin', 'safety_manager'), controller.deleteAttachment);
router.get('/records/:id/versions', controller.listVersions);

// ============================================================
// /requirements（Sprint5.10）
// ============================================================
router.get('/requirements', controller.listRequirements);
router.get('/requirements/:id', controller.getRequirement);
router.post('/requirements', requireRole('admin', 'safety_manager'), controller.createRequirement);
router.put('/requirements/:id', requireRole('admin', 'safety_manager'), controller.updateRequirement);
router.delete('/requirements/:id', requireRole('admin', 'safety_manager'), controller.deleteRequirement);

// ============================================================
// /plans（含 /plans/:id/execute）
// ============================================================
router.get('/plans', controller.listPlans);
router.get('/plans/:id', controller.getPlan);
router.post('/plans', requireRole('admin', 'safety_manager'), controller.createPlan);
router.put('/plans/:id', requireRole('admin', 'safety_manager'), controller.updatePlan);
router.delete('/plans/:id', requireRole('admin', 'safety_manager'), controller.deletePlan);
router.post('/plans/:id/execute', requireRole('admin', 'safety_manager'), controller.executePlan);

// ============================================================
// /reminders/* & /analysis/enhanced
// ============================================================
router.get('/reminders/expiry', controller.getExpiryReminders);
router.get('/reminders/new-employee', controller.getNewEmployeeReminders);
router.get('/analysis/enhanced', controller.getAnalysisEnhanced);

// ============================================================
// 未匹配 → 404（保护层：避免上方带参路由误吞后无处返回）
// ============================================================
router.use((req, res) => res.status(404).json({ code: -1, success: false, message: '接口不存在', data: null }));

module.exports = router;