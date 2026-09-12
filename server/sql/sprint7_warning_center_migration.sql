-- ============================================================
-- Sprint7: HSE智能预警与整改闭环中心 - 数据库迁移
-- 创建日期: 2025
-- 说明: 新建预警规则、预警记录、预警整改任务三张表
-- 约束: 不修改现有表结构，所有规则版本化管理
-- ============================================================

-- ============================================================
-- 1. 预警规则表（版本化管理）
-- ============================================================
CREATE TABLE IF NOT EXISTS hse_warning_rule (
    id                  BIGSERIAL    PRIMARY KEY,
    rule_code           VARCHAR(64)  NOT NULL UNIQUE,           -- 规则编号，如 WR-EMP-001
    rule_name           VARCHAR(128) NOT NULL,                  -- 规则名称
    source_type         VARCHAR(32)  NOT NULL,                  -- 预警来源: employee_risk/driver_risk/accident/assessment/management
    warning_level       VARCHAR(20)  NOT NULL,                  -- 预警等级: critical/major/minor/info
    target_type         VARCHAR(20)  NOT NULL DEFAULT 'employee', -- 预警对象类型: employee/organization
    condition_config    JSONB        NOT NULL DEFAULT '{}',     -- 触发条件配置（JSON）
    action_config       JSONB        NOT NULL DEFAULT '{}',     -- 处置动作配置（是否自动派发任务等）
    description         TEXT,
    status              VARCHAR(20)  NOT NULL DEFAULT 'active', -- active/inactive
    version             VARCHAR(20)  NOT NULL DEFAULT 'v1.0',   -- 规则版本号
    parent_version_id   BIGINT,                                 -- 上一版本ID（版本链）
    created_by          BIGINT,
    created_at          TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMP    NOT NULL DEFAULT NOW(),
    is_deleted          BOOLEAN      NOT NULL DEFAULT FALSE
);

COMMENT ON TABLE hse_warning_rule IS 'Sprint7 预警规则表 - 版本化管理';
COMMENT ON COLUMN hse_warning_rule.rule_code IS '规则编号，唯一标识';
COMMENT ON COLUMN hse_warning_rule.source_type IS '预警来源: employee_risk-员工风险/driver_risk-驾驶风险/accident-事故/assessment-考核/management-管理履职';
COMMENT ON COLUMN hse_warning_rule.warning_level IS '预警等级: critical-重大/major-较大/minor-一般/info-提示';
COMMENT ON COLUMN hse_warning_rule.condition_config IS '触发条件JSON，如 {"threshold": 80, "operator": ">=", "field": "total_score"}';
COMMENT ON COLUMN hse_warning_rule.action_config IS '处置动作JSON，如 {"auto_dispatch": true, "deadline_days": 7}';

-- 索引
CREATE INDEX IF NOT EXISTS idx_warning_rule_source ON hse_warning_rule(source_type) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_warning_rule_status ON hse_warning_rule(status) WHERE is_deleted = false;

-- ============================================================
-- 2. 预警记录表
-- ============================================================
CREATE TABLE IF NOT EXISTS hse_warning_record (
    id                  BIGSERIAL    PRIMARY KEY,
    warning_code        VARCHAR(64)  NOT NULL UNIQUE,           -- 预警编号，如 WN-20250115-0001
    rule_id             BIGINT,                                 -- 关联规则ID
    rule_name           VARCHAR(128),                           -- 规则名称（冗余，便于展示）
    rule_version        VARCHAR(20),                            -- 规则版本（冗余）
    source_type         VARCHAR(32)  NOT NULL,                  -- 预警来源
    warning_level       VARCHAR(20)  NOT NULL,                  -- 预警等级
    target_type         VARCHAR(20)  NOT NULL DEFAULT 'employee', -- 对象类型
    target_id           BIGINT,                                 -- 对象ID（员工ID或组织ID）
    target_name         VARCHAR(128),                           -- 对象名称
    org_id              BIGINT,                                 -- 责任单位ID
    org_name            VARCHAR(128),                           -- 责任单位名称
    risk_reason         TEXT,                                   -- 风险原因描述
    risk_data           JSONB,                                  -- 风险原始数据（JSON快照）
    status              VARCHAR(20)  NOT NULL DEFAULT 'pending', -- pending/processing/resolved/closed/ignored
    rectification_task_id BIGINT,                               -- 关联整改任务ID
    handled_by          BIGINT,                                 -- 处理人ID
    handled_at          TIMESTAMP,                              -- 处理时间
    closed_by           BIGINT,                                 -- 关闭人ID
    closed_at           TIMESTAMP,                              -- 关闭时间
    close_remark        TEXT,                                   -- 关闭备注
    -- v1.1新增：预警升级机制字段
    is_escalated        BOOLEAN      NOT NULL DEFAULT FALSE,    -- 是否已升级
    escalated_at        TIMESTAMP,                              -- 升级时间
    original_level      VARCHAR(20),                            -- 原始预警等级（升级前）
    escalation_notified BOOLEAN      NOT NULL DEFAULT FALSE,    -- 是否已发送升级通知
    created_at          TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMP    NOT NULL DEFAULT NOW(),
    is_deleted          BOOLEAN      NOT NULL DEFAULT FALSE
);

