-- ============================================================
-- 规章制度模块 v2 迁移脚本
-- 日期：2026-07-17
-- 说明：新增附件管理、版本管理、时效提醒相关表与字段
-- 兼容性：所有 ALTER 均使用 IF NOT EXISTS，可重复执行
-- ============================================================

-- ============================================================
-- 1. regulations 表字段扩展（时效提醒与完整性）
-- ============================================================
-- issue_date 发布日期
ALTER TABLE regulations ADD COLUMN IF NOT EXISTS issue_date DATE;
-- validity_period 有效期（月），NULL 表示长期有效
ALTER TABLE regulations ADD COLUMN IF NOT EXISTS validity_period INTEGER;
-- issuer 发布机构
ALTER TABLE regulations ADD COLUMN IF NOT EXISTS issuer VARCHAR(255);
-- document_no 文号
ALTER TABLE regulations ADD COLUMN IF NOT EXISTS document_no VARCHAR(128);
-- summary 摘要
ALTER TABLE regulations ADD COLUMN IF NOT EXISTS summary TEXT;
-- content 制度正文内容
ALTER TABLE regulations ADD COLUMN IF NOT EXISTS content TEXT;
-- title 制度标题（与 name 并存，前端使用 title）
ALTER TABLE regulations ADD COLUMN IF NOT EXISTS title VARCHAR(255);
-- type 制度类型（law/regulation/standard/procedure/guideline）
ALTER TABLE regulations ADD COLUMN IF NOT EXISTS type VARCHAR(32);

-- ============================================================
-- 2. regulation_attachments 附件表
-- ============================================================
CREATE TABLE IF NOT EXISTS regulation_attachments (
    id              BIGSERIAL PRIMARY KEY,
    regulation_id   BIGINT NOT NULL,
    filename        VARCHAR(255) NOT NULL,
    original_name   VARCHAR(255) NOT NULL,
    file_type       VARCHAR(64) NOT NULL DEFAULT 'document',
    file_size       BIGINT NOT NULL DEFAULT 0,
    file_url        VARCHAR(512) NOT NULL,
    version         VARCHAR(32) NOT NULL DEFAULT '1.0',
    uploaded_by     VARCHAR(64),
    is_latest       BOOLEAN NOT NULL DEFAULT TRUE,
    is_deleted      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_reg_attachments_reg ON regulation_attachments(regulation_id);
CREATE INDEX IF NOT EXISTS idx_reg_attachments_latest ON regulation_attachments(regulation_id, is_latest) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_reg_attachments_version ON regulation_attachments(regulation_id, version);

-- 外键（可选，若 regulations 表存在则添加）
-- ALTER TABLE regulation_attachments ADD CONSTRAINT fk_reg_attachments_reg
--     FOREIGN KEY (regulation_id) REFERENCES regulations(id) ON DELETE CASCADE;

-- ============================================================
-- 3. regulation_versions 版本履历表
-- ============================================================
-- 复用 regulations 表本身记录历史版本（通过 parent_id 关联），
-- 此表仅记录版本变更履历（轻量级审计）
CREATE TABLE IF NOT EXISTS regulation_versions (
    id              BIGSERIAL PRIMARY KEY,
    regulation_id   BIGINT NOT NULL,
    version         VARCHAR(32) NOT NULL,
    change_type     VARCHAR(32) NOT NULL DEFAULT 'update',
    change_summary  TEXT,
    changed_by      VARCHAR(64),
    snapshot        JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reg_versions_reg ON regulation_versions(regulation_id);
CREATE INDEX IF NOT EXISTS idx_reg_versions_created ON regulation_versions(created_at);

-- ============================================================
-- 4. 数据迁移：若 regulations.title 为空，用 name 填充
-- ============================================================
UPDATE regulations SET title = name WHERE title IS NULL AND name IS NOT NULL;
UPDATE regulations SET document_no = category WHERE document_no IS NULL;

-- ============================================================
-- 5. 回滚脚本（如需回滚，执行以下语句）
-- ============================================================
-- DROP TABLE IF EXISTS regulation_versions;
-- DROP TABLE IF EXISTS regulation_attachments;
-- ALTER TABLE regulations DROP COLUMN IF EXISTS title;
-- ALTER TABLE regulations DROP COLUMN IF EXISTS content;
-- ALTER TABLE regulations DROP COLUMN IF EXISTS summary;
-- ALTER TABLE regulations DROP COLUMN IF EXISTS document_no;
-- ALTER TABLE regulations DROP COLUMN IF EXISTS issuer;
-- ALTER TABLE regulations DROP COLUMN IF EXISTS validity_period;
-- ALTER TABLE regulations DROP COLUMN IF EXISTS issue_date;
