/**
 * 安全生产费用业务域 —— 薄 controller
 * 仅做 req 解析 + 调 service + 统一描述符解释；业务规则与 SQL 全在 services/costService.js。
 */
const { success, error } = require('../middleware/response');
const { buildListResponse } = require('../utils/commonResponse');
const service = require('../services/costService');

function respond(req, res, next, r) {
  if (r == null) return res.status(500).json(error(-1, '服务无返回'));
  switch (r.__t) {
    case 'json':
      if (r.error) { if (r.error.code > 0) res.status(r.error.code); return res.json(error(r.error.code, r.error.message)); }
      return res.json(success(r.payload, r.message));
    case 'list':
      if (r.error) return res.json(error(r.error.code, r.error.message));
      return buildListResponse(res, r.list, r.total, r.page, r.pageSize, r.message);
    default:
      return res.json(success(r.payload ?? null, r.message));
  }
}
async function run(req, res, next, fn) {
  try { respond(req, res, next, await fn()); }
  catch (e) { res.json(error(-1, '操作失败，请稍后重试')); }
}

// 参照维度
const bizDomains = (req, res) => run(req, res, null, () => service.listBizDomains());
const opTypes = (req, res) => run(req, res, null, () => service.listOpTypes(req.query.bizDomainId));
const investCategories = (req, res) => run(req, res, null, () => service.listInvestCategories());

// 预算概览（含计算财务状态）
const budgetOverview = (req, res) => run(req, res, null, () => service.budgetFinancialOverview(req.query));
const budgetFinancials = (req, res) => run(req, res, null, () => service.budgetFinancials(req.params.id));
const costStats = (req, res) => run(req, res, null, () => service.costStats(req.query));

// 预算明细
const budgetItemList = (req, res) => run(req, res, null, () => service.budgetItemList(req.query));
const budgetItemDetail = (req, res) => run(req, res, null, () => service.budgetItemDetail(req.params.id));
const budgetItemCreate = (req, res) => run(req, res, null, () => service.budgetItemCreate(req.body));
const budgetItemUpdate = (req, res) => run(req, res, null, () => service.budgetItemUpdate(req.params.id, req.body));
const budgetItemDelete = (req, res) => run(req, res, null, () => service.budgetItemDelete(req.params.id));

// 费用申请
const requestList = (req, res) => run(req, res, null, () => service.costRequestList(req.query));
const requestDetail = (req, res) => run(req, res, null, () => service.costRequestDetail(req.params.id));
const requestCreate = (req, res) => run(req, res, null, () => service.costRequestCreate(req.body));
const requestUpdate = (req, res) => run(req, res, null, () => service.costRequestUpdate(req.params.id, req.body));
const requestDelete = (req, res) => run(req, res, null, () => service.costRequestDelete(req.params.id));

// 承诺 / 实际 / 归因
const commitmentList = (req, res) => run(req, res, null, () => service.commitmentList(req.query));
const commitmentCreate = (req, res) => run(req, res, null, () => service.commitmentCreate(req.body));
const actualList = (req, res) => run(req, res, null, () => service.actualList(req.query));
const actualCreate = (req, res) => run(req, res, null, () => service.actualCreate(req.body));
const allocationList = (req, res) => run(req, res, null, () => service.allocationList(req.query));
const allocationCreate = (req, res) => run(req, res, null, () => service.allocationCreate(req.body));

// 导入（解析→预览 / 确认）
const budgetImportPreview = (req, res) => run(req, res, null, () => service.budgetImportPreview(req.file && req.file.path));
const budgetImportConfirm = (req, res) => run(req, res, null, () => service.budgetImportConfirm(req.file && req.file.path, { operatorId: req.body && req.body.operatorId, operatorName: req.body && req.body.operatorName, fileName: req.file && req.file.originalname }));

module.exports = {
  respond, run,
  bizDomains, opTypes, investCategories,
  budgetOverview, budgetFinancials, costStats,
  budgetItemList, budgetItemDetail, budgetItemCreate, budgetItemUpdate, budgetItemDelete,
  requestList, requestDetail, requestCreate, requestUpdate, requestDelete,
  commitmentList, commitmentCreate, actualList, actualCreate, allocationList, allocationCreate,
  budgetImportPreview, budgetImportConfirm,
};
