/**
 * HSE 闭环追踪路由
 * 
 * 功能：
 * - 获取事件完整闭环链路
 * - 建立事件关联关系
 * - 查询闭环视图
 * 
 * 闭环链路：
 * 风险对象 → 危险因素 → 控制措施 → 检查计划 → 隐患 → 整改 → 复查
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { success, error } = require('../middleware/response');
const { logger } = require('../middleware/requestLogger');

/**
 * 获取事件完整闭环链路
 * GET /api/hse/chain/:eventId
 * 
 * 返回从当前事件向上追溯的完整链路：
 * 事故 → 隐患 → 检查计划 → 控制措施 → 危险因素 → 风险对象
 * 
 * 以及向下延伸的链路：
 * 当前事件 → 整改 → 复查 → 培训需求
 */
router.get('/:eventId', async (req, res) => {
  try {
    const { eventId } = req.params;
    
    // 查询当前事件
    const eventResult = await pool.query(
      `SELECT 
        id, event_code, event_type, title, severity, status,
        occurred_at, source_table, source_id,
        risk_source_id, parent_event_id, department_id,
        business_area, risk_level_snapshot, created_at
       FROM hse_events 
       WHERE id = $1 AND is_deleted = FALSE`,
      [eventId]
    );
    
    if (eventResult.rows.length === 0) {
      return res.status(404).json(error('事件不存在'));
    }
    
    const event = eventResult.rows[0];
    
    // 查询向上追溯链路（父事件链）
    const upstreamResult = await pool.query(`
      WITH recursive upstream AS (
        SELECT 
          e.id, e.event_code, e.event_type, e.title, e.severity, e.status,
          e.occurred_at, e.source_table, e.source_id, e.parent_event_id,
          e.risk_source_id, e.department_id,
          0 AS depth
        FROM hse_events e
        WHERE e.id = $1
        
        UNION ALL
        
        SELECT 
          e.id, e.event_code, e.event_type, e.title, e.severity, e.status,
          e.occurred_at, e.source_table, e.source_id, e.parent_event_id,
          e.risk_source_id, e.department_id,
          u.depth + 1 AS depth
        FROM hse_events e
        JOIN upstream u ON e.id = u.parent_event_id
        WHERE e.is_deleted = FALSE
      )
      SELECT * FROM upstream ORDER BY depth DESC
    `, [eventId]);
    
    // 查询向下延伸链路（子事件链）
    const downstreamResult = await pool.query(`
      WITH recursive downstream AS (
        SELECT 
          e.id, e.event_code, e.event_type, e.title, e.severity, e.status,
          e.occurred_at, e.source_table, e.source_id, e.parent_event_id,
          e.risk_source_id, e.department_id,
          0 AS depth
        FROM hse_events e
        WHERE e.id = $1
        
        UNION ALL
        
        SELECT 
          e.id, e.event_code, e.event_type, e.title, e.severity, e.status,
          e.occurred_at, e.source_table, e.source_id, e.parent_event_id,
          e.risk_source_id, e.department_id,
          d.depth + 1 AS depth
        FROM hse_events e
        JOIN downstream d ON e.parent_event_id = d.id
        WHERE e.is_deleted = FALSE
      )
      SELECT * FROM downstream ORDER BY depth ASC
    `, [eventId]);
    
    // 查询风险源信息
    let riskSourceInfo = null;
    if (event.risk_source_id) {
      const rsResult = await pool.query(
        `SELECT id, source_id AS source_code, name, level, location, type 
         FROM risk_sources WHERE id = $1 AND is_deleted = FALSE`,
        [event.risk_source_id]
      );
      riskSourceInfo = rsResult.rows[0] || null;
    }
    
    // 查询危险因素
    let riskFactors = [];
    if (event.risk_source_id) {
      const rfResult = await pool.query(
        `SELECT id, factor_code, name, category, risk_level, risk_object_id
         FROM hse_risk_factors WHERE risk_source_id = $1 AND is_deleted = FALSE`,
        [event.risk_source_id]
      );
      riskFactors = rfResult.rows;
    }
    
    // 查询控制措施
    const factorIds = riskFactors.map(f => f.id);
    let controlMeasures = [];
    if (factorIds.length > 0) {
      const cmResult = await pool.query(
        `SELECT id, measure_code, name, type, risk_factor_id, inspection_plan_id,
                responsible_person_id, responsible_person_name, department_id
         FROM hse_control_measures 
         WHERE risk_factor_id = ANY($1) AND is_deleted = FALSE`,
        [factorIds]
      );
      controlMeasures = cmResult.rows;
    }
    
    // 查询检查计划
    const planIds = controlMeasures.map(m => m.inspection_plan_id).filter(Boolean);
    let inspectionPlans = [];
    if (planIds.length > 0) {
      const ipResult = await pool.query(
        `SELECT id, plan_code, plan_name, risk_source_id, department_id, 
                cycle_type, start_date, end_date, status
         FROM hse_inspection_plans WHERE id = ANY($1) AND is_deleted = FALSE`,
        [planIds]
      );
      inspectionPlans = ipResult.rows;
    }
    
    // 查询风险对象
    const objectIds = riskFactors.map(f => f.risk_object_id).filter(Boolean);
    let riskObjects = [];
    if (objectIds.length > 0) {
      const roResult = await pool.query(
        `SELECT id, object_name, object_type, department_id, location, risk_level
         FROM hse_risk_objects WHERE id = ANY($1) AND is_deleted = FALSE`,
        [objectIds]
      );
      riskObjects = roResult.rows;
    }
    
    // 查询整改记录
    let rectifications = [];
    if (event.source_table === 'hazards') {
      const rectResult = await pool.query(
        `SELECT id, rect_code, measure, status, deadline, responsible_person_name,
                department_id, started_at, completed_at, is_overdue
         FROM hse_rectifications WHERE hazard_id = $1 AND is_deleted = FALSE`,
        [event.source_id]
      );
      rectifications = rectResult.rows;
    }
    
    // 查询复查记录
    const rectIds = rectifications.map(r => r.id);
    let reviews = [];
    if (rectIds.length > 0) {
      const revResult = await pool.query(
        `SELECT id, review_code, result, score, comment, review_date,
                reviewer_name, is_recurred, new_hazard_id
         FROM hse_reviews WHERE rectification_id = ANY($1) AND is_deleted = FALSE`,
        [rectIds]
      );
      reviews = revResult.rows;
    }
    
    // 查询部门信息
    let departmentInfo = null;
    if (event.department_id) {
      const deptResult = await pool.query(
        `SELECT id, name, short_name, parent_id FROM departments WHERE id = $1`,
        [event.department_id]
      );
      departmentInfo = deptResult.rows[0] || null;
    }
    
    // 查询事件关联关系
    const linksResult = await pool.query(
      `SELECT id, from_event_id, to_event_id, link_type, description
       FROM hse_event_links WHERE from_event_id = $1 OR to_event_id = $1`,
      [eventId]
    );
    
    res.json(success({
      current_event: event,
      upstream_chain: upstreamResult.rows,
      downstream_chain: downstreamResult.rows.slice(1),
      risk_source: riskSourceInfo,
      risk_factors: riskFactors,
      control_measures: controlMeasures,
      inspection_plans: inspectionPlans,
      risk_objects: riskObjects,
      rectifications: rectifications,
      reviews: reviews,
      department: departmentInfo,
      links: linksResult.rows,
      chain_summary: {
        total_nodes: upstreamResult.rows.length + downstreamResult.rows.length - 1,
        risk_source_id: event.risk_source_id,
        risk_level: riskSourceInfo?.level || event.risk_level_snapshot || '未知',
        department_name: departmentInfo?.name || '未知',
        has_closed: reviews.some(r => r.result === 'passed') || downstreamResult.rows.some(e => e.status === 'closed'),
        is_complete: reviews.some(r => r.result === 'passed')
      }
    }));
    
  } catch (err) {
    logger.error('Failed to get HSE chain', { eventId: req.params.eventId, error: err.message });
    res.status(500).json(error(err.message));
  }
});

