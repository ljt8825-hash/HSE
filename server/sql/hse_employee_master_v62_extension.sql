-- =====================================================================
-- HSE 人员主数据中心 v62 扩展迁移脚本
-- 版本: v62 (Sprint5.2 扩展)
-- 内容: position_safety_profile + position_training_requirement
-- 依据: hse-employee-master-data-design-v1.2-freeze.md, sprint5-final-plan.md
-- 方式: 增量迁移，仅 CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS
-- 兼容性: 可重复执行，不删除字段，不修改已有数据结构
-- =====================================================================

BEGIN;

-- ============================================================
-- 一、position_safety_profile — 岗位安全画像表
-- ============================================================

CREATE TABLE IF NOT EXISTS position_safety_profile (
    id                      BIGSERIAL PRIMARY KEY,
    position_id             BIGINT NOT NULL,
    risk_level              VARCHAR(20) NOT NULL DEFAULT 'unknown',
    risk_score              DECIMAL(5,2),
    risk_factors            JSONB,
    required_cert_categories TEXT[],
    required_special_operation BOOLEAN NOT NULL DEFAULT FALSE,
    required_safety_critical BOOLEAN NOT NULL DEFAULT FALSE,
    safety_hazards          JSONB,
    safety_procedures       TEXT,
    emergency_response      TEXT,
    ppe_requirements        JSONB,
    work_permit_required    BOOLEAN NOT NULL DEFAULT FALSE,
    inspection_frequency    VARCHAR(32),
    last_risk_assessment_date DATE,
    assessment_method       VARCHAR(32),
    ai_risk_analysis        TEXT,
    ai_suggestion           TEXT,
    ai_analysis_date        TIMESTAMP,
    ai_analysis_version     VARCHAR(32),
    remark                  TEXT,
    created_by              BIGINT,
    created_at              TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMP NOT NULL DEFAULT NOW(),
    is_deleted              BOOLEAN NOT NULL DEFAULT FALSE
);

-- 索引
DO $$ BEGIN
    CREATE UNIQUE INDEX IF NOT EXISTS uk_pos_safety_profile_position
        ON position_safety_profile (position_id) WHERE is_deleted = false;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_pos_safety_risk_level
    ON position_safety_profile (risk_level) WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_pos_safety_risk_score
    ON position_safety_profile (risk_score DESC NULLS LAST) WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_pos_safety_special_operation
    ON position_safety_profile (required_special_operation) WHERE required_special_operation = true AND is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_pos_safety_safety_critical
    ON position_safety_profile (required_safety_critical) WHERE required_safety_critical = true AND is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_pos_safety_work_permit
    ON position_safety_profile (work_permit_required) WHERE work_permit_required = true AND is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_pos_safety_last_assessment
    ON position_safety_profile (last_risk_assessment_date) WHERE last_risk_assessment_date IS NOT NULL AND is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_pos_safety_created_by
    ON position_safety_profile (created_by) WHERE created_by IS NOT NULL AND is_deleted = false;

-- 注释
COMMENT ON TABLE position_safety_profile IS 'HSE岗位安全画像表（Sprint5.2 v62）';
COMMENT ON COLUMN position_safety_profile.position_id IS '岗位ID（关联position.id）';
COMMENT ON COLUMN position_safety_profile.risk_level IS '岗位风险等级：low/medium/high/critical/unknown（应用层规则计算，AI不参与）';
COMMENT ON COLUMN position_safety_profile.risk_score IS '岗位风险评分（0-100，应用层规则计算）';
COMMENT ON COLUMN position_safety_profile.risk_factors IS '岗位风险因素列表（JSONB结构化）';
COMMENT ON COLUMN position_safety_profile.required_cert_categories IS '必备证件分类列表（TEXT[]，引用employee_certificate.cert_category）';
COMMENT ON COLUMN position_safety_profile.required_special_operation IS '是否要求特种作业资质';
COMMENT ON COLUMN position_safety_profile.required_safety_critical IS '是否为安全关键岗位';
COMMENT ON COLUMN position_safety_profile.safety_hazards IS '岗位安全危害因素（JSONB，如：高处坠落、触电、机械伤害等）';
COMMENT ON COLUMN position_safety_profile.safety_procedures IS '岗位安全操作规程';
COMMENT ON COLUMN position_safety_profile.emergency_response IS '岗位应急预案';
COMMENT ON COLUMN position_safety_profile.ppe_requirements IS '个人防护装备要求（JSONB）';
COMMENT ON COLUMN position_safety_profile.work_permit_required IS '是否需要作业许可证';
COMMENT ON COLUMN position_safety_profile.inspection_frequency IS '巡检频率：daily/weekly/monthly/quarterly/yearly';
COMMENT ON COLUMN position_safety_profile.last_risk_assessment_date IS '最近风险评估日期';
COMMENT ON COLUMN position_safety_profile.assessment_method IS '评估方式：manual/auto_calculated/hybrid';
COMMENT ON COLUMN position_safety_profile.ai_risk_analysis IS 'AI风险分析（仅供参考，不作为定级依据）';
COMMENT ON COLUMN position_safety_profile.ai_suggestion IS 'AI建议（培训建议/防护建议，仅供参考）';
COMMENT ON COLUMN position_safety_profile.ai_analysis_date IS 'AI分析生成时间';
COMMENT ON COLUMN position_safety_profile.ai_analysis_version IS 'AI分析版本';
COMMENT ON COLUMN position_safety_profile.created_by IS '创建人ID';
COMMENT ON COLUMN position_safety_profile.is_deleted IS '软删除标识';

