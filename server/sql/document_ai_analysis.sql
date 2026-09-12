-- ============================================================
-- HSE 安全资料 AI 分析表迁移脚本
-- 版本：v2.0 Sprint2
-- 日期：2026-07-19
-- 说明：新增 document_ai_analysis 表，扩展 document_files 缓存字段
-- ============================================================

-- ============================================================
-- 1. document_ai_analysis 表：AI 分析任务与结果详情
-- ============================================================
CREATE TABLE IF NOT EXISTS document_ai_analysis (
    id                  BIGSERIAL PRIMARY KEY,

    -- 关联文件（逻辑关联，无外键）
    file_id             BIGINT NOT NULL,

    -- 任务状态: pending / processing / completed / failed
    status              VARCHAR(20) NOT NULL DEFAULT 'pending',

    -- 分析依据: full_text / metadata_only / filename_only
    analysis_basis      VARCHAR(20) NOT NULL DEFAULT 'filename_only',

    -- Prompt 版本号，用于追踪迭代
    prompt_version      VARCHAR(20) DEFAULT 'v1.0',

    -- 文本提取信息
    extract_method      VARCHAR(50),
    extract_text_length INTEGER DEFAULT 0,
    extract_error       TEXT,

    -- AI 分析结果
    ai_summary          TEXT,
    ai_score            INTEGER,
    ai_risk_level       VARCHAR(20),
    ai_suggestions      JSONB,
    ai_missing_items    JSONB,
    ai_keywords         JSONB,
    ai_full_response    TEXT,

    -- AI 调用元数据（数据库预留，暂不做管理界面）
    ai_provider         VARCHAR(20),
    ai_model            VARCHAR(50),
    ai_input_tokens     INTEGER DEFAULT 0,
    ai_output_tokens    INTEGER DEFAULT 0,
    ai_duration_ms      INTEGER,

    -- 人工确认状态
    confirmed_status    VARCHAR(20) DEFAULT 'unconfirmed',
    confirmed_by        VARCHAR(100),
    confirmed_at        TIMESTAMP,

    -- 错误信息
    error_message       TEXT,
    error_stack         TEXT,
    failed_at           TIMESTAMP,

    -- 审计字段
    triggered_by        VARCHAR(100),
    triggered_at        TIMESTAMP DEFAULT NOW(),
    started_at          TIMESTAMP,
    completed_at        TIMESTAMP,

    -- 公共字段
    is_deleted          BOOLEAN DEFAULT FALSE,
    created_at          TIMESTAMP DEFAULT NOW(),
    updated_at          TIMESTAMP DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_ai_analysis_file_id ON document_ai_analysis(file_id);
CREATE INDEX IF NOT EXISTS idx_ai_analysis_status ON document_ai_analysis(status);
CREATE INDEX IF NOT EXISTS idx_ai_analysis_triggered_at ON document_ai_analysis(triggered_at DESC);

-- 注释
COMMENT ON TABLE document_ai_analysis IS '安全资料AI分析任务表';
COMMENT ON COLUMN document_ai_analysis.file_id IS '关联文件ID（逻辑关联，无外键）';
COMMENT ON COLUMN document_ai_analysis.status IS '任务状态: pending / processing / completed / failed';
COMMENT ON COLUMN document_ai_analysis.analysis_basis IS '分析依据: full_text(全文解析) / metadata_only(仅元数据) / filename_only(仅文件名)';
COMMENT ON COLUMN document_ai_analysis.prompt_version IS 'Prompt模板版本号';
COMMENT ON COLUMN document_ai_analysis.ai_suggestions IS '标准建议列表，格式: [{standard, suggestion, level}]';
COMMENT ON COLUMN document_ai_analysis.ai_missing_items IS '缺项清单，格式: [{item, reason, priority}]';
COMMENT ON COLUMN document_ai_analysis.ai_keywords IS '关键词标签数组';
COMMENT ON COLUMN document_ai_analysis.confirmed_status IS '人工确认状态: unconfirmed / confirmed / rejected';
COMMENT ON COLUMN document_ai_analysis.confirmed_by IS '确认人用户名';
COMMENT ON COLUMN document_ai_analysis.confirmed_at IS '确认时间';
COMMENT ON COLUMN document_ai_analysis.failed_at IS '失败时间';

-- ============================================================
-- 2. document_files 表：新增 latest_ai_analysis_id 缓存字段
-- ============================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'document_files' AND column_name = 'latest_ai_analysis_id'
    ) THEN
        ALTER TABLE document_files ADD COLUMN latest_ai_analysis_id BIGINT;
        COMMENT ON COLUMN document_files.latest_ai_analysis_id IS '最新AI分析记录ID（逻辑关联，无外键）';
    END IF;
END $$;
