-- ============================================================
-- HSE 安全数据分析中心迁移脚本 v5.0
-- 阶段六A：HSE安全数据分析中心建设
-- 日期：2026-07-11
-- 说明：新增3张统计表（日/月/年），实现统计快照机制
-- ============================================================

-- ============================================================
-- 1. hse_statistics_daily（每日安全统计表）
-- 每日生成一次安全数据快照
-- ============================================================
CREATE TABLE IF NOT EXISTS hse_statistics_daily (
    id                  BIGSERIAL PRIMARY KEY,
    stat_date           DATE NOT NULL UNIQUE,
    
    event_count         INT DEFAULT 0,
    hazard_count        INT DEFAULT 0,
    accident_count      INT DEFAULT 0,
    violation_count     INT DEFAULT 0,
    patrol_alert_count  INT DEFAULT 0,
    iot_alert_count     INT DEFAULT 0,
    
    task_total          INT DEFAULT 0,
    task_completed      INT DEFAULT 0,
    task_overdue        INT DEFAULT 0,
    task_pending        INT DEFAULT 0,
    
    rectification_total INT DEFAULT 0,
    rectification_done  INT DEFAULT 0,
    review_total        INT DEFAULT 0,
    review_passed       INT DEFAULT 0,
    
    high_risk_count     INT DEFAULT 0,
    medium_risk_count   INT DEFAULT 0,
    low_risk_count      INT DEFAULT 0,
    
    training_rate       DECIMAL(5,2) DEFAULT 0,
    completion_rate     DECIMAL(5,2) DEFAULT 0,
    rectification_rate  DECIMAL(5,2) DEFAULT 0,
    
    department_id       BIGINT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_hse_stats_daily_date ON hse_statistics_daily(stat_date);
CREATE INDEX IF NOT EXISTS idx_hse_stats_daily_dept ON hse_statistics_daily(department_id);

COMMENT ON TABLE hse_statistics_daily IS '每日安全统计表';
COMMENT ON COLUMN hse_statistics_daily.event_count IS '总事件数';
COMMENT ON COLUMN hse_statistics_daily.hazard_count IS '隐患数';
COMMENT ON COLUMN hse_statistics_daily.accident_count IS '事故数';
COMMENT ON COLUMN hse_statistics_daily.task_total IS '任务总数';
COMMENT ON COLUMN hse_statistics_daily.task_completed IS '已完成任务数';
COMMENT ON COLUMN hse_statistics_daily.task_overdue IS '逾期任务数';
COMMENT ON COLUMN hse_statistics_daily.high_risk_count IS '高风险数';
COMMENT ON COLUMN hse_statistics_daily.training_rate IS '培训完成率';
COMMENT ON COLUMN hse_statistics_daily.completion_rate IS '任务完成率';
COMMENT ON COLUMN hse_statistics_daily.rectification_rate IS '整改完成率';

-- ============================================================
-- 2. hse_statistics_monthly（每月安全统计表）
-- 每月生成一次安全数据快照
-- ============================================================
CREATE TABLE IF NOT EXISTS hse_statistics_monthly (
    id                  BIGSERIAL PRIMARY KEY,
    stat_month          VARCHAR(7) NOT NULL UNIQUE,
    stat_year           INT NOT NULL,
    stat_month_num      INT NOT NULL,
    
    event_count         INT DEFAULT 0,
    hazard_count        INT DEFAULT 0,
    accident_count      INT DEFAULT 0,
    violation_count     INT DEFAULT 0,
    patrol_alert_count  INT DEFAULT 0,
    iot_alert_count     INT DEFAULT 0,
    
    task_total          INT DEFAULT 0,
    task_completed      INT DEFAULT 0,
    task_overdue        INT DEFAULT 0,
    task_pending        INT DEFAULT 0,
    
    rectification_total INT DEFAULT 0,
    rectification_done  INT DEFAULT 0,
    review_total        INT DEFAULT 0,
    review_passed       INT DEFAULT 0,
    
    high_risk_count     INT DEFAULT 0,
    medium_risk_count   INT DEFAULT 0,
    low_risk_count      INT DEFAULT 0,
    
    training_rate       DECIMAL(5,2) DEFAULT 0,
    completion_rate     DECIMAL(5,2) DEFAULT 0,
    rectification_rate  DECIMAL(5,2) DEFAULT 0,
    
    avg_response_time   DECIMAL(10,2) DEFAULT 0,
    avg_rectify_time    DECIMAL(10,2) DEFAULT 0,
    
    department_id       BIGINT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_hse_stats_monthly_month ON hse_statistics_monthly(stat_month);
CREATE INDEX IF NOT EXISTS idx_hse_stats_monthly_year ON hse_statistics_monthly(stat_year);
CREATE INDEX IF NOT EXISTS idx_hse_stats_monthly_dept ON hse_statistics_monthly(department_id);

COMMENT ON TABLE hse_statistics_monthly IS '每月安全统计表';
COMMENT ON COLUMN hse_statistics_monthly.avg_response_time IS '平均响应时间(小时)';
COMMENT ON COLUMN hse_statistics_monthly.avg_rectify_time IS '平均整改时间(小时)';

-- ============================================================
-- 3. hse_statistics_yearly（每年安全统计表）
-- 每年生成一次安全数据快照
-- ============================================================
CREATE TABLE IF NOT EXISTS hse_statistics_yearly (
    id                  BIGSERIAL PRIMARY KEY,
    stat_year           INT NOT NULL UNIQUE,
    
    event_count         INT DEFAULT 0,
    hazard_count        INT DEFAULT 0,
    accident_count      INT DEFAULT 0,
    violation_count     INT DEFAULT 0,
    patrol_alert_count  INT DEFAULT 0,
    iot_alert_count     INT DEFAULT 0,
    
    task_total          INT DEFAULT 0,
    task_completed      INT DEFAULT 0,
    task_overdue        INT DEFAULT 0,
    task_pending        INT DEFAULT 0,
    
    rectification_total INT DEFAULT 0,
    rectification_done  INT DEFAULT 0,
    review_total        INT DEFAULT 0,
    review_passed       INT DEFAULT 0,
    
    high_risk_count     INT DEFAULT 0,
    medium_risk_count   INT DEFAULT 0,
    low_risk_count      INT DEFAULT 0,
    
    training_rate       DECIMAL(5,2) DEFAULT 0,
    completion_rate     DECIMAL(5,2) DEFAULT 0,
    rectification_rate  DECIMAL(5,2) DEFAULT 0,
    
    avg_response_time   DECIMAL(10,2) DEFAULT 0,
    avg_rectify_time    DECIMAL(10,2) DEFAULT 0,
    
    accident_rate_trend DECIMAL(5,2) DEFAULT 0,
    hazard_rate_trend   DECIMAL(5,2) DEFAULT 0,
    
    department_id       BIGINT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_hse_stats_yearly_year ON hse_statistics_yearly(stat_year);
CREATE INDEX IF NOT EXISTS idx_hse_stats_yearly_dept ON hse_statistics_yearly(department_id);

COMMENT ON TABLE hse_statistics_yearly IS '每年安全统计表';
COMMENT ON COLUMN hse_statistics_yearly.accident_rate_trend IS '事故率同比变化(%)';
COMMENT ON COLUMN hse_statistics_yearly.hazard_rate_trend IS '隐患率同比变化(%)';

-- ============================================================
-- 4. 部门统计表
-- ============================================================
CREATE TABLE IF NOT EXISTS hse_statistics_dept (
    id                  BIGSERIAL PRIMARY KEY,
    department_id       BIGINT NOT NULL,
    department_name     VARCHAR(128),
    stat_date           DATE NOT NULL,
    stat_period         VARCHAR(10) NOT NULL,
    
    event_count         INT DEFAULT 0,
    hazard_count        INT DEFAULT 0,
    accident_count      INT DEFAULT 0,
    
    task_total          INT DEFAULT 0,
    task_completed      INT DEFAULT 0,
    task_overdue        INT DEFAULT 0,
    
    completion_rate     DECIMAL(5,2) DEFAULT 0,
    rectification_rate  DECIMAL(5,2) DEFAULT 0,
    
    high_risk_count     INT DEFAULT 0,
    
    ranking             INT DEFAULT 0,
    score               DECIMAL(10,2) DEFAULT 0,
    
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (department_id, stat_date, stat_period)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_hse_stats_dept_date ON hse_statistics_dept(stat_date);
CREATE INDEX IF NOT EXISTS idx_hse_stats_dept_period ON hse_statistics_dept(stat_period);

COMMENT ON TABLE hse_statistics_dept IS '部门安全统计表';
COMMENT ON COLUMN hse_statistics_dept.stat_period IS '统计周期 daily/monthly/yearly';
COMMENT ON COLUMN hse_statistics_dept.ranking IS '排名';
COMMENT ON COLUMN hse_statistics_dept.score IS '安全评分';

-- ============================================================
-- 5. 责任人统计表
-- ============================================================
CREATE TABLE IF NOT EXISTS hse_statistics_person (
    id                  BIGSERIAL PRIMARY KEY,
    person_id           BIGINT,
    person_name         VARCHAR(128) NOT NULL,
    department_id       BIGINT,
    stat_date           DATE NOT NULL,
    stat_period         VARCHAR(10) NOT NULL,
    
    task_total          INT DEFAULT 0,
    task_completed      INT DEFAULT 0,
    task_overdue        INT DEFAULT 0,
    
    completion_rate     DECIMAL(5,2) DEFAULT 0,
    avg_completion_time DECIMAL(10,2) DEFAULT 0,
    
    hazard_discovered   INT DEFAULT 0,
    rectification_done  INT DEFAULT 0,
    
    ranking             INT DEFAULT 0,
    score               DECIMAL(10,2) DEFAULT 0,
    
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (person_id, stat_date, stat_period)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_hse_stats_person_date ON hse_statistics_person(stat_date);
CREATE INDEX IF NOT EXISTS idx_hse_stats_person_name ON hse_statistics_person(person_name);

COMMENT ON TABLE hse_statistics_person IS '责任人安全统计表';

-- ============================================================
-- 完成标记
-- ============================================================
INSERT INTO sys_operation_log (module, action, target_id, target_type, operator, ip, detail, created_at)
VALUES ('hse_statistics', 'migration', 'v5.0', 'database', 'system', '127.0.0.1', 'HSE安全数据分析中心迁移完成', NOW())
ON CONFLICT DO NOTHING;