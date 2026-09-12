-- 迁移：accidents 表添加 vehicle_id 列
-- 用途：关联 vehicles 表主键，支持交通事故关联车辆
-- 幂等：使用 IF NOT EXISTS，可重复执行
ALTER TABLE accidents ADD COLUMN IF NOT EXISTS vehicle_id BIGINT;
CREATE INDEX IF NOT EXISTS idx_accidents_vehicle_id ON accidents(vehicle_id) WHERE is_deleted = false AND vehicle_id IS NOT NULL;
-- 回退：-- ALTER TABLE accidents DROP COLUMN IF EXISTS vehicle_id;