COMMENT ON TABLE hse_warning_record IS 'Sprint7 预警记录表';
COMMENT ON COLUMN hse_warning_record.source_type IS '预警来源: employee_risk/driver_risk/accident/assessment/management';
COMMENT ON COLUMN hse_warning_record.warning_level IS '预警等级: critical/major/minor/info';
COMMENT ON COLUMN hse_warning_record.status IS '状态: pending-待处理/processing-处理中/resolved-已解决/closed-已关闭/ignored-已忽略';

-- 索引
CREATE INDEX IF NOT EXISTS idx_warning_record_source ON hse_warning_record(source_type) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_warning_record_level ON hse_warning_record(warning_level) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_warning_record_status ON hse_warning_record(status) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_warning_record_org ON hse_warning_record(org_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_warning_record_target ON hse_warning_record(target_id, target_type) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_warning_record_created ON hse_warning_record(created_at DESC);

-- ============================================================
-- 3. 预警整改任务表
-- ============================================================
CREATE TABLE IF NOT EXISTS hse_warning_task (
    id                      BIGSERIAL    PRIMARY KEY,
    task_code               VARCHAR(64)  NOT NULL UNIQUE,       -- 任务编号，如 WT-20250115-0001
    warning_id              BIGINT,                             -- 关联预警ID
    warning_code            VARCHAR(64),                        -- 关联预警编号（冗余）
    task_title              VARCHAR(200) NOT NULL,              -- 任务标题
    description             TEXT,                               -- 任务描述
    responsible_id          BIGINT      NOT NULL,               -- 责任人ID（employee.id）
    responsible_name        VARCHAR(64),                        -- 责任人姓名（冗余）
    org_id                  BIGINT,                             -- 责任单位ID
    org_name                VARCHAR(128),                       -- 责任单位名称
    deadline_date           DATE        NOT NULL,               -- 整改期限
    actual_completion_date  DATE,                               -- 实际完成日期
    status                  VARCHAR(20)  NOT NULL DEFAULT 'pending', -- pending/dispatched/processing/pending_review/closed/rejected
    progress                INTEGER     DEFAULT 0,              -- 进度(0-100)
    priority                VARCHAR(20)  DEFAULT 'normal',      -- low/normal/high/urgent
    -- 处理阶段
    process_note            TEXT,                               -- 处理说明
    process_attachment      JSONB,                              -- 处理附件（证明材料路径列表）
    processed_at            TIMESTAMP,                          -- 处理提交时间
    -- 复核阶段
    review_by               BIGINT,                             -- 复核人ID
    review_name             VARCHAR(64),                        -- 复核人姓名
    review_note             TEXT,                               -- 复核意见
    review_attachment       JSONB,                              -- 复核附件
    reviewed_at             TIMESTAMP,                          -- 复核时间
    review_result           VARCHAR(20),                        -- approved/rejected
    -- 闭环阶段
    closed_at               TIMESTAMP,                          -- 关闭时间
    closed_by               BIGINT,                             -- 关闭人ID
    close_note              TEXT,                               -- 关闭备注
    -- 审计
    created_by              BIGINT,
    created_at              TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMP    NOT NULL DEFAULT NOW(),
    is_deleted              BOOLEAN      NOT NULL DEFAULT FALSE
);

COMMENT ON TABLE hse_warning_task IS 'Sprint7 预警整改任务表 - 闭环工作流';
COMMENT ON COLUMN hse_warning_task.status IS '状态: pending-待下发/dispatched-已下发/processing-处理中/pending_review-待复核/closed-已关闭/rejected-已驳回';
COMMENT ON COLUMN hse_warning_task.priority IS '优先级: low-低/normal-正常/high-高/urgent-紧急';
COMMENT ON COLUMN hse_warning_task.review_result IS '复核结果: approved-通过/rejected-驳回';

-- 索引
CREATE INDEX IF NOT EXISTS idx_warning_task_status ON hse_warning_task(status) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_warning_task_responsible ON hse_warning_task(responsible_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_warning_task_org ON hse_warning_task(org_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_warning_task_warning ON hse_warning_task(warning_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_warning_task_deadline ON hse_warning_task(deadline_date) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_warning_task_priority ON hse_warning_task(priority) WHERE is_deleted = false;

-- ============================================================
-- 4. 预警规则版本管理表
-- ============================================================
CREATE TABLE IF NOT EXISTS hse_warning_rule_version (
    id                  BIGSERIAL    PRIMARY KEY,
    rule_id             BIGINT      NOT NULL,                   -- 规则ID
    version             VARCHAR(20) NOT NULL,                   -- 版本号
    snapshot            JSONB       NOT NULL,                   -- 规则快照（完整配置）
    change_log          TEXT,                                   -- 变更说明
    status              VARCHAR(20) NOT NULL DEFAULT 'active',  -- active/expired
    created_by          BIGINT,
    created_at          TIMESTAMP   NOT NULL DEFAULT NOW(),
    is_deleted          BOOLEAN     NOT NULL DEFAULT FALSE
);

COMMENT ON TABLE hse_warning_rule_version IS 'Sprint7 预警规则版本管理表';

CREATE INDEX IF NOT EXISTS idx_warning_rule_version_rule ON hse_warning_rule_version(rule_id) WHERE is_deleted = false;

-- ============================================================
-- 5. 初始化默认预警规则
-- ============================================================
INSERT INTO hse_warning_rule (rule_code, rule_name, source_type, warning_level, target_type, condition_config, action_config, description, status, version)
SELECT * FROM (VALUES
  -- 员工风险来源
  ('WR-EMP-001', '高风险员工预警', 'employee_risk', 'critical', 'employee',
   '{"field": "risk_level", "operator": "in", "value": ["重大", "critical"]}'::jsonb,
   '{"auto_dispatch": true, "deadline_days": 3}'::jsonb,
   '员工风险等级为重大时触发预警', 'active', 'v1.0'),
  ('WR-EMP-002', '风险持续升高员工预警', 'employee_risk', 'major', 'employee',
   '{"field": "score_trend", "operator": "rising", "consecutive_months": 2, "threshold": 10}'::jsonb,
   '{"auto_dispatch": false, "deadline_days": 7}'::jsonb,
   '员工风险分连续2个月上升超过10分时触发', 'active', 'v1.0'),
  -- 驾驶风险来源（v1.1修订：12个月→5年滚动周期）
  ('WR-DRV-001', '驾驶证扣分异常预警', 'driver_risk', 'major', 'employee',
   '{"field": "demerit_points", "operator": ">=", "value": 6, "period_months": 60}'::jsonb,
   '{"auto_dispatch": true, "deadline_days": 5}'::jsonb,
   '驾驶员近5年滚动周期累计扣分≥6分时触发（v1.1修订）', 'active', 'v1.1'),
  ('WR-DRV-002', '交通事故责任人员预警', 'driver_risk', 'major', 'employee',
   '{"field": "accident_responsibility", "operator": "==", "value": true}'::jsonb,
   '{"auto_dispatch": true, "deadline_days": 7}'::jsonb,
   '发生交通事故且负有责任的驾驶员触发预警', 'active', 'v1.0'),
  -- 事故来源
  ('WR-ACC-001', '重大事故预警', 'accident', 'critical', 'organization',
   '{"field": "accident_level", "operator": "in", "value": ["重大", "特别重大"]}'::jsonb,
   '{"auto_dispatch": true, "deadline_days": 3}'::jsonb,
   '发生重大及以上事故时触发组织预警', 'active', 'v1.0'),
  ('WR-ACC-002', '重复事故预警', 'accident', 'major', 'organization',
   '{"field": "repeat_accident", "operator": ">=", "value": 2, "period_months": 6}'::jsonb,
   '{"auto_dispatch": true, "deadline_days": 5}'::jsonb,
   '同一组织6个月内发生2次及以上同类事故时触发', 'active', 'v1.0'),
  -- 考核来源
  ('WR-ASM-001', '组织评分下降预警', 'assessment', 'minor', 'organization',
   '{"field": "score_drop", "operator": ">=", "value": 10}'::jsonb,
   '{"auto_dispatch": false, "deadline_days": 10}'::jsonb,
   '组织考核得分环比下降≥10分时触发', 'active', 'v1.0'),
  ('WR-ASM-002', '红黄牌组织预警', 'assessment', 'major', 'organization',
   '{"field": "status", "operator": "in", "value": ["red", "yellow"]}'::jsonb,
   '{"auto_dispatch": true, "deadline_days": 7}'::jsonb,
   '组织安全排名为红区或黄区时触发', 'active', 'v1.0'),
  -- 管理履职来源
  ('WR-MGT-001', '网格长巡查不足预警', 'management', 'minor', 'organization',
   '{"field": "inspection_completion", "operator": "<", "value": 70}'::jsonb,
   '{"auto_dispatch": false, "deadline_days": 7}'::jsonb,
   '网格长巡查完成率低于70%时触发', 'active', 'v1.0'),
  ('WR-MGT-002', '整改逾期预警', 'management', 'major', 'organization',
   '{"field": "overdue_count", "operator": ">=", "value": 1}'::jsonb,
   '{"auto_dispatch": true, "deadline_days": 3}'::jsonb,
   '存在逾期整改任务时触发', 'active', 'v1.0')
) AS t(rule_code, rule_name, source_type, warning_level, target_type, condition_config, action_config, description, status, version)
WHERE NOT EXISTS (SELECT 1 FROM hse_warning_rule WHERE rule_code = t.rule_code);
