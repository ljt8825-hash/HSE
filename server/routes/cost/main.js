/**
 * 安全生产费用业务域路由（/api/cost）
 * 业务层：services/costService.js；薄 controller：controllers/costController.js。
 * 鉴权：
 *   - 全局 /api 已挂 authMiddleware（未登录一律 401，本域所有接口默认需登录）。
 *   - 写操作（新建/审批/修改/删除/导入）额外 requireRole —— 前端隐藏按钮不能替代后端权限检查。
 * 读操作（GET）保持「登录即可见」，与前端 authority 分级解耦。
 */
const express = require('express');
const router = express.Router();
const ctl = require('../../controllers/costController');
const { createUploader, uploadExcel } = require('../../middleware/upload');
const { requireRole } = require('../../middleware/auth');

const uploadExcelSingle = uploadExcel;

// 费用域写操作角色：系统管理员 / 管理员 / 安全主管 / HSE 管理员
const costWriter = requireRole('system_admin', 'admin', 'safety_manager', 'hse_manager');

// 参照维度（读）
router.get('/reference/biz-domains', ctl.bizDomains);
router.get('/reference/op-types', ctl.opTypes);
router.get('/reference/invest-categories', ctl.investCategories);

// 预算概览（含计算财务状态）+ 统计（读）
router.get('/budgets', ctl.budgetOverview);
router.get('/budgets/stats', ctl.costStats);
router.get('/budgets/:id/financials', ctl.budgetFinancials);

// 预算 Excel 导入（预览 / 确认，上传复用 uploadExcel 中间件；写操作需角色）
router.post('/budgets/import-preview', costWriter, uploadExcelSingle.single('file'), ctl.budgetImportPreview);
router.post('/budgets/import', costWriter, uploadExcelSingle.single('file'), ctl.budgetImportConfirm);

// 预算明细
router.get('/budget-items', ctl.budgetItemList);
router.post('/budget-items', costWriter, ctl.budgetItemCreate);
router.get('/budget-items/:id', ctl.budgetItemDetail);
router.put('/budget-items/:id', costWriter, ctl.budgetItemUpdate);
router.delete('/budget-items/:id', costWriter, ctl.budgetItemDelete);

// 费用申请
router.get('/requests', ctl.requestList);
router.post('/requests', costWriter, ctl.requestCreate);
router.get('/requests/:id', ctl.requestDetail);
router.put('/requests/:id', costWriter, ctl.requestUpdate);   // 含审批通过自动生成承诺（防重）
router.delete('/requests/:id', costWriter, ctl.requestDelete);

// 承诺 / 实际 / 归因
router.get('/commitments', ctl.commitmentList);
router.post('/commitments', costWriter, ctl.commitmentCreate);
router.get('/commitments/audit-duplicates', ctl.auditDuplicateCommitments); // 审计既有重复有效承诺（只读）
router.get('/actuals', ctl.actualList);
router.post('/actuals', costWriter, ctl.actualCreate);
router.get('/allocations', ctl.allocationList);
router.post('/allocations', costWriter, ctl.allocationCreate);

module.exports = router;
