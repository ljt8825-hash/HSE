/**
 * AI-05 Migration 执行器（开发库 safety_dashboard，用户已授权 2026-09-15）
 *
 * 执行顺序：
 *   1. server/sql/ai_capability_layer_v1.sql  —— AI 基础表（ai_prompt_registry / ai_generation_records）
 *   2. server/sql/ai05_knowledge_base_v1.sql  —— pgvector + 知识库四表
 *
 * 安全：仅 CREATE TABLE IF NOT EXISTS / CREATE EXTENSION IF NOT EXISTS（幂等）；
 *       只连 dev 库 safety_dashboard；不触碰生产库与业务数据。
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Pool } = require('pg');

const DB_NAME = 'safety_dashboard';
const pool = new Pool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER || 'hse_app',
  password: process.env.DB_PASSWORD,
  database: DB_NAME,
  connectionTimeoutMillis: 5000,
});

async function main() {
  const db = await pool.query('SELECT current_database()');
  if (db.rows[0].current_database !== DB_NAME) {
    throw new Error(`期望 dev 库 ${DB_NAME}，实际 ${db.rows[0].current_database}，中止`);
  }
  console.log('DB CONFIRMED:', db.rows[0].current_database);

  for (const file of ['ai_capability_layer_v1.sql', 'ai05_knowledge_base_v1.sql']) {
    const sqlPath = path.join(__dirname, '..', 'sql', file);
    const sql = fs.readFileSync(sqlPath, 'utf8');
    console.log(`\n=== EXEC ${file} ===`);
    await pool.query(sql);
    console.log('OK');
  }

  // 验证
  const ver = await pool.query(`SELECT extname, extversion FROM pg_extension WHERE extname='vector'`);
  console.log('\nEXT vector:', JSON.stringify(ver.rows));

  const tables = ['ai_prompt_registry', 'ai_generation_records',
    'knowledge_sources', 'knowledge_documents', 'knowledge_chunks', 'knowledge_embeddings'];
  const q = tables.map((t, i) => `to_regclass('public.${t}') AS t${i}`).join(', ');
  const tr = await pool.query(`SELECT ${q}`);
  const row = tr.rows[0];
  const status = tables.map((t, i) => `${t}=${row['t' + i] ? 'EXISTS' : 'MISSING'}`).join('\n');
  console.log('\nTABLES:\n' + status);
}

main()
  .then(() => pool.end())
  .catch((e) => { console.error('MIGRATION_ERR:', e.message); pool.end(); process.exit(1); });
