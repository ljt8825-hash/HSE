-- =====================================================================
-- 提示词-145 数据回填脚本【模板，仅参考，未执行】
-- ---------------------------------------------------------------------
-- 用途：使车辆保险模块（提示词-144）的统计卡片、时效筛选、类型筛选生效。
-- 现状：vehicles 表 48 行仅 plate / vin / status 有值；
--       commercial_end / compulsory_end / insurance_end 全 NULL；
--       vehicle_type 全 NULL。
-- 责任方：业务侧提供真实保单数据 → DBA 执行（或开发侧辅助脚本导入）。
-- 本文件为模板，使用真实数据替换 <...> 占位符后再由 DBA 执行。
-- 执行前务必先做全库备份：pg_dump safety_dashboard > backup_before_145.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) 回填车辆类型（V4 车辆类型下拉选项来源 = stats.vehicle_types）
--    按车牌（plate）逐车映射，模板示例：
-- ---------------------------------------------------------------------
UPDATE vehicles
SET vehicle_type = '<车辆类型，如：轿车/货车/客车/专项作业车>'
WHERE is_deleted = false
  AND plate = '<车牌号>'
  AND vehicle_type IS NULL;

-- 批量示例（按实际清单展开）：
-- UPDATE vehicles SET vehicle_type = '货车'  WHERE plate = '鲁Nxxxxx';
-- UPDATE vehicles SET vehicle_type = '轿车'  WHERE plate = '鲁Nyyyyy';

-- ---------------------------------------------------------------------
-- 2) 回填保险有效止期（V3 时效筛选 / V5 expiring 计数 / V7 Badge 来源）
--    后端口径：COALESCE(commercial_end, compulsory_end, insurance_end)
--    下列任一字段有值即可驱动统计与筛选；推荐优先填 insurance_end。
-- ---------------------------------------------------------------------
UPDATE vehicles
SET insurance_end = '<止期 YYYY-MM-DD>'
WHERE is_deleted = false
  AND plate = '<车牌号>'
  AND insurance_end IS NULL;

-- 若仅有商业险止期：
-- UPDATE vehicles SET commercial_end = '<商业险止期>' WHERE plate = '<车牌号>';
-- 若仅有交强险止期：
-- UPDATE vehicles SET compulsory_end = '<交强险止期>' WHERE plate = '<车牌号>';

-- ---------------------------------------------------------------------
-- 3)（可选）回填被精简移入详情 Drawer 的字段，提升数据完整度
-- ---------------------------------------------------------------------
UPDATE vehicles
SET
  registered_owner   = COALESCE(registered_owner,   '<行驶证车主>'),
  engine_no          = COALESCE(engine_no,          '<发动机号>'),
  reg_date           = COALESCE(reg_date,           '<初次登记日期>'),
  compulsory_start   = COALESCE(compulsory_start,   '<交强险起期>'),
  commercial_start   = COALESCE(commercial_start,   '<商业险起期>'),
  vehicle_damage_amount  = COALESCE(vehicle_damage_amount,  <车损险保额>),
  vehicle_damage_premium = COALESCE(vehicle_damage_premium, <车损险保费>),
  third_party_amount     = COALESCE(third_party_amount,     '<三者险保额>'),
  third_party_premium    = COALESCE(third_party_premium,    <三者险保费>),
  passenger_amount       = COALESCE(passenger_amount,       '<司乘险保额>')
WHERE is_deleted = false
  AND plate = '<车牌号>';

-- ---------------------------------------------------------------------
-- 4) 回填后校验（确认统计非空）
-- ---------------------------------------------------------------------
-- SELECT
--   COUNT(*) FILTER (WHERE COALESCE(commercial_end, compulsory_end, insurance_end) >= CURRENT_DATE)        AS active,
--   COUNT(*) FILTER (WHERE COALESCE(commercial_end, compulsory_end, insurance_end) <  CURRENT_DATE)        AS expired,
--   COUNT(*) FILTER (WHERE COALESCE(commercial_end, compulsory_end, insurance_end) >= CURRENT_DATE
--                      AND COALESCE(commercial_end, compulsory_end, insurance_end) <= CURRENT_DATE + INTERVAL '30 days') AS expiring,
--   COUNT(DISTINCT vehicle_type) FILTER (WHERE vehicle_type IS NOT NULL AND vehicle_type <> '')            AS type_count
-- FROM vehicles WHERE is_deleted = false;
