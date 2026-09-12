-- 提示词-69 修复：补齐 hse_events.vehicle_id 与 hse_event_timeline.from_status/to_status
-- 根因：hse_core_v1_migration.sql 声明的列未落到本库（迁移漂移），代码引用报 500
--   - GET /api/hse/events 列表/详情 SELECT 含 vehicle_id / from_status / to_status
--   - 事故同步 INSERT/UPDATE hse_events 含 vehicle_id
-- 策略：按迁移意图补列（不改动任何代码），与 提示词-66/68 同思路
-- 幂等：全部 IF NOT EXISTS，可安全重跑自愈合

BEGIN;

-- 1) hse_events.vehicle_id（事故同步关联车辆）；vehicle 表不存在，故不建 FK
ALTER TABLE hse_events ADD COLUMN IF NOT EXISTS vehicle_id BIGINT;

-- 2) hse_event_timeline 各类漂移列（代码与 hse_core_v1_migration.sql 期望，DB 现用旧名）
--    DB 现有 status_from/status_to/description/timestamp（测试脚手架所用），需补齐迁移意图列
ALTER TABLE hse_event_timeline ADD COLUMN IF NOT EXISTS from_status  VARCHAR(32);
ALTER TABLE hse_event_timeline ADD COLUMN IF NOT EXISTS to_status    VARCHAR(32);
ALTER TABLE hse_event_timeline ADD COLUMN IF NOT EXISTS comment     TEXT;
ALTER TABLE hse_event_timeline ADD COLUMN IF NOT EXISTS occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

COMMIT;
