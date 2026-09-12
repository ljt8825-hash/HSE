-- ============================================================
-- 提示词-70：hse_core_v1 迁移漂移补全（幂等）
-- 日期：2026-07-30 ｜ 性质：预防性补列（P2）
-- 范围：仅 hse_core_v1_migration.sql 定义的 7 张表
-- 原则：ADD COLUMN IF NOT EXISTS，不删旧列，不建 FK，不改代码
-- 前置：提示词-69 已补 hse_events.vehicle_id + hse_event_timeline 四列
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. hse_event_links：补 created_by（声明 L60，实际缺失）
-- ------------------------------------------------------------
ALTER TABLE hse_event_links ADD COLUMN IF NOT EXISTS created_by BIGINT;

-- ------------------------------------------------------------
-- 2. hse_risk_factors：补 possibility / severity_level / exposure
--    （声明 L100-102，实际缺失）
-- ------------------------------------------------------------
ALTER TABLE hse_risk_factors ADD COLUMN IF NOT EXISTS possibility    VARCHAR(16);
ALTER TABLE hse_risk_factors ADD COLUMN IF NOT EXISTS severity_level VARCHAR(16);
ALTER TABLE hse_risk_factors ADD COLUMN IF NOT EXISTS exposure       VARCHAR(16);

-- ------------------------------------------------------------
-- 3. hse_rectifications：补 event_id / plan_type
--    （声明 L153 / L155，实际缺失）
-- ------------------------------------------------------------
ALTER TABLE hse_rectifications ADD COLUMN IF NOT EXISTS event_id BIGINT;
ALTER TABLE hse_rectifications ADD COLUMN IF NOT EXISTS plan_type VARCHAR(32);

-- ------------------------------------------------------------
-- 4. hse_reviews：补 hazard_id（声明 L183，实际缺失）
-- ------------------------------------------------------------
ALTER TABLE hse_reviews ADD COLUMN IF NOT EXISTS hazard_id BIGINT;

COMMIT;

-- ============================================================
-- 注：以下列由提示词-69 已补（此处保留注释，便于溯源，不重复执行）
--   hse_events.vehicle_id           (BIGINT)
--   hse_event_timeline.from_status  (VARCHAR(32))
--   hse_event_timeline.to_status    (VARCHAR(32))
--   hse_event_timeline.comment      (TEXT)
--   hse_event_timeline.occurred_at  (TIMESTAMPTZ)
-- ============================================================
