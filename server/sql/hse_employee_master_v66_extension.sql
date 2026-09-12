-- =====================================================================
-- HSE 隐患整改闭环中心 v66 扩展迁移脚本
-- 版本: v66 (Sprint5.5 扩展)
-- 内容: 新增 rectification_task、rectification_action、review_record 三张表
--       扩展 hazard_record 表新增 AI 建议字段
-- 依据: sprint5.5-design-document.md
-- 方式: 增量迁移，可重复执行
-- =====================================================================

BEGIN;

-- ============================================================
-- 一、扩展 hazard_record 表 - 新增 AI 建议字段
-- ============================================================

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'hazard_record' AND column_name = 'ai_suggestions') THEN
        ALTER TABLE hazard_record ADD COLUMN ai_suggestions TEXT;
        RAISE NOTICE 'Added ai_suggestions column to hazard_record';
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'hazard_record' AND column_name = 'ai_risk_hint') THEN
        ALTER TABLE hazard_record ADD COLUMN ai_risk_hint TEXT;
        RAISE NOTICE 'Added ai_risk_hint column to hazard_record';
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'hazard_record' AND column_name = 'report_date') THEN
        ALTER TABLE hazard_record ADD COLUMN report_date TIMESTAMP;
        RAISE NOTICE 'Added report_date column to hazard_record';
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'hazard_record' AND column_name = 'reported_by') THEN
        ALTER TABLE hazard_record ADD COLUMN reported_by BIGINT;
        RAISE NOTICE 'Added reported_by column to hazard_record';
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'hazard_record' AND column_name = 'hazard_level') THEN
        ALTER TABLE hazard_record ADD COLUMN hazard_level VARCHAR(20);
        RAISE NOTICE 'Added hazard_level column to hazard_record';
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'hazard_record' AND column_name = 'hazard_type') THEN
        ALTER TABLE hazard_record ADD COLUMN hazard_type VARCHAR(32);
        RAISE NOTICE 'Added hazard_type column to hazard_record';
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'hazard_record' AND column_name = 'location') THEN
        ALTER TABLE hazard_record ADD COLUMN location VARCHAR(128);
        RAISE NOTICE 'Added location column to hazard_record';
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'hazard_record' AND column_name = 'hazard_title') THEN
        ALTER TABLE hazard_record ADD COLUMN hazard_title VARCHAR(256);
        RAISE NOTICE 'Added hazard_title column to hazard_record';
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'hazard_record' AND column_name = 'hazard_description') THEN
        ALTER TABLE hazard_record ADD COLUMN hazard_description TEXT;
        RAISE NOTICE 'Added hazard_description column to hazard_record';
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'hazard_record' AND column_name = 'hazard_code') THEN
        ALTER TABLE hazard_record ADD COLUMN hazard_code VARCHAR(64);
        RAISE NOTICE 'Added hazard_code column to hazard_record';
    END IF;
END $$;

-- 为 hazard_code 添加唯一索引（仅当字段存在且索引不存在时）
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hazard_record' AND column_name = 'hazard_code') THEN
        IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'hazard_record' AND indexname = 'uk_hazard_record_code') THEN
            CREATE UNIQUE INDEX uk_hazard_record_code ON hazard_record(hazard_code) WHERE is_deleted = false;
            RAISE NOTICE 'Created unique index uk_hazard_record_code';
        END IF;
    END IF;
END $$;

-- ============================================================
-- 二、rectification_task — 整改任务表
-- ============================================================

CREATE TABLE IF NOT EXISTS rectification_task (
    id                      BIGSERIAL PRIMARY KEY,
    task_code               VARCHAR(64) NOT NULL,
    hazard_id               BIGINT NOT NULL,
    task_title              VARCHAR(128) NOT NULL,
    description             TEXT,
    responsible_id          BIGINT NOT NULL,
    department_id           BIGINT,
    deadline_date           DATE NOT NULL,
    actual_completion_date  DATE,
    status                  VARCHAR(20) NOT NULL DEFAULT 'pending',
    progress                INTEGER DEFAULT 0,
    priority                VARCHAR(20) DEFAULT 'normal',
    created_by              BIGINT,
    created_at              TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMP NOT NULL DEFAULT NOW(),
    is_deleted              BOOLEAN NOT NULL DEFAULT FALSE
);

