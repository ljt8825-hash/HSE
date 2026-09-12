CREATE TABLE IF NOT EXISTS regulations (
    id              BIGSERIAL    PRIMARY KEY,
    name            VARCHAR(256) NOT NULL,
    category        VARCHAR(64),
    version         VARCHAR(32),
    status          VARCHAR(16)  DEFAULT '有效',
    effective_date  DATE,
    department      VARCHAR(128),
    remark          TEXT,
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_deleted      BOOLEAN      NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_reg_name ON regulations(name);
CREATE INDEX IF NOT EXISTS idx_reg_category ON regulations(category);
CREATE INDEX IF NOT EXISTS idx_reg_status ON regulations(status);
CREATE INDEX IF NOT EXISTS idx_reg_deleted ON regulations(is_deleted);