/**
 * 建立事件关联关系
 * POST /api/hse/chain/link
 * 
 * Body:
 * - from_event_id: 源事件ID
 * - to_event_id: 目标事件ID
 * - link_type: 关联类型
 * - description: 关联说明
 */
router.post('/link', async (req, res) => {
  try {
    const { from_event_id, to_event_id, link_type, description } = req.body;
    
    if (!from_event_id || !to_event_id || !link_type) {
      return res.status(400).json(error('缺少必要参数：from_event_id, to_event_id, link_type'));
    }
    
    // 检查事件是否存在
    const fromResult = await pool.query(
      `SELECT id FROM hse_events WHERE id = $1 AND is_deleted = FALSE`,
      [from_event_id]
    );
    const toResult = await pool.query(
      `SELECT id FROM hse_events WHERE id = $2 AND is_deleted = FALSE`,
      [to_event_id]
    );
    
    if (fromResult.rows.length === 0) {
      return res.status(404).json(error('源事件不存在'));
    }
    if (toResult.rows.length === 0) {
      return res.status(404).json(error('目标事件不存在'));
    }
    
    // 创建关联
    const result = await pool.query(
      `INSERT INTO hse_event_links (from_event_id, to_event_id, link_type, description)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [from_event_id, to_event_id, link_type, description]
    );
    
    // 更新父事件ID（如果是 triggered_by 或 caused_by 关系）
    if (link_type === 'triggered_by' || link_type === 'caused_by') {
      await pool.query(
        `UPDATE hse_events SET parent_event_id = $1, updated_at = NOW() WHERE id = $2`,
        [from_event_id, to_event_id]
      );
    }
    
    res.json(success(result.rows[0], '关联创建成功'));
    
  } catch (err) {
    logger.error('Failed to create HSE chain link', { error: err.message });
    res.status(500).json(error(err.message));
  }
});

/**
 * 查询闭环视图
 * GET /api/hse/chain/view
 */
router.get('/view', async (req, res) => {
  try {
    const { event_code, event_type, risk_source_id, department_id } = req.query;
    
    let whereClause = 'WHERE 1=1';
    const params = [];
    let paramIndex = 1;
    
    if (event_code) {
      whereClause += ` AND event_code ILIKE $${paramIndex++}`;
      params.push(`%${event_code}%`);
    }
    if (event_type) {
      whereClause += ` AND event_type = $${paramIndex++}`;
      params.push(event_type);
    }
    if (risk_source_id) {
      whereClause += ` AND risk_source_id = $${paramIndex++}`;
      params.push(risk_source_id);
    }
    if (department_id) {
      whereClause += ` AND department_id = $${paramIndex++}`;
      params.push(department_id);
    }
    
    const result = await pool.query(
      `SELECT * FROM hse_event_chain_view ${whereClause} ORDER BY depth ASC`,
      params
    );
    
    res.json(success({
      list: result.rows,
      total: result.rows.length
    }));
    
  } catch (err) {
    logger.error('Failed to get HSE chain view', { error: err.message });
    res.status(500).json(error(err.message));
  }
});

/**
 * 获取风险源完整闭环信息
 * GET /api/hse/chain/risk/:riskSourceId
 */
router.get('/risk/:riskSourceId', async (req, res) => {
  try {
    const { riskSourceId } = req.params;
    
    // 查询风险源
    const rsResult = await pool.query(
      `SELECT id, source_id AS source_code, name, level, location, type, category, measures
       FROM risk_sources WHERE id = $1 AND is_deleted = FALSE`,
      [riskSourceId]
    );
    
    if (rsResult.rows.length === 0) {
      return res.status(404).json(error('风险源不存在'));
    }
    
    const riskSource = rsResult.rows[0];
    
    // 查询危险因素
    const rfResult = await pool.query(
      `SELECT id, factor_code, name, category, risk_level, risk_value, is_controlled, risk_object_id
       FROM hse_risk_factors WHERE risk_source_id = $1 AND is_deleted = FALSE`,
      [riskSourceId]
    );
    const riskFactors = rfResult.rows;
    
    // 查询控制措施
    const factorIds = riskFactors.map(f => f.id);
    let controlMeasures = [];
    if (factorIds.length > 0) {
      const cmResult = await pool.query(
        `SELECT id, measure_code, name, type, content, responsible_person_name, 
                department_id, frequency, is_active, effectiveness_score
         FROM hse_control_measures WHERE risk_factor_id = ANY($1) AND is_deleted = FALSE`,
        [factorIds]
      );
      controlMeasures = cmResult.rows;
    }
    
    // 查询检查计划
    const planIds = controlMeasures.map(m => m.inspection_plan_id).filter(Boolean);
    let inspectionPlans = [];
    if (planIds.length > 0) {
      const ipResult = await pool.query(
        `SELECT id, plan_code, plan_name, cycle_type, start_date, end_date, status
         FROM hse_inspection_plans WHERE id = ANY($1) AND is_deleted = FALSE`,
        [planIds]
      );
      inspectionPlans = ipResult.rows;
    }
    
    // 查询相关隐患
    const hazardEventsResult = await pool.query(
      `SELECT id, event_code, title, severity, status, occurred_at, source_id
       FROM hse_events WHERE risk_source_id = $1 AND event_type = 'hazard' AND is_deleted = FALSE`,
      [riskSourceId]
    );
    const hazardEvents = hazardEventsResult.rows;
    
    // 查询相关事故
    const accidentEventsResult = await pool.query(
      `SELECT id, event_code, title, severity, status, occurred_at, source_id
       FROM hse_events WHERE risk_source_id = $1 AND event_type = 'accident' AND is_deleted = FALSE`,
      [riskSourceId]
    );
    const accidentEvents = accidentEventsResult.rows;
    
    // 查询风险对象
    const objectIds = riskFactors.map(f => f.risk_object_id).filter(Boolean);
    let riskObjects = [];
    if (objectIds.length > 0) {
      const roResult = await pool.query(
        `SELECT id, object_name, object_type, department_id, location, risk_level
         FROM hse_risk_objects WHERE id = ANY($1) AND is_deleted = FALSE`,
        [objectIds]
      );
      riskObjects = roResult.rows;
    }
    
    res.json(success({
      risk_source: riskSource,
      risk_factors: riskFactors,
      control_measures: controlMeasures,
      inspection_plans: inspectionPlans,
      hazard_events: hazardEvents,
      accident_events: accidentEvents,
      risk_objects: riskObjects,
      summary: {
        total_factors: riskFactors.length,
        total_measures: controlMeasures.length,
        total_plans: inspectionPlans.length,
        total_hazards: hazardEvents.length,
        total_accidents: accidentEvents.length,
        is_controlled: riskFactors.every(f => f.is_controlled),
        has_unresolved_hazards: hazardEvents.some(h => h.status !== 'closed')
      }
    }));
    
  } catch (err) {
    logger.error('Failed to get risk chain', { riskSourceId: req.params.riskSourceId, error: err.message });
    res.status(500).json(error(err.message));
  }
});

module.exports = router;