-- 索引
CREATE UNIQUE INDEX IF NOT EXISTS uk_rectification_task_code
    ON rectification_task (task_code) WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_rectification_task_hazard
    ON rectification_task (hazard_id) WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_rectification_task_responsible
    ON rectification_task (responsible_id) WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_rectification_task_status
    ON rectification_task (status) WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_rectification_task_deadline
    ON rectification_task (deadline_date) WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_rectification_task_department
    ON rectification_task (department_id) WHERE department_id IS NOT NULL AND is_deleted = false;

-- 注释
COMMENT ON TABLE rectification_task IS 'HSE隐患整改任务表（Sprint5.5 v66）';
COMMENT ON COLUMN rectification_task.task_code IS '任务编号（唯一）';
COMMENT ON COLUMN rectification_task.hazard_id IS '关联隐患ID（hazard_record.id）';
COMMENT ON COLUMN rectification_task.task_title IS '任务标题';
COMMENT ON COLUMN rectification_task.description IS '任务描述';
COMMENT ON COLUMN rectification_task.responsible_id IS '责任人ID（关联employee.id）';
COMMENT ON COLUMN rectification_task.department_id IS '责任部门ID';
COMMENT ON COLUMN rectification_task.deadline_date IS '整改期限';
COMMENT ON COLUMN rectification_task.actual_completion_date IS '实际完成日期';
COMMENT ON COLUMN rectification_task.status IS '任务状态：pending/processing/completed/cancelled';
COMMENT ON COLUMN rectification_task.progress IS '进度百分比（0-100）';
COMMENT ON COLUMN rectification_task.priority IS '优先级：low/normal/high/urgent';
COMMENT ON COLUMN rectification_task.created_by IS '创建人ID（关联employee.id）';
COMMENT ON COLUMN rectification_task.is_deleted IS '软删除标识';

-- ============================================================
-- 三、rectification_action — 整改措施表
-- ============================================================

