-- =====================================================================
-- HSE 人员主数据中心 v64 扩展迁移脚本
-- 版本: v64 (Sprint5.4 扩展)
-- 内容: inspection_plan + inspection_task + inspection_record + hazard_record
-- 依据: sprint5.4-design-document.md
-- 方式: 增量迁移，仅 CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS
-- 兼容性: 可重复执行，不删除字段，不修改已有数据结构
-- =====================================================================

BEGIN;

-- ============================================================
-- 一、inspection_plan — 检查计划表
-- ============================================================

CREATE TABLE IF NOT EXISTS inspection_plan (
    id                      BIGSERIAL PRIMARY KEY,
    plan_name               VARCHAR(128) NOT NULL,
    plan_code               VARCHAR(64) NOT NULL,
    plan_type               VARCHAR(32) NOT NULL DEFAULT 'routine',
    plan_category           VARCHAR(32),
    description             TEXT,
    scope_description       TEXT,
    inspection_items        JSONB,
    frequency               VARCHAR(32) NOT NULL DEFAULT 'monthly',
    frequency_interval      INTEGER DEFAULT 1,
    start_date              DATE NOT NULL,
    end_date                DATE,
    next_inspection_date    DATE,
    responsible_id          BIGINT NOT NULL,
    assignee_ids            BIGINT[],
    department_id           BIGINT,
    position_id             BIGINT,
    is_active               BOOLEAN NOT NULL DEFAULT TRUE,
    approval_required       BOOLEAN NOT NULL DEFAULT FALSE,
    approval_level          INTEGER DEFAULT 1,
    ai_analysis_enabled     BOOLEAN NOT NULL DEFAULT FALSE,
    ai_last_analysis_date   TIMESTAMP,
    ai_last_suggestion      TEXT,
    remark                  TEXT,
    created_by              BIGINT,
    created_at              TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMP NOT NULL DEFAULT NOW(),
    is_deleted              BOOLEAN NOT NULL DEFAULT FALSE
);

-- 索引
CREATE UNIQUE INDEX IF NOT EXISTS uk_inspection_plan_code
    ON inspection_plan (plan_code) WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_inspection_plan_type
    ON inspection_plan (plan_type) WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_inspection_plan_category
    ON inspection_plan (plan_category) WHERE plan_category IS NOT NULL AND is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_inspection_plan_responsible
    ON inspection_plan (responsible_id) WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_inspection_plan_department
    ON inspection_plan (department_id) WHERE department_id IS NOT NULL AND is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_inspection_plan_position
    ON inspection_plan (position_id) WHERE position_id IS NOT NULL AND is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_inspection_plan_active
    ON inspection_plan (is_active) WHERE is_active = true AND is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_inspection_plan_start_date
    ON inspection_plan (start_date) WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_inspection_plan_next_date
    ON inspection_plan (next_inspection_date) WHERE next_inspection_date IS NOT NULL AND is_deleted = false;

-- 注释
COMMENT ON TABLE inspection_plan IS 'HSE检查计划表（Sprint5.4 v64）';
COMMENT ON COLUMN inspection_plan.plan_name IS '计划名称';
COMMENT ON COLUMN inspection_plan.plan_code IS '计划编号（唯一）';
COMMENT ON COLUMN inspection_plan.plan_type IS '计划类型：routine/periodic/special/audit/external/emergency';
COMMENT ON COLUMN inspection_plan.plan_category IS '计划分类：safety/health/environment/fire/equipment/quality';
COMMENT ON COLUMN inspection_plan.description IS '计划描述';
COMMENT ON COLUMN inspection_plan.scope_description IS '检查范围描述';
COMMENT ON COLUMN inspection_plan.inspection_items IS '检查项清单（JSONB）';
COMMENT ON COLUMN inspection_plan.frequency IS '检查频率：daily/weekly/monthly/quarterly/yearly/once';
COMMENT ON COLUMN inspection_plan.frequency_interval IS '频率间隔（如每2周）';
COMMENT ON COLUMN inspection_plan.start_date IS '开始日期';
COMMENT ON COLUMN inspection_plan.end_date IS '结束日期';
COMMENT ON COLUMN inspection_plan.next_inspection_date IS '下次检查日期';
COMMENT ON COLUMN inspection_plan.responsible_id IS '责任人ID（关联employee.id）';
COMMENT ON COLUMN inspection_plan.assignee_ids IS '执行人员ID列表';
COMMENT ON COLUMN inspection_plan.department_id IS '所属部门';
COMMENT ON COLUMN inspection_plan.position_id IS '适用岗位';
COMMENT ON COLUMN inspection_plan.is_active IS '是否启用';
COMMENT ON COLUMN inspection_plan.approval_required IS '是否需要审批';
COMMENT ON COLUMN inspection_plan.approval_level IS '审批级别';
COMMENT ON COLUMN inspection_plan.ai_analysis_enabled IS '是否启用AI分析';
COMMENT ON COLUMN inspection_plan.ai_last_analysis_date IS '上次AI分析日期';
COMMENT ON COLUMN inspection_plan.ai_last_suggestion IS 'AI建议（仅参考）';
COMMENT ON COLUMN inspection_plan.is_deleted IS '软删除标识';

