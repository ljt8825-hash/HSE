-- ============================================================
-- HSE V2.0 Sprint 1 - 安全资料中心数据库表
-- 说明: 仅新增表，不修改任何旧表，不 ALTER
-- 执行: psql -U postgres -d safety_dashboard -f sql/v2_document_tables.sql
-- 幂等: 全部使用 IF NOT EXISTS，可重复执行
-- ============================================================

-- ============================================================
-- V2 文件分类表（环卫安全资料分类，多级树结构）
-- ============================================================
CREATE TABLE IF NOT EXISTS document_categories (
    id           BIGSERIAL    PRIMARY KEY,
    parent_id    BIGINT       REFERENCES document_categories(id),
    code         VARCHAR(64)  NOT NULL,
    name         VARCHAR(128) NOT NULL,
    description  VARCHAR(512),
    icon         VARCHAR(64),
    sort_order   INTEGER      NOT NULL DEFAULT 0,
    status       VARCHAR(16)  NOT NULL DEFAULT 'active',
    created_by   VARCHAR(64),
    created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by   VARCHAR(64),
    updated_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_deleted   BOOLEAN      NOT NULL DEFAULT false
);
COMMENT ON TABLE  document_categories IS 'V2-文件分类表（环卫安全资料分类）';
COMMENT ON COLUMN document_categories.code IS '分类编码（唯一）';
COMMENT ON COLUMN document_categories.sort_order IS '排序序号';

CREATE UNIQUE INDEX IF NOT EXISTS uk_doc_category_code ON document_categories (code) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_doc_category_parent ON document_categories (parent_id);
CREATE INDEX IF NOT EXISTS idx_doc_category_status ON document_categories (status);

-- ============================================================
-- V2 文件标签表（人工标签 + 预留AI标签）
-- ============================================================
CREATE TABLE IF NOT EXISTS document_tags (
    id          BIGSERIAL    PRIMARY KEY,
    name        VARCHAR(64)  NOT NULL,
    color       VARCHAR(16),
    type        VARCHAR(16)  NOT NULL DEFAULT 'manual',
    usage_count INTEGER      NOT NULL DEFAULT 0,
    status      VARCHAR(16)  NOT NULL DEFAULT 'active',
    created_by  VARCHAR(64),
    created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_deleted  BOOLEAN      NOT NULL DEFAULT false
);
COMMENT ON TABLE  document_tags IS 'V2-文件标签表（人工+AI标签）';
COMMENT ON COLUMN document_tags.type IS '标签类型: manual(人工)/auto(AI)';

CREATE UNIQUE INDEX IF NOT EXISTS uk_doc_tag_name ON document_tags (name) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_doc_tag_type ON document_tags (type);

-- ============================================================
-- V2 文件主表
-- 含: 审查意见字段(来源/审核/AI) + 有效期字段(修正2)
-- ============================================================
CREATE TABLE IF NOT EXISTS document_files (
    id                  BIGSERIAL    PRIMARY KEY,
    file_uuid           VARCHAR(36)  NOT NULL,
    original_name       VARCHAR(256) NOT NULL,
    storage_name        VARCHAR(128) NOT NULL,
    file_path           VARCHAR(512) NOT NULL,
    file_url            VARCHAR(512),
    file_size           BIGINT       NOT NULL,
    file_type           VARCHAR(32)  NOT NULL,
    mime_type           VARCHAR(128) NOT NULL,
    category_id         BIGINT       REFERENCES document_categories(id),
    summary             TEXT,
    content_text        TEXT,
    analysis_status     VARCHAR(16)  NOT NULL DEFAULT 'pending',
    completeness_score  DECIMAL(5,2),
    risk_level          VARCHAR(16),
    -- 审查意见要求字段: 来源/审核/AI
    source_type         VARCHAR(32)  NOT NULL DEFAULT 'upload',
    source_id           VARCHAR(64),
    review_status       VARCHAR(16)  NOT NULL DEFAULT 'pending',
    ai_summary          TEXT,
    ai_score            DECIMAL(5,2),
    review_user         VARCHAR(64),
    review_time         TIMESTAMP,
    -- 修正2: 有效期字段
    valid_start_date    DATE,
    valid_end_date      DATE,
    remind_days         INTEGER      DEFAULT 30,
    status              VARCHAR(16)  NOT NULL DEFAULT 'active',
    uploaded_by         VARCHAR(64)  NOT NULL,
    uploaded_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_deleted          BOOLEAN      NOT NULL DEFAULT false,
    metadata            JSONB        NOT NULL DEFAULT '{}'
);
COMMENT ON TABLE  document_files IS 'V2-文件主表（含来源/审核/AI/有效期字段）';
COMMENT ON COLUMN document_files.source_type      IS '来源类型: upload/import/system/sync';
COMMENT ON COLUMN document_files.review_status    IS '审核状态: pending/approved/rejected';
COMMENT ON COLUMN document_files.ai_summary       IS 'AI生成的文件摘要';
COMMENT ON COLUMN document_files.ai_score         IS 'AI评分(0-100)';
COMMENT ON COLUMN document_files.valid_start_date IS '有效期开始日期';
COMMENT ON COLUMN document_files.valid_end_date   IS '有效期结束日期';
COMMENT ON COLUMN document_files.remind_days      IS '到期前提醒天数(默认30)';
COMMENT ON COLUMN document_files.analysis_status  IS '分析状态: pending/analyzing/completed/failed';

