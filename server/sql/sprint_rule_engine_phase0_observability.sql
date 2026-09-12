-- ============================================================
-- HSE 扣分规则引擎 · 阶段0：数据治理 + 可观测性
-- 版本：v1.0
-- 日期：2026-08-30
-- 数据库：PostgreSQL（safety_dashboard）
-- 依据：docs/rule-engine-design/提示词-01-规则引擎阶段0数据治理与阶段1骨架网格迁移.md 第 4.1 节
-- 目标：
--   1) 给 hse_assessment_rule 增加「接入状态」与「最近执行结果」两组可观测列；
--   2) 按 2026-08-30 实测盘点结果回填 13 条规则的接入状态、适配器标识与说明；
--   3) 修正 R000001 / TRAIN002 两条规则的 source_table；
--   4) 只回填确定项 R000001 的 metric_code（HSE-KPI-SAF-004），其余不猜写。
--
-- 设计约束：
--   * 可重复执行（ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS / 幂等 UPDATE）
--   * 全程事务包裹，失败自动回滚
--   * 零评分行为变化：本脚本不触碰 hse_assessment_deduction 任何数据
--
-- 执行前务必备份：
--   pg_dump -h 127.0.0.1 -p 5432 -U hse_app -d safety_dashboard -Fc -f <时间戳>.dump
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
-- 1. 新增可观测列
-- ============================================================

-- 适配器标识：本轮仅 grid_unchecked 有值；为空表示尚未建设自动适配器
ALTER TABLE hse_assessment_rule ADD COLUMN IF NOT EXISTS adapter_key VARCHAR(50);

-- 接入状态：active=已接入 / pending_data=待数据 / no_table=未接表 / manual=人工
ALTER TABLE hse_assessment_rule ADD COLUMN IF NOT EXISTS integration_status VARCHAR(20) NOT NULL DEFAULT 'manual';

-- 接入说明：向业务解释为何该规则暂未自动生效
ALTER TABLE hse_assessment_rule ADD COLUMN IF NOT EXISTS integration_note TEXT;

-- 最近执行结果（供规则库列表展示）
ALTER TABLE hse_assessment_rule ADD COLUMN IF NOT EXISTS last_run_at TIMESTAMPTZ;
ALTER TABLE hse_assessment_rule ADD COLUMN IF NOT EXISTS last_run_cycle_id BIGINT;
ALTER TABLE hse_assessment_rule ADD COLUMN IF NOT EXISTS last_scanned_count INT;
ALTER TABLE hse_assessment_rule ADD COLUMN IF NOT EXISTS last_deducted_count INT;
ALTER TABLE hse_assessment_rule ADD COLUMN IF NOT EXISTS last_run_summary TEXT;

COMMENT ON COLUMN hse_assessment_rule.adapter_key          IS '规则引擎适配器标识（如 grid_unchecked）；为空=尚未建设自动适配器';
COMMENT ON COLUMN hse_assessment_rule.integration_status   IS '接入状态：active=已接入 / pending_data=待数据 / no_table=未接表 / manual=人工录入';
COMMENT ON COLUMN hse_assessment_rule.integration_note     IS '接入说明：记录待建设内容或接入口径，界面用于提示业务';
COMMENT ON COLUMN hse_assessment_rule.last_run_at          IS '最近一次实际扫描时间（dryRun 不记录）';
COMMENT ON COLUMN hse_assessment_rule.last_run_cycle_id    IS '最近一次扫描对应的考核周期 id';
COMMENT ON COLUMN hse_assessment_rule.last_scanned_count   IS '最近一次扫描覆盖的考核对象人数';
COMMENT ON COLUMN hse_assessment_rule.last_deducted_count  IS '最近一次扫描实际产生有效扣分的人数';
COMMENT ON COLUMN hse_assessment_rule.last_run_summary     IS '最近执行结果展示文案，如「扫描24人/扣分24人」';

-- 接入状态筛选索引（列表页按状态过滤）
CREATE INDEX IF NOT EXISTS idx_rule_integration
    ON hse_assessment_rule (integration_status)
    WHERE is_deleted = FALSE;

