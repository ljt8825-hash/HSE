/**
 * 审计日志路由 (audit.js)
 * 对应前端 api/modules/audit.ts
 *
 * 阶段2完善: 接入 sys_operation_log 表，实现真实数据持久化
 * 同时提供 auditLog() 工具函数供其他路由调用记录操作日志
 */

const express = require('express');
const router = express.Router();
const { success, error } = require('../middleware/response');
const { pool } = require('../config/db');

// ============================================================
// 审计日志记录工具函数（供其他路由模块调用）
// ============================================================

/**
 * 记录一条审计日志
 * @param {Object} options
 * @param {number} options.userId - 操作人 ID
 * @param {string} options.username - 操作人用户名
 * @param {string} options.action - 操作动作（login/logout/create/update/delete/export/import 等）
 * @param {string} options.module - 模块名称（auth/users/vehicles/accidents/hazards 等）
 * @param {string} options.description - 操作描述
 * @param {string} [options.ip] - 客户端 IP
 * @param {string} [options.userAgent] - User-Agent
 * @param {number} [options.statusCode] - HTTP 状态码
 * @param {object} [options.detail] - 额外详情（JSON）
 */
async function auditLog(options) {
  const {
    userId, username, action, module: moduleName,
    description, ip, userAgent, statusCode, detail,
  } = options;

  if (!userId || !action) return;

  try {
    await pool.query(
      `INSERT INTO sys_operation_log
        (user_id, username, action, module, description, ip_address, user_agent, status_code, detail, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
      [
        userId,
        username || 'unknown',
        action,
        moduleName || 'system',
        description || '',
        ip || null,
        userAgent ? userAgent.substring(0, 500) : null,
        statusCode || 200,
        detail ? JSON.stringify(detail) : null,
      ]
    );
  } catch (err) {
    // 审计日志写入失败不应阻断业务流程
    console.error('[Audit] 写入审计日志失败:', err.message);
  }
}

// ============================================================
// 路由处理函数
// ============================================================

/**
 * GET /audit/logs
 * 分页查询审计日志
 */
router.get('/logs', async (req, res, next) => {
  try {
    const { page = 1, pageSize = 10, operator, actionType, startTime, endTime, keyword } = req.query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(Math.max(1, parseInt(pageSize) || 10), 200);
    const offset = (pageNum - 1) * limitNum;

    // 构建 WHERE 条件
    const conditions = [];
    const params = [];
    let paramIdx = 1;

    if (operator) {
      conditions.push(`username ILIKE $${paramIdx++}`);
      params.push(`%${operator}%`);
    }
    if (actionType) {
      conditions.push(`action = $${paramIdx++}`);
      params.push(actionType);
    }
    if (startTime) {
      conditions.push(`created_at >= $${paramIdx++}`);
      params.push(startTime);
    }
    if (endTime) {
      conditions.push(`created_at <= $${paramIdx++}`);
      params.push(endTime);
    }
    if (keyword) {
      conditions.push(`(description ILIKE $${paramIdx} OR module ILIKE $${paramIdx})`);
      params.push(`%${keyword}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // 查询总数
    const countResult = await pool.query(`SELECT COUNT(*) as total FROM sys_operation_log ${whereClause}`, params);
    const total = parseInt(countResult.rows[0].total);

    // 查询数据
    params.push(limitNum);
    params.push(offset);
    const result = await pool.query(
      `SELECT id, user_id, username, action, module, description, ip_address, status_code, detail, created_at
       FROM sys_operation_log ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      params
    );

    res.json(success({
      list: result.rows,
      total,
      page: pageNum,
      pageSize: limitNum,
    }, '获取审计日志成功'));
  } catch (err) {
    next(err);
  }
});

/**
 * GET /audit/stats
 * 审计统计（按模块、按操作类型）
 */
router.get('/stats', async (req, res, next) => {
  try {
    // 按模块统计
    const byModule = await pool.query(`
      SELECT module, COUNT(*) as count
      FROM sys_operation_log
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY module
      ORDER BY count DESC
    `);

    // 按操作类型统计
    const byAction = await pool.query(`
      SELECT action, COUNT(*) as count
      FROM sys_operation_log
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY action
      ORDER BY count DESC
      LIMIT 20
    `);

    // 今日操作数
    const todayResult = await pool.query(`
      SELECT COUNT(*) as count FROM sys_operation_log
      WHERE created_at >= CURRENT_DATE
    `);

    res.json(success({
      byModule: byModule.rows,
      byAction: byAction.rows,
      todayCount: parseInt(todayResult.rows[0].count),
    }, '获取审计统计成功'));
  } catch (err) {
    next(err);
  }
});

/**
 * GET /audit/export
 * 导出审计日志（返回 JSON 格式数据，前端可转换为 Excel）
 */
router.get('/export', async (req, res, next) => {
  try {
    const { startTime, endTime, actionType, module: moduleName } = req.query;

    const conditions = [];
    const params = [];
    let paramIdx = 1;

    if (startTime) {
      conditions.push(`created_at >= $${paramIdx++}`);
      params.push(startTime);
    }
    if (endTime) {
      conditions.push(`created_at <= $${paramIdx++}`);
      params.push(endTime);
    }
    if (actionType) {
      conditions.push(`action = $${paramIdx++}`);
      params.push(actionType);
    }
    if (moduleName) {
      conditions.push(`module = $${paramIdx++}`);
      params.push(moduleName);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // 限制导出数量（最多 10000 条）
    const result = await pool.query(
      `SELECT id, username, action, module, description, ip_address, status_code, created_at
       FROM sys_operation_log ${whereClause}
       ORDER BY created_at DESC
       LIMIT 10000`,
      params
    );

    res.json(success({
      data: result.rows,
      total: result.rows.length,
      exportTime: new Date().toISOString(),
    }, '审计日志导出成功'));
  } catch (err) {
    next(err);
  }
});

/**
 * GET /audit/operators
 * 获取操作人列表（去重）
 */
router.get('/operators', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT DISTINCT username FROM sys_operation_log ORDER BY username`
    );
    res.json(success(result.rows.map(r => r.username), '获取操作人列表成功'));
  } catch (err) {
    next(err);
  }
});

