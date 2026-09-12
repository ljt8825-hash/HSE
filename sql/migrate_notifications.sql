BEGIN;

CREATE TABLE IF NOT EXISTS notifications (
    id              BIGSERIAL      PRIMARY KEY,
    user_id         BIGINT         NOT NULL,
    title           VARCHAR(200)   NOT NULL,
    content         TEXT,
    type            VARCHAR(30)    NOT NULL DEFAULT 'system',
    biz_type        VARCHAR(50),
    biz_id          VARCHAR(100),
    is_read         BOOLEAN        NOT NULL DEFAULT false,
    created_at      TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    read_at         TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

COMMENT ON TABLE notifications IS '站内消息通知表';
COMMENT ON COLUMN notifications.type IS '消息类型：system系统 workflow工作流 alert告警';
COMMENT ON COLUMN notifications.biz_type IS '业务类型：workflow_instance workflow_task等';
COMMENT ON COLUMN notifications.biz_id IS '业务ID，如流程实例ID、任务ID';

COMMIT;
