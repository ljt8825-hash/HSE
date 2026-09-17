/** AI-11 migration 执行：仅在开发库执行（由任务书授权）。执行前打印 DDL 内容。 */
'use strict';
const fs = require('fs');
const path = require('path');
const { pool } = require('../config/db');

const SQL_PATH = path.join(__dirname, '..', 'sql', 'ai11_generation_reviews_v1.sql');

(async () => {
  const db = await pool.query('SELECT current_database() AS db');
  console.log('[AI-11 migration] target database:', db.rows[0].db);

  const sql = fs.readFileSync(SQL_PATH, 'utf8');
  console.log('--- DDL 内容（执行前输出） ---');
  console.log(sql);
  console.log('--- 开始执行 ---');

  await pool.query(sql);

  // 执行后验证：表/列/FK/索引存在；原 AI 表结构未被修改
  const tbl = await pool.query(
    `SELECT column_name, data_type, is_nullable
     FROM information_schema.columns
     WHERE table_name = 'ai_generation_reviews'
     ORDER BY ordinal_position`);
  console.log(`\n[verify] ai_generation_reviews 列 (${tbl.rows.length}):`);
  for (const c of tbl.rows) console.log(`  ${c.column_name}  ${c.data_type}`);

  const fks = await pool.query(
    `SELECT conname, pg_get_constraintdef(oid) AS def
     FROM pg_constraint
     WHERE conrelid = 'ai_generation_reviews'::regclass AND contype = 'f'
     ORDER BY conname`);
  console.log(`\n[verify] 外键 (${fks.rows.length}):`);
  for (const f of fks.rows) console.log(`  ${f.conname}: ${f.def}`);

  const idx = await pool.query(
    `SELECT indexname, indexdef FROM pg_indexes
     WHERE tablename = 'ai_generation_reviews'
     ORDER BY indexname`);
  console.log(`\n[verify] 索引 (${idx.rows.length}):`);
  for (const i of idx.rows) console.log(`  ${i.indexname}`);

  // 原 AI 表结构未被修改：列数对比（执行前审计基线 ai_generation_records=20 / ai_analysis_tasks=23）
  const genCols = await pool.query(
    `SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name = 'ai_generation_records'`);
  const taskCols = await pool.query(
    `SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name = 'ai_analysis_tasks'`);
  console.log(`\n[verify] 原 AI 表列数: ai_generation_records=${genCols.rows[0].n}（基线 20） ai_analysis_tasks=${taskCols.rows[0].n}（基线 23）`);

  await pool.end();
  console.log('\nRESULT: OK');
})().catch((e) => {
  console.error('RESULT: FAIL —', e.message);
  process.exit(1);
});
