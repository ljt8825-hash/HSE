-- ============================================================
-- HSE 标准条款与安全资料关联表扩展迁移脚本
-- 版本：v2.0 Sprint4 Phase4
-- 日期：2026-07-19
-- 说明：document_standard_relation 表在 Sprint1 已创建（file_id/clause_code/clause_name）
--       本脚本扩展字段以满足 Phase4 需求：
--       - clause_id    关联条款ID（便于精确查询）
--       - match_reason 匹配命中说明
--       - confirmed_by 确认人ID
--       - confirmed_at 确认时间
--       - updated_at   更新时间
--       并补充索引与默认值调整
-- 约束：
--   1. 只新增字段/索引，不修改已有字段类型，不删除字段
--   2. 所有操作使用 IF NOT EXISTS，幂等可重复执行
--   3. 事务包裹，失败回滚
-- ============================================================

BEGIN;

-- ============================================================
-- 1. 扩展字段（仅新增，不改已有字段）
-- ============================================================

-- clause_id 关联 safety_standard_clauses.id
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='document_standard_relation' AND column_name='clause_id'
    ) THEN
        ALTER TABLE document_standard_relation ADD COLUMN clause_id BIGINT;
        COMMENT ON COLUMN document_standard_relation.clause_id IS '关联 safety_standard_clauses.id（与 clause_code 冗余，便于精确查询）';
    END IF;
END $$;

-- match_reason 匹配命中说明
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='document_standard_relation' AND column_name='match_reason'
    ) THEN
        ALTER TABLE document_standard_relation ADD COLUMN match_reason TEXT;
        COMMENT ON COLUMN document_standard_relation.match_reason IS '匹配命中说明（如命中的关键词列表）';
    END IF;
END $$;

-- confirmed_by 确认人ID
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='document_standard_relation' AND column_name='confirmed_by'
    ) THEN
        ALTER TABLE document_standard_relation ADD COLUMN confirmed_by BIGINT;
        COMMENT ON COLUMN document_standard_relation.confirmed_by IS '确认人ID';
    END IF;
END $$;

-- confirmed_at 确认时间
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='document_standard_relation' AND column_name='confirmed_at'
    ) THEN
        ALTER TABLE document_standard_relation ADD COLUMN confirmed_at TIMESTAMPTZ;
        COMMENT ON COLUMN document_standard_relation.confirmed_at IS '确认时间';
    END IF;
END $$;

-- updated_at 更新时间
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='document_standard_relation' AND column_name='updated_at'
    ) THEN
        ALTER TABLE document_standard_relation ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
        COMMENT ON COLUMN document_standard_relation.updated_at IS '更新时间';
    END IF;
END $$;

-- created_by 创建人ID
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='document_standard_relation' AND column_name='created_by'
    ) THEN
        ALTER TABLE document_standard_relation ADD COLUMN created_by BIGINT;
        COMMENT ON COLUMN document_standard_relation.created_by IS '创建人ID';
    END IF;
END $$;

-- ============================================================
-- 2. 补充约束
-- ============================================================

-- status 约束（如果不存在则添加）
-- 注意：已有数据可能存在非枚举值，仅在无数据或全部合法时添加
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname='document_standard_relation_status_check'
    ) THEN
        BEGIN
            ALTER TABLE document_standard_relation
            ADD CONSTRAINT document_standard_relation_status_check
            CHECK (status IN ('pending', 'valid', 'invalid'));
        EXCEPTION WHEN check_violation THEN
            RAISE NOTICE '已有数据不满足 status 约束，跳过添加';
        END;
    END IF;
END $$;

-- match_type 约束
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname='document_standard_relation_match_type_check'
    ) THEN
        BEGIN
            ALTER TABLE document_standard_relation
            ADD CONSTRAINT document_standard_relation_match_type_check
            CHECK (match_type IN ('auto', 'manual'));
        EXCEPTION WHEN check_violation THEN
            RAISE NOTICE '已有数据不满足 match_type 约束，跳过添加';
        END;
    END IF;
END $$;

-- ============================================================
-- 3. 补充索引
-- ============================================================

-- 按条款ID查询
CREATE INDEX IF NOT EXISTS idx_dsr_clause_id
    ON document_standard_relation (clause_id)
    WHERE is_deleted = FALSE;

-- 按状态过滤（AI 评价只取 valid）
CREATE INDEX IF NOT EXISTS idx_dsr_status
    ON document_standard_relation (status)
    WHERE is_deleted = FALSE;

-- 按匹配类型+状态过滤（匹配建议页查 auto+pending）
CREATE INDEX IF NOT EXISTS idx_dsr_match_type_status
    ON document_standard_relation (match_type, status)
    WHERE is_deleted = FALSE;

COMMIT;
