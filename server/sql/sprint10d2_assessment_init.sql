-- ============================================================
-- HSE月度安全履职考核数据库DDL脚本
-- 版本：v1.0
-- 日期：2026-07-23
-- 数据库：PostgreSQL 15
-- 依据：《月度安全履职考核数据库设计.md》v3.0
-- 任务：Sprint10-D-2-1
-- ============================================================
-- 执行顺序：
--   1. hse_assessment_cycle       考核周期表
--   2. hse_assessment_target      考核对象表
--   3. hse_assessment_metric      考核指标表
--   4. hse_assessment_score       评分记录表
--   5. hse_assessment_deduction   扣分明细表
--   6. hse_deduction_adjustment   扣分调整记录表
--   7. hse_responsibility_chain   责任传导关系表
--   8. hse_assessment_audit_log   考核审计日志表
-- ============================================================

BEGIN;

-- ============================================================
-- 1. 考核周期表 hse_assessment_cycle
-- ============================================================
CREATE TABLE IF NOT EXISTS hse_assessment_cycle (
    id              BIGSERIAL     PRIMARY KEY,
    cycle_code      VARCHAR(50)   NOT NULL UNIQUE,
    cycle_name      VARCHAR(100)  NOT NULL,
    cycle_type      VARCHAR(20)   NOT NULL DEFAULT 'monthly',
    assessment_year INT           NOT NULL,
    assessment_month INT          NOT NULL,
    start_time      TIMESTAMPTZ   NOT NULL,
    end_time        TIMESTAMPTZ   NOT NULL,
    status          VARCHAR(20)   NOT NULL DEFAULT 'not_started',
    target_count    INT           DEFAULT 0,
    scored_count    INT           DEFAULT 0,
    reviewed_count  INT           DEFAULT 0,
    frozen_count    INT           DEFAULT 0,
    created_by      BIGINT,
    created_by_name VARCHAR(50),
    frozen_by       BIGINT,
    frozen_by_name  VARCHAR(50),
    frozen_at       TIMESTAMPTZ,
    remark          TEXT,
    is_deleted      BOOLEAN      DEFAULT FALSE,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cycle_code ON hse_assessment_cycle (cycle_code);
CREATE INDEX IF NOT EXISTS idx_cycle_status ON hse_assessment_cycle (status);
CREATE INDEX IF NOT EXISTS idx_cycle_year_month ON hse_assessment_cycle (assessment_year, assessment_month);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cycle_code_active ON hse_assessment_cycle (cycle_code) WHERE is_deleted = FALSE;

COMMENT ON TABLE hse_assessment_cycle IS '月度考核周期表';
COMMENT ON COLUMN hse_assessment_cycle.cycle_code IS '周期编码：HSE-CYCLE-{YYYYMM}';
COMMENT ON COLUMN hse_assessment_cycle.status IS '状态：not_started/in_progress/pending_review/reviewed/frozen';

-- ============================================================
-- 2. 考核对象表 hse_assessment_target
-- ============================================================
CREATE TABLE IF NOT EXISTS hse_assessment_target (
    id              BIGSERIAL     PRIMARY KEY,
    cycle_id        BIGINT        NOT NULL,
    employee_id     BIGINT        NOT NULL,
    employee_code   VARCHAR(50),
    employee_name   VARCHAR(50)   NOT NULL,
    position        VARCHAR(50)   NOT NULL,
    township        VARCHAR(50),
    department      VARCHAR(50),
    status          VARCHAR(20)   NOT NULL DEFAULT 'pending',
    score_auto      NUMERIC(6,2),
    score_manual    NUMERIC(6,2),
    score_bonus     NUMERIC(6,2),
    score_total     NUMERIC(6,2),
    grade           VARCHAR(5),
    rank_township   INT,
    rank_all        INT,
    is_rejected     BOOLEAN      DEFAULT FALSE,
    reject_type     VARCHAR(50),
    reject_reason   TEXT,
    review_status   VARCHAR(20)   DEFAULT 'pending',
    review_progress INT           DEFAULT 0,
    score_version   INT           DEFAULT 1,
    appeal_status   VARCHAR(20)   DEFAULT 'none',
    reviewed_by     BIGINT,
    reviewed_at     TIMESTAMPTZ,
    submitted_at    TIMESTAMPTZ,
    is_deleted      BOOLEAN      DEFAULT FALSE,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_target_cycle ON hse_assessment_target (cycle_id);
CREATE INDEX IF NOT EXISTS idx_target_employee ON hse_assessment_target (employee_id);
CREATE INDEX IF NOT EXISTS idx_target_status ON hse_assessment_target (status);
CREATE INDEX IF NOT EXISTS idx_target_township ON hse_assessment_target (township);
CREATE INDEX IF NOT EXISTS idx_target_position ON hse_assessment_target (position);
CREATE INDEX IF NOT EXISTS idx_target_score ON hse_assessment_target (score_total DESC);

COMMENT ON TABLE hse_assessment_target IS '月度考核对象表（仅乡镇经理+管理员）';
COMMENT ON COLUMN hse_assessment_target.position IS '岗位：乡镇作业中心经理/管理员';
COMMENT ON COLUMN hse_assessment_target.review_status IS '审核状态：pending/approved/rejected';

-- 冻结数据保护触发器
CREATE OR REPLACE FUNCTION prevent_frozen_target_modify()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status = 'frozen' THEN
        RAISE EXCEPTION '已冻结的考核对象记录不可修改';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_frozen_target ON hse_assessment_target;
CREATE TRIGGER trg_prevent_frozen_target
    BEFORE UPDATE ON hse_assessment_target
    FOR EACH ROW
    EXECUTE FUNCTION prevent_frozen_target_modify();

-- updated_at 自动更新触发器
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cycle_updated_at ON hse_assessment_cycle;
CREATE TRIGGER trg_cycle_updated_at
    BEFORE UPDATE ON hse_assessment_cycle
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_target_updated_at ON hse_assessment_target;
CREATE TRIGGER trg_target_updated_at
    BEFORE UPDATE ON hse_assessment_target
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- 3. 考核指标表 hse_assessment_metric
-- ============================================================
CREATE TABLE IF NOT EXISTS hse_assessment_metric (
    id              BIGSERIAL     PRIMARY KEY,
    metric_code     VARCHAR(50)   NOT NULL UNIQUE,
    metric_name     VARCHAR(100)  NOT NULL,
    category        VARCHAR(30)   NOT NULL,
    target_post     VARCHAR(50)   NOT NULL DEFAULT 'all',
    base_score      NUMERIC(5,2)  NOT NULL,
    metric_type     VARCHAR(20)   NOT NULL,
    data_source     VARCHAR(100),
    calc_formula    TEXT,
    rule_config     JSONB,
    weight_manager  NUMERIC(5,2),
    weight_admin    NUMERIC(5,2),
    sort_order      INT           DEFAULT 0,
    status          VARCHAR(20)   NOT NULL DEFAULT 'active',
    remark          TEXT,
    is_deleted      BOOLEAN      DEFAULT FALSE,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_metric_code ON hse_assessment_metric (metric_code) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_metric_category ON hse_assessment_metric (category);
CREATE INDEX IF NOT EXISTS idx_metric_status ON hse_assessment_metric (status);

DROP TRIGGER IF EXISTS trg_metric_updated_at ON hse_assessment_metric;
CREATE TRIGGER trg_metric_updated_at
    BEFORE UPDATE ON hse_assessment_metric
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE hse_assessment_metric IS '月度考核指标表';
COMMENT ON COLUMN hse_assessment_metric.metric_code IS '指标编码：HSE-KPI-{分类}-{序号}';
COMMENT ON COLUMN hse_assessment_metric.metric_type IS '类型：positive/negative/pass_fail/veto';

-- 初始化指标数据
INSERT INTO hse_assessment_metric (metric_code, metric_name, category, target_post, base_score, metric_type, data_source, weight_manager, weight_admin, sort_order)
VALUES
    ('HSE-KPI-SAF-001', '三违行为管控', 'SAFETY', 'all', 40, 'negative', 'violation_records', 30, 35, 1),
    ('HSE-KPI-RSK-001', '风险预警响应率', 'RISK', 'all', 20, 'positive', 'risk_alerts', 20, 15, 2),
    ('HSE-KPI-HZD-001', '隐患整改完成率', 'HAZARD', 'all', 20, 'positive', 'hazards', 15, 20, 3),
    ('HSE-KPI-TRN-001', '培训计划完成率', 'TRAINING', 'manager', 10, 'positive', 'training_records', 10, 10, 4),
    ('HSE-KPI-RESP-001', '责任书签订率', 'RESPONSIBILITY', 'all', 10, 'positive', 'responsibility_forms', 15, 10, 5),
    ('HSE-KPI-INC-001', '改进与创新', 'INNOVATION', 'all', 10, 'positive', 'manual', 10, 10, 6),
    ('HSE-KPI-NEG-001', '生产事故否决', 'SAFETY', 'all', 0, 'veto', 'accidents', 0, 0, 7),
    ('HSE-KPI-NEG-002', '交通事故否决', 'SAFETY', 'all', 0, 'veto', 'accidents', 0, 0, 8),
    ('HSE-KPI-NEG-003', '环境事故否决', 'SAFETY', 'all', 0, 'veto', 'accidents', 0, 0, 9)
ON CONFLICT (metric_code) DO NOTHING;

-- ============================================================
-- 4. 评分记录表 hse_assessment_score
-- ============================================================
CREATE TABLE IF NOT EXISTS hse_assessment_score (
    id              BIGSERIAL     PRIMARY KEY,
    target_id       BIGINT        NOT NULL,
    cycle_id        BIGINT        NOT NULL,
    metric_id       BIGINT        NOT NULL,
    metric_code     VARCHAR(50)   NOT NULL,
    raw_value       NUMERIC(10,2),
    raw_value_desc  VARCHAR(200),
    deduction_total NUMERIC(6,2)   DEFAULT 0,
    original_score  NUMERIC(6,2),
    final_score     NUMERIC(6,2),
    is_auto         BOOLEAN      DEFAULT TRUE,
    is_manual       BOOLEAN      DEFAULT FALSE,
    manual_input    NUMERIC(6,2),
    data_sources    JSONB,
    review_status   VARCHAR(20)   DEFAULT 'pending',
    calc_time       TIMESTAMPTZ,
    calc_duration   INT,
    remark          TEXT,
    is_deleted      BOOLEAN      DEFAULT FALSE,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_score_target ON hse_assessment_score (target_id);
CREATE INDEX IF NOT EXISTS idx_score_cycle ON hse_assessment_score (cycle_id);
CREATE INDEX IF NOT EXISTS idx_score_metric ON hse_assessment_score (metric_id);
CREATE INDEX IF NOT EXISTS idx_score_status ON hse_assessment_score (review_status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_score_unique ON hse_assessment_score (target_id, metric_id) WHERE is_deleted = FALSE;

DROP TRIGGER IF EXISTS trg_score_updated_at ON hse_assessment_score;
CREATE TRIGGER trg_score_updated_at
    BEFORE UPDATE ON hse_assessment_score
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE hse_assessment_score IS '月度考核评分记录表';

-- ============================================================
-- 5. 扣分明细表 hse_assessment_deduction
-- ============================================================
CREATE TABLE IF NOT EXISTS hse_assessment_deduction (
    id              BIGSERIAL     PRIMARY KEY,
    score_id        BIGINT        NOT NULL,
    target_id       BIGINT        NOT NULL,
    cycle_id        BIGINT        NOT NULL,
    metric_id       BIGINT        NOT NULL,
    metric_code     VARCHAR(50)   NOT NULL,
    deduction_item  VARCHAR(100)  NOT NULL,
    deduction_type  VARCHAR(30)   NOT NULL,
    deduction_source VARCHAR(30)  NOT NULL,
    source_table    VARCHAR(50),
    source_id       BIGINT,
    source_detail   JSONB,
    suggested_score NUMERIC(6,2)  NOT NULL,
    confirmed_score NUMERIC(6,2),
    current_version INT           DEFAULT 1,
    review_status   VARCHAR(20)   DEFAULT 'pending',
    review_id       BIGINT,
    violation_level VARCHAR(20),
    violation_date  DATE,
    violator_id     BIGINT,
    violator_name   VARCHAR(50),
    is_transmission BOOLEAN      DEFAULT FALSE,
    remark          TEXT,
    is_deleted      BOOLEAN      DEFAULT FALSE,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deduction_score ON hse_assessment_deduction (score_id);
CREATE INDEX IF NOT EXISTS idx_deduction_target ON hse_assessment_deduction (target_id);
CREATE INDEX IF NOT EXISTS idx_deduction_cycle ON hse_assessment_deduction (cycle_id);
CREATE INDEX IF NOT EXISTS idx_deduction_metric ON hse_assessment_deduction (metric_id);
CREATE INDEX IF NOT EXISTS idx_deduction_status ON hse_assessment_deduction (review_status);
CREATE INDEX IF NOT EXISTS idx_deduction_source ON hse_assessment_deduction (source_table, source_id);
CREATE INDEX IF NOT EXISTS idx_deduction_type ON hse_assessment_deduction (deduction_type);

DROP TRIGGER IF EXISTS trg_deduction_updated_at ON hse_assessment_deduction;
CREATE TRIGGER trg_deduction_updated_at
    BEFORE UPDATE ON hse_assessment_deduction
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE hse_assessment_deduction IS '月度考核扣分明细表';
COMMENT ON COLUMN hse_assessment_deduction.deduction_source IS '扣分来源：auto/import/manual';

-- ============================================================
-- 6. 扣分调整记录表 hse_deduction_adjustment
-- ============================================================
CREATE TABLE IF NOT EXISTS hse_deduction_adjustment (
    id              BIGSERIAL     PRIMARY KEY,
    deduction_id    BIGINT        NOT NULL,
    target_id       BIGINT        NOT NULL,
    version_no      INT           NOT NULL,
    old_score       NUMERIC(6,2),
    new_score       NUMERIC(6,2)  NOT NULL,
    operation_type  VARCHAR(30)   NOT NULL,
    adjustment_reason TEXT        NOT NULL,
    adjusted_by     BIGINT        NOT NULL,
    adjusted_by_name VARCHAR(50)  NOT NULL,
    adjusted_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    reviewed_by     BIGINT,
    reviewed_by_name VARCHAR(50),
    reviewed_at     TIMESTAMPTZ,
    related_event_id BIGINT,
    related_event_type VARCHAR(30),
    is_current      BOOLEAN      DEFAULT FALSE,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_adjustment_deduction ON hse_deduction_adjustment (deduction_id);
CREATE INDEX IF NOT EXISTS idx_adjustment_target ON hse_deduction_adjustment (target_id);
CREATE INDEX IF NOT EXISTS idx_adjustment_version ON hse_deduction_adjustment (deduction_id, version_no);
CREATE INDEX IF NOT EXISTS idx_adjustment_current ON hse_deduction_adjustment (deduction_id) WHERE is_current = TRUE;
CREATE UNIQUE INDEX IF NOT EXISTS idx_adjustment_version_unique ON hse_deduction_adjustment (deduction_id, version_no);

COMMENT ON TABLE hse_deduction_adjustment IS '扣分调整记录表（仅INSERT，禁止UPDATE/DELETE）';

-- 禁止UPDATE和DELETE触发器
CREATE OR REPLACE FUNCTION prevent_adjustment_modify()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION '扣分调整记录表仅允许INSERT，禁止UPDATE和DELETE';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_adjustment_update ON hse_deduction_adjustment;
CREATE TRIGGER trg_prevent_adjustment_update
    BEFORE UPDATE OR DELETE ON hse_deduction_adjustment
    FOR EACH ROW
    EXECUTE FUNCTION prevent_adjustment_modify();

-- ============================================================
-- 7. 责任传导关系表 hse_responsibility_chain
-- ============================================================
CREATE TABLE IF NOT EXISTS hse_responsibility_chain (
    id              BIGSERIAL     PRIMARY KEY,
    subordinate_id  BIGINT        NOT NULL,
    subordinate_name VARCHAR(50)  NOT NULL,
    subordinate_post VARCHAR(50),
    manager_id      BIGINT        NOT NULL,
    manager_name    VARCHAR(50)   NOT NULL,
    manager_post    VARCHAR(50),
    township        VARCHAR(50),
    relation_type   VARCHAR(20)   NOT NULL DEFAULT 'direct_line',
    chain_level     INT           DEFAULT 1,
    effective_date  DATE          NOT NULL,
    expire_date     DATE,
    is_active       BOOLEAN      DEFAULT TRUE,
    is_deleted      BOOLEAN      DEFAULT FALSE,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chain_subordinate ON hse_responsibility_chain (subordinate_id);
CREATE INDEX IF NOT EXISTS idx_chain_manager ON hse_responsibility_chain (manager_id);
CREATE INDEX IF NOT EXISTS idx_chain_active ON hse_responsibility_chain (is_active) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_chain_township ON hse_responsibility_chain (township);
CREATE UNIQUE INDEX IF NOT EXISTS idx_chain_unique ON hse_responsibility_chain (subordinate_id) WHERE is_active = TRUE AND is_deleted = FALSE;

DROP TRIGGER IF EXISTS trg_chain_updated_at ON hse_responsibility_chain;
CREATE TRIGGER trg_chain_updated_at
    BEFORE UPDATE ON hse_responsibility_chain
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE hse_responsibility_chain IS '责任传导关系表（仅1级传导）';
COMMENT ON COLUMN hse_responsibility_chain.chain_level IS '传导层级（固定1）';

-- ============================================================
-- 8. 考核审计日志表 hse_assessment_audit_log
-- ============================================================
CREATE TABLE IF NOT EXISTS hse_assessment_audit_log (
    id              BIGSERIAL     PRIMARY KEY,
    module          VARCHAR(30)   NOT NULL DEFAULT 'assessment',
    operation_type  VARCHAR(30)   NOT NULL,
    target_type     VARCHAR(30)   NOT NULL,
    target_id       BIGINT,
    target_desc     VARCHAR(200),
    operator_id     BIGINT        NOT NULL,
    operator_name   VARCHAR(50)   NOT NULL,
    operator_role   VARCHAR(30),
    operation_detail JSONB,
    operation_reason TEXT,
    ip_address      VARCHAR(50),
    user_agent      VARCHAR(200),
    operation_time  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_operator ON hse_assessment_audit_log (operator_id);
CREATE INDEX IF NOT EXISTS idx_audit_type ON hse_assessment_audit_log (operation_type);
CREATE INDEX IF NOT EXISTS idx_audit_target ON hse_assessment_audit_log (target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_audit_time ON hse_assessment_audit_log (operation_time);

COMMENT ON TABLE hse_assessment_audit_log IS '月度考核审计日志表（仅INSERT，禁止UPDATE/DELETE）';

-- 禁止修改审计日志触发器
CREATE OR REPLACE FUNCTION prevent_audit_log_modify()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION '审计日志表仅允许INSERT，禁止UPDATE和DELETE';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_audit_update ON hse_assessment_audit_log;
CREATE TRIGGER trg_prevent_audit_update
    BEFORE UPDATE OR DELETE ON hse_assessment_audit_log
    FOR EACH ROW
    EXECUTE FUNCTION prevent_audit_log_modify();

COMMIT;

-- ============================================================
-- 验证脚本执行结果
-- ============================================================
-- 执行完成后可运行以下查询验证：
-- SELECT tablename FROM pg_tables WHERE tablename LIKE 'hse_assessment%' OR tablename LIKE 'hse_deduction%' OR tablename LIKE 'hse_responsibility%' ORDER BY tablename;
-- SELECT count(*) FROM hse_assessment_metric;
-- ============================================================
