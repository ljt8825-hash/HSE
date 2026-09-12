/**
 * 标准化评价路由 - HSE V2 Sprint4 Phase5
 *
 * 挂载路径: /api/hse/standard/evaluation
 *
 * 端点:
 *   GET    /                          评价任务列表
 *   POST   /                          创建评价任务
 *   GET    /:taskId                   任务详情
 *   DELETE /:taskId                   删除任务（软删除）
 *   POST   /:taskId/start-ai          启动 AI 辅助评价（异步）
 *   GET    /:taskId/stats             任务评价统计
 *   GET    /:taskId/items             评价明细列表
 *   GET    /items/:itemId             单条评价明细
 *   POST   /items/:itemId/re-evaluate 单条重新评价
 *
 * 复用（不修改）:
 *   - middleware/auth.js     的 requireRole
 *   - middleware/response.js 的 success / error
 *   - services/standardEvaluationService
 */

const express = require('express');
const router = express.Router();
const { success, error } = require('../middleware/response');
const { requireRole } = require('../middleware/auth');
const evaluationService = require('../services/standardEvaluationService');

// ============================================================
// 1. 评价任务列表
// ============================================================
router.get('/', async (req, res) => {
  try {
    const { page, pageSize, status, keyword } = req.query;
    const result = await evaluationService.getTaskList({
      page: page ? parseInt(page, 10) : 1,
      pageSize: pageSize ? parseInt(pageSize, 10) : 20,
      status,
      keyword,
      createdBy: req.user?.userId,
    });
    res.json(success(result, '查询成功'));
  } catch (err) {
    console.error('[HSE-Evaluation] 任务列表查询失败:', err);
    res.json(error(-1, `查询失败: ${err.message}`));
  }
});

// ============================================================
// 2. 创建评价任务
// ============================================================
router.post('/', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    const { taskName, evaluationPeriod, evaluationScope } = req.body;
    if (!taskName) {
      return res.json(error(-1, '任务名称不能为空'));
    }
    const result = await evaluationService.createTask(
      { taskName, evaluationPeriod, evaluationScope },
      req.user
    );
    res.json(success(result, '任务创建成功'));
  } catch (err) {
    console.error('[HSE-Evaluation] 创建任务失败:', err);
    res.json(error(-1, `创建失败: ${err.message}`));
  }
});

// ============================================================
// 3. 任务详情
// ============================================================
router.get('/:taskId', async (req, res) => {
  try {
    const taskId = parseInt(req.params.taskId, 10);
    if (isNaN(taskId)) {
      return res.json(error(-1, '无效的任务ID'));
    }
    const task = await evaluationService.getTaskById(taskId);
    if (!task) {
      return res.json(error(404, '任务不存在'));
    }
    res.json(success(task, '查询成功'));
  } catch (err) {
    console.error('[HSE-Evaluation] 任务详情查询失败:', err);
    res.json(error(-1, `查询失败: ${err.message}`));
  }
});

// ============================================================
// 4. 删除任务（软删除）
// ============================================================
router.delete('/:taskId', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    const taskId = parseInt(req.params.taskId, 10);
    if (isNaN(taskId)) {
      return res.json(error(-1, '无效的任务ID'));
    }
    await evaluationService.deleteTask(taskId, req.user);
    res.json(success(null, '任务已删除'));
  } catch (err) {
    console.error('[HSE-Evaluation] 删除任务失败:', err);
    res.json(error(-1, `删除失败: ${err.message}`));
  }
});

// ============================================================
// 5. 启动 AI 辅助评价（异步）
// ============================================================
router.post('/:taskId/start-ai', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    const taskId = parseInt(req.params.taskId, 10);
    if (isNaN(taskId)) {
      return res.json(error(-1, '无效的任务ID'));
    }
    const task = await evaluationService.getTaskById(taskId);
    if (!task) {
      return res.json(error(404, '任务不存在'));
    }
    if (task.aiStatus === 'processing') {
      return res.json(error(-1, 'AI 评价正在进行中，请稍候'));
    }
    // 异步启动，立即返回
    evaluationService.startAiEvaluation(taskId, req.user);
    res.json(success({ taskId, aiStatus: 'processing' }, 'AI 评价已启动，后台执行中'));
  } catch (err) {
    console.error('[HSE-Evaluation] 启动 AI 评价失败:', err);
    res.json(error(-1, `启动失败: ${err.message}`));
  }
});

// ============================================================
// 6. 任务评价统计
// ============================================================
router.get('/:taskId/stats', async (req, res) => {
  try {
    const taskId = parseInt(req.params.taskId, 10);
    if (isNaN(taskId)) {
      return res.json(error(-1, '无效的任务ID'));
    }
    const { round } = req.query;
    const stats = await evaluationService.getTaskStats(
      taskId,
      round ? parseInt(round, 10) : 0
    );
    res.json(success(stats, '查询成功'));
  } catch (err) {
    console.error('[HSE-Evaluation] 统计查询失败:', err);
    res.json(error(-1, `查询失败: ${err.message}`));
  }
});

// ============================================================
// 7. 评价明细列表
// ============================================================
router.get('/:taskId/items', async (req, res) => {
  try {
    const taskId = parseInt(req.params.taskId, 10);
    if (isNaN(taskId)) {
      return res.json(error(-1, '无效的任务ID'));
    }
    const { round, aiVerdict, complianceStatus, keyword, page, pageSize } = req.query;
    const result = await evaluationService.getEvaluationItems(taskId, {
      round: round ? parseInt(round, 10) : 0,
      aiVerdict,
      complianceStatus,
      keyword,
      page: page ? parseInt(page, 10) : 1,
      pageSize: pageSize ? parseInt(pageSize, 10) : 50,
    });
    res.json(success(result, '查询成功'));
  } catch (err) {
    console.error('[HSE-Evaluation] 明细列表查询失败:', err);
    res.json(error(-1, `查询失败: ${err.message}`));
  }
});

// ============================================================
// 8. 单条评价明细
// ============================================================
router.get('/items/:itemId', async (req, res) => {
  try {
    const itemId = parseInt(req.params.itemId, 10);
    if (isNaN(itemId)) {
      return res.json(error(-1, '无效的明细ID'));
    }
    const item = await evaluationService.getEvaluationItem(itemId);
    if (!item) {
      return res.json(error(404, '评价明细不存在'));
    }
    res.json(success(item, '查询成功'));
  } catch (err) {
    console.error('[HSE-Evaluation] 明细查询失败:', err);
    res.json(error(-1, `查询失败: ${err.message}`));
  }
});

// ============================================================
// 9. 单条重新评价
// ============================================================
router.post('/items/:itemId/re-evaluate', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    const itemId = parseInt(req.params.itemId, 10);
    if (isNaN(itemId)) {
      return res.json(error(-1, '无效的明细ID'));
    }
    // 从 item 反查 taskId（通过查询 item）
    const item = await evaluationService.getEvaluationItem(itemId);
    if (!item) {
      return res.json(error(404, '评价明细不存在'));
    }
    const result = await evaluationService.reEvaluateSingle(
      item.taskId,
      itemId,
      req.user
    );
    res.json(success(result, '重新评价完成'));
  } catch (err) {
    console.error('[HSE-Evaluation] 重新评价失败:', err);
    res.json(error(-1, `评价失败: ${err.message}`));
  }
});

module.exports = router;
