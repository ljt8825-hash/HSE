// AI-05 只读环境检查：数据库归属 + pgvector 可用性 + ai 表 Preflight（不写任何数据）
const { pool } = require('../config/db');

(async () => {
  try {
    const r = await pool.query('SELECT current_database() AS db, current_user AS usr');
    console.log('DB:', r.rows[0].db, 'USER:', r.rows[0].usr);

    const ext = await pool.query(
      "SELECT name, default_version, installed_version FROM pg_available_extensions WHERE name IN ('vector','pg_trgm')"
    );
    console.log('AVAILABLE_EXT:', JSON.stringify(ext.rows));

    const inst = await pool.query("SELECT extname, extversion FROM pg_extension WHERE extname IN ('vector','pg_trgm')");
    console.log('INSTALLED_EXT:', JSON.stringify(inst.rows));

    const ver = await pool.query('SELECT version() AS v');
    console.log('PG_VERSION:', ver.rows[0].v.split(' on ')[0]);

    // AI 两表 + 知识库候选表 Preflight（to_regclass 只读探测）
    const tables = ['ai_prompt_registry', 'ai_generation_records', 'ai_rag_documents', 'ai_rag_chunks',
      'knowledge_sources', 'knowledge_documents', 'knowledge_chunks', 'knowledge_embeddings'];
    const q = tables.map((t, i) => `to_regclass('public.${t}') AS t${i}`).join(', ');
    const tr = await pool.query(`SELECT ${q}`);
    const row = tr.rows[0];
    const status = tables.map((t, i) => `${t}=${row['t' + i] ? 'EXISTS' : 'null'}`).join(' ');
    console.log('TABLES:', status);
  } catch (e) {
    console.log('ERR:', e.message);
  }
  process.exit(0);
})();