CREATE TABLE IF NOT EXISTS rectification_action (
    id                      BIGSERIAL PRIMARY KEY,
    task_id                 BIGINT NOT NULL,
    action_code             VARCHAR(64),
    action_description      TEXT NOT NULL,
    action_type             VARCHAR(32),
    responsible_id          BIGINT,
    resource_required       TEXT,
    estimated_cost          NUMERIC(12,2),
    planned_start_date      DATE,
    planned_end_date        DATE,
    actual_start_date       DATE,
    actual_end_date         DATE,
    status                  VARCHAR(20) NOT NULL DEFAULT 'pending',
    completion_note         TEXT,
    created_by              BIGINT,
    created_at              TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMP NOT NULL DEFAULT NOW(),
    is_deleted              BOOLEAN NOT NULL DEFAULT FALSE
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_rectification_action_task
    ON rectification_action (task_id) WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_rectification_action_responsible
    ON rectification_action (responsible_id) WHERE responsible_id IS NOT NULL AND is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_rectification_action_status
    ON rectification_action (status) WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_rectification_action_action_code
    ON rectification_action (action_code) WHERE action_code IS NOT NULL AND is_deleted = false;

-- 注释
COMMENT ON TABLE rectification_action IS 'HSE隐患整改措施表（Sprint5.5 v66）';
COMMENT ON COLUMN rectification_action.task_id IS '关联整改任务ID（rectification_task.id）';
COMMENT ON COLUMN rectification_action.action_code IS '措施编号';
COMMENT ON COLUMN rectification_action.action_description IS '措施描述';
COMMENT ON COLUMN rectification_action.action_type IS '措施类型：engineering/administrative/personal/emergency';
COMMENT ON COLUMN rectification_action.responsible_id IS '措施责任人ID（关联employee.id）';
COMMENT ON COLUMN rectification_action.resource_required IS '所需资源';
COMMENT ON COLUMN rectification_action.estimated_cost IS '预估费用';
COMMENT ON COLUMN rectification_action.planned_start_date IS '计划开始日期';
COMMENT ON COLUMN rectification_action.planned_end_date IS '计划结束日期';
COMMENT ON COLUMN rectification_action.actual_start_date IS '实际开始日期';
COMMENT ON COLUMN rectification_action.actual_end_date IS '实际结束日期';
COMMENT ON COLUMN rectification_action.status IS '措施状态：pending/in_progress/completed/cancelled';
COMMENT ON COLUMN rectification_action.completion_note IS '完成说明';
COMMENT ON COLUMN rectification_action.created_by IS '创建人ID（关联employee.id）';
COMMENT ON COLUMN rectification_action.is_deleted IS '软删除标识';

-- ============================================================
-- 四、review_record — 复查记录表
-- ============================================================

CREATE TABLE IF NOT EXISTS review_record (
    id                      BIGSERIAL PRIMARY KEY,
    review_code             VARCHAR(64) NOT NULL,
    hazard_id               BIGINT NOT NULL,
    task_id                 BIGINT,
    reviewer_id             BIGINT NOT NULL,
    review_date             TIMESTAMP NOT NULL,
    review_result           VARCHAR(20) NOT NULL,
    review_score            NUMERIC(4,2),
    review_note             TEXT,
    recurrence_hazard_id    BIGINT,
    is_final                BOOLEAN DEFAULT FALSE,
    created_by              BIGINT,
    created_at              TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMP NOT NULL DEFAULT NOW(),
    is_deleted              BOOLEAN NOT NULL DEFAULT FALSE
);

-- 索引
CREATE UNIQUE INDEX IF NOT EXISTS uk_review_record_code
    ON review_record (review_code) WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_review_record_hazard
    ON review_record (hazard_id) WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_review_record_task
    ON review_record (task_id) WHERE task_id IS NOT NULL AND is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_review_record_reviewer
    ON review_record (reviewer_id) WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_review_record_result
    ON review_record (review_result) WHERE is_deleted = false;

-- 注释
COMMENT ON TABLE review_record IS 'HSE隐患复查记录表（Sprint5.5 v66）';
COMMENT ON COLUMN review_record.review_code IS '复查编号（唯一）';
COMMENT ON COLUMN review_record.hazard_id IS '关联隐患ID（hazard_record.id）';
COMMENT ON COLUMN review_record.task_id IS '关联整改任务ID（rectification_task.id）';
COMMENT ON COLUMN review_record.reviewer_id IS '复查人ID（关联employee.id）';
COMMENT ON COLUMN review_record.review_date IS '复查日期';
COMMENT ON COLUMN review_record.review_result IS '复查结果：pass/fail/partial';
COMMENT ON COLUMN review_record.review_score IS '复查评分（0-100）';
COMMENT ON COLUMN review_record.review_note IS '复查备注';
COMMENT ON COLUMN review_record.recurrence_hazard_id IS '复发隐患ID';
COMMENT ON COLUMN review_record.is_final IS '是否最终复查';
COMMENT ON COLUMN review_record.created_by IS '创建人ID（关联employee.id）';
COMMENT ON COLUMN review_record.is_deleted IS '软删除标识';

-- ============================================================
-- 五、验证查询
-- ============================================================

DO $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count FROM information_schema.tables
    WHERE table_name IN ('rectification_task', 'rectification_action', 'review_record');
    RAISE NOTICE 'v66迁移验证：新增表 % 个', v_count;
    
    SELECT COUNT(*) INTO v_count FROM information_schema.columns
    WHERE table_name = 'hazard_record' AND column_name IN ('ai_suggestions', 'ai_risk_hint', 'report_date', 'reported_by', 'hazard_level', 'hazard_type', 'location', 'hazard_title', 'hazard_description', 'hazard_code');
    RAISE NOTICE 'v66迁移验证：hazard_record新增字段 % 个', v_count;
END $$;

COMMIT;