/**
 * GET /audit/action-types
 * 获取操作类型列表（去重）
 */
router.get('/action-types', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT DISTINCT action FROM sys_operation_log ORDER BY action`
    );
    res.json(success(result.rows.map(r => r.action), '获取操作类型列表成功'));
  } catch (err) {
    next(err);
  }
});

/**
 * 审计日志记录中间件
 * 可挂载到路由上，自动记录数据修改操作
 * @param {string} module - 模块名称
 * @param {string} action - 操作动作
 */
function auditMiddleware(module, action) {
  return async (req, res, next) => {
    // 拦截响应，在响应完成后记录审计日志
    const originalJson = res.json;
    res.json = function(data) {
      // 恢复原始 res.json
      res.json = originalJson;
      // 发送响应
      const result = originalJson.call(this, data);
      // 在响应后异步记录审计日志
      if (req.user && data && data.success !== false) {
        auditLog({
          userId: req.user.id,
          username: req.user.username,
          action: action || req.method.toLowerCase(),
          module: module || 'unknown',
          description: `${req.method} ${req.originalUrl}`,
          ip: req.ip || req.connection?.remoteAddress,
          userAgent: req.headers['user-agent'],
          statusCode: res.statusCode,
          detail: { method: req.method, path: req.originalUrl, body: req.method !== 'GET' ? undefined : undefined },
        }).catch(() => {});
      }
      return result;
    };
    next();
  };
}

module.exports = router;
module.exports.auditLog = auditLog;
module.exports.auditMiddleware = auditMiddleware;
