/**
 * HSE 统计服务
 * 
 * 功能：
 * - 每日统计数据生成
 * - 每月统计数据生成
 * - 每年统计数据生成
 * - 趋势分析
 * - 排名统计
 */

const { pool } = require('../config/db');
const { logger } = require('../middleware/requestLogger');

/**
 * 生成每日统计数据
 * @param {Date} statDate 统计日期
 */
async function generateDailyStats(statDate) {
  try {
    const dateStr = statDate.toISOString().split('T')[0];
    logger.info('Generating daily statistics', { statDate: dateStr });

    const startOfDay = `${dateStr} 00:00:00`;
    const endOfDay = `${dateStr} 23:59:59`;

    const stats = {};

    // 1. 事件统计
    const eventResult = await pool.query(
      `SELECT 
        COUNT(*) FILTER (WHERE is_deleted = FALSE) AS event_count,
        COUNT(*) FILTER (WHERE event_type = 'hazard' AND is_deleted = FALSE) AS hazard_count,
        COUNT(*) FILTER (WHERE event_type = 'accident' AND is_deleted = FALSE) AS accident_count,
        COUNT(*) FILTER (WHERE event_type = 'violation' AND is_deleted = FALSE) AS violation_count,
        COUNT(*) FILTER (WHERE event_type = 'patrol_alert' AND is_deleted = FALSE) AS patrol_alert_count,
        COUNT(*) FILTER (WHERE event_type = 'iot_alert' AND is_deleted = FALSE) AS iot_alert_count
       FROM hse_events
       WHERE occurred_at BETWEEN $1 AND $2`,
      [startOfDay, endOfDay]
    );
    Object.assign(stats, eventResult.rows[0]);

    // 2. 任务统计
    const taskResult = await pool.query(
      `SELECT 
        COUNT(*) FILTER (WHERE is_deleted = FALSE) AS task_total,
        COUNT(*) FILTER (WHERE status = 'completed' AND is_deleted = FALSE) AS task_completed,
        COUNT(*) FILTER (WHERE is_overdue = TRUE AND is_deleted = FALSE) AS task_overdue,
        COUNT(*) FILTER (WHERE status = 'pending' AND is_deleted = FALSE) AS task_pending
       FROM hse_tasks
       WHERE DATE(created_at) = $1`,
      [dateStr]
    );
    Object.assign(stats, taskResult.rows[0]);

    // 3. 整改统计
    const rectResult = await pool.query(
      `SELECT 
        COUNT(*) FILTER (WHERE is_deleted = FALSE) AS rectification_total,
        COUNT(*) FILTER (WHERE status = 'completed' AND is_deleted = FALSE) AS rectification_done
       FROM hse_rectifications
       WHERE DATE(created_at) = $1`,
      [dateStr]
    );
    Object.assign(stats, rectResult.rows[0]);

    // 4. 复查统计
    const reviewResult = await pool.query(
      `SELECT 
        COUNT(*) FILTER (WHERE is_deleted = FALSE) AS review_total,
        COUNT(*) FILTER (WHERE result = 'passed' AND is_deleted = FALSE) AS review_passed
       FROM hse_reviews
       WHERE DATE(created_at) = $1`,
      [dateStr]
    );
    Object.assign(stats, reviewResult.rows[0]);

    // 5. 风险统计
    const riskResult = await pool.query(
      `SELECT 
        COUNT(*) FILTER (WHERE level LIKE '%红%' AND is_deleted = FALSE) AS high_risk_count,
        COUNT(*) FILTER (WHERE level LIKE '%橙%' AND is_deleted = FALSE) AS medium_risk_count,
        COUNT(*) FILTER (WHERE level LIKE '%蓝%' OR level LIKE '%黄%' AND is_deleted = FALSE) AS low_risk_count
       FROM risk_sources
       WHERE is_deleted = FALSE`
    );
    Object.assign(stats, riskResult.rows[0]);

    // 6. 计算比率
    stats.completion_rate = stats.task_total > 0 
      ? Math.round((stats.task_completed / stats.task_total) * 10000) / 100 
      : 0;
    stats.rectification_rate = stats.rectification_total > 0 
      ? Math.round((stats.rectification_done / stats.rectification_total) * 10000) / 100 
      : 0;
    stats.training_rate = 0;

    // 7. 插入或更新统计数据
    await pool.query(
      `INSERT INTO hse_statistics_daily (
        stat_date, event_count, hazard_count, accident_count, violation_count,
        patrol_alert_count, iot_alert_count,
        task_total, task_completed, task_overdue, task_pending,
        rectification_total, rectification_done, review_total, review_passed,
        high_risk_count, medium_risk_count, low_risk_count,
        training_rate, completion_rate, rectification_rate
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
      ON CONFLICT (stat_date) DO UPDATE SET
        event_count = EXCLUDED.event_count,
        hazard_count = EXCLUDED.hazard_count,
        accident_count = EXCLUDED.accident_count,
        violation_count = EXCLUDED.violation_count,
        patrol_alert_count = EXCLUDED.patrol_alert_count,
        iot_alert_count = EXCLUDED.iot_alert_count,
        task_total = EXCLUDED.task_total,
        task_completed = EXCLUDED.task_completed,
        task_overdue = EXCLUDED.task_overdue,
        task_pending = EXCLUDED.task_pending,
        rectification_total = EXCLUDED.rectification_total,
        rectification_done = EXCLUDED.rectification_done,
        review_total = EXCLUDED.review_total,
        review_passed = EXCLUDED.review_passed,
        high_risk_count = EXCLUDED.high_risk_count,
        medium_risk_count = EXCLUDED.medium_risk_count,
        low_risk_count = EXCLUDED.low_risk_count,
        training_rate = EXCLUDED.training_rate,
        completion_rate = EXCLUDED.completion_rate,
        rectification_rate = EXCLUDED.rectification_rate,
        created_at = NOW()`,
      [
        dateStr,
        stats.event_count,
        stats.hazard_count,
        stats.accident_count,
        stats.violation_count,
        stats.patrol_alert_count,
        stats.iot_alert_count,
        stats.task_total,
        stats.task_completed,
        stats.task_overdue,
        stats.task_pending,
        stats.rectification_total,
        stats.rectification_done,
        stats.review_total,
        stats.review_passed,
        stats.high_risk_count,
        stats.medium_risk_count,
        stats.low_risk_count,
        stats.training_rate,
        stats.completion_rate,
        stats.rectification_rate
      ]
    );

    logger.info('Daily statistics generated successfully', { statDate: dateStr });

    return stats;

  } catch (err) {
    logger.error('Failed to generate daily statistics', { statDate, error: err.message });
    throw err;
  }
}

