/**
 * HSE月度安全履职考核模块（/api/hse/assessment-monthly）子路由 —— 纯绑定
 * path + method + middleware → controller；业务与 SQL 全在 services/assessmentMonthly*.js。
 * 由父路由 routes/hse-assessment-monthly.js 以 router.use('/', require('./hse-assessment-monthly/main')) 挂载，
 * 对外契约 /api/hse/assessment-monthly(...) 逐字节不变。
 *
 * 绑定顺序与拆分前 routes/hse-assessment-monthly.js 逐条对齐（42 条，GET19/POST17/PUT3/DELETE3）：
 *   - 该文件在原始单文件中本就存在参数路由遮蔽情况（如 GET /results/:targetId 先于 /results/ranking 注册），
 *     此处原样保持注册先后，不做重排，确保行为与拆分前一致。
 *   - 从原文件提取的中间件绑定（authMiddleware / optionalAuthMiddleware / requirePermission 权限码 /
 *     auditMiddleware 审计模块 key + 动作）全部保留。
 */
const express = require('express');
const router = express.Router();

const { authMiddleware, optionalAuthMiddleware, requirePermission } = require('../../middleware/auth');
const { auditMiddleware } = require('../audit');

const c = require('../../controllers/assessmentMonthlyController');

// ==================== 1. 考核周期 ====================
router.post('/cycles', authMiddleware, requirePermission('hse:training:create'), c.createCycle);
router.post('/cycles/auto-generate', authMiddleware, requirePermission('hse:training:create'), c.autoGenerateCycle);
router.get('/cycles', authMiddleware, c.listCycles);
router.get('/cycles/:id', authMiddleware, c.getCycle);
router.put('/cycles/:id', authMiddleware, requirePermission('hse:training:update'), c.updateCycle);
router.delete('/cycles/:id', authMiddleware, requirePermission('hse:training:delete'), c.deleteCycle);
router.post('/cycles/:id/start', authMiddleware, requirePermission('hse:training:create'), c.startCycle);

// 考核对象（对象列表仍挂在周期下，保持与原注册顺序一致）
router.get('/cycles/:id/targets', authMiddleware, c.listTargets);

// ==================== 2. 考核对象 ====================
router.get('/targets/:id', authMiddleware, c.getTarget);
router.post('/cycles/:id/targets/sync', authMiddleware, requirePermission('hse:training:create'), c.syncTargets);
router.post('/cycles/:id/targets', authMiddleware, requirePermission('hse:training:create'), c.addTargets);
router.delete('/targets/:id', authMiddleware, requirePermission('hse:training:delete'), c.removeTarget);

// ==================== 3. 考核指标 ====================
router.get('/metrics', authMiddleware, c.listMetrics);
router.get('/metrics/:id', authMiddleware, c.getMetric);

// ==================== 4. 评分引擎 ====================
router.post('/scoring/execute', authMiddleware, requirePermission('hse:training:create'), c.executeScoring);
router.get('/scoring/progress/:cycleId', authMiddleware, c.getScoringProgress);
router.post('/scoring/recalculate', authMiddleware, requirePermission('hse:training:create'), c.recalculateScoring);

// ==================== 5. 扣分明细 ====================
router.get('/deductions', authMiddleware, c.listDeductions);
router.get('/deductions/:id', authMiddleware, c.getDeduction);
router.post('/deductions', authMiddleware, requirePermission('hse:training:create'), c.createDeduction);
router.put('/deductions/:id', authMiddleware, requirePermission('hse:training:update'), c.updateDeduction);
router.delete('/deductions/:id', authMiddleware, requirePermission('hse:training:delete'), c.deleteDeduction);

// ==================== 6. 扣分审核 ====================
router.post('/deductions/review/approve', authMiddleware, auditMiddleware('assessment-monthly', 'audit'), requirePermission('hse:training:audit'), c.approveDeduction);
router.post('/deductions/review/reject', authMiddleware, auditMiddleware('assessment-monthly', 'audit'), requirePermission('hse:training:audit'), c.rejectDeduction);
router.post('/deductions/batch-approve', authMiddleware, auditMiddleware('assessment-monthly', 'audit'), requirePermission('hse:training:audit'), c.batchApproveDeductions);

// ==================== 7. 扣分调整 ====================
router.post('/deductions/adjust', authMiddleware, auditMiddleware('assessment-monthly', 'audit'), requirePermission('hse:training:audit'), c.adjustDeduction);
router.post('/deductions/:id/unlock', authMiddleware, auditMiddleware('assessment-monthly', 'audit'), requirePermission('hse:training:audit'), c.unlockDeduction);
router.get('/deductions/:id/adjustments', authMiddleware, c.listAdjustments);

// ==================== 8. 三违责任传导 ====================
router.post('/chain/generate', authMiddleware, requirePermission('hse:training:create'), c.generateChain);
router.get('/chain/relations', authMiddleware, c.listChainRelations);

// ==================== 9. 冻结管理 ====================
router.post('/freeze/cycle/:id', authMiddleware, auditMiddleware('assessment-monthly', 'freeze'), requirePermission('hse:training:audit'), c.freezeCycle);
router.post('/freeze/unfreeze', authMiddleware, requirePermission('hse:training:audit'), c.unfreezeCycle);

// ==================== 10. 结果查询 ====================
router.get('/results', authMiddleware, c.listResults);
router.get('/results/:targetId', authMiddleware, c.getResult);
router.get('/results/ranking', authMiddleware, c.listRanking);

// ==================== 11. 导入导出 ====================
router.get('/export/results/:cycleId', authMiddleware, requirePermission('hse:training:export'), c.exportResults);
router.get('/cycles/:cycleId/targets/:targetId/deductions', authMiddleware, c.getTargetDeductions);
router.get('/cycles/:cycleId/export-scoring', authMiddleware, requirePermission('hse:training:export'), c.exportScoring);
router.post('/import/deductions', authMiddleware, requirePermission('hse:training:create'), c.importDeductions);

// ==================== 12. 考核标准 ====================
router.get('/standards', authMiddleware, c.listStandards);
router.put('/standards/:id', authMiddleware, requirePermission('hse:training:update'), c.updateStandard);

// ==================== 13. 健康检查（无鉴权 GET） ====================
router.get('/health', optionalAuthMiddleware, c.checkHealth);

// ==================== 未匹配 → 404（保护层） ====================
router.use((req, res) => res.status(404).json({ code: -1, success: false, message: '接口不存在', data: null }));

module.exports = router;