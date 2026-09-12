/**
 * HSE 智能报告服务
 * 
 * 功能：
 * - 根据统计数据自动生成报告
 * - 支持日报、周报、月报、年报
 * - 支持报告预览和导出
 */

const { pool } = require('../config/db');
const { logger } = require('../middleware/requestLogger');
const dayjs = require('dayjs');
const aiService = require('./aiService');

class ReportService {
  /**
   * 生成报告
   * @param {Object} params
   * @param {string} params.reportType - daily/weekly/monthly/yearly
   * @param {string} params.reportPeriod - 报告周期（如2026-07）
   * @param {number} params.generatedBy - 生成人ID
   */
  async generateReport(params) {
    const { reportType, reportPeriod, generatedBy } = params;
    
    logger.info(`Generating ${reportType} report for ${reportPeriod}`, {
      service: process.env.SERVICE_NAME || 'safety-dashboard-server',
      reportType,
      reportPeriod
    });

    let reportData, reportName, reportDate;

    switch (reportType) {
      case 'daily':
        reportData = await this.generateDailyReport(reportPeriod);
        reportName = `安全日报 - ${reportPeriod}`;
        reportDate = dayjs(reportPeriod).toDate();
        break;
      case 'weekly':
        reportData = await this.generateWeeklyReport(reportPeriod);
        reportName = `安全周报 - ${reportPeriod}`;
        reportDate = dayjs(reportPeriod + '-01').toDate();
        break;
      case 'monthly':
        reportData = await this.generateMonthlyReport(reportPeriod);
        reportName = `安全月报 - ${reportPeriod}`;
        reportDate = dayjs(reportPeriod + '-01').toDate();
        break;
      case 'yearly':
        reportData = await this.generateYearlyReport(reportPeriod);
        reportName = `年度安全总结 - ${reportPeriod}`;
        reportDate = dayjs(reportPeriod + '-01-01').toDate();
        break;
      default:
        throw new Error('未知的报告类型');
    }

    const reportHtml = this.generateHtmlReport(reportData, reportType);

    const result = await pool.query(
      `INSERT INTO hse_reports 
        (report_name, report_type, report_period, report_date, report_data, report_html, generated_by, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'generated')
        ON CONFLICT (report_type, report_period) DO UPDATE 
        SET report_data = $5, report_html = $6, created_at = NOW()
        RETURNING id`,
      [reportName, reportType, reportPeriod, reportDate, JSON.stringify(reportData), reportHtml, generatedBy]
    );

    logger.info(`Report generated successfully`, {
      reportId: result.rows[0].id,
      reportType,
      reportPeriod
    });

    return {
      id: result.rows[0].id,
      reportName,
      reportType,
      reportPeriod,
      reportData,
      reportHtml
    };
  }

  /**
   * 生成日报数据
   */
  async generateDailyReport(dateStr) {
    const date = dayjs(dateStr).format('YYYY-MM-DD');
    
    const [eventResult, taskResult, riskResult] = await Promise.all([
      pool.query(`
        SELECT 
          COUNT(*) FILTER (WHERE is_deleted = FALSE) AS total_events,
          COUNT(*) FILTER (WHERE event_type = 'hazard' AND is_deleted = FALSE) AS hazard_count,
          COUNT(*) FILTER (WHERE event_type = 'accident' AND is_deleted = FALSE) AS accident_count,
          COUNT(*) FILTER (WHERE event_type = 'violation' AND is_deleted = FALSE) AS violation_count
        FROM hse_events
        WHERE DATE(occurred_at) = $1
      `, [date]),
      
      pool.query(`
        SELECT 
          COUNT(*) FILTER (WHERE is_deleted = FALSE) AS total_tasks,
          COUNT(*) FILTER (WHERE status = 'completed' AND is_deleted = FALSE) AS completed_tasks,
          COUNT(*) FILTER (WHERE is_overdue = TRUE AND is_deleted = FALSE) AS overdue_tasks
        FROM hse_tasks
        WHERE DATE(created_at) = $1
      `, [date]),
      
      pool.query(`
        SELECT 
          COUNT(*) FILTER (WHERE is_deleted = FALSE) AS total_risks,
          COUNT(*) FILTER (WHERE (level LIKE '%红%' OR level LIKE '%重大%') AND is_deleted = FALSE) AS high_risk_count
        FROM risk_sources
      `)
    ]);

    return {
      report_type: 'daily',
      report_period: date,
      generated_at: dayjs().format('YYYY-MM-DD HH:mm:ss'),
      sections: {
        '安全总体情况': {
          title: '安全总体情况',
          summary: eventResult.rows[0].total_events === 0 ? '今日安全状况良好，无安全事件发生。' : `今日共发生 ${eventResult.rows[0].total_events} 起安全事件。`,
          metrics: {
            total_events: eventResult.rows[0].total_events,
            hazard_count: eventResult.rows[0].hazard_count,
            accident_count: eventResult.rows[0].accident_count,
            violation_count: eventResult.rows[0].violation_count
          }
        },
        '事件情况': {
          title: '事件情况',
          data: eventResult.rows[0]
        },
        '任务完成情况': {
          title: '任务完成情况',
          data: taskResult.rows[0]
        },
        '风险情况': {
          title: '风险情况',
          data: riskResult.rows[0]
        }
      }
    };
  }

  /**
   * 生成周报数据
   */
  async generateWeeklyReport(period) {
    const [year, week] = period.split('-W');
    const startDate = dayjs().year(year).week(week).startOf('week').format('YYYY-MM-DD');
    const endDate = dayjs().year(year).week(week).endOf('week').format('YYYY-MM-DD');

    const [eventResult, taskResult, riskResult, rectResult] = await Promise.all([
      pool.query(`
        SELECT 
          COUNT(*) FILTER (WHERE is_deleted = FALSE) AS total_events,
          COUNT(*) FILTER (WHERE event_type = 'hazard' AND is_deleted = FALSE) AS hazard_count,
          COUNT(*) FILTER (WHERE event_type = 'accident' AND is_deleted = FALSE) AS accident_count,
          COUNT(*) FILTER (WHERE event_type = 'violation' AND is_deleted = FALSE) AS violation_count
        FROM hse_events
        WHERE DATE(occurred_at) BETWEEN $1 AND $2
      `, [startDate, endDate]),
      
      pool.query(`
        SELECT 
          COUNT(*) FILTER (WHERE is_deleted = FALSE) AS total_tasks,
          COUNT(*) FILTER (WHERE status = 'completed' AND is_deleted = FALSE) AS completed_tasks,
          COUNT(*) FILTER (WHERE is_overdue = TRUE AND is_deleted = FALSE) AS overdue_tasks,
          CASE 
            WHEN COUNT(*) FILTER (WHERE is_deleted = FALSE) > 0 
            THEN ROUND(COUNT(*) FILTER (WHERE status = 'completed' AND is_deleted = FALSE)::numeric / 
                 COUNT(*) FILTER (WHERE is_deleted = FALSE)::numeric * 100, 2)
            ELSE 0 
          END AS completion_rate
        FROM hse_tasks
        WHERE DATE(created_at) BETWEEN $1 AND $2
      `, [startDate, endDate]),
      
      pool.query(`
        SELECT 
          COUNT(*) FILTER (WHERE is_deleted = FALSE) AS total_risks,
          COUNT(*) FILTER (WHERE (level LIKE '%红%' OR level LIKE '%重大%') AND is_deleted = FALSE) AS high_risk_count,
          COUNT(*) FILTER (WHERE (level LIKE '%橙%' OR level LIKE '%较大%') AND is_deleted = FALSE) AS medium_risk_count
        FROM risk_sources
      `),
      
      pool.query(`
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
        WHERE DATE(created_at) BETWEEN $1 AND $2
      `, [startDate, endDate])
    ]);

    return {
      report_type: 'weekly',
      report_period: period,
      date_range: { start: startDate, end: endDate },
      generated_at: dayjs().format('YYYY-MM-DD HH:mm:ss'),
      sections: {
        '安全总体情况': {
          title: '安全总体情况',
          summary: this.generateSummary(eventResult.rows[0], taskResult.rows[0], rectResult.rows[0])
        },
        '事故情况': {
          title: '事故情况',
          data: eventResult.rows[0]
        },
        '隐患分析': {
          title: '隐患分析',
          data: {
            hazard_count: eventResult.rows[0].hazard_count,
            analysis: '待分析'
          }
        },
        '风险变化': {
          title: '风险变化',
          data: riskResult.rows[0]
        },
        '整改情况': {
          title: '整改情况',
          data: rectResult.rows[0]
        },
        '改进建议': {
          title: '改进建议',
          suggestions: this.generateSuggestions(eventResult.rows[0], taskResult.rows[0], rectResult.rows[0])
        }
      }
    };
  }

