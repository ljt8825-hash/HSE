-- ============================================================
-- Sprint8-A-1: 风险预测模型冻结修订 - 数据库迁移
-- 创建日期: 2026-07-23
-- 说明: 新建预测模型版本管理表，初始化 v1.0 模型
-- 约束: 不修改 employee_risk/driver_risk/accident/assessment/warning 表
-- ============================================================

-- ============================================================
-- 1. 预测模型版本管理表（hse_prediction_model_version）
-- 管理预测模型的版本、参数和状态
-- ============================================================
CREATE TABLE IF NOT EXISTS hse_prediction_model_version (
    id                  BIGSERIAL    PRIMARY KEY,
    model_code          VARCHAR(64)  NOT NULL,                         -- 模型编码: HSE-RISK-PREDICT
    version             VARCHAR(32)  NOT NULL,                         -- 版本号: v1.0
    algorithm           VARCHAR(64)  NOT NULL,                         -- 算法: linear_regression
    prediction_cycle    INTEGER      NOT NULL DEFAULT 3,              -- 预测周期（月）: 默认3个月
    parameters          JSONB        NOT NULL DEFAULT '{}',          -- 模型参数
    -- 置信度配置
    confidence_method   VARCHAR(32)  NOT NULL DEFAULT 'r2',         -- 置信度计算方法: r2
    confidence_min      NUMERIC(5,2) NOT NULL DEFAULT 30,            -- 最低置信度阈值(%)
    -- 风险等级映射
    level_critical      NUMERIC(10,2) NOT NULL DEFAULT 80,           -- critical阈值: ≥80
    level_major         NUMERIC(10,2) NOT NULL DEFAULT 65,           -- major阈值: 65-79
    level_minor         NUMERIC(10,2) NOT NULL DEFAULT 50,           -- minor阈值: 50-64
    -- 异常检测配置
    anomaly_stddev_threshold NUMERIC(5,2) NOT NULL DEFAULT 2,       -- 标准差异常阈值
    anomaly_slope_threshold  NUMERIC(10,4) NOT NULL DEFAULT 1,       -- 斜率异常阈值
    anomaly_accident_surge  INTEGER      NOT NULL DEFAULT 5,         -- 事故激增阈值
    -- 趋势判定配置
    trend_up_threshold      NUMERIC(5,2) NOT NULL DEFAULT 5,         -- 上升阈值(%)
    trend_down_threshold    NUMERIC(5,2) NOT NULL DEFAULT -5,       -- 下降阈值(%)
    -- 状态
    status              VARCHAR(20)  NOT NULL DEFAULT 'active',   -- active/inactive/deprecated
    is_frozen           BOOLEAN      NOT NULL DEFAULT TRUE,        -- 是否已冻结
    change_log          TEXT,                                        -- 变更说明
    created_by          BIGINT,
    created_at          TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMP    NOT NULL DEFAULT NOW(),
    is_deleted          BOOLEAN    NOT NULL DEFAULT FALSE
);

COMMENT ON TABLE hse_prediction_model_version IS 'Sprint8-A-1 预测模型版本管理表';
COMMENT ON COLUMN hse_prediction_model_version.model_code IS '模型编码: HSE-RISK-PREDICT（风险预测模型）';
COMMENT ON COLUMN hse_prediction_model_version.version IS '版本号，如 v1.0';
COMMENT ON COLUMN hse_prediction_model_version.algorithm IS '预测算法: linear_regression-线性回归';
COMMENT ON COLUMN hse_prediction_model_version.prediction_cycle IS '默认预测周期（月），支持月度滚动预测';
COMMENT ON COLUMN hse_prediction_model_version.confidence_method IS '置信度计算方法: r2-决定系数';
COMMENT ON COLUMN hse_prediction_model_version.level_critical IS '风险等级阈值: critical ≥ 80';
COMMENT ON COLUMN hse_prediction_model_version.level_major IS '风险等级阈值: major 65-79';
COMMENT ON COLUMN hse_prediction_model_version.level_minor IS '风险等级阈值: minor 50-64';
COMMENT ON COLUMN hse_prediction_model_version.anomaly_stddev_threshold IS '标准差异常检测阈值: |x-μ| > 2σ';
COMMENT ON COLUMN hse_prediction_model_version.anomaly_slope_threshold IS '斜率突变检测阈值: |slope| > 1';
COMMENT ON COLUMN hse_prediction_model_version.anomaly_accident_surge IS '事故激增检测阈值: 月事故数 > 5';
COMMENT ON COLUMN hse_prediction_model_version.is_frozen IS '模型是否已冻结，冻结后不可修改';

CREATE UNIQUE INDEX IF NOT EXISTS idx_pred_model_code_version ON hse_prediction_model_version(model_code, version) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_pred_model_status ON hse_prediction_model_version(status) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_pred_model_frozen ON hse_prediction_model_version(is_frozen) WHERE is_deleted = false;

-- ============================================================
-- 2. 初始化 v1.0 冻结版本
-- ============================================================
INSERT INTO hse_prediction_model_version (
    model_code, version, algorithm, prediction_cycle,
    parameters,
    confidence_method, confidence_min,
    level_critical, level_major, level_minor,
    anomaly_stddev_threshold, anomaly_slope_threshold, anomaly_accident_surge,
    trend_up_threshold, trend_down_threshold,
    status, is_frozen, change_log
)
SELECT * FROM (VALUES
    (
        'HSE-RISK-PREDICT',
        'v1.0',
        'linear_regression',
        3,
        '{"min_data_points": 3, "max_prediction_cycle": 12, "step_size": 1}'::jsonb,
        'r2',
        30,
        80,
        65,
        50,
        2,
        1,
        5,
        5,
        -5,
        'active',
        TRUE,
        'Sprint8-A-1 冻结版本：采用线性回归趋势预测，标准差/趋势突变/事故激增三重异常检测，R²置信度计算'
    )
) AS t(model_code, version, algorithm, prediction_cycle, parameters, confidence_method, confidence_min,
       level_critical, level_major, level_minor, anomaly_stddev_threshold, anomaly_slope_threshold, anomaly_accident_surge,
       trend_up_threshold, trend_down_threshold, status, is_frozen, change_log)
WHERE NOT EXISTS (
    SELECT 1 FROM hse_prediction_model_version
    WHERE model_code = 'HSE-RISK-PREDICT' AND version = 'v1.0'
);

-- ============================================================
-- 3. 新增字段：hse_risk_prediction 表增加模型版本关联
-- ============================================================
ALTER TABLE hse_risk_prediction ADD COLUMN IF NOT EXISTS model_version_id BIGINT;
COMMENT ON COLUMN hse_risk_prediction.model_version_id IS '关联预测模型版本ID';

CREATE INDEX IF NOT EXISTS idx_risk_prediction_model_version ON hse_risk_prediction(model_version_id) WHERE is_deleted = false;