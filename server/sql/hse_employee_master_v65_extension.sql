-- =====================================================================
-- HSE 人员主数据中心 v65 扩展迁移脚本
-- 版本: v65 (Sprint5.4 扩展 - 确认版)
-- 内容: 检查模板表 + hazard_record来源追踪字段
-- 依据: sprint5.4-design-document-v1.1-confirm.md
-- 方式: 增量迁移，可重复执行
-- =====================================================================

BEGIN;

-- ============================================================
-- 一、hazard_record 表扩展 - 增加来源追踪字段
-- ============================================================

-- 添加 source_type 字段
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'hazard_record' AND column_name = 'source_type') THEN
        ALTER TABLE hazard_record ADD COLUMN source_type VARCHAR(32);
        RAISE NOTICE 'Added source_type column to hazard_record';
    END IF;
END $$;

-- 添加 source_id 字段
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'hazard_record' AND column_name = 'source_id') THEN
        ALTER TABLE hazard_record ADD COLUMN source_id BIGINT;
        RAISE NOTICE 'Added source_id column to hazard_record';
    END IF;
END $$;

-- 添加 confirmed_by 字段
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'hazard_record' AND column_name = 'confirmed_by') THEN
        ALTER TABLE hazard_record ADD COLUMN confirmed_by BIGINT;
        RAISE NOTICE 'Added confirmed_by column to hazard_record';
    END IF;
END $$;

-- 添加 confirmed_at 字段
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'hazard_record' AND column_name = 'confirmed_at') THEN
        ALTER TABLE hazard_record ADD COLUMN confirmed_at TIMESTAMP;
        RAISE NOTICE 'Added confirmed_at column to hazard_record';
    END IF;
END $$;

-- 添加索引
CREATE INDEX IF NOT EXISTS idx_hazard_record_source_type
    ON hazard_record (source_type) WHERE source_type IS NOT NULL AND is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_hazard_record_source_id
    ON hazard_record (source_id) WHERE source_id IS NOT NULL AND is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_hazard_record_confirmed_by
    ON hazard_record (confirmed_by) WHERE confirmed_by IS NOT NULL AND is_deleted = false;

-- 添加注释
COMMENT ON COLUMN hazard_record.source_type IS '来源类型：inspection/report/audit/external/other';
COMMENT ON COLUMN hazard_record.source_id IS '来源记录ID';
COMMENT ON COLUMN hazard_record.confirmed_by IS '确认人ID（关联employee.id）';
COMMENT ON COLUMN hazard_record.confirmed_at IS '确认时间';

-- ============================================================
-- 二、inspection_plan 表扩展 - 增加模板关联
-- ============================================================

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'inspection_plan' AND column_name = 'template_id') THEN
        ALTER TABLE inspection_plan ADD COLUMN template_id BIGINT;
        RAISE NOTICE 'Added template_id column to inspection_plan';
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_inspection_plan_template
    ON inspection_plan (template_id) WHERE template_id IS NOT NULL AND is_deleted = false;

COMMENT ON COLUMN inspection_plan.template_id IS '关联检查清单模板ID';

-- ============================================================
-- 三、inspection_checklist_template — 检查清单模板表
-- ============================================================

CREATE TABLE IF NOT EXISTS inspection_checklist_template (
    id                      BIGSERIAL PRIMARY KEY,
    template_name           VARCHAR(128) NOT NULL,
    template_code           VARCHAR(64) NOT NULL,
    template_category       VARCHAR(32),
    description             TEXT,
    version                 VARCHAR(16) NOT NULL DEFAULT '1.0',
    is_active               BOOLEAN NOT NULL DEFAULT TRUE,
    applicable_scope        TEXT,
    remark                  TEXT,
    created_by              BIGINT,
    created_at              TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMP NOT NULL DEFAULT NOW(),
    is_deleted              BOOLEAN NOT NULL DEFAULT FALSE
);

