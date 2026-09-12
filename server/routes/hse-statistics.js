/**
 * HSE 数据分析中心路由
 * 
 * 功能：
 * - 趋势分析（周/月/年）
 * - 排名统计（部门/责任人）
 * - 安全概览
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { success, error } = require('../middleware/response');
const { logger } = require('../middleware/requestLogger');
const statisticsService = require('../services/statisticsService');

/**
 * 获取安全趋势数据
 * GET /api/hse/statistics/trend
 * 
 * 参数：
 * - period: weekly/monthly/yearly
 * - count: 数据点数量
 */
router.get('/trend', async (req, res) => {
  try {
    const { period = 'weekly', count = 12 } = req.query;

    const data = await statisticsService.getTrendData(period, parseInt(count));

    // 格式化返回数据
    const trendData = data.map(item => ({
      date: item.stat_date || item.stat_month || item.stat_year,
      event_count: item.event_count || 0,
      hazard_count: item.hazard_count || 0,
      accident_count: item.accident_count || 0,
      violation_count: item.violation_count || 0,
      task_total: item.task_total || 0,
      task_completed: item.task_completed || 0,
      task_overdue: item.task_overdue || 0,
      completion_rate: item.completion_rate || 0,
      rectification_rate: item.rectification_rate || 0,
      high_risk_count: item.high_risk_count || 0,
      medium_risk_count: item.medium_risk_count || 0,
      low_risk_count: item.low_risk_count || 0,
    }));

    res.json(success({
      period,
      count: trendData.length,
      data: trendData
    }));

  } catch (err) {
    logger.error('Failed to get trend data', { error: err.message });
    res.status(500).json(error(err.message));
  }
});

/**
 * 获取排名数据
 * GET /api/hse/statistics/ranking
 * 
 * 参数：
 * - type: department/person
 * - period: daily/monthly/yearly
 */
router.get('/ranking', async (req, res) => {
  try {
    const { type = 'department', period = 'monthly' } = req.query;

    let rankings;

    if (type === 'department') {
      rankings = await statisticsService.getDepartmentRanking(period);
    } else if (type === 'person') {
      rankings = await statisticsService.getPersonRanking(period);
    } else {
      return res.status(400).json(error('无效的排名类型'));
    }

    res.json(success({
      type,
      period,
      count: rankings.length,
      list: rankings
    }));

  } catch (err) {
    logger.error('Failed to get ranking data', { error: err.message });
    res.status(500).json(error(err.message));
  }
});

/**
 * 获取安全概览
 * GET /api/hse/statistics/overview
 */
