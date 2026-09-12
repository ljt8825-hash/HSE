/**
 * HSE 智能报告中心路由
 * 
 * 功能：
 * - 生成报告（日报/周报/月报/年报）
 * - 查询历史报告
 * - 获取报告详情
 * - 删除报告
 */

const express = require('express');
const router = express.Router();
const reportService = require('../services/reportService');
const { success, error } = require('../middleware/response');
const { logger } = require('../middleware/requestLogger');

/**
 * 生成报告
 * POST /api/hse/report/generate
 */
router.post('/generate', async (req, res) => {
  try {
    const { reportType, reportPeriod, generatedBy } = req.body;

    if (!reportType || !reportPeriod) {
      return res.status(400).json(error('报告类型和报告周期不能为空'));
    }

    const result = await reportService.generateReport({
      reportType,
      reportPeriod,
      generatedBy: generatedBy || 1
    });

    res.json(success(result));

  } catch (err) {
    logger.error('Failed to generate report', { error: err.message });
    res.status(500).json(error(err.message));
  }
});

/**
 * 查询历史报告
 * GET /api/hse/report/history
 */
router.get('/history', async (req, res) => {
  try {
    const { reportType, page, pageSize } = req.query;

    const result = await reportService.getReportHistory({
      reportType,
      page: parseInt(page) || 1,
      pageSize: parseInt(pageSize) || 20
    });

    res.json(success(result));

  } catch (err) {
    logger.error('Failed to get report history', { error: err.message });
    res.status(500).json(error(err.message));
  }
});

/**
 * 获取报告详情
 * GET /api/hse/report/:id
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const report = await reportService.getReportById(id);

    if (!report) {
      return res.status(404).json(error('报告不存在'));
    }

    res.json(success(report));

  } catch (err) {
    logger.error('Failed to get report', { error: err.message });
    res.status(500).json(error(err.message));
  }
});

/**
 * 删除报告
 * DELETE /api/hse/report/:id
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const successFlag = await reportService.deleteReport(id);

    if (!successFlag) {
      return res.status(404).json(error('报告不存在'));
    }

    res.json(success(null, '删除成功'));

  } catch (err) {
    logger.error('Failed to delete report', { error: err.message });
    res.status(500).json(error(err.message));
  }
});

/**
 * 获取报告模板列表
 * GET /api/hse/report/templates
 */
router.get('/templates', async (req, res) => {
  try {
    const { reportType } = req.query;

    let query = `SELECT id, template_name, report_type, content_config, status 
                 FROM hse_report_templates WHERE status = 'active'`;
    const params = [];

    if (reportType) {
      query += ` AND report_type = $1`;
      params.push(reportType);
    }

    const { pool } = require('../config/db');
    const result = await pool.query(query, params);

    res.json(success(result.rows));

  } catch (err) {
    logger.error('Failed to get templates', { error: err.message });
    res.status(500).json(error(err.message));
  }
});

// ============================================================
// V2 汇报中心路由（Sprint3 新增）
// ============================================================

/**
 * V2: 获取模板列表（按分类筛选）
 * GET /api/hse/report/v2/templates
 */
router.get('/v2/templates', async (req, res) => {
  try {
    const { category } = req.query;
    const templates = await reportService.getTemplates(category);
    res.json(success(templates));
  } catch (err) {
    logger.error('Failed to get v2 templates', { error: err.message });
    res.status(500).json(error(err.message));
  }
});

/**
 * V2: 获取模板详情
 * GET /api/hse/report/v2/templates/:id
 */
router.get('/v2/templates/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const template = await reportService.getTemplateById(id);
    if (!template) {
      return res.status(404).json(error('模板不存在'));
    }
    res.json(success(template));
  } catch (err) {
    logger.error('Failed to get template', { error: err.message });
    res.status(500).json(error(err.message));
  }
});

/**
 * V2: 触发报告生成（异步）
 * POST /api/hse/report/v2/generate
 */
