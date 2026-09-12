-- =====================================================================
-- HSE 人员主数据中心 v61 扩展迁移脚本
-- 版本: v61 (Sprint5.1 扩展)
-- 内容: employee_certificate + employee_safety_profile
-- 依据: hse-employee-master-data-design-v2.0-final.md
-- 方式: 增量迁移，仅 CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS
-- 兼容性: 可重复执行，不删除字段，不修改已有数据结构
-- =====================================================================

BEGIN;

-- ============================================================
-- 一、employee_certificate — 证件统一管理表
-- ============================================================

CREATE TABLE IF NOT EXISTS employee_certificate (
    id                  BIGSERIAL PRIMARY KEY,
    employee_id         BIGINT NOT NULL,
    cert_code           VARCHAR(64),
    cert_name           VARCHAR(128) NOT NULL,
    cert_category       VARCHAR(32) NOT NULL,
    cert_type           VARCHAR(64),
    issuer              VARCHAR(128),
    issue_date          DATE,
    start_date          DATE,
    expire_date         DATE,
    status              VARCHAR(20) NOT NULL DEFAULT 'valid',
    cert_no             VARCHAR(64),
    verification_no     VARCHAR(128),
    is_special_operation BOOLEAN NOT NULL DEFAULT FALSE,
    is_safety_critical  BOOLEAN NOT NULL DEFAULT FALSE,
    attachment_ids      JSONB,
    verification_status VARCHAR(20),
    verification_date   DATE,
    verification_remark TEXT,
    remark              TEXT,
    created_by          BIGINT,
    created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMP NOT NULL DEFAULT NOW(),
    is_deleted          BOOLEAN NOT NULL DEFAULT FALSE
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_emp_cert_employee
    ON employee_certificate (employee_id) WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_emp_cert_category
    ON employee_certificate (cert_category) WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_emp_cert_type
    ON employee_certificate (cert_type) WHERE cert_type IS NOT NULL AND is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_emp_cert_status
    ON employee_certificate (status) WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_emp_cert_expire
    ON employee_certificate (expire_date) WHERE expire_date IS NOT NULL AND is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_emp_cert_special
    ON employee_certificate (is_special_operation) WHERE is_special_operation = true AND is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_emp_cert_created_by
    ON employee_certificate (created_by) WHERE created_by IS NOT NULL AND is_deleted = false;

-- 部分唯一索引：业务编号（可空）
DO $$ BEGIN
    CREATE UNIQUE INDEX IF NOT EXISTS uk_emp_cert_code
        ON employee_certificate (cert_code) WHERE cert_code IS NOT NULL AND is_deleted = false;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 部分唯一索引：证件号码 + 分类（同一证件号码在同一分类下唯一）
DO $$ BEGIN
    CREATE UNIQUE INDEX IF NOT EXISTS uk_emp_cert_no_type
        ON employee_certificate (cert_no, cert_category)
        WHERE cert_no IS NOT NULL AND is_deleted = false;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 注释
COMMENT ON TABLE employee_certificate IS 'HSE人员证件统一管理表（Sprint5.1 v61）';
COMMENT ON COLUMN employee_certificate.employee_id IS '员工ID（关联employee.id，逻辑关联）';
COMMENT ON COLUMN employee_certificate.cert_code IS '证件业务编号（如CERT-2026-0001）';
COMMENT ON COLUMN employee_certificate.cert_name IS '证件名称';
COMMENT ON COLUMN employee_certificate.cert_category IS '证件分类：special_operation/safety_qualification/health/special_equipment/driver_license/professional/other';
COMMENT ON COLUMN employee_certificate.cert_type IS '证件类型细项（如电工/焊工/叉车）';
COMMENT ON COLUMN employee_certificate.issuer IS '发证机关';
COMMENT ON COLUMN employee_certificate.issue_date IS '发证日期';
COMMENT ON COLUMN employee_certificate.start_date IS '有效期开始日期';
COMMENT ON COLUMN employee_certificate.expire_date IS '有效期结束日期（NULL表示长期有效）';
COMMENT ON COLUMN employee_certificate.status IS '状态：valid/expired/revoked/pending_review/invalid';
COMMENT ON COLUMN employee_certificate.cert_no IS '证件号码（证件本身的编号）';
COMMENT ON COLUMN employee_certificate.verification_no IS '查验编号';
COMMENT ON COLUMN employee_certificate.is_special_operation IS '是否特种作业证件';
COMMENT ON COLUMN employee_certificate.is_safety_critical IS '是否安全关键岗位必备';
COMMENT ON COLUMN employee_certificate.attachment_ids IS '证件附件文件ID列表（JSONB，引用document_files.id）';
COMMENT ON COLUMN employee_certificate.verification_status IS '查验状态：unverified/verified/failed/expired_verify';
COMMENT ON COLUMN employee_certificate.verification_date IS '最近查验日期';
COMMENT ON COLUMN employee_certificate.verification_remark IS '查验备注';
COMMENT ON COLUMN employee_certificate.created_by IS '创建人ID（req.user.id）';
COMMENT ON COLUMN employee_certificate.is_deleted IS '软删除标识';

-- ============================================================
-- 二、employee_safety_profile — 一人一档风险画像表
-- ============================================================

CREATE TABLE IF NOT EXISTS employee_safety_profile (
    id                      BIGSERIAL PRIMARY KEY,
    employee_id             BIGINT NOT NULL,
    risk_level              VARCHAR(20) NOT NULL DEFAULT 'unknown',
    risk_score              DECIMAL(5,2),
    risk_factors            JSONB,
    accident_count          INTEGER NOT NULL DEFAULT 0,
    accident_responsible_count INTEGER NOT NULL DEFAULT 0,
    violation_count         INTEGER NOT NULL DEFAULT 0,
    serious_violation_count INTEGER NOT NULL DEFAULT 0,
    training_count          INTEGER NOT NULL DEFAULT 0,
    training_hours          DECIMAL(8,2) NOT NULL DEFAULT 0,
    last_training_date      DATE,
    hazard_involved_count   INTEGER NOT NULL DEFAULT 0,
    rectification_count     INTEGER NOT NULL DEFAULT 0,
    rectification_overdue_count INTEGER NOT NULL DEFAULT 0,
    last_accident_date      DATE,
    last_violation_date     DATE,
    last_assessment_date    DATE,
    assessment_method       VARCHAR(32),
    safety_qualification    VARCHAR(20),
    special_operation_qualified BOOLEAN,
    health_status           VARCHAR(20),
    last_health_exam_date   DATE,
    next_health_exam_date   DATE,
    restricted_work_types   JSONB,
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
    CREATE UNIQUE INDEX IF NOT EXISTS uk_emp_safety_profile_employee
        ON employee_safety_profile (employee_id) WHERE is_deleted = false;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_emp_safety_risk_level
    ON employee_safety_profile (risk_level) WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_emp_safety_risk_score
    ON employee_safety_profile (risk_score DESC NULLS LAST) WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_emp_safety_accident
    ON employee_safety_profile (accident_count) WHERE accident_count > 0 AND is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_emp_safety_violation
    ON employee_safety_profile (violation_count) WHERE violation_count > 0 AND is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_emp_safety_qualification
    ON employee_safety_profile (safety_qualification) WHERE safety_qualification IS NOT NULL AND is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_emp_safety_health
    ON employee_safety_profile (health_status) WHERE health_status IS NOT NULL AND is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_emp_safety_next_exam
    ON employee_safety_profile (next_health_exam_date) WHERE next_health_exam_date IS NOT NULL AND is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_emp_safety_assessment
    ON employee_safety_profile (last_assessment_date) WHERE last_assessment_date IS NOT NULL AND is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_emp_safety_created_by
    ON employee_safety_profile (created_by) WHERE created_by IS NOT NULL AND is_deleted = false;

-- 注释
COMMENT ON TABLE employee_safety_profile IS 'HSE一人一档风险画像表（Sprint5.1 v61）';
COMMENT ON COLUMN employee_safety_profile.employee_id IS '员工ID（关联employee.id，逻辑关联，一人一档唯一）';
COMMENT ON COLUMN employee_safety_profile.risk_level IS '风险等级：low/medium/high/critical/unknown（应用层规则计算，AI不参与）';
COMMENT ON COLUMN employee_safety_profile.risk_score IS '风险评分（0-100，应用层规则计算）';
COMMENT ON COLUMN employee_safety_profile.risk_factors IS '风险因素列表（JSONB结构化）';
COMMENT ON COLUMN employee_safety_profile.accident_count IS '参与事故次数（累计）';
COMMENT ON COLUMN employee_safety_profile.accident_responsible_count IS '责任事故次数';
COMMENT ON COLUMN employee_safety_profile.violation_count IS '违章违规次数（累计）';
COMMENT ON COLUMN employee_safety_profile.serious_violation_count IS '严重违章次数';
COMMENT ON COLUMN employee_safety_profile.training_count IS '培训完成次数（累计）';
COMMENT ON COLUMN employee_safety_profile.training_hours IS '培训总学时（小时）';
COMMENT ON COLUMN employee_safety_profile.last_training_date IS '最近培训日期';
COMMENT ON COLUMN employee_safety_profile.hazard_involved_count IS '参与隐患数（发现人/责任人/复查人累计）';
COMMENT ON COLUMN employee_safety_profile.rectification_count IS '参与整改任务数（责任人累计）';
COMMENT ON COLUMN employee_safety_profile.rectification_overdue_count IS '整改超期次数';
COMMENT ON COLUMN employee_safety_profile.last_accident_date IS '最近事故日期';
COMMENT ON COLUMN employee_safety_profile.last_violation_date IS '最近违章日期';
COMMENT ON COLUMN employee_safety_profile.last_assessment_date IS '最近风险评估日期';
COMMENT ON COLUMN employee_safety_profile.assessment_method IS '评估方式：manual/auto_calculated/hybrid';
COMMENT ON COLUMN employee_safety_profile.safety_qualification IS '安全资质状态：qualified/unqualified/pending/expired';
COMMENT ON COLUMN employee_safety_profile.special_operation_qualified IS '是否具备特种作业资质（基于employee_certificate推导）';
COMMENT ON COLUMN employee_safety_profile.health_status IS '职业健康状态：fit/unfit/restricted/pending_exam';
COMMENT ON COLUMN employee_safety_profile.last_health_exam_date IS '最近职业健康体检日期';
COMMENT ON COLUMN employee_safety_profile.next_health_exam_date IS '下次职业健康体检日期';
COMMENT ON COLUMN employee_safety_profile.restricted_work_types IS '限制作业类型（JSONB）';
COMMENT ON COLUMN employee_safety_profile.ai_risk_analysis IS 'AI风险分析（仅供参考，不作为定级依据）';
COMMENT ON COLUMN employee_safety_profile.ai_suggestion IS 'AI建议（培训建议/调岗建议，仅供参考）';
COMMENT ON COLUMN employee_safety_profile.ai_analysis_date IS 'AI分析生成时间';
COMMENT ON COLUMN employee_safety_profile.ai_analysis_version IS 'AI分析版本';
COMMENT ON COLUMN employee_safety_profile.created_by IS '创建人ID';
COMMENT ON COLUMN employee_safety_profile.is_deleted IS '软删除标识';

-- ============================================================
-- 三、验证查询
-- ============================================================

DO $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count FROM information_schema.tables
    WHERE table_name IN ('employee_certificate', 'employee_safety_profile');
    RAISE NOTICE 'v61迁移验证：新增表 % 个', v_count;
END $$;

COMMIT;
