/**
 * AI-05 pgvector 扩展安装（开发库 safety_dashboard，用户已授权 2026-09-15）
 * 以 postgres 超管身份执行（.env POSTGRES_PASSWORD 为项目既有超管凭据）。
 * 仅 CREATE EXTENSION IF NOT EXISTS vector；然后校验版本。
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT) || 5432,
  user: 'postgres',
  password: process.env.POSTGRES_PASSWORD,
  database: 'safety_dashboard',
  connectionTimeoutMillis: 5000,
});

async function main() {
  const r = await pool.query('CREATE EXTENSION IF NOT EXISTS vector');
  console.log('CREATE EXTENSION OK');
  const v = await pool.query(`SELECT extname, extversion FROM pg_extension WHERE extname='vector'`);
  console.log('EXT:', JSON.stringify(v.rows));
}

main()
  .then(() => pool.end())
  .catch((e) => { console.error('EXT_ERR:', e.message); pool.end(); process.exit(1); });
