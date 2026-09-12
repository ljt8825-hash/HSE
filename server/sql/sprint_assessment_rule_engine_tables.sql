-- ============================================================
-- HSE 扣分规则引擎 - 一期核心规则库建表 DDL
-- 版本：v1.0
-- 日期：2026-08-27
-- 数据库：PostgreSQL 15
-- 依据：《扣分规则库方案 × 开放式引擎方案 融合报告》第 6/7 章（一期）
-- 任务：把人工考核表 hse_assessment_standard 中的硬编码扣分，迁入可配置规则库
-- ============================================================
-- 设计要点（融合方案一期，遵循"不硬编码、开放式"约束）：
--   * hse_assessment_rule       规则主表：rule_code / category / source_table /
--                                trigger_type / deduct_type(四种) / deduct_score / max_deduct
--   * hse_rule_detail           规则明细表：处理"车辆异常""标识牌问题""消防点检"等多子项，
--                               新增子项加一行即可，零代码（方案A最大亮点，完整保留）
--   * hse_rule_condition        规则条件表：simple 模式（字段+运算符+值，一行一条件；
--                               多行用 logic 连接）；advanced 复杂条件存主表 condition_expr JSON 树
--   * hse_assessment_veto_rule  否决规则表：优先级 100，执行顺序最先（否决→扣分→加分）
--   * hse_bonus_rule            加分规则表：独立建表，受 max_bonus 限制
--   * hse_assessment_score_detail 规则引擎扣分结果表：行内 version + rule_snapshot 快照
--                               审计不依赖历史版本表（行内版本 + 结果快照策略）
--
-- 依赖：set_updated_at() 触发器函数（已在 sprint10d2_assessment_init.sql 定义，若缺失先执行该文件）
-- 执行顺序：
--   1. hse_assessment_rule            （先建主表）
--   2. hse_rule_detail                （依赖 rule_id）
--   3. hse_rule_condition             （依赖 rule_id）
--   4. hse_assessment_veto_rule       （否决独立表）
--   5. hse_bonus_rule                 （加分独立表）
--   6. hse_assessment_score_detail    （结果快照表）
-- ============================================================

BEGIN;

