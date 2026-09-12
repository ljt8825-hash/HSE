-- =====================================================================
-- P2-B0-CONT §三 grid_record_sync_map 最小扩展
-- 仅安全性地新增 business_fingerprint（重复候选键，非唯一）。
-- 约束：
--   1. 不修改 UNIQUE(wps_record_id, wps_file_id)
--   2. 不把 business_fingerprint 纳入 WPS 18 列 hash
--   3. 索引不设计成 UNIQUE（同指纹合法重复，只能作为重复候选）
-- 目标库：safety_dashboard_dev（runner 已硬拒生产）
-- =====================================================================

ALTER TABLE grid_record_sync_map
  ADD COLUMN IF NOT EXISTS business_fingerprint text NULL;

COMMENT ON COLUMN grid_record_sync_map.business_fingerprint IS
  '业务指纹（重复候选键）。同一指纹可存在多条合法记录，仅用于「重复候选 / duplicate candidate」判断，绝不用于自动拒绝/删除/覆盖。';

-- 非 UNIQUE 索引：仅加速按指纹查询候选
CREATE INDEX IF NOT EXISTS
  idx_grid_record_sync_map_business_fingerprint
  ON grid_record_sync_map (business_fingerprint);