  /**
   * 生成月报数据
   */
  async generateMonthlyReport(period) {
    const [year, month] = period.split('-');
    const startDate = `${year}-${month}-01`;
    const endDate = dayjs(startDate).endOf('month').format('YYYY-MM-DD');

    const [eventResult, taskResult, riskResult, rectResult, focusResult] = await Promise.all([
      pool.query(`
        SELECT 
          COUNT(*) FILTER (WHERE is_deleted = FALSE) AS total_events,
          COUNT(*) FILTER (WHERE event_type = 'hazard' AND is_deleted = FALSE) AS hazard_count,
          COUNT(*) FILTER (WHERE event_type = 'accident' AND is_deleted = FALSE) AS accident_count,
          COUNT(*) FILTER (WHERE event_type = 'violation' AND is_deleted = FALSE) AS violation_count
        FROM hse_events
        WHERE DATE(occurred_at) BETWEEN $1 AND $2
      `, [startDate, endDate]),
      
      pool.query(`
        SELECT 
          COUNT(*) FILTER (WHERE is_deleted = FALSE) AS total_tasks,
          COUNT(*) FILTER (WHERE status = 'completed' AND is_deleted = FALSE) AS completed_tasks,
          COUNT(*) FILTER (WHERE is_overdue = TRUE AND is_deleted = FALSE) AS overdue_tasks,
          CASE 
            WHEN COUNT(*) FILTER (WHERE is_deleted = FALSE) > 0 
            THEN ROUND(COUNT(*) FILTER (WHERE status = 'completed' AND is_deleted = FALSE)::numeric / 
                 COUNT(*) FILTER (WHERE is_deleted = FALSE)::numeric * 100, 2)
            ELSE 0 
          END AS completion_rate
        FROM hse_tasks
        WHERE DATE(created_at) BETWEEN $1 AND $2
      `, [startDate, endDate]),
      
      pool.query(`
        SELECT 
          COUNT(*) FILTER (WHERE is_deleted = FALSE) AS total_risks,
          COUNT(*) FILTER (WHERE (level LIKE '%红%' OR level LIKE '%重大%') AND is_deleted = FALSE) AS high_risk_count,
          COUNT(*) FILTER (WHERE (level LIKE '%橙%' OR level LIKE '%较大%') AND is_deleted = FALSE) AS medium_risk_count,
          COUNT(*) FILTER (WHERE (level LIKE '%黄%' OR level LIKE '%蓝%') AND is_deleted = FALSE) AS low_risk_count
        FROM risk_sources
      `),
      
      pool.query(`
        SELECT 
          COUNT(*) FILTER (WHERE is_deleted = FALSE) AS total_rectifications,
          COUNT(*) FILTER (WHERE status = 'completed' AND is_deleted = FALSE) AS completed_rectifications,
          COUNT(*) FILTER (WHERE status = 'pending' AND is_deleted = FALSE) AS pending_rectifications,
          CASE 
            WHEN COUNT(*) FILTER (WHERE is_deleted = FALSE) > 0 
            THEN ROUND(COUNT(*) FILTER (WHERE status = 'completed' AND is_deleted = FALSE)::numeric / 
                 COUNT(*) FILTER (WHERE is_deleted = FALSE)::numeric * 100, 2)
            ELSE 0 
          END AS rectification_rate
        FROM hse_rectifications
        WHERE DATE(created_at) BETWEEN $1 AND $2
      `, [startDate, endDate]),
      
      pool.query(`
        SELECT COUNT(*) AS count
        FROM hse_tasks
        WHERE is_deleted = FALSE AND is_overdue = TRUE AND DATE(created_at) BETWEEN $1 AND $2
      `, [startDate, endDate])
    ]);

    return {
      report_type: 'monthly',
      report_period: period,
      date_range: { start: startDate, end: endDate },
      generated_at: dayjs().format('YYYY-MM-DD HH:mm:ss'),
      sections: {
        '安全总体情况': {
          title: '安全总体情况',
          summary: this.generateSummary(eventResult.rows[0], taskResult.rows[0], rectResult.rows[0])
        },
        '事故情况': {
          title: '事故情况',
          data: eventResult.rows[0],
          analysis: `本月共发生 ${eventResult.rows[0].accident_count} 起事故，${eventResult.rows[0].hazard_count} 起隐患。`
        },
        '隐患分析': {
          title: '隐患分析',
          total_hazards: eventResult.rows[0].hazard_count,
          analysis: '待深入分析'
        },
        '风险变化': {
          title: '风险变化',
          data: riskResult.rows[0],
          trend: '保持稳定'
        },
        '整改情况': {
          title: '整改情况',
          data: rectResult.rows[0],
          analysis: `本月整改完成率为 ${rectResult.rows[0].rectification_rate}%，${rectResult.rows[0].pending_rectifications} 项待整改。`
        },
        '重点关注问题': {
          title: '重点关注问题',
          overdue_tasks: focusResult.rows[0].count,
          issues: []
        },
        '改进建议': {
          title: '改进建议',
          suggestions: this.generateSuggestions(eventResult.rows[0], taskResult.rows[0], rectResult.rows[0])
        }
      }
    };
  }

  /**
   * 生成年报数据
   */
  async generateYearlyReport(year) {
    const [eventResult, taskResult, riskResult, rectResult, trendResult] = await Promise.all([
      pool.query(`
        SELECT 
          COUNT(*) FILTER (WHERE is_deleted = FALSE) AS total_events,
          COUNT(*) FILTER (WHERE event_type = 'hazard' AND is_deleted = FALSE) AS hazard_count,
          COUNT(*) FILTER (WHERE event_type = 'accident' AND is_deleted = FALSE) AS accident_count,
          COUNT(*) FILTER (WHERE event_type = 'violation' AND is_deleted = FALSE) AS violation_count
        FROM hse_events
        WHERE EXTRACT(YEAR FROM occurred_at) = $1
      `, [year]),
      
      pool.query(`
        SELECT 
          COUNT(*) FILTER (WHERE is_deleted = FALSE) AS total_tasks,
          COUNT(*) FILTER (WHERE status = 'completed' AND is_deleted = FALSE) AS completed_tasks,
          COUNT(*) FILTER (WHERE is_overdue = TRUE AND is_deleted = FALSE) AS overdue_tasks,
          CASE 
            WHEN COUNT(*) FILTER (WHERE is_deleted = FALSE) > 0 
            THEN ROUND(COUNT(*) FILTER (WHERE status = 'completed' AND is_deleted = FALSE)::numeric / 
                 COUNT(*) FILTER (WHERE is_deleted = FALSE)::numeric * 100, 2)
            ELSE 0 
          END AS completion_rate
        FROM hse_tasks
        WHERE EXTRACT(YEAR FROM created_at) = $1
      `, [year]),
      
      pool.query(`
        SELECT 
          COUNT(*) FILTER (WHERE is_deleted = FALSE) AS total_risks,
          COUNT(*) FILTER (WHERE (level LIKE '%红%' OR level LIKE '%重大%') AND is_deleted = FALSE) AS high_risk_count,
          COUNT(*) FILTER (WHERE (level LIKE '%橙%' OR level LIKE '%较大%') AND is_deleted = FALSE) AS medium_risk_count
        FROM risk_sources
      `),
      
      pool.query(`
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
        WHERE EXTRACT(YEAR FROM created_at) = $1
      `, [year]),
      
      pool.query(`
        SELECT 
          COUNT(*) FILTER (WHERE is_deleted = FALSE) AS last_year_events
        FROM hse_events
        WHERE EXTRACT(YEAR FROM occurred_at) = $1
      `, [year - 1])
    ]);

    return {
      report_type: 'yearly',
      report_period: year,
      generated_at: dayjs().format('YYYY-MM-DD HH:mm:ss'),
      sections: {
        '安全总体情况': {
          title: '安全总体情况',
          summary: this.generateSummary(eventResult.rows[0], taskResult.rows[0], rectResult.rows[0])
        },
        '事故情况': {
          title: '事故情况',
          data: eventResult.rows[0],
          yearly_trend: trendResult.rows[0].last_year_events > 0 
            ? Math.round(((eventResult.rows[0].total_events - trendResult.rows[0].last_year_events) / trendResult.rows[0].last_year_events) * 100)
            : 0
        },
        '隐患分析': {
          title: '隐患分析',
          data: {
            total_hazards: eventResult.rows[0].hazard_count,
            analysis: '年度隐患分析报告'
          }
        },
        '风险变化': {
          title: '风险变化',
          data: riskResult.rows[0],
          trend: '年度风险趋势'
        },
        '整改情况': {
          title: '整改情况',
          data: rectResult.rows[0]
        },
        '重点关注问题': {
          title: '重点关注问题',
          issues: []
        },
        '改进建议': {
          title: '改进建议',
          suggestions: this.generateSuggestions(eventResult.rows[0], taskResult.rows[0], rectResult.rows[0])
        },
        '年度总结': {
          title: '年度总结',
          content: `2026年度安全管理工作总结：全年共发生 ${eventResult.rows[0].total_events} 起安全事件，其中事故 ${eventResult.rows[0].accident_count} 起，隐患 ${eventResult.rows[0].hazard_count} 起。任务完成率 ${taskResult.rows[0].completion_rate}%，整改完成率 ${rectResult.rows[0].rectification_rate}%。整体安全形势保持稳定。`
        },
        '下年度计划': {
          title: '下年度计划',
          content: '1. 继续加强隐患排查治理工作\n2. 提高任务执行效率和质量\n3. 加强员工安全培训\n4. 完善风险管控体系'
        }
      }
    };
  }

  /**
   * 生成报告摘要
   */
  generateSummary(eventData, taskData, rectData) {
    const parts = [];
    
    if (eventData.total_events === 0) {
      parts.push('本周期安全状况良好，无安全事件发生。');
    } else {
      parts.push(`本周期共发生 ${eventData.total_events} 起安全事件（事故 ${eventData.accident_count} 起，隐患 ${eventData.hazard_count} 起）。`);
    }
    
    parts.push(`任务完成率 ${taskData.completion_rate}%（${taskData.completed_tasks}/${taskData.total_tasks}），${taskData.overdue_tasks} 项逾期。`);
    parts.push(`整改完成率 ${rectData.rectification_rate}%（${rectData.completed_rectifications}/${rectData.total_rectifications}）。`);
    
    return parts.join(' ');
  }

