/**
 * SQL 查询日志中间件
 * 记录慢查询（超过阈值的查询）、定期输出连接池统计
 * 开发环境默认启用，生产环境通过 DB_QUERY_LOG_ENABLED 控制
 *
 * 使用方式：在 app.js 中引入并挂载
 *   const queryLogger = require('./middleware/queryLogger');
 *   queryLogger.init(pool);
 */

const perfConfig = require('../config/performance');

// 查询历史记录（用于统计分析）
let queryHistory = [];
let poolMonitorInterval = null;

/**
 * 初始化查询日志器
 * @param {import('pg').Pool} pool - PostgreSQL 连接池实例
 */
function init(pool) {
  if (!pool) {
    console.warn('[QueryLogger] 未提供连接池实例，查询日志未启用');
    return;
  }

  // 保存原始 query 方法
  const originalQuery = pool.query.bind(pool);

  // 替换 query 方法，添加耗时统计和慢查询检测
  pool.query = function (...args) {
    const startTime = Date.now();
    const sql = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].text) || '';
    const params = args[1] || [];

    return originalQuery(...args).then(result => {
      const duration = Date.now() - startTime;
      _logQuery(sql, params, duration);
      return result;
    }).catch(err => {
      const duration = Date.now() - startTime;
      _logQueryError(sql, params, duration, err);
      throw err;
    });
  };

  // 启动连接池监控
  if (perfConfig.POOL_MONITOR_ENABLED) {
    startPoolMonitor(pool);
  }

  console.log(`[QueryLogger] 查询日志已启用 (慢查询阈值: ${perfConfig.SLOW_QUERY_THRESHOLD}ms)`);
}

/**
 * 记录查询信息
 * @private
 */
function _logQuery(sql, params, duration) {
  // 记录到历史
  const record = {
    sql: _truncateSql(sql),
    params: _sanitizeParams(params),
    duration,
    timestamp: new Date().toISOString(),
    isSlow: duration > perfConfig.SLOW_QUERY_THRESHOLD
  };
  queryHistory.push(record);
  if (queryHistory.length > perfConfig.QUERY_HISTORY_SIZE) {
    queryHistory.shift();
  }

  // 仅记录慢查询到日志
  if (record.isSlow && perfConfig.QUERY_LOG_ENABLED) {
    const logFn = console[perfConfig.SLOW_QUERY_LOG_LEVEL] || console.warn;
    logFn(
      `[慢查询] ${duration}ms | ${record.sql}` +
      (params.length > 0 ? ` | 参数: ${JSON.stringify(_sanitizeParams(params))}` : '')
    );
  }
}

/**
 * 记录查询错误
 * @private
 */
function _logQueryError(sql, params, duration, err) {
  const record = {
    sql: _truncateSql(sql),
    params: _sanitizeParams(params),
    duration,
    timestamp: new Date().toISOString(),
    error: err.message,
    isSlow: true,
    isError: true
  };
  queryHistory.push(record);
  if (queryHistory.length > perfConfig.QUERY_HISTORY_SIZE) {
    queryHistory.shift();
  }

  if (perfConfig.QUERY_LOG_ENABLED) {
    console.error(
      `[查询错误] ${duration}ms | ${record.sql} | 错误: ${err.message}`
    );
  }
}

/**
 * 启动连接池监控
 * @private
 */
function startPoolMonitor(pool) {
  if (poolMonitorInterval) clearInterval(poolMonitorInterval);

  poolMonitorInterval = setInterval(() => {
    try {
      const poolStats = getPoolStats(pool);
      if (poolStats) {
        console.log(
          `[连接池] 总计: ${poolStats.total} | 空闲: ${poolStats.idle} | 等待: ${poolStats.waiting} | ` +
          `最大: ${poolStats.max}`
        );

        // 连接池使用率超过 80% 时发出警告
        if (poolStats.total > 0 && poolStats.total / poolStats.max > 0.8) {
          console.warn(
            `[连接池] 警告: 连接池使用率 ${Math.round(poolStats.total / poolStats.max * 100)}%，` +
            `请考虑增加 max 连接数`
          );
        }
      }
    } catch (err) {
      // 忽略监控统计错误
    }
  }, perfConfig.POOL_LOG_INTERVAL);

  // 防止阻止进程退出
  if (poolMonitorInterval.unref) {
    poolMonitorInterval.unref();
  }
}

/**
 * 获取连接池状态
 * @param {import('pg').Pool} pool
 * @returns {Object|null}
 */
function getPoolStats(pool) {
  try {
    return pool.pool ? {
      total: pool.pool.totalCount,
      idle: pool.pool.idleCount,
      waiting: pool.pool.waitingCount,
      max: pool.pool.max
    } : null;
  } catch {
    return null;
  }
}

/**
 * 获取查询历史统计
 * @returns {Object}
 */
function getQueryStats() {
  const total = queryHistory.length;
  const slowQueries = queryHistory.filter(q => q.isSlow);
  const errorQueries = queryHistory.filter(q => q.isError);
  const avgDuration = total > 0
    ? Math.round(queryHistory.reduce((sum, q) => sum + q.duration, 0) / total)
    : 0;
  const maxDuration = total > 0
    ? Math.max(...queryHistory.map(q => q.duration))
    : 0;

  return {
    total,
    slowCount: slowQueries.length,
    errorCount: errorQueries.length,
    avgDuration,
    maxDuration,
    threshold: perfConfig.SLOW_QUERY_THRESHOLD,
    recentSlowQueries: slowQueries.slice(-10).map(q => ({
      sql: q.sql,
      duration: q.duration,
      timestamp: q.timestamp
    }))
  };
}

/**
 * 截断过长的 SQL 语句
 * @private
 */
function _truncateSql(sql, maxLength = 500) {
  if (sql.length <= maxLength) return sql;
  return sql.substring(0, maxLength) + '...';
}

/**
 * 脱敏参数（防止密码等敏感信息泄露到日志）
 * @private
 */
function _sanitizeParams(params) {
  if (!Array.isArray(params)) return params;
  return params.map(p => {
    if (typeof p === 'string' && p.length > 100) {
      return p.substring(0, 50) + '...(已截断)';
    }
    return p;
  });
}

/**
 * 停止查询日志器
 */
function stop() {
  if (poolMonitorInterval) {
    clearInterval(poolMonitorInterval);
    poolMonitorInterval = null;
  }
}

/**
 * 重置查询历史
 */
function resetHistory() {
  queryHistory = [];
}

module.exports = {
  init,
  stop,
  getPoolStats,
  getQueryStats,
  resetHistory
};
