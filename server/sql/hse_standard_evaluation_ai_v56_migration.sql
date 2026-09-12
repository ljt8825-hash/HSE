-- ============================================================
-- HSE 标准化评价 AI 辅助功能扩展迁移脚本
-- 版本：v2.0 Sprint4 Phase5
-- 日期：2026-07-19
-- 说明：扩展 standard_evaluation_tasks 和 standard_evaluation_items
--       以支持 AI 辅助评价功能
-- 约束：
--   1. 只新增字段/索引，不修改已有字段类型，不删除字段
--   2. 所有操作使用 IF NOT EXISTS，幂等可重复执行
--   3. 事务包裹，失败回滚
-- ============================================================

BEGIN;

-- ============================================================
-- 1. 扩展 standard_evaluation_tasks 表
-- ============================================================

-- ai_started_at AI 开始时间
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='standard_evaluation_tasks' AND column_name='ai_started_at'
    ) THEN
        ALTER TABLE standard_evaluation_tasks ADD COLUMN ai_started_at TIMESTAMPTZ;
        COMMENT ON COLUMN standard_evaluation_tasks.ai_started_at IS 'AI评价开始时间';
    END IF;
END $$;

-- ai_completed_at AI 完成时间
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='standard_evaluation_tasks' AND column_name='ai_completed_at'
    ) THEN
        ALTER TABLE standard_evaluation_tasks ADD COLUMN ai_completed_at TIMESTAMPTZ;
        COMMENT ON COLUMN standard_evaluation_tasks.ai_completed_at IS 'AI评价完成时间';
    END IF;
END $$;

-- ai_total_items AI 评价总条数
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='standard_evaluation_tasks' AND column_name='ai_total_items'
    ) THEN
        ALTER TABLE standard_evaluation_tasks ADD COLUMN ai_total_items INTEGER DEFAULT 0;
        COMMENT ON COLUMN standard_evaluation_tasks.ai_total_items IS 'AI评价总条款数';
    END IF;
END $$;

-- ai_completed_items AI 已完成条数（用于进度显示）
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='standard_evaluation_tasks' AND column_name='ai_completed_items'
    ) THEN
        ALTER TABLE standard_evaluation_tasks ADD COLUMN ai_completed_items INTEGER DEFAULT 0;
        COMMENT ON COLUMN standard_evaluation_tasks.ai_completed_items IS 'AI评价已完成条数';
    END IF;
END $$;

-- ai_failed_items AI 失败条数
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='standard_evaluation_tasks' AND column_name='ai_failed_items'
    ) THEN
        ALTER TABLE standard_evaluation_tasks ADD COLUMN ai_failed_items INTEGER DEFAULT 0;
        COMMENT ON COLUMN standard_evaluation_tasks.ai_failed_items IS 'AI评价失败条数';
    END IF;
END $$;

-- ai_error_message AI 错误信息
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='standard_evaluation_tasks' AND column_name='ai_error_message'
    ) THEN
        ALTER TABLE standard_evaluation_tasks ADD COLUMN ai_error_message TEXT;
        COMMENT ON COLUMN standard_evaluation_tasks.ai_error_message IS 'AI评价错误信息';
    END IF;
END $$;

-- ai_summary AI 总体评价摘要（辅助）
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='standard_evaluation_tasks' AND column_name='ai_summary'
    ) THEN
        ALTER TABLE standard_evaluation_tasks ADD COLUMN ai_summary TEXT;
        COMMENT ON COLUMN standard_evaluation_tasks.ai_summary IS 'AI总体评价摘要（仅辅助，不作为最终结论）';
    END IF;
END $$;

-- prompt_version 评价使用的 Prompt 版本
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='standard_evaluation_tasks' AND column_name='prompt_version'
    ) THEN
        ALTER TABLE standard_evaluation_tasks ADD COLUMN prompt_version VARCHAR(32) DEFAULT 'v1.0';
        COMMENT ON COLUMN standard_evaluation_tasks.prompt_version IS 'AI评价使用的Prompt版本';
    END IF;
END $$;

-- ============================================================
-- 2. 扩展 standard_evaluation_items 表
-- ============================================================

-- ai_findings AI 发现的问题点（JSONB 数组）
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='standard_evaluation_items' AND column_name='ai_findings'
    ) THEN
        ALTER TABLE standard_evaluation_items ADD COLUMN ai_findings JSONB DEFAULT '[]'::jsonb;
        COMMENT ON COLUMN standard_evaluation_items.ai_findings IS 'AI发现的问题点列表';
    END IF;
END $$;

-- ai_missing_items AI 识别的缺项（JSONB 数组）
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='standard_evaluation_items' AND column_name='ai_missing_items'
    ) THEN
        ALTER TABLE standard_evaluation_items ADD COLUMN ai_missing_items JSONB DEFAULT '[]'::jsonb;
        COMMENT ON COLUMN standard_evaluation_items.ai_missing_items IS 'AI识别的缺项/缺失资料列表';
    END IF;
END $$;

-- ai_evidence_files AI 引用的证据文件ID列表（JSONB 数组）
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='standard_evaluation_items' AND column_name='ai_evidence_files'
    ) THEN
        ALTER TABLE standard_evaluation_items ADD COLUMN ai_evidence_files JSONB DEFAULT '[]'::jsonb;
        COMMENT ON COLUMN standard_evaluation_items.ai_evidence_files IS 'AI引用的证据文件ID列表';
    END IF;
END $$;

-- ai_processed_at AI 处理时间
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='standard_evaluation_items' AND column_name='ai_processed_at'
    ) THEN
        ALTER TABLE standard_evaluation_items ADD COLUMN ai_processed_at TIMESTAMPTZ;
        COMMENT ON COLUMN standard_evaluation_items.ai_processed_at IS 'AI处理时间';
    END IF;
END $$;

-- ai_error AI 错误信息（单条失败时记录）
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='standard_evaluation_items' AND column_name='ai_error'
    ) THEN
        ALTER TABLE standard_evaluation_items ADD COLUMN ai_error TEXT;
        COMMENT ON COLUMN standard_evaluation_items.ai_error IS 'AI评价错误信息（单条）';
    END IF;
END $$;

-- ============================================================
-- 3. 补充索引
-- ============================================================

-- 按 AI 状态查询
CREATE INDEX IF NOT EXISTS idx_eval_task_ai_status
    ON standard_evaluation_tasks(ai_status) WHERE is_deleted = FALSE;

-- 按任务+AI 状态查询明细
CREATE INDEX IF NOT EXISTS idx_eval_item_task_ai_verdict
    ON standard_evaluation_items(task_id, ai_verdict) WHERE is_deleted = FALSE;

COMMIT;
