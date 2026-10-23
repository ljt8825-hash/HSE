/**
 * 安全生产费用业务域路由（/api/cost）
 * 业务层：services/costService.js；薄 controller：controllers/costController.js。
 * 全局 /api 已挂载 authMiddleware，本域所有接口默认需登录。
 */
const express = require('express');
const router = express.Router();
const ctl = require('../../controllers/costController');
const { createUploader, uploadExcel } = require('../../middleware/upload');

const uploadExcelSingle = uploadExcel;

// 参照维度
router.get('/reference/biz-domains', ctl.bizDomains);
router.get('/reference/op-types', ctl.opTypes);
router.get('/reference/invest-categories', ctl.investCategories);

// 预算概览（含计算财务状态）+ 统计
router.get('/budgets', ctl.budgetOverview);
router.get('/budgets/stats', ctl.costStats);
router.get('/budgets/:id/financials', ctl.budgetFinancials);

// 预算 Excel 导入（预览 / 确认，上传复用 uploadExcel 中间件）
router.post('/budgets/import-preview', uploadExcelSingle.single('file'), ctl.budgetImportPreview);
router.post('/budgets/import', uploadExcelSingle.single('file'), ctl.budgetImportConfirm);

// 预算明细
router.get('/budget-items', ctl.budgetItemList);
router.post('/budget-items', ctl.budgetItemCreate);
router.get('/budget-items/:id', ctl.budgetItemDetail);
router.put('/budget-items/:id', ctl.budgetItemUpdate);
router.delete('/budget-items/:id', ctl.budgetItemDelete);

// 费用申请
router.get('/requests', ctl.requestList);
router.post('/requests', ctl.requestCreate);
router.get('/requests/:id', ctl.requestDetail);
router.put('/requests/:id', ctl.requestUpdate);
router.delete('/requests/:id', ctl.requestDelete);

// 承诺 / 实际 / 归因
router.get('/commitments', ctl.commitmentList);
router.post('/commitments', ctl.commitmentCreate);
router.get('/actuals', ctl.actualList);
router.post('/actuals', ctl.actualCreate);
router.get('/allocations', ctl.allocationList);
router.post('/allocations', ctl.allocationCreate);

module.exports = router;