-- 索引
CREATE UNIQUE INDEX IF NOT EXISTS uk_checklist_template_code
    ON inspection_checklist_template (template_code) WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_checklist_template_category
    ON inspection_checklist_template (template_category) WHERE template_category IS NOT NULL AND is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_checklist_template_active
    ON inspection_checklist_template (is_active) WHERE is_active = true AND is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_checklist_template_created_by
    ON inspection_checklist_template (created_by) WHERE created_by IS NOT NULL AND is_deleted = false;

-- 注释
COMMENT ON TABLE inspection_checklist_template IS 'HSE检查清单模板表（Sprint5.4 v65）';
COMMENT ON COLUMN inspection_checklist_template.template_name IS '模板名称';
COMMENT ON COLUMN inspection_checklist_template.template_code IS '模板编号（唯一）';
COMMENT ON COLUMN inspection_checklist_template.template_category IS '模板分类：safety/health/environment/fire/equipment/quality';
COMMENT ON COLUMN inspection_checklist_template.description IS '模板描述';
COMMENT ON COLUMN inspection_checklist_template.version IS '模板版本';
COMMENT ON COLUMN inspection_checklist_template.is_active IS '是否启用';
COMMENT ON COLUMN inspection_checklist_template.applicable_scope IS '适用范围';
COMMENT ON COLUMN inspection_checklist_template.is_deleted IS '软删除标识';

-- ============================================================
-- 四、inspection_checklist_item — 检查项模板表
-- ============================================================

CREATE TABLE IF NOT EXISTS inspection_checklist_item (
    id                      BIGSERIAL PRIMARY KEY,
    template_id             BIGINT NOT NULL,
    item_code               VARCHAR(64),
    item_name               VARCHAR(128) NOT NULL,
    item_category           VARCHAR(64),
    description             TEXT,
    standard_requirement    TEXT,
    inspection_method       TEXT,
    sort_order              INTEGER DEFAULT 0,
    is_required             BOOLEAN NOT NULL DEFAULT TRUE,
    remark                  TEXT,
    created_by              BIGINT,
    created_at              TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMP NOT NULL DEFAULT NOW(),
    is_deleted              BOOLEAN NOT NULL DEFAULT FALSE
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_checklist_item_template
    ON inspection_checklist_item (template_id) WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_checklist_item_category
    ON inspection_checklist_item (item_category) WHERE item_category IS NOT NULL AND is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_checklist_item_sort_order
    ON inspection_checklist_item (template_id, sort_order) WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_checklist_item_created_by
    ON inspection_checklist_item (created_by) WHERE created_by IS NOT NULL AND is_deleted = false;

-- 注释
COMMENT ON TABLE inspection_checklist_item IS 'HSE检查项模板表（Sprint5.4 v65）';
COMMENT ON COLUMN inspection_checklist_item.template_id IS '关联检查清单模板ID';
COMMENT ON COLUMN inspection_checklist_item.item_code IS '检查项编号';
COMMENT ON COLUMN inspection_checklist_item.item_name IS '检查项名称';
COMMENT ON COLUMN inspection_checklist_item.item_category IS '检查项分类';
COMMENT ON COLUMN inspection_checklist_item.description IS '检查项描述';
COMMENT ON COLUMN inspection_checklist_item.standard_requirement IS '标准要求';
COMMENT ON COLUMN inspection_checklist_item.inspection_method IS '检查方法';
COMMENT ON COLUMN inspection_checklist_item.sort_order IS '排序序号';
COMMENT ON COLUMN inspection_checklist_item.is_required IS '是否必检';
COMMENT ON COLUMN inspection_checklist_item.is_deleted IS '软删除标识';

-- ============================================================
-- 五、验证查询
-- ============================================================

DO $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count FROM information_schema.tables
    WHERE table_name IN ('inspection_checklist_template', 'inspection_checklist_item');
    RAISE NOTICE 'v65迁移验证：新增表 % 个', v_count;
    
    SELECT COUNT(*) INTO v_count FROM information_schema.columns
    WHERE table_name = 'hazard_record' AND column_name IN ('source_type', 'source_id', 'confirmed_by', 'confirmed_at');
    RAISE NOTICE 'v65迁移验证：hazard_record新增字段 % 个', v_count;
END $$;

COMMIT;