-- ============================================================
-- 2. 数据回填（按 rule_code 精确匹配，幂等可重复执行）
--    依据 2026-08-30 连库实测：
--      - grid_inspection_records(1655) / violation_records(2676) / training_records(198) 存在
--      - hse_morning_meeting / vehicle_check_record / fire_equipment_check
--        / transfer_station_check / hse_training_record 不存在
-- ============================================================

-- 2.1 R000001 未检查 —— 唯一已接入的自动通路（网格长未巡查月度缺次扣分）
UPDATE hse_assessment_rule SET
    adapter_key        = 'grid_unchecked',
    integration_status = 'active',
    metric_code        = 'HSE-KPI-SAF-004',
    source_table       = 'grid_inspection_records',
    integration_note   = '已接入：网格长未巡查月度缺次扣分，计入三违管理类别'
WHERE rule_code = 'R000001' AND is_deleted = FALSE;

-- 2.2 三违三条 —— 表存在但缺「查处来源/反馈状态」字段，无法细分，阶段2接入
--     口径登记：普通三违 1 分/次；公司查处的三违 5 分/次（本轮不实现）
UPDATE hse_assessment_rule SET
    adapter_key        = NULL,
    integration_status = 'pending_data',
    integration_note   = 'violation_records 缺查处来源/反馈状态字段，阶段2接入；口径：普通1分/次、公司查处5分/次'
WHERE rule_code IN ('VIOLATION001', 'VIOLATION002', 'VIOLATION003') AND is_deleted = FALSE;

-- 2.3 TRAIN001 晨会未召开 —— 来源表不存在
UPDATE hse_assessment_rule SET
    adapter_key        = NULL,
    integration_status = 'no_table',
    integration_note   = '来源表 hse_morning_meeting 待业务建设，暂不自动扣分'
WHERE rule_code = 'TRAIN001' AND is_deleted = FALSE;

-- 2.4 TRAIN002 培训记录缺失 —— 表名配错，实际表为 training_records；有数据但适配器阶段3建设
UPDATE hse_assessment_rule SET
    adapter_key        = NULL,
    integration_status = 'pending_data',
    source_table       = 'training_records',
    integration_note   = '来源表名已校正为 training_records，适配器阶段3建设'
WHERE rule_code = 'TRAIN002' AND is_deleted = FALSE;

-- 2.5 车辆三检三条 —— 来源表不存在
UPDATE hse_assessment_rule SET
    adapter_key        = NULL,
    integration_status = 'no_table',
    integration_note   = '来源表 vehicle_check_record 待业务建设，暂不自动扣分'
WHERE rule_code IN ('CAR001', 'CAR002', 'CAR003') AND is_deleted = FALSE;

-- 2.6 消防器材 —— 来源表不存在
UPDATE hse_assessment_rule SET
    adapter_key        = NULL,
    integration_status = 'no_table',
    integration_note   = '来源表 fire_equipment_check 待业务建设，暂不自动扣分'
WHERE rule_code = 'FIRE001' AND is_deleted = FALSE;

-- 2.7 转运站两条 —— 来源表不存在
UPDATE hse_assessment_rule SET
    adapter_key        = NULL,
    integration_status = 'no_table',
    integration_note   = '来源表 transfer_station_check 待业务建设，暂不自动扣分'
WHERE rule_code IN ('TRANSFER001', 'TRANSFER002') AND is_deleted = FALSE;

-- 2.8 SAFE001 专项活动未开展 —— 人工录入项，不参与自动扫描
UPDATE hse_assessment_rule SET
    adapter_key        = NULL,
    integration_status = 'manual',
    integration_note   = '人工录入项，不参与自动扫描'
WHERE rule_code = 'SAFE001' AND is_deleted = FALSE;

COMMIT;

-- ============================================================
-- 3. 回填自检（人工执行核对用，非事务内）
-- ============================================================
-- SELECT rule_code, adapter_key, integration_status, metric_code, source_table, integration_note
--   FROM hse_assessment_rule WHERE is_deleted = FALSE ORDER BY rule_code;
-- 期望：R000001=active/grid_unchecked/HSE-KPI-SAF-004/grid_inspection_records
--       VIOLATION×3 + TRAIN002 = pending_data（4 条）
--       TRAIN001 + CAR×3 + FIRE001 + TRANSFER×2 = no_table（7 条）
--       SAFE001 = manual（1 条）
