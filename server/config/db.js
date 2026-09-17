const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pgConfig = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER || 'postgres',
  database: process.env.DB_NAME || process.env.DB_DATABASE || process.env.POSTGRES_DB || process.env.PGDATABASE || 'safety_dashboard',
  max: 30, // 事故模块 onMounted 并发 4 个 endpoint + stats Promise.all 7 个查询 + save 期间多次查询，原 10 容易瞬时耗尽导致 auth 用户表查询超时（503 认证服务暂不可用）/事故 catch 抛错
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  client_encoding: 'UTF8'
};

// 空密码时使用 trust 认证，不传 password 字段
const dbPassword = process.env.DB_PASSWORD;
if (dbPassword && dbPassword.length > 0) {
  pgConfig.password = dbPassword;
}

const pool = new Pool(pgConfig);

var dbConnected = false;

pool.on('error', (err) => {
  console.warn('[DB] PostgreSQL 连接池异常:', err.message);
  dbConnected = false;
  if (process.env.NODE_ENV !== 'production') {
    console.warn(
      '\n' +
      '!'.repeat(72) + '\n' +
      '[DB][严重] 连接池异常，已切换为「内存降级模式」。\n' +
      '           此后所有读接口将静默返回空数据（HTTP 200 + 空数组），\n' +
      '           前端会显示「暂无数据」而不是报错 —— 请勿误判为业务数据为空！\n' +
      '           修复：确认 PostgreSQL 可用后重启后端。\n' +
      '!'.repeat(72) + '\n'
    );
  }
});

const testConnection = async () => {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    dbConnected = true;
    console.log('[DB] PostgreSQL 连接池初始化成功');
  } catch (err) {
    dbConnected = false;
    if (process.env.NODE_ENV === 'production') {
      console.error('[DB] 生产环境 PostgreSQL 连接失败！所有 API 将返回数据库错误。请检查数据库配置:', err.message);
    } else {
      console.warn(
        '\n' +
        '!'.repeat(72) + '\n' +
        '[DB][严重] PostgreSQL 连接失败，开发环境已进入「内存降级模式」。\n' +
        '           原因: ' + err.message + '\n' +
        '           影响: isConnected() 返回 false，全部读接口静默返回空数据\n' +
        '                 （HTTP 200 + 空数组/零值），前端显示「暂无数据」而非报错。\n' +
        '                 【请勿把「空数据」误判为业务上没有数据！】\n' +
        '           范围: 仅开发环境。生产环境 isConnected() 恒为 true，\n' +
        '                 DB 故障会正常抛出错误，不受此降级影响。\n' +
        '           修复: 确认 PostgreSQL 可用后重启后端。\n' +
        '!'.repeat(72) + '\n'
      );
    }
  }
};

/**
 * 判断数据库是否可用
 * 生产环境强制返回 true，确保所有路由走数据库查询；
 * 若 DB 实际不可用，pool.query() 会抛出异常由路由 catch 块返回错误响应。
 * 开发环境保留内存降级模式。
 */
const isConnected = () => {
  if (process.env.NODE_ENV === 'production') return true;
  return dbConnected;
};

module.exports = {
  pool,
  testConnection,
  isConnected
};