/**
 * 生成每月统计数据
 * @param {number} year 年份
 * @param {number} month 月份
 */
async function generateMonthlyStats(year, month) {
  try {
    const monthStr = `${year}-${String(month).padStart(2, '0')}`;
    logger.info('Generating monthly statistics', { month: monthStr });

    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = new Date(year, month, 0).toISOString().split('T')[0];

    const stats = {};

    // 1. 事件统计
    const eventResult = await pool.query(
      `SELECT 
        COUNT(*) FILTER (WHERE is_deleted = FALSE) AS event_count,
        COUNT(*) FILTER (WHERE event_type = 'hazard' AND is_deleted = FALSE) AS hazard_count,
        COUNT(*) FILTER (WHERE event_type = 'accident' AND is_deleted = FALSE) AS accident_count,
        COUNT(*) FILTER (WHERE event_type = 'violation' AND is_deleted = FALSE) AS violation_count,
        COUNT(*) FILTER (WHERE event_type = 'patrol_alert' AND is_deleted = FALSE) AS patrol_alert_count,
        COUNT(*) FILTER (WHERE event_type = 'iot_alert' AND is_deleted = FALSE) AS iot_alert_count
       FROM hse_events
       WHERE occurred_at BETWEEN $1 AND $2`,
      [`${startDate} 00:00:00`, `${endDate} 23:59:59`]
    );
    Object.assign(stats, eventResult.rows[0]);

    // 2. 任务统计
    const taskResult = await pool.query(
      `SELECT 
        COUNT(*) FILTER (WHERE is_deleted = FALSE) AS task_total,
        COUNT(*) FILTER (WHERE status = 'completed' AND is_deleted = FALSE) AS task_completed,
        COUNT(*) FILTER (WHERE is_overdue = TRUE AND is_deleted = FALSE) AS task_overdue,
        COUNT(*) FILTER (WHERE status = 'pending' AND is_deleted = FALSE) AS task_pending
       FROM hse_tasks
       WHERE DATE(created_at) BETWEEN $1 AND $2`,
      [startDate, endDate]
    );
    Object.assign(stats, taskResult.rows[0]);

    // 3. 整改统计
    const rectResult = await pool.query(
      `SELECT 
        COUNT(*) FILTER (WHERE is_deleted = FALSE) AS rectification_total,
        COUNT(*) FILTER (WHERE status = 'completed' AND is_deleted = FALSE) AS rectification_done
       FROM hse_rectifications
       WHERE DATE(created_at) BETWEEN $1 AND $2`,
      [startDate, endDate]
    );
    Object.assign(stats, rectResult.rows[0]);

    // 4. 复查统计
    const reviewResult = await pool.query(
      `SELECT 
        COUNT(*) FILTER (WHERE is_deleted = FALSE) AS review_total,
        COUNT(*) FILTER (WHERE result = 'passed' AND is_deleted = FALSE) AS review_passed
       FROM hse_reviews
       WHERE DATE(created_at) BETWEEN $1 AND $2`,
      [startDate, endDate]
    );
    Object.assign(stats, reviewResult.rows[0]);

    // 5. 风险统计
    const riskResult = await pool.query(
      `SELECT 
        COUNT(*) FILTER (WHERE level LIKE '%红%' AND is_deleted = FALSE) AS high_risk_count,
        COUNT(*) FILTER (WHERE level LIKE '%橙%' AND is_deleted = FALSE) AS medium_risk_count,
        COUNT(*) FILTER (WHERE level LIKE '%蓝%' OR level LIKE '%黄%' AND is_deleted = FALSE) AS low_risk_count
       FROM risk_sources
       WHERE is_deleted = FALSE`
    );
    Object.assign(stats, riskResult.rows[0]);

    // 6. 计算比率
    stats.completion_rate = stats.task_total > 0 
      ? Math.round((stats.task_completed / stats.task_total) * 10000) / 100 
      : 0;
    stats.rectification_rate = stats.rectification_total > 0 
      ? Math.round((stats.rectification_done / stats.rectification_total) * 10000) / 100 
      : 0;
    stats.training_rate = 0;

    // 7. 平均响应时间和整改时间
    const timeResult = await pool.query(
      `SELECT 
        AVG(EXTRACT(EPOCH FROM (completed_at - created_at)) / 3600) FILTER (WHERE status = 'completed') AS avg_response_time
       FROM hse_tasks
       WHERE DATE(created_at) BETWEEN $1 AND $2`,
      [startDate, endDate]
    );
    stats.avg_response_time = timeResult.rows[0].avg_response_time || 0;
    stats.avg_rectify_time = timeResult.rows[0].avg_response_time || 0;

    // 8. 插入或更新统计数据
    await pool.query(
      `INSERT INTO hse_statistics_monthly (
        stat_month, stat_year, stat_month_num,
        event_count, hazard_count, accident_count, violation_count,
        patrol_alert_count, iot_alert_count,
        task_total, task_completed, task_overdue, task_pending,
        rectification_total, rectification_done, review_total, review_passed,
        high_risk_count, medium_risk_count, low_risk_count,
        training_rate, completion_rate, rectification_rate,
        avg_response_time, avg_rectify_time
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)
      ON CONFLICT (stat_month) DO UPDATE SET
        event_count = EXCLUDED.event_count,
        hazard_count = EXCLUDED.hazard_count,
        accident_count = EXCLUDED.accident_count,
        violation_count = EXCLUDED.violation_count,
        patrol_alert_count = EXCLUDED.patrol_alert_count,
        iot_alert_count = EXCLUDED.iot_alert_count,
        task_total = EXCLUDED.task_total,
        task_completed = EXCLUDED.task_completed,
        task_overdue = EXCLUDED.task_overdue,
        task_pending = EXCLUDED.task_pending,
        rectification_total = EXCLUDED.rectification_total,
        rectification_done = EXCLUDED.rectification_done,
        review_total = EXCLUDED.review_total,
        review_passed = EXCLUDED.review_passed,
        high_risk_count = EXCLUDED.high_risk_count,
        medium_risk_count = EXCLUDED.medium_risk_count,
        low_risk_count = EXCLUDED.low_risk_count,
        training_rate = EXCLUDED.training_rate,
        completion_rate = EXCLUDED.completion_rate,
        rectification_rate = EXCLUDED.rectification_rate,
        avg_response_time = EXCLUDED.avg_response_time,
        avg_rectify_time = EXCLUDED.avg_rectify_time,
        created_at = NOW()`,
      [
        monthStr,
        year,
        month,
        stats.event_count,
        stats.hazard_count,
        stats.accident_count,
        stats.violation_count,
        stats.patrol_alert_count,
        stats.iot_alert_count,
        stats.task_total,
        stats.task_completed,
        stats.task_overdue,
        stats.task_pending,
        stats.rectification_total,
        stats.rectification_done,
        stats.review_total,
        stats.review_passed,
        stats.high_risk_count,
        stats.medium_risk_count,
        stats.low_risk_count,
        stats.training_rate,
        stats.completion_rate,
        stats.rectification_rate,
        stats.avg_response_time,
        stats.avg_rectify_time
      ]
    );

    logger.info('Monthly statistics generated successfully', { month: monthStr });

    return stats;

  } catch (err) {
    logger.error('Failed to generate monthly statistics', { year, month, error: err.message });
    throw err;
  }
}