  /**
   * 生成改进建议
   */
  generateSuggestions(eventData, taskData, rectData) {
    const suggestions = [];
    
    if (eventData.accident_count > 0) {
      suggestions.push('加强事故原因分析，落实防范措施，防止同类事故再次发生。');
    }
    
    if (eventData.hazard_count > 5) {
      suggestions.push('加大隐患排查力度，及时消除安全隐患。');
    }
    
    if (taskData.completion_rate < 80) {
      suggestions.push('提高任务执行效率，确保各项安全任务按时完成。');
    }
    
    if (taskData.overdue_tasks > 0) {
      suggestions.push('加强逾期任务管控，及时跟进处理。');
    }
    
    if (rectData.rectification_rate < 90) {
      suggestions.push('加快整改进度，提高整改质量。');
    }
    
    if (suggestions.length === 0) {
      suggestions.push('继续保持良好的安全管理态势，持续改进。');
    }
    
    return suggestions;
  }

  /**
   * 生成HTML报告
   */
  generateHtmlReport(reportData, reportType) {
    const titleMap = {
      daily: '安全日报',
      weekly: '安全周报',
      monthly: '安全月报',
      yearly: '年度安全总结报告'
    };

    let html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${titleMap[reportType]} - ${reportData.report_period}</title>
  <style>
    body { font-family: "Microsoft YaHei", sans-serif; margin: 0; padding: 40px; background: #fff; }
    .header { text-align: center; margin-bottom: 40px; }
    .header h1 { font-size: 24px; color: #1a1a1a; margin: 0; }
    .header .subtitle { color: #666; margin-top: 8px; }
    .header .date { color: #999; font-size: 14px; margin-top: 4px; }
    .section { margin-bottom: 30px; }
    .section-title { font-size: 18px; font-weight: bold; color: #1890ff; border-bottom: 2px solid #1890ff; padding-bottom: 8px; margin-bottom: 15px; }
    .summary { font-size: 15px; line-height: 1.8; color: #333; margin-bottom: 20px; }
    .table { width: 100%; border-collapse: collapse; font-size: 14px; }
    .table th { background: #f5f5f5; padding: 10px; text-align: left; border: 1px solid #ddd; }
    .table td { padding: 10px; border: 1px solid #ddd; }
    .metric-card { display: inline-block; width: 23%; margin-right: 2%; padding: 15px; background: #f8f9fa; border-radius: 8px; text-align: center; }
    .metric-value { font-size: 28px; font-weight: bold; color: #1890ff; }
    .metric-label { font-size: 13px; color: #666; margin-top: 5px; }
    .suggestions { list-style: decimal; padding-left: 20px; }
    .suggestions li { margin-bottom: 10px; color: #333; line-height: 1.6; }
    .footer { text-align: center; margin-top: 50px; padding-top: 20px; border-top: 1px solid #ddd; color: #999; font-size: 13px; }
    .highlight { color: #ff4d4f; font-weight: bold; }
  </style>
</head>
<body>
  <div class="header">
    <h1>${titleMap[reportType]}</h1>
    <div class="subtitle">宁津县环境卫生服务中心</div>
    <div class="date">报告周期：${reportData.report_period} | 生成时间：${reportData.generated_at}</div>
  </div>
`;

    const sections = reportData.sections;
    for (const [key, section] of Object.entries(sections)) {
      html += `
  <div class="section">
    <div class="section-title">${section.title}</div>
`;

      if (section.summary) {
        html += `<div class="summary">${section.summary}</div>`;
      }

      if (section.data) {
        html += `
    <table class="table">
      <thead>
        <tr>`;
        for (const field of Object.keys(section.data)) {
          const label = this.getFieldLabel(field);
          html += `<th>${label}</th>`;
        }
        html += `</tr>
      </thead>
      <tbody>
        <tr>`;
        for (const value of Object.values(section.data)) {
          html += `<td>${value}</td>`;
        }
        html += `</tr>
      </tbody>
    </table>
`;
      }

      if (section.suggestions) {
        html += `
    <ul class="suggestions">`;
        for (const suggestion of section.suggestions) {
          html += `<li>${suggestion}</li>`;
        }
        html += `</ul>`;
      }

      if (section.content) {
        html += `<div class="summary">${section.content.replace(/\n/g, '<br>')}</div>`;
      }

      html += `
  </div>`;
    }

    html += `
  <div class="footer">
    HSE安全管理系统自动生成 | 宁津县环境卫生服务中心
  </div>
</body>
</html>`;

    return html;
  }

  /**
   * 获取字段中文标签
   */
  getFieldLabel(field) {
    const labels = {
      total_events: '事件总数',
      hazard_count: '隐患数',
      accident_count: '事故数',
      violation_count: '三违数',
      total_tasks: '任务总数',
      completed_tasks: '已完成',
      overdue_tasks: '逾期数',
      completion_rate: '完成率(%)',
      total_risks: '风险总数',
      high_risk_count: '高风险',
      medium_risk_count: '中风险',
      low_risk_count: '低风险',
      total_rectifications: '整改总数',
      completed_rectifications: '已完成整改',
      pending_rectifications: '待整改',
      rectification_rate: '整改率(%)'
    };
    return labels[field] || field;
  }

  /**
   * 查询历史报告
   */
  async getReportHistory(params) {
    const { reportType, page = 1, pageSize = 20 } = params;
    
    let query = `SELECT id, report_name, report_type, report_period, report_date, status, created_at 
                 FROM hse_reports`;
    const queryParams = [];
    let paramIndex = 1;

    if (reportType) {
      query += ` WHERE report_type = $${paramIndex++}`;
      queryParams.push(reportType);
    }

    query += ` ORDER BY report_date DESC, created_at DESC`;
    query += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    queryParams.push(pageSize, (page - 1) * pageSize);

    const result = await pool.query(query, queryParams);

    const countResult = await pool.query(
      `SELECT COUNT(*) AS total FROM hse_reports ${reportType ? 'WHERE report_type = $1' : ''}`,
      reportType ? [reportType] : []
    );

    return {
      list: result.rows,
      total: parseInt(countResult.rows[0].total),
      page,
      pageSize
    };
  }

  /**
   * 获取报告详情
   */
  async getReportById(id) {
    const result = await pool.query(
      `SELECT * FROM hse_reports WHERE id = $1`,
      [id]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const report = result.rows[0];
    if (typeof report.report_data === 'string') {
      report.report_data = JSON.parse(report.report_data);
    }
    return report;
  }

  /**
   * 删除报告（软删除）
   */
  async deleteReport(id) {
    const result = await pool.query(
      `UPDATE hse_reports SET report_status = 'deleted' WHERE id = $1 AND report_status = 'active' RETURNING id`,
      [id]
    );
    return result.rows.length > 0;
  }

  // ============================================================
  // V2 汇报中心方法（Sprint3 新增）
  // ============================================================

  /**
   * 获取模板列表
   */
  async getTemplates(category) {
    let query = `SELECT id, template_name, report_type, template_category, ai_enabled, status, content_config
                 FROM hse_report_templates WHERE status = 'active'`;
    const params = [];
    if (category) {
      params.push(category);
      query += ` AND template_category = $${params.length}`;
    }
    query += ` ORDER BY id ASC`;
    const result = await pool.query(query, params);
    return result.rows.map(row => ({
      id: row.id,
      templateName: row.template_name,
      reportType: row.report_type,
      templateCategory: row.template_category,
      aiEnabled: row.ai_enabled,
      status: row.status,
      contentConfig: row.content_config
    }));
  }

  /**
   * 获取模板详情
   */
  async getTemplateById(id) {
    const result = await pool.query(
      `SELECT * FROM hse_report_templates WHERE id = $1`,
      [id]
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      id: row.id,
      templateName: row.template_name,
      reportType: row.report_type,
      templateCategory: row.template_category,
      aiEnabled: row.ai_enabled,
      promptTemplate: row.prompt_template,
      dataSources: row.data_sources,
      sectionConfig: row.section_config,
      contentConfig: row.content_config,
      status: row.status
    };
  }

  /**
   * 触发报告生成 V2（异步，立即返回 reportId）
   */
  async generateReportV2(params) {
    const {
      templateId,
      templateCategory,
      reportPeriod,
      reportScope = {},
      aiEnabled = false,
      customTitle,
      generatedBy
    } = params;

    const reportName = customTitle || this._getDefaultReportName(templateCategory, reportPeriod);
    const reportDate = this._getReportDate(templateCategory, reportPeriod);
    const tsSuffix = (Date.now() % 10000).toString().padStart(4, '0');
    const storageReportPeriod = `${reportPeriod}-${tsSuffix}`;

    const insertResult = await pool.query(
      `INSERT INTO hse_reports
        (report_name, report_type, report_period, report_date, report_data, report_html,
         generated_by, status, template_id, template_category, report_scope,
         generation_status, ai_status, confirm_status, source_data_ref, report_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'generated', $8, $9, $10, 'pending',
         CASE WHEN $11 THEN 'pending' ELSE 'none' END, 'unconfirmed', $12, 'active')
       RETURNING id`,
      [
        reportName,
        this._categoryToReportType(templateCategory),
        storageReportPeriod,
        reportDate,
        JSON.stringify({}),
        '',
        generatedBy || null,
        templateId || null,
        templateCategory,
        JSON.stringify(reportScope),
        aiEnabled,
        JSON.stringify({ statisticsPeriod: reportPeriod })
      ]
    );

    const reportId = insertResult.rows[0].id;

    setImmediate(() => {
      this._doGenerateV2(reportId, templateCategory, reportPeriod, reportScope, aiEnabled)
        .catch(err => {
          logger.error(`Report V2 generation failed for id=${reportId}`, { error: err.message });
          pool.query(
            `UPDATE hse_reports SET generation_status = 'failed', error_message = $1 WHERE id = $2`,
            [err.message, reportId]
          ).catch(e => logger.error('Failed to update failed status', { error: e.message }));
        });
    });

    return { reportId, generationStatus: 'pending', estimatedSeconds: aiEnabled ? 30 : 10 };
  }

  /**
   * 内部：执行报告生成 V2
   */
  async _doGenerateV2(reportId, templateCategory, reportPeriod, reportScope, aiEnabled) {
    await pool.query(`UPDATE hse_reports SET generation_status = 'collecting' WHERE id = $1`, [reportId]);

    const statisticsData = await this._collectStatistics(reportPeriod, templateCategory);

    let referencedDocs = [];
    try {
      referencedDocs = await this._findReferencedDocuments(templateCategory);
    } catch (e) {
      logger.warn('Failed to find referenced documents', { error: e.message });
    }

    const sourceDataRef = {
      statisticsPeriod: reportPeriod,
      referencedDocuments: referencedDocs.map(d => ({
        fileId: d.file_id,
        fileName: d.file_name,
        aiAnalysisId: d.ai_analysis_id,
        aiSummaryExcerpt: d.ai_summary_excerpt
      })),
      eventCount: statisticsData.events?.totalEvents ?? 0,
      hazardCount: statisticsData.events?.hazardCount ?? 0,
      accidentCount: statisticsData.events?.accidentCount ?? 0,
      taskCompletionRate: statisticsData.tasks?.completionRate ?? 0,
      rectificationRate: statisticsData.rectifications?.rectificationRate ?? 0
    };

    await pool.query(
      `UPDATE hse_reports SET source_data_ref = $1 WHERE id = $2`,
      [JSON.stringify(sourceDataRef), reportId]
    );

    let aiSummary = null;
    let aiSuggestions = null;
    let aiStatus = 'none';

    if (aiEnabled && aiService.isAvailable()) {
      await pool.query(
        `UPDATE hse_reports SET generation_status = 'ai_generating', ai_status = 'processing' WHERE id = $1`,
        [reportId]
      );
      aiStatus = 'processing';

      try {
        const aiResult = await this._generateAiContent(
          templateCategory, reportPeriod, reportScope, statisticsData, referencedDocs
        );
        aiSummary = aiResult.summary;
        aiSuggestions = aiResult.suggestions;
        aiStatus = 'completed';
      } catch (err) {
        logger.error(`AI generation failed for report ${reportId}`, { error: err.message });
        aiStatus = 'failed';
        await pool.query(
          `UPDATE hse_reports SET error_message = $1 WHERE id = $2`,
          [`AI生成失败: ${err.message}`, reportId]
        );
      }
    } else if (aiEnabled && !aiService.isAvailable()) {
      aiStatus = 'failed';
      logger.warn(`AI not available, skipping AI for report ${reportId}`);
    }

    const reportData = this._buildReportData(templateCategory, reportPeriod, statisticsData, aiSummary, aiSuggestions);
    const reportHtml = this._generateV2Html(templateCategory, reportPeriod, reportData);

    await pool.query(
      `UPDATE hse_reports
       SET report_data = $1, report_html = $2, generation_status = 'completed',
           ai_status = $3, ai_summary = $4, ai_suggestions = $5
       WHERE id = $6`,
      [
        JSON.stringify(reportData),
        reportHtml,
        aiStatus,
        aiSummary,
        aiSuggestions ? JSON.stringify(aiSuggestions) : null,
        reportId
      ]
    );

    logger.info(`Report V2 generated: id=${reportId}, category=${templateCategory}, aiStatus=${aiStatus}`);
  }

  /**
   * 内部：采集统计数据
   */
  async _collectStatistics(period, templateCategory) {
    const [year, month] = period.split('-');
    const startDate = `${year}-${month || '01'}-01`;
    const endDate = month
      ? dayjs(startDate).endOf('month').format('YYYY-MM-DD')
      : dayjs(startDate).endOf('year').format('YYYY-MM-DD');

    const [eventResult, taskResult, riskResult, rectResult, trainingResult] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE is_deleted = FALSE) AS total_events,
          COUNT(*) FILTER (WHERE event_type = 'hazard' AND is_deleted = FALSE) AS hazard_count,
          COUNT(*) FILTER (WHERE event_type = 'accident' AND is_deleted = FALSE) AS accident_count,
          COUNT(*) FILTER (WHERE event_type = 'violation' AND is_deleted = FALSE) AS violation_count
        FROM hse_events
        WHERE DATE(occurred_at) BETWEEN $1 AND $2
      `, [startDate, endDate]),

      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE is_deleted = FALSE) AS total_tasks,
          COUNT(*) FILTER (WHERE status = 'completed' AND is_deleted = FALSE) AS completed_tasks,
          COUNT(*) FILTER (WHERE is_overdue = TRUE AND is_deleted = FALSE) AS overdue_tasks,
          CASE
            WHEN COUNT(*) FILTER (WHERE is_deleted = FALSE) > 0
            THEN ROUND(COUNT(*) FILTER (WHERE status = 'completed' AND is_deleted = FALSE)::numeric /
                 COUNT(*) FILTER (WHERE is_deleted = FALSE)::numeric * 100, 2)
            ELSE 0
          END AS completion_rate
        FROM hse_tasks
        WHERE DATE(created_at) BETWEEN $1 AND $2
      `, [startDate, endDate]),

      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE is_deleted = FALSE) AS total_risks,
          COUNT(*) FILTER (WHERE (level LIKE '%红%' OR level LIKE '%重大%') AND is_deleted = FALSE) AS high_risk_count,
          COUNT(*) FILTER (WHERE (level LIKE '%橙%' OR level LIKE '%较大%') AND is_deleted = FALSE) AS medium_risk_count,
          COUNT(*) FILTER (WHERE (level LIKE '%黄%' OR level LIKE '%蓝%') AND is_deleted = FALSE) AS low_risk_count
        FROM risk_sources
      `),

      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE is_deleted = FALSE) AS total_rectifications,
          COUNT(*) FILTER (WHERE status = 'completed' AND is_deleted = FALSE) AS completed_rectifications,
          COUNT(*) FILTER (WHERE status = 'pending' AND is_deleted = FALSE) AS pending_rectifications,
          CASE
            WHEN COUNT(*) FILTER (WHERE is_deleted = FALSE) > 0
            THEN ROUND(COUNT(*) FILTER (WHERE status = 'completed' AND is_deleted = FALSE)::numeric /
                 COUNT(*) FILTER (WHERE is_deleted = FALSE)::numeric * 100, 2)
            ELSE 0
          END AS rectification_rate
        FROM hse_rectifications
        WHERE DATE(created_at) BETWEEN $1 AND $2
      `, [startDate, endDate]),

      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE is_deleted = FALSE) AS total_trainings,
          COUNT(*) FILTER (WHERE status = 'completed' AND is_deleted = FALSE) AS completed_trainings,
          SUM(COALESCE(trainee_count, 0)) FILTER (WHERE is_deleted = FALSE) AS total_trainees
        FROM hse_trainings
        WHERE DATE(training_date) BETWEEN $1 AND $2
      `, [startDate, endDate]).catch(() => ({ rows: [{ total_trainings: 0, completed_trainings: 0, total_trainees: 0 }] }))
    ]);

    return {
      events: {
        totalEvents: parseInt(eventResult.rows[0].total_events),
        hazardCount: parseInt(eventResult.rows[0].hazard_count),
        accidentCount: parseInt(eventResult.rows[0].accident_count),
        violationCount: parseInt(eventResult.rows[0].violation_count)
      },
      tasks: {
        totalTasks: parseInt(taskResult.rows[0].total_tasks),
        completedTasks: parseInt(taskResult.rows[0].completed_tasks),
        overdueTasks: parseInt(taskResult.rows[0].overdue_tasks),
        completionRate: parseFloat(taskResult.rows[0].completion_rate)
      },
      risks: {
        totalRisks: parseInt(riskResult.rows[0].total_risks),
        highRiskCount: parseInt(riskResult.rows[0].high_risk_count),
        mediumRiskCount: parseInt(riskResult.rows[0].medium_risk_count),
        lowRiskCount: parseInt(riskResult.rows[0].low_risk_count)
      },
      rectifications: {
        totalRectifications: parseInt(rectResult.rows[0].total_rectifications),
        completedRectifications: parseInt(rectResult.rows[0].completed_rectifications),
        pendingRectifications: parseInt(rectResult.rows[0].pending_rectifications),
        rectificationRate: parseFloat(rectResult.rows[0].rectification_rate)
      },
      trainings: {
        totalTrainings: parseInt(trainingResult.rows[0].total_trainings),
        completedTrainings: parseInt(trainingResult.rows[0].completed_trainings),
        totalTrainees: parseInt(trainingResult.rows[0].total_trainees)
      }
    };
  }

  /**
   * 内部：查找相关制度文件（从资料中心 + AI 分析结果）
   */
  async _findReferencedDocuments(templateCategory) {
    const keywords = this._categoryToKeywords(templateCategory);
    if (keywords.length === 0) return [];

    const likeConditions = keywords.map((_, i) => `df.original_name ILIKE $${i + 1}`).join(' OR ');
    const params = keywords.map(k => `%${k}%`);

    const result = await pool.query(`
      SELECT
        df.id AS file_id,
        df.original_name AS file_name,
        daa.id AS ai_analysis_id,
        LEFT(daa.ai_summary, 150) AS ai_summary_excerpt
      FROM document_files df
      LEFT JOIN document_ai_analysis daa ON df.latest_ai_analysis_id = daa.id
      WHERE (${likeConditions})
        AND df.is_deleted = FALSE
        AND daa.status = 'completed'
      ORDER BY df.created_at DESC
      LIMIT 5
    `, params);

    return result.rows;
  }

  /**
   * 内部：调用 AI 生成内容
   */
  async _generateAiContent(templateCategory, period, scope, statisticsData, referencedDocs) {
    const promptParams = {
      period,
      scope: scope?.department || '全部',
      statisticsData,
      referencedDocuments: referencedDocs
    };

    let prompt;
    if (templateCategory === 'monthly_report') {
      prompt = aiService.buildMonthlyReportPrompt(promptParams);
    } else if (templateCategory === 'group_report') {
      prompt = aiService.buildGroupReportPrompt(promptParams);
    } else {
      throw new Error(`Unsupported template category for AI: ${templateCategory}`);
    }

    const response = await aiService.chat(prompt);
    const content = response.content || response;
    const parsed = this._parseAiJsonResponse(content, templateCategory);
    return parsed;
  }

  /**
   * 内部：解析 AI JSON 响应
   */
  _parseAiJsonResponse(content, templateCategory) {
    let jsonStr = content;
    const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1];
    }

    const firstBrace = jsonStr.indexOf('{');
    const lastBrace = jsonStr.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
    }

    try {
      const obj = JSON.parse(jsonStr);
      if (templateCategory === 'monthly_report') {
        return {
          summary: obj.summary || '暂无数据',
          keyIndicatorsText: obj.keyIndicatorsText || obj.key_indicators_text || '暂无数据',
          problems: Array.isArray(obj.problems) ? obj.problems : [],
          suggestions: Array.isArray(obj.suggestions) ? obj.suggestions : [],
          nextPlan: obj.nextPlan || obj.next_plan || '暂无数据'
        };
      } else if (templateCategory === 'group_report') {
        return {
          summary: obj.executiveSummary || obj.executive_summary || '暂无数据',
          highlights: Array.isArray(obj.highlights) ? obj.highlights : [],
          problems: Array.isArray(obj.problems) ? obj.problems : [],
          suggestions: Array.isArray(obj.actionPlan) ? obj.actionPlan : (Array.isArray(obj.action_plan) ? obj.action_plan : [])
        };
      }
      return { summary: '暂无数据', suggestions: [] };
    } catch (e) {
      logger.warn('Failed to parse AI JSON response, using fallback', { error: e.message });
      return {
        summary: content.substring(0, 500),
        suggestions: []
      };
    }
  }

  /**
   * 内部：构建报告数据对象
   */
  _buildReportData(templateCategory, period, statisticsData, aiSummary, aiSuggestions) {
    return {
      templateCategory,
      period,
      generatedAt: new Date().toISOString(),
      statistics: statisticsData,
      ai: {
        summary: aiSummary,
        suggestions: aiSuggestions || []
      }
    };
  }

  /**
   * 内部：生成 V2 报告 HTML
   */
  _generateV2Html(templateCategory, period, reportData) {
    const stats = reportData.statistics;
    const ai = reportData.ai;
    const title = this._getDefaultReportName(templateCategory, period);

    const sections = [];

    sections.push(`<div class="report-section">
      <h2>一、${templateCategory === 'group_report' ? '工作总体情况' : '本月安全工作概述'}</h2>
      <p>${ai?.summary || '暂无数据'}</p>
    </div>`);

    sections.push(`<div class="report-section">
      <h2>二、安全指标完成情况</h2>
      <table class="report-table">
        <thead><tr><th>指标</th><th>数值</th><th>指标</th><th>数值</th></tr></thead>
        <tbody>
          <tr><td>安全事件总数</td><td>${stats.events.totalEvents}</td>
              <td>其中：隐患</td><td>${stats.events.hazardCount}</td></tr>
          <tr><td>事故数</td><td>${stats.events.accidentCount}</td>
              <td>违章数</td><td>${stats.events.violationCount}</td></tr>
          <tr><td>任务总数</td><td>${stats.tasks.totalTasks}</td>
              <td>任务完成率</td><td>${stats.tasks.completionRate}%</td></tr>
          <tr><td>隐患整改率</td><td>${stats.rectifications.rectificationRate}%</td>
              <td>培训场次</td><td>${stats.trainings.totalTrainings}</td></tr>
          <tr><td>风险源总数</td><td>${stats.risks.totalRisks}</td>
              <td>重大风险</td><td>${stats.risks.highRiskCount}</td></tr>
        </tbody>
      </table>
    </div>`);

    sections.push(`<div class="report-section">
      <h2>三、重点工作回顾</h2>
      <ul>
        <li>隐患排查治理：本月发现隐患 ${stats.events.hazardCount} 项，整改完成率 ${stats.rectifications.rectificationRate}%</li>
        <li>安全教育培训：本月开展培训 ${stats.trainings.totalTrainings} 场次，参训 ${stats.trainings.totalTrainees} 人次</li>
        <li>任务管理：本月任务完成率 ${stats.tasks.completionRate}%，逾期 ${stats.tasks.overdueTasks} 项</li>
        <li>风险管理：现有风险源 ${stats.risks.totalRisks} 个，其中重大风险 ${stats.risks.highRiskCount} 个</li>
      </ul>
    </div>`);

    if (ai?.suggestions && ai.suggestions.length > 0) {
      const sectionTitle = templateCategory === 'group_report' ? '四、存在的问题与不足' : '四、存在的主要问题';
      sections.push(`<div class="report-section">
        <h2>${sectionTitle}</h2>
        <ul>${ai.suggestions.map(s => `<li>${s}</li>`).join('')}</ul>
      </div>`);
    }

    if (templateCategory === 'group_report') {
      sections.push(`<div class="report-section">
        <h2>五、下一步工作计划</h2>
        <p>持续加强安全生产管理，落实各项安全制度，强化隐患排查治理，提升全员安全意识。</p>
      </div>`);
    } else {
      sections.push(`<div class="report-section">
        <h2>五、下月工作计划</h2>
        <p>持续推进安全生产各项工作，重点加强隐患整改跟踪和安全教育培训。</p>
      </div>`);
    }

    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>${title}</title>
<style>
  body { font-family: "Microsoft YaHei", "SimSun", sans-serif; margin: 40px; line-height: 1.8; color: #333; }
  h1 { text-align: center; font-size: 24px; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 10px; }
  .report-section { margin-bottom: 24px; }
  h2 { font-size: 18px; color: #1a1a1a; border-left: 4px solid #1890ff; padding-left: 10px; margin-top: 20px; }
  p { text-indent: 2em; margin: 8px 0; }
  ul { margin: 8px 0; padding-left: 2em; }
  li { margin: 4px 0; }
  .report-table { width: 100%; border-collapse: collapse; margin: 12px 0; }
  .report-table th, .report-table td { border: 1px solid #ddd; padding: 8px 12px; text-align: center; }
  .report-table th { background: #f5f5f5; font-weight: 600; }
  .report-footer { margin-top: 40px; text-align: right; color: #666; font-size: 12px; }
  .ai-notice { background: #fffbe6; border: 1px solid #ffe58f; padding: 10px; margin: 16px 0; font-size: 12px; color: #8c6d1f; }
  @media print {
    body { margin: 20px; }
    .ai-notice { display: none; }
  }
</style>
</head>
<body>
<h1>${title}</h1>
${ai?.summary ? '<div class="ai-notice">⚠️ 本报告部分内容由AI辅助生成，仅供参考，请以实际数据为准。</div>' : ''}
${sections.join('\n')}
<div class="report-footer">
  生成时间：${new Date().toLocaleString('zh-CN')}<br>
  环卫企业安全生产管理系统
</div>
</body>
</html>`;

    return html;
  }

  /**
   * 获取报告生成状态
   */
  async getReportStatus(id) {
    const result = await pool.query(
      `SELECT id, generation_status, ai_status, confirm_status, error_message
       FROM hse_reports WHERE id = $1`,
      [id]
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    const statusMap = {
      pending: { progress: 5, step: '等待生成' },
      collecting: { progress: 40, step: '数据采集中...' },
      ai_generating: { progress: 70, step: 'AI 分析生成中...' },
      completed: { progress: 100, step: '报告生成完成' },
      failed: { progress: 100, step: '生成失败' }
    };
    const status = statusMap[row.generation_status] || { progress: 0, step: '未知' };
    return {
      reportId: row.id,
      generationStatus: row.generation_status,
      aiStatus: row.ai_status,
      confirmStatus: row.confirm_status,
      progress: status.progress,
      currentStep: status.step,
      errorMessage: row.error_message
    };
  }

  /**
   * V2 报告列表
   */
  async getReportListV2(params) {
    const { category, page = 1, pageSize = 20, keyword, status, confirmStatus } = params;
    const offset = (page - 1) * pageSize;
    const conditions = [`report_status = 'active'`];
    const values = [];

    if (category) {
      values.push(category);
      conditions.push(`template_category = $${values.length}`);
    }
    if (keyword) {
      values.push(`%${keyword}%`);
      conditions.push(`report_name ILIKE $${values.length}`);
    }
    if (status) {
      values.push(status);
      conditions.push(`generation_status = $${values.length}`);
    }
    if (confirmStatus) {
      values.push(confirmStatus);
      conditions.push(`confirm_status = $${values.length}`);
    }

    const whereSql = conditions.join(' AND ');

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM hse_reports WHERE ${whereSql}`,
      values
    );
    const total = parseInt(countResult.rows[0].count);

    const listResult = await pool.query(
      `SELECT id, report_name, report_type, report_period, report_date,
              template_category, generation_status, ai_status, confirm_status,
              created_at, generated_by, source_data_ref
       FROM hse_reports
       WHERE ${whereSql}
       ORDER BY created_at DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, pageSize, offset]
    );

    const list = listResult.rows.map(row => ({
      id: row.id,
      reportName: row.report_name,
      reportType: row.report_type,
      reportPeriod: row.source_data_ref?.statisticsPeriod || row.report_period,
      reportDate: row.report_date,
      templateCategory: row.template_category,
      generationStatus: row.generation_status,
      aiStatus: row.ai_status,
      confirmStatus: row.confirm_status,
      createdAt: row.created_at,
      generatedBy: row.generated_by
    }));

    return { list, total, page: parseInt(page), pageSize: parseInt(pageSize) };
  }

  /**
   * V2 获取报告详情
   */
  async getReportByIdV2(id) {
    const result = await pool.query(
      `SELECT * FROM hse_reports WHERE id = $1 AND report_status = 'active'`,
      [id]
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      id: row.id,
      reportName: row.report_name,
      reportType: row.report_type,
      reportPeriod: row.source_data_ref?.statisticsPeriod || row.report_period,
      reportDate: row.report_date,
      reportData: row.report_data,
      reportHtml: row.report_html,
      templateId: row.template_id,
      templateCategory: row.template_category,
      reportScope: row.report_scope,
      generationStatus: row.generation_status,
      aiStatus: row.ai_status,
      aiSummary: row.ai_summary,
      aiSuggestions: row.ai_suggestions,
      confirmStatus: row.confirm_status,
      confirmedBy: row.confirmed_by,
      confirmedAt: row.confirmed_at,
      sourceDataRef: row.source_data_ref,
      errorMessage: row.error_message,
      version: row.version,
      createdAt: row.created_at,
      reportStatus: row.report_status
    };
  }

  /**
   * 编辑报告内容
   */
  async updateReport(id, updates) {
    const sets = [];
    const values = [];
    let idx = 0;

    if (updates.reportName !== undefined) {
      values.push(updates.reportName);
      sets.push(`report_name = $${++idx}`);
    }
    if (updates.reportData !== undefined) {
      values.push(JSON.stringify(updates.reportData));
      sets.push(`report_data = $${++idx}`);
    }
    if (updates.reportHtml !== undefined) {
      values.push(updates.reportHtml);
      sets.push(`report_html = $${++idx}`);
    }
    if (updates.aiSummary !== undefined) {
      values.push(updates.aiSummary);
      sets.push(`ai_summary = $${++idx}`);
    }
    if (updates.aiSuggestions !== undefined) {
      values.push(JSON.stringify(updates.aiSuggestions));
      sets.push(`ai_suggestions = $${++idx}`);
    }

    if (sets.length === 0) return false;

    values.push(id);
    const result = await pool.query(
      `UPDATE hse_reports SET ${sets.join(', ')} WHERE id = $${idx + 1} RETURNING id`,
      values
    );
    return result.rows.length > 0;
  }

  /**
   * 确认/驳回报告
   */
  async confirmReport(id, action, confirmedBy, remark) {
    const validActions = ['confirmed', 'rejected'];
    if (!validActions.includes(action)) {
      throw new Error(`Invalid action: ${action}`);
    }
    const result = await pool.query(
      `UPDATE hse_reports
       SET confirm_status = $1, confirmed_by = $2, confirmed_at = NOW()
       WHERE id = $3 AND report_status = 'active'
       RETURNING id`,
      [action, confirmedBy || null, id]
    );
    return result.rows.length > 0;
  }

  /**
   * 重新生成报告（重跑 AI 或全量重跑）
   */
  async regenerateReport(id, regenerateAiOnly = false) {
    const report = await this.getReportByIdV2(id);
    if (!report) throw new Error('报告不存在');

    if (regenerateAiOnly && report.aiStatus === 'none') {
      throw new Error('该报告未启用 AI，无法单独重生成 AI');
    }

    if (regenerateAiOnly) {
      await pool.query(
        `UPDATE hse_reports SET ai_status = 'pending', generation_status = 'ai_generating' WHERE id = $1`,
        [id]
      );
      setImmediate(async () => {
        try {
          const stats = (report.reportData && report.reportData.statistics)
            ? report.reportData.statistics
            : await this._collectStatistics(report.reportPeriod, report.templateCategory);

          const sourceRef = report.sourceDataRef || {};
          const docs = (sourceRef.referencedDocuments || []).map(d => ({
            file_id: d.fileId,
            file_name: d.fileName,
            ai_analysis_id: d.aiAnalysisId,
            ai_summary_excerpt: d.aiSummaryExcerpt
          }));

          const aiResult = await this._generateAiContent(
            report.templateCategory, report.reportPeriod,
            report.reportScope || {}, stats, docs
          );

          const reportData = report.reportData || {};
          reportData.ai = { summary: aiResult.summary, suggestions: aiResult.suggestions };

          const newHtml = this._generateV2Html(
            report.templateCategory, report.reportPeriod, reportData
          );

          await pool.query(
            `UPDATE hse_reports
             SET ai_status = 'completed', ai_summary = $1, ai_suggestions = $2,
                 report_data = $3, report_html = $4, generation_status = 'completed'
             WHERE id = $5`,
            [
              aiResult.summary,
              JSON.stringify(aiResult.suggestions),
              JSON.stringify(reportData),
              newHtml,
              id
            ]
          );
        } catch (err) {
          logger.error(`Regenerate AI failed for report ${id}`, { error: err.message });
          await pool.query(
            `UPDATE hse_reports SET ai_status = 'failed', error_message = $1 WHERE id = $2`,
            [`AI重生成失败: ${err.message}`, id]
          );
        }
      });
      return { reportId: id, status: 'processing' };
    }

    return this.generateReportV2({
      templateId: report.templateId,
      templateCategory: report.templateCategory,
      reportPeriod: report.reportPeriod,
      reportScope: report.reportScope || {},
      aiEnabled: report.aiStatus !== 'none',
      customTitle: report.reportName,
      generatedBy: report.generatedBy
    });
  }

  /**
   * 归档报告
   */
  async archiveReport(id) {
    const result = await pool.query(
      `UPDATE hse_reports SET report_status = 'archived'
       WHERE id = $1 AND report_status = 'active'
       RETURNING id`,
      [id]
    );
    return result.rows.length > 0;
  }

  /**
   * 导出 HTML（用于打印）
   */
  async exportHtml(id) {
    const report = await this.getReportByIdV2(id);
    if (!report) return null;
    return {
      fileName: `${report.reportName}.html`,
      content: report.reportHtml || '',
      contentType: 'text/html; charset=utf-8'
    };
  }

  /**
   * 导出 Word（HTML格式的 .doc，Word 可直接打开）
   */
  async exportWord(id) {
    const report = await this.getReportByIdV2(id);
    if (!report) return null;

    const wordHtml = report.reportHtml || '';
    const wordHeader = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
xmlns:w="urn:schemas-microsoft-com:office:word"
xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="UTF-8">
<!--[if gte mso 9]>
<xml>
<w:WordDocument>
<w:View>Print</w:View>
<w:Zoom>100</w:Zoom>
</w:WordDocument>
</xml>
<![endif-->
<title>${report.reportName}</title>
</head>
<body>`;

    const wordFooter = `</body></html>`;

    const bodyMatch = wordHtml.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    const bodyContent = bodyMatch ? bodyMatch[1] : wordHtml;

    const fullContent = wordHeader + bodyContent + wordFooter;

    return {
      fileName: `${report.reportName}.doc`,
      content: fullContent,
      contentType: 'application/msword; charset=utf-8'
    };
  }

  /**
   * 生成安全生产标准化自评报告（Phase6 新增）
   *
   * 数据来源：standard_evaluation_items WHERE compliance_status != 'pending'
   * 禁止：直接读取 ai_verdict
   * 禁止：自动认证、自动生成达标结论
   *
   * @param {Object} params
   * @param {number} params.taskId - 评价任务 ID
   * @param {number} params.generatedBy - 生成人 ID
   * @param {string} [params.customTitle] - 自定义报告标题
   * @param {string} [params.enterpriseInfo] - 企业基本信息（JSON 字符串）
   */
  async generateSelfAssessmentReport(params) {
    const { taskId, generatedBy, customTitle, enterpriseInfo } = params;

    if (!taskId) {
      throw new Error('评价任务 ID 不能为空');
    }

    // 1. 查询评价任务
    const taskRes = await pool.query(
      `SELECT id, task_name, evaluation_period, current_round, total_clauses,
              created_at, started_at, completed_at
       FROM standard_evaluation_tasks
       WHERE id = $1 AND is_deleted = FALSE`,
      [taskId]
    );
    if (taskRes.rows.length === 0) {
      throw new Error('评价任务不存在');
    }
    const task = taskRes.rows[0];

    // 2. 查询自评模板
    const templateRes = await pool.query(
      `SELECT id FROM hse_report_templates
       WHERE template_category = 'self_assessment' AND status = 'active'
       LIMIT 1`
    );
    const templateId = templateRes.rows[0]?.id || null;

    // 3. 创建报告记录（pending 状态）
    const reportPeriod = task.evaluation_period || dayjs().format('YYYY-MM');
    const reportName = customTitle || `安全生产标准化自评报告 - ${task.task_name}`;
    const reportDate = task.completed_at || new Date();
    const tsSuffix = (Date.now() % 10000).toString().padStart(4, '0');
    const storageReportPeriod = `self-${taskId}-${tsSuffix}`;

    const insertResult = await pool.query(
      `INSERT INTO hse_reports
        (report_name, report_type, report_period, report_date, report_data, report_html,
         generated_by, status, template_id, template_category, report_scope,
         generation_status, ai_status, confirm_status, source_data_ref, report_status)
       VALUES ($1, 'monthly', $2, $3, $4, $5, $6, 'generated', $7, 'self_assessment', $8,
         'pending', 'none', 'unconfirmed', $9, 'active')
       RETURNING id`,
      [
        reportName,
        storageReportPeriod,
        reportDate,
        JSON.stringify({}),
        '',
        generatedBy || null,
        templateId,
        JSON.stringify({ taskId, taskName: task.task_name }),
        JSON.stringify({ taskId, statisticsPeriod: reportPeriod })
      ]
    );

    const reportId = insertResult.rows[0].id;

    // 4. 异步执行生成
    setImmediate(() => {
      this._doGenerateSelfAssessment(reportId, taskId, enterpriseInfo)
        .catch(err => {
          logger.error(`Self-assessment report generation failed for id=${reportId}`, { error: err.message });
          pool.query(
            `UPDATE hse_reports SET generation_status = 'failed', error_message = $1 WHERE id = $2`,
            [err.message, reportId]
          ).catch(e => logger.error('Failed to update failed status', { error: e.message }));
        });
    });

    return { reportId, generationStatus: 'pending', estimatedSeconds: 10 };
  }

  /**
   * 内部：执行自评报告生成
   * - 采集 standard_evaluation_items 中 compliance_status != 'pending' 的数据
   * - 禁止读取 ai_verdict
   */
  async _doGenerateSelfAssessment(reportId, taskId, enterpriseInfo) {
    await pool.query(
      `UPDATE hse_reports SET generation_status = 'collecting' WHERE id = $1`,
      [reportId]
    );

    // 1. 采集评价任务数据
    const selfAssessData = await this._collectSelfAssessmentData(taskId);

    // 2. 解析企业信息
    let enterprise = {};
    try {
      enterprise = enterpriseInfo ? JSON.parse(enterpriseInfo) : {};
    } catch {
      enterprise = {};
    }

    // 3. 构建报告数据
    const reportData = {
      templateCategory: 'self_assessment',
      taskId,
      generatedAt: new Date().toISOString(),
      enterprise,
      task: selfAssessData.task,
      statistics: selfAssessData.statistics,
      compliantItems: selfAssessData.compliantItems,
      missingItems: selfAssessData.missingItems,
      nonCompliantItems: selfAssessData.nonCompliantItems,
      partialItems: selfAssessData.partialItems,
      confirmationRecords: selfAssessData.confirmationRecords,
      ai: { summary: null, suggestions: [] }  // 自评报告不使用 AI
    };

    // 4. 生成 HTML
    const reportHtml = this._generateSelfAssessmentHtml(reportData);

    // 5. 更新报告记录
    await pool.query(
      `UPDATE hse_reports
       SET report_data = $1, report_html = $2, generation_status = 'completed',
           ai_status = 'none', source_data_ref = $3
       WHERE id = $4`,
      [
        JSON.stringify(reportData),
        reportHtml,
        JSON.stringify({
          taskId,
          statisticsPeriod: selfAssessData.task.evaluationPeriod,
          totalItems: selfAssessData.statistics.total,
          confirmedItems: selfAssessData.statistics.confirmed,
          pendingItems: selfAssessData.statistics.pending
        }),
        reportId
      ]
    );

    logger.info(`Self-assessment report generated: id=${reportId}, taskId=${taskId}`);
  }

  /**
   * 内部：采集自评数据
   * 关键约束：只读取 compliance_status != 'pending' 的记录，禁止读取 ai_verdict
   */
  async _collectSelfAssessmentData(taskId) {
    // 1. 评价任务信息
    const taskRes = await pool.query(
      `SELECT id, task_name, evaluation_period, current_round, total_clauses,
              created_at, started_at, completed_at
       FROM standard_evaluation_tasks
       WHERE id = $1 AND is_deleted = FALSE`,
      [taskId]
    );
    const task = taskRes.rows[0] || {};

    // 2. 统计：按 compliance_status 分组（排除 pending）
    //    注意：禁止使用 ai_verdict
    const statsRes = await pool.query(
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE compliance_status != 'pending') AS confirmed,
         COUNT(*) FILTER (WHERE compliance_status = 'pending') AS pending,
         COUNT(*) FILTER (WHERE compliance_status = 'compliant') AS compliant,
         COUNT(*) FILTER (WHERE compliance_status = 'partial') AS partial,
         COUNT(*) FILTER (WHERE compliance_status = 'non_compliant') AS non_compliant,
         COUNT(*) FILTER (WHERE compliance_status = 'missing') AS missing
       FROM standard_evaluation_items
       WHERE task_id = $1 AND is_deleted = FALSE`,
      [taskId]
    );
    const stats = statsRes.rows[0] || {};

    const statistics = {
      total: parseInt(stats.total || 0, 10),
      confirmed: parseInt(stats.confirmed || 0, 10),
      pending: parseInt(stats.pending || 0, 10),
      compliant: parseInt(stats.compliant || 0, 10),
      partial: parseInt(stats.partial || 0, 10),
      nonCompliant: parseInt(stats.non_compliant || 0, 10),
      missing: parseInt(stats.missing || 0, 10)
    };

    // 3. 读取已确认的条款明细（compliance_status != 'pending'）
    //    不读取 ai_verdict / ai_check_result 等 AI 字段
    const itemsRes = await pool.query(
      `SELECT id, clause_id, clause_code, clause_title, clause_content,
              compliance_status, manual_remark, checked_by, checked_at,
              matched_file_summary
       FROM standard_evaluation_items
       WHERE task_id = $1
         AND compliance_status != 'pending'
         AND is_deleted = FALSE
       ORDER BY clause_code`,
      [taskId]
    );

    const compliantItems = [];
    const partialItems = [];
    const nonCompliantItems = [];
    const missingItems = [];

    for (const row of itemsRes.rows) {
      const item = {
        clauseCode: row.clause_code,
        clauseTitle: row.clause_title,
        clauseContent: row.clause_content,
        complianceStatus: row.compliance_status,
        manualRemark: row.manual_remark || '',
        checkedBy: row.checked_by,
        checkedAt: row.checked_at,
        matchedFiles: row.matched_file_summary || []
      };

      if (row.compliance_status === 'compliant') compliantItems.push(item);
      else if (row.compliance_status === 'partial') partialItems.push(item);
      else if (row.compliance_status === 'non_compliant') nonCompliantItems.push(item);
      else if (row.compliance_status === 'missing') missingItems.push(item);
    }

    // 4. 人工确认记录
    const confirmationRecords = itemsRes.rows.map(row => ({
      clauseCode: row.clause_code,
      clauseTitle: row.clause_title,
      complianceStatus: row.compliance_status,
      checkedBy: row.checked_by,
      checkedAt: row.checked_at,
      manualRemark: row.manual_remark || ''
    }));

    return {
      task: {
        id: task.id,
        taskName: task.task_name,
        evaluationPeriod: task.evaluation_period,
        currentRound: task.current_round,
        totalClauses: task.total_clauses,
        createdAt: task.created_at,
        completedAt: task.completed_at
      },
      statistics,
      compliantItems,
      partialItems,
      nonCompliantItems,
      missingItems,
      confirmationRecords
    };
  }

  /**
   * 内部：生成自评报告 HTML
   * 包含 7 个章节：企业信息/任务信息/条款完成情况/符合项统计/缺项分析/整改建议/确认记录
   * 禁止：生成达标/不达标最终结论
   */
  _generateSelfAssessmentHtml(reportData) {
    const { enterprise, task, statistics, compliantItems, partialItems,
            nonCompliantItems, missingItems, confirmationRecords } = reportData;

    const title = `安全生产标准化自评报告`;
    const period = task.evaluationPeriod || '';
    const confirmedCount = statistics.confirmed || 0;
    const totalCount = statistics.total || 0;

    // 计算确认率（注意：这不是评分，仅反映确认进度）
    const confirmationRate = totalCount > 0
      ? Math.round(confirmedCount / totalCount * 100)
      : 0;

    const sections = [];

    // 一、企业安全管理基本信息
    sections.push(`<div class="report-section">
      <h2>一、企业安全管理基本信息</h2>
      <table class="report-table">
        <tbody>
          <tr><td class="label">企业名称</td><td>${enterprise.enterpriseName || '-'}</td>
              <td class="label">统一社会信用代码</td><td>${enterprise.creditCode || '-'}</td></tr>
          <tr><td class="label">行业类型</td><td>${enterprise.industryType || '环卫服务'}</td>
              <td class="label">评价周期</td><td>${period}</td></tr>
          <tr><td class="label">企业负责人</td><td>${enterprise.legalPerson || '-'}</td>
              <td class="label">安全负责人</td><td>${enterprise.safetyManager || '-'}</td></tr>
          <tr><td class="label">联系电话</td><td>${enterprise.contactPhone || '-'}</td>
              <td class="label">企业地址</td><td>${enterprise.address || '-'}</td></tr>
        </tbody>
      </table>
    </div>`);

    // 二、评价任务信息
    sections.push(`<div class="report-section">
      <h2>二、评价任务信息</h2>
      <table class="report-table">
        <tbody>
          <tr><td class="label">任务名称</td><td>${task.taskName || '-'}</td>
              <td class="label">评价轮次</td><td>第 ${(task.currentRound || 0)} 轮</td></tr>
          <tr><td class="label">条款总数</td><td>${task.totalClauses || 0} 条</td>
              <td class="label">任务创建时间</td><td>${task.createdAt ? new Date(task.createdAt).toLocaleString('zh-CN') : '-'}</td></tr>
          <tr><td class="label">任务完成时间</td><td>${task.completedAt ? new Date(task.completedAt).toLocaleString('zh-CN') : '-'}</td>
              <td class="label">人工确认进度</td><td>${confirmedCount}/${totalCount}（${confirmationRate}%）</td></tr>
        </tbody>
      </table>
    </div>`);

    // 三、标准条款完成情况
    sections.push(`<div class="report-section">
      <h2>三、标准条款完成情况</h2>
      <table class="report-table">
        <thead><tr><th>项目</th><th>数量</th><th>占比</th></tr></thead>
        <tbody>
          <tr><td>条款总数</td><td>${totalCount}</td><td>100%</td></tr>
          <tr><td>已人工确认</td><td>${confirmedCount}</td><td>${confirmationRate}%</td></tr>
          <tr><td>待人工确认（pending）</td><td>${statistics.pending || 0}</td><td>${totalCount > 0 ? Math.round((statistics.pending || 0) / totalCount * 100) : 0}%</td></tr>
        </tbody>
      </table>
      ${statistics.pending > 0 ? '<div class="warn-tip">⚠ 本报告仅包含人工确认后的评价结果，pending 条款未纳入统计。</div>' : ''}
    </div>`);

    // 四、符合项统计
    sections.push(`<div class="report-section">
      <h2>四、符合项统计</h2>
      <table class="report-table">
        <thead><tr><th>合规状态</th><th>数量</th><th>占已确认</th></tr></thead>
        <tbody>
          <tr class="row-compliant"><td>合规（compliant）</td><td>${statistics.compliant || 0}</td><td>${confirmedCount > 0 ? Math.round((statistics.compliant || 0) / confirmedCount * 100) : 0}%</td></tr>
          <tr class="row-partial"><td>部分合规（partial）</td><td>${statistics.partial || 0}</td><td>${confirmedCount > 0 ? Math.round((statistics.partial || 0) / confirmedCount * 100) : 0}%</td></tr>
          <tr class="row-non-compliant"><td>不合规（non_compliant）</td><td>${statistics.nonCompliant || 0}</td><td>${confirmedCount > 0 ? Math.round((statistics.nonCompliant || 0) / confirmedCount * 100) : 0}%</td></tr>
          <tr class="row-missing"><td>资料缺失（missing）</td><td>${statistics.missing || 0}</td><td>${confirmedCount > 0 ? Math.round((statistics.missing || 0) / confirmedCount * 100) : 0}%</td></tr>
        </tbody>
      </table>
    </div>`);

    // 五、缺项分析
    sections.push(`<div class="report-section">
      <h2>五、缺项分析</h2>
      ${missingItems.length > 0 ? `
        <p>共识别 <strong>${missingItems.length}</strong> 项资料缺失，需补充相关资料后重新评价：</p>
        <table class="report-table">
          <thead><tr><th width="12%">条款编号</th><th>条款名称</th><th width="15%">人工备注</th></tr></thead>
          <tbody>
            ${missingItems.map(item => `
              <tr>
                <td>${item.clauseCode}</td>
                <td>${item.clauseTitle || ''}</td>
                <td>${item.manualRemark || '-'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      ` : '<p>暂无资料缺项。</p>'}
    </div>`);

    // 六、整改建议
    const suggestionList = [];
    if (statistics.nonCompliant > 0) {
      suggestionList.push(`针对 ${statistics.nonCompliant} 项不合规条款，应制定专项整改方案，明确整改责任人和完成时限。`);
    }
    if (statistics.partial > 0) {
      suggestionList.push(`针对 ${statistics.partial} 项部分合规条款，应补充完善相关资料并持续改进。`);
    }
    if (statistics.missing > 0) {
      suggestionList.push(`针对 ${statistics.missing} 项资料缺失条款，应及时补充相关制度文件、记录或台账。`);
    }
    if (statistics.pending > 0) {
      suggestionList.push(`仍有 ${statistics.pending} 项条款待人工确认，建议尽快完成评价确认工作。`);
    }
    if (suggestionList.length === 0) {
      suggestionList.push('所有条款均已确认合规，建议持续保持安全生产标准化管理水平。');
    }

    sections.push(`<div class="report-section">
      <h2>六、整改建议</h2>
      <ul>${suggestionList.map(s => `<li>${s}</li>`).join('')}</ul>
      <div class="notice-tip">注：本部分为系统基于人工确认结果整理的建议清单，不构成达标/不达标结论。最终整改方案由企业自主确定。</div>
    </div>`);

    // 七、人工确认记录
    sections.push(`<div class="report-section">
      <h2>七、人工确认记录</h2>
      <p>本报告共记录 ${confirmationRecords.length} 条人工确认结果：</p>
      <table class="report-table">
        <thead><tr><th width="12%">条款编号</th><th>条款名称</th><th width="12%">合规状态</th><th width="15%">确认时间</th><th>人工备注</th></tr></thead>
        <tbody>
          ${confirmationRecords.slice(0, 100).map(r => `
            <tr>
              <td>${r.clauseCode}</td>
              <td>${r.clauseTitle || ''}</td>
              <td class="status-${r.complianceStatus}">${this._complianceStatusLabel(r.complianceStatus)}</td>
              <td>${r.checkedAt ? new Date(r.checkedAt).toLocaleString('zh-CN') : '-'}</td>
              <td>${r.manualRemark || '-'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      ${confirmationRecords.length > 100 ? `<p class="more-tip">（仅显示前 100 条，共 ${confirmationRecords.length} 条）</p>` : ''}
    </div>`);

    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>${title}</title>
<style>
  body { font-family: "Microsoft YaHei", "SimSun", sans-serif; margin: 40px; line-height: 1.8; color: #333; }
  h1 { text-align: center; font-size: 24px; margin-bottom: 10px; border-bottom: 2px solid #333; padding-bottom: 10px; }
  .subtitle { text-align: center; color: #666; font-size: 14px; margin-bottom: 30px; }
  .report-section { margin-bottom: 24px; page-break-inside: avoid; }
  h2 { font-size: 18px; color: #1a1a1a; border-left: 4px solid #1890ff; padding-left: 10px; margin-top: 20px; }
  p { text-indent: 2em; margin: 8px 0; }
  ul { margin: 8px 0; padding-left: 2em; }
  li { margin: 4px 0; }
  .report-table { width: 100%; border-collapse: collapse; margin: 12px 0; }
  .report-table th, .report-table td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
  .report-table th { background: #f5f5f5; font-weight: 600; text-align: center; }
  .report-table td.label { background: #fafafa; font-weight: 600; width: 15%; }
  .report-table td.status-compliant { color: #52c41a; font-weight: 600; }
  .report-table td.status-partial { color: #faad14; font-weight: 600; }
  .report-table td.status-non_compliant { color: #f5222d; font-weight: 600; }
  .report-table td.status-missing { color: #8c8c8c; font-weight: 600; }
  .report-table tr.row-compliant td { color: #52c41a; }
  .report-table tr.row-partial td { color: #faad14; }
  .report-table tr.row-non-compliant td { color: #f5222d; }
  .report-table tr.row-missing td { color: #8c8c8c; }
  .warn-tip { background: #fffbe6; border: 1px solid #ffe58f; padding: 8px 12px; margin: 12px 0; font-size: 13px; color: #8c6d1f; }
  .notice-tip { background: #e6f7ff; border: 1px solid #91d5ff; padding: 8px 12px; margin: 12px 0; font-size: 13px; color: #096dd9; }
  .more-tip { color: #999; font-size: 12px; text-align: center; }
  .report-footer { margin-top: 40px; text-align: right; color: #666; font-size: 12px; }
  .ai-notice { background: #fffbe6; border: 1px solid #ffe58f; padding: 10px; margin: 16px 0; font-size: 12px; color: #8c6d1f; }
  @media print {
    body { margin: 20px; }
    .report-section { page-break-inside: avoid; }
  }
</style>
</head>
<body>
<h1>${title}</h1>
<div class="subtitle">评价周期：${period} ｜ 生成时间：${new Date().toLocaleString('zh-CN')}</div>
<div class="ai-notice">⚠️ 本报告基于人工确认后的评价结果生成，数据来源为 standard_evaluation_items（compliance_status != 'pending'），未读取 AI 判定结果。本报告不构成达标/不达标最终结论，仅供企业内部管理参考。</div>
${sections.join('\n')}
<div class="report-footer">
  生成人：系统管理员<br>
  生成时间：${new Date().toLocaleString('zh-CN')}<br>
  环卫企业安全生产管理系统
</div>
</body>
</html>`;

    return html;
  }

  /**
   * 内部：compliance_status 中文标签
   */
  _complianceStatusLabel(status) {
    const map = {
      compliant: '合规',
      partial: '部分合规',
      non_compliant: '不合规',
      missing: '资料缺失',
      pending: '待确认'
    };
    return map[status] || status;
  }

  /**
   * 内部：默认报告名称
   */
  _getDefaultReportName(templateCategory, period) {
    const names = {
      monthly_report: `安全生产月报 - ${period}`,
      group_report: `安全工作汇报材料 - ${period}`,
      statistical: `统计报表 - ${period}`,
      self_assessment: `安全生产标准化自评报告 - ${period}`
    };
    return names[templateCategory] || `安全报告 - ${period}`;
  }

  /**
   * 内部：报告日期
   */
  _getReportDate(templateCategory, period) {
    if (period.length === 7) {
      return dayjs(period + '-01').toDate();
    }
    if (period.length === 4) {
      return dayjs(period + '-01-01').toDate();
    }
    return dayjs().toDate();
  }

  /**
   * 内部：分类到报告类型映射
   */
  _categoryToReportType(templateCategory) {
    const map = {
      monthly_report: 'monthly',
      group_report: 'monthly',
      statistical: 'monthly',
      self_assessment: 'monthly'
    };
    return map[templateCategory] || 'monthly';
  }

  /**
   * 内部：分类到关键词映射（用于资料检索）
   */
  _categoryToKeywords(templateCategory) {
    const keywordMap = {
      monthly_report: ['安全生产', '安全管理', '隐患', '责任制', '培训'],
      group_report: ['安全生产', '安全管理', '责任制', '隐患排查', '应急'],
      self_assessment: []  // 自评报告不基于关键词检索资料
    };
    return keywordMap[templateCategory] || [];
  }
}

module.exports = new ReportService();
