-- ============================================================
-- HSE 智能闭环工作流迁移脚本 v4.3
-- 阶段五：HSE智能闭环工作流建设
-- 日期：2026-07-11
-- 说明：新增2张任务表，实现检查任务和整改任务的统一管理
-- ============================================================

-- ============================================================
-- 1. hse_inspection_tasks（检查任务表）
-- 用于管理检查计划生成的检查任务及其执行记录
-- ============================================================
CREATE TABLE IF NOT EXISTS hse_inspection_tasks (
    id              BIGSERIAL PRIMARY KEY,
    plan_id         BIGINT NOT NULL,
    task_code       VARCHAR(64) UNIQUE NOT NULL,
    executor_id     BIGINT,
    executor_name   VARCHAR(128),
    department_id   BIGINT,
    scheduled_date  DATE NOT NULL,
    completed_date  DATE,
    status          VARCHAR(32) NOT NULL DEFAULT 'pending',
    result          VARCHAR(64),
    findings_count  INT DEFAULT 0,
    remark          TEXT,
    created_by      BIGINT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_deleted      BOOLEAN NOT NULL DEFAULT FALSE
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_hse_inspection_tasks_plan ON hse_inspection_tasks(plan_id);
CREATE INDEX IF NOT EXISTS idx_hse_inspection_tasks_executor ON hse_inspection_tasks(executor_id);
CREATE INDEX IF NOT EXISTS idx_hse_inspection_tasks_dept ON hse_inspection_tasks(department_id);
CREATE INDEX IF NOT EXISTS idx_hse_inspection_tasks_status ON hse_inspection_tasks(status);
CREATE INDEX IF NOT EXISTS idx_hse_inspection_tasks_date ON hse_inspection_tasks(scheduled_date);

COMMENT ON TABLE hse_inspection_tasks IS '检查任务表';
COMMENT ON COLUMN hse_inspection_tasks.status IS '状态 pending/in_progress/completed/canceled';
COMMENT ON COLUMN hse_inspection_tasks.result IS '检查结果 passed/failed/partial';

-- ============================================================
-- 2. hse_tasks（统一任务中心表）
-- 用于统一管理整改任务、培训任务、复查任务等
-- ============================================================
CREATE TABLE IF NOT EXISTS hse_tasks (
    id                  BIGSERIAL PRIMARY KEY,
    task_code           VARCHAR(64) UNIQUE NOT NULL,
    task_type           VARCHAR(32) NOT NULL,
    source_event_id     BIGINT,
    source_table        VARCHAR(64),
    source_id           BIGINT,
    title               VARCHAR(255) NOT NULL,
    description         TEXT,
    responsible_person_id   BIGINT,
    responsible_person      VARCHAR(128),
    department_id       BIGINT,
    priority            VARCHAR(16) DEFAULT 'normal',
    deadline            DATE,
    status              VARCHAR(32) NOT NULL DEFAULT 'pending',
    completed_at        TIMESTAMPTZ,
    overdue_days        INT DEFAULT 0,
    is_overdue          BOOLEAN DEFAULT FALSE,
    reminder_sent       BOOLEAN DEFAULT FALSE,
    escalation_level    INT DEFAULT 0,
    created_by          BIGINT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_deleted          BOOLEAN NOT NULL DEFAULT FALSE
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_hse_tasks_type ON hse_tasks(task_type);
CREATE INDEX IF NOT EXISTS idx_hse_tasks_source_event ON hse_tasks(source_event_id);
CREATE INDEX IF NOT EXISTS idx_hse_tasks_responsible ON hse_tasks(responsible_person_id);
CREATE INDEX IF NOT EXISTS idx_hse_tasks_dept ON hse_tasks(department_id);
CREATE INDEX IF NOT EXISTS idx_hse_tasks_status ON hse_tasks(status);
CREATE INDEX IF NOT EXISTS idx_hse_tasks_deadline ON hse_tasks(deadline);
CREATE INDEX IF NOT EXISTS idx_hse_tasks_overdue ON hse_tasks(is_overdue);

COMMENT ON TABLE hse_tasks IS 'HSE统一任务中心表';
COMMENT ON COLUMN hse_tasks.task_type IS '任务类型 rectification/training/review/inspection';
COMMENT ON COLUMN hse_tasks.priority IS '优先级 low/normal/high/urgent';
COMMENT ON COLUMN hse_tasks.status IS '状态 pending/in_progress/completed/canceled/overdue';
COMMENT ON COLUMN hse_tasks.escalation_level IS '升级级别 0-未升级 1-一级升级 2-二级升级';

-- ============================================================
-- 3. 更新已有表字段
-- ============================================================

-- hse_events 增加任务关联字段
ALTER TABLE IF EXISTS hse_events
ADD COLUMN IF NOT EXISTS task_id BIGINT;

ALTER TABLE IF EXISTS hse_events
ADD COLUMN IF NOT EXISTS auto_generated BOOLEAN DEFAULT FALSE;

-- hse_rectifications 增加任务关联字段
ALTER TABLE IF EXISTS hse_rectifications
ADD COLUMN IF NOT EXISTS task_id BIGINT;

-- hse_reviews 增加任务关联字段
ALTER TABLE IF EXISTS hse_reviews
ADD COLUMN IF NOT EXISTS task_id BIGINT;

-- ============================================================
-- 4. 检查任务执行记录表（可选）
-- ============================================================
CREATE TABLE IF NOT EXISTS hse_inspection_executions (
    id              BIGSERIAL PRIMARY KEY,
    task_id         BIGINT NOT NULL,
    executed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    executor_id     BIGINT,
    executor_name   VARCHAR(128),
    items           JSONB,
    findings        JSONB,
    photos          JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hse_inspection_executions_task ON hse_inspection_executions(task_id);

COMMENT ON TABLE hse_inspection_executions IS '检查任务执行记录表';

-- ============================================================
-- 5. 提醒记录表
-- ============================================================
CREATE TABLE IF NOT EXISTS hse_task_reminders (
    id              BIGSERIAL PRIMARY KEY,
    task_id         BIGINT NOT NULL,
    reminder_type   VARCHAR(32) NOT NULL,
    sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    channel         VARCHAR(32),
    recipients      JSONB,
    content         TEXT,
    status          VARCHAR(32) DEFAULT 'sent',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hse_task_reminders_task ON hse_task_reminders(task_id);
CREATE INDEX IF NOT EXISTS idx_hse_task_reminders_type ON hse_task_reminders(reminder_type);

COMMENT ON TABLE hse_task_reminders IS '任务提醒记录表';
COMMENT ON COLUMN hse_task_reminders.reminder_type IS '提醒类型 approaching/overdue/escalation';
COMMENT ON COLUMN hse_task_reminders.channel IS '发送渠道 system/email/sms/dingtalk';

-- ============================================================
-- 完成标记
-- ============================================================
INSERT INTO sys_operation_log (module, action, target_id, target_type, operator, ip, detail, created_at)
VALUES ('hse_workflow', 'migration', 'v4.3', 'database', 'system', '127.0.0.1', 'HSE智能闭环工作流迁移完成', NOW())
ON CONFLICT DO NOTHING;