BEGIN;

CREATE TABLE IF NOT EXISTS workflows (
    id              BIGSERIAL     PRIMARY KEY,
    code            VARCHAR(50)   NOT NULL UNIQUE,
    name            VARCHAR(100)  NOT NULL,
    description     VARCHAR(500),
    definition      JSONB,
    sort_order      INTEGER       DEFAULT 0,
    is_active       BOOLEAN       NOT NULL DEFAULT true,
    created_by      VARCHAR(100),
    created_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS workflow_instances (
    id                  BIGSERIAL     PRIMARY KEY,
    workflow_id         BIGINT        NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    workflow_code       VARCHAR(50)   NOT NULL,
    workflow_name       VARCHAR(100)  NOT NULL,
    business_key        VARCHAR(100),
    status              VARCHAR(20)   NOT NULL DEFAULT 'running',
    current_node        VARCHAR(50),
    initiator_id        BIGINT        NOT NULL,
    initiator_name      VARCHAR(100)  NOT NULL,
    form_data           JSONB,
    created_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at        TIMESTAMP
);

CREATE TABLE IF NOT EXISTS workflow_tasks (
    id                  BIGSERIAL     PRIMARY KEY,
    instance_id         BIGINT        NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
    task_code           VARCHAR(50)   NOT NULL,
    task_name           VARCHAR(100)  NOT NULL,
    assignee_id         BIGINT        NOT NULL,
    assignee_name       VARCHAR(100)  NOT NULL,
    status              VARCHAR(20)   NOT NULL DEFAULT 'pending',
    priority            VARCHAR(10)   DEFAULT 'normal',
    comment             TEXT,
    created_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at        TIMESTAMP
);

CREATE TABLE IF NOT EXISTS workflow_history (
    id                  BIGSERIAL     PRIMARY KEY,
    instance_id         BIGINT        NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
    node_name           VARCHAR(100)  NOT NULL,
    action              VARCHAR(50)   NOT NULL,
    operator_id         BIGINT,
    operator_name       VARCHAR(100),
    comment             TEXT,
    created_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_workflow_instances_workflow_id ON workflow_instances(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_instances_status ON workflow_instances(status);
CREATE INDEX IF NOT EXISTS idx_workflow_instances_initiator_id ON workflow_instances(initiator_id);
CREATE INDEX IF NOT EXISTS idx_workflow_tasks_instance_id ON workflow_tasks(instance_id);
CREATE INDEX IF NOT EXISTS idx_workflow_tasks_assignee_id ON workflow_tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_workflow_tasks_status ON workflow_tasks(status);
CREATE INDEX IF NOT EXISTS idx_workflow_history_instance_id ON workflow_history(instance_id);

INSERT INTO workflows (code, name, description, definition, sort_order, is_active)
SELECT 'hazard_report', '隐患上报审批', '隐患排查上报审批流程', '{"nodes":[{"code":"submit","name":"提交申请","type":"start"},{"code":"review","name":"部门审核","type":"approval"},{"code":"approval","name":"安全科审批","type":"approval"},{"code":"complete","name":"完成","type":"end"}]}', 1, true
WHERE NOT EXISTS (SELECT 1 FROM workflows WHERE code = 'hazard_report');

INSERT INTO workflows (code, name, description, definition, sort_order, is_active)
SELECT 'training_apply', '培训申请审批', '安全培训申请审批流程', '{"nodes":[{"code":"submit","name":"提交申请","type":"start"},{"code":"review","name":"部门审核","type":"approval"},{"code":"complete","name":"完成","type":"end"}]}', 2, true
WHERE NOT EXISTS (SELECT 1 FROM workflows WHERE code = 'training_apply');

INSERT INTO workflows (code, name, description, definition, sort_order, is_active)
SELECT 'accident_report', '事故报告审批', '事故报告审批流程', '{"nodes":[{"code":"submit","name":"提交报告","type":"start"},{"code":"review","name":"部门审核","type":"approval"},{"code":"safety_approval","name":"安全科审批","type":"approval"},{"code":"leader_approval","name":"领导审批","type":"approval"},{"code":"complete","name":"完成","type":"end"}]}', 3, true
WHERE NOT EXISTS (SELECT 1 FROM workflows WHERE code = 'accident_report');

COMMIT;
