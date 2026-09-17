-- ============================================================
-- AI-05 HSE 知识库 + RAG 基础能力 数据模型（migration 文件）
--
-- 状态：开发库 safety_dashboard 授权执行（2026-09-15 用户确认）。
-- 原则：
--   1. 只新增，不修改/删除任何已有表与业务数据（WPS/三违/考核/风险/事故/人员边界不触碰）；
--   2. 全部 CREATE TABLE IF NOT EXISTS + ADD COLUMN IF NOT EXISTS，幂等可重跑；
--   3. pgvector 为 trusted 扩展，开发库已授权安装（CREATE EXTENSION IF NOT EXISTS vector）；
--   4. 最小化：只建 knowledge_sources / knowledge_documents / knowledge_chunks /
--      knowledge_embeddings 四张知识库表，不建 rag_log/rag_history 等冗余表。
--
-- 执行方式（开发库，由受权执行）：
--   psql -d safety_dashboard -f ai05_knowledge_base_v1.sql
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 0. pgvector 扩展（幂等；trusted 扩展，hse_app 有 DB CREATE 权限）
-- ------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS vector;

-- ------------------------------------------------------------
-- 1. knowledge_sources 知识源
--    source_id = 语义业务键（唯一）；type 不写死过多，
--    预留 manual_upload/system_document/policy/regulation/procedure/training
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS knowledge_sources (
  id           BIGSERIAL PRIMARY KEY,
  source_id    VARCHAR(100) NOT NULL UNIQUE,      -- 语义键（业务标识）
  name         VARCHAR(200) NOT NULL,
  type         VARCHAR(50)  NOT NULL DEFAULT 'manual_upload',
  description  TEXT,
  status       VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE',   -- ACTIVE | DISABLED
  created_by   BIGINT,                                     -- users.id（只读引用，不建外键）
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 2. knowledge_documents 知识文档
--    status: DRAFT | PARSING | READY | FAILED | DISABLED
--    content_hash = sha256 原文哈希（重复检测/幂等导入/版本管理）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS knowledge_documents (
  id            BIGSERIAL PRIMARY KEY,
  source_id     BIGINT NOT NULL REFERENCES knowledge_sources(id),
  title         VARCHAR(300) NOT NULL,
  file_name     VARCHAR(300),
  file_type     VARCHAR(20),                     -- txt | md | pdf | docx | xlsx
  version       INTEGER NOT NULL DEFAULT 1,
  status        VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  content       TEXT,                            -- 解析后纯文本（重新分块/版本比对用）
  content_hash  VARCHAR(64),                     -- sha256
  parse_error   TEXT,
  created_by    BIGINT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 兼容：老表补 content 列（幂等）
ALTER TABLE knowledge_documents
  ADD COLUMN IF NOT EXISTS content TEXT;

CREATE INDEX IF NOT EXISTS idx_knowledge_docs_source ON knowledge_documents (source_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_docs_hash   ON knowledge_documents (content_hash);

-- ------------------------------------------------------------
-- 3. knowledge_chunks 文档分块
--    保留 document_id / chunk_index / page / section / metadata（Citation 依据）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id             BIGSERIAL PRIMARY KEY,
  document_id    BIGINT NOT NULL REFERENCES knowledge_documents(id),
  chunk_index    INTEGER NOT NULL,
  content        TEXT NOT NULL,
  char_count     INTEGER NOT NULL DEFAULT 0,
  token_estimate INTEGER NOT NULL DEFAULT 0,
  page           INTEGER,
  section        VARCHAR(200),
  metadata       JSONB NOT NULL DEFAULT '{}',
  content_hash   VARCHAR(64),
  UNIQUE (document_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_doc ON knowledge_chunks (document_id);

-- ------------------------------------------------------------
-- 4. knowledge_embeddings 向量（pgvector）
--    chunk_id 唯一（一个 chunk 一个当前向量）；dimension 与模型维度一致
--    （nomic-embed-text = 768；换模型需另行评估迁移）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS knowledge_embeddings (
  id            BIGSERIAL PRIMARY KEY,
  chunk_id      BIGINT NOT NULL UNIQUE REFERENCES knowledge_chunks(id) ON DELETE CASCADE,
  model         VARCHAR(100) NOT NULL,
  dimension     INTEGER NOT NULL,
  vector        vector(768) NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_embeddings_chunk ON knowledge_embeddings (chunk_id);

COMMIT;