/**
 * 生成每年统计数据
 * @param {number} year 年份
 */
async function generateYearlyStats(year) {
  try {
    logger.info('Generating yearly statistics', { year });

    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;

    const stats = {};

    // 1. 事件统计
    const eventResult = await pool.query(
      `SELECT 
        COUNT(*) FILTER (WHERE is_deleted = FALSE) AS event_count,
        COUNT(*) FILTER (WHERE event_type = 'hazard' AND is_deleted = FALSE) AS hazard_count,
        COUNT(*) FILTER (WHERE event_type = 'accident' AND is_deleted = FALSE) AS accident_count,
        COUNT(*) FILTER (WHERE event_type = 'violation' AND is_deleted = FALSE) AS violation_count,
        COUNT(*) FILTER (WHERE event_type = 'patrol_alert' AND is_deleted = FALSE) AS patrol_alert_count,
        COUNT(*) FILTER (WHERE event_type = 'iot_alert' AND is_deleted = FALSE) AS iot_alert_count
       FROM hse_events
       WHERE occurred_at BETWEEN $1 AND $2`,
      [`${startDate} 00:00:00`, `${endDate} 23:59:59`]
    );
    Object.assign(stats, eventResult.rows[0]);

    // 2. 任务统计
    const taskResult = await pool.query(
      `SELECT 
        COUNT(*) FILTER (WHERE is_deleted = FALSE) AS task_total,
        COUNT(*) FILTER (WHERE status = 'completed' AND is_deleted = FALSE) AS task_completed,
        COUNT(*) FILTER (WHERE is_overdue = TRUE AND is_deleted = FALSE) AS task_overdue,
        COUNT(*) FILTER (WHERE status = 'pending' AND is_deleted = FALSE) AS task_pending
       FROM hse_tasks
       WHERE DATE(created_at) BETWEEN $1 AND $2`,
      [startDate, endDate]
    );
    Object.assign(stats, taskResult.rows[0]);

    // 3. 整改统计
    const rectResult = await pool.query(
      `SELECT 
        COUNT(*) FILTER (WHERE is_deleted = FALSE) AS rectification_total,
        COUNT(*) FILTER (WHERE status = 'completed' AND is_deleted = FALSE) AS rectification_done
       FROM hse_rectifications
       WHERE DATE(created_at) BETWEEN $1 AND $2`,
      [startDate, endDate]
    );
    Object.assign(stats, rectResult.rows[0]);

    // 4. 复查统计
    const reviewResult = await pool.query(
      `SELECT 
        COUNT(*) FILTER (WHERE is_deleted = FALSE) AS review_total,
        COUNT(*) FILTER (WHERE result = 'passed' AND is_deleted = FALSE) AS review_passed
       FROM hse_reviews
       WHERE DATE(created_at) BETWEEN $1 AND $2`,
      [startDate, endDate]
    );
    Object.assign(stats, reviewResult.rows[0]);

    // 5. 风险统计
    const riskResult = await pool.query(
      `SELECT 
        COUNT(*) FILTER (WHERE level LIKE '%红%' AND is_deleted = FALSE) AS high_risk_count,
        COUNT(*) FILTER (WHERE level LIKE '%橙%' AND is_deleted = FALSE) AS medium_risk_count,
        COUNT(*) FILTER (WHERE level LIKE '%蓝%' OR level LIKE '%黄%' AND is_deleted = FALSE) AS low_risk_count
       FROM risk_sources
       WHERE is_deleted = FALSE`
    );
    Object.assign(stats, riskResult.rows[0]);

    // 6. 计算比率
    stats.completion_rate = stats.task_total > 0 
      ? Math.round((stats.task_completed / stats.task_total) * 10000) / 100 
      : 0;
    stats.rectification_rate = stats.rectification_total > 0 
      ? Math.round((stats.rectification_done / stats.rectification_total) * 10000) / 100 
      : 0;
    stats.training_rate = 0;

    // 7. 平均时间
    const timeResult = await pool.query(
      `SELECT 
        AVG(EXTRACT(EPOCH FROM (completed_at - created_at)) / 3600) FILTER (WHERE status = 'completed') AS avg_response_time
       FROM hse_tasks
       WHERE DATE(created_at) BETWEEN $1 AND $2`,
      [startDate, endDate]
    );
    stats.avg_response_time = timeResult.rows[0].avg_response_time || 0;
    stats.avg_rectify_time = timeResult.rows[0].avg_response_time || 0;

    // 8. 同比变化
    const prevYear = year - 1;
    const prevResult = await pool.query(
      `SELECT event_count, hazard_count, accident_count
       FROM hse_statistics_yearly
       WHERE stat_year = $1`,
      [prevYear]
    );

    if (prevResult.rows.length > 0) {
      const prev = prevResult.rows[0];
      stats.accident_rate_trend = prev.accident_count > 0 
        ? Math.round(((stats.accident_count - prev.accident_count) / prev.accident_count) * 10000) / 100 
        : 0;
      stats.hazard_rate_trend = prev.hazard_count > 0 
        ? Math.round(((stats.hazard_count - prev.hazard_count) / prev.hazard_count) * 10000) / 100 
        : 0;
    } else {
      stats.accident_rate_trend = 0;
      stats.hazard_rate_trend = 0;
    }

    // 9. 插入或更新统计数据
    await pool.query(
      `INSERT INTO hse_statistics_yearly (
        stat_year,
        event_count, hazard_count, accident_count, violation_count,
        patrol_alert_count, iot_alert_count,
        task_total, task_completed, task_overdue, task_pending,
        rectification_total, rectification_done, review_total, review_passed,
        high_risk_count, medium_risk_count, low_risk_count,
        training_rate, completion_rate, rectification_rate,
        avg_response_time, avg_rectify_time,
        accident_rate_trend, hazard_rate_trend
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)
      ON CONFLICT (stat_year) DO UPDATE SET
        event_count = EXCLUDED.event_count,
        hazard_count = EXCLUDED.hazard_count,
        accident_count = EXCLUDED.accident_count,
        violation_count = EXCLUDED.violation_count,
        patrol_alert_count = EXCLUDED.patrol_alert_count,
        iot_alert_count = EXCLUDED.iot_alert_count,
        task_total = EXCLUDED.task_total,
        task_completed = EXCLUDED.task_completed,
        task_overdue = EXCLUDED.task_overdue,
        task_pending = EXCLUDED.task_pending,
        rectification_total = EXCLUDED.rectification_total,
        rectification_done = EXCLUDED.rectification_done,
        review_total = EXCLUDED.review_total,
        review_passed = EXCLUDED.review_passed,
        high_risk_count = EXCLUDED.high_risk_count,
        medium_risk_count = EXCLUDED.medium_risk_count,
        low_risk_count = EXCLUDED.low_risk_count,
        training_rate = EXCLUDED.training_rate,
        completion_rate = EXCLUDED.completion_rate,
        rectification_rate = EXCLUDED.rectification_rate,
        avg_response_time = EXCLUDED.avg_response_time,
        avg_rectify_time = EXCLUDED.avg_rectify_time,
        accident_rate_trend = EXCLUDED.accident_rate_trend,
        hazard_rate_trend = EXCLUDED.hazard_rate_trend,
        created_at = NOW()`,
      [
        year,
        stats.event_count,
        stats.hazard_count,
        stats.accident_count,
        stats.violation_count,
        stats.patrol_alert_count,
        stats.iot_alert_count,
        stats.task_total,
        stats.task_completed,
        stats.task_overdue,
        stats.task_pending,
        stats.rectification_total,
        stats.rectification_done,
        stats.review_total,
        stats.review_passed,
        stats.high_risk_count,
        stats.medium_risk_count,
        stats.low_risk_count,
        stats.training_rate,
        stats.completion_rate,
        stats.rectification_rate,
        stats.avg_response_time,
        stats.avg_rectify_time,
        stats.accident_rate_trend,
        stats.hazard_rate_trend
      ]
    );

    logger.info('Yearly statistics generated successfully', { year });

    return stats;

  } catch (err) {
    logger.error('Failed to generate yearly statistics', { year, error: err.message });
    throw err;
  }
}

