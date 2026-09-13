/**
 * 目标管理子路由 —— 纯绑定（不承载业务）
 * 业务在 services/objectiveService.js，薄 handler 在 controllers/objectiveController.js，
 * 本文件仅按与原 routes/objectives.js 一致的注册顺序做 方法+路径+中间件 → controller 绑定。
 *
 * 保持一致的关键约束（务必遵循）：
 *  - 注册顺序逐条与原文件一致，尤其两个「影子 /stats」与 goals 的 / 与 /:id：
 *      * 首个 /stats → summaryStats（先注册，恒响应），第二个 /stats → goalStats（后注册，
 *        被首个遮蔽，仅在首个 next 时才会触发；goalStats 内部为空目标时仍返回 __t:'next' 透传，等价原语义）；
 *      * GET /:id、PUT /:id、DELETE /:id 的前置 /^\d+$/ 校验在后移 controller，非数字透传 next()，
 *        让注册其后的别名固定路径（/org-personnel、/responsibility、/safety-budget）继续匹配。
 *  - 别名重派发（/org-personnel→/committees、/responsibility→/responsibilities、
 *    /safety-budget→/budgets）是绑定层逻辑，依赖 req.app._router.handle 改写 url 再派发，
 *    须保留在本层，且要求父路由与本文件同一挂载点（/api/objectives，保证 req.baseUrl 正确）。
 *  - 上传 / 权限中间件（requireRole、uploadCommittee.single、uploadExcel.single）留在本层绑定。
 */

const express = require('express');
const router = express.Router();

const { requireRole } = require('../../middleware/auth');
const { error } = require('../../middleware/response');
const { createUploader, uploadExcel } = require('../../middleware/upload');
const ctl = require('../../controllers/objectiveController');

// 安委会活动 PDF 上传（落在 uploads/committee/ 下；fileFilter 用 insurance 类型即 PDF 白名单）
const uploadCommittee = createUploader({ type: 'insurance', subDir: 'committee' });

// 责任书导入包装（uploadExcel 单文件，成功才 next；失败直接回错误）
function uploadResponsibilityExcel(req, res, next) {
  uploadExcel.single('file')(req, res, (err) => {
    if (err) return res.json(error(-1, err.message || '文件上传失败'));
    next();
  });
}

// ---- 规则查询 ----
router.get('/rules', ctl.rules);

// ---- 目标责任书签订台账 ----
router.get('/employees/responsibility-stats', ctl.rosterStats);
router.get('/employees/responsibility-status', ctl.rosterStatus);
router.get('/employees/lookup', ctl.employeeLookup);
router.post('/employees/responsibility', ctl.rosterCreate);
router.get('/employees/responsibility-template', ctl.rosterTemplate);
router.post('/employees/responsibility-import', uploadResponsibilityExcel, ctl.rosterImport);
router.get('/employees/responsibility-unmatched', ctl.rosterUnmatched);
router.get('/employees/responsibility/:contractId', ctl.rosterDetail);
router.put('/employees/responsibility/:contractId', ctl.rosterUpdate);
router.delete('/employees/responsibility/:contractId', ctl.rosterDelete);

// ---- 通用附件 ----
router.get('/:bizType/:id/attachments', ctl.attachmentList);
router.post('/:bizType/:id/attachments', ctl.attachmentCreate);
router.delete('/:bizType/:id/attachments/:aid', ctl.attachmentDelete);

// ---- 目标责任书 contracts ----
router.get('/contracts/stats', ctl.contractStats);
router.get('/contracts', ctl.contractList);
router.get('/contracts/export', ctl.contractExport);
router.get('/contracts/:id', ctl.contractDetail);
router.post('/contracts', ctl.contractCreate);
router.put('/contracts/:id', ctl.contractUpdate);
router.delete('/contracts/:id', ctl.contractDelete);

// ---- 安全人员及安委会 committees ----
router.get('/committees/stats', ctl.committeeStats);
router.get('/committees', ctl.committeeList);
router.get('/committees/export', ctl.committeeExport);
router.get('/committees/:id', ctl.committeeDetail);
router.post('/committees', ctl.committeeCreate);
router.put('/committees/:id', ctl.committeeUpdate);
router.delete('/committees/:id', ctl.committeeDelete);

// ---- 责任制及考核 responsibilities ----
router.get('/responsibilities/stats', ctl.responsibilityStats);
router.get('/responsibilities', ctl.responsibilityList);
router.get('/responsibilities/:id', ctl.responsibilityDetail);
router.post('/responsibilities', ctl.responsibilityCreate);
router.put('/responsibilities/:id', ctl.responsibilityUpdate);
router.delete('/responsibilities/:id', ctl.responsibilityDelete);

// ---- 安全费用预算 budgets ----
router.get('/budgets/stats', ctl.budgetStats);
router.get('/budgets', ctl.budgetList);
router.get('/budgets/export', ctl.budgetExport);
router.get('/budgets/:id', ctl.budgetDetail);
router.post('/budgets', ctl.budgetCreate);
router.put('/budgets/:id', ctl.budgetUpdate);
router.delete('/budgets/:id', ctl.budgetDelete);

