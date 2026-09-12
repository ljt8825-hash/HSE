/**
 * HSE 事件同步服务
 * 
 * 功能：将业务表数据同步到 hse_events 统一事件表
 * 实现：应用层同步（非数据库Trigger）
 * 
 * 当前实现：
 * - hazards（隐患）→ hse_events
 * - accidents（事故）→ hse_events
 */

const { pool } = require('../config/db');
const { logger } = require('../middleware/requestLogger');

/**
 * 事件类型枚举
 */
const EVENT_TYPES = {
  HAZARD: 'hazard',
  ACCIDENT: 'accident',
  VIOLATION: 'violation',
  PATROL_ALERT: 'patrol_alert',
  IOT_ALERT: 'iot_alert',
  TRAINING_ANOMALY: 'training_anomaly',
  RISK_ANOMALY: 'risk_anomaly'
};

/**
 * 严重等级映射
 */
const SEVERITY_MAP = {
  // 隐患等级
  '重大': 'critical',
  '较大': 'major',
  '一般': 'minor',
  '轻微': 'info',
  // 事故等级
  '特大': 'critical',
  '特别重大': 'critical',
  // 默认
  'high': 'critical',
  'medium': 'major',
  'low': 'minor'
};

/**
 * 状态映射
 */
const STATUS_MAP = {
  // 隐患状态
  '待整改': 'open',
  '整改中': 'processing',
  '已整改': 'resolved',
  '已验收': 'closed',
  // 事故状态
  '处理中': 'processing',
  '已结案': 'closed',
  // 默认
  'open': 'open',
  'pending': 'open',
  'completed': 'closed'
};

/**
 * 生成事件编号
 * @param {string} eventType - 事件类型
 * @param {Date} date - 发生日期
 * @param {number} sequence - 序号
 * @returns {string} 事件编号
 */
function generateEventCode(eventType, date, sequence) {
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  const seq = String(sequence).padStart(5, '0');
  return `SE-${dateStr}-${seq}`;
}

/**
 * 同步隐患到 hse_events
 * @param {number} hazardId - 隐患ID
 * @param {object} hazardData - 隐患数据（可选，不传则从数据库查询）
 * @returns {Promise<object>} 创建的事件记录
 */
async function syncHazard(hazardId, hazardData = null) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // 如果没有传入数据，从数据库查询
    let hazard = hazardData;
    if (!hazard) {
      const result = await client.query(
        `SELECT id, no, hazard_date, description, level, status,
                location, township, fixer, finder_id, dept, responsible_dept,
                created_at, updated_at
         FROM hazards
         WHERE id = $1 AND is_deleted = FALSE`,
        [hazardId]
      );
      
      if (result.rows.length === 0) {
        throw new Error(`Hazard not found: ${hazardId}`);
      }
      hazard = result.rows[0];
    }
    
    // 检查是否已存在
    const existingResult = await client.query(
      `SELECT id FROM hse_events WHERE source_table = 'hazards' AND source_id = $1`,
      [hazardId]
    );
    
    if (existingResult.rows.length > 0) {
      // 更新现有记录
      const updateResult = await client.query(
        `UPDATE hse_events 
         SET title = $1, severity = $2, status = $3, updated_at = NOW()
         WHERE source_table = 'hazards' AND source_id = $4
         RETURNING *`,
        [
          hazard.description || `隐患 ${hazard.no || hazardId}`,
          SEVERITY_MAP[hazard.level] || 'minor',
          STATUS_MAP[hazard.status] || 'open',
          hazardId
        ]
      );
      
      await client.query('COMMIT');
      logger.info('HSE event updated from hazard', { hazardId, eventId: updateResult.rows[0].id });
      return updateResult.rows[0];
    }
    
    // 生成事件编号
    const eventDate = hazard.hazard_date || new Date();
    const countResult = await client.query(
      `SELECT COUNT(*) + 1 as next_seq FROM hse_events 
       WHERE DATE(occurred_at) = DATE($1)`,
      [eventDate]
    );
    const eventCode = generateEventCode(EVENT_TYPES.HAZARD, eventDate, countResult.rows[0].next_seq);
    
    // 创建新事件
    const insertResult = await client.query(
      `INSERT INTO hse_events (
        event_code, event_type, source_table, source_id,
        title, severity, status, occurred_at,
        personnel_id, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
       RETURNING *`,
      [
        eventCode,
        EVENT_TYPES.HAZARD,
        'hazards',
        hazardId,
        hazard.description || `隐患 ${hazard.no || hazardId}`,
        SEVERITY_MAP[hazard.level] || 'minor',
        STATUS_MAP[hazard.status] || 'open',
        eventDate,
        hazard.finder_id || null
      ]
    );
    
    await client.query('COMMIT');
    logger.info('HSE event created from hazard', { hazardId, eventId: insertResult.rows[0].id, eventCode });
    
    return insertResult.rows[0];
    
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Failed to sync hazard to hse_events', { hazardId, error: error.message });
    throw error;
  } finally {
    client.release();
  }
}

/**
 * 同步事故到 hse_events
 * @param {number} accidentId - 事故ID
 * @param {object} accidentData - 事故数据（可选）
 * @returns {Promise<object>} 创建的事件记录
 */