router.get('/overview', async (req, res) => {
  try {
    // 1. 事件概览
    const eventResult = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE is_deleted = FALSE) AS total_events,
        COUNT(*) FILTER (WHERE event_type = 'hazard' AND is_deleted = FALSE) AS hazard_count,
        COUNT(*) FILTER (WHERE event_type = 'accident' AND is_deleted = FALSE) AS accident_count,
        COUNT(*) FILTER (WHERE event_type = 'violation' AND is_deleted = FALSE) AS violation_count,
        COUNT(*) FILTER (WHERE status = 'open' AND is_deleted = FALSE) AS open_count,
        COUNT(*) FILTER (WHERE status = 'closed' AND is_deleted = FALSE) AS closed_count
      FROM hse_events
    `);

    // 2. 任务概览
    const taskResult = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE is_deleted = FALSE) AS total_tasks,
        COUNT(*) FILTER (WHERE status = 'pending' AND is_deleted = FALSE) AS pending_tasks,
        COUNT(*) FILTER (WHERE status = 'in_progress' AND is_deleted = FALSE) AS in_progress_tasks,
        COUNT(*) FILTER (WHERE status = 'completed' AND is_deleted = FALSE) AS completed_tasks,
        COUNT(*) FILTER (WHERE is_overdue = TRUE AND is_deleted = FALSE) AS overdue_tasks,
        CASE 
          WHEN COUNT(*) FILTER (WHERE is_deleted = FALSE) > 0 
          THEN ROUND(COUNT(*) FILTER (WHERE status = 'completed' AND is_deleted = FALSE)::numeric / 
               COUNT(*) FILTER (WHERE is_deleted = FALSE)::numeric * 100, 2)
          ELSE 0 
        END AS completion_rate
      FROM hse_tasks
    `);

    // 3. 风险概览
    const riskResult = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE is_deleted = FALSE) AS total_risks,
        COUNT(*) FILTER (WHERE level LIKE '%红%' AND is_deleted = FALSE) AS high_risk,
        COUNT(*) FILTER (WHERE level LIKE '%橙%' AND is_deleted = FALSE) AS medium_risk,
        COUNT(*) FILTER (WHERE level LIKE '%蓝%' OR level LIKE '%黄%' AND is_deleted = FALSE) AS low_risk
      FROM risk_sources
    `);

    // 4. 整改概览
    const rectResult = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE is_deleted = FALSE) AS total_rectifications,
        COUNT(*) FILTER (WHERE status = 'completed' AND is_deleted = FALSE) AS completed_rectifications,
        CASE 
          WHEN COUNT(*) FILTER (WHERE is_deleted = FALSE) > 0 
          THEN ROUND(COUNT(*) FILTER (WHERE status = 'completed' AND is_deleted = FALSE)::numeric / 
               COUNT(*) FILTER (WHERE is_deleted = FALSE)::numeric * 100, 2)
          ELSE 0 
        END AS rectification_rate
      FROM hse_rectifications
    `);

    // 5. 今日数据
    const today = new Date().toISOString().split('T')[0];
    const todayResult = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE is_deleted = FALSE) AS today_events,
        COUNT(*) FILTER (WHERE event_type = 'hazard' AND is_deleted = FALSE) AS today_hazards,
        COUNT(*) FILTER (WHERE event_type = 'accident' AND is_deleted = FALSE) AS today_accidents
      FROM hse_events
      WHERE DATE(occurred_at) = $1
    `, [today]);

    res.json(success({
      events: eventResult.rows[0],
      tasks: taskResult.rows[0],
      risks: riskResult.rows[0],
      rectifications: rectResult.rows[0],
      today: todayResult.rows[0]
    }));

  } catch (err) {
    logger.error('Failed to get statistics overview', { error: err.message });
    res.status(500).json(error(err.message));
  }
});

/**
 * 获取风险变化趋势
 * GET /api/hse/statistics/risk-trend
 */
router.get('/risk-trend', async (req, res) => {
  try {
    const { period = 'monthly', count = 12 } = req.query;

    let tableName, dateColumn;
    switch (period) {
      case 'weekly':
        tableName = 'hse_statistics_daily';
        dateColumn = 'stat_date';
        break;
      case 'monthly':
        tableName = 'hse_statistics_monthly';
        dateColumn = 'stat_month';
        break;
      case 'yearly':
        tableName = 'hse_statistics_yearly';
        dateColumn = 'stat_year';
        break;
      default:
        tableName = 'hse_statistics_daily';
        dateColumn = 'stat_date';
    }

    const result = await pool.query(
      `SELECT 
        ${dateColumn} AS date,
        high_risk_count,
        medium_risk_count,
        low_risk_count
       FROM ${tableName}
       ORDER BY ${dateColumn} DESC
       LIMIT $1`,
      [parseInt(count)]
    );

    res.json(success({
      period,
      data: result.rows.reverse()
    }));

  } catch (err) {
    logger.error('Failed to get risk trend', { error: err.message });
    res.status(500).json(error(err.message));
  }
});

/**
 * 获取整改趋势
 * GET /api/hse/statistics/rectification-trend
 */
router.get('/rectification-trend', async (req, res) => {
  try {
    const { period = 'monthly', count = 12 } = req.query;

    let tableName, dateColumn;
    switch (period) {
      case 'weekly':
        tableName = 'hse_statistics_daily';
        dateColumn = 'stat_date';
        break;
      case 'monthly':
        tableName = 'hse_statistics_monthly';
        dateColumn = 'stat_month';
        break;
      case 'yearly':
        tableName = 'hse_statistics_yearly';
        dateColumn = 'stat_year';
        break;
      default:
        tableName = 'hse_statistics_daily';
        dateColumn = 'stat_date';
    }

    const result = await pool.query(
      `SELECT 
        ${dateColumn} AS date,
        rectification_total,
        rectification_done,
        rectification_rate,
        review_total,
        review_passed
       FROM ${tableName}
       ORDER BY ${dateColumn} DESC
       LIMIT $1`,
      [parseInt(count)]
    );

    res.json(success({
      period,
      data: result.rows.reverse()
    }));

  } catch (err) {
    logger.error('Failed to get rectification trend', { error: err.message });
    res.status(500).json(error(err.message));
  }
});

/**
 * 获取隐患趋势
 * GET /api/hse/statistics/hazard-trend
 */
router.get('/hazard-trend', async (req, res) => {
  try {
    const { period = 'monthly', count = 12 } = req.query;

    let tableName, dateColumn;
    switch (period) {
      case 'weekly':
        tableName = 'hse_statistics_daily';
        dateColumn = 'stat_date';
        break;
      case 'monthly':
        tableName = 'hse_statistics_monthly';
        dateColumn = 'stat_month';
        break;
      case 'yearly':
        tableName = 'hse_statistics_yearly';
        dateColumn = 'stat_year';
        break;
      default:
        tableName = 'hse_statistics_daily';
        dateColumn = 'stat_date';
    }

    const result = await pool.query(
      `SELECT 
        ${dateColumn} AS date,
        event_count,
        hazard_count,
        accident_count,
        violation_count,
        patrol_alert_count,
        iot_alert_count
       FROM ${tableName}
       ORDER BY ${dateColumn} DESC
       LIMIT $1`,
      [parseInt(count)]
    );

    res.json(success({
      period,
      data: result.rows.reverse()
    }));

  } catch (err) {
    logger.error('Failed to get hazard trend', { error: err.message });
    res.status(500).json(error(err.message));
  }
});

/**
 * 手动生成统计数据
 * POST /api/hse/statistics/generate
 */
router.post('/generate', async (req, res) => {
  try {
    const { type = 'daily', date } = req.body;

    let result;

    switch (type) {
      case 'daily':
        result = await statisticsService.generateDailyStats(date ? new Date(date) : new Date());
        break;
      case 'monthly':
        {
          const d = date ? new Date(date) : new Date();
          result = await statisticsService.generateMonthlyStats(d.getFullYear(), d.getMonth() + 1);
        }
        break;
      case 'yearly':
        {
          const d = date ? new Date(date) : new Date();
          result = await statisticsService.generateYearlyStats(d.getFullYear());
        }
        break;
      case 'historical':
        await statisticsService.generateHistoricalStats(30);
        result = { message: '历史数据生成完成' };
        break;
      default:
        return res.status(400).json(error('无效的生成类型'));
    }

    res.json(success(result, '统计数据生成成功'));

  } catch (err) {
    logger.error('Failed to generate statistics', { error: err.message });
    res.status(500).json(error(err.message));
  }
});

module.exports = router;