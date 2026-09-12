-- ============================================================
-- HSE 数据基础层迁移脚本 v1.0
-- 阶段三：HSE数据基础层落地实施
-- 日期：2026-07-11
-- 说明：新增7张核心表，不修改现有46张业务表
-- ============================================================

-- ============================================================
-- 1. hse_events（统一安全事件表）
-- ============================================================
CREATE TABLE IF NOT EXISTS hse_events (
    id              BIGSERIAL PRIMARY KEY,
    event_code      VARCHAR(64) UNIQUE NOT NULL,
    event_type      VARCHAR(32) NOT NULL,
    source_table    VARCHAR(64) NOT NULL,
    source_id       BIGINT NOT NULL,
    title           VARCHAR(255) NOT NULL,
    severity        VARCHAR(16) NOT NULL DEFAULT 'minor',
    status          VARCHAR(32) NOT NULL DEFAULT 'open',
    occurred_at     TIMESTAMPTZ NOT NULL,
    department_id   BIGINT,
    personnel_id    BIGINT,
    vehicle_id      BIGINT,
    risk_source_id  BIGINT,
    parent_event_id BIGINT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_deleted      BOOLEAN NOT NULL DEFAULT FALSE
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_hse_events_type ON hse_events(event_type);
CREATE INDEX IF NOT EXISTS idx_hse_events_status ON hse_events(status);
CREATE INDEX IF NOT EXISTS idx_hse_events_severity ON hse_events(severity);
CREATE INDEX IF NOT EXISTS idx_hse_events_occurred ON hse_events(occurred_at);
CREATE INDEX IF NOT EXISTS idx_hse_events_dept ON hse_events(department_id);
CREATE INDEX IF NOT EXISTS idx_hse_events_person ON hse_events(personnel_id);
CREATE INDEX IF NOT EXISTS idx_hse_events_vehicle ON hse_events(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_hse_events_parent ON hse_events(parent_event_id) WHERE parent_event_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uk_hse_events_source ON hse_events(source_table, source_id);

-- 注释
COMMENT ON TABLE hse_events IS '统一安全事件表 - HSE数据中心核心';
COMMENT ON COLUMN hse_events.event_code IS '事件编号 SE-YYYYMMDD-NNNNN';
COMMENT ON COLUMN hse_events.event_type IS '事件类型 hazard/accident/violation/patrol_alert/iot_alert/training_anomaly/risk_anomaly';
COMMENT ON COLUMN hse_events.source_table IS '源业务表名';
COMMENT ON COLUMN hse_events.source_id IS '源业务表记录ID';
COMMENT ON COLUMN hse_events.severity IS '严重等级 critical/major/minor/info';
COMMENT ON COLUMN hse_events.status IS '事件状态 open/processing/resolved/closed';

-- ============================================================
-- 2. hse_event_links（事件关联关系表）
-- ============================================================
CREATE TABLE IF NOT EXISTS hse_event_links (
    id             BIGSERIAL PRIMARY KEY,
    from_event_id  BIGINT NOT NULL,
    to_event_id    BIGINT NOT NULL,
    link_type      VARCHAR(32) NOT NULL,
    description    TEXT,
    created_by     BIGINT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_hse_event_links_from ON hse_event_links(from_event_id);
CREATE INDEX IF NOT EXISTS idx_hse_event_links_to ON hse_event_links(to_event_id);

COMMENT ON TABLE hse_event_links IS '事件关联关系表';
COMMENT ON COLUMN hse_event_links.link_type IS '关联类型 triggered_by/led_to/caused_by/related_to/derived_from';

-- ============================================================
-- 3. hse_event_timeline（事件处置时间线）
-- ============================================================
CREATE TABLE IF NOT EXISTS hse_event_timeline (
    id            BIGSERIAL PRIMARY KEY,
    event_id      BIGINT NOT NULL,
    action        VARCHAR(64) NOT NULL,
    actor_id      BIGINT,
    actor_name    VARCHAR(64),
    from_status   VARCHAR(32),
    to_status     VARCHAR(32),
    comment       TEXT,
    occurred_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_hse_event_timeline_event ON hse_event_timeline(event_id);

COMMENT ON TABLE hse_event_timeline IS '事件处置时间线';

-- ============================================================
-- 4. hse_risk_factors（危险因素表）
-- ============================================================
CREATE TABLE IF NOT EXISTS hse_risk_factors (
    id                  BIGSERIAL PRIMARY KEY,
    factor_code         VARCHAR(64) UNIQUE NOT NULL,
    risk_source_id      BIGINT NOT NULL,
    name                VARCHAR(255) NOT NULL,
    category            VARCHAR(64),
    description         TEXT,
    possibility         VARCHAR(16),
    severity_level      VARCHAR(16),
    exposure            VARCHAR(16),
    risk_value          NUMERIC(6,2),
    risk_level          VARCHAR(16),
    is_controlled       BOOLEAN DEFAULT FALSE,
    created_by          BIGINT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_deleted          BOOLEAN NOT NULL DEFAULT FALSE
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_hse_risk_factors_source ON hse_risk_factors(risk_source_id);
CREATE INDEX IF NOT EXISTS idx_hse_risk_factors_level ON hse_risk_factors(risk_level);

COMMENT ON TABLE hse_risk_factors IS '危险因素表';

-- ============================================================
-- 5. hse_control_measures（控制措施表）
-- ============================================================
CREATE TABLE IF NOT EXISTS hse_control_measures (
    id                      BIGSERIAL PRIMARY KEY,
    measure_code            VARCHAR(64) UNIQUE NOT NULL,
    risk_factor_id          BIGINT NOT NULL,
    type                    VARCHAR(32) NOT NULL,
    name                    VARCHAR(255) NOT NULL,
    content                 TEXT,
    responsible_person_id   BIGINT,
    responsible_person_name VARCHAR(64),
    department_id           BIGINT,
    frequency               VARCHAR(32),
    is_active               BOOLEAN DEFAULT TRUE,
    effectiveness_score     NUMERIC(4,2),
    created_by              BIGINT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_deleted              BOOLEAN NOT NULL DEFAULT FALSE
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_hse_control_measures_factor ON hse_control_measures(risk_factor_id);

COMMENT ON TABLE hse_control_measures IS '控制措施表';

-- ============================================================
-- 6. hse_rectifications（整改记录表）
-- ============================================================
CREATE TABLE IF NOT EXISTS hse_rectifications (
    id                      BIGSERIAL PRIMARY KEY,
    rect_code               VARCHAR(64) UNIQUE NOT NULL,
    hazard_id               BIGINT NOT NULL,
    event_id                BIGINT,
    measure                 TEXT NOT NULL,
    plan_type               VARCHAR(32),
    responsible_person_id   BIGINT,
    responsible_person_name VARCHAR(64),
    department_id           BIGINT,
    deadline                TIMESTAMPTZ,
    started_at              TIMESTAMPTZ,
    completed_at            TIMESTAMPTZ,
    status                  VARCHAR(32) DEFAULT 'pending',
    is_overdue              BOOLEAN DEFAULT FALSE,
    created_by              BIGINT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_deleted              BOOLEAN NOT NULL DEFAULT FALSE
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_hse_rectifications_hazard ON hse_rectifications(hazard_id);
CREATE INDEX IF NOT EXISTS idx_hse_rectifications_status ON hse_rectifications(status);

COMMENT ON TABLE hse_rectifications IS '整改记录表';

-- ============================================================
-- 7. hse_reviews（复查记录表）
-- ============================================================
CREATE TABLE IF NOT EXISTS hse_reviews (
    id              BIGSERIAL PRIMARY KEY,
    review_code     VARCHAR(64) UNIQUE NOT NULL,
    rectification_id BIGINT NOT NULL,
    hazard_id       BIGINT,
    reviewer_id     BIGINT,
    reviewer_name   VARCHAR(64),
    review_date     TIMESTAMPTZ NOT NULL,
    result          VARCHAR(32) NOT NULL,
    score           NUMERIC(4,2),
    comment         TEXT,
    is_recurred     BOOLEAN DEFAULT FALSE,
    new_hazard_id   BIGINT,
    created_by      BIGINT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_deleted      BOOLEAN NOT NULL DEFAULT FALSE
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_hse_reviews_rect ON hse_reviews(rectification_id);

COMMENT ON TABLE hse_reviews IS '复查记录表';

-- ============================================================
-- 完成标记
-- ============================================================
INSERT INTO sys_operation_log (module, action, target_id, target_type, operator, ip, detail, created_at)
VALUES ('hse_core', 'migration', 'v1.0', 'database', 'system', '127.0.0.1', 'HSE核心数据模型7张表创建完成', NOW())
ON CONFLICT DO NOTHING;