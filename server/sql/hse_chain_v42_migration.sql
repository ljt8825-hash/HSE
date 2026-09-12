-- ============================================================
-- HSE 标准化闭环引擎迁移脚本 v4.2
-- 阶段四：HSE标准化闭环引擎建设
-- 日期：2026-07-11
-- 说明：新增2张表+1个视图，扩展已有表字段，完善关联关系
-- ============================================================

-- ============================================================
-- 1. 为 hse_events 增加字段
-- ============================================================
ALTER TABLE IF EXISTS hse_events
ADD COLUMN IF NOT EXISTS business_area VARCHAR(64),
ADD COLUMN IF NOT EXISTS risk_level_snapshot VARCHAR(16);

-- ============================================================
-- 2. hse_inspection_plans（检查计划表）
-- ============================================================
CREATE TABLE IF NOT EXISTS hse_inspection_plans (
    id              BIGSERIAL PRIMARY KEY,
    plan_code       VARCHAR(64) UNIQUE NOT NULL,
    plan_name       VARCHAR(255) NOT NULL,
    risk_source_id  BIGINT,
    department_id   BIGINT,
    cycle_type      VARCHAR(32) NOT NULL DEFAULT 'monthly',
    start_date      DATE NOT NULL,
    end_date        DATE,
    status          VARCHAR(32) NOT NULL DEFAULT 'active',
    created_by      BIGINT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_deleted      BOOLEAN NOT NULL DEFAULT FALSE
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_hse_inspection_plans_source ON hse_inspection_plans(risk_source_id);
CREATE INDEX IF NOT EXISTS idx_hse_inspection_plans_dept ON hse_inspection_plans(department_id);
CREATE INDEX IF NOT EXISTS idx_hse_inspection_plans_status ON hse_inspection_plans(status);

COMMENT ON TABLE hse_inspection_plans IS '检查计划表';
COMMENT ON COLUMN hse_inspection_plans.cycle_type IS '周期类型 daily/weekly/monthly/quarterly/annual';

-- ============================================================
-- 3. hse_risk_objects（风险对象表）
-- ============================================================
CREATE TABLE IF NOT EXISTS hse_risk_objects (
    id              BIGSERIAL PRIMARY KEY,
    object_name     VARCHAR(255) NOT NULL,
    object_type     VARCHAR(64) NOT NULL,
    department_id   BIGINT,
    location        VARCHAR(255),
    description     TEXT,
    risk_level      VARCHAR(16),
    is_active       BOOLEAN DEFAULT TRUE,
    created_by      BIGINT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_deleted      BOOLEAN NOT NULL DEFAULT FALSE
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_hse_risk_objects_type ON hse_risk_objects(object_type);
CREATE INDEX IF NOT EXISTS idx_hse_risk_objects_dept ON hse_risk_objects(department_id);

COMMENT ON TABLE hse_risk_objects IS '风险对象表';
COMMENT ON COLUMN hse_risk_objects.object_type IS '对象类型 facility/equipment/process/area/person';

-- ============================================================
-- 4. 更新已有表的关联字段（完善闭环关系）
-- ============================================================

-- hse_risk_factors 增加风险对象关联
ALTER TABLE IF EXISTS hse_risk_factors
ADD COLUMN IF NOT EXISTS risk_object_id BIGINT;

CREATE INDEX IF NOT EXISTS idx_hse_risk_factors_object ON hse_risk_factors(risk_object_id);

-- hse_control_measures 增加检查计划关联
ALTER TABLE IF EXISTS hse_control_measures
ADD COLUMN IF NOT EXISTS inspection_plan_id BIGINT;

CREATE INDEX IF NOT EXISTS idx_hse_control_measures_plan ON hse_control_measures(inspection_plan_id);

-- hse_rectifications 增加检查计划关联
ALTER TABLE IF EXISTS hse_rectifications
ADD COLUMN IF NOT EXISTS inspection_plan_id BIGINT;

CREATE INDEX IF NOT EXISTS idx_hse_rectifications_plan ON hse_rectifications(inspection_plan_id);

-- hse_reviews 增加风险源关联
ALTER TABLE IF EXISTS hse_reviews
ADD COLUMN IF NOT EXISTS risk_source_id BIGINT;

CREATE INDEX IF NOT EXISTS idx_hse_reviews_risk ON hse_reviews(risk_source_id);

-- ============================================================
-- 5. hse_event_chain_view（闭环查询视图）
-- ============================================================
CREATE OR REPLACE VIEW hse_event_chain_view AS
WITH recursive event_chain AS (
    SELECT
        e.id AS event_id,
        e.event_code,
        e.event_type,
        e.title,
        e.severity,
        e.status,
        e.occurred_at,
        e.source_table,
        e.source_id,
        e.risk_source_id,
        e.parent_event_id,
        e.department_id,
        e.created_at,
        0 AS depth,
        ARRAY[e.id] AS path,
        JSONB_BUILD_OBJECT(
            'type', e.event_type,
            'code', e.event_code,
            'title', e.title,
            'severity', e.severity,
            'status', e.status,
            'occurred_at', e.occurred_at,
            'source_table', e.source_table,
            'source_id', e.source_id
        ) AS node_data
    FROM hse_events e
    WHERE e.is_deleted = FALSE
    
    UNION ALL
    
    SELECT
        e.id AS event_id,
        e.event_code,
        e.event_type,
        e.title,
        e.severity,
        e.status,
        e.occurred_at,
        e.source_table,
        e.source_id,
        e.risk_source_id,
        e.parent_event_id,
        e.department_id,
        e.created_at,
        ec.depth + 1 AS depth,
        ec.path || e.id AS path,
        JSONB_BUILD_OBJECT(
            'type', e.event_type,
            'code', e.event_code,
            'title', e.title,
            'severity', e.severity,
            'status', e.status,
            'occurred_at', e.occurred_at,
            'source_table', e.source_table,
            'source_id', e.source_id
        ) AS node_data
    FROM hse_events e
    JOIN event_chain ec ON e.parent_event_id = ec.event_id
    WHERE e.is_deleted = FALSE AND e.id <> ALL(ec.path)
)
SELECT
    ec.event_id,
    ec.event_code,
    ec.event_type,
    ec.title,
    ec.severity,
    ec.status,
    ec.occurred_at,
    ec.source_table,
    ec.source_id,
    ec.risk_source_id,
    ec.parent_event_id,
    ec.department_id,
    ec.depth,
    ec.path,
    ec.node_data,
    rf.factor_code,
    rf.name AS risk_factor_name,
    rf.risk_level AS factor_risk_level,
    cm.measure_code,
    cm.name AS measure_name,
    cm.type AS measure_type,
    ip.plan_code,
    ip.plan_name,
    ip.cycle_type,
    ro.object_name,
    ro.object_type,
    r.source_id AS risk_source_code,
    r.name AS risk_source_name,
    r.level AS risk_source_level,
    d.name AS department_name
FROM event_chain ec
LEFT JOIN hse_risk_factors rf ON ec.risk_source_id = rf.risk_source_id
LEFT JOIN hse_control_measures cm ON rf.id = cm.risk_factor_id
LEFT JOIN hse_inspection_plans ip ON cm.inspection_plan_id = ip.id OR ec.source_id = ip.id
LEFT JOIN hse_risk_objects ro ON rf.risk_object_id = ro.id
LEFT JOIN risk_sources r ON ec.risk_source_id = r.id
LEFT JOIN departments d ON ec.department_id = d.id
ORDER BY ec.depth ASC, ec.occurred_at ASC;

COMMENT ON VIEW hse_event_chain_view IS 'HSE闭环查询视图 - 风险→措施→检查→隐患→整改→复查';

-- ============================================================
-- 完成标记
-- ============================================================
INSERT INTO sys_operation_log (module, action, target_id, target_type, operator, ip, detail, created_at)
VALUES ('hse_chain', 'migration', 'v4.2', 'database', 'system', '127.0.0.1', 'HSE标准化闭环引擎迁移完成', NOW())
ON CONFLICT DO NOTHING;