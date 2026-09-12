/**
 * 告警管理路由 (alerts.js)
 * 对应前端 api/modules/alert.ts
 *
 * 功能：
 * - 分页查询告警列表（从 hazards 表查询）
 * - 告警统计
 * - 告警详情
 * - 处理/解决告警（集成 WebSocket 实时推送）
 * - 导出告警
 */

const express = require('express');
const router = express.Router();
const { success, error } = require('../middleware/response');
const { pool, isConnected } = require('../config/db');
const { broadcastAlertUpdate, broadcastAlertResolve } = require('../services/wsServer');

/**
 * GET /alerts
 * 分页查询告警列表（从 hazards 表）
 */
router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.max(1, Math.min(100, parseInt(req.query.pageSize) || 10));
    const { level, status, keyword, startDate, endDate } = req.query;
    const offset = (page - 1) * pageSize;

    if (!isConnected()) {
      return res.json(success({ list: [], total: 0 }, '获取告警列表成功(内存模式)'));
    }

    const conditions = [];
    const params = [];
    let paramIdx = 1;

    if (level) {
      const levelMap = { critical: '严重', warning: '警告', info: '提示' };
      conditions.push(`level = $${paramIdx++}`);
      params.push(levelMap[level] || level);
    }
    if (status) {
      const statusMap = { new: '待处理', processing: '处理中', resolved: '已关闭' };
      conditions.push(`status = $${paramIdx++}`);
      params.push(statusMap[status] || status);
    }
    if (keyword) {
      conditions.push(`(title ILIKE $${paramIdx++} OR description ILIKE $${paramIdx++})`);
      params.push(`%${keyword}%`, `%${keyword}%`);
    }
    if (startDate) {
      conditions.push(`created_at >= $${paramIdx++}`);
      params.push(startDate);
    }
    if (endDate) {
      conditions.push(`created_at <= $${paramIdx++}`);
      params.push(endDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [countResult, dataResult] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS total FROM hazards ${whereClause}`, params),
      pool.query(
        `SELECT id, title, description, level, status, location, created_at, updated_at, resolved_at
         FROM hazards
         ${whereClause}
         ORDER BY created_at DESC
         LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
        [...params, pageSize, offset]
      )
    ]);

    const list = dataResult.rows.map(row => ({
      id: row.id,
      title: row.title,
      description: row.description,
      level: mapLevelToCode(row.level),
      status: mapStatusToCode(row.status),
      source: '系统',
      sourceId: String(row.id),
      location: row.location,
      occurredAt: row.created_at,
      resolvedAt: row.resolved_at,
    }));

    res.json(success({ list, total: countResult.rows[0]?.total || 0 }, '获取告警列表成功'));
  } catch (err) {
    console.error('[Alerts] 查询失败:', err.message);
    res.json(success({ list: [], total: 0 }, '获取告警列表成功'));
  }
});

/**
 * GET /alerts/stats
 * 告警统计
 */