-- ============================================================
-- 二、position_training_requirement — 岗位培训要求表
-- ============================================================

CREATE TABLE IF NOT EXISTS position_training_requirement (
    id                      BIGSERIAL PRIMARY KEY,
    position_id             BIGINT NOT NULL,
    training_type           VARCHAR(64) NOT NULL,
    training_category       VARCHAR(32) NOT NULL,
    required_hours          DECIMAL(5,2) NOT NULL DEFAULT 0,
    frequency               VARCHAR(32) NOT NULL DEFAULT 'yearly',
    frequency_interval      INTEGER NOT NULL DEFAULT 1,
    required_certificate_category VARCHAR(32),
    is_mandatory            BOOLEAN NOT NULL DEFAULT TRUE,
    is_onboarding_required  BOOLEAN NOT NULL DEFAULT FALSE,
    is_refresher_required   BOOLEAN NOT NULL DEFAULT FALSE,
    refresher_interval_days INTEGER NOT NULL DEFAULT 365,
    training_content        TEXT,
    assessment_required     BOOLEAN NOT NULL DEFAULT TRUE,
    passing_score           INTEGER NOT NULL DEFAULT 80,
    validity_days           INTEGER,
    materials_required      JSONB,
    ai_training_suggestion  TEXT,
    ai_analysis_date        TIMESTAMP,
    ai_analysis_version     VARCHAR(32),
    remark                  TEXT,
    created_by              BIGINT,
    created_at              TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMP NOT NULL DEFAULT NOW(),
    is_deleted              BOOLEAN NOT NULL DEFAULT FALSE
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_pos_training_position
    ON position_training_requirement (position_id) WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_pos_training_type
    ON position_training_requirement (training_type) WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_pos_training_category
    ON position_training_requirement (training_category) WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_pos_training_cert_category
    ON position_training_requirement (required_certificate_category) WHERE required_certificate_category IS NOT NULL AND is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_pos_training_mandatory
    ON position_training_requirement (is_mandatory) WHERE is_mandatory = true AND is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_pos_training_onboarding
    ON position_training_requirement (is_onboarding_required) WHERE is_onboarding_required = true AND is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_pos_training_created_by
    ON position_training_requirement (created_by) WHERE created_by IS NOT NULL AND is_deleted = false;

-- 部分唯一索引：同一岗位同一培训类型唯一
DO $$ BEGIN
    CREATE UNIQUE INDEX IF NOT EXISTS uk_pos_training_position_type
        ON position_training_requirement (position_id, training_type) WHERE is_deleted = false;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 注释
COMMENT ON TABLE position_training_requirement IS 'HSE岗位培训要求表（Sprint5.2 v62）';
COMMENT ON COLUMN position_training_requirement.position_id IS '岗位ID（关联position.id）';
COMMENT ON COLUMN position_training_requirement.training_type IS '培训类型名称（如：安全操作规程培训、消防知识培训）';
COMMENT ON COLUMN position_training_requirement.training_category IS '培训分类：safety/skill/special_operation/fire/health/emergency/other';
COMMENT ON COLUMN position_training_requirement.required_hours IS '培训学时要求';
COMMENT ON COLUMN position_training_requirement.frequency IS '培训频率：daily/weekly/monthly/quarterly/yearly/once';
COMMENT ON COLUMN position_training_requirement.frequency_interval IS '频率间隔（如频率为monthly，间隔为3表示每3个月一次）';
COMMENT ON COLUMN position_training_requirement.required_certificate_category IS '培训合格后颁发的证件分类（引用employee_certificate.cert_category）';
COMMENT ON COLUMN position_training_requirement.is_mandatory IS '是否强制性培训';
COMMENT ON COLUMN position_training_requirement.is_onboarding_required IS '是否为新员工入职必训';
COMMENT ON COLUMN position_training_requirement.is_refresher_required IS '是否需要复训';
COMMENT ON COLUMN position_training_requirement.refresher_interval_days IS '复训间隔天数';
COMMENT ON COLUMN position_training_requirement.training_content IS '培训内容大纲';
COMMENT ON COLUMN position_training_requirement.assessment_required IS '是否需要考核';
COMMENT ON COLUMN position_training_requirement.passing_score IS '考核及格分数';
COMMENT ON COLUMN position_training_requirement.validity_days IS '培训合格有效期（天），NULL表示长期有效';
COMMENT ON COLUMN position_training_requirement.materials_required IS '培训所需材料清单（JSONB）';
COMMENT ON COLUMN position_training_requirement.ai_training_suggestion IS 'AI培训建议（仅供参考，不作为最终要求）';
COMMENT ON COLUMN position_training_requirement.ai_analysis_date IS 'AI分析生成时间';
COMMENT ON COLUMN position_training_requirement.ai_analysis_version IS 'AI分析版本';
COMMENT ON COLUMN position_training_requirement.created_by IS '创建人ID';
COMMENT ON COLUMN position_training_requirement.is_deleted IS '软删除标识';

-- ============================================================
-- 三、验证查询
-- ============================================================

DO $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count FROM information_schema.tables
    WHERE table_name IN ('position_safety_profile', 'position_training_requirement');
    RAISE NOTICE 'v62迁移验证：新增表 % 个', v_count;
END $$;

COMMIT;
