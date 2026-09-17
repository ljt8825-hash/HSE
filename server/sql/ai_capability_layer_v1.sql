-- ============================================================
-- AI-02 HSE AI 能力层最小化数据库结构（migration 文件）
--
-- 状态：已编写，【未执行】。执行需用户授权（生产边界规则 + AI-02 任务书 §15/§24/§25）。
-- AI-03 Preflight 结论：safety_dashboard / safety_dashboard_dev 两库均不存在
-- ai_prompt_registry 与 ai_generation_records（to_regclass 均为 NULL），
-- 故本文件以 CREATE TABLE IF NOT EXISTS 全量建表，并对扩展字段再补 ADD COLUMN IF NOT EXISTS，
-- 保证「表不存在 → 全量创建」「表存在但缺扩展字段 → 增量补齐」两种场景都幂等。
--
-- 原则：只新增 AI 基础设施；不修改已有业务数据；不修改 WPS/三违；不删除现有字段；
--       向后兼容；最小化（不一次创建十几张表）。
--
-- 包含：
--   1. ai_prompt_registry 表（Prompt 版本注册表，AI-02 任务书 §25）
--   2. ai_generation_records 表（AI-02 任务书 §15 最小结构 + AI-03 扩展审计字段）
--
-- 执行方式（由用户/受权环境执行，非 AI 自动执行）：
--   psql -f ai_capability_layer_v1.sql
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. AI Prompt 注册表
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_prompt_registry (
  id                  BIGSERIAL PRIMARY KEY,
  prompt_key          VARCHAR(100) NOT NULL,          -- 语义键（消费方引用，如 hse.general.analysis）
  version             VARCHAR(20)  NOT NULL,          -- 版本（v1.0 / v2.0 ...）
  name                VARCHAR(200),                   -- 中文名
  description         TEXT,                           -- 描述
  system_prompt       TEXT,                           -- 系统提示词
  user_prompt_template TEXT,                          -- 用户提示词模板（{data}/{custom_instructions} 占位符）
  status              VARCHAR(20) NOT NULL DEFAULT 'DRAFT',  -- DRAFT | ACTIVE | DISABLED
  created_by          BIGINT,                         -- users.id（只读引用，不建外键）
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (prompt_key, version)
);

CREATE INDEX IF NOT EXISTS idx_ai_prompt_registry_key_active
  ON ai_prompt_registry (prompt_key, status);

-- ------------------------------------------------------------
-- 2. ai_generation_records（AI-02 最小结构 + AI-03 扩展审计字段，全量建表）
--    与现有代码（aiEnhancedService / aiGenerationRecordService）列契约一致：
--    user_id/type/sub_type/title/prompt/result/provider/model/input_tokens/output_tokens/
--    duration_ms/status/error_message + created_at/updated_at
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_generation_records (
  id             BIGSERIAL PRIMARY KEY,
  user_id        BIGINT,                              -- users.id（只读引用，不建外键）
  type           VARCHAR(50)  NOT NULL DEFAULT 'report',   -- report / analysis / qa ...
  sub_type       VARCHAR(100),                        -- 业务子类型（hazard/accident/...）
  title          VARCHAR(300),
  prompt         TEXT,
  result         TEXT,
  provider       VARCHAR(50),
  model          VARCHAR(100),
  input_tokens   INTEGER      NOT NULL DEFAULT 0,
  output_tokens  INTEGER      NOT NULL DEFAULT 0,
  duration_ms    INTEGER,
  status         VARCHAR(20)  NOT NULL DEFAULT 'success',   -- success / error / running
  error_message  TEXT,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 3. ai_generation_records 扩展字段（AI-02/AI-03 最小扩展，保持向后兼容）
--    说明：这些字段用于统一审计追踪（request → prompt_key → version → provider → model → result）。
--    ADD COLUMN IF NOT EXISTS 保证「老表 + 新字段」场景幂等。
-- ------------------------------------------------------------
ALTER TABLE ai_generation_records
  ADD COLUMN IF NOT EXISTS request_id     VARCHAR(64),   -- AI-02 requestId（uuid）
  ADD COLUMN IF NOT EXISTS prompt_key     VARCHAR(100),  -- Prompt Registry 键
  ADD COLUMN IF NOT EXISTS prompt_version VARCHAR(20),   -- Prompt 版本
  ADD COLUMN IF NOT EXISTS evidence       JSONB;         -- 统一证据链（createEvidence 结构数组）

CREATE INDEX IF NOT EXISTS idx_ai_records_request_id ON ai_generation_records (request_id);
CREATE INDEX IF NOT EXISTS idx_ai_records_prompt_key ON ai_generation_records (prompt_key);

COMMIT;