/**
 * 获取趋势数据
 * @param {string} period 周期 weekly/monthly/yearly
 * @param {number} count 数量
 */
async function getTrendData(period = 'weekly', count = 12) {
  try {
    let tableName, dateColumn, dateFormat;

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
      `SELECT * FROM ${tableName}
       ORDER BY ${dateColumn} DESC
       LIMIT $1`,
      [count]
    );

    return result.rows.reverse();

  } catch (err) {
    logger.error('Failed to get trend data', { period, error: err.message });
    throw err;
  }
}

/**
 * 获取部门排名
 * @param {string} period 周期 daily/monthly/yearly
 */
async function getDepartmentRanking(period = 'monthly') {
  try {
    const result = await pool.query(
      `SELECT 
        d.id AS department_id,
        d.name AS department_name,
        COUNT(e.id) FILTER (WHERE e.is_deleted = FALSE) AS event_count,
        COUNT(e.id) FILTER (WHERE e.event_type = 'hazard' AND e.is_deleted = FALSE) AS hazard_count,
        COUNT(e.id) FILTER (WHERE e.event_type = 'accident' AND e.is_deleted = FALSE) AS accident_count,
        COUNT(t.id) FILTER (WHERE t.is_deleted = FALSE) AS task_total,
        COUNT(t.id) FILTER (WHERE t.status = 'completed' AND t.is_deleted = FALSE) AS task_completed,
        COUNT(t.id) FILTER (WHERE t.is_overdue = TRUE AND t.is_deleted = FALSE) AS task_overdue,
        CASE 
          WHEN COUNT(t.id) FILTER (WHERE t.is_deleted = FALSE) > 0 
          THEN ROUND(COUNT(t.id) FILTER (WHERE t.status = 'completed' AND t.is_deleted = FALSE)::numeric / 
               COUNT(t.id) FILTER (WHERE t.is_deleted = FALSE)::numeric * 100, 2)
          ELSE 0 
        END AS completion_rate,
        CASE 
          WHEN COUNT(e.id) FILTER (WHERE e.is_deleted = FALSE) > 0 
          THEN ROUND(100 - (COUNT(e.id) FILTER (WHERE e.event_type = 'accident' AND e.is_deleted = FALSE)::numeric / 
               COUNT(e.id) FILTER (WHERE e.is_deleted = FALSE)::numeric * 100), 2)
          ELSE 100 
        END AS safety_score
      FROM departments d
      LEFT JOIN hse_events e ON e.department_id = d.id
      LEFT JOIN hse_tasks t ON t.department_id = d.id
      GROUP BY d.id, d.name
      ORDER BY safety_score DESC, completion_rate DESC`
    );

    // 计算排名
    const rankings = result.rows.map((row, index) => ({
      ...row,
      ranking: index + 1
    }));

    return rankings;

  } catch (err) {
    logger.error('Failed to get department ranking', { period, error: err.message });
    throw err;
  }
}

