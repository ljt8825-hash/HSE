-- ============================================================================
-- 迁移：车辆主数据收敛
-- 文件：vehicle_master_convergence.sql
-- 目标：vehicles.id 为唯一车辆主键；plate(车牌) 为业务唯一键；
--       主入口为 /api/insurance/vehicle；/api/vehicles 标记为遗留。
--
-- ⚠️ 重要声明：
--   - 本文件【仅创建，未执行】。执行需人工确认并在执行前备份数据库。
--   - 本文件不做历史保单拆分（系统扫描04明确：不宜在本轮贸然重写）。
--   - insurance_history 表保留给遗留接口使用，主入口不依赖它。
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 阶段一：车牌部分唯一索引（防并发重复车牌）
-- 条件：is_deleted = false（已删除车牌不参与唯一性，支持车牌过户后重新启用）
-- ────────────────────────────────────────────────────────────────────────────

-- 【预发验证】创建唯一索引前先检查重复车牌
SELECT plate, COUNT(*) AS duplicate_count, array_agg(id ORDER BY id) AS duplicate_ids
  FROM vehicles
 WHERE is_deleted = false
 GROUP BY plate
HAVING COUNT(*) > 1;

-- 创建车牌部分唯一索引（幂等）
CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicles_plate_active
  ON vehicles (plate)
  WHERE is_deleted = false;

-- ────────────────────────────────────────────────────────────────────────────
-- 阶段二：车辆状态字段规范化（可选，按需执行）
-- 确保status字段值在允许范围内
-- ────────────────────────────────────────────────────────────────────────────

-- 检查异常状态值
SELECT DISTINCT status, COUNT(*) AS cnt
  FROM vehicles
 WHERE is_deleted = false
 GROUP BY status;

-- ────────────────────────────────────────────────────────────────────────────
-- 阶段三：VIN索引（支持按VIN查询，可选）
-- ────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_vehicles_vin
  ON vehicles (vin)
  WHERE is_deleted = false AND vin IS NOT NULL AND vin != '';

-- ────────────────────────────────────────────────────────────────────────────
-- 回退
-- ────────────────────────────────────────────────────────────────────────────
-- DROP INDEX IF EXISTS idx_vehicles_plate_active;
-- DROP INDEX IF EXISTS idx_vehicles_vin;
