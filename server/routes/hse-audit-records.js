const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { success, error } = require('../middleware/response');

async function createAuditRecord(options) {
  const {
    operationLogId, userId, username, module,
    tableName, recordId, action, oldValue, newValue,
    changedFields, ipAddress
  } = options;

  if (!userId || !tableName || !action) return null;

  try {
    const result = await pool.query(
      `INSERT INTO audit_record
        (operation_log_id, user_id, username, module, table_name, record_id,
         action, old_value, new_value, changed_fields, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id`,
      [
        operationLogId || null,
        userId,
        username || 'unknown',
        module || 'system',
        tableName,
        String(recordId || ''),
        action,
        oldValue ? JSON.stringify(oldValue) : null,
        newValue ? JSON.stringify(newValue) : null,
        changedFields || null,
        ipAddress || null
      ]
    );
    return result.rows[0];
  } catch (err) {
    console.error('[AuditRecord] 创建审计记录失败:', err.message);
    return null;
  }
}

router.get('/records', async (req, res, next) => {
  try {
    const { page = 1, pageSize = 20, module, tableName, action, userId, recordId } = req.query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(Math.max(1, parseInt(pageSize) || 20), 200);
    const offset = (pageNum - 1) * limitNum;

    const conditions = [];
    const params = [];
    let idx = 1;

    if (module) { conditions.push(`module = $${idx++}`); params.push(module); }
    if (tableName) { conditions.push(`table_name = $${idx++}`); params.push(tableName); }
    if (action) { conditions.push(`action = $${idx++}`); params.push(action); }
    if (userId) { conditions.push(`user_id = $${idx++}`); params.push(userId); }
    if (recordId) { conditions.push(`record_id = $${idx++}`); params.push(String(recordId)); }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM audit_record ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].total);

    params.push(limitNum, offset);
    const result = await pool.query(
      `SELECT id, operation_log_id, user_id, username, module, table_name, record_id,
              action, old_value, new_value, changed_fields, ip_address, created_at
       FROM audit_record ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      params
    );

    res.json(success({ list: result.rows, total, page: pageNum, pageSize: limitNum }, '审计记录获取成功'));
  } catch (err) {
    next(err);
  }
});

router.get('/records/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT id, operation_log_id, user_id, username, module, table_name, record_id,
              action, old_value, new_value, changed_fields, ip_address, created_at
       FROM audit_record WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json(error(404, '审计记录不存在'));
    }

    res.json(success(result.rows[0], '审计记录详情获取成功'));
  } catch (err) {
    next(err);
  }
});

router.get('/stats', async (req, res, next) => {
  try {
    const byModule = await pool.query(`
      SELECT module, COUNT(*) as count
      FROM audit_record
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY module ORDER BY count DESC LIMIT 20
    `);
    const byAction = await pool.query(`
      SELECT action, COUNT(*) as count
      FROM audit_record
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY action ORDER BY count DESC
    `);
    const byTable = await pool.query(`
      SELECT table_name, COUNT(*) as count
      FROM audit_record
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY table_name ORDER BY count DESC LIMIT 20
    `);
    const todayCount = await pool.query(`
      SELECT COUNT(*) as count FROM audit_record
      WHERE created_at >= CURRENT_DATE
    `);

    res.json(success({
      byModule: byModule.rows,
      byAction: byAction.rows,
      byTable: byTable.rows,
      todayCount: parseInt(todayCount.rows[0].count),
    }, '审计统计获取成功'));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
module.exports.createAuditRecord = createAuditRecord;
