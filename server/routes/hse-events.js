/**
 * HSE 事件中心路由
 * 
 * 功能：
 * - 事件列表查询
 * - 事件详情查询
 * - 事件统计接口
 * 
 * 支持查询维度：
 * - 时间范围
 * - 事件类型
 * - 部门
 * - 严重等级
 * - 状态
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { success, error } = require('../middleware/response');
const { logger } = require('../middleware/requestLogger');
const hseEventSync = require('../services/hseEventSyncService');

/**
 * 获取事件列表
 * GET /api/hse/events
 * 
 * Query params:
 * - event_type: 事件类型
 * - severity: 严重等级
 * - status: 状态
 * - department_id: 部门ID
 * - personnel_id: 人员ID
 * - vehicle_id: 车辆ID
 * - risk_source_id: 风险源ID
 * - start_date: 开始日期
 * - end_date: 结束日期
 * - page: 页码
 * - page_size: 每页数量
 */
router.get('/', async (req, res) => {
  try {
    const {
      event_type,
      severity,
      status,
      department_id,
      personnel_id,
      vehicle_id,
      risk_source_id,
      start_date,
      end_date,
      page = 1,
      page_size = 20
    } = req.query;
    
    // 构建查询条件
    const conditions = ['is_deleted = FALSE'];
    const params = [];
    let paramIndex = 1;
    
    if (event_type) {
      conditions.push(`event_type = $${paramIndex++}`);
      params.push(event_type);
    }
    
    if (severity) {
      conditions.push(`severity = $${paramIndex++}`);
      params.push(severity);
    }
    
    if (status) {
      conditions.push(`status = $${paramIndex++}`);
      params.push(status);
    }
    
    if (department_id) {
      conditions.push(`department_id = $${paramIndex++}`);
      params.push(department_id);
    }
    
    if (personnel_id) {
      conditions.push(`personnel_id = $${paramIndex++}`);
      params.push(personnel_id);
    }
    
    if (vehicle_id) {
      conditions.push(`vehicle_id = $${paramIndex++}`);
      params.push(vehicle_id);
    }
    
    if (risk_source_id) {
      conditions.push(`risk_source_id = $${paramIndex++}`);
      params.push(risk_source_id);
    }
    
    if (start_date) {
      conditions.push(`occurred_at >= $${paramIndex++}`);
      params.push(start_date);
    }
    
    if (end_date) {
      conditions.push(`occurred_at <= $${paramIndex++}`);
      params.push(end_date);
    }
    
    const whereClause = conditions.join(' AND ');
    
    // 查询总数
    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM hse_events WHERE ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].total);
    
    // 分页查询
    const offset = (parseInt(page) - 1) * parseInt(page_size);
    const limit = parseInt(page_size);
    
    const dataResult = await pool.query(
      `SELECT 
        id, event_code, event_type, source_table, source_id,
        title, severity, status, occurred_at,
        department_id, personnel_id, vehicle_id, risk_source_id,
        parent_event_id, created_at, updated_at
       FROM hse_events 
       WHERE ${whereClause}
       ORDER BY occurred_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    );
    
    res.json(success({
      list: dataResult.rows,
      pagination: {
        page: parseInt(page),
        page_size: limit,
        total,
        total_pages: Math.ceil(total / limit)
      }
    }));
    
  } catch (err) {
    logger.error('Failed to get hse events', { error: err.message });
    res.status(500).json(error(err.message));
  }
});

/**
 * 获取事件详情
 * GET /api/hse/events/:id
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      `SELECT 
        id, event_code, event_type, source_table, source_id,
        title, severity, status, occurred_at,
        department_id, personnel_id, vehicle_id, risk_source_id,
        parent_event_id, created_at, updated_at
       FROM hse_events 
       WHERE id = $1 AND is_deleted = FALSE`,
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json(error('事件不存在'));
    }
    
    const event = result.rows[0];
    
    // 查询源数据
    let sourceData = null;
    if (event.source_table && event.source_id) {
      try {
        const sourceResult = await pool.query(
          `SELECT * FROM ${event.source_table} WHERE id = $1 AND is_deleted = FALSE`,
          [event.source_id]
        );
        sourceData = sourceResult.rows[0] || null;
      } catch (e) {
        logger.warn('Failed to get source data', { sourceTable: event.source_table, sourceId: event.source_id });
      }
    }
    
    // 查询时间线
    const timelineResult = await pool.query(
      `SELECT id, action, actor_id, actor_name, from_status, to_status, comment, occurred_at
       FROM hse_event_timeline 
       WHERE event_id = $1 
       ORDER BY occurred_at ASC`,
      [id]
    );
    
    // 查询关联事件
    const linksResult = await pool.query(
      `SELECT id, from_event_id, to_event_id, link_type, description
       FROM hse_event_links 
       WHERE from_event_id = $1 OR to_event_id = $1`,
      [id]
    );
    
    res.json(success({
      ...event,
      source_data: sourceData,
      timeline: timelineResult.rows,
      links: linksResult.rows
    }));
    
  } catch (err) {
    logger.error('Failed to get hse event detail', { id: req.params.id, error: err.message });
    res.status(500).json(error(err.message));
  }
});

/**
 * 获取事件统计
 * GET /api/hse/events/stats
 */
router.get('/stats', async (req, res) => {
  try {
    const {
      start_date,
      end_date,
      group_by = 'event_type'
    } = req.query;
    
    const conditions = ['is_deleted = FALSE'];
    const params = [];
    let paramIndex = 1;
    
    if (start_date) {
      conditions.push(`occurred_at >= $${paramIndex++}`);
      params.push(start_date);
    }
    
    if (end_date) {
      conditions.push(`occurred_at <= $${paramIndex++}`);
      params.push(end_date);
    }
    
    const whereClause = conditions.join(' AND ');
    
    // 按事件类型统计
    const byTypeResult = await pool.query(
      `SELECT event_type, COUNT(*) as count, 
              COUNT(*) FILTER (WHERE status = 'open') as open_count,
              COUNT(*) FILTER (WHERE status = 'closed') as closed_count
       FROM hse_events 
       WHERE ${whereClause}
       GROUP BY event_type 
       ORDER BY count DESC`,
      params
    );
    
    // 按严重等级统计
    const bySeverityResult = await pool.query(
      `SELECT severity, COUNT(*) as count
       FROM hse_events 
       WHERE ${whereClause}
       GROUP BY severity 
       ORDER BY 
         CASE severity 
           WHEN 'critical' THEN 1 
           WHEN 'major' THEN 2 
           WHEN 'minor' THEN 3 
           ELSE 4 
         END`,
      params
    );
    
    // 按状态统计
    const byStatusResult = await pool.query(
      `SELECT status, COUNT(*) as count
       FROM hse_events 
       WHERE ${whereClause}
       GROUP BY status`,
      params
    );
    
    // 按日期统计（最近30天）
    const dailyResult = await pool.query(
      `SELECT DATE(occurred_at) as date, 
              COUNT(*) as count,
              COUNT(*) FILTER (WHERE event_type = 'hazard') as hazards,
              COUNT(*) FILTER (WHERE event_type = 'accident') as accidents
       FROM hse_events 
       WHERE ${whereClause}
         AND occurred_at >= NOW() - INTERVAL '30 days'
       GROUP BY DATE(occurred_at)
       ORDER BY date DESC`,
      params
    );
    
    // 总数
    const totalResult = await pool.query(
      `SELECT COUNT(*) as total,
              COUNT(*) FILTER (WHERE status = 'open') as open,
              COUNT(*) FILTER (WHERE status = 'processing') as processing,
              COUNT(*) FILTER (WHERE status = 'resolved') as resolved,
              COUNT(*) FILTER (WHERE status = 'closed') as closed
       FROM hse_events 
       WHERE ${whereClause}`,
      params
    );
    
    res.json(success({
      total: totalResult.rows[0],
      by_type: byTypeResult.rows,
      by_severity: bySeverityResult.rows,
      by_status: byStatusResult.rows,
      daily_trend: dailyResult.rows
    }));
    
  } catch (err) {
    logger.error('Failed to get hse events stats', { error: err.message });
    res.status(500).json(error(err.message));
  }
});

/**
 * 同步事件（手动触发）
 * POST /api/hse/events/sync
 * 
 * Body:
 * - type: hazard | accident
 * - source_id: 源记录ID
 */
router.post('/sync', async (req, res) => {
  try {
    const { type, source_id } = req.body;
    
    if (!type || !source_id) {
      return res.status(400).json(error('缺少必要参数：type, source_id'));
    }
    
    const event = await hseEventSync.sync(type, source_id);
    
    res.json(success(event, '事件同步成功'));
    
  } catch (err) {
    logger.error('Failed to sync hse event', { error: err.message });
    res.status(500).json(error(err.message));
  }
});

/**
 * 批量同步
 * POST /api/hse/events/batch-sync
 */
router.post('/batch-sync', async (req, res) => {
  try {
    const { type = 'all', limit = 100 } = req.body;
    
    const results = {};
    
    if (type === 'all' || type === 'hazards') {
      results.hazards = await hseEventSync.batchSyncHazards(limit);
    }
    
    if (type === 'all' || type === 'accidents') {
      results.accidents = await hseEventSync.batchSyncAccidents(limit);
    }
    
    res.json(success(results, '批量同步完成'));
    
  } catch (err) {
    logger.error('Failed to batch sync hse events', { error: err.message });
    res.status(500).json(error(err.message));
  }
});

/**
 * 创建事件时间线记录
 * POST /api/hse/events/:id/timeline
 */
router.post('/:id/timeline', async (req, res) => {
  try {
    const { id } = req.params;
    const { action, actor_id, actor_name, from_status, to_status, comment } = req.body;
    
    if (!action) {
      return res.status(400).json(error('缺少必要参数：action'));
    }
    
    // 创建时间线记录
    const timelineResult = await pool.query(
      `INSERT INTO hse_event_timeline (event_id, action, actor_id, actor_name, from_status, to_status, comment)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [id, action, actor_id, actor_name, from_status, to_status, comment]
    );
    
    // 更新事件状态
    if (to_status) {
      await pool.query(
        `UPDATE hse_events SET status = $1, updated_at = NOW() WHERE id = $2`,
        [to_status, id]
      );
    }
    
    res.json(success(timelineResult.rows[0], '时间线记录创建成功'));
    
  } catch (err) {
    logger.error('Failed to create event timeline', { id: req.params.id, error: err.message });
    res.status(500).json(error(err.message));
  }
});

/**
 * 创建事件关联
 * POST /api/hse/events/:id/link
 */
router.post('/:id/link', async (req, res) => {
  try {
    const { id } = req.params;
    const { target_event_id, link_type, description } = req.body;
    
    if (!target_event_id || !link_type) {
      return res.status(400).json(error('缺少必要参数：target_event_id, link_type'));
    }
    
    const result = await pool.query(
      `INSERT INTO hse_event_links (from_event_id, to_event_id, link_type, description)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [id, target_event_id, link_type, description]
    );
    
    res.json(success(result.rows[0], '事件关联创建成功'));
    
  } catch (err) {
    logger.error('Failed to create event link', { id: req.params.id, error: err.message });
    res.status(500).json(error(err.message));
  }
});

module.exports = router;