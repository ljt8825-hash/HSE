-- ============================================================
-- 考核扣分规则表 hse_assessment_metric_rule 迁移脚本
-- 版本：v1.0
-- 日期：2026-08-27
-- 数据库：PostgreSQL 15
-- 依据：《扣分调整方案设计 — 规则层 × 明细层》第3/4章
-- 任务：扣分调整能力（规则层）
-- ============================================================
-- 说明：
--   * 规则层：处理「某事件 × 某对象 × 某时期」的批量权重调整/豁免
--   * 与明细层（hse_assessment_deduction.confirmed_score）互为补充，
--     结构性问题用 active 开关 + scale_factor=0，个案用 confirmed=0
--   * 命中优先级（只取最高一条生效，不叠加）：
--       1) object_type='employee' 精确绑定
--       2) object_type='grid_level'
--       3) object_type='township' / 'department'
--       4) object_type='all'（同层内按 priority 大者优先）
-- ============================================================

BEGIN;

-- ============================================================
-- 1. 扣分规则表
-- ============================================================
CREATE TABLE IF NOT EXISTS hse_assessment_metric_rule (
    id              BIGSERIAL     PRIMARY KEY,
    rule_name       VARCHAR(100)  NOT NULL,
    metric_code     VARCHAR(50)   NOT NULL,          -- 命中的指标编码（对应 hse_assessment_metric.metric_code）
    object_type     VARCHAR(20)   NOT NULL DEFAULT 'all', -- all/employee/grid_level/township/department
    object_value    VARCHAR(100),                    -- 绑定对象值：员工ID / 网格等级 / 乡镇 / 部门；all 时为空
    valid_from      DATE          NOT NULL DEFAULT CURRENT_DATE,
    valid_to        DATE,                            -- 为空表示长期有效
    scale_factor    NUMERIC(4,2)  NOT NULL DEFAULT 1.00, -- 0=豁免 / <1 减轻 / 1 默认 / >1 加重
    priority        INT           NOT NULL DEFAULT 0,    -- 同 object_type 内，值大者优先
    active          BOOLEAN       NOT NULL DEFAULT TRUE, -- 结构性开关
    remark          TEXT,
    created_by      BIGINT,
    created_by_name VARCHAR(50),
    updated_by      BIGINT,
    updated_by_name VARCHAR(50),
    is_deleted      BOOLEAN      DEFAULT FALSE,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- 索引：按 (metric_code, active) 快速过滤有效规则；按 timespan + 对象维度做范围查询
CREATE INDEX IF NOT EXISTS idx_rule_metric_active   ON hse_assessment_metric_rule (metric_code, active) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_rule_object_type     ON hse_assessment_metric_rule (object_type, object_value) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_rule_valid_time      ON hse_assessment_metric_rule (valid_from, valid_to) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_rule_priority        ON hse_assessment_metric_rule (priority DESC);

-- updated_at 自动更新触发器
DROP TRIGGER IF EXISTS trg_metric_rule_updated_at ON hse_assessment_metric_rule;
CREATE TRIGGER trg_metric_rule_updated_at
    BEFORE UPDATE ON hse_assessment_metric_rule
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE hse_assessment_metric_rule IS '月度考核扣分规则表（规则层：批量权重/豁免）';
COMMENT ON COLUMN hse_assessment_metric_rule.object_type IS '对象维度：all/employee/grid_level/township/department';
COMMENT ON COLUMN hse_assessment_metric_rule.scale_factor IS '扣分力度：0=豁免 / <1 减轻 / 1 默认 / >1 加重';
COMMENT ON COLUMN hse_assessment_metric_rule.priority IS '同对象维度内优先级，值大者优先（只取最高一条生效）';
COMMENT ON COLUMN hse_assessment_metric_rule.active IS '结构性开关：FALSE 即停用保留记录';

COMMIT;

-- ============================================================
-- 验证脚本执行结果
-- ============================================================
-- SELECT tablename FROM pg_tables WHERE tablename LIKE 'hse_assessment_metric%';
-- SELECT count(*) FROM hse_assessment_metric_rule;
-- ============================================================