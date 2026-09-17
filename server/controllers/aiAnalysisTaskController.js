/**
 * AI-07 Analysis Task API 控制器（/api/hse/ai/v2/analysis-tasks*）
 *
 * 错误模型：沿用统一 AI 错误模型（errors.js toErrorResponse / AiError），HTTP 200 + 错误体。
 * 权限（任务书 §23）：写操作（create/cancel）requireRole(admin, safety_manager)；
 *   读操作（get/list）任意登录用户（全局 authMiddleware 已覆盖）。
 * 双轨制：沿用 AI-06 剥离策略（compliance_status/checked_by/checked_at/manual_remark 出现即忽略）。
 */

const { toErrorResponse } = require('../services/ai/errors');
const taskService = require('../services/ai/tasks/aiAnalysisTaskService');
const suggestionService = require('../services/ai/analysis/managementSuggestionService');
const reviewService = require('../services/ai/review/aiReviewService');

const DUAL_TRACK_FIELDS = ['compliance_status', 'checked_by', 'checked_at', 'manual_remark'];

function stripDualTrackFields(body) {
  const clean = { ...(body || {}) };
  for (const k of DUAL_TRACK_FIELDS) delete clean[k];
  return clean;
}

function ok(res, payload) {
  res.json({ success: true, ...payload });
}

function fail(res, err) {
  res.json(toErrorResponse(err));
}

function userIdOf(req) {
  return req.user && req.user.id != null ? req.user.id : null;
}

/** POST /analysis-tasks —— 创建任务（同步返回 PENDING，不等待 AI 执行） */
async function create(req, res) {
  try {
    const body = stripDualTrackFields(req.body || {});
    const { task, reused } = await taskService.createTask(body, { createdBy: userIdOf(req) });
    ok(res, {
      task: {
        id: task.id,
        status: task.status,
        taskType: task.taskType,
        domain: task.domain,
      },
      reused,
    });
  } catch (err) {
    fail(res, err);
  }
}

/** GET /analysis-tasks/:id —— 任务详情 */
async function get(req, res) {
  try {
    const task = await taskService.getTask(parseInt(req.params.id, 10));
    ok(res, { task });
  } catch (err) {
    fail(res, err);
  }
}

/** GET /analysis-tasks —— 任务列表 */
async function list(req, res) {
  try {
    const result = await taskService.listTasks({
      page: req.query.page,
      pageSize: req.query.pageSize,
      status: req.query.status || null,
      domain: req.query.domain || null,
      createdBy: userIdOf(req),
    });
    ok(res, result);
  } catch (err) {
    fail(res, err);
  }
}

/** POST /analysis-tasks/:id/cancel —— 取消任务（PENDING→CANCELLED；RUNNING 仅记录取消请求） */
async function cancel(req, res) {
  try {
    const result = await taskService.cancelTask(parseInt(req.params.id, 10));
    ok(res, result);
  } catch (err) {
    fail(res, err);
  }
}

/** POST /analysis-tasks/:id/management-suggestions —— 生成管理建议（AI-10；force=true 跳过缓存） */
async function generateManagementSuggestion(req, res) {
  try {
    const taskId = parseInt(req.params.id, 10);
    const provider = req.body && req.body.provider ? String(req.body.provider).trim() : null;
    const force = Boolean(req.body && req.body.force);
    const result = await suggestionService.generateSuggestion(taskId, {
      userId: userIdOf(req),
      provider,
      force,
    });
    ok(res, result);
  } catch (err) {
    fail(res, err);
  }
}

/** GET /analysis-tasks/:id/management-suggestions —— 查询已生成的管理建议（不触发生成） */
async function getManagementSuggestion(req, res) {
  try {
    const taskId = parseInt(req.params.id, 10);
    const result = await suggestionService.getSuggestion(taskId);
    ok(res, result);
  } catch (err) {
    fail(res, err);
  }
}

/** POST /analysis-tasks/:id/management-suggestions/review —— 提交人工审核（AI-11；写：admin/safety_manager） */
async function submitReview(req, res) {
  try {
    const taskId = parseInt(req.params.id, 10);
    const body = req.body || {};
    const result = await reviewService.submitReview(taskId, {
      action: body.action != null ? String(body.action) : null,
      humanRemark: body.humanRemark != null ? String(body.humanRemark) : null,
      humanModified: body.humanModified != null ? body.humanModified : null,
      previousStatus: body.previousStatus != null ? String(body.previousStatus) : null,
      userId: userIdOf(req),
    });
    ok(res, result);
  } catch (err) {
    fail(res, err);
  }
}

/** GET /analysis-tasks/:id/management-suggestions/reviews —— 查询人工审核历史（AI-11；任意登录用户） */
async function getReviewHistory(req, res) {
  try {
    const taskId = parseInt(req.params.id, 10);
    const result = await reviewService.getReviewHistory(taskId);
    ok(res, result);
  } catch (err) {
    fail(res, err);
  }
}

module.exports = {
  create,
  get,
  list,
  cancel,
  generateManagementSuggestion,
  getManagementSuggestion,
  submitReview,
  getReviewHistory,
};