router.post('/v2/generate', async (req, res) => {
  try {
    const { templateId, templateCategory, reportPeriod, reportScope, aiEnabled, customTitle } = req.body;

    if (!templateCategory || !reportPeriod) {
      return res.status(400).json(error('报告分类和周期不能为空'));
    }

    const result = await reportService.generateReportV2({
      templateId,
      templateCategory,
      reportPeriod,
      reportScope,
      aiEnabled: !!aiEnabled,
      customTitle,
      generatedBy: req.user?.id || 1
    });

    res.json(success(result));
  } catch (err) {
    logger.error('Failed to generate v2 report', { error: err.message });
    res.status(500).json(error(err.message));
  }
});

/**
 * V2: 查询生成状态
 * GET /api/hse/report/v2/:id/status
 */
router.get('/v2/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const status = await reportService.getReportStatus(id);
    if (!status) {
      return res.status(404).json(error('报告不存在'));
    }
    res.json(success(status));
  } catch (err) {
    logger.error('Failed to get report status', { error: err.message });
    res.status(500).json(error(err.message));
  }
});

/**
 * V2: 报告列表
 * GET /api/hse/report/v2/list
 */
router.get('/v2/list', async (req, res) => {
  try {
    const { category, page, pageSize, keyword, status, confirmStatus } = req.query;
    const result = await reportService.getReportListV2({
      category,
      page,
      pageSize,
      keyword,
      status,
      confirmStatus
    });
    res.json(success(result));
  } catch (err) {
    logger.error('Failed to get v2 report list', { error: err.message });
    res.status(500).json(error(err.message));
  }
});

/**
 * V2: 报告详情
 * GET /api/hse/report/v2/:id
 */
router.get('/v2/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const report = await reportService.getReportByIdV2(id);
    if (!report) {
      return res.status(404).json(error('报告不存在'));
    }
    res.json(success(report));
  } catch (err) {
    logger.error('Failed to get v2 report', { error: err.message });
    res.status(500).json(error(err.message));
  }
});

/**
 * V2: 编辑报告
 * PUT /api/hse/report/v2/:id
 */
router.put('/v2/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { reportName, reportData, reportHtml, aiSummary, aiSuggestions } = req.body;
    const updated = await reportService.updateReport(id, {
      reportName, reportData, reportHtml, aiSummary, aiSuggestions
    });
    if (!updated) {
      return res.status(404).json(error('报告不存在'));
    }
    res.json(success(null, '更新成功'));
  } catch (err) {
    logger.error('Failed to update report', { error: err.message });
    res.status(500).json(error(err.message));
  }
});

/**
 * V2: 确认/驳回报告
 * POST /api/hse/report/v2/:id/confirm
 */
router.post('/v2/:id/confirm', async (req, res) => {
  try {
    const { id } = req.params;
    const { action, remark } = req.body;
    const result = await reportService.confirmReport(id, action, req.user?.id, remark);
    if (!result) {
      return res.status(404).json(error('报告不存在'));
    }
    res.json(success(null, action === 'confirmed' ? '确认成功' : '已驳回'));
  } catch (err) {
    logger.error('Failed to confirm report', { error: err.message });
    res.status(500).json(error(err.message));
  }
});

/**
 * V2: 重新生成报告
 * POST /api/hse/report/v2/:id/regenerate
 */
router.post('/v2/:id/regenerate', async (req, res) => {
  try {
    const { id } = req.params;
    const { aiOnly } = req.body;
    const result = await reportService.regenerateReport(id, !!aiOnly);
    res.json(success(result));
  } catch (err) {
    logger.error('Failed to regenerate report', { error: err.message });
    res.status(500).json(error(err.message));
  }
});

/**
 * V2: 归档报告
 * POST /api/hse/report/v2/:id/archive
 */
router.post('/v2/:id/archive', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await reportService.archiveReport(id);
    if (!result) {
      return res.status(404).json(error('报告不存在或已归档'));
    }
    res.json(success(null, '归档成功'));
  } catch (err) {
    logger.error('Failed to archive report', { error: err.message });
    res.status(500).json(error(err.message));
  }
});

