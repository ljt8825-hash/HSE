-- ============================================================
-- Sprint8-A: HSE智能分析中心 - 数据库迁移
-- 创建日期: 2026-07-23
-- 说明: 新建分析快照表和风险预测表
-- 约束: 仅读取已有模型数据，禁止修改 employee_risk/driver_risk/accident/assessment/warning/rectification 表
-- ============================================================

-- ============================================================
-- 1. 分析快照表（hse_analysis_snapshot）
-- 存储周期性的风险分析聚合数据，用于趋势对比
-- ============================================================
CREATE TABLE IF NOT EXISTS hse_analysis_snapshot (
    id                  BIGSERIAL    PRIMARY KEY,
    snapshot_date       DATE        NOT NULL,                         -- 快照日期
    snapshot_period     VARCHAR(16) NOT NULL DEFAULT 'monthly',      -- 快照周期: weekly/monthly/quarterly/yearly
    analysis_type       VARCHAR(32) NOT NULL,                         -- 分析类型: risk_trend/accident_trend/rectification/org_portrait
    -- 风险维度
    employee_risk_score    NUMERIC(10,2),                             -- 员工风险平均分
    employee_risk_high     INTEGER,                                   -- 高风险员工数
    employee_risk_medium   INTEGER,                                   -- 中风险员工数
    employee_risk_low      INTEGER,                                   -- 低风险员工数
    driver_risk_score      NUMERIC(10,2),                             -- 驾驶风险平均分
    driver_risk_high       INTEGER,                                   -- 高风险驾驶员数
    -- 事故维度
    accident_total         INTEGER,                                   -- 事故总数
    accident_major         INTEGER,                                   -- 重大事故数
    accident_minor         INTEGER,                                   -- 一般/轻微事故数
    accident_injuries      INTEGER,                                   -- 受伤人数
    accident_casualties    INTEGER,                                   -- 死亡人数
    -- 整改维度
    rectification_total    INTEGER,                                   -- 整改任务总数
    rectification_closed   INTEGER,                                   -- 已关闭数
    rectification_overdue  INTEGER,                                   -- 逾期数
    rectification_effective_rate NUMERIC(5,2),                         -- 整改有效率(%)
    rectification_repeat_rate   NUMERIC(5,2),                         -- 重复发生率(%)
    rectification_avg_cycle     NUMERIC(6,2),                         -- 平均整改周期(天)
    -- 组织维度
    org_id                 BIGINT,                                    -- 组织ID（部门/中心/片区/网格）
    org_type               VARCHAR(16),                               -- 组织类型: department/township/area/grid
    org_name               VARCHAR(128),                              -- 组织名称
    org_risk_score         NUMERIC(10,2),                             -- 组织风险评分
    org_risk_level         VARCHAR(16),                               -- 组织风险等级
    -- 扩展数据
    metrics_json           JSONB,                                     -- 扩展指标数据(JSON)
    created_at             TIMESTAMP   NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMP   NOT NULL DEFAULT NOW(),
    is_deleted             BOOLEAN    NOT NULL DEFAULT FALSE
);

COMMENT ON TABLE hse_analysis_snapshot IS 'Sprint8-A 分析快照表 - 存储周期性风险分析聚合数据';
COMMENT ON COLUMN hse_analysis_snapshot.analysis_type IS '分析类型: risk_trend-风险趋势/accident_trend-事故趋势/rectification-整改分析/org_portrait-组织画像';
COMMENT ON COLUMN hse_analysis_snapshot.snapshot_period IS '快照周期: weekly-周/monthly-月/quarterly-季/yearly-年';
COMMENT ON COLUMN hse_analysis_snapshot.metrics_json IS '扩展指标JSON，支持灵活的指标扩展';

CREATE INDEX IF NOT EXISTS idx_analysis_snapshot_date ON hse_analysis_snapshot(snapshot_date) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_analysis_snapshot_type ON hse_analysis_snapshot(analysis_type) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_analysis_snapshot_org ON hse_analysis_snapshot(org_id) WHERE is_deleted = false AND org_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_analysis_snapshot_period ON hse_analysis_snapshot(snapshot_period) WHERE is_deleted = false;

-- ============================================================
-- 2. 风险预测表（hse_risk_prediction）
-- 存储风险预测结果，支持趋势预测和异常识别
-- ============================================================
CREATE TABLE IF NOT EXISTS hse_risk_prediction (
    id                  BIGSERIAL    PRIMARY KEY,
    prediction_date     DATE        NOT NULL,                         -- 预测日期（基期）
    prediction_target   DATE        NOT NULL,                         -- 预测目标日期
    prediction_type     VARCHAR(32) NOT NULL,                         -- 预测类型: risk_trend/accident/risk_level/abnormal
    prediction_model    VARCHAR(32) NOT NULL DEFAULT 'trend',        -- 预测模型: trend(趋势外推)/regression(回归)/ml(机器学习)
    -- 预测对象
    target_type         VARCHAR(32) NOT NULL,                         -- 对象类型: employee/department/township/area/grid/all
    target_id           BIGINT,                                     -- 对象ID
    target_name         VARCHAR(128),                               -- 对象名称
    -- 预测结果
    predicted_risk_score  NUMERIC(10,2),                             -- 预测风险评分
    predicted_risk_level  VARCHAR(16),                               -- 预测风险等级
    predicted_accidents   INTEGER,                                   -- 预测事故数
    predicted_trend       VARCHAR(16),                               -- 趋势: up/down/stable
    predicted_confidence  NUMERIC(5,2),                               -- 预测置信度(%)
    -- 预测指标
    trend_slope           NUMERIC(10,4),                             -- 趋势斜率
    trend_change_rate     NUMERIC(8,4),                             -- 趋势变化率
    warning_threshold     NUMERIC(10,2),                             -- 预警阈值
    is_abnormal           BOOLEAN     NOT NULL DEFAULT FALSE,        -- 是否异常
    abnormal_degree       NUMERIC(5,2),                              -- 异常程度(0-100)
    -- 贡献因子
    contributing_factors  JSONB,                                     -- 贡献因子列表: [{factor, weight, direction}]
    -- 历史基线
    baseline_avg          NUMERIC(10,2),                             -- 历史基线均值
    baseline_stddev       NUMERIC(10,2),                             -- 历史基线标准差
    -- 预测说明
    prediction_note       TEXT,                                     -- 预测说明
    model_version         VARCHAR(32),                               -- 模型版本
    created_by            BIGINT,
    created_at            TIMESTAMP   NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMP   NOT NULL DEFAULT NOW(),
    is_deleted            BOOLEAN    NOT NULL DEFAULT FALSE
);

