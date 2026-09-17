/**
 * AI-12 Runtime Probe（只读）—— hse-ai-health.ps1 依赖
 *
 * 用途：健康检查时对 PostgreSQL 做只读探测，输出 key=value 行供 PowerShell 解析。
 * 只读性：仅 SELECT / information_schema / pg_extension，不写任何表、不改任何数据。
 * 连接：server/.env 的 safety_dashboard（与运行中后端一致）。
 *
 * 输出：
 *   db_ok=1|0
 *   vector_ok=1|0
 *   tables_ok=1|0
 *   missing_tables=...
 *   pending_tasks=N
 *   running_tasks=N
 *   gen_records=N
 */

'use strict';
const { pool } = require('../config/db');

const AI_TABLES = [
  'ai_analysis_tasks',
  'ai_generation_records',
  'ai_generation_reviews',
  'knowledge_sources',
  'knowledge_documents',
  'knowledge_chunks',
  'knowledge_embeddings',
];

(async () => {
  // 1) 数据库连通
  let dbOk = 0;
  try {
    await pool.query('SELECT 1');
    dbOk = 1;
  } catch (e) {
    console.log('db_ok=0');
    console.log('reason=' + (e && e.message ? e.message.replace(/\s+/g, ' ').slice(0, 200) : 'db unreachable'));
    process.exit(0);
  }
  console.log('db_ok=1');

  // 2) pgvector
  let vectorOk = 0;
  try {
    const e = await pool.query(`SELECT extversion FROM pg_extension WHERE extname = 'vector'`);
    if (e.rows.length) { vectorOk = 1; console.log('vector_ver=' + e.rows[0].extversion); }
  } catch { }
  console.log('vector_ok=' + vectorOk);

  // 3) AI 7 表
  const missing = [];
  for (const t of AI_TABLES) {
    const r = await pool.query(
      `SELECT count(*)::int n FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`, [t]);
    if (!r.rows[0].n) missing.push(t);
  }
  console.log('tables_ok=' + (missing.length ? 0 : 1));
  console.log('missing_tables=' + (missing.length ? missing.join(',') : 'none'));

  // 4) 任务状态分布（诊断：长期 PENDING / RUNNING 卡死）
  try {
    const s = await pool.query(
      `SELECT status, count(*)::int n FROM ai_analysis_tasks GROUP BY status ORDER BY status`);
    const map = {};
    for (const x of s.rows) map[x.status] = x.n;
    console.log('pending_tasks=' + (map.PENDING || 0));
    console.log('running_tasks=' + (map.RUNNING || 0));
    console.log('failed_tasks=' + (map.FAILED || 0));
  } catch {
    console.log('pending_tasks=0');
    console.log('running_tasks=0');
    console.log('failed_tasks=0');
  }

  // 5) 生成记录数
  try {
    const g = await pool.query(`SELECT count(*)::int n FROM ai_generation_records`);
    console.log('gen_records=' + g.rows[0].n);
  } catch {
    console.log('gen_records=0');
  }

  await pool.end();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