CREATE UNIQUE INDEX IF NOT EXISTS uk_doc_file_uuid ON document_files (file_uuid);
CREATE INDEX IF NOT EXISTS idx_doc_file_category ON document_files (category_id);
CREATE INDEX IF NOT EXISTS idx_doc_file_type ON document_files (file_type);
CREATE INDEX IF NOT EXISTS idx_doc_file_analysis ON document_files (analysis_status);
CREATE INDEX IF NOT EXISTS idx_doc_file_review ON document_files (review_status);
CREATE INDEX IF NOT EXISTS idx_doc_file_source ON document_files (source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_doc_file_valid_end ON document_files (valid_end_date);
CREATE INDEX IF NOT EXISTS idx_doc_file_uploaded ON document_files (uploaded_by);

-- ============================================================
-- V2 文件标签关联表
-- ============================================================
CREATE TABLE IF NOT EXISTS document_tag_relation (
    id         BIGSERIAL PRIMARY KEY,
    file_id    BIGINT    NOT NULL REFERENCES document_files(id),
    tag_id     BIGINT    NOT NULL REFERENCES document_tags(id),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
COMMENT ON TABLE document_tag_relation IS 'V2-文件标签关联表';

CREATE UNIQUE INDEX IF NOT EXISTS uk_doc_tag_rel ON document_tag_relation (file_id, tag_id);
CREATE INDEX IF NOT EXISTS idx_doc_tag_rel_file ON document_tag_relation (file_id);
CREATE INDEX IF NOT EXISTS idx_doc_tag_rel_tag ON document_tag_relation (tag_id);

-- ============================================================
-- V2 文件版本表（Sprint1 仅建表预留，不开发页面）
-- ============================================================
CREATE TABLE IF NOT EXISTS document_versions (
    id                  BIGSERIAL    PRIMARY KEY,
    file_id             BIGINT       NOT NULL REFERENCES document_files(id),
    version_number      VARCHAR(32)  NOT NULL,
    version_description VARCHAR(512),
    storage_name        VARCHAR(128) NOT NULL,
    file_path           VARCHAR(512) NOT NULL,
    file_size           BIGINT       NOT NULL,
    is_latest           BOOLEAN      NOT NULL DEFAULT true,
    status              VARCHAR(16)  NOT NULL DEFAULT 'active',
    created_by          VARCHAR(64)  NOT NULL,
    created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_deleted          BOOLEAN      NOT NULL DEFAULT false
);
COMMENT ON TABLE document_versions IS 'V2-文件版本表（Sprint1仅建表预留，不开发页面）';

CREATE INDEX IF NOT EXISTS idx_doc_ver_file ON document_versions (file_id);
CREATE INDEX IF NOT EXISTS idx_doc_ver_latest ON document_versions (file_id, is_latest) WHERE is_deleted = false;

-- ============================================================
-- V2 资料与标准关联表（Sprint1 仅建表预留，不开发页面）
-- 使用 clause_code 字符串关联，无外键，解除Sprint顺序依赖
-- ============================================================
CREATE TABLE IF NOT EXISTS document_standard_relation (
    id               BIGSERIAL    PRIMARY KEY,
    file_id          BIGINT       NOT NULL REFERENCES document_files(id),
    clause_code      VARCHAR(64)  NOT NULL,
    clause_name      VARCHAR(256),
    match_type       VARCHAR(16)  NOT NULL DEFAULT 'auto',
    match_confidence DECIMAL(5,2),
    status           VARCHAR(16)  NOT NULL DEFAULT 'valid',
    verified_by      VARCHAR(64),
    verified_at      TIMESTAMP,
    remark           VARCHAR(512),
    created_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_deleted       BOOLEAN      NOT NULL DEFAULT false
);
COMMENT ON TABLE  document_standard_relation IS 'V2-资料标准关联表（Sprint1仅建表预留，clause_code关联）';
COMMENT ON COLUMN document_standard_relation.clause_code IS '标准条款编码（与Sprint4的safety_standard_clauses.code关联，无外键）';

CREATE UNIQUE INDEX IF NOT EXISTS uk_doc_std_rel ON document_standard_relation (file_id, clause_code);
CREATE INDEX IF NOT EXISTS idx_doc_std_rel_file ON document_standard_relation (file_id);
CREATE INDEX IF NOT EXISTS idx_doc_std_rel_code ON document_standard_relation (clause_code);
