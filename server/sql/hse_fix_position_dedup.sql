-- ============================================================
-- 岗位字典重复名清理（position 表）
-- 日期：2026-08-27
-- 背景：position 表存在两批来源岗位：随机码批(1373-1380, POS_XXXXXXXX_XXXX, job_category=null)
--       与规范批(1381-1405, POS-XXX, 有 job_category)。4 组重复名：
--         1374 管理员(随机码,0人)      ↔ 1395 管理员 POS-ADMIN(49人)       保留1395
--         1376 保洁员(随机码,0人)      ↔ 1386 保洁员 POS-CLEANER(1176人)   保留1386
--         1378 挂桶员(随机码,0人)      ↔ 1396 挂桶员 POS-BARREL(0人)       保留1396
--         1385 垃圾收运车驾驶员 POS-DRIVER(0人) ↔ 1398 POS-DRIVER-COLLECT(36人) 保留1398
-- 处理：1) position_risk_mapping 引用迁移到正式岗位(避免悬空)
--       2) 软删 4 个冗余岗位(is_deleted=true)
-- 注：hse_employee_org 为只读冻结历史表(Sprint-C)，其旧岗位引用不迁移、不清理。
-- 回滚：将 4 个岗位 is_deleted 置回 false，并把 position_risk_mapping 迁移行还原。
-- ============================================================

BEGIN;

-- 1. 岗位风险映射迁移到正式岗位
UPDATE position_risk_mapping SET position_id = 1395, updated_at = NOW() WHERE position_id = 1374;  -- 管理员
UPDATE position_risk_mapping SET position_id = 1398, updated_at = NOW() WHERE position_id = 1385;  -- 垃圾收运车驾驶员

-- 2. 软删冗余岗位
UPDATE position SET is_deleted = true, updated_at = NOW() WHERE id IN (1374, 1376, 1378, 1385);

COMMIT;

-- 验证：
-- SELECT name, count(*) FROM position WHERE is_deleted=false GROUP BY name HAVING count(*) > 1;  -- 应为空
-- SELECT count(*) FROM position_risk_mapping m LEFT JOIN position p ON p.id=m.position_id WHERE m.position_id IS NOT NULL AND p.id IS NULL;  -- 应 0
