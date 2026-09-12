-- 临时修复：补齐当前后端代码依赖但数据库中缺失的表/字段
-- 执行时间：2026-07-13
-- 目标：消除因表结构不完整导致的 500 错误

-- 1. roles 表补充软删除字段
ALTER TABLE IF EXISTS roles ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. 创建 workflow 引擎所需表（若不存在）
CREATE TABLE IF NOT EXISTS workflows (
    id              BIGSERIAL PRIMARY KEY,
    code            VARCHAR(64) UNIQUE NOT NULL,
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    definition      JSONB,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order      INT DEFAULT 0,
    created_by      VARCHAR(64),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workflow_instances (
    id              BIGSERIAL PRIMARY KEY,
    workflow_id     BIGINT NOT NULL,
    workflow_code   VARCHAR(64),
    workflow_name   VARCHAR(255),
    business_key    VARCHAR(255),
    status          VARCHAR(32) NOT NULL DEFAULT 'running',
    current_node    VARCHAR(64),
    initiator_id    BIGINT,
    initiator_name  VARCHAR(128),
    form_data       JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at    TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS workflow_tasks (
    id              BIGSERIAL PRIMARY KEY,
    instance_id     BIGINT NOT NULL,
    task_code       VARCHAR(64) NOT NULL,
    task_name       VARCHAR(255) NOT NULL,
    assignee_id     BIGINT,
    assignee_name   VARCHAR(128),
    status          VARCHAR(32) NOT NULL DEFAULT 'pending',
    priority        VARCHAR(16) DEFAULT 'normal',
    comment         TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at    TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS workflow_history (
    id              BIGSERIAL PRIMARY KEY,
    instance_id     BIGINT NOT NULL,
    node_name       VARCHAR(255),
    action          VARCHAR(64) NOT NULL,
    operator_id     BIGINT,
    operator_name   VARCHAR(128),
    comment         TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflow_instances_workflow_id ON workflow_instances(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_instances_status ON workflow_instances(status);
CREATE INDEX IF NOT EXISTS idx_workflow_tasks_instance_id ON workflow_tasks(instance_id);
CREATE INDEX IF NOT EXISTS idx_workflow_tasks_assignee ON workflow_tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_workflow_tasks_status ON workflow_tasks(status);
CREATE INDEX IF NOT EXISTS idx_workflow_history_instance_id ON workflow_history(instance_id);

-- 3. 创建 notifications 通知表
CREATE TABLE IF NOT EXISTS notifications (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT NOT NULL,
    title           VARCHAR(255) NOT NULL,
    content         TEXT,
    type            VARCHAR(64) NOT NULL DEFAULT 'system',
    biz_type        VARCHAR(64),
    biz_id          VARCHAR(64),
    is_read         BOOLEAN NOT NULL DEFAULT FALSE,
    read_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted         BOOLEAN NOT NULL DEFAULT FALSE,
    created_by      VARCHAR(64),
    updated_by      VARCHAR(64)
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