COMMENT ON TABLE hse_risk_prediction IS 'Sprint8-A 风险预测表 - 存储风险预测结果和异常识别信息';
COMMENT ON COLUMN hse_risk_prediction.prediction_type IS '预测类型: risk_trend-风险趋势/accident-事故预测/risk_level-风险等级预测/abnormal-异常识别';
COMMENT ON COLUMN hse_risk_prediction.prediction_model IS '预测模型: trend-趋势外推/regression-线性回归/ml-机器学习';
COMMENT ON COLUMN hse_risk_prediction.predicted_trend IS '预测趋势: up-上升/down-下降/stable-稳定';
COMMENT ON COLUMN hse_risk_prediction.is_abnormal IS '是否异常: true-存在异常，异常程度由 abnormal_degree 衡量';
COMMENT ON COLUMN hse_risk_prediction.contributing_factors IS '贡献因子JSON，数组格式，每个元素含factor(因子名)/weight(权重)/direction(方向)';

CREATE INDEX IF NOT EXISTS idx_risk_prediction_date ON hse_risk_prediction(prediction_date) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_risk_prediction_type ON hse_risk_prediction(prediction_type) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_risk_prediction_target ON hse_risk_prediction(target_type, target_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_risk_prediction_abnormal ON hse_risk_prediction(is_abnormal) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_risk_prediction_confidence ON hse_risk_prediction(predicted_confidence DESC) WHERE is_deleted = false;

-- ============================================================
-- 3. 创建视图：组织风险画像聚合视图
-- ============================================================
CREATE OR REPLACE VIEW v_org_risk_portrait AS
SELECT
    o.id AS org_id,
    o.name AS org_name,
    o.parent_id AS parent_org_id,
    CASE
        WHEN o.type IN ('集团', 'group') THEN 'group'
        WHEN o.type IN ('部门', 'department') THEN 'department'
        WHEN o.type IN ('乡镇作业中心', 'township') THEN 'township'
        WHEN o.type IN ('片区', 'area') THEN 'area'
        WHEN o.type IN ('网格', 'grid') THEN 'grid'
        ELSE 'unknown'
    END AS org_type,
    COUNT(DISTINCT s.employee_id) AS employee_count,
    AVG(s.total_score) AS avg_risk_score,
    SUM(CASE WHEN s.risk_level_code IN ('critical', '重大') THEN 1 ELSE 0 END) AS high_risk_count,
    SUM(CASE WHEN s.risk_level_code IN ('major', '较大') THEN 1 ELSE 0 END) AS medium_risk_count,
    SUM(CASE WHEN s.risk_level_code IN ('minor', '一般', 'low', '轻微') THEN 1 ELSE 0 END) AS low_risk_count,
    MAX(s.snapshot_date) AS last_snapshot_date
FROM hse_org o
LEFT JOIN hse_employee_risk_snapshot s ON s.org_id = o.id
    AND s.is_deleted = false
    AND s.snapshot_date = (
        SELECT MAX(s2.snapshot_date)
        FROM hse_employee_risk_snapshot s2
        WHERE s2.org_id = o.id AND s2.is_deleted = false
    )
WHERE o.is_deleted = false
GROUP BY o.id, o.name, o.parent_id, o.type;

COMMENT ON VIEW v_org_risk_portrait IS 'Sprint8-A 组织风险画像聚合视图';

-- ============================================================
-- 4. 创建视图：事故趋势聚合视图
-- ============================================================
CREATE OR REPLACE VIEW v_accident_trend AS
SELECT
    DATE_TRUNC('month', a.accident_date) AS month,
    COUNT(*) AS accident_count,
    COUNT(CASE WHEN a.level IN ('重大', '特别重大') THEN 1 END) AS major_count,
    COUNT(CASE WHEN a.level IN ('较大') THEN 1 END) AS serious_count,
    COUNT(CASE WHEN a.level IN ('一般', '轻微') THEN 1 END) AS minor_count,
    COALESCE(SUM(a.casualties), 0) AS total_casualties,
    COALESCE(SUM(a.injuries), 0) AS total_injuries,
    COALESCE(SUM(a.loss_amount), 0) AS total_loss,
    COALESCE(AVG(CASE a.level
        WHEN '轻微' THEN 1 WHEN '一般' THEN 3 WHEN '较大' THEN 6
        WHEN '重大' THEN 10 WHEN '特别重大' THEN 15 ELSE 1
    END), 0) AS avg_severity_index,
    COUNT(DISTINCT a.category) AS category_count
FROM accidents a
WHERE a.is_deleted = false
GROUP BY DATE_TRUNC('month', a.accident_date)
ORDER BY month DESC;

COMMENT ON VIEW v_accident_trend IS 'Sprint8-A 事故趋势聚合视图';