-- ============================================================
-- 月度安全履职自动考核 数据库初始化脚本
-- 版本：v1.0
-- 日期：2026-08-27
-- 数据库：PostgreSQL 15
-- 依据：《月度安全履职自动考核方案.md》
-- ============================================================
-- 内容：
--   1. 新增 hse_assessment_event_log 事件幂等表
--   2. 补全自动扣分指标（base_score=0, metric_type='auto'，仅被评分引擎/事件服务消费，
--      现有 /scoring/execute 会走 data_source 未命中兜底 rawValue=base_score=0，不影响既有基线）
--   3. 新增必要索引
-- ============================================================

BEGIN;

-- ============================================================
-- 1. 考核事件处理记录表 hse_assessment_event_log（幂等去重）
-- ============================================================
CREATE TABLE IF NOT EXISTS hse_assessment_event_log (
    id            BIGSERIAL     PRIMARY KEY,
    event_type    VARCHAR(50)   NOT NULL,
    event_key     VARCHAR(200)  NOT NULL,           -- 事件唯一键（如 VIOLATION_CREATED:123）
    payload       JSONB,
    status        VARCHAR(20)   DEFAULT 'pending', -- pending/processing/success/failed/skipped
    error_message TEXT,
    related_cycle_id BIGINT,
    processed_at  TIMESTAMPTZ,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_assessment_event UNIQUE (event_type, event_key)
);

CREATE INDEX IF NOT EXISTS idx_assessment_event_status ON hse_assessment_event_log (status);
CREATE INDEX IF NOT EXISTS idx_assessment_event_time ON hse_assessment_event_log (processed_at);
CREATE INDEX IF NOT EXISTS idx_assessment_event_cycle ON hse_assessment_event_log (related_cycle_id);

COMMENT ON TABLE hse_assessment_event_log
  IS '考核联动事件处理记录表（幂等去重，禁止删除），事件成功处理后经 UPDATE 置为 success';
COMMENT ON COLUMN hse_assessment_event_log.event_key
  IS '事件唯一键，如 VIOLATION_CREATED:123，保证同一业务事件只消费一次';

-- 事件日志同样禁止物理删除，防止追责信息丢失
CREATE OR REPLACE FUNCTION prevent_assessment_event_delete()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION '考核事件日志表仅允许INSERT和UPDATE，禁止DELETE';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_event_delete ON hse_assessment_event_log;
CREATE TRIGGER trg_prevent_event_delete
    BEFORE DELETE ON hse_assessment_event_log
    FOR EACH ROW
    EXECUTE FUNCTION prevent_assessment_event_delete();

-- ============================================================
-- 2. 补全自动扣分指标
--    说明：新增指标 base_score=0、metric_type='auto'。
--    现有 /scoring/execute（server/routes/hse-assessment-monthly.js）仅按
--    data_source 命中（violation_records/hazards/training_records/risk_alerts/
--    responsibility_forms/veto）或兜底 base_score 计算，新增 data_source
--    未命中将走兜底 rawValue=base_score=0 → 对现有基线零影响。
--    这些指标专门由 assessmentScoringEngine.js / assessmentEventService.js 消费。
-- ============================================================
INSERT INTO hse_assessment_metric
  (metric_code, metric_name, category, target_post, base_score, metric_type,
   data_source, calc_formula, rule_config, weight_manager, weight_admin, sort_order, status, remark)
