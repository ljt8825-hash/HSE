/**
 * AI-05 数据库最终状态只读验证（临时脚本）
 * 只读：information_schema / counts，不写任何数据。
 */
const { pool } = require('../config/db');

async function main() {
  const t = await pool.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public'
       AND (table_name LIKE 'knowledge\_%' OR table_name IN ('ai_prompt_registry', 'ai_generation_records'))
     ORDER BY table_name`
  );
  console.log('TABLES:', t.rows.map((r) => r.table_name).join(', '));

  const e = await pool.query(`SELECT extversion FROM pg_extension WHERE extname = 'vector'`);
  console.log('PGVECTOR_VERSION:', e.rows[0] ? e.rows[0].extversion : 'MISSING');

  const c = await pool.query(
    `SELECT
       (SELECT count(*) FROM knowledge_sources) AS src,
       (SELECT count(*) FROM knowledge_documents) AS doc,
       (SELECT count(*) FROM knowledge_chunks) AS chk,
       (SELECT count(*) FROM knowledge_embeddings) AS emb,
       (SELECT count(*) FROM ai_generation_records) AS rec,
       (SELECT count(*) FROM ai_prompt_registry) AS prm`
  );
  console.log('COUNTS:', JSON.stringify(c.rows[0]));

  const src = await pool.query(`SELECT id, source_id, name, type, status FROM knowledge_sources ORDER BY id`);
  console.log('SOURCES:', JSON.stringify(src.rows));
}

main()
  .then(() => pool.end())
  .catch((e) => { console.error('VERIFY_ERR:', e.message); pool.end(); process.exit(1); });