router.get('/stats', async (req, res, next) => {
  try {
    if (!isConnected()) {
      return res.json(success({
        totalCount: 0, unreadCount: 0, criticalCount: 0,
        warningCount: 0, infoCount: 0, processingCount: 0, resolvedCount: 0,
      }, '获取告警统计成功'));
    }

    const result = await pool.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = '待处理')::int AS pending,
        COUNT(*) FILTER (WHERE status = '处理中')::int AS processing,
        COUNT(*) FILTER (WHERE status = '已关闭')::int AS resolved,
        COUNT(*) FILTER (WHERE level = '严重')::int AS critical,
        COUNT(*) FILTER (WHERE level = '警告')::int AS warning,
        COUNT(*) FILTER (WHERE level = '提示')::int AS info
      FROM hazards
    `);

    const row = result.rows[0] || {};
    res.json(success({
      totalCount: row.total || 0,
      unreadCount: row.pending || 0,
      criticalCount: row.critical || 0,
      warningCount: row.warning || 0,
      infoCount: row.info || 0,
      processingCount: row.processing || 0,
      resolvedCount: row.resolved || 0,
    }, '获取告警统计成功'));
  } catch (err) {
    console.error('[Alerts] 统计失败:', err.message);
    res.json(success({
      totalCount: 0, unreadCount: 0, criticalCount: 0,
      warningCount: 0, infoCount: 0, processingCount: 0, resolvedCount: 0,
    }, '获取告警统计成功'));
  }
});

/**
 * GET /alerts/statistics
 * 告警统计（适配前端 AlertStatistics 接口）
 */
router.get('/statistics', async (req, res, next) => {
  try {
    if (!isConnected()) {
      return res.json(success({
        total_alerts: 0, pending_count: 0, processing_count: 0, resolved_count: 0, closed_count: 0,
        critical_count: 0, high_count: 0, medium_count: 0, low_count: 0,
        today_count: 0, week_count: 0, month_count: 0,
        avg_response_time: 0, avg_resolve_time: 0,
      }, '获取告警统计成功'));
    }

    const result = await pool.query(`
      SELECT
        COUNT(*)::int AS total_alerts,
        COUNT(*) FILTER (WHERE status = '待处理')::int AS pending_count,
        COUNT(*) FILTER (WHERE status = '处理中')::int AS processing_count,
        COUNT(*) FILTER (WHERE status = '已关闭')::int AS resolved_count,
        COUNT(*) FILTER (WHERE status = '已关闭')::int AS closed_count,
        COUNT(*) FILTER (WHERE level = '严重')::int AS critical_count,
        COUNT(*) FILTER (WHERE level = '警告')::int AS high_count,
        COUNT(*) FILTER (WHERE level = '提示')::int AS medium_count,
        COUNT(*) FILTER (WHERE level NOT IN ('严重', '警告', '提示'))::int AS low_count,
        COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE)::int AS today_count,
        COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '7 days')::int AS week_count,
        COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '30 days')::int AS month_count
      FROM hazards
    `);

    const row = result.rows[0] || {};
    res.json(success({
      total_alerts: row.total_alerts || 0,
      pending_count: row.pending_count || 0,
      processing_count: row.processing_count || 0,
      resolved_count: row.resolved_count || 0,
      closed_count: row.closed_count || 0,
      critical_count: row.critical_count || 0,
      high_count: row.high_count || 0,
      medium_count: row.medium_count || 0,
      low_count: row.low_count || 0,
      today_count: row.today_count || 0,
      week_count: row.week_count || 0,
      month_count: row.month_count || 0,
      avg_response_time: 0,
      avg_resolve_time: 0,
    }, '获取告警统计成功'));
  } catch (err) {
    console.error('[Alerts /statistics] 统计失败:', err.message);
    res.json(success({
      total_alerts: 0, pending_count: 0, processing_count: 0, resolved_count: 0, closed_count: 0,
      critical_count: 0, high_count: 0, medium_count: 0, low_count: 0,
      today_count: 0, week_count: 0, month_count: 0,
      avg_response_time: 0, avg_resolve_time: 0,
    }, '获取告警统计成功'));
  }
});

/**
 * GET /alerts/trend
 * 告警趋势（适配前端 AlertTrendData[] 接口）
 */
router.get('/trend', async (req, res, next) => {
  try {
    const days = Math.max(1, Math.min(30, parseInt(req.query.days) || 7));

    if (!isConnected()) {
      return res.json(success([], '获取告警趋势成功'));
    }

    const result = await pool.query(`
      SELECT
        DATE(created_at) AS date,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE level = '严重')::int AS critical,
        COUNT(*) FILTER (WHERE level = '警告')::int AS high,
        COUNT(*) FILTER (WHERE level = '提示')::int AS medium,
        COUNT(*) FILTER (WHERE level NOT IN ('严重', '警告', '提示'))::int AS low
      FROM hazards
      WHERE created_at >= CURRENT_DATE - INTERVAL '${days} days'
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `);

    const rowsMap = {};
    result.rows.forEach(row => { rowsMap[row.date] = row; });

    const trend = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const row = rowsMap[dateStr] || {};
      trend.push({
        date: dateStr,
        total: row.total || 0,
        critical: row.critical || 0,
        high: row.high || 0,
        medium: row.medium || 0,
        low: row.low || 0,
      });
    }

    res.json(success(trend, '获取告警趋势成功'));
  } catch (err) {
    console.error('[Alerts /trend] 趋势查询失败:', err.message);
    res.json(success([], '获取告警趋势成功'));
  }
});

/**
 * GET /alerts/export
 * 导出告警（CSV）
 */
router.get('/export', async (req, res, next) => {
  try {
    const { level, status, keyword } = req.query;

    if (!isConnected()) {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="alerts.csv"');
      return res.send('标题,描述,级别,状态,位置,创建时间\n');
    }

    const conditions = [];
    const params = [];
    let paramIdx = 1;

    if (level) {
      const levelMap = { critical: '严重', warning: '警告', info: '提示' };
      conditions.push(`level = $${paramIdx++}`);
      params.push(levelMap[level] || level);
    }
    if (status) {
      const statusMap = { new: '待处理', processing: '处理中', resolved: '已关闭' };
      conditions.push(`status = $${paramIdx++}`);
      params.push(statusMap[status] || status);
    }
    if (keyword) {
      conditions.push(`(title ILIKE $${paramIdx++} OR description ILIKE $${paramIdx++})`);
      params.push(`%${keyword}%`, `%${keyword}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT title, description, level, status, location, created_at FROM hazards ${whereClause} ORDER BY created_at DESC LIMIT 1000`,
      params
    );

    const headers = '标题,描述,级别,状态,位置,创建时间\n';
    const rows = result.rows.map(r =>
      `"${r.title || ''}","${r.description || ''}","${r.level || ''}","${r.status || ''}","${r.location || ''}","${r.created_at || ''}"`
    ).join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="alerts.csv"');
    res.send('\uFEFF' + headers + rows);
  } catch (err) {
    console.error('[Alerts] 导出失败:', err.message);
    res.status(500).json(error(500, '导出失败'));
  }
});

/**
 * GET /alerts/:id
 * 单个告警详情
 */
router.get('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);

    if (!isConnected()) {
      return res.json(success({}, '获取告警详情成功(内存模式)'));
    }

    const result = await pool.query(
      'SELECT id, title, description, level, status, location, created_at, updated_at, resolved_at FROM hazards WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json(error(404, '告警不存在'));
    }

    const row = result.rows[0];
    res.json(success({
      id: row.id,
      title: row.title,
      description: row.description,
      level: mapLevelToCode(row.level),
      status: mapStatusToCode(row.status),
      source: '系统',
      sourceId: String(row.id),
      location: row.location,
      occurredAt: row.created_at,
      resolvedAt: row.resolved_at,
    }, '获取告警详情成功'));
  } catch (err) {
    console.error('[Alerts] 详情查询失败:', err.message);
    res.status(500).json(error(500, '获取告警详情失败'));
  }
});

/**
 * POST /alerts/:id/process
 * 处理告警
 */
router.post('/:id/process', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const { remark } = req.body;

    if (!isConnected()) {
      return res.json(success(null, '告警处理成功(内存模式)'));
    }

    const result = await pool.query(
      'UPDATE hazards SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, title, level, status',
      ['处理中', id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json(error(404, '告警不存在'));
    }

    // 通过 WebSocket 推送状态更新
    broadcastAlertUpdate(id, { status: 'processing', handlerRemark: remark });

    res.json(success({
      id: result.rows[0].id,
      status: 'processing',
    }, '告警处理成功'));
  } catch (err) {
    console.error('[Alerts] 处理失败:', err.message);
    res.status(500).json(error(500, '告警处理失败'));
  }
});

/**
 * POST /alerts/:id/resolve
 * 解决告警
 */
router.post('/:id/resolve', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const { remark } = req.body;

    if (!isConnected()) {
      return res.json(success(null, '告警已解决(内存模式)'));
    }

    const result = await pool.query(
      'UPDATE hazards SET status = $1, resolved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, title, level, status',
      ['已关闭', id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json(error(404, '告警不存在'));
    }

    // 通过 WebSocket 推送解决状态
    broadcastAlertResolve(id);

    res.json(success({
      id: result.rows[0].id,
      status: 'resolved',
    }, '告警已解决'));
  } catch (err) {
    console.error('[Alerts] 解决失败:', err.message);
    res.status(500).json(error(500, '告警解决失败'));
  }
});

// ============================================================
//  辅助函数：数据库中文值 ↔ 前端 code 映射
// ============================================================

function mapLevelToCode(level) {
  const map = { '严重': 'critical', '警告': 'warning', '提示': 'info' };
  return map[level] || 'info';
}

function mapStatusToCode(status) {
  const map = { '待处理': 'new', '处理中': 'processing', '已关闭': 'resolved', '已整改': 'resolved', '已验收': 'resolved' };
  return map[status] || 'new';
}

module.exports = router;