/**
 * V2: 导出 HTML
 * GET /api/hse/report/v2/:id/export/html
 */
router.get('/v2/:id/export/html', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await reportService.exportHtml(id);
    if (!result) {
      return res.status(404).json(error('报告不存在'));
    }
    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(result.fileName)}"`);
    res.send(result.content);
  } catch (err) {
    logger.error('Failed to export html', { error: err.message });
    res.status(500).json(error(err.message));
  }
});

/**
 * V2: 导出 Word
 * GET /api/hse/report/v2/:id/export/word
 */
router.get('/v2/:id/export/word', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await reportService.exportWord(id);
    if (!result) {
      return res.status(404).json(error('报告不存在'));
    }
    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(result.fileName)}"`);
    res.send(result.content);
  } catch (err) {
    logger.error('Failed to export word', { error: err.message });
    res.status(500).json(error(err.message));
  }
});

// ============================================================
// Sprint4 Phase6: 安全生产标准化自评报告
// 数据来源: standard_evaluation_items (compliance_status != 'pending')
// 禁止: 读取 ai_verdict、自动认证、生成达标结论
// ============================================================

/**
 * 生成安全生产标准化自评报告
 * POST /api/hse/report/v2/self-assessment/generate
 */
router.post('/v2/self-assessment/generate', async (req, res) => {
  try {
    const { taskId, customTitle, enterpriseInfo } = req.body;

    if (!taskId) {
      return res.status(400).json(error('评价任务 ID 不能为空'));
    }

    const result = await reportService.generateSelfAssessmentReport({
      taskId,
      customTitle,
      enterpriseInfo: enterpriseInfo ? JSON.stringify(enterpriseInfo) : null,
      generatedBy: req.user?.id || req.user?.userId || 1
    });

    res.json(success(result, '自评报告生成已启动'));
  } catch (err) {
    logger.error('Failed to generate self-assessment report', { error: err.message });
    res.status(500).json(error(err.message));
  }
});

/**
 * 查询自评报告列表（按 taskId 过滤）
 * GET /api/hse/report/v2/self-assessment/list
 */
router.get('/v2/self-assessment/list', async (req, res) => {
  try {
    const { taskId, page = 1, pageSize = 20 } = req.query;

    const conditions = [`report_status = 'active'`, `template_category = 'self_assessment'`];
    const values = [];
    if (taskId) {
      values.push(taskId);
      conditions.push(`report_scope->>'taskId' = $${values.length}`);
    }
    const whereSql = conditions.join(' AND ');
    const offset = (parseInt(page) - 1) * parseInt(pageSize);

    const countResult = await require('../config/db').pool.query(
      `SELECT COUNT(*) FROM hse_reports WHERE ${whereSql}`,
      values
    );
    const total = parseInt(countResult.rows[0].count);

    const listResult = await require('../config/db').pool.query(
      `SELECT id, report_name, report_period, report_date,
              generation_status, ai_status, confirm_status,
              confirmed_by, confirmed_at, created_at, source_data_ref
       FROM hse_reports
       WHERE ${whereSql}
       ORDER BY created_at DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, parseInt(pageSize), offset]
    );

    const list = listResult.rows.map(row => ({
      id: row.id,
      reportName: row.report_name,
      reportPeriod: row.source_data_ref?.statisticsPeriod || row.report_period,
      reportDate: row.report_date,
      generationStatus: row.generation_status,
      aiStatus: row.ai_status,
      confirmStatus: row.confirm_status,
      confirmedBy: row.confirmed_by,
      confirmedAt: row.confirmed_at,
      createdAt: row.created_at,
      taskId: row.source_data_ref?.taskId,
      totalItems: row.source_data_ref?.totalItems,
      confirmedItems: row.source_data_ref?.confirmedItems,
      pendingItems: row.source_data_ref?.pendingItems
    }));

    res.json(success({ list, total, page: parseInt(page), pageSize: parseInt(pageSize) }));
  } catch (err) {
    logger.error('Failed to list self-assessment reports', { error: err.message });
    res.status(500).json(error(err.message));
  }
});

module.exports = router;