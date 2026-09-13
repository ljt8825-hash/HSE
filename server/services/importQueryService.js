/**
 * HSE 智能导入 · 查询类 service（logs / config / stats）
 * 从 routes/import.js 迁移；仅做 SQL 查询，返回统一描述符（__t: json / error），由 controller 解释。
 * 不持有 express 依赖。
 */
const { pool } = require('../config/db');

// ============================================================
// GET /api/import/logs — 查询导入日志
// ============================================================
async function getLogs({ moduleType, status, page, limit }) {
  try {
    const pageNum = parseInt(page) || 1;
    const limitNum = Math.min(parseInt(limit) || 50, 200);
    const offset = (pageNum - 1) * limitNum;

    let where = ['1=1'];
    let params = [];
    let idx = 1;

    if (moduleType) {
      where.push(`module_type = $${idx++}`);
      params.push(moduleType);
    }
    if (status) {
      where.push(`status = $${idx++}`);
      params.push(status);
    }

    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM import_logs WHERE ${where.join(' AND ')}`,
      params
    );
    const total = parseInt(countResult.rows[0].total);

    params.push(limitNum);
    params.push(offset);
    const result = await pool.query(
      `SELECT l.*, f.original_name, f.file_type, f.size
       FROM import_logs l
       LEFT JOIN file_records f ON l.file_record_id = f.id
       WHERE ${where.join(' AND ')}
       ORDER BY l.created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      params
    );

    return {
      __t: 'json',
      payload: { logs: result.rows, total, page: pageNum, limit: limitNum },
      message: '查询成功',
    };
  } catch (err) {
    console.error('[Import] logs error:', err.message);
    return { __t: 'error', code: -1, message: '查询日志失败: ' + err.message };
  }
}

// ============================================================
// GET /api/import/config — 查询字段映射配置
// ============================================================
async function getConfig({ moduleType }) {
  try {
    let query = 'SELECT * FROM field_mapping_config WHERE is_active = true';
    let params = [];

    if (moduleType) {
      query += ' AND module_type = $1';
      params.push(moduleType);
    }

    query += ' ORDER BY module_type, id';

    const result = await pool.query(query, params);

    return {
      __t: 'json',
      payload: { configs: result.rows, total: result.rows.length },
      message: '查询成功',
    };
  } catch (err) {
    console.error('[Import] config error:', err.message);
    return { __t: 'error', code: -1, message: '查询配置失败: ' + err.message };
  }
}

// ============================================================
// GET /api/import/stats — 导入统计
// ============================================================
async function getStats() {
  try {
    // 按模块统计
    const moduleStats = await pool.query(`
      SELECT module_type,
             COUNT(*) as total_imports,
             SUM(inserted_rows) as total_inserted,
             SUM(updated_rows) as total_updated,
             SUM(skipped_rows) as total_skipped,
             SUM(error_count) as total_errors
      FROM import_logs
      WHERE status = 'completed'
      GROUP BY module_type
      ORDER BY total_imports DESC
    `);

    // 最近导入
    const recent = await pool.query(`
      SELECT l.*, f.original_name
      FROM import_logs l
      LEFT JOIN file_records f ON l.file_record_id = f.id
      ORDER BY l.created_at DESC
      LIMIT 10
    `);

    // 总计
    const totals = await pool.query(`
      SELECT COUNT(*) as total_jobs,
             SUM(inserted_rows) as total_inserted,
             SUM(updated_rows) as total_updated,
             SUM(skipped_rows) as total_skipped
      FROM import_logs WHERE status = 'completed'
    `);

    return {
      __t: 'json',
      payload: { byModule: moduleStats.rows, recent: recent.rows, totals: totals.rows[0] },
      message: '查询成功',
    };
  } catch (err) {
    console.error('[Import] stats error:', err.message);
    return { __t: 'error', code: -1, message: '查询统计失败: ' + err.message };
  }
}

module.exports = { getLogs, getConfig, getStats };