async function syncAccident(accidentId, accidentData = null) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // 如果没有传入数据，从数据库查询
    let accident = accidentData;
    if (!accident) {
      const result = await client.query(
        `SELECT id, no, accident_date, description, level, status,
                location, township, vehicle_id, personnel_id,
                loss_amount, created_at, updated_at
         FROM accidents 
         WHERE id = $1 AND is_deleted = FALSE`,
        [accidentId]
      );
      
      if (result.rows.length === 0) {
        throw new Error(`Accident not found: ${accidentId}`);
      }
      accident = result.rows[0];
    }
    
    // 检查是否已存在
    const existingResult = await client.query(
      `SELECT id FROM hse_events WHERE source_table = 'accidents' AND source_id = $1`,
      [accidentId]
    );
    
    if (existingResult.rows.length > 0) {
      // 更新现有记录
      const updateResult = await client.query(
        `UPDATE hse_events 
         SET title = $1, severity = $2, status = $3, 
             vehicle_id = $4, personnel_id = $5, updated_at = NOW()
         WHERE source_table = 'accidents' AND source_id = $6
         RETURNING *`,
        [
          accident.description || `事故 ${accident.no || accidentId}`,
          SEVERITY_MAP[accident.level] || 'major',
          STATUS_MAP[accident.status] || 'open',
          accident.vehicle_id || null,
          accident.personnel_id || null,
          accidentId
        ]
      );
      
      await client.query('COMMIT');
      logger.info('HSE event updated from accident', { accidentId, eventId: updateResult.rows[0].id });
      return updateResult.rows[0];
    }
    
    // 生成事件编号
    const eventDate = accident.accident_date || new Date();
    const countResult = await client.query(
      `SELECT COUNT(*) + 1 as next_seq FROM hse_events 
       WHERE DATE(occurred_at) = DATE($1)`,
      [eventDate]
    );
    const eventCode = generateEventCode(EVENT_TYPES.ACCIDENT, eventDate, countResult.rows[0].next_seq);
    
    // 创建新事件
    const insertResult = await client.query(
      `INSERT INTO hse_events (
        event_code, event_type, source_table, source_id,
        title, severity, status, occurred_at,
        vehicle_id, personnel_id, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
       RETURNING *`,
      [
        eventCode,
        EVENT_TYPES.ACCIDENT,
        'accidents',
        accidentId,
        accident.description || `事故 ${accident.no || accidentId}`,
        SEVERITY_MAP[accident.level] || 'major',
        STATUS_MAP[accident.status] || 'open',
        eventDate,
        accident.vehicle_id || null,
        accident.personnel_id || null
      ]
    );
    
    await client.query('COMMIT');
    logger.info('HSE event created from accident', { accidentId, eventId: insertResult.rows[0].id, eventCode });
    
    return insertResult.rows[0];
    
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Failed to sync accident to hse_events', { accidentId, error: error.message });
    throw error;
  } finally {
    client.release();
  }
}

/**
 * 批量同步隐患
 * @param {number} limit - 每批数量
 * @returns {Promise<object>} 同步结果
 */
async function batchSyncHazards(limit = 100) {
  const result = await pool.query(
    `SELECT id FROM hazards 
     WHERE is_deleted = FALSE 
       AND id NOT IN (SELECT source_id FROM hse_events WHERE source_table = 'hazards')
     ORDER BY id 
     LIMIT $1`,
    [limit]
  );
  
  const synced = [];
  const failed = [];
  
  for (const row of result.rows) {
    try {
      const event = await syncHazard(row.id);
      synced.push({ hazardId: row.id, eventId: event.id });
    } catch (error) {
      failed.push({ hazardId: row.id, error: error.message });
    }
  }
  
  return { synced, failed, total: result.rows.length };
}

/**
 * 批量同步事故
 * @param {number} limit - 每批数量
 * @returns {Promise<object>} 同步结果
 */
async function batchSyncAccidents(limit = 100) {
  const result = await pool.query(
    `SELECT id FROM accidents 
     WHERE is_deleted = FALSE 
       AND id NOT IN (SELECT source_id FROM hse_events WHERE source_table = 'accidents')
     ORDER BY id 
     LIMIT $1`,
    [limit]
  );
  
  const synced = [];
  const failed = [];
  
  for (const row of result.rows) {
    try {
      const event = await syncAccident(row.id);
      synced.push({ accidentId: row.id, eventId: event.id });
    } catch (error) {
      failed.push({ accidentId: row.id, error: error.message });
    }
  }
  
  return { synced, failed, total: result.rows.length };
}

/**
 * 同步指定类型的数据
 * @param {string} type - 事件类型（hazard/accident）
 * @param {number} sourceId - 源记录ID
 * @param {object} data - 源数据（可选）
 * @returns {Promise<object>} 同步结果
 */
async function sync(type, sourceId, data = null) {
  switch (type) {
    case 'hazard':
    case 'hazards':
      return syncHazard(sourceId, data);
    case 'accident':
    case 'accidents':
      return syncAccident(sourceId, data);
    default:
      throw new Error(`Unsupported event type: ${type}`);
  }
}

module.exports = {
  EVENT_TYPES,
  SEVERITY_MAP,
  STATUS_MAP,
  generateEventCode,
  syncHazard,
  syncAccident,
  batchSyncHazards,
  batchSyncAccidents,
  sync
};