/**
 * 获取责任人排名
 * @param {string} period 周期 daily/monthly/yearly
 */
async function getPersonRanking(period = 'monthly') {
  try {
    const result = await pool.query(
      `SELECT 
        t.responsible_person_id AS person_id,
        t.responsible_person AS person_name,
        COUNT(t.id) FILTER (WHERE t.is_deleted = FALSE) AS task_total,
        COUNT(t.id) FILTER (WHERE t.status = 'completed' AND t.is_deleted = FALSE) AS task_completed,
        COUNT(t.id) FILTER (WHERE t.is_overdue = TRUE AND t.is_deleted = FALSE) AS task_overdue,
        CASE 
          WHEN COUNT(t.id) FILTER (WHERE t.is_deleted = FALSE) > 0 
          THEN ROUND(COUNT(t.id) FILTER (WHERE t.status = 'completed' AND t.is_deleted = FALSE)::numeric / 
               COUNT(t.id) FILTER (WHERE t.is_deleted = FALSE)::numeric * 100, 2)
          ELSE 0 
        END AS completion_rate,
        CASE 
          WHEN COUNT(t.id) FILTER (WHERE t.is_deleted = FALSE) > 0 
          THEN ROUND(100 - (COUNT(t.id) FILTER (WHERE t.is_overdue = TRUE AND t.is_deleted = FALSE)::numeric / 
               COUNT(t.id) FILTER (WHERE t.is_deleted = FALSE)::numeric * 50), 2)
          ELSE 100 
        END AS performance_score
      FROM hse_tasks t
      WHERE t.responsible_person IS NOT NULL
      GROUP BY t.responsible_person_id, t.responsible_person
      ORDER BY performance_score DESC, completion_rate DESC
      LIMIT 20`
    );

    // 计算排名
    const rankings = result.rows.map((row, index) => ({
      ...row,
      ranking: index + 1
    }));

    return rankings;

  } catch (err) {
    logger.error('Failed to get person ranking', { period, error: err.message });
    throw err;
  }
}

/**
 * 生成历史数据（回填过去的数据）
 */
async function generateHistoricalStats(days = 30) {
  try {
    logger.info('Generating historical statistics', { days });

    const today = new Date();
    
    // 生成每日数据
    for (let i = 0; i < days; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      await generateDailyStats(date);
    }

    // 生成每月数据（当前年的所有月份）
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth() + 1;
    for (let m = 1; m <= currentMonth; m++) {
      await generateMonthlyStats(currentYear, m);
    }

    // 生成年度数据
    await generateYearlyStats(currentYear);

    logger.info('Historical statistics generation completed', { days });

  } catch (err) {
    logger.error('Failed to generate historical statistics', { error: err.message });
    throw err;
  }
}

module.exports = {
  generateDailyStats,
  generateMonthlyStats,
  generateYearlyStats,
  getTrendData,
  getDepartmentRanking,
  getPersonRanking,
  generateHistoricalStats
};