-- ============================================================
-- 二、inspection_task — 检查任务表
-- ============================================================

CREATE TABLE IF NOT EXISTS inspection_task (
    id                      BIGSERIAL PRIMARY KEY,
    plan_id                 BIGINT NOT NULL,
    task_name               VARCHAR(128) NOT NULL,
    task_code               VARCHAR(64) NOT NULL,
    assignee_id             BIGINT NOT NULL,
    inspectors              BIGINT[],
    scheduled_date          DATE NOT NULL,
    due_date                DATE,
    status                  VARCHAR(20) NOT NULL DEFAULT 'pending',
    priority                VARCHAR(20) NOT NULL DEFAULT 'normal',
    progress                INTEGER NOT NULL DEFAULT 0,
    inspection_items        JSONB,
    actual_start_time       TIMESTAMP,
    actual_end_time         TIMESTAMP,
    result_summary          TEXT,
    completed_items_count   INTEGER DEFAULT 0,
    total_items_count       INTEGER DEFAULT 0,
    hazards_found_count     INTEGER DEFAULT 0,
    supervisor_id           BIGINT,
    approval_status         VARCHAR(20) DEFAULT 'pending',
    approval_comment        TEXT,
    approval_time           TIMESTAMP,
    approved_by             BIGINT,
    is_deleted              BOOLEAN NOT NULL DEFAULT FALSE,
    created_by              BIGINT,
    created_at              TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 索引
CREATE UNIQUE INDEX IF NOT EXISTS uk_inspection_task_code
    ON inspection_task (task_code) WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_inspection_task_plan
    ON inspection_task (plan_id) WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_inspection_task_assignee
    ON inspection_task (assignee_id) WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_inspection_task_status
    ON inspection_task (status) WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_inspection_task_priority
    ON inspection_task (priority) WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_inspection_task_scheduled_date
    ON inspection_task (scheduled_date) WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_inspection_task_due_date
    ON inspection_task (due_date) WHERE due_date IS NOT NULL AND is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_inspection_task_supervisor
    ON inspection_task (supervisor_id) WHERE supervisor_id IS NOT NULL AND is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_inspection_task_approval_status
    ON inspection_task (approval_status) WHERE approval_status IS NOT NULL AND is_deleted = false;

-- 注释
COMMENT ON TABLE inspection_task IS 'HSE检查任务表（Sprint5.4 v64）';
COMMENT ON COLUMN inspection_task.plan_id IS '关联检查计划ID';
COMMENT ON COLUMN inspection_task.task_name IS '任务名称';
COMMENT ON COLUMN inspection_task.task_code IS '任务编号（唯一）';
COMMENT ON COLUMN inspection_task.assignee_id IS '执行人ID（关联employee.id）';
COMMENT ON COLUMN inspection_task.inspectors IS '检查人员ID列表';
COMMENT ON COLUMN inspection_task.scheduled_date IS '计划执行日期';
COMMENT ON COLUMN inspection_task.due_date IS '截止日期';
COMMENT ON COLUMN inspection_task.status IS '任务状态：pending/in_progress/completed/cancelled/overdue';
COMMENT ON COLUMN inspection_task.priority IS '优先级：low/normal/high/urgent';
COMMENT ON COLUMN inspection_task.progress IS '进度（0-100）';
COMMENT ON COLUMN inspection_task.inspection_items IS '检查项列表（JSONB）';
COMMENT ON COLUMN inspection_task.actual_start_time IS '实际开始时间';
COMMENT ON COLUMN inspection_task.actual_end_time IS '实际结束时间';
COMMENT ON COLUMN inspection_task.result_summary IS '结果摘要';
COMMENT ON COLUMN inspection_task.completed_items_count IS '已完成检查项数';
COMMENT ON COLUMN inspection_task.total_items_count IS '总检查项数';
COMMENT ON COLUMN inspection_task.hazards_found_count IS '发现问题数';
COMMENT ON COLUMN inspection_task.supervisor_id IS '监督人ID';
COMMENT ON COLUMN inspection_task.approval_status IS '审批状态：pending/approved/rejected';
COMMENT ON COLUMN inspection_task.approval_comment IS '审批意见';
COMMENT ON COLUMN inspection_task.approval_time IS '审批时间';
COMMENT ON COLUMN inspection_task.approved_by IS '审批人ID';
COMMENT ON COLUMN inspection_task.is_deleted IS '软删除标识';

-- ============================================================
-- 三、inspection_record — 检查记录表
-- ============================================================

CREATE TABLE IF NOT EXISTS inspection_record (
    id                      BIGSERIAL PRIMARY KEY,
    task_id                 BIGINT NOT NULL,
    plan_id                 BIGINT,
    employee_id             BIGINT NOT NULL,
    position_id             BIGINT,
    inspection_time         TIMESTAMP NOT NULL,
    inspection_location     VARCHAR(128),
    item_name               VARCHAR(128) NOT NULL,
    item_category           VARCHAR(64),
    item_code               VARCHAR(64),
    result                  VARCHAR(20) NOT NULL DEFAULT 'pass',
    comment                 TEXT,
    photos                  JSONB,
    attachments             JSONB,
    ai_analysis             TEXT,
    ai_suggestion           TEXT,
    ai_confidence           DECIMAL(5,2),
    is_hazard_detected      BOOLEAN NOT NULL DEFAULT FALSE,
    hazard_record_id        BIGINT,
    is_deleted              BOOLEAN NOT NULL DEFAULT FALSE,
    created_at              TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_inspection_record_task
    ON inspection_record (task_id) WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_inspection_record_plan
    ON inspection_record (plan_id) WHERE plan_id IS NOT NULL AND is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_inspection_record_employee
    ON inspection_record (employee_id) WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_inspection_record_position
    ON inspection_record (position_id) WHERE position_id IS NOT NULL AND is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_inspection_record_time
    ON inspection_record (inspection_time) WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_inspection_record_result
    ON inspection_record (result) WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_inspection_record_hazard
    ON inspection_record (is_hazard_detected) WHERE is_hazard_detected = true AND is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_inspection_record_hazard_id
    ON inspection_record (hazard_record_id) WHERE hazard_record_id IS NOT NULL AND is_deleted = false;

-- 注释
COMMENT ON TABLE inspection_record IS 'HSE检查记录表（Sprint5.4 v64）';
COMMENT ON COLUMN inspection_record.task_id IS '关联检查任务ID';
COMMENT ON COLUMN inspection_record.plan_id IS '关联检查计划ID';
COMMENT ON COLUMN inspection_record.employee_id IS '检查人员ID（关联employee.id）';
COMMENT ON COLUMN inspection_record.position_id IS '检查人员岗位ID';
COMMENT ON COLUMN inspection_record.inspection_time IS '检查时间';
COMMENT ON COLUMN inspection_record.inspection_location IS '检查地点';
COMMENT ON COLUMN inspection_record.item_name IS '检查项名称';
COMMENT ON COLUMN inspection_record.item_category IS '检查项分类';
COMMENT ON COLUMN inspection_record.item_code IS '检查项编号';
COMMENT ON COLUMN inspection_record.result IS '检查结果：pass/fail/pending/not_applicable';
COMMENT ON COLUMN inspection_record.comment IS '备注说明';
COMMENT ON COLUMN inspection_record.photos IS '现场照片列表（JSONB）';
COMMENT ON COLUMN inspection_record.attachments IS '附件列表（JSONB）';
COMMENT ON COLUMN inspection_record.ai_analysis IS 'AI分析结果（仅参考）';
COMMENT ON COLUMN inspection_record.ai_suggestion IS 'AI建议（仅参考）';
COMMENT ON COLUMN inspection_record.ai_confidence IS 'AI置信度';
COMMENT ON COLUMN inspection_record.is_hazard_detected IS '是否发现隐患';
COMMENT ON COLUMN inspection_record.hazard_record_id IS '关联隐患记录ID';
COMMENT ON COLUMN inspection_record.is_deleted IS '软删除标识';

-- ============================================================
-- 四、hazard_record — 隐患记录表
-- ============================================================

CREATE TABLE IF NOT EXISTS hazard_record (
    id                      BIGSERIAL PRIMARY KEY,
    hazard_code             VARCHAR(64) NOT NULL,
    task_id                 BIGINT NOT NULL,
    record_id               BIGINT,
    employee_id             BIGINT NOT NULL,
    department_id           BIGINT,
    position_id             BIGINT,
    hazard_level            VARCHAR(20) NOT NULL DEFAULT 'medium',
    hazard_category         VARCHAR(32) NOT NULL,
    hazard_type             VARCHAR(64),
    description             TEXT NOT NULL,
    location                VARCHAR(128),
    photos                  JSONB,
    evidence                JSONB,
    root_cause              TEXT,
    ai_root_cause_analysis  TEXT,
    ai_suggestion           TEXT,
    ai_confidence           DECIMAL(5,2),
    responsible_id          BIGINT NOT NULL,
    corrective_actions      JSONB,
    deadline_date           DATE NOT NULL,
    actual_completion_date  DATE,
    status                  VARCHAR(20) NOT NULL DEFAULT 'open',
    review_status           VARCHAR(20) DEFAULT 'pending',
    review_comment          TEXT,
    reviewer_id             BIGINT,
    review_date             DATE,
    is_closed               BOOLEAN NOT NULL DEFAULT FALSE,
    is_deleted              BOOLEAN NOT NULL DEFAULT FALSE,
    created_by              BIGINT,
    created_at              TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 索引
CREATE UNIQUE INDEX IF NOT EXISTS uk_hazard_record_code
    ON hazard_record (hazard_code) WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_hazard_record_task
    ON hazard_record (task_id) WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_hazard_record_record
    ON hazard_record (record_id) WHERE record_id IS NOT NULL AND is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_hazard_record_employee
    ON hazard_record (employee_id) WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_hazard_record_department
    ON hazard_record (department_id) WHERE department_id IS NOT NULL AND is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_hazard_record_position
    ON hazard_record (position_id) WHERE position_id IS NOT NULL AND is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_hazard_record_level
    ON hazard_record (hazard_level) WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_hazard_record_category
    ON hazard_record (hazard_category) WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_hazard_record_responsible
    ON hazard_record (responsible_id) WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_hazard_record_status
    ON hazard_record (status) WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_hazard_record_review_status
    ON hazard_record (review_status) WHERE review_status IS NOT NULL AND is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_hazard_record_deadline
    ON hazard_record (deadline_date) WHERE deadline_date IS NOT NULL AND is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_hazard_record_closed
    ON hazard_record (is_closed) WHERE is_closed = false AND is_deleted = false;

-- 注释
COMMENT ON TABLE hazard_record IS 'HSE隐患记录表（Sprint5.4 v64）';
COMMENT ON COLUMN hazard_record.hazard_code IS '隐患编号（唯一）';
COMMENT ON COLUMN hazard_record.task_id IS '关联检查任务ID';
COMMENT ON COLUMN hazard_record.record_id IS '关联检查记录ID';
COMMENT ON COLUMN hazard_record.employee_id IS '发现人ID（关联employee.id）';
COMMENT ON COLUMN hazard_record.department_id IS '所属部门';
COMMENT ON COLUMN hazard_record.position_id IS '发现人岗位';
COMMENT ON COLUMN hazard_record.hazard_level IS '隐患等级：critical/high/medium/low';
COMMENT ON COLUMN hazard_record.hazard_category IS '隐患分类：safety/health/environment/fire/equipment/process/behavior';
COMMENT ON COLUMN hazard_record.hazard_type IS '隐患类型';
COMMENT ON COLUMN hazard_record.description IS '隐患描述';
COMMENT ON COLUMN hazard_record.location IS '隐患位置';
COMMENT ON COLUMN hazard_record.photos IS '隐患照片（JSONB）';
COMMENT ON COLUMN hazard_record.evidence IS '证据材料（JSONB）';
COMMENT ON COLUMN hazard_record.root_cause IS '根本原因';
COMMENT ON COLUMN hazard_record.ai_root_cause_analysis IS 'AI根因分析（仅参考）';
COMMENT ON COLUMN hazard_record.ai_suggestion IS 'AI整改建议（仅参考）';
COMMENT ON COLUMN hazard_record.ai_confidence IS 'AI置信度';
COMMENT ON COLUMN hazard_record.responsible_id IS '整改责任人ID（关联employee.id）';
COMMENT ON COLUMN hazard_record.corrective_actions IS '整改措施（JSONB）';
COMMENT ON COLUMN hazard_record.deadline_date IS '整改期限';
COMMENT ON COLUMN hazard_record.actual_completion_date IS '实际完成日期';
COMMENT ON COLUMN hazard_record.status IS '隐患状态：open/in_progress/pending_review/closed/rejected';
COMMENT ON COLUMN hazard_record.review_status IS '复查状态：pending/passed/failed';
COMMENT ON COLUMN hazard_record.review_comment IS '复查意见';
COMMENT ON COLUMN hazard_record.reviewer_id IS '复查人ID';
COMMENT ON COLUMN hazard_record.review_date IS '复查日期';
COMMENT ON COLUMN hazard_record.is_closed IS '是否已关闭';
COMMENT ON COLUMN hazard_record.is_deleted IS '软删除标识';

-- ============================================================
-- 五、验证查询
-- ============================================================

DO $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count FROM information_schema.tables
    WHERE table_name IN ('inspection_plan', 'inspection_task', 'inspection_record', 'hazard_record');
    RAISE NOTICE 'v64迁移验证：新增表 % 个', v_count;
END $$;

COMMIT;