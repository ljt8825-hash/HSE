/**
 * 数据库性能监控配置
 * 集中管理慢查询阈值、查询日志、连接池监控等性能相关配置
 *
 * 通过环境变量可覆盖默认值：
 *   DB_SLOW_QUERY_THRESHOLD - 慢查询阈值（毫秒），默认 500
 *   DB_QUERY_LOG_ENABLED   - 是否启用查询日志，默认 true（仅开发环境）
 *   DB_POOL_LOG_INTERVAL   - 连接池统计输出间隔（毫秒），默认 60000
 */

const isDev = process.env.NODE_ENV === 'development';
const isTest = process.env.NODE_ENV === 'test';

module.exports = {
  /**
   * 慢查询阈值（毫秒）
   * 超过此阈值的 SQL 查询将被记录为慢查询
   */
  SLOW_QUERY_THRESHOLD: parseInt(process.env.DB_SLOW_QUERY_THRESHOLD) || 500,

  /**
   * 是否启用查询日志
   * 生产环境默认关闭，开发环境默认开启
   */
  QUERY_LOG_ENABLED: process.env.DB_QUERY_LOG_ENABLED !== undefined
    ? process.env.DB_QUERY_LOG_ENABLED === 'true'
    : (isDev || isTest),

  /**
   * 慢查询日志级别
   * 可选: 'warn' | 'error' | 'info'
   */
  SLOW_QUERY_LOG_LEVEL: process.env.DB_SLOW_QUERY_LOG_LEVEL || 'warn',

  /**
   * 连接池统计输出间隔（毫秒）
   * 默认每 60 秒输出一次连接池状态
   */
  POOL_LOG_INTERVAL: parseInt(process.env.DB_POOL_LOG_INTERVAL) || 60 * 1000,

  /**
   * 是否启用连接池监控
   */
  POOL_MONITOR_ENABLED: process.env.DB_POOL_MONITOR_ENABLED !== undefined
    ? process.env.DB_POOL_MONITOR_ENABLED === 'true'
    : isDev,

  /**
   * 查询耗时统计保留条数
   * 保留最近的 N 条查询记录用于分析
   */
  QUERY_HISTORY_SIZE: parseInt(process.env.DB_QUERY_HISTORY_SIZE) || 100,

  /**
   * 查询日志格式
   * 占位符: {duration} {sql} {params} {timestamp}
   */
  QUERY_LOG_FORMAT: '[DB Query] 耗时: {duration}ms | {sql}',

  /**
   * 需要监控的高频查询表
   * 用于针对性优化和索引建议
   */
  MONITORED_TABLES: [
    'hazards',
    'accidents',
    'audit_logs',
    'login_attempts',
    'notifications',
    'dashboard_snapshots',
    'training_records',
    'vehicles',
    'insurance_claims'
  ]
};