VALUES
  -- 三违管理
  ('HSE-KPI-SAF-003', '三违未及时处理', 'SAFETY', 'all', 0, 'auto',
   'violation_records', '超期未关闭条数×2',
   '{"deduction_per_unit":2,"max_deduct":20,"close_deadline_days":7}', 0, 0, 11, 'active', '自动考核：三违记录超【close_deadline_days】天未关闭，每条扣2分'),

  -- 隐患治理
  ('HSE-KPI-HZD-002', '隐患超期未整改', 'HAZARD', 'all', 0, 'auto',
   'hse_rectifications', '超期整改任务条数×3',
   '{"deduction_per_unit":3,"max_deduct":30,"transmit":true}', 0, 0, 12, 'active', '自动考核：负责的整改任务超期未完成，每条扣3分，传导直属上级'),
  ('HSE-KPI-HZD-003', '隐患验收不通过', 'HAZARD', 'all', 0, 'auto',
   'hse_reviews', '复查不通过次数×2',
   '{"deduction_per_unit":2,"max_deduct":20,"transmit":false}', 0, 0, 13, 'active', '自动考核：隐患验收/复查不通过，每次扣2分'),
  ('HSE-KPI-HZD-004', '月度隐患发现量不足', 'HAZARD', 'manager', 0, 'auto',
   'hazards', '月发现量<阈值 扣5分',
   '{"deduction_fixed":5,"min_found":3}', 0, 0, 14, 'active', '自动考核：经理本乡镇月隐患发现量不足【min_found】条，扣5分'),

  -- 事故管理
  ('HSE-KPI-ACC-001', '事故未及时上报', 'ACCIDENT', 'all', 0, 'auto',
   'accidents', '超时上报 每次扣10分',
   '{"deduction_per_unit":10,"report_deadline_hours":24}', 0, 0, 15, 'active', '自动考核：事故发生后【report_deadline_hours】小时内未上报，每次扣10分'),

  -- 培训管理
  ('HSE-KPI-TRN-002', '本人培训不合格', 'TRAINING', 'all', 0, 'auto',
   'training_records', '不合格次数×3',
   '{"deduction_per_unit":3,"max_deduct":21,"result":"不合格"}', 0, 0, 16, 'active', '自动考核：本人培训结果为不合格，每次扣3分'),
  ('HSE-KPI-TRN-003', '培训缺席未签到', 'TRAINING', 'all', 0, 'auto',
   'training_records', '缺席次数×2',
   '{"deduction_per_unit":2,"max_deduct":20,"sign_status_miss":true}', 0, 0, 17, 'active', '自动考核：应训未签到/缺席，每次扣2分'),
  ('HSE-KPI-TRN-004', '下属培训合格率不达标', 'TRAINING', 'manager', 0, 'auto',
   'training_records', '本乡镇下属合格率<90% 扣5分，<80% 扣10分',
   '{"rate_not_90":5,"rate_not_80":10,"rate_90_threshold":0.9,"rate_80_threshold":0.8}', 0, 0, 18, 'active', '自动考核：经理下属（本乡镇）培训合格率阈值考核'),

  -- 网格管理
  ('HSE-KPI-GRD-001', '网格巡查频次不达标', 'GRID', 'all', 0, 'auto',
   'grid_inspection_records', '按网格等级缺次扣分',
   '{"daily_skip":1,"l2_skip":2,"l1_skip":2,"top_skip":3}', 0, 0, 19, 'active', '自动考核：网格巡查按等级要求，缺1次按等级扣分（总网格长3/次、一级2/次、二级2/次、三级1/次）'),
  ('HSE-KPI-GRD-002', '巡查问题未上报', 'GRID', 'all', 0, 'auto',
   'grid_inspection_records', '发现问题未记录为隐患 每次扣2分',
   '{"deduction_per_unit":2,"max_deduct":20,"transmit":false}', 0, 0, 20, 'active', '自动考核：巡查发现问题但未形成隐患上报，每次扣2分'),
  ('HSE-KPI-GRD-003', '网格内三违未发现', 'GRID', 'manager', 0, 'auto',
   'violation_records', '本网格范围内违规 每次扣2分',
   '{"deduction_per_unit":2,"max_deduct":20,"transmit":false}', 0, 0, 21, 'active', '自动考核：经理网格内发生三违但巡查未提前发现，每次扣2分'),

  -- 目标职责
  ('HSE-KPI-RESP-002', '责任书缺签', 'RESPONSIBILITY', 'all', 0, 'auto',
   'safety_responsibility_forms', '应签未签份数×1',
   '{"deduction_per_unit":1,"max_deduct":10,"transmit":false}', 0, 0, 22, 'active', '自动考核：安全生产/目标责任书应签未签，每份扣1分'),
  ('HSE-KPI-RESP-003', '上级任务未完成', 'RESPONSIBILITY', 'all', 0, 'auto',
   'hse_tasks', '逾期未完成任务×3',
   '{"deduction_per_unit":3,"max_deduct":30,"transmit":false,"overdue_only":true}', 0, 0, 23, 'active', '自动考核：上级布置任务逾期未完成，每项扣3分'),
  ('HSE-KPI-RESP-004', '安全会议缺席', 'RESPONSIBILITY', 'manager', 0, 'auto',
   'meeting_records', '缺席次数×2',
   '{"deduction_per_unit":2,"max_deduct":20,"transmit":false}', 0, 0, 24, 'active', '自动考核：应参加安全会议缺席，每次扣2分')
ON CONFLICT (metric_code) DO UPDATE SET
  metric_name   = EXCLUDED.metric_name,
  category      = EXCLUDED.category,
  target_post   = EXCLUDED.target_post,
  metric_type   = EXCLUDED.metric_type,
  data_source   = EXCLUDED.data_source,
  calc_formula  = EXCLUDED.calc_formula,
  rule_config   = EXCLUDED.rule_config,
  remark        = EXCLUDED.remark,
  status        = EXCLUDED.status;

COMMIT;

-- ============================================================
-- 验证：
--   SELECT count(*) FROM hse_assessment_metric;
--   SELECT metric_code, metric_name, base_score, metric_type, data_source
--   FROM hse_assessment_metric WHERE metric_type='auto' ORDER BY sort_order;
-- ============================================================