-- 预检：确保 set_updated_at 存在（不存在则创建，保证本脚本可独立执行）
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 1. 考核规则主表 hse_assessment_rule
-- ============================================================
CREATE TABLE IF NOT EXISTS hse_assessment_rule (
    id              BIGSERIAL     PRIMARY KEY,
    rule_code       VARCHAR(50)   NOT NULL,              -- 规则编码：如 TRAIN001 / CAR003
    rule_name       VARCHAR(200)  NOT NULL,              -- 规则名称：如 晨会未召开 / 车辆三检未执行
    category        VARCHAR(100)  NOT NULL,              -- 类别：安全文化建设 / HSE教育培训 / 现场管理 / 消防管理 / 三违管理
    -- 关联层（方案A四层骨架：模板→指标→检查项→规则，现指标层复用 hse_assessment_metric）
    metric_code     VARCHAR(50),                         -- 关联现有考核指标 HSE-KPI-*（可为空，供评分聚合）
    indicator_name  VARCHAR(200),                        -- 指标/分类中文名（冗余便于展示）
    item_name       VARCHAR(300),                        -- 考核检查项描述（对应 standard.item_name，便于追溯）
    -- 来源与触发
    source_table    VARCHAR(50),                         -- 数据来源表：如 hse_morning_meeting / vehicle_check
    trigger_type    VARCHAR(20)  NOT NULL DEFAULT 'auto', -- auto=自动(定时扫描 source_table 批量扣分) / manual=人工(评分页面填写)
    -- 扣分口径
    deduct_type     VARCHAR(20)  NOT NULL DEFAULT 'fixed',-- fixed=固定 / cumulative=累计(次数×单次) / detail=明细查表 / tiered=阶梯
    deduct_score    NUMERIC(6,2)  DEFAULT 0,            -- 单次扣分值（fixed/cumulative/detail 默认行用）
    max_deduct      NUMERIC(6,2),                        -- 该项最大扣分上限（为空则该项扣完为止/不设上限）
    deduct_config   JSONB,                               -- 各扣分方式的附加配置（如 tiered 的阶梯数组）
    transmission_config JSONB,                           -- 传导配置（如管理责任：relation=manager, transmission_ratio）
    -- 条件模式
    condition_mode  VARCHAR(20)  NOT NULL DEFAULT 'simple', -- simple=条件表 hse_rule_condition / advanced=条件 JSON 树
    condition_expr  JSONB,                               -- advanced 模式的条件树（简单模式可为空）；两种模式存储统一为 JSON
    -- 适用范围 / 生效期 / 优先级 / 版本
    scope_config    JSONB,                               -- 适用范围：{object_type:'all|township|department|position', object_value:...}
    cycle_type      VARCHAR(20)  NOT NULL DEFAULT 'monthly', -- 周期：monthly
    priority        INT           NOT NULL DEFAULT 10,   -- 命中优先级（值越大越先；否决另行 100）
    version         INT           NOT NULL DEFAULT 1,    -- 行内版本号，每次更新 +1（结果表存快照）
    valid_from      DATE          NOT NULL DEFAULT CURRENT_DATE,
    valid_to        DATE,                                -- 为空表示长期有效
    -- 状态与审计
    status          VARCHAR(20)  NOT NULL DEFAULT 'enabled', -- enabled / disabled（停用保留记录）
    remark          TEXT,
    created_by      BIGINT,
    created_by_name VARCHAR(50),
    is_deleted      BOOLEAN      DEFAULT FALSE,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- 索引与唯一约束（rule_code 普通唯一约束：支持 ON CONFLICT 幂等 upsert）
CREATE UNIQUE INDEX IF NOT EXISTS uq_rule_code     ON hse_assessment_rule (rule_code);
CREATE INDEX IF NOT EXISTS idx_rule_category   ON hse_assessment_rule (category) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_rule_source     ON hse_assessment_rule (source_table) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_rule_metric     ON hse_assessment_rule (metric_code) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_rule_status     ON hse_assessment_rule (status) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_rule_valid_time ON hse_assessment_rule (valid_from, valid_to) WHERE is_deleted = FALSE;

DROP TRIGGER IF EXISTS trg_rule_updated_at ON hse_assessment_rule;
CREATE TRIGGER trg_rule_updated_at
    BEFORE UPDATE ON hse_assessment_rule
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE  hse_assessment_rule IS '考核扣分规则库主表（一期：固定/累计/明细/阶梯四种扣分方式）';
COMMENT ON COLUMN hse_assessment_rule.deduct_type IS '扣分方式：fixed 固定 / cumulative 累计（次数×单次）/ detail 明细查表（hse_rule_detail）/ tiered 阶梯（deduct_config.tiers）';
COMMENT ON COLUMN hse_assessment_rule.condition_mode IS '条件模式：simple 条件行 hse_rule_condition / advanced 条件 JSON 树 condition_expr';
COMMENT ON COLUMN hse_assessment_rule.priority IS '命中优先级，值大者优先；否决规则优先级另行固定在 100（见 veto 表）';
COMMENT ON COLUMN hse_assessment_rule.version IS '行内版本号，每次配置更新 +1，扣分结果表存规则快照（rule_snapshot）';

-- ============================================================
-- 2. 规则明细表 hse_rule_detail
--   （车辆异常 5 种子类型 / 标识牌问题 / 消防点检 等多子项，新增加一行，零代码）
-- ============================================================
CREATE TABLE IF NOT EXISTS hse_rule_detail (
    id              BIGSERIAL     PRIMARY KEY,
    rule_id         BIGINT        NOT NULL REFERENCES hse_assessment_rule(id),
    detail_code     VARCHAR(50),                         -- 明细编码，如 CAR003-LI01（可空则自动）
    detail_name     VARCHAR(200)  NOT NULL,              -- 子项/异常类型：如 号牌污损 / GPS离线 / 摄像头离线
    deduct_score    NUMERIC(6,2)  NOT NULL,              -- 该子项扣分值：1 / 0.5 / 5
    unit            VARCHAR(20)   DEFAULT '次',          -- 计量单位：次/个/处/人
    max_deduct      NUMERIC(6,2),                        -- 该子项最大扣分（为空则该项扣完为止）
    sort_order      INT           DEFAULT 0,
    is_active       BOOLEAN      DEFAULT TRUE,
    is_deleted      BOOLEAN      DEFAULT FALSE,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_detail_rule ON hse_rule_detail (rule_id) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_detail_active ON hse_rule_detail (rule_id, is_active) WHERE is_deleted = FALSE;
CREATE UNIQUE INDEX IF NOT EXISTS uq_rule_detail ON hse_rule_detail (rule_id, detail_name);

DROP TRIGGER IF EXISTS trg_detail_updated_at ON hse_rule_detail;
CREATE TRIGGER trg_detail_updated_at
    BEFORE UPDATE ON hse_rule_detail
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE hse_rule_detail IS '扣分规则明细表：多子项规则的子项级扣分（新增子项加一行即可，零代码）';
COMMENT ON COLUMN hse_rule_detail.deduct_score IS '子项扣分值（如号牌污损 1 分、消防器材丢失 5 分、标识牌损坏 0.5 分）';

-- ============================================================
-- 3. 规则条件表 hse_rule_condition （simple 模式）
-- ============================================================
CREATE TABLE IF NOT EXISTS hse_rule_condition (
    id              BIGSERIAL     PRIMARY KEY,
    rule_id         BIGINT        NOT NULL REFERENCES hse_assessment_rule(id),
    logic           VARCHAR(5)    NOT NULL DEFAULT 'and', -- and / or（与下一条条件的关系，首条恒为 and）
    field           VARCHAR(100)  NOT NULL,              -- 条件字段：如 status / inspection_type / record_quality
    operator        VARCHAR(20)   NOT NULL DEFAULT 'eq', -- eq/ne/gt/gte/lt/lte/contains/in/is_null
    value           VARCHAR(200),                        -- 条件取值：如 missing / 未完成 / 不合格
    sort_order      INT           DEFAULT 0,
    is_active       BOOLEAN      DEFAULT TRUE,
    is_deleted      BOOLEAN      DEFAULT FALSE,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_condition_rule ON hse_rule_condition (rule_id) WHERE is_deleted = FALSE;

DROP TRIGGER IF EXISTS trg_condition_updated_at ON hse_rule_condition;
CREATE TRIGGER trg_condition_updated_at
    BEFORE UPDATE ON hse_rule_condition
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE hse_rule_condition IS '扣分规则条件表（simple 模式，多行用 logic 连接；advanced 复杂条件存主表 condition_expr）';

-- ============================================================
-- 4. 否决规则表 hse_assessment_veto_rule
--   （否决项不进入普通扣分，独立建表；执行顺序最先，规则命中直接置总分 0）
-- ============================================================
CREATE TABLE IF NOT EXISTS hse_assessment_veto_rule (
    id              BIGSERIAL     PRIMARY KEY,
    rule_code       VARCHAR(50)   NOT NULL,
    rule_name       VARCHAR(200)  NOT NULL,              -- 否决事由：如 生产安全责任事故
    category        VARCHAR(100)  NOT NULL DEFAULT '否决项',
    event_type      VARCHAR(50),                         -- 事故/事件类型：生产安全事故 / 交通事故 / 环境污染事故
    trigger_config  JSONB,                               -- 触发条件：{event:'safety_accident', ...}
    result_expr     VARCHAR(100)  NOT NULL DEFAULT 'score=0', -- 否决结果表达式：score=0
    priority        INT           NOT NULL DEFAULT 100,  -- 否决项优先级固定为 100（最高）
    valid_from      DATE          NOT NULL DEFAULT CURRENT_DATE,
    valid_to        DATE,
    status          VARCHAR(20)   NOT NULL DEFAULT 'enabled',
    remark          TEXT,
    created_by      BIGINT,
    created_by_name VARCHAR(50),
    is_deleted      BOOLEAN      DEFAULT FALSE,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_veto_code ON hse_assessment_veto_rule (rule_code);
CREATE INDEX IF NOT EXISTS idx_veto_event ON hse_assessment_veto_rule (event_type) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_veto_status ON hse_assessment_veto_rule (status) WHERE is_deleted = FALSE;

DROP TRIGGER IF EXISTS trg_veto_updated_at ON hse_assessment_veto_rule;
CREATE TRIGGER trg_veto_updated_at
    BEFORE UPDATE ON hse_assessment_veto_rule
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE hse_assessment_veto_rule IS '考核否决规则表（独立于扣分规则，优先级固定 100，执行顺序最先；命中即总分 0）';
COMMENT ON COLUMN hse_assessment_veto_rule.result_expr IS '否决结果：默认 score=0（本月考核分数为 0）';

-- ============================================================
-- 5. 加分规则表 hse_bonus_rule
--   （独立建表，受 max_bonus 上限约束；执行顺序在否决→扣分之后）
-- ============================================================
CREATE TABLE IF NOT EXISTS hse_bonus_rule (
    id              BIGSERIAL     PRIMARY KEY,
    rule_code       VARCHAR(50)   NOT NULL,
    rule_name       VARCHAR(200)  NOT NULL,              -- 加分项：安全创新 / 隐患治理避免事故 / 政府表彰
    category        VARCHAR(100)  NOT NULL DEFAULT '加分项',
    bonus_type      VARCHAR(20)   NOT NULL DEFAULT 'fixed', -- fixed=固定 / tiered=分级(政府表彰10/20/30) / detail=明细
    bonus_score     NUMERIC(6,2)  NOT NULL,              -- 单次加分值
    tier_config     JSONB,                               -- 分级加分配置，如 [{level:'县级',score:20},{level:'县级以上',score:30}]
    max_bonus       NUMERIC(6,2),                        -- 加分项上限（如最高加 10 分）
    max_count       INT,                                 -- 加分次数上限（如按项数）
    distribution    VARCHAR(50),                         -- 适用对象：manager / township_manager / all
    valid_from      DATE          NOT NULL DEFAULT CURRENT_DATE,
    valid_to        DATE,
    status          VARCHAR(20)   NOT NULL DEFAULT 'enabled',
    remark          TEXT,
    created_by      BIGINT,
    created_by_name VARCHAR(50),
    is_deleted      BOOLEAN      DEFAULT FALSE,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_bonus_code ON hse_bonus_rule (rule_code);
CREATE INDEX IF NOT EXISTS idx_bonus_status ON hse_bonus_rule (status) WHERE is_deleted = FALSE;

DROP TRIGGER IF EXISTS trg_bonus_updated_at ON hse_bonus_rule;
CREATE TRIGGER trg_bonus_updated_at
    BEFORE UPDATE ON hse_bonus_rule
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE hse_bonus_rule IS '考核加分规则表（独立于扣分规则，执行顺序在扣分之后，受 max_bonus/max_count 上限约束）';

-- ============================================================
-- 6. 扣分结果表 hse_assessment_score_detail（规则引擎结果 + 快照）
--   * 每条规则命中落一行，含 rule_version + rule_snapshot 快照
--   * 幂等同一条唯一：(target_id, rule_id, source_table, source_id)
--   * 与现有 hse_assessment_deduction 衔接：此表为规则引擎自动生成口径，
--     审核确认后由引擎同步计分；保留明细供审计追溯
-- ============================================================
CREATE TABLE IF NOT EXISTS hse_assessment_score_detail (
    id              BIGSERIAL     PRIMARY KEY,
    cycle_id        BIGINT        NOT NULL,             -- 考核周期（对应 hse_assessment_cycle）
    target_id       BIGINT        NOT NULL REFERENCES hse_assessment_target(id),  -- 考核对象（乡镇经理/管理员）
    employee_id     BIGINT,                             -- 考核员工 ID（冗余便于统计）
    employee_name   VARCHAR(50),
    rule_id         BIGINT        NOT NULL REFERENCES hse_assessment_rule(id),
    rule_code       VARCHAR(50)   NOT NULL,             -- 规则编码（冗余）
    rule_version    INT           NOT NULL,             -- 命中时的规则版本
    detail_id       BIGINT,                             -- 命中的规则明细（detail 类型）
    rule_snapshot   JSONB,                              -- 规则完整快照（含条件、扣分配置、传导配置）
    source_table    VARCHAR(50),                        -- 业务来源表
    source_id       VARCHAR(50),                        -- 业务来源 ID
    event_payload   JSONB,                              -- 事件载荷快照
    deduct_score    NUMERIC(6,2)  NOT NULL,             -- 实际扣分
    is_transmission BOOLEAN      DEFAULT FALSE,         -- 是否传导扣分
    transmission_from BIGINT,                           -- 传导来源对象 ID
    review_status   VARCHAR(20)   DEFAULT 'pending',    -- pending / approved / rejected
    confirmed_score NUMERIC(6,2),                       -- 确认扣分（人工调整后）
    occur_date      DATE,                               -- 事件发生日期
    is_deleted      BOOLEAN      DEFAULT FALSE,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- 幂等唯一约束（自动规则批量扫描不重复扣分）
CREATE UNIQUE INDEX IF NOT EXISTS idx_score_detail_idem
    ON hse_assessment_score_detail (target_id, rule_id, source_table, source_id)
    WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_score_detail_cycle_target ON hse_assessment_score_detail (cycle_id, target_id) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_score_detail_rule ON hse_assessment_score_detail (rule_id) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_score_detail_status ON hse_assessment_score_detail (review_status) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_score_detail_source ON hse_assessment_score_detail (source_table, source_id) WHERE is_deleted = FALSE;

DROP TRIGGER IF EXISTS trg_score_detail_updated_at ON hse_assessment_score_detail;
CREATE TRIGGER trg_score_detail_updated_at
    BEFORE UPDATE ON hse_assessment_score_detail
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE hse_assessment_score_detail IS '扣分规则引擎结果表（每条规则命中一行，含版本快照 rule_snapshot，审计可查历史口径）';

COMMIT;

-- ============================================================
-- 验证脚本执行结果
-- ============================================================
-- SELECT tablename FROM pg_tables
--   WHERE tablename IN ('hse_assessment_rule','hse_rule_detail','hse_rule_condition',
--                       'hse_assessment_veto_rule','hse_bonus_rule','hse_assessment_score_detail')
--   ORDER BY tablename;
-- ============================================================