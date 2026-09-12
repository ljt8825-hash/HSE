-- ============================================================
-- Sprint7-C: HSE整改闭环运营优化 - 数据库迁移
-- 创建日期: 2025
-- 说明: 新建预警调度管理表和整改效果评价表
-- 约束: 不修改现有表结构，不修改冻结模型v1.1
-- ============================================================

-- ============================================================
-- 1. 预警调度管理表（hse_warning_scheduler）
-- 支持动态配置自动扫描任务的cron表达式和扫描类型
-- ============================================================
CREATE TABLE IF NOT EXISTS hse_warning_scheduler (
    id                  BIGSERIAL    PRIMARY KEY,
    task_name           VARCHAR(128) NOT NULL,                   -- 任务名称
    scan_type           VARCHAR(32)  NOT NULL,                   -- 扫描类型: employee_risk/driver_risk/accident/assessment/management/all
    cron_expression     VARCHAR(64)  NOT NULL,                   -- cron表达式，如 '0 2 * * *'
    description         TEXT,                                   -- 任务描述
    status              VARCHAR(20)  NOT NULL DEFAULT 'active',  -- active/inactive
    last_execute_time   TIMESTAMP,                              -- 上次执行时间
    next_execute_time   TIMESTAMP,                              -- 下次执行时间
    last_result         JSONB,                                  -- 上次执行结果（生成数量等）
    created_by          BIGINT,
    created_at          TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMP    NOT NULL DEFAULT NOW(),
    is_deleted          BOOLEAN      NOT NULL DEFAULT FALSE
);

COMMENT ON TABLE hse_warning_scheduler IS 'Sprint7-C 预警调度管理表 - 动态配置自动扫描任务';
COMMENT ON COLUMN hse_warning_scheduler.scan_type IS '扫描类型: employee_risk-员工风险/driver_risk-驾驶风险/accident-事故/assessment-考核/management-管理/all-全部';
COMMENT ON COLUMN hse_warning_scheduler.cron_expression IS 'cron表达式，5字段格式，如 0 2 * * * 表示每日凌晨2点';
COMMENT ON COLUMN hse_warning_scheduler.last_result IS '上次执行结果JSON，如 {"totalGenerated": 15, "scannedRules": 10}';

CREATE INDEX IF NOT EXISTS idx_warning_scheduler_status ON hse_warning_scheduler(status) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_warning_scheduler_scan_type ON hse_warning_scheduler(scan_type) WHERE is_deleted = false;

-- ============================================================
-- 2. 整改效果评价表（hse_rectification_evaluation）
-- 记录整改前后的风险等级对比和效果评分
-- ============================================================
CREATE TABLE IF NOT EXISTS hse_rectification_evaluation (
    id                  BIGSERIAL    PRIMARY KEY,
    task_id             BIGINT      NOT NULL,                    -- 关联整改任务ID（hse_warning_task.id）
    warning_id          BIGINT,                                 -- 关联预警ID
    before_risk_level   VARCHAR(20),                            -- 整改前风险等级
    before_risk_score   NUMERIC(10,2),                          -- 整改前风险评分
    after_risk_level    VARCHAR(20),                            -- 整改后风险等级
    after_risk_score    NUMERIC(10,2),                          -- 整改后风险评分
    risk_delta          NUMERIC(10,2),                          -- 风险变化值（after - before，负数表示降低）
    level_improved      BOOLEAN     NOT NULL DEFAULT FALSE,     -- 风险等级是否改善
    -- 整改质量评分（各项0-100分）
    timeliness_score    INTEGER,                                -- 及时性评分（0-100）
    effectiveness_score INTEGER,                                -- 有效性评分（0-100）
    repeat_rate         NUMERIC(5,2),                           -- 重复发生率（百分比，0-100）
    effect_score        NUMERIC(5,2),                           -- 综合效果评分（0-100）
    evaluation_note     TEXT,                                   -- 评价说明
    evaluator           BIGINT,                                 -- 评价人ID
    evaluator_name      VARCHAR(64),                            -- 评价人姓名
    evaluation_time     TIMESTAMP,                              -- 评价时间
    created_at          TIMESTAMP   NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMP   NOT NULL DEFAULT NOW(),
    is_deleted          BOOLEAN     NOT NULL DEFAULT FALSE
);

COMMENT ON TABLE hse_rectification_evaluation IS 'Sprint7-C 整改效果评价表 - 记录整改前后风险对比和效果评分';
COMMENT ON COLUMN hse_rectification_evaluation.before_risk_level IS '整改前风险等级: critical/major/minor/info';
COMMENT ON COLUMN hse_rectification_evaluation.after_risk_level IS '整改后风险等级: critical/major/minor/info';
COMMENT ON COLUMN hse_rectification_evaluation.timeliness_score IS '及时性评分(0-100): 按时完成100分，逾期按天数递减';
COMMENT ON COLUMN hse_rectification_evaluation.effectiveness_score IS '有效性评分(0-100): 风险等级改善100分，分数下降按比例';
COMMENT ON COLUMN hse_rectification_evaluation.repeat_rate IS '重复发生率(%): 同一对象30天内再次产生预警的比例';
COMMENT ON COLUMN hse_rectification_evaluation.effect_score IS '综合效果评分(0-100): 及时性40%+有效性40%+重复发生率20%';

CREATE INDEX IF NOT EXISTS idx_rect_eval_task ON hse_rectification_evaluation(task_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_rect_eval_warning ON hse_rectification_evaluation(warning_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_rect_eval_score ON hse_rectification_evaluation(effect_score DESC) WHERE is_deleted = false;

-- ============================================================
-- 3. 初始化默认调度任务
-- ============================================================
INSERT INTO hse_warning_scheduler (task_name, scan_type, cron_expression, description, status)
SELECT * FROM (VALUES
  ('每日全量预警扫描', 'all', '0 2 * * *', '每日凌晨2点扫描所有预警规则，生成新预警', 'active'),
  ('每小时升级检查', 'all', '0 * * * *', '每小时检查预警升级条件，执行升级和通知', 'active'),
  ('员工风险扫描', 'employee_risk', '0 3 * * *', '每日凌晨3点专项扫描员工风险预警', 'active'),
  ('驾驶风险扫描', 'driver_risk', '0 4 * * *', '每日凌晨4点专项扫描驾驶风险预警', 'active'),
  ('事故风险扫描', 'accident', '0 5 * * *', '每日凌晨5点专项扫描事故相关预警', 'active'),
  ('考核风险扫描', 'assessment', '0 6 * * 1', '每周一凌晨6点扫描考核相关预警', 'active'),
  ('整改逾期扫描', 'management', '0 7 * * *', '每日凌晨7点扫描整改逾期情况', 'active')
) AS t(task_name, scan_type, cron_expression, description, status)
WHERE NOT EXISTS (SELECT 1 FROM hse_warning_scheduler WHERE task_name = t.task_name);