// ---- 月度履职考核统计 + 统计总览 + 汇总（两个 /stats 保持以下注册顺序：先 summary 恒响应，后 goal 影子） ----
router.get('/monthly/stats', ctl.monthlyStats);
router.get('/stats/overview', ctl.statsOverview);
router.get('/stats', ctl.summaryStats);
router.get('/stats', ctl.goalStats);

// ---- 安全目标管理（safety_goals）→ 对应前端 goals/index.vue ----
router.get('/', ctl.goalList);
router.get('/:id', ctl.goalDetail);
router.post('/', ctl.goalCreate);
router.put('/:id', ctl.goalUpdate);
router.delete('/:id', ctl.goalDelete);

// ---- 前端路由别名（前端 goals.ts 使用的路径与后端不一致） ----
// /org-personnel → /committees（安委会人员）
router.get('/org-personnel', (req, res) => req.app._router.handle({ ...req, url: req.baseUrl + '/committees' + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''), originalUrl: req.originalUrl.replace('/org-personnel', '/committees') }, res));
router.post('/org-personnel', (req, res) => req.app._router.handle({ ...req, url: req.baseUrl + '/committees', originalUrl: req.originalUrl.replace('/org-personnel', '/committees'), method: 'POST' }, res));
router.put('/org-personnel/:id', (req, res) => req.app._router.handle({ ...req, url: req.baseUrl + '/committees/' + req.params.id, originalUrl: req.originalUrl.replace('/org-personnel', '/committees'), method: 'PUT' }, res));
router.delete('/org-personnel/:id', (req, res) => req.app._router.handle({ ...req, url: req.baseUrl + '/committees/' + req.params.id, originalUrl: req.originalUrl.replace('/org-personnel', '/committees'), method: 'DELETE' }, res));

// 花名册部门动态选项（安全人员及安委会"部门"下拉）
router.get('/roster-departments', ctl.rosterDepartments);

// /responsibility → /responsibilities（责任制考核）
router.get('/responsibility', (req, res) => req.app._router.handle({ ...req, url: req.baseUrl + '/responsibilities' + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''), originalUrl: req.originalUrl.replace('/responsibility', '/responsibilities') }, res));
router.post('/responsibility', (req, res) => req.app._router.handle({ ...req, url: req.baseUrl + '/responsibilities', originalUrl: req.originalUrl.replace('/responsibility', '/responsibilities'), method: 'POST' }, res));
router.put('/responsibility/:id', (req, res) => req.app._router.handle({ ...req, url: req.baseUrl + '/responsibilities/' + req.params.id, originalUrl: req.originalUrl.replace('/responsibility', '/responsibilities'), method: 'PUT' }, res));
router.delete('/responsibility/:id', (req, res) => req.app._router.handle({ ...req, url: req.baseUrl + '/responsibilities/' + req.params.id, originalUrl: req.originalUrl.replace('/responsibility', '/responsibilities'), method: 'DELETE' }, res));

// /safety-budget → /budgets（安全预算）
router.get('/safety-budget/stats', (req, res) => req.app._router.handle({ ...req, url: req.baseUrl + '/budgets/stats' + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''), originalUrl: req.originalUrl.replace('/safety-budget', '/budgets') }, res));
router.get('/safety-budget', (req, res) => req.app._router.handle({ ...req, url: req.baseUrl + '/budgets' + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''), originalUrl: req.originalUrl.replace('/safety-budget', '/budgets') }, res));
router.post('/safety-budget', (req, res) => req.app._router.handle({ ...req, url: req.baseUrl + '/budgets', originalUrl: req.originalUrl.replace('/safety-budget', '/budgets'), method: 'POST' }, res));
router.put('/safety-budget/:id', (req, res) => req.app._router.handle({ ...req, url: req.baseUrl + '/budgets/' + req.params.id, originalUrl: req.originalUrl.replace('/safety-budget', '/budgets'), method: 'PUT' }, res));
router.delete('/safety-budget/:id', (req, res) => req.app._router.handle({ ...req, url: req.baseUrl + '/budgets/' + req.params.id, originalUrl: req.originalUrl.replace('/safety-budget', '/budgets'), method: 'DELETE' }, res));

// ---- 安委会组织开展活动（committee-activities） ----
// 列表开放；上传限定 admin / safety_manager
router.get('/committee-activities', ctl.committeeActivityList);
router.post('/committee-activities/import-pdf', requireRole('admin', 'safety_manager'), uploadCommittee.single('file'), ctl.committeeActivityImportPdf);
router.post('/committee-activities', ctl.committeeActivityCreate);
router.put('/committee-activities/:id', ctl.committeeActivityUpdate);
router.delete('/committee-activities/:id', ctl.committeeActivityDelete);
// 固定路径 /template 与 /import 注册在参数化 /:id 之后（路径段数不同，不会被遮蔽；与原注册顺序一致）
router.get('/committee-activities/template', ctl.committeeActivityTemplate);
router.post('/committee-activities/import', uploadExcel.single('file'), ctl.committeeActivityImport);
router.get('/committee-activities/:id/file', ctl.committeeActivityFile);

module.exports = router;