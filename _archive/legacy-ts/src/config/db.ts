/**
 * PostgreSQL 连接池配置
 * 文件: src/config/db.ts
 */

import { Pool } from 'pg';
import * as path from 'path';
import * as dotenv from 'dotenv';
import type { DbConfig } from '../types';

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const pgConfig: DbConfig = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'postgres',
  database: process.env.DB_NAME || process.env.DB_DATABASE || process.env.POSTGRES_DB || process.env.PGDATABASE || 'safety_dashboard',
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
};

// 空密码时使用 trust 认证，不传 password 字段
const dbPassword = process.env.DB_PASSWORD;
if (dbPassword && dbPassword.length > 0) {
  pgConfig.password = dbPassword;
}

const pool = new Pool(pgConfig);

let dbConnected = false;

pool.on('error', (err: Error) => {
  console.warn('[DB] PostgreSQL 连接池异常:', err.message);
  dbConnected = false;
});

const testConnection = async (): Promise<void> => {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    dbConnected = true;
    console.log('[DB] PostgreSQL 连接池初始化成功');
  } catch (err: any) {
    console.warn('[DB] PostgreSQL 连接池初始化失败:', err.message);
    console.warn('[DB] 将使用内存数据模式运行');
    dbConnected = false;
  }
};

const isConnected = (): boolean => dbConnected;

export { pool, testConnection, isConnected };
