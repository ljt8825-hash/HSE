-- =====================================================================
-- HSE 人员主数据中心 v63 扩展迁移脚本
-- 版本: v63 (Sprint5.3 扩展)
-- 内容: training_record + employee_induction_training + employee_training_status
-- 依据: sprint5.3-design-document.md
-- 方式: 增量迁移，仅 CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS
-- 兼容性: 可重复执行，不删除字段，不修改已有数据结构
-- =====================================================================

BEGIN;

-- ============================================================
-- 一、training_record — 员工培训台账表
-- ============================================================

CREATE TABLE IF NOT EXISTS training_record (
    id                      BIGSERIAL PRIMARY KEY,
    employee_id             BIGINT NOT NULL,
    position_id             BIGINT,
    training_requirement_id BIGINT,
    training_type           VARCHAR(64) NOT NULL,
    training_category       VARCHAR(32) NOT NULL,
    training_name           VARCHAR(128) NOT NULL,
    training_source         VARCHAR(32) NOT NULL DEFAULT 'planned',
    training_provider       VARCHAR(128),
    trainer                 VARCHAR(64),
    training_location       VARCHAR(128),
    start_date              DATE NOT NULL,
    end_date                DATE,
    actual_hours            DECIMAL(5,2) NOT NULL DEFAULT 0,
    status                  VARCHAR(20) NOT NULL DEFAULT 'completed',
    assessment_result       VARCHAR(20),
    assessment_score        DECIMAL(5,2),
    passing_score           INTEGER,
    certificate_issued      BOOLEAN NOT NULL DEFAULT FALSE,
    certificate_no          VARCHAR(64),
    certificate_valid_from  DATE,
    certificate_valid_until DATE,
    cost                    DECIMAL(10,2),
    remark                  TEXT,
    attachments             JSONB,
    created_by              BIGINT,
    created_at              TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMP NOT NULL DEFAULT NOW(),
    is_deleted              BOOLEAN NOT NULL DEFAULT FALSE
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_training_record_employee
    ON training_record (employee_id) WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_training_record_position
    ON training_record (position_id) WHERE position_id IS NOT NULL AND is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_training_record_requirement
    ON training_record (training_requirement_id) WHERE training_requirement_id IS NOT NULL AND is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_training_record_type
    ON training_record (training_type) WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_training_record_category
    ON training_record (training_category) WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_training_record_status
    ON training_record (status) WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_training_record_source
    ON training_record (training_source) WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_training_record_start_date
    ON training_record (start_date) WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_training_record_result
    ON training_record (assessment_result) WHERE assessment_result IS NOT NULL AND is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_training_record_certificate
    ON training_record (certificate_issued) WHERE certificate_issued = true AND is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_training_record_created_by
    ON training_record (created_by) WHERE created_by IS NOT NULL AND is_deleted = false;

-- 注释
COMMENT ON TABLE training_record IS 'HSE员工培训台账表（Sprint5.3 v63）';
COMMENT ON COLUMN training_record.employee_id IS '员工ID（关联employee.id）';
COMMENT ON COLUMN training_record.position_id IS '岗位ID（培训时所在岗位，关联position.id）';
COMMENT ON COLUMN training_record.training_requirement_id IS '岗位培训要求ID（关联position_training_requirement.id）';
COMMENT ON COLUMN training_record.training_type IS '培训类型名称';
COMMENT ON COLUMN training_record.training_category IS '培训分类：safety/skill/special_operation/fire/health/emergency/other';
COMMENT ON COLUMN training_record.training_name IS '培训项目名称';
COMMENT ON COLUMN training_record.training_source IS '培训来源：planned/temporary/external/onboarding/self_study';
COMMENT ON COLUMN training_record.training_provider IS '培训机构';
COMMENT ON COLUMN training_record.trainer IS '培训讲师';
COMMENT ON COLUMN training_record.training_location IS '培训地点';
COMMENT ON COLUMN training_record.start_date IS '培训开始日期';
COMMENT ON COLUMN training_record.end_date IS '培训结束日期';
COMMENT ON COLUMN training_record.actual_hours IS '实际培训学时';
COMMENT ON COLUMN training_record.status IS '培训状态：scheduled/in_progress/completed/cancelled/failed';
COMMENT ON COLUMN training_record.assessment_result IS '考核结果：passed/failed/exempted/pending';
COMMENT ON COLUMN training_record.assessment_score IS '考核成绩';
COMMENT ON COLUMN training_record.passing_score IS '及格分数';
COMMENT ON COLUMN training_record.certificate_issued IS '是否颁发证书';
COMMENT ON COLUMN training_record.certificate_no IS '证书编号';
COMMENT ON COLUMN training_record.certificate_valid_from IS '证书生效日期';
COMMENT ON COLUMN training_record.certificate_valid_until IS '证书失效日期';
COMMENT ON COLUMN training_record.cost IS '培训费用';
COMMENT ON COLUMN training_record.attachments IS '附件列表（JSONB）';
COMMENT ON COLUMN training_record.created_by IS '创建人ID';
COMMENT ON COLUMN training_record.is_deleted IS '软删除标识';

-- ============================================================
-- 二、employee_induction_training — 新员工入职培训表
-- ============================================================

CREATE TABLE IF NOT EXISTS employee_induction_training (
    id                      BIGSERIAL PRIMARY KEY,
    employee_id             BIGINT NOT NULL,
    position_id             BIGINT NOT NULL,
    induction_start_date    DATE NOT NULL,
    induction_end_date      DATE,
    company_level_status    VARCHAR(20) NOT NULL DEFAULT 'pending',
    company_level_date      DATE,
    company_level_trainer   VARCHAR(64),
    company_level_hours     DECIMAL(5,2) DEFAULT 0,
    company_level_result    VARCHAR(20),
    department_level_status VARCHAR(20) NOT NULL DEFAULT 'pending',
    department_level_date   DATE,
    department_level_trainer VARCHAR(64),
    department_level_hours  DECIMAL(5,2) DEFAULT 0,
    department_level_result VARCHAR(20),
    team_level_status       VARCHAR(20) NOT NULL DEFAULT 'pending',
    team_level_date         DATE,
    team_level_trainer      VARCHAR(64),
    team_level_hours        DECIMAL(5,2) DEFAULT 0,
    team_level_result       VARCHAR(20),
    total_hours             DECIMAL(5,2) DEFAULT 0,
    overall_status          VARCHAR(20) NOT NULL DEFAULT 'in_progress',
    overall_result          VARCHAR(20),
    qualified_date          DATE,
    expiry_date             DATE,
    remark                  TEXT,
    created_by              BIGINT,
    created_at              TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMP NOT NULL DEFAULT NOW(),
    is_deleted              BOOLEAN NOT NULL DEFAULT FALSE
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_induction_employee
    ON employee_induction_training (employee_id) WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_induction_position
    ON employee_induction_training (position_id) WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_induction_overall_status
    ON employee_induction_training (overall_status) WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_induction_result
    ON employee_induction_training (overall_result) WHERE overall_result IS NOT NULL AND is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_induction_start_date
    ON employee_induction_training (induction_start_date) WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_induction_expiry
    ON employee_induction_training (expiry_date) WHERE expiry_date IS NOT NULL AND is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_induction_created_by
    ON employee_induction_training (created_by) WHERE created_by IS NOT NULL AND is_deleted = false;

-- 部分唯一索引：每个员工只有一条有效的入职培训记录
DO $$ BEGIN
    CREATE UNIQUE INDEX IF NOT EXISTS uk_induction_employee_active
        ON employee_induction_training (employee_id) WHERE is_deleted = false;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 注释
COMMENT ON TABLE employee_induction_training IS 'HSE新员工入职培训表（Sprint5.3 v63）';
COMMENT ON COLUMN employee_induction_training.employee_id IS '员工ID（关联employee.id）';
COMMENT ON COLUMN employee_induction_training.position_id IS '入职岗位ID（关联position.id）';
COMMENT ON COLUMN employee_induction_training.induction_start_date IS '入职培训开始日期';
COMMENT ON COLUMN employee_induction_training.induction_end_date IS '入职培训结束日期';
COMMENT ON COLUMN employee_induction_training.company_level_status IS '公司级培训状态：pending/in_progress/completed/exempted';
COMMENT ON COLUMN employee_induction_training.company_level_date IS '公司级培训日期';
COMMENT ON COLUMN employee_induction_training.company_level_trainer IS '公司级培训讲师';
COMMENT ON COLUMN employee_induction_training.company_level_hours IS '公司级培训学时';
COMMENT ON COLUMN employee_induction_training.company_level_result IS '公司级考核结果：passed/failed';
COMMENT ON COLUMN employee_induction_training.department_level_status IS '部门级培训状态：pending/in_progress/completed/exempted';
COMMENT ON COLUMN employee_induction_training.department_level_date IS '部门级培训日期';
COMMENT ON COLUMN employee_induction_training.department_level_trainer IS '部门级培训讲师';
COMMENT ON COLUMN employee_induction_training.department_level_hours IS '部门级培训学时';
COMMENT ON COLUMN employee_induction_training.department_level_result IS '部门级考核结果：passed/failed';
COMMENT ON COLUMN employee_induction_training.team_level_status IS '班组级培训状态：pending/in_progress/completed/exempted';
COMMENT ON COLUMN employee_induction_training.team_level_date IS '班组级培训日期';
COMMENT ON COLUMN employee_induction_training.team_level_trainer IS '班组级培训讲师';
COMMENT ON COLUMN employee_induction_training.team_level_hours IS '班组级培训学时';
COMMENT ON COLUMN employee_induction_training.team_level_result IS '班组级考核结果：passed/failed';
COMMENT ON COLUMN employee_induction_training.total_hours IS '总学时';
COMMENT ON COLUMN employee_induction_training.overall_status IS '整体状态：in_progress/completed/expired';
COMMENT ON COLUMN employee_induction_training.overall_result IS '整体考核结果：passed/failed';
COMMENT ON COLUMN employee_induction_training.qualified_date IS '合格日期';
COMMENT ON COLUMN employee_induction_training.expiry_date IS '过期日期（需重新培训）';
COMMENT ON COLUMN employee_induction_training.created_by IS '创建人ID';
COMMENT ON COLUMN employee_induction_training.is_deleted IS '软删除标识';

-- ============================================================
-- 三、employee_training_status — 培训状态统计表
-- ============================================================

CREATE TABLE IF NOT EXISTS employee_training_status (
    id                      BIGSERIAL PRIMARY KEY,
    employee_id             BIGINT NOT NULL,
    position_id             BIGINT NOT NULL,
    total_requirements      INTEGER NOT NULL DEFAULT 0,
    completed_count         INTEGER NOT NULL DEFAULT 0,
    pending_count           INTEGER NOT NULL DEFAULT 0,
    expired_count           INTEGER NOT NULL DEFAULT 0,
    compliance_rate         DECIMAL(5,2) DEFAULT 0,
    compliance_status       VARCHAR(20) NOT NULL DEFAULT 'unknown',
    last_training_date      DATE,
    next_due_date           DATE,
    pending_trainings       JSONB,
    expired_trainings       JSONB,
    last_analyzed_at        TIMESTAMP,
    analyzed_by             BIGINT,
    remark                  TEXT,
    created_at              TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMP NOT NULL DEFAULT NOW(),
    is_deleted              BOOLEAN NOT NULL DEFAULT FALSE
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_training_status_employee
    ON employee_training_status (employee_id) WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_training_status_position
    ON employee_training_status (position_id) WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_training_status_compliance_status
    ON employee_training_status (compliance_status) WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_training_status_compliance_rate
    ON employee_training_status (compliance_rate DESC) WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_training_status_next_due
    ON employee_training_status (next_due_date) WHERE next_due_date IS NOT NULL AND is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_training_status_last_analyzed
    ON employee_training_status (last_analyzed_at) WHERE last_analyzed_at IS NOT NULL AND is_deleted = false;

-- 部分唯一索引：每个员工每个岗位只有一条状态记录
DO $$ BEGIN
    CREATE UNIQUE INDEX IF NOT EXISTS uk_training_status_employee_position
        ON employee_training_status (employee_id, position_id) WHERE is_deleted = false;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 注释
COMMENT ON TABLE employee_training_status IS 'HSE员工培训状态统计表（Sprint5.3 v63）';
COMMENT ON COLUMN employee_training_status.employee_id IS '员工ID（关联employee.id）';
COMMENT ON COLUMN employee_training_status.position_id IS '岗位ID（关联position.id）';
COMMENT ON COLUMN employee_training_status.total_requirements IS '该岗位培训要求总数';
COMMENT ON COLUMN employee_training_status.completed_count IS '已完成培训数';
COMMENT ON COLUMN employee_training_status.pending_count IS '待完成培训数';
COMMENT ON COLUMN employee_training_status.expired_count IS '过期培训数';
COMMENT ON COLUMN employee_training_status.compliance_rate IS '合规率（%）';
COMMENT ON COLUMN employee_training_status.compliance_status IS '合规状态：compliant/partial/non_compliant/unknown';
COMMENT ON COLUMN employee_training_status.last_training_date IS '最近培训日期';
COMMENT ON COLUMN employee_training_status.next_due_date IS '下次到期日期';
COMMENT ON COLUMN employee_training_status.pending_trainings IS '待完成培训清单（JSONB）';
COMMENT ON COLUMN employee_training_status.expired_trainings IS '过期培训清单（JSONB）';
COMMENT ON COLUMN employee_training_status.last_analyzed_at IS '最近分析时间';
COMMENT ON COLUMN employee_training_status.analyzed_by IS '分析执行人ID';
COMMENT ON COLUMN employee_training_status.is_deleted IS '软删除标识';

-- ============================================================
-- 四、验证查询
-- ============================================================

DO $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count FROM information_schema.tables
    WHERE table_name IN ('training_record', 'employee_induction_training', 'employee_training_status');
    RAISE NOTICE 'v63迁移验证：新增表 % 个', v_count;
END $$;

